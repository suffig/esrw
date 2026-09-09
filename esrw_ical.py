#!/usr/bin/env python3
"""
Baut aus den Einteilungen auf esrw.de fuer *jeden* dort genannten
Schiedsrichter einen eigenen iCalendar-Feed, den man auf dem Handy
abonnieren kann - mit Hallenadresse, Koordinaten und Treffpunkt vor
Spielbeginn.

Erzeugt wird ein rein statischer Ordner (docs/), der z.B. ueber GitHub Pages
ausgeliefert werden kann. Kein Server, keine Datenbank, keine Anmeldung.

Nebenbei waechst in historie.json ein dauerhaftes Archiv aller je gesehenen
Spiele - esrw.de selbst zeigt nur wenige Tage rueckwaerts.

Nur Standardbibliothek, keine Installation noetig.

    python esrw_ical.py            # alles bauen
    python esrw_ical.py --wer      # gefundene Personen auflisten
    python esrw_ical.py --dry      # nur anzeigen, nichts schreiben
"""

import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

BASIS = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (kompatibel; esrw-ical/2.1; privater Kalender-Export)"

ROLLEN = {"HSR": "Hauptschiedsrichter", "(L)SR": "Linienrichter"}
# Mannschafts-Zusaetze, die nicht zum Vereinsnamen gehoeren
SUFFIXE = re.compile(r"^(1b|1c|1d|2|3|ii|iii|u\d+|damen|frauen)$", re.I)
# So lange bleibt eine Aenderung im Termin sichtbar markiert
MARKIERUNG_TAGE = 7


# ---------------------------------------------------------------- Hilfsmittel

def lade(pfad, standard=None):
    voll = os.path.join(BASIS, pfad)
    if standard is not None and not os.path.exists(voll):
        return standard
    with open(voll, encoding="utf-8") as f:
        return json.load(f)


def schreibe(pfad, inhalt):
    with open(os.path.join(BASIS, pfad), "w", encoding="utf-8") as f:
        json.dump(inhalt, f, ensure_ascii=False, indent=1, sort_keys=True)


def hole(url, versuche=3):
    """Laedt eine Seite. Bei Netzproblemen wird wiederholt - ein einzelner
    Aussetzer soll nicht dazu fuehren, dass alle Feeds leer werden."""
    letzter = None
    for versuch in range(versuche):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, OSError) as e:
            letzter = e
            if versuch < versuche - 1:
                time.sleep(3 * (versuch + 1))
    raise SystemExit("FEHLER: %s nicht erreichbar (%s)" % (url, letzter))


def nkey(text):
    """Normalisiert Namen/Orte fuer den Vergleich: klein, ohne Umlaute und
    Satzzeichen. 'Kölner Junghaie' und 'koelner  junghaie!' werden gleich."""
    t = html.unescape(text or "").lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss"),
                 ("é", "e"), ("è", "e"), ("á", "a"), ("à", "a"), ("ç", "c")):
        t = t.replace(a, b)
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return " ".join(t.split())


def personen_schluessel(name):
    """Personen-Vergleich ueber die Wortmenge, damit 'Keller, Alexander',
    'Keller Alexander' und 'Alexander Keller' dieselbe Person sind.
    Zusaetze in Klammern wie '(N)' fallen weg."""
    return frozenset(nkey(re.sub(r"\([^)]*\)", " ", name)).split())


def text_aus(fragment):
    """HTML-Schnipsel zu sauberem Text."""
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def slug_aus(name):
    return nkey(re.sub(r"\([^)]*\)", " ", name)).replace(" ", "-") or "unbekannt"


def spiel_id(beginn_iso, begegnung):
    return hashlib.sha1(("%s|%s" % (beginn_iso, begegnung)).encode("utf-8")).hexdigest()


def saison_von(zeitpunkt):
    """Eishockey-Saison laeuft ueber den Jahreswechsel."""
    j = zeitpunkt.year
    return "%d/%s" % (j, str(j + 1)[2:]) if zeitpunkt.month >= 7 \
        else "%d/%s" % (j - 1, str(j)[2:])


# ------------------------------------------------------------------- Parsing

