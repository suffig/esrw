#!/usr/bin/env python3
"""
Schickt Push-Nachrichten an alle Mitglieder, die in der App Push
eingeschaltet haben:

  * neue, geaenderte und abgesetzte Einteilungen (aus aenderungen.json,
    das esrw_ical.py im selben Lauf schreibt)
  * am Spieltag ab 07:00 Uhr eine Erinnerung je Spiel (Uhrzeit, Treffpunkt,
    Halle, Abfahrt wenn die Strecke im Profil bekannt ist)
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
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    BERLIN = ZoneInfo("Europe/Berlin")
except Exception:  # pragma: no cover - sehr alte Python-Version
    BERLIN = timezone(timedelta(hours=2))

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
    pfad = os.path.join(BASIS, name)
    if not os.path.exists(pfad):
        return standard
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def uhr(iso):
    return datetime.fromisoformat(iso).astimezone(BERLIN).strftime("%H:%M")


def aenderungs_nachricht(slug, a):
    zeilen = (["Neu: " + z for z in a.get("neu", [])]
              + ["Geändert: " + z for z in a.get("geaendert", [])]
              + ["Abgesetzt: " + z for z in a.get("entfallen", [])])
    if not zeilen:
        return None
    titel = "Einteilung: %s" % ", ".join(
        t for t, n in (("%d neu" % len(a.get("neu", [])), a.get("neu")),
                       ("%d geändert" % len(a.get("geaendert", [])), a.get("geaendert")),
                       ("%d abgesetzt" % len(a.get("entfallen", [])), a.get("entfallen"))) if n)
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


def erinnerungen(person, profil, jetzt, schon):
    """Spieltag- und Abfahrt-Erinnerungen fuer eine Person. Liefert
    (schluessel, nutzlast)-Paare, die noch nicht verschickt wurden."""
    heraus = []
    strecken = (profil or {}).get("strecken") or {}
    heute = jetzt.date()
    for s in person.get("spiele", []):
        try:
            beginn = datetime.fromisoformat(s["beginn"]).astimezone(BERLIN)
            treff = datetime.fromisoformat(s["treffpunkt"]).astimezone(BERLIN)
        except (KeyError, ValueError):
            continue
        if beginn.date() != heute or beginn < jetzt:
            continue
        kennung = s["beginn"] + "|" + s["paarung"]
        strecke = strecken.get(s.get("halle") or "") or {}
        minuten = strecke.get("minuten")
        abfahrt = treff - timedelta(minutes=minuten) if minuten else None

        k = "spieltag|" + kennung
        if jetzt.hour >= ERINNERUNG_AB_STUNDE and k not in schon:
            text = "%s Uhr %s%s\nTreffpunkt %s Uhr · %s" % (
                beginn.strftime("%H:%M"), (s.get("liga") + ": ") if s.get("liga") else "",
                s.get("paarung", ""), treff.strftime("%H:%M"), s.get("halle") or "Halle unbekannt")
            if abfahrt:
                text += "\nAbfahrt ca. %s Uhr (%s km, ohne Verkehr)" % (
                    abfahrt.strftime("%H:%M"), strecke.get("km", "?"))
            w = wetter(s.get("koordinaten"), abfahrt or treff)
            if w:
                text += "\nWetter: " + w
            heraus.append((k, {"titel": "Heute: %s als %s" % (s.get("paarung", "Spiel"), s.get("rolle", "SR")),
                               "text": text[:900], "url": "./#" + person["slug"],
                               "ort": s.get("ort") or None, "tag": "spieltag"}))

        k = "abfahrt|" + kennung
        if abfahrt and k not in schon:
            rest = (abfahrt - jetzt).total_seconds() / 60
            if 0 < rest <= ABFAHRT_FENSTER_MIN:
                heraus.append((k, {"titel": "In ~%d Min. losfahren" % round(rest),
                                   "text": "%s, Treffpunkt %s Uhr. %s km bis %s." % (
                                       s.get("paarung", ""), treff.strftime("%H:%M"),
                                       strecke.get("km", "?"), s.get("halle") or "zur Halle"),
                                   "url": "./#" + person["slug"], "ort": s.get("ort") or None, "tag": "abfahrt"}))
    return heraus


def gesuche_pflegen(url, service, daten, jetzt, nachrichten):
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
        api(url, service, "gesuche?id=eq." + urllib.parse.quote(g["id"]), "PATCH", {"vereinbart_gemeldet": True})
    zu_melden = api(url, service, "gesuche?select=id,name,paarung,beginn&status=eq.erledigt&gemeldet=eq.false") or []
    for g in zu_melden:
        helfer = api(url, service, "angebote?select=user_id&gesuch_id=eq." + urllib.parse.quote(g["id"])) or []
        for a in helfer:
            nachrichten.setdefault(a["user_id"], []).append((None, {
                "titel": "Gesuch erledigt",
                "text": "%s hat für %s (%s Uhr) Ersatz gefunden – danke fürs Anbieten." % (
                    g.get("name", "?"), g.get("paarung", ""), uhr(g["beginn"]) if g.get("beginn") else "?"),
                "url": "./#mitglieder/tausch"}))
        api(url, service, "gesuche?id=eq." + urllib.parse.quote(g["id"]), "PATCH", {"gemeldet": True})


def main():
    url = os.environ.get("SUPABASE_URL", "").strip()
    service = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    vapid = os.environ.get("VAPID_PRIVATE", "").strip()
    kontakt = os.environ.get("VAPID_KONTAKT", "").strip() or "mailto:push@example.invalid"
    if not (url and service and vapid):
        print("Push: SUPABASE_URL, SUPABASE_SERVICE_KEY oder VAPID_PRIVATE fehlt - nichts zu tun.")
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
    profile = api(url, service, "profile?select=id,slug,strecken&id=in.(%s)" % ",".join(ids)) or []
    profil_von = {p["id"]: p for p in profile}

    # Was heute schon rausging (Erinnerungen), damit nichts doppelt kommt
    seit = (jetzt - timedelta(days=2)).astimezone(timezone.utc).isoformat()
    gesendet = api(url, service, "push_gesendet?select=user_id,schluessel&gesendet=gte." + urllib.parse.quote(seit)) or []
    schon = {}
    for g in gesendet:
        schon.setdefault(g["user_id"], set()).add(g["schluessel"])

    # Nachrichten je Nutzer einsammeln
    nachrichten = {}   # user_id -> [(schluessel oder None, nutzlast)]
    for uid, profil in profil_von.items():
        slug = profil.get("slug")
        if not slug:
            continue
        liste = []
        n = aenderungs_nachricht(slug, aenderungen.get(slug) or {})
        if n:
            liste.append((None, n))
        if slug in personen:
            liste.extend(erinnerungen(personen[slug], profil, jetzt, schon.get(uid, set())))
        if liste:
            nachrichten[uid] = liste
    # Ankuendigungen vom Admin, die als Push markiert sind - an alle
    ank = []
    try:
        ank = api(url, service, "ankuendigungen?select=id,titel,text&push=eq.true&push_gesendet=is.null") or []
    except Exception as e:
        print("Push: Ankuendigungen nicht lesbar: %s" % str(e)[:120], file=sys.stderr)
    for a in ank:
        for uid in ids:
            nachrichten.setdefault(uid, []).append((None, {
                "titel": "Ankündigung: " + a["titel"], "text": (a.get("text") or "")[:900], "url": "./#mitglieder/info"}))

    # Termine vom Betreiber: am Vortag (ab 17 Uhr) an alle erinnern
    if jetzt.hour >= 17:
        morgen = (jetzt + timedelta(days=1)).date().isoformat()
        try:
            termine = api(url, service, "ankuendigungen?select=id,titel,text&termin=eq.%s&erinnert=is.null" % morgen) or []
        except Exception as e:
            termine = []
            print("Push: Termine nicht lesbar: %s" % str(e)[:120], file=sys.stderr)
        for t in termine:
            for uid in ids:
                nachrichten.setdefault(uid, []).append((None, {
                    "titel": "Morgen: " + t["titel"], "text": (t.get("text") or "")[:400], "url": "./#mitglieder/info"}))
            try:
                api(url, service, "ankuendigungen?id=eq." + urllib.parse.quote(t["id"]), "PATCH",
                    {"erinnert": jetzt.astimezone(timezone.utc).isoformat()})
            except Exception:
                pass

    # Tauschboerse: Gesuch von selbst erledigt, wenn esrw.de jemand anderen
    # im Spiel fuehrt; Helfer bekommen Bescheid
    try:
        gesuche_pflegen(url, service, daten, jetzt, nachrichten)
    except Exception as e:
        print("Push: Tauschboerse nicht gepflegt: %s" % str(e)[:120], file=sys.stderr)

    if not nachrichten:
        print("Push: nichts zu melden.")
        return 0

    gesendet_n, tot, neu_gemerkt = 0, 0, []
    for abo in abos:
        for schluessel, nutzlast in nachrichten.get(abo["user_id"], []):
            try:
                webpush(
                    subscription_info={"endpoint": abo["endpoint"],
                                       "keys": {"p256dh": abo["p256dh"], "auth": abo["auth"]}},
                    data=json.dumps(nutzlast, ensure_ascii=False), vapid_private_key=vapid,
                    vapid_claims={"sub": kontakt}, ttl=3600 if schluessel else 86400)
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
                print("Push an %s fehlgeschlagen: %s" % (abo["user_id"][:8], e), file=sys.stderr)
            except Exception as e:
                # Netzfehler o.ae. - ein einzelnes Abo darf den Lauf nicht abbrechen
                print("Push an %s nicht moeglich: %s" % (abo["user_id"][:8], str(e)[:120]), file=sys.stderr)

    if ank:
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
        api(url, service, "push_gesendet?gesendet=lt." + urllib.parse.quote(alt), "DELETE")
    except Exception:
        pass
    print("Push: %d gesendet, %d tote Abos entfernt." % (gesendet_n, tot))
    return 0


if __name__ == "__main__":
    sys.exit(main())
