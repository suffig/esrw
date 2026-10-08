#!/usr/bin/env python3
"""
Schickt Push-Nachrichten an alle Mitglieder, die in der App Push
eingeschaltet haben:

  * neue, geaenderte und abgesetzte Einteilungen (aus aenderungen.json,
    das esrw_ical.py im selben Lauf schreibt)
  * eine Erinnerung je Spiel (Uhrzeit, Treffpunkt, Halle, Abfahrt wenn die
    Strecke im Profil bekannt ist). Wann sie kommt, stellt jeder selbst ein:
    am Spieltag ab 07:00 Uhr, eine Zahl Stunden vor dem Treffpunkt oder am
    Abend davor (Einstellungen -> Push)
  * kurz vor der Abfahrt "In ~30 Minuten losfahren" - nur, wenn die Person
    ihre Heimatadresse hinterlegt und die Strecke berechnet hat

Damit der halbstuendliche Lauf nichts doppelt schickt, merkt sich die
Tabelle push_gesendet, was schon raus ist.

Die Push-Abos und Profile kommen aus Supabase - mit dem
service_role-Schluessel, weil die Zugriffsregeln sonst nur die eigenen
Zeilen zeigen. Deshalb gehoert dieser Schluessel ausschliesslich in ein
GitHub-Secret.

Umgebung:
    SUPABASE_URL          Project URL
    SUPABASE_SERVICE_KEY  service_role-Schluessel (nie im Browser!)
    VAPID_PRIVATE         privater VAPID-Schluessel aus push_schluessel.py
    VAPID_KONTAKT         mailto:-Adresse des Betreibers (Pflicht laut Spezifikation)

Fehlt etwas davon, tut das Skript nichts und meldet das - der Workflow
laeuft weiter.

    pip install pywebpush
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, time, timedelta, timezone

import tresor

try:
    from zoneinfo import ZoneInfo
    BERLIN = ZoneInfo("Europe/Berlin")
except Exception:  # pragma: no cover - sehr alte Python-Version
    # Fester Sommerzeit-Versatz: im Winter liegen damit alle Erinnerungen
    # eine Stunde falsch. In der CI (Linux) kommt das nicht vor, auf einem
    # Rechner ohne tzdata schon - deshalb laut sagen, nicht stillschweigen.
    BERLIN = timezone(timedelta(hours=2))
    print("Push: zoneinfo fehlt (unter Windows hilft 'pip install tzdata'). "
          "Fester Versatz +02:00 - im Winter eine Stunde daneben.", file=sys.stderr)

BASIS = os.path.dirname(os.path.abspath(__file__))
ERINNERUNG_AB_STUNDE = 7      # Spieltag-Erinnerung fruehestens um 07:00
ABFAHRT_FENSTER_MIN = 45      # "losfahren" wenn die Abfahrt in <= 45 Minuten liegt


def api(url, schluessel, pfad, methode="GET", daten=None, prefer="return=minimal"):
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/" + pfad, method=methode,
        data=json.dumps(daten).encode("utf-8") if daten is not None else None,
        headers={"apikey": schluessel, "Authorization": "Bearer " + schluessel,
                 "Content-Type": "application/json", "Prefer": prefer})
    with urllib.request.urlopen(req, timeout=30) as r:
        roh = r.read().decode("utf-8")
        return json.loads(roh) if roh else None


def lade_json(name, standard):
    """Liest eine Datei - verschluesselt (.bin) oder im Klartext. Den
    Schluessel liefert die Umgebung (DATEN_SCHLUESSEL), siehe tresor.py."""
    pfad = os.path.join(BASIS, name)
    try:
        wert = tresor.json_lesen(pfad, tresor.schluessel(), None)
    except FileNotFoundError:
        wert = None
    except Exception as e:
        # Ein falscher Schluessel oder eine angefasste Datei sahen bisher aus
        # wie "nichts zu melden": der Lauf endete mit 0 und alle Pushes der
        # Stunde waren weg, denn aenderungen.json wird neu gebaut. Lieber
        # laut daneben.
        raise SystemExit("Push: %s nicht lesbar (%s). DATEN_SCHLUESSEL pruefen."
                         % (name, str(e)[:120]))
    return standard if wert is None else wert


def uhr(iso):
    return datetime.fromisoformat(iso).astimezone(BERLIN).strftime("%H:%M")


def aenderungs_nachricht(slug, a, mit_gespann=True):
    details = (a.get("details") or {}).get("geaendert") or []
    geaendert = []
    if details and len(details) == len(a.get("geaendert", [])):
        for d in details:
            felder = d.get("felder") or []
            if felder:
                was = ", ".join("%s %s → %s" % (f.get("feld", ""), f.get("vorher", ""), f.get("nachher", "")) for f in felder)
            else:
                was = d.get("was", "")
            geaendert.append("Geändert: %s\n   %s%s" % (d.get("text", ""), ("Betreiber: " if d.get("korrektur") else ""), was))
    else:
        geaendert = ["Geändert: " + z for z in a.get("geaendert", [])]
    # Wechselt im Gespann jemand, stand das bisher nur im Protokoll der App.
    # Es ist aber das eigene Spiel - und wer mit wem pfeift, will man wissen.
    gespann = []
    if mit_gespann:
        for d in (a.get("details") or {}).get("gespann") or []:
            was = d.get("was") or ""
            gespann.append("Gespann: %s%s" % (d.get("text", ""), ("\n   " + was) if was else ""))

    zeilen = (["Neu: " + z for z in a.get("neu", [])]
              + geaendert
              + ["Abgesetzt: " + z for z in a.get("entfallen", [])]
              + gespann)
    if not zeilen:
        return None
    titel = "Einteilung: %s" % ", ".join(
        t for t, n in (("%d neu" % len(a.get("neu", [])), a.get("neu")),
                       ("%d geändert" % len(a.get("geaendert", [])), a.get("geaendert")),
                       ("%d abgesetzt" % len(a.get("entfallen", [])), a.get("entfallen")),
                       ("%d im Gespann" % len(gespann), gespann)) if n)
    return {"titel": titel, "text": "\n".join(zeilen)[:900], "url": "./#" + slug}


WETTER_CODES = {0: "klar", 1: "meist klar", 2: "wolkig", 3: "bedeckt", 45: "Nebel", 48: "Nebel (Reif)",
                51: "Nieselregen", 53: "Nieselregen", 55: "Nieselregen", 56: "gefrierender Niesel", 57: "gefrierender Niesel",
                61: "Regen", 63: "Regen", 65: "starker Regen", 66: "gefrierender Regen", 67: "gefrierender Regen",
                71: "Schnee", 73: "Schnee", 75: "starker Schnee", 77: "Schneegriesel", 80: "Schauer", 81: "Schauer",
                82: "starke Schauer", 85: "Schneeschauer", 86: "Schneeschauer", 95: "Gewitter", 96: "Gewitter", 99: "Gewitter"}
_wetter_cache = {}


def wetter(koordinaten, zeitpunkt):
    """Wetter an der Halle zur gegebenen Stunde (Open-Meteo, ohne Schluessel).
    Liefert einen kurzen Text oder None; Fehler sind kein Grund abzubrechen."""
    if not koordinaten:
        return None
    key = (round(koordinaten[0], 2), round(koordinaten[1], 2))
    try:
        if key not in _wetter_cache:
            url = ("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
                   "&hourly=temperature_2m,precipitation,snowfall,weather_code&timezone=Europe%%2FBerlin&forecast_days=2"
                   % key)
            with urllib.request.urlopen(url, timeout=15) as r:
                _wetter_cache[key] = json.loads(r.read().decode("utf-8")).get("hourly") or {}
        h = _wetter_cache[key]
        stunde = zeitpunkt.astimezone(BERLIN).strftime("%Y-%m-%dT%H:00")
        if stunde not in h.get("time", []):
            return None
        i = h["time"].index(stunde)
        temp, regen, schnee, code = h["temperature_2m"][i], h["precipitation"][i], h["snowfall"][i], h["weather_code"][i]
        text = "%d °C, %s" % (round(temp), WETTER_CODES.get(code, "wechselhaft"))
        if schnee and schnee > 0:
            text += " – Schnee, mehr Zeit einplanen"
        elif temp <= 2 and (regen or 0) > 0:
            text += " – Glättegefahr"
        elif code in (56, 57, 66, 67):
            text += " – gefrierender Regen, Glättegefahr"
        return text
    except Exception:
        return None


WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]


def vorlauf_zeit(profil, treff):
    """Wann die Spieltag-Erinnerung frueestens raus darf. Jeder stellt das
    selbst ein (Einstellungen -> Push): zur festen Stunde am Spieltag, eine
    Zahl Stunden vor dem Treffpunkt, oder am Abend davor."""
    wahl = str(((profil or {}).get("einstellungen") or {}).get("pushvorlauf") or "").strip()
    if wahl == "abend":
        davor = treff.date() - timedelta(days=1)
        return datetime.combine(davor, time(18, 0), tzinfo=BERLIN)
    if wahl.isdigit() and 0 < int(wahl) <= 48:
        return treff - timedelta(hours=int(wahl))
    return datetime.combine(treff.date(), time(ERINNERUNG_AB_STUNDE, 0), tzinfo=BERLIN)


def verkehr_puffer(profil):
    """Derselbe Aufschlag, den die App auf die Fahrzeit rechnet - der
    Routendienst kennt keinen Stau (Einstellungen -> Puffer fuer Verkehr)."""
    try:
        p = int(((profil or {}).get("einstellungen") or {}).get("verkehr") or 0)
    except (TypeError, ValueError):
        return 0
    return p if 0 <= p <= 60 else 0


def erinnerungen(person, profil, jetzt, schon):
    """Spieltag- und Abfahrt-Erinnerungen fuer eine Person. Liefert
    (schluessel, nutzlast)-Paare, die noch nicht verschickt wurden."""
    heraus = []
    strecken = (profil or {}).get("strecken") or {}
    puffer = verkehr_puffer(profil)
    for s in person.get("spiele", []):
        try:
            beginn = datetime.fromisoformat(s["beginn"]).astimezone(BERLIN)
            treff = datetime.fromisoformat(s["treffpunkt"]).astimezone(BERLIN)
        except (KeyError, ValueError):
            continue
        if beginn < jetzt:
            continue
        ab_wann = vorlauf_zeit(profil, treff)
        # Mehr als der Vorlauf im Voraus interessiert niemanden - und die
        # Abfahrt-Erinnerung betrifft ohnehin nur den Spieltag selbst
        if beginn.date() != jetzt.date() and jetzt < ab_wann:
            continue
        kennung = s["beginn"] + "|" + s["paarung"]
        strecke = strecken.get(s.get("halle") or "") or {}
        minuten = strecke.get("minuten")
        if minuten and puffer:
            minuten = round(minuten * (1 + puffer / 100.0))
        abfahrt = treff - timedelta(minutes=minuten) if minuten else None

        k = "spieltag|" + kennung
        if jetzt >= ab_wann and k not in schon:
            text = "%s Uhr %s%s\nTreffpunkt %s Uhr · %s" % (
                beginn.strftime("%H:%M"), (s.get("liga") + ": ") if s.get("liga") else "",
                s.get("paarung", ""), treff.strftime("%H:%M"), s.get("halle") or "Halle unbekannt")
            if abfahrt:
                text += "\nAbfahrt ca. %s Uhr (%s km, %s)" % (
                    abfahrt.strftime("%H:%M"), strecke.get("km", "?"),
                    ("inkl. %d %% Puffer" % puffer) if puffer else "ohne Verkehr")
            w = wetter(s.get("koordinaten"), abfahrt or treff)
            if w:
                text += "\nWetter: " + w
            wann = "Heute" if beginn.date() == jetzt.date() else "Morgen" if beginn.date() == jetzt.date() + timedelta(days=1) else beginn.strftime("%d.%m.")
            heraus.append((k, {"titel": "%s: %s als %s" % (wann, s.get("paarung", "Spiel"), s.get("rolle", "SR")),
                               "text": text[:900], "url": "./#" + person["slug"],
                               "ort": s.get("ort") or None, "tag": "spieltag"}))

        k = "abfahrt|" + kennung
        if abfahrt and beginn.date() == jetzt.date() and k not in schon:
            rest = (abfahrt - jetzt).total_seconds() / 60
            if 0 < rest <= ABFAHRT_FENSTER_MIN:
                heraus.append((k, {"titel": "In ~%d Min. losfahren" % round(rest),
                                   "text": "%s, Treffpunkt %s Uhr. %s km bis %s." % (
                                       s.get("paarung", ""), treff.strftime("%H:%M"),
                                       strecke.get("km", "?"), s.get("halle") or "zur Halle"),
                                   "url": "./#" + person["slug"], "ort": s.get("ort") or None, "tag": "abfahrt"}))
    return heraus


def gesuche_pflegen(url, service, daten, jetzt, nachrichten, nachtragen):
    """Offene Gesuche schliessen, sobald esrw.de den Suchenden nicht mehr im
    Spiel fuehrt; Helfer erledigter Gesuche benachrichtigen."""
    spiele_von = {s["beginn"] + "|" + s["paarung"]: s for s in daten.get("spiele", [])}
    offen = api(url, service, "gesuche?select=id,slug,kennung&status=in.(offen,vereinbart)") or []
    for g in offen:
        s = spiele_von.get(g["kennung"])
        if not s or not s.get("besetzung"):
            continue
        if all(b.get("slug") != g["slug"] for b in s["besetzung"]):
            api(url, service, "gesuche?id=eq." + urllib.parse.quote(g["id"]), "PATCH",
                {"status": "erledigt", "erledigt_am": jetzt.astimezone(timezone.utc).isoformat()})
    # Angebot angenommen: der Helfer bekommt Bescheid
    vereinbart = api(url, service, "gesuche?select=id,name,paarung,beginn,vereinbart_mit&status=eq.vereinbart&vereinbart_gemeldet=eq.false") or []
    for g in vereinbart:
        if g.get("vereinbart_mit"):
            nachrichten.setdefault(g["vereinbart_mit"], []).append((None, {
                "titel": "Tausch vereinbart",
                "text": "%s nimmt dein Angebot für %s (%s Uhr) an. Der Obmann wird informiert – warte auf die Umteilung auf esrw.de." % (
                    g.get("name", "?"), g.get("paarung", ""), uhr(g["beginn"]) if g.get("beginn") else "?"),
                "url": "./#mitglieder/tausch"}))
        nachtragen.append(("gesuche?id=eq." + urllib.parse.quote(g["id"]), {"vereinbart_gemeldet": True}))
    zu_melden = api(url, service, "gesuche?select=id,name,paarung,beginn&status=eq.erledigt&gemeldet=eq.false") or []
    for g in zu_melden:
        helfer = api(url, service, "angebote?select=user_id&gesuch_id=eq." + urllib.parse.quote(g["id"])) or []
        for a in helfer:
            nachrichten.setdefault(a["user_id"], []).append((None, {
                "titel": "Gesuch erledigt",
                "text": "%s hat für %s (%s Uhr) Ersatz gefunden – danke fürs Anbieten." % (
                    g.get("name", "?"), g.get("paarung", ""), uhr(g["beginn"]) if g.get("beginn") else "?"),
                "url": "./#mitglieder/tausch"}))
        nachtragen.append(("gesuche?id=eq." + urllib.parse.quote(g["id"]), {"gemeldet": True}))


def main():
    url = os.environ.get("SUPABASE_URL", "").strip()
    service = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    vapid = os.environ.get("VAPID_PRIVATE", "").strip()
    # Apple lehnt einen VAPID-Absender ab, den es nicht erreichen kann. Mit
    # einem Platzhalter schlugen alle Pushes fehl, waehrend der Lauf gruen
    # blieb - deshalb hier Schluss, wenn die Adresse fehlt.
    kontakt = os.environ.get("VAPID_KONTAKT", "").strip()
    if not (url and service and vapid):
        print("Push: SUPABASE_URL, SUPABASE_SERVICE_KEY oder VAPID_PRIVATE fehlt - nichts zu tun.")
        return 0
    if not kontakt:
        print("Push: VAPID_KONTAKT fehlt (mailto:... oder https://...) - ohne "
              "erreichbaren Absender lehnen Apple und andere die Pushes ab.", file=sys.stderr)
        return 0

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        print("Push: pywebpush fehlt (pip install pywebpush).")
        return 0

    aenderungen = lade_json("aenderungen.json", {}).get("personen", {})
    daten = lade_json(os.path.join("docs", "daten.json"), {})
    personen = {p["slug"]: p for p in daten.get("personen", [])}
    jetzt = datetime.now(BERLIN)

    # Alle Profile mit Push-Abo - ohne Abo gibt es nichts zu schicken
    abos = api(url, service, "push_abos?select=id,user_id,endpoint,p256dh,auth") or []
    if not abos:
        print("Push: niemand hat Push an.")
        return 0
    ids = sorted({a["user_id"] for a in abos})
    profile = api(url, service, "profile?select=id,slug,strecken,einstellungen&id=in.(%s)" % ",".join(ids)) or []
    profil_von = {p["id"]: p for p in profile}

    # Abgeschaltete Funktionen (Admin -> Funktionen) bekommen keinen Push
    funktionen = {}
    try:
        for z in api(url, service, "funktionen?select=schluessel,aktiv") or []:
            funktionen[z["schluessel"]] = bool(z["aktiv"])
    except Exception:
        pass
    def an(schluessel, standard=True):
        return funktionen.get(schluessel, standard)

    # Was heute schon rausging (Erinnerungen), damit nichts doppelt kommt
    seit = (jetzt - timedelta(days=2)).astimezone(timezone.utc).isoformat()
    gesendet = api(url, service, "push_gesendet?select=user_id,schluessel&gesendet=gte." + urllib.parse.quote(seit)) or []
    schon = {}
    for g in gesendet:
        schon.setdefault(g["user_id"], set()).add(g["schluessel"])

    # Nachrichten je Nutzer einsammeln
    nachrichten = {}   # user_id -> [(schluessel oder None, nutzlast)]
    # "Erledigt"-Haken erst setzen, wenn verschickt wurde. Standen sie vor
    # dem Senden, war eine Benachrichtigung bei jedem Abbruch dazwischen
    # endgueltig weg: die Zeile gilt als gemeldet, gesehen hat sie niemand.
    nachtragen = []    # [(pfad, nutzlast)] - nach der Sendeschleife
    for uid, profil in profil_von.items():
        slug = profil.get("slug")
        if not slug:
            continue
        liste = []
        mit_gespann = str(((profil or {}).get("einstellungen") or {}).get("pushgespann") or "") != "0"
        n = aenderungs_nachricht(slug, aenderungen.get(slug) or {}, mit_gespann)
        if n:
            liste.append((None, n))
        if slug in personen:
            liste.extend(erinnerungen(personen[slug], profil, jetzt, schon.get(uid, set())))
        if liste:
            nachrichten[uid] = liste
    # Sonntags ab 18 Uhr: Vorschau auf die Woche (abschaltbar in den Einstellungen)
    if jetzt.weekday() == 6 and jetzt.hour >= 18:
        k = "woche|" + jetzt.date().isoformat()
        for uid, profil in profil_von.items():
            slug = profil.get("slug")
            if not slug or slug not in personen or k in schon.get(uid, set()):
                continue
            if ((profil.get("einstellungen") or {}).get("pushwoche")) == "0":
                continue
            bis = jetzt + timedelta(days=7)
            zeilen = []
            for s in personen[slug].get("spiele", []):
                try:
                    b = datetime.fromisoformat(s["beginn"]).astimezone(BERLIN)
                except (KeyError, ValueError):
                    continue
                if jetzt < b <= bis:
                    zeilen.append("%s %s %s%s · %s" % (WOCHENTAGE[b.weekday()], b.strftime("%H:%M"),
                                  (s.get("liga") + " ") if s.get("liga") else "", s.get("paarung", ""), s.get("halle") or "?"))
            if not zeilen:
                continue
            nachrichten.setdefault(uid, []).append((k, {
                "titel": "Deine Woche: %d %s" % (len(zeilen), "Spiel" if len(zeilen) == 1 else "Spiele"),
                "text": "\n".join(zeilen)[:900], "url": "./#plan", "tag": "woche"}))

    # Anfang Januar: Jahresblatt fuers Finanzamt erinnern (einmal je Jahr)
    if an("abrechnung") and jetzt.month == 1 and 2 <= jetzt.day <= 14 and jetzt.hour >= 17:
        jahr = jetzt.year - 1
        k = "steuer|%d" % jahr
        try:
            laenger = (jetzt - timedelta(days=40)).astimezone(timezone.utc).isoformat()
            schon_jahr = {g["user_id"] for g in (api(url, service, "push_gesendet?select=user_id,schluessel&schluessel=eq." + urllib.parse.quote(k) + "&gesendet=gte." + urllib.parse.quote(laenger)) or [])}
            mit_eintraegen = api(url, service, "einsaetze?select=user_id&beginn=gte.%d-01-01&beginn=lt.%d-01-01&user_id=in.(%s)" % (jahr, jahr + 1, ",".join(ids))) or []
            for uid in sorted({e["user_id"] for e in mit_eintraegen}):
                if uid in schon_jahr:
                    continue
                nachrichten.setdefault(uid, []).append((k, {
                    "titel": "Steuerjahr %d: Jahresblatt bereit" % jahr,
                    "text": "In der Abrechnung unter „Steuerjahre“: Jahresblatt drucken oder CSV – mit Vergütung, Fahrtkosten, Verpflegung und Auslagen.",
                    "url": "./#mitglieder/abrechnung", "tag": "steuer"}))
        except Exception as e:
            print("Push: Steuer-Erinnerung nicht verarbeitet: %s" % str(e)[:120], file=sys.stderr)

    # Ankuendigungen vom Admin, die als Push markiert sind - an alle
    ank = []
    try:
        ank = api(url, service, "ankuendigungen?select=id,titel,text,an_slugs&push=eq.true&push_gesendet=is.null") or []
    except Exception as e:
        print("Push: Ankuendigungen nicht lesbar: %s" % str(e)[:120], file=sys.stderr)
    for a in ank:
        # Nicht "an" nennen: so hiess die Funktion, die weiter unten fragt,
        # ob eine Funktion eingeschaltet ist. Eine wartende Ankuendigung hat
        # sie ueberschrieben, und ab da stand in an("gespann") ein TypeError.
        # Der Lauf starb vor dem Senden, die Ankuendigung blieb unmarkiert -
        # also jede Stunde aufs Neue, und keine einzige Nachricht ging raus.
        ziel_slugs = a.get("an_slugs") or None
        for uid in ids:
            if ziel_slugs and (profil_von.get(uid) or {}).get("slug") not in ziel_slugs:
                continue
            nachrichten.setdefault(uid, []).append((None, {
                "titel": ("Nachricht: " if ziel_slugs else "Ankündigung: ") + a["titel"], "text": (a.get("text") or "")[:900], "url": "./#mitglieder/info"}))

    # Termine vom Betreiber: am Vortag (ab 17 Uhr) an alle erinnern
    if jetzt.hour >= 17:
        morgen = (jetzt + timedelta(days=1)).date().isoformat()
        try:
            termine = api(url, service, "ankuendigungen?select=id,titel,text,an_slugs&termin=eq.%s&erinnert=is.null" % morgen) or []
        except Exception as e:
            termine = []
            print("Push: Termine nicht lesbar: %s" % str(e)[:120], file=sys.stderr)
        for t in termine:
            for uid in ids:
                nachrichten.setdefault(uid, []).append((None, {
                    "titel": "Morgen: " + t["titel"], "text": (t.get("text") or "")[:400], "url": "./#mitglieder/info"}))
            try:
                nachtragen.append(("ankuendigungen?id=eq." + urllib.parse.quote(t["id"]),
                                   {"erinnert": jetzt.astimezone(timezone.utc).isoformat()}))
            except Exception:
                pass

    # Gespann-Notizen: die anderen im Gespann bekommen Bescheid
    try:
        neu = api(url, service, "spielkommentare?select=id,name,slug,paarung,beginn,gespann,text&gemeldet=eq.false") if an("gespann") else []
        neu = neu or []
        if neu:
            slug_zu_uid = {}
            # Die Slugs stehen so im Kommentar, wie ihn ein Mitglied
            # geschrieben hat. Unkodiert haengt ein "&" einen Parameter an
            # die Abfrage mit dem Service-Schluessel, und ein Zeichen, das
            # urllib nicht mag, liess den ganzen Block auffliegen - dann
            # blieben die Gespann-Notizen fuer alle liegen.
            slugs = sorted({g for k in neu for g in (k.get("gespann") or [])
                            if isinstance(g, str) and re.fullmatch(r"[a-z0-9-]{1,80}", g)})
            for p in (api(url, service, "profile?select=id,slug&slug=in.(%s)" % ",".join(
                    '"%s"' % g for g in slugs)) if slugs else []) or []:
                slug_zu_uid[p["slug"]] = p["id"]
            for k in neu:
                for g in k.get("gespann") or []:
                    uid = slug_zu_uid.get(g)
                    if not uid or g == k.get("slug"):
                        continue
                    nachrichten.setdefault(uid, []).append((None, {
                        "titel": "%s zum Spiel %s" % (k.get("name", "?").split(",")[-1].strip(), uhr(k["beginn"]) + " Uhr" if k.get("beginn") else ""),
                        "text": (k.get("paarung", "") + ": " + (k.get("text") or ""))[:400],
                        "url": "./#spiel/" + urllib.parse.quote(k.get("kennung") or "", safe="")}))
                nachtragen.append(("spielkommentare?id=eq." + urllib.parse.quote(k["id"]), {"gemeldet": True}))
    except Exception as e:
        print("Push: Gespann-Notizen nicht verarbeitet: %s" % str(e)[:120], file=sys.stderr)

    # Test-Push an ein einzelnes Geraet
    try:
        tests = api(url, service, "push_test?select=id,user_id,abo_id") or []
        for t in tests:
            abo = api(url, service, "push_abos?select=id,user_id,endpoint,p256dh,auth&id=eq." + urllib.parse.quote(t["abo_id"]))
            if abo:
                a = abo[0]
                try:
                    webpush(subscription_info={"endpoint": a["endpoint"], "keys": {"p256dh": a["p256dh"], "auth": a["auth"]}},
                            data=json.dumps({"titel": "Einteilungen: Test vom Server", "text": "Dieses Gerät bekommt Push-Nachrichten. Alles gut.", "url": "./#mitglieder/konto"}, ensure_ascii=False),
                            vapid_private_key=vapid, vapid_claims={"sub": kontakt}, ttl=600,
                            timeout=15)
                except Exception as e:
                    print("Push-Test fehlgeschlagen: %s" % str(e)[:120], file=sys.stderr)
            api(url, service, "push_test?id=eq." + urllib.parse.quote(t["id"]), "DELETE")
    except Exception as e:
        print("Push: Tests nicht verarbeitet: %s" % str(e)[:120], file=sys.stderr)

    # Abends nach dem Spiel: "Spiel abrechnen?" - wenn noch keine Zeile da ist
    if an("abrechnung") and jetzt.hour >= 17:
        try:
            heute_kennungen = {}
            for uid, profil in profil_von.items():
                slug = profil.get("slug")
                if not slug or slug not in personen or ((profil.get("einstellungen") or {}).get("pushabrechnung")) == "0":
                    continue
                for s in personen[slug].get("spiele", []):
                    try:
                        beginn = datetime.fromisoformat(s["beginn"]).astimezone(BERLIN)
                    except (KeyError, ValueError):
                        continue
                    ende = beginn + timedelta(minutes=int(daten.get("spieldauer_minuten") or 150) + 30)
                    if beginn.date() != jetzt.date() or ende > jetzt:
                        continue
                    k = "abrechnen|" + (s.get("id") or (s["beginn"] + "|" + s.get("paarung", "")))
                    if k in schon.get(uid, set()):
                        continue
                    heute_kennungen.setdefault(uid, []).append((k, s))
            if heute_kennungen:
                kennungen = sorted({k[10:] for liste in heute_kennungen.values() for k, _ in liste})
                vorhanden = api(url, service, "einsaetze?select=user_id,kennung&kennung=in.(%s)&user_id=in.(%s)" % (
                    ",".join('"%s"' % urllib.parse.quote(k, safe="") for k in kennungen), ",".join(heute_kennungen.keys()))) or []
                schon_da = {(e["user_id"], e["kennung"]) for e in vorhanden}
                for uid, liste in heute_kennungen.items():
                    for k, s in liste:
                        if (uid, k[10:]) in schon_da:
                            continue
                        nachrichten.setdefault(uid, []).append((k, {
                            "titel": "Spiel abrechnen? %s" % s.get("paarung", ""),
                            "text": "km und Vergütung sind vorbelegt – nur noch Auslagen oder Beleg ergänzen.",
                            "url": "./#abrechnen/" + urllib.parse.quote(k[10:], safe=""), "tag": "abrechnen"}))
        except Exception as e:
            print("Push: Schnellabrechnung nicht verarbeitet: %s" % str(e)[:120], file=sys.stderr)

    # Mitfahrt gesucht/geboten: Kollegen im selben Spiel oder am selben Tag in
    # derselben Halle, die laut geteiltem Wohnort auf dem Weg liegen
    if an("gespann"):
        try:
            neue = api(url, service, "mitfahrten?select=id,user_id,slug,name,kennung,beginn,text,art&gemeldet=eq.false") or []
            if neue:
                wohnorte = {w["slug"]: w for w in (api(url, service, "wohnorte?select=slug,lat,lon,ort") or [])}
                heimat = {p["id"]: (p.get("heimat_lat"), p.get("heimat_lon")) for p in (api(url, service, "profile?select=id,heimat_lat,heimat_lon&heimat_lat=not.is.null") or [])}
                slug_uid = {p.get("slug"): uid for uid, p in profil_von.items() if p.get("slug")}
                spiele_alle = daten.get("spiele", [])
                hallen = daten.get("hallen", {})
                def km(a, b):
                    import math
                    p1, p2 = math.radians(a[0]), math.radians(b[0])
                    dp, dl = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
                    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
                    return 2 * 6371 * math.asin(math.sqrt(x))
                for m in neue:
                    spiel = next((s for s in spiele_alle if (s.get("id") or (s["beginn"] + "|" + s.get("paarung", ""))) == m["kennung"]), None)
                    nachtragen.append(("mitfahrten?id=eq." + urllib.parse.quote(m["id"]), {"gemeldet": True}))
                    if not spiel:
                        continue
                    try:
                        tag = datetime.fromisoformat(spiel["beginn"]).astimezone(BERLIN).date()
                    except ValueError:
                        continue
                    halle = hallen.get(spiel.get("halle") or "")
                    kandidaten = {}
                    for s in spiele_alle:
                        try:
                            if datetime.fromisoformat(s["beginn"]).astimezone(BERLIN).date() != tag or s.get("halle") != spiel.get("halle"):
                                continue
                        except ValueError:
                            continue
                        for b in s.get("besetzung", []):
                            if b.get("slug") and b["slug"] != m["slug"]:
                                kandidaten[b["slug"]] = (s is spiel)
                    poster = wohnorte.get(m["slug"]) or (heimat.get(m["user_id"]) and {"lat": heimat[m["user_id"]][0], "lon": heimat[m["user_id"]][1]})
                    for slug, im_gespann in kandidaten.items():
                        uid = slug_uid.get(slug)
                        if not uid:
                            continue
                        w = wohnorte.get(slug) or (heimat.get(uid) and {"lat": heimat[uid][0], "lon": heimat[uid][1]})
                        auf_dem_weg = None
                        if poster and w and halle:
                            a, b_, h_ = (poster["lat"], poster["lon"]), (w["lat"], w["lon"]), (halle[0], halle[1])
                            direkt_p, direkt_k = km(a, h_), km(b_, h_)
                            umweg_p = (km(a, b_) + km(b_, h_) - direkt_p) * 1.3
                            umweg_k = (km(b_, a) + km(a, h_) - direkt_k) * 1.3
                            if umweg_p <= max(8, direkt_p * 1.3 * 0.3) or umweg_k <= max(8, direkt_k * 1.3 * 0.3):
                                auf_dem_weg = round(min(umweg_p, umweg_k))
                        if auf_dem_weg is None and not im_gespann:
                            continue
                        wann = datetime.fromisoformat(spiel["beginn"]).astimezone(BERLIN)
                        vorname = (m.get("name") or "").split(",")[-1].strip() or "Ein Kollege"
                        nachrichten.setdefault(uid, []).append((None, {
                            "titel": "%s %s Mitfahrt · %s" % (vorname, "sucht" if m.get("art") == "suche" else "bietet", spiel.get("halle") or "Halle"),
                            "text": "%s %s Uhr, %s%s%s" % (WOCHENTAGE[wann.weekday()], wann.strftime("%H:%M"), spiel.get("paarung", ""),
                                                        (" – " + m["text"]) if m.get("text") else "",
                                                        (" · liegt auf deinem Weg (Umweg ca. %d km)" % auf_dem_weg) if auf_dem_weg is not None else " · im Gespann"),
                            "url": "./#mitfahren", "tag": "mitfahrt"}))
        except Exception as e:
            print("Push: Mitfahrten nicht verarbeitet: %s" % str(e)[:120], file=sys.stderr)

    # Tauschboerse: Gesuch von selbst erledigt, wenn esrw.de jemand anderen
    # im Spiel fuehrt; Helfer bekommen Bescheid
    try:
        if an("tausch", False):
            gesuche_pflegen(url, service, daten, jetzt, nachrichten, nachtragen)
    except Exception as e:
        print("Push: Tauschboerse nicht gepflegt: %s" % str(e)[:120], file=sys.stderr)

    def haken_setzen():
        for pfad, nutzlast in nachtragen:
            try:
                api(url, service, pfad, "PATCH", nutzlast)
            except Exception as e:
                print("Push: Haken nicht gesetzt (%s): %s" % (pfad[:48], str(e)[:90]),
                      file=sys.stderr)
        del nachtragen[:]

    if not nachrichten:
        # Auch ohne Empfaenger die Haken setzen - sonst meldet sich dieselbe
        # Notiz jede Stunde neu.
        haken_setzen()
        print("Push: nichts zu melden.")
        return 0

    gesendet_n, tot, fehler_n, neu_gemerkt = 0, 0, 0, []
    for abo in abos:
        for schluessel, nutzlast in nachrichten.get(abo["user_id"], []):
            try:
                webpush(
                    subscription_info={"endpoint": abo["endpoint"],
                                       "keys": {"p256dh": abo["p256dh"], "auth": abo["auth"]}},
                    data=json.dumps(nutzlast, ensure_ascii=False), vapid_private_key=vapid,
                    vapid_claims={"sub": kontakt}, ttl=3600 if schluessel else 86400,
                    # Ohne Zeitgrenze haengt ein stummer Push-Dienst den
                    # ganzen Lauf, und die naechsten Stunden stauen sich.
                    timeout=15)
                gesendet_n += 1
                if schluessel:
                    neu_gemerkt.append({"user_id": abo["user_id"], "schluessel": schluessel})
            except WebPushException as e:
                status = getattr(e.response, "status_code", None)
                if status in (404, 410):
                    # Abo ist tot (App deinstalliert, Berechtigung entzogen) - aufraeumen
                    try:
                        api(url, service, "push_abos?id=eq." + urllib.parse.quote(abo["id"]), "DELETE")
                    except Exception:
                        pass
                    tot += 1
                    break
                fehler_n += 1
                print("Push an %s fehlgeschlagen: %s" % (abo["user_id"][:8], e), file=sys.stderr)
            except Exception as e:
                # Netzfehler o.ae. - ein einzelnes Abo darf den Lauf nicht abbrechen
                fehler_n += 1
                print("Push an %s nicht moeglich: %s" % (abo["user_id"][:8], str(e)[:120]), file=sys.stderr)

    # Nur haken, wenn auch etwas rausging. Ging alles schief (VAPID, Netz,
    # ein Dienst lehnt ab), bleiben die Zeilen offen und der naechste Lauf
    # versucht es wieder - sonst waere die Nachricht endgueltig weg, obwohl
    # sie nie jemand gesehen hat. Ohne jeden Fehler haken wir auch, wenn
    # nichts gesendet wurde: dann hat der Empfaenger einfach kein Geraet.
    if gesendet_n or not fehler_n:
        haken_setzen()
    else:
        print("Push: %d Fehler und nichts gesendet - die Haken bleiben offen, "
              "der naechste Lauf versucht es erneut." % fehler_n, file=sys.stderr)

    # Nur vermerken, wenn wirklich etwas rausging - sonst gilt eine
    # Ankuendigung als verschickt, die kein Geraet erreicht hat.
    if ank and gesendet_n:
        try:
            api(url, service, "ankuendigungen?id=in.(%s)" % ",".join(a["id"] for a in ank), "PATCH",
                {"push_gesendet": jetzt.astimezone(timezone.utc).isoformat()})
        except Exception as e:
            print("Push: Ankuendigung nicht als gesendet markiert: %s" % str(e)[:120], file=sys.stderr)

    # Erinnerungen als verschickt merken; alte Eintraege wegraeumen
    if neu_gemerkt:
        # gleiche (user, schluessel) nur einmal, auch bei mehreren Geraeten
        einmal = {(m["user_id"], m["schluessel"]): m for m in neu_gemerkt}
        try:
            api(url, service, "push_gesendet?on_conflict=user_id,schluessel", "POST",
                list(einmal.values()), prefer="resolution=ignore-duplicates,return=minimal")
        except Exception as e:
            print("Push: Historie nicht gespeichert: %s" % str(e)[:120], file=sys.stderr)
    try:
        alt = (jetzt - timedelta(days=7)).astimezone(timezone.utc).isoformat()
        # Monats-Schluessel bleiben laenger, damit die Erinnerung nur einmal kommt
        api(url, service, "push_gesendet?gesendet=lt." + urllib.parse.quote(alt) + "&schluessel=not.like.steuer*", "DELETE")
    except Exception:
        pass
    # Eine Zeile je Lauf, damit der Betreiber in der App sieht, ob etwas
    # ankommt. Nur Zahlen, keine Namen. Aeltere Zeilen raeumt der Lauf weg.
    try:
        api(url, service, "push_lauf", "POST",
            {"geraete": len(abos), "gesendet": gesendet_n, "tot": tot, "fehler": fehler_n,
             "hinweis": None if gesendet_n or not nachrichten else "nichts zu senden"},
            prefer="return=minimal")
        weg = (jetzt - timedelta(days=30)).astimezone(timezone.utc).isoformat()
        api(url, service, "push_lauf?zeitpunkt=lt." + urllib.parse.quote(weg), "DELETE")
    except Exception as e:
        print("Push: Lauf nicht protokolliert: %s" % str(e)[:120], file=sys.stderr)
    print("Push: %d gesendet, %d tote Abos entfernt, %d Fehler." % (gesendet_n, tot, fehler_n))
    return 0


if __name__ == "__main__":
    sys.exit(main())