def parse_seite(roh):
    """Liest die Tabellenzeilen der Contao-Einteilungsseite."""
    spiele = []
    for zeile in re.findall(r'<tr class="einteilung_spiel.*?</tr>', roh, re.S):
        zeit = re.search(r'<time datetime="([^"]+)"', zeile)
        begegnung = re.search(r'data-title="Begegnung">(.*?)</td>', zeile, re.S)
        if not zeit or not begegnung:
            continue
        try:
            start = datetime.fromisoformat(zeit.group(1))
        except ValueError:
            continue
        if start.tzinfo is None:
            continue

        besetzung = {}
        for spalte, schluessel in ((r"HSR", "HSR"), (r"\(L\)SR", "(L)SR")):
            m = re.search(r'data-title="%s">(.*?)</td>' % spalte, zeile, re.S)
            roh_namen = text_aus(m.group(1)) if m else ""
            besetzung[schluessel] = [n.strip() for n in roh_namen.split("/") if n.strip()]

        spiele.append({
            "start": start,
            "begegnung": text_aus(begegnung.group(1)),
            "besetzung": besetzung,
        })
    return spiele


# ------------------------------------------------------------- Hallen-Findung

def _ohne_suffixe(worte):
    while worte and SUFFIXE.match(worte[-1]):
        worte = worte[:-1]
    return worte


def _rest_nach_verein(gast, vereine):
    """Schneidet vom Gastnamen den bekannten Verein ab. Was uebrig bleibt, ist
    in dieser Tabelle regelmaessig ein Spielort-Hinweis:
    'Eisadler Dortmund Herford' -> 'Herford'."""
    worte = gast.split()
    laenge = 0
    for verein in vereine:
        vw = verein.split()
        if len(vw) <= len(worte) and nkey(" ".join(worte[:len(vw)])) == nkey(verein):
            laenge = max(laenge, len(vw))
    if laenge:
        rest = worte[laenge:]
        while rest and SUFFIXE.match(rest[0]):
            rest = rest[1:]
        return " ".join(rest)
    # Kein bekannter Verein - dann ist der ganze Ausdruck der Hinweis
    # ('Kölnarena 2', 'Brehmstraße'). Passt er auf keinen Ort, wird er ignoriert.
    return gast


def finde_halle(begegnung, venues):
    """Ermittelt Halle und Adresse. Reihenfolge: ausdrueckliches 'in <Ort>',
    dann Ortshinweis hinter dem Gastnamen, sonst der Heimverein."""
    hallen = venues["hallen"]
    vereine = {nkey(k): v for k, v in venues["vereine"].items()}
    orte = {nkey(k): v for k, v in venues["orte"].items()}
    original_vereine = list(venues["vereine"].keys())

    rest = begegnung.split(":", 1)[1] if ":" in begegnung else begegnung
    rest = rest.strip()

    # "... in Essen !!!"
    ort_hinweis = ""
    m = re.search(r"\bin\s+([^\-]+?)\s*!*\s*$", rest)
    if m:
        ort_hinweis = m.group(1).strip()
        rest = rest[:m.start()].strip()

    teile = rest.split(" - ", 1)
    heim = teile[0].strip()
    gast = teile[1].strip() if len(teile) > 1 else ""

    if not ort_hinweis and gast:
        ort_hinweis = _rest_nach_verein(gast, original_vereine)

    # 1) Ortshinweis
    if ort_hinweis:
        schluessel = orte.get(nkey(ort_hinweis))
        if schluessel and schluessel in hallen:
            return hallen[schluessel], heim, gast, True

    # 2) Heimverein, notfalls ohne Mannschafts-Zusatz
    worte = heim.split()
    while worte:
        schluessel = vereine.get(nkey(" ".join(worte)))
        if schluessel and schluessel in hallen:
            return hallen[schluessel], heim, gast, True
        neu = _ohne_suffixe(worte)
        worte = neu[:-1] if neu == worte else neu

    return None, heim, gast, False


# ----------------------------------------------------------------- iCalendar

def escape(text):
    return (str(text).replace("\\", "\\\\").replace(";", r"\;")
            .replace(",", r"\,").replace("\n", r"\n"))


def falte(zeile):
    """RFC 5545: hoechstens 75 Oktette pro Zeile."""
    roh = zeile.encode("utf-8")
    if len(roh) <= 75:
        return zeile
    stuecke, start = [], 0
    while start < len(roh):
        ende = min(start + (75 if not stuecke else 74), len(roh))
        # Nicht mitten in ein Multibyte-Zeichen schneiden: an einer gueltigen
        # Grenze ist das *naechste* Byte kein Folgebyte (10xxxxxx).
        while ende > start and ende < len(roh) and (roh[ende] & 0xC0) == 0x80:
            ende -= 1
        stuecke.append(roh[start:ende].decode("utf-8"))
        start = ende
    return "\r\n ".join(stuecke)


def utc(zeitpunkt):
    return zeitpunkt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def baue_ics(termine, kalendername, cfg, stand):
    zeilen = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//esrw-ical//Schiedsrichter-Einteilungen//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:" + escape(kalendername),
        "X-WR-TIMEZONE:Europe/Berlin",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ]
    for t in termine:
        titel = ("⚠ " + t["titel"]) if t.get("aenderung") else t["titel"]
        beschreibung = t["beschreibung"]
        if t.get("aenderung"):
            beschreibung = "Geändert: %s\n\n%s" % (t["aenderung"], beschreibung)

        zeilen += [
            "BEGIN:VEVENT",
            "UID:" + t["uid"],
            "SEQUENCE:%d" % t.get("sequence", 0),
            "DTSTAMP:" + utc(stand),
            "LAST-MODIFIED:" + utc(stand),
            "DTSTART:" + utc(t["treffpunkt"]),
            "DTEND:" + utc(t["ende"]),
            "SUMMARY:" + escape(titel),
            "DESCRIPTION:" + escape(beschreibung),
            "URL:" + cfg["quelle"],
            "CATEGORIES:Eishockey,Schiedsrichter",
            "TRANSP:OPAQUE",
        ]
        if t["ort"]:
            zeilen.append("LOCATION:" + escape(t["ort"]))
        # Mit Koordinaten erkennt iOS die Halle als echten Ort und kann
        # "Zeit zum Losfahren" verkehrsabhaengig berechnen.
        if t.get("koordinaten"):
            breite, laenge = t["koordinaten"]
            zeilen.append("GEO:%s;%s" % (breite, laenge))
            zeilen.append(
                'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;'
                'X-ADDRESS="%s";X-APPLE-RADIUS=100;X-TITLE="%s":geo:%s,%s'
                % (t["ort"].replace('"', ""), t["halle_name"].replace('"', ""),
                   breite, laenge))
        # Erinnerungen nur fuer kuenftige Spiele - fuer die Vergangenheit
        # wuerde iOS beim Abonnieren einen Schwall Alarme nachfeuern.
        if not t["vergangen"]:
            for alarm in cfg["erinnerungen"]:
                zeilen += [
                    "BEGIN:VALARM",
                    "ACTION:DISPLAY",
                    "TRIGGER:" + alarm["wann"],
                    "DESCRIPTION:" + escape("%s - %s" % (alarm["text"], t["titel"])),
                    "END:VALARM",
                ]
        zeilen.append("END:VEVENT")
    zeilen.append("END:VCALENDAR")
    return "\r\n".join(falte(z) for z in zeilen) + "\r\n"


# --------------------------------------------------------------------- Archiv

def ergaenze_historie(historie, spiele, venues, stand):
    """Traegt neu gesehene Spiele dauerhaft ein. esrw.de zeigt nur wenige Tage
    rueckwaerts - hier bleibt die ganze Saison erhalten."""
    heute = stand.date().isoformat()
    neu = 0
    for s in spiele:
        kennung = spiel_id(s["start"].isoformat(), s["begegnung"])
        halle, heim, gast, erkannt = finde_halle(s["begegnung"], venues)
        eintrag = historie.get(kennung)
        daten = {
            "beginn": s["start"].isoformat(),
            "begegnung": s["begegnung"],
            "liga": s["begegnung"].split(":", 1)[0].strip() if ":" in s["begegnung"] else "",
            "paarung": "%s – %s" % (heim, gast) if gast else heim,
            "halle": halle["name"] if halle else "",
            "besetzung": s["besetzung"],
            "zuletzt_gesehen": heute,
        }
        if eintrag is None:
            daten["zuerst_gesehen"] = heute
            historie[kennung] = daten
            neu += 1
        else:
            daten["zuerst_gesehen"] = eintrag.get("zuerst_gesehen", heute)
            historie[kennung] = daten
    return neu


def statistik_aus_historie(historie, stand):
    """Zaehlt je Person die Einsaetze im gesamten Archiv."""
    jetzt_saison = saison_von(stand)
    werte = {}
    for eintrag in historie.values():
        try:
            beginn = datetime.fromisoformat(eintrag["beginn"])
        except (ValueError, KeyError):
            continue
        saison = saison_von(beginn)
        for rolle, namen in (eintrag.get("besetzung") or {}).items():
            for name in namen:
                schluessel = personen_schluessel(name)
                if not schluessel:
                    continue
                s = werte.setdefault(schluessel, {
                    "gesamt": 0, "saison": 0, "rollen": Counter(),
                    "ligen": Counter(), "hallen": Counter(),
                    "erste": None, "letzte": None})
                s["gesamt"] += 1
                if saison == jetzt_saison:
                    s["saison"] += 1
                s["rollen"][rolle] += 1
                if eintrag.get("liga"):
                    s["ligen"][eintrag["liga"]] += 1
                if eintrag.get("halle"):
                    s["hallen"][eintrag["halle"]] += 1
                tag = beginn.date().isoformat()
                if s["erste"] is None or tag < s["erste"]:
                    s["erste"] = tag
                if s["letzte"] is None or tag > s["letzte"]:
                    s["letzte"] = tag
    return werte, jetzt_saison


# ------------------------------------------------------------ Personen bilden

def waehle_schreibweise(kandidaten):
    """Aus mehreren Schreibweisen derselben Person die beste aussuchen:
    ohne Klammerzusatz, mit Komma, sonst die haeufigste."""
    def rang(paar):
        name, anzahl = paar
        return ("(" in name, "," not in name, -anzahl, name)
    return sorted(kandidaten.items(), key=rang)[0][0]


def sammle_personen(spiele, cfg, venues, jetzt):
    vorlauf = timedelta(minutes=cfg["vorlauf_minuten"])
    dauer = timedelta(minutes=cfg["spieldauer_minuten"])
    personen = {}

    for spiel in spiele:
        halle, heim, gast, sicher = finde_halle(spiel["begegnung"], venues)
        liga = spiel["begegnung"].split(":", 1)[0].strip() if ":" in spiel["begegnung"] else ""
        anstoss = spiel["start"]
        treffpunkt = anstoss - vorlauf
        paarung = "%s – %s" % (heim, gast) if gast else heim
        alle_namen = [n for liste in spiel["besetzung"].values() for n in liste]

        for rolle, namen in spiel["besetzung"].items():
            for name in namen:
                schluessel = personen_schluessel(name)
                if not schluessel:
                    continue
                eintrag = personen.setdefault(schluessel, {
                    "schreibweisen": Counter(), "termine": [], "schluessel": schluessel})
                eintrag["schreibweisen"][name] += 1

                kollegen = [n for n in alle_namen if personen_schluessel(n) != schluessel]
                zeilen = [
                    "Rolle: %s (%s)" % (ROLLEN.get(rolle, rolle), rolle),
                    "Spielbeginn: %s Uhr" % anstoss.strftime("%H:%M"),
                    "Treffpunkt: %s Uhr (%d Min vor Spielbeginn)" % (
                        treffpunkt.strftime("%H:%M"), cfg["vorlauf_minuten"]),
                ]
                if liga:
                    zeilen.append("Liga: %s" % liga)
                if halle:
                    zeilen += ["Halle: %s" % halle["name"],
                               "Adresse: %s" % halle["adresse"]]
                else:
                    zeilen.append("!! Halle nicht automatisch erkannt "
                                  "- bitte selbst pruefen !!")
                if kollegen:
                    zeilen.append("Gespann: %s" % " / ".join(kollegen))
                zeilen += ["", "Quelle: %s" % cfg["quelle"]]

                titel = "%s · %s · %s" % (rolle, liga, paarung) if liga \
                    else "%s · %s" % (rolle, paarung)

                eintrag["termine"].append({
                    "kennung": spiel_id(anstoss.isoformat(), spiel["begegnung"]),
                    "titel": titel,
                    "beschreibung": "\n".join(zeilen),
                    "ort": "%s, %s" % (halle["name"], halle["adresse"]) if halle else "",
                    "halle_name": halle["name"] if halle else "",
                    "koordinaten": halle.get("koordinaten") if halle else None,
                    "treffpunkt": treffpunkt,
                    "anstoss": anstoss,
                    "ende": anstoss + dauer,
                    "rolle": rolle,
                    "liga": liga,
                    "paarung": paarung,
                    "halle_erkannt": sicher,
                    "gespann": kollegen,
                    "vergangen": anstoss < jetzt,
                })

    fertig = []
    for eintrag in personen.values():
        name = waehle_schreibweise(eintrag["schreibweisen"])
        eintrag["termine"].sort(key=lambda t: t["treffpunkt"])
        for t in eintrag["termine"]:
            t["uid"] = hashlib.sha1(
                ("%s|%s" % (t["kennung"], slug_aus(name))).encode("utf-8")
            ).hexdigest() + "@esrw.de"
        fertig.append({
            "slug": slug_aus(name),
            "name": name,
            "schluessel": eintrag["schluessel"],
            "varianten": sorted(eintrag["schreibweisen"]),
            "termine": eintrag["termine"],
        })
    fertig.sort(key=lambda p: nkey(p["name"]))
    return fertig


# ---------------------------------------------------------- Aenderungen

def beschreibe_aenderung(vorher, jetzt):
    """Kurztext, was sich seit dem letzten Lauf geaendert hat."""
    teile = []
    alt_zeit = (vorher.get("treffpunkt") or "")[11:16]
    neu_zeit = jetzt["treffpunkt"].isoformat()[11:16]
    if alt_zeit and alt_zeit != neu_zeit:
        teile.append("Zeit (vorher %s Uhr)" % alt_zeit)
    if vorher.get("ort") and vorher["ort"] != jetzt["ort"]:
        alte_halle = vorher["ort"].split(",")[0]
        teile.append("Halle (vorher %s)" % alte_halle)
    if vorher.get("titel") and vorher["titel"] != jetzt["titel"]:
        teile.append("Ansetzung")
    return ", ".join(teile) or "Angaben angepasst"


def verarbeite_aenderungen(personen, alt, stand, eigene_slugs):
    """Vergibt SEQUENCE, markiert frische Aenderungen und meldet, was fuer
    die eigenen Namen neu, geaendert oder entfallen ist."""
    neu_state, neue, geaendert, entfallen = {}, [], [], []
    heute = stand.date()

    for p in personen:
        ist_eigen = p["slug"] in eigene_slugs
        for t in p["termine"]:
            inhalt = hashlib.sha1(("%s|%s|%s" % (
                t["titel"], t["ort"], t["treffpunkt"].isoformat())).encode("utf-8")
            ).hexdigest()
            vorher = alt.get(t["uid"])
            geaendert_am = None

            if vorher is None:
                t["sequence"] = 0
                if ist_eigen and not t["vergangen"] and alt:
                    neue.append(t)
            elif vorher.get("inhalt") != inhalt:
                t["sequence"] = vorher.get("sequence", 0) + 1
                geaendert_am = heute.isoformat()
                t["aenderung"] = beschreibe_aenderung(vorher, t)
                if ist_eigen and not t["vergangen"]:
                    geaendert.append(t)
            else:
                t["sequence"] = vorher.get("sequence", 0)
                geaendert_am = vorher.get("geaendert_am")
                # Aenderung eine Woche lang sichtbar lassen
                if geaendert_am:
                    try:
                        alter = (heute - datetime.fromisoformat(geaendert_am).date()).days
                        if alter <= MARKIERUNG_TAGE:
                            t["aenderung"] = vorher.get("aenderung", "Angaben angepasst")
                        else:
                            geaendert_am = None
                    except ValueError:
                        geaendert_am = None

            neu_state[t["uid"]] = {
                "inhalt": inhalt,
                "sequence": t["sequence"],
                "slug": p["slug"],
                "titel": t["titel"],
                "ort": t["ort"],
                "treffpunkt": t["treffpunkt"].isoformat(),
                "beginn": t["anstoss"].isoformat(),
                "geaendert_am": geaendert_am,
                "aenderung": t.get("aenderung"),
            }

    # Was aus den Daten verschwunden ist und noch in der Zukunft lag, ist eine
    # Absetzung. Aeltere Eintraege fallen nur aus dem Rueckschau-Fenster.
    for uid, eintrag in alt.items():
        if uid in neu_state or eintrag.get("slug") not in eigene_slugs:
            continue
        try:
            beginn = datetime.fromisoformat(eintrag.get("beginn", ""))
        except ValueError:
            continue
        if beginn > stand:
            entfallen.append(eintrag)

    return neu_state, neue, geaendert, entfallen


# --------------------------------------------------------------------- Ablauf

def melde(text, titel):
    """Push aufs Handy ueber ntfy.sh - nur wenn NTFY_TOPIC gesetzt ist."""
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        return
    req = urllib.request.Request(
        "https://ntfy.sh/" + topic,
        data=text.encode("utf-8"),
        headers={"Title": titel.encode("utf-8").decode("latin-1", "replace"),
                 "Tags": "ice_hockey", "User-Agent": UA},
    )
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:
        print("Hinweis: ntfy-Benachrichtigung fehlgeschlagen: %s" % e, file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description="ESRW-Einteilungen als iCalendar-Feeds")
    ap.add_argument("--wer", action="store_true", help="gefundene Personen auflisten")
    ap.add_argument("--dry", action="store_true", help="nichts schreiben, nur anzeigen")
    args = ap.parse_args()

    cfg = lade("config.json")
    venues = lade("venues.json")
    stand = datetime.now(timezone.utc)

    spiele = parse_seite(hole(cfg["quelle"]))
    if not spiele:
        # Schutz: lieber abbrechen als leere Kalender zu veroeffentlichen und
        # damit allen Kollegen die Termine vom Handy zu loeschen.
        sys.exit("FEHLER: keine Spiele gefunden - hat sich der Seitenaufbau geaendert?")
    aktuell = len(spiele)

    tage = int(cfg.get("vergangene_tage", 0))
    if tage > 0 and cfg.get("quelle_vergangene"):
        grenze = stand - timedelta(days=tage)
        vergangene = [s for s in parse_seite(hole(cfg["quelle_vergangene"]))
                      if s["start"] >= grenze]
        bekannt = {(s["start"], s["begegnung"]) for s in spiele}
        spiele += [s for s in vergangene if (s["start"], s["begegnung"]) not in bekannt]

    print("%d Spiele gefunden (%d aktuell, %d aus den letzten %d Tagen)."
          % (len(spiele), aktuell, len(spiele) - aktuell, tage))

    personen = sammle_personen(spiele, cfg, venues, stand)
    print("%d Personen." % len(personen))

    unklar = sorted({t["paarung"] for p in personen for t in p["termine"]
                     if not t["halle_erkannt"]})
    for u in unklar:
        print("  ! Halle nicht erkannt: %s" % u, file=sys.stderr)

    if args.wer:
        print()
        for p in personen:
            extra = ""
            if len(p["varianten"]) > 1:
                extra = "   [zusammengefasst: %s]" % ", ".join(p["varianten"])
            print("  %-30s %-28s %2d Spiele%s"
                  % (p["name"], p["slug"], len(p["termine"]), extra))
        return

    # Archiv fortschreiben und daraus die Statistik rechnen
    historie = lade("historie.json", {})
    frisch = ergaenze_historie(historie, spiele, venues, stand)
    stats, saison = statistik_aus_historie(historie, stand)
    print("Archiv: %d Spiele insgesamt (%d neu), Saison %s."
          % (len(historie), frisch, saison))

    eigene_slugs = {slug_aus(n) for n in cfg.get("eigene_namen", [])}
    eigene_slugs |= {p["slug"] for p in personen
                     if p["schluessel"] in {personen_schluessel(n)
                                            for n in cfg.get("eigene_namen", [])}}
    alt = lade("state.json", {})
    neu_state, neue, geaendert, entfallen = verarbeite_aenderungen(
        personen, alt, stand, eigene_slugs)

    markiert = sum(1 for p in personen for t in p["termine"] if t.get("aenderung"))
    if markiert:
        print("%d Termin(e) als geaendert markiert." % markiert)

    if args.dry:
        print("\n--dry: nichts geschrieben. Feeds waeren: %d" % (len(personen) + 1))
        return

    ziel = os.path.join(BASIS, cfg["ausgabe_verzeichnis"])
    feeds = os.path.join(ziel, "feeds")
    os.makedirs(feeds, exist_ok=True)

    # Feeds, die es nicht mehr gibt, entfernen - sonst bleiben veraltete
    # Kalender fuer Leute stehen, die gar nicht mehr eingeteilt werden.
    gewollt = {"%s.ics" % p["slug"] for p in personen} | {"alle.ics"}
    for datei in os.listdir(feeds):
        if datei.endswith(".ics") and datei not in gewollt:
            os.remove(os.path.join(feeds, datei))

    muster = cfg.get("kalender_name_muster", "Einteilungen – {name}")
    for p in personen:
        with open(os.path.join(feeds, "%s.ics" % p["slug"]), "w",
                  encoding="utf-8", newline="") as f:
            f.write(baue_ics(p["termine"], muster.format(name=p["name"]), cfg, stand))

    # Gesamtkalender: jedes Spiel einmal, ohne Rollenbezug
    gesamt, gesehen = [], set()
    for p in personen:
        for t in p["termine"]:
            if t["kennung"] in gesehen:
                continue
            gesehen.add(t["kennung"])
            kopie = dict(t)
            kopie["uid"] = hashlib.sha1(t["kennung"].encode("utf-8")).hexdigest() + "@esrw.de"
            kopie["titel"] = "%s · %s" % (t["liga"], t["paarung"]) if t["liga"] else t["paarung"]
            kopie["sequence"] = 0
            gesamt.append(kopie)
    gesamt.sort(key=lambda t: t["treffpunkt"])
    with open(os.path.join(feeds, "alle.ics"), "w", encoding="utf-8", newline="") as f:
        f.write(baue_ics(gesamt, "Alle Spiele (ESRW)", cfg, stand))

    def stat_fuer(p):
        s = stats.get(p["schluessel"])
        if not s:
            return None
        return {
            "gesamt": s["gesamt"], "saison": s["saison"],
            "rollen": dict(s["rollen"]),
            "ligen": s["ligen"].most_common(4),
            "hallen": s["hallen"].most_common(4),
            "erste": s["erste"], "letzte": s["letzte"],
        }

    daten = {
        "stand": stand.isoformat(),
        "titel": cfg.get("titel", "Einteilungen"),
        "quelle": cfg["quelle"],
        "vorlauf_minuten": cfg["vorlauf_minuten"],
        "spiele_gesamt": len(gesehen),
        "saison": saison,
        "archiv_spiele": len(historie),
        "personen": [{
            "slug": p["slug"],
            "name": p["name"],
            "varianten": p["varianten"],
            "statistik": stat_fuer(p),
            "spiele": [{
                "beginn": t["anstoss"].isoformat(),
                "treffpunkt": t["treffpunkt"].isoformat(),
                "rolle": t["rolle"],
                "liga": t["liga"],
                "paarung": t["paarung"],
                "ort": t["ort"],
                "koordinaten": t["koordinaten"],
                "gespann": t["gespann"],
                "halle_erkannt": t["halle_erkannt"],
                "vergangen": t["vergangen"],
                "aenderung": t.get("aenderung"),
            } for t in p["termine"]],
        } for p in personen],
    }
    with open(os.path.join(ziel, "daten.json"), "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=1)

    schreibe("historie.json", historie)
    schreibe("state.json", neu_state)

    print("\n%d Feeds geschrieben nach %s/feeds/."
          % (len(personen) + 1, cfg["ausgabe_verzeichnis"]))
    if unklar:
        print("%d Begegnung(en) ohne erkannte Halle." % len(unklar))

    if neue or geaendert or entfallen:
        zeilen = []
        for t in neue:
            zeilen.append("Neu: %s %s Uhr – %s (Halle %s Uhr)" % (
                t["anstoss"].strftime("%a %d.%m."), t["anstoss"].strftime("%H:%M"),
                t["titel"], t["treffpunkt"].strftime("%H:%M")))
        for t in geaendert:
            zeilen.append("Geändert (%s): %s %s Uhr – %s" % (
                t.get("aenderung", "?"), t["anstoss"].strftime("%a %d.%m."),
                t["anstoss"].strftime("%H:%M"), t["titel"]))
        for e in entfallen:
            zeilen.append("Abgesetzt: %s – %s" % (
                datetime.fromisoformat(e["beginn"]).strftime("%a %d.%m. %H:%M"),
                e.get("titel", "")))
        melde("\n".join(zeilen), "Einteilung: %d neu, %d geändert, %d abgesetzt"
              % (len(neue), len(geaendert), len(entfallen)))
        print("Benachrichtigung: %d neu, %d geaendert, %d abgesetzt."
              % (len(neue), len(geaendert), len(entfallen)))


if __name__ == "__main__":
    main()
