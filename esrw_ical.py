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
try:
    from zoneinfo import ZoneInfo
    BERLIN = ZoneInfo("Europe/Berlin")
except Exception:  # pragma: no cover
    BERLIN = None
from collections import Counter
from datetime import datetime, timedelta, timezone

BASIS = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (kompatibel; esrw-ical/2.1; privater Kalender-Export)"

ROLLEN = {"SR": "Schiedsrichter", "HSR": "Hauptschiedsrichter", "LSR": "Linienrichter"}
# Ab so vielen Offiziellen gibt es die Aufteilung in Haupt- und Linienrichter;
# darunter sind alle gleichberechtigte Schiedsrichter.
DREIER_SYSTEM_AB = 3
# Schreibweisen, die zur selben Person gehoeren (aus config.json, siehe
# aliase_laden). Schluessel und Werte sind normalisierte Namensmengen.
ALIASE = {}
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


def _roh_schluessel(name):
    return frozenset(nkey(re.sub(r"\([^)]*\)", " ", name)).split())


def personen_schluessel(name):
    """Personen-Vergleich ueber die Wortmenge, damit 'Keller, Alexander',
    'Keller Alexander' und 'Alexander Keller' dieselbe Person sind.
    Zusaetze in Klammern wie '(N)' fallen weg. Schreibweisen, die laut
    config.json zusammengehoeren ('Philip' / 'Philipp'), werden auf eine
    gemeinsame Kennung abgebildet."""
    k = _roh_schluessel(name)
    return ALIASE.get(k, k)


def aliase_laden(cfg):
    """Liest 'gleiche_personen' aus der Konfiguration: Listen von
    Schreibweisen, die derselbe Mensch sind. Die erste Schreibweise jeder
    Gruppe gilt als die richtige."""
    ALIASE.clear()
    for gruppe in cfg.get("gleiche_personen", []):
        if not gruppe:
            continue
        ziel = _roh_schluessel(gruppe[0])
        for name in gruppe:
            ALIASE[_roh_schluessel(name)] = ziel
    return {gruppe[0] for gruppe in cfg.get("gleiche_personen", []) if gruppe}


def rollen_fuer(besetzung):
    """Ordnet jedem Namen eines Spiels seine Rolle zu.

    esrw.de fuehrt zwei Spalten, 'HSR' und '(L)SR'. Im Zwei-Mann-System
    stehen beide in der zweiten Spalte und sind gleichberechtigte
    Schiedsrichter. Erst ab drei Offiziellen gibt es einen
    Hauptschiedsrichter und Linienrichter."""
    hsr = besetzung.get("HSR", [])
    lsr = besetzung.get("(L)SR", [])
    if len(hsr) + len(lsr) < DREIER_SYSTEM_AB:
        return [(n, "SR") for n in hsr + lsr]
    return [(n, "HSR") for n in hsr] + [(n, "LSR") for n in lsr]


def text_aus(fragment):
    """HTML-Schnipsel zu sauberem Text."""
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def slug_aus(name):
    return nkey(re.sub(r"\([^)]*\)", " ", name)).replace(" ", "-") or "unbekannt"


def spiel_id(beginn_iso, begegnung):
    return hashlib.sha1(("%s|%s" % (beginn_iso, begegnung)).encode("utf-8")).hexdigest()


WOCHENTAGE = ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")


def kurz_datum(zeitpunkt):
    """'Mi 16.09. 19:30' - strftime wuerde je nach Locale 'Wed' liefern."""
    return "%s %s" % (WOCHENTAGE[zeitpunkt.weekday()],
                      zeitpunkt.strftime("%d.%m. %H:%M"))


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
    # Turniere stehen als "EHC Troisdorf -" ohne Gast auf der Seite
    heim = teile[0].strip().rstrip("-").strip()
    gast = teile[1].strip() if len(teile) > 1 else ""

    if not ort_hinweis and gast:
        ort_hinweis = _rest_nach_verein(gast, original_vereine)

    # 1) Ortshinweis
    if ort_hinweis:
        schluessel = orte.get(nkey(ort_hinweis))
        if not schluessel and gast and "!" in gast and nkey(ort_hinweis) == nkey(gast):
            # Unbekannter Gastverein mit Ausrufezeichen (so markiert esrw.de
            # einen abweichenden Spielort): der Ort steht hinten dran
            # ('Chiefs Leuwen Düsseldorf !!!' -> 'Düsseldorf'). Ohne '!'
            # bleibt es beim Heimverein - 'ESV Bergisch Gladbach' spielt
            # auswaerts, nicht in Bergisch Gladbach.
            worte_h = ort_hinweis.replace("!", "").split()
            for n in range(len(worte_h) - 1, 0, -1):
                schluessel = orte.get(nkey(" ".join(worte_h[-n:])))
                if schluessel:
                    break
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

        # Zeitstempel des letzten *inhaltlichen* Wechsels, nicht des Laufs.
        # Sonst waeren alle Feeds nach jedem Lauf "geaendert" und der Workflow
        # wuerde alle 30 Minuten 60 Dateien committen, ohne dass sich etwas
        # getan hat.
        stempel = t.get("stempel") or stand

        zeilen += [
            "BEGIN:VEVENT",
            "UID:" + t["uid"],
            "SEQUENCE:%d" % t.get("sequence", 0),
            "DTSTAMP:" + utc(stempel),
            "LAST-MODIFIED:" + utc(stempel),
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


def saison_datei(saison):
    return os.path.join("docs", "archiv", saison.replace("/", "-") + ".json")


def saisonarchiv_laden():
    """Eingefrorene Saisons (docs/archiv/<saison>.json) wieder als
    Historie-Eintraege - fuer Statistik und Datenbank-Archiv."""
    ordner = os.path.join(BASIS, "docs", "archiv")
    alt = {}
    if not os.path.isdir(ordner):
        return alt
    for name in sorted(os.listdir(ordner)):
        if not name.endswith(".json") or name == "index.json":
            continue
        try:
            with open(os.path.join(ordner, name), encoding="utf-8") as f:
                inhalt = json.load(f)
        except (OSError, ValueError):
            continue
        for z in inhalt.get("spiele", []):
            # [beginn, liga, paarung, halle, [[name, slug, rolle], ...]]
            besetzung = {"HSR": [], "(L)SR": []}
            for b in z[4]:
                (besetzung["HSR"] if b[2] == "HSR" else besetzung["(L)SR"]).append(b[0])
            alt[z[0] + "|" + z[2]] = {"beginn": z[0], "liga": z[1], "paarung": z[2], "halle": z[3],
                                     "besetzung": besetzung, "begegnung": (z[1] + ": " if z[1] else "") + z[2],
                                     "eingefroren": True}
    return alt


def saisonarchiv_einfrieren(historie, personen, stand):
    """Abgeschlossene Saisons aus historie.json in kompakte Dateien
    docs/archiv/<saison>.json schreiben und aus der Arbeitsdatei nehmen.
    Datensparend: je Spiel eine Zeile, Namen mit Slug, kein Ballast."""
    jetzt = saison_von(stand)
    schluessel_slug = {p["schluessel"]: p["slug"] for p in personen}
    je_saison = {}
    for kennung, e in list(historie.items()):
        try:
            saison = saison_von(datetime.fromisoformat(e["beginn"]))
        except (KeyError, ValueError):
            continue
        if saison >= jetzt:
            continue
        je_saison.setdefault(saison, []).append((kennung, e))
    ordner = os.path.join(BASIS, "docs", "archiv")
    os.makedirs(ordner, exist_ok=True)
    for saison, eintraege in je_saison.items():
        pfad = os.path.join(BASIS, saison_datei(saison))
        vorhanden = {}
        if os.path.exists(pfad):
            try:
                with open(pfad, encoding="utf-8") as f:
                    vorhanden = {z[0] + "|" + z[2]: z for z in json.load(f).get("spiele", [])}
            except (OSError, ValueError):
                vorhanden = {}
        for kennung, e in eintraege:
            bes = [[n, schluessel_slug.get(personen_schluessel(n)) or slug_aus(n), r]
                   for n, r in rollen_fuer(e.get("besetzung") or {})]
            vorhanden[e["beginn"] + "|" + e.get("paarung", "")] = [e["beginn"], e.get("liga", ""), e.get("paarung", ""), e.get("halle", ""), bes]
            del historie[kennung]
        zeilen = sorted(vorhanden.values(), key=lambda z: z[0])
        with open(pfad, "w", encoding="utf-8") as f:
            json.dump({"saison": saison, "stand": stand.isoformat(), "spiele": zeilen}, f, ensure_ascii=False, separators=(",", ":"))
        print("Saison %s eingefroren: %d Spiele -> %s" % (saison, len(zeilen), saison_datei(saison)))
    # Index aller Saison-Dateien fuer die Webseite
    index = []
    for name in sorted(os.listdir(ordner), reverse=True):
        if not name.endswith(".json") or name == "index.json":
            continue
        try:
            with open(os.path.join(ordner, name), encoding="utf-8") as f:
                inhalt = json.load(f)
            index.append({"saison": inhalt.get("saison"), "datei": "archiv/" + name, "spiele": len(inhalt.get("spiele", []))})
        except (OSError, ValueError):
            continue
    with open(os.path.join(ordner, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)
    return index


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
        paare = rollen_fuer(eintrag.get("besetzung") or {})
        for name, rolle in paare:
            schluessel = personen_schluessel(name)
            if not schluessel:
                continue
            s = werte.setdefault(schluessel, {
                "gesamt": 0, "saison": 0, "rollen": Counter(),
                "ligen": Counter(), "hallen": Counter(),
                "partner": Counter(), "partner_namen": {}, "je_saison": Counter(),
                "erste": None, "letzte": None, "spiele_saison": []})
            s["gesamt"] += 1
            s["je_saison"][saison] += 1
            if saison == jetzt_saison:
                s["saison"] += 1
            # Mit wem man am haeufigsten im Gespann stand
            for anderer, _ in paare:
                k2 = personen_schluessel(anderer)
                if k2 and k2 != schluessel:
                    s["partner"][k2] += 1
                    s["partner_namen"].setdefault(k2, anderer)
            # Fuer die Saisonlisten auf der Webseite - esrw.de zeigt nur
            # wenige Tage zurueck, das Archiv alle Saisons.
            if saison != jetzt_saison:
                continue
            s["spiele_saison"].append({
                "saison": saison,
                "beginn": eintrag["beginn"],
                "liga": eintrag.get("liga", ""),
                "paarung": eintrag.get("paarung", ""),
                "halle": eintrag.get("halle", ""),
                "rolle": rolle,
                "system": len(rollen_fuer(eintrag.get("besetzung") or {})),
            })
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


# ------------------------------------------------------------ Verguetung
#
# Gleiche Zuordnung wie in docs/mitglieder.js, damit Kalender und
# Abrechnung dieselben Zahlen zeigen. Quelle: docs/gebuehren.json.

def liga_einordnen(liga):
    L = (liga or "").upper()
    alter = re.search(r"U(7|9|11|13|15|17|20)", L)
    if alter:
        if re.search(r"DNL|U17 (I|II)", L):
            return None
        stufe = ("RL" if re.search(r"RL[A-Z]?|REGIONAL", L) else
                 "LL" if re.search(r"LL|LANDES", L) else
                 "BL" if re.search(r"BL|BZL|BEZIRK", L) else "")
        return ("U" + alter.group(1), stufe)
    if re.search(r"DNL|DA|AUSWAHL", L):
        return None
    if re.search(r"FRAUEN|DAMEN|DEFL|DFEL", L):
        return ("frauen", "2LIGA" if re.search(r"2|DEFL|DFEL", L) else "")
    if re.search(r"RL|REGIONAL", L):
        return ("senioren", "RL")
    if re.search(r"LL|LANDES", L):
        return ("senioren", "LL")
    if re.search(r"BL|BZL|BEZIRK|SENIOREN", L):
        return ("senioren", "BL")
    return None


def grundgebuehr(gebuehren, liga, rolle, system):
    """Spielleitungsgebuehr laut Ordnung oder None, wenn nicht zuzuordnen."""
    if not gebuehren:
        return None
    e = liga_einordnen(liga)
    if not e:
        return None
    klasse, stufe = e
    if klasse == "senioren":
        satz = gebuehren.get("senioren", {}).get(stufe)
    elif klasse == "frauen":
        satz = gebuehren.get("frauen")
    else:
        n = gebuehren.get("nachwuchs", {}).get(klasse)
        if not n:
            return None
        satz = (n.get("RL") if stufe == "RL" else n.get("sonst")) if klasse == "U20" else n
    if not satz:
        return None
    if satz.get("SR_allein") is not None and system <= 1:
        return satz["SR_allein"]
    betrag = satz.get(rolle)
    return betrag if betrag is not None else satz.get("SR")


def zeitzuschlag(gebuehren, anstoss):
    z = (gebuehren or {}).get("zuschlag_zeit")
    if not z:
        return 0
    hm = anstoss.strftime("%H:%M")
    if hm <= z.get("bis_einschliesslich", "00:00") or hm >= z.get("ab_einschliesslich", "99:99"):
        return z.get("prozent", 0)
    return 0


# ------------------------------------------------------------ Personen bilden

def waehle_schreibweise(kandidaten, bevorzugt=frozenset()):
    """Aus mehreren Schreibweisen derselben Person die beste aussuchen:
    eine in der Konfiguration als richtig markierte, sonst ohne
    Klammerzusatz, mit Komma, sonst die haeufigste."""
    def rang(paar):
        name, anzahl = paar
        return (name not in bevorzugt, "(" in name, "," not in name, -anzahl, name)
    return sorted(kandidaten.items(), key=rang)[0][0]


def pruefe_konflikte(termine, cfg):
    """Markiert Termine derselben Person, die sich nicht vereinbaren lassen:
    zwei Spiele zur gleichen Zeit, oder zwei Spiele in verschiedenen Hallen,
    bei denen das zweite anfaengt, bevor das erste vorbei sein kann.
    Zwei Spiele hintereinander in derselben Halle sind normal und bekommen
    keinen Hinweis."""
    termine = sorted(termine, key=lambda t: t["anstoss"])
    for a, b in zip(termine, termine[1:]):
        beide_bekannt = bool(a["halle_name"]) and bool(b["halle_name"])
        gleiche_halle = beide_bekannt and a["halle_name"] == b["halle_name"]
        if b["anstoss"] == a["anstoss"]:
            a["hinweis"] = "Gleichzeitig angesetzt: %s" % b["paarung"]
            b["hinweis"] = "Gleichzeitig angesetzt: %s" % a["paarung"]
        # Ist eine der Hallen unbekannt, laesst sich nicht sagen, ob die
        # Anschlusszeit reicht - lieber schweigen als falsch warnen.
        elif beide_bekannt and not gleiche_halle and b["treffpunkt"] < a["ende"]:
            luecke = int((b["anstoss"] - a["anstoss"]).total_seconds() // 60)
            a["hinweis"] = ("Danach %s in %s – nur %d Min bis zum nächsten Anstoß"
                            % (b["paarung"], b["halle_name"] or "anderer Halle", luecke))
            b["hinweis"] = ("Davor %s in %s – nur %d Min nach dem vorigen Anstoß"
                            % (a["paarung"], a["halle_name"] or "anderer Halle", luecke))


def tabelle_laden(cfg, pfad):
    """Liest eine Supabase-Tabelle - mit dem Service-Schluessel aus dem
    Workflow, sonst mit dem oeffentlichen anon-Schluessel aus
    docs/supabase.json (die Zugriffsregeln erlauben das Lesen). Ohne
    Zugang oder bei Fehlern: leere Liste."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    schluessel = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not schluessel:
        sb = lade(os.path.join(cfg["ausgabe_verzeichnis"], "supabase.json"), {}) or {}
        url, schluessel = sb.get("url", ""), sb.get("anon_key", "")
        if sb.get("mock") or not url or not schluessel:
            return []
    try:
        anfrage = urllib.request.Request(
            url.rstrip("/") + "/rest/v1/" + pfad,
            headers={"apikey": schluessel, "Authorization": "Bearer " + schluessel})
        with urllib.request.urlopen(anfrage, timeout=20) as antwort:
            return json.loads(antwort.read().decode("utf-8")) or []
    except Exception as e:
        print("  ! Tabelle %s nicht lesbar: %s" % (pfad.split("?")[0], str(e)[:100]), file=sys.stderr)
        return []


def korrekturen_laden(cfg):
    """Korrekturen des Betreibers je Spiel (Tabelle spiel_korrekturen)."""
    zeilen = tabelle_laden(cfg, "spiel_korrekturen?select=kennung,halle,beginn,treffpunkt,hinweis,abgesagt")
    return {z["kennung"]: z for z in zeilen if z.get("kennung")}


def _zeit(iso):
    """ISO-Zeit aus Supabase (UTC) als Berliner Zeit."""
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return d.astimezone(BERLIN) if BERLIN else d


def tabelle_schreiben(pfad, zeilen):
    """Upsert in eine Supabase-Tabelle - nur mit dem Service-Schluessel aus
    dem Workflow (Secrets). Ohne ihn passiert nichts."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    schluessel = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not schluessel or not zeilen:
        return False
    for i in range(0, len(zeilen), 200):
        anfrage = urllib.request.Request(
            url.rstrip("/") + "/rest/v1/" + pfad, method="POST",
            data=json.dumps(zeilen[i:i + 200], ensure_ascii=False).encode("utf-8"),
            headers={"apikey": schluessel, "Authorization": "Bearer " + schluessel,
                     "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"})
        with urllib.request.urlopen(anfrage, timeout=60):
            pass
    return True


def archiv_in_db(historie, uebersicht, personen, stand):
    """Alle Spiele aller Personen dauerhaft in der Datenbank (spiele_archiv):
    das komplette Archiv plus das aktuelle Datenfenster, je Lauf per Upsert."""
    schluessel_slug = {p["schluessel"]: p["slug"] for p in personen}
    def slug_fuer(name):
        return schluessel_slug.get(personen_schluessel(name)) or slug_aus(name)
    zeilen = {}
    for e in historie.values():
        try:
            beginn = datetime.fromisoformat(e["beginn"])
        except (KeyError, ValueError):
            continue
        besetzung = [{"name": n, "rolle": r, "slug": slug_fuer(n)} for n, r in rollen_fuer(e.get("besetzung") or {})]
        kennung = e["beginn"] + "|" + e.get("paarung", "")
        zeilen[kennung] = {
            "kennung": kennung, "beginn": e["beginn"], "liga": e.get("liga") or None, "paarung": e.get("paarung") or None,
            "halle": e.get("halle") or None, "system": len(besetzung), "besetzung": besetzung,
            "slugs": [b["slug"] for b in besetzung if b["slug"]], "saison": saison_von(beginn), "manuell": False,
            "stand": stand.isoformat()}
    for s in uebersicht:
        besetzung = [{"name": b["name"], "rolle": b["rolle"], "slug": b.get("slug") or slug_aus(b["name"])} for b in s["besetzung"]]
        zeilen[s["id"]] = {
            "kennung": s["id"], "beginn": s["anstoss"].isoformat(), "liga": s["liga"] or None, "paarung": s["paarung"],
            "halle": s["halle_name"] or None, "system": s["system"], "besetzung": besetzung,
            "slugs": [b["slug"] for b in besetzung if b["slug"]], "saison": saison_von(s["anstoss"]),
            "manuell": bool(s.get("manuell")), "stand": stand.isoformat()}
    if tabelle_schreiben("spiele_archiv?on_conflict=kennung", list(zeilen.values())):
        print("Archiv in der Datenbank: %d Spiele." % len(zeilen))


def betreiber_daten(cfg, venues):
    """Hallen, Vereine, manuelle Spiele und offizielle Hallen-Hinweise aus
    Supabase in venues bzw. die Spielliste einarbeiten."""
    n_hallen = 0
    for z in tabelle_laden(cfg, "hallen_extra?select=name,adresse,lat,lon"):
        if not z.get("name"):
            continue
        slug = "extra-" + slug_aus(z["name"])
        eintrag = {"name": z["name"], "adresse": z.get("adresse") or ""}
        if z.get("lat") is not None and z.get("lon") is not None:
            eintrag["koordinaten"] = [z["lat"], z["lon"]]
        venues["hallen"][slug] = eintrag
        venues["orte"].setdefault(z["name"], slug)
        n_hallen += 1
    nach_name = {h["name"]: s for s, h in venues["hallen"].items()}
    n_vereine = 0
    for z in tabelle_laden(cfg, "vereine_extra?select=verein,halle"):
        slug = nach_name.get(z.get("halle") or "")
        if not slug or not z.get("verein"):
            continue
        venues["vereine"][z["verein"]] = slug
        venues["orte"][z["verein"]] = slug
        n_vereine += 1
    manuell = []
    for z in tabelle_laden(cfg, "spiele_manuell?select=id,beginn,treffpunkt,liga,paarung,halle,hinweis,besetzung"):
        try:
            start = _zeit(z["beginn"])
        except (KeyError, ValueError, TypeError):
            continue
        besetzung = {"HSR": [], "(L)SR": []}
        for b in z.get("besetzung") or []:
            if not b.get("name"):
                continue
            (besetzung["HSR"] if b.get("rolle") == "HSR" else besetzung["(L)SR"]).append(b["name"])
        manuell.append({
            "start": start,
            "begegnung": ("%s: %s" % (z["liga"], z["paarung"])) if z.get("liga") else z.get("paarung", ""),
            "besetzung": besetzung,
            "manuell": {"id": z["id"], "halle": z.get("halle"), "hinweis": z.get("hinweis"),
                        "treffpunkt": z.get("treffpunkt")},
        })
    hinweise = {}
    for z in tabelle_laden(cfg, "hallen_notizen?select=halle,text&offiziell=eq.true&order=angelegt"):
        if z.get("halle") and z.get("text"):
            hinweise.setdefault(z["halle"], []).append(z["text"])
    if n_hallen or n_vereine or manuell or hinweise:
        print("Vom Betreiber: %d Hallen, %d Vereine, %d Spiele, %d Hallen-Hinweise."
              % (n_hallen, n_vereine, len(manuell), sum(len(v) for v in hinweise.values())))
    return manuell, hinweise


def sammle_personen(spiele, cfg, venues, jetzt, bevorzugt=frozenset(), gebuehren=None, korrekturen=None, hallen_hinweise=None):
    vorlauf = timedelta(minutes=cfg["vorlauf_minuten"])
    dauer = timedelta(minutes=cfg["spieldauer_minuten"])
    personen = {}
    uebersicht = []
    hallen_nach_name = {h["name"]: h for h in venues["hallen"].values()}
    hallen_hinweise = hallen_hinweise or {}

    for spiel in spiele:
        halle, heim, gast, sicher = finde_halle(spiel["begegnung"], venues)
        liga = spiel["begegnung"].split(":", 1)[0].strip() if ":" in spiel["begegnung"] else ""
        anstoss = spiel["start"]
        paarung = "%s – %s" % (heim, gast) if gast else heim
        besetzung = rollen_fuer(spiel["besetzung"])
        kennung = spiel_id(anstoss.isoformat(), spiel["begegnung"])
        # Kennung der App (Original-Beginn|Paarung) - darauf zeigen Korrekturen
        app_id = anstoss.isoformat() + "|" + paarung
        manuell = spiel.get("manuell")
        if manuell:
            app_id = "m:" + manuell["id"]
            if manuell.get("halle") in hallen_nach_name:
                halle, sicher = hallen_nach_name[manuell["halle"]], True
        korr = (korrekturen or {}).get(app_id)
        if manuell and manuell.get("hinweis") and not korr:
            korr = {"hinweis": manuell["hinweis"]}
        korrektur = None
        if korr:
            korrektur = {"halle": korr.get("halle") or None, "beginn": korr.get("beginn") or None,
                         "treffpunkt": korr.get("treffpunkt") or None, "hinweis": korr.get("hinweis") or None,
                         "abgesagt": bool(korr.get("abgesagt"))}
            if korrektur["halle"] and korrektur["halle"] in hallen_nach_name:
                halle, sicher = hallen_nach_name[korrektur["halle"]], True
            if korrektur["beginn"]:
                try:
                    anstoss = datetime.fromisoformat(korrektur["beginn"].replace("Z", "+00:00")).astimezone(spiel["start"].tzinfo)
                except ValueError:
                    pass
        treffpunkt = anstoss - vorlauf
        if manuell and manuell.get("treffpunkt"):
            try:
                treffpunkt = _zeit(manuell["treffpunkt"]).astimezone(anstoss.tzinfo)
            except ValueError:
                pass
        if korrektur and korrektur["treffpunkt"]:
            try:
                treffpunkt = datetime.fromisoformat(korrektur["treffpunkt"].replace("Z", "+00:00")).astimezone(spiel["start"].tzinfo)
            except ValueError:
                pass
        hinweise_halle = hallen_hinweise.get(halle["name"], []) if halle else []

        uebersicht.append({
            "kennung": kennung,
            "id": app_id,
            "manuell": bool(manuell),
            "korrektur": korrektur,
            "anstoss": anstoss,
            "treffpunkt": treffpunkt,
            "liga": liga,
            "paarung": paarung,
            "halle_name": halle["name"] if halle else "",
            "ort": "%s, %s" % (halle["name"], halle["adresse"]) if halle else "",
            "halle_erkannt": sicher,
            "system": len(besetzung),
            "besetzung": [{"name": n, "rolle": r, "schluessel": personen_schluessel(n)}
                          for n, r in besetzung],
            "vergangen": anstoss < jetzt,
        })

        for name, rolle in besetzung:
            schluessel = personen_schluessel(name)
            if not schluessel:
                continue
            eintrag = personen.setdefault(schluessel, {
                "schreibweisen": Counter(), "termine": [], "schluessel": schluessel})
            eintrag["schreibweisen"][name] += 1

            kollegen = [(n, r, personen_schluessel(n)) for n, r in besetzung
                        if personen_schluessel(n) != schluessel]
            zeilen = []
            if korrektur:
                if korrektur["abgesagt"]:
                    zeilen.append("!! ABGESAGT - laut Betreiber findet das Spiel nicht statt !!")
                teile = [t for t in (
                    ("Halle: " + korrektur["halle"]) if korrektur["halle"] else "",
                    ("Anstoß " + anstoss.strftime("%H:%M") + " Uhr") if korrektur["beginn"] else "",
                    ("Treffpunkt " + treffpunkt.strftime("%H:%M") + " Uhr") if korrektur["treffpunkt"] else "",
                    korrektur["hinweis"] or "") if t]
                if teile:
                    zeilen.append("Korrektur vom Betreiber: " + " · ".join(teile))
                zeilen.append("")
            zeilen += [
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
                zeilen += ["Hinweis zur Halle: %s" % hw for hw in hinweise_halle]
            else:
                zeilen.append("!! Halle nicht automatisch erkannt "
                              "- bitte selbst pruefen !!")
            if kollegen:
                zeilen.append("Gespann: %s" % " / ".join(
                    "%s (%s)" % (n, r) if len(besetzung) >= DREIER_SYSTEM_AB else n
                    for n, r, _ in kollegen))
            gebuehr = grundgebuehr(gebuehren, liga, rolle, len(besetzung))
            if gebuehr is not None:
                prozent = zeitzuschlag(gebuehren, anstoss)
                if prozent:
                    zeilen.append("Vergütung lt. Ordnung: %d € + %d %% Uhrzeit = %d €"
                                  % (gebuehr, prozent, round(gebuehr * (1 + prozent / 100.0))))
                else:
                    zeilen.append("Vergütung lt. Ordnung: %d €" % gebuehr)
            zeilen += ["", "Quelle: %s" % cfg["quelle"]]

            titel = "%s · %s · %s" % (rolle, liga, paarung) if liga \
                else "%s · %s" % (rolle, paarung)
            if korrektur and korrektur["abgesagt"]:
                titel = "ABGESAGT · " + titel

            if manuell:
                zeilen.append("Vom Betreiber angelegt (nicht auf esrw.de)")

            eintrag["termine"].append({
                "kennung": kennung,
                "id": app_id,
                "manuell": bool(manuell),
                "korrektur": korrektur,
                "titel": titel,
                "beschreibung": "\n".join(zeilen),
                "ort": "%s, %s" % (halle["name"], halle["adresse"]) if halle else "",
                "halle_name": halle["name"] if halle else "",
                "koordinaten": halle.get("koordinaten") if halle else None,
                "treffpunkt": treffpunkt,
                "anstoss": anstoss,
                "ende": anstoss + dauer,
                "rolle": rolle,
                "system": len(besetzung),
                "liga": liga,
                "paarung": paarung,
                "halle_erkannt": sicher,
                "gespann_roh": kollegen,
                "vergangen": anstoss < jetzt,
            })

    # Schreibweise, Slug und Kennung je Person festlegen
    slug_von = {}
    for schluessel, eintrag in personen.items():
        eintrag["name"] = waehle_schreibweise(eintrag["schreibweisen"], bevorzugt)
        eintrag["slug"] = slug_aus(eintrag["name"])
        slug_von[schluessel] = (eintrag["name"], eintrag["slug"])

    fertig = []
    for eintrag in personen.values():
        eintrag["termine"].sort(key=lambda t: t["treffpunkt"])
        pruefe_konflikte(eintrag["termine"], cfg)
        for t in eintrag["termine"]:
            t["uid"] = hashlib.sha1(
                ("%s|%s" % (t["kennung"], eintrag["slug"])).encode("utf-8")
            ).hexdigest() + "@esrw.de"
            # Gespann mit der endgueltigen Schreibweise und dem Slug des
            # Kollegen, damit die Webseite darauf verlinken kann
            t["gespann"] = [
                {"name": slug_von.get(k, (n, None))[0], "slug": slug_von.get(k, (n, None))[1],
                 "rolle": r}
                for n, r, k in t.pop("gespann_roh")]
            if t.get("hinweis"):
                t["beschreibung"] = "!! %s !!\n\n%s" % (t["hinweis"], t["beschreibung"])
        fertig.append({
            "slug": eintrag["slug"],
            "name": eintrag["name"],
            "schluessel": eintrag["schluessel"],
            "varianten": sorted(eintrag["schreibweisen"]),
            "termine": eintrag["termine"],
        })
    fertig.sort(key=lambda p: nkey(p["name"]))

    # Gesamtuebersicht mit aufgeloesten Namen
    for s in uebersicht:
        for b in s["besetzung"]:
            name, slug = slug_von.get(b.pop("schluessel"), (b["name"], None))
            b["name"], b["slug"] = name, slug
    uebersicht.sort(key=lambda s: s["anstoss"])
    return fertig, uebersicht


# ---------------------------------------------------------- Aenderungen

def _ohne_rolle(titel):
    """'SR · U13 · A – B' -> 'U13 · A – B'. Die Rolle steht immer vorn."""
    return titel.split(" · ", 1)[1] if " · " in titel else titel


def _rolle_aus(titel):
    return titel.split(" · ", 1)[0] if " · " in titel else ""


def inhalt_hash(titel, ort, treffpunkt_iso, rolle):
    """Fingerabdruck fuer die Aenderungserkennung. Die Rollenbezeichnung
    geht bewusst *nicht* ueber den Titel ein, sondern separat und nur, wenn
    sie eine der heutigen Kennungen ist. Sonst haette die Umstellung von
    '(L)SR' auf 'SR' jedem Kollegen an jeden Termin ein Warnzeichen
    gehaengt, obwohl der ESRW nichts geaendert hat."""
    rolle = rolle if rolle in ROLLEN else ""
    return hashlib.sha1(("%s|%s|%s|%s" % (
        _ohne_rolle(titel), ort, treffpunkt_iso, rolle)).encode("utf-8")).hexdigest()


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
    alte_rolle = _rolle_aus(vorher.get("titel", ""))
    neue_rolle = jetzt.get("rolle") or _rolle_aus(jetzt.get("titel", ""))
    if alte_rolle in ROLLEN and neue_rolle in ROLLEN and alte_rolle != neue_rolle:
        teile.append("Rolle (vorher %s)" % alte_rolle)
    if vorher.get("titel") and _ohne_rolle(vorher["titel"]) != _ohne_rolle(jetzt["titel"]):
        teile.append("Ansetzung")
    return ", ".join(teile) or "Angaben angepasst"


def verarbeite_aenderungen(personen, alt, stand, eigene_slugs):
    """Vergibt SEQUENCE, markiert frische Aenderungen und meldet, was fuer
    die eigenen Namen neu, geaendert oder entfallen ist."""
    neu_state, neue, geaendert, entfallen = {}, [], [], []
    alle_neu, alle_geaendert, alle_entfallen = {}, {}, {}
    heute = stand.date()

    for p in personen:
        ist_eigen = p["slug"] in eigene_slugs
        for t in p["termine"]:
            inhalt = inhalt_hash(t["titel"], t["ort"], t["treffpunkt"].isoformat(), t["rolle"])
            vorher = alt.get(t["uid"])
            geaendert_am = None
            t["stempel"] = stand

            # Den alten Fingerabdruck aus den gespeicherten Feldern neu rechnen
            # statt den gespeicherten Wert zu nehmen - so ueberlebt eine
            # Aenderung an der Hash-Formel, ohne dass alles als geaendert gilt.
            # Die Rolle zaehlt nur mit, wenn sie auf beiden Seiten eine der
            # heutigen Kennungen ist; alte Eintraege mit '(L)SR' vergleichen
            # sich sonst nie gleich.
            vorher_inhalt, vergleich = None, inhalt
            if vorher is not None:
                alte_rolle = _rolle_aus(vorher.get("titel", ""))
                if alte_rolle not in ROLLEN:
                    alte_rolle = ""
                    vergleich = inhalt_hash(t["titel"], t["ort"],
                                            t["treffpunkt"].isoformat(), "")
                vorher_inhalt = inhalt_hash(vorher.get("titel", ""), vorher.get("ort", ""),
                                            vorher.get("treffpunkt", ""), alte_rolle)

            korrektur_neu = (t.get("korrektur") or None) != (vorher.get("korrektur") or None) if vorher else False
            if vorher is None:
                t["sequence"] = 0
                if not t["vergangen"] and alt:
                    alle_neu.setdefault(p["slug"], []).append(t)
                    if ist_eigen:
                        neue.append(t)
            elif vorher_inhalt != vergleich or korrektur_neu:
                t["sequence"] = vorher.get("sequence", 0) + 1
                geaendert_am = heute.isoformat()
                t["aenderung"] = beschreibe_aenderung(vorher, t)
                if korrektur_neu:
                    k = t.get("korrektur") or {}
                    if k.get("abgesagt"):
                        t["aenderung"] = "Vom Betreiber abgesagt"
                    elif k:
                        t["aenderung"] = "Korrektur vom Betreiber: " + t["aenderung"] + ((" – " + k["hinweis"]) if k.get("hinweis") else "")
                    else:
                        t["aenderung"] = "Korrektur vom Betreiber zurückgenommen: " + t["aenderung"]
                if not t["vergangen"]:
                    alle_geaendert.setdefault(p["slug"], []).append(t)
                    if ist_eigen:
                        geaendert.append(t)
            else:
                t["sequence"] = vorher.get("sequence", 0)
                geaendert_am = vorher.get("geaendert_am")
                # Unveraendert: alten Zeitstempel behalten, damit die Datei
                # Byte fuer Byte gleich bleibt.
                try:
                    t["stempel"] = datetime.fromisoformat(vorher["stempel"])
                except (KeyError, TypeError, ValueError):
                    pass
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
                "stempel": t["stempel"].isoformat(),
                "korrektur": t.get("korrektur") or None,
            }

    # Was aus den Daten verschwunden ist und noch in der Zukunft lag, ist eine
    # Absetzung. Aeltere Eintraege fallen nur aus dem Rueckschau-Fenster.
    for uid, eintrag in alt.items():
        if uid in neu_state:
            continue
        try:
            beginn = datetime.fromisoformat(eintrag.get("beginn", ""))
        except ValueError:
            continue
        if beginn > stand:
            alle_entfallen.setdefault(eintrag.get("slug", ""), []).append(eintrag)
            if eintrag.get("slug") in eigene_slugs:
                entfallen.append(eintrag)

    # Fuer den Push-Versand (push_senden.py, laeuft im Workflow danach):
    # je Person, was sich getan hat. Liegt nicht in docs/, wird nicht committet.
    push = {}
    for slug in set(alle_neu) | set(alle_geaendert) | set(alle_entfallen):
        push[slug] = {
            "neu": ["%s Uhr – %s" % (kurz_datum(t["anstoss"]), t["titel"]) for t in alle_neu.get(slug, [])],
            "geaendert": ["%s Uhr – %s (%s)" % (kurz_datum(t["anstoss"]), t["titel"], t.get("aenderung", ""))
                          for t in alle_geaendert.get(slug, [])],
            "entfallen": ["%s Uhr – %s" % (kurz_datum(datetime.fromisoformat(e["beginn"])), e.get("titel", ""))
                          for e in alle_entfallen.get(slug, [])],
        }
    schreibe("aenderungen.json", {"stand": stand.isoformat(), "personen": push})

    # Aenderungsprotokoll fuer die Webseite: die letzten 14 Tage, alle Personen
    protokoll_pfad = os.path.join("docs", "protokoll.json")
    protokoll = lade(protokoll_pfad, []) or []
    namen = {p["slug"]: p["name"] for p in personen}
    for slug, a in push.items():
        for art in ("neu", "geaendert", "entfallen"):
            for text in a.get(art, []):
                protokoll.append({"stand": stand.isoformat(), "slug": slug, "name": namen.get(slug, slug), "art": art, "text": text})
    grenze = (stand - timedelta(days=14)).isoformat()
    protokoll = [e for e in protokoll if e.get("stand", "") >= grenze][-2000:]
    if push or not os.path.exists(os.path.join(BASIS, protokoll_pfad)):
        schreibe(protokoll_pfad, protokoll)

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


def meldung_ablegen(titel, text):
    """Schreibt die Meldung in eine Datei, aus der der Workflow ein
    GitHub-Issue macht. Das ist der Meldeweg, der ohne zusaetzliche App
    auskommt - GitHub verschickt fuer ein neues Issue von sich aus eine
    E-Mail. Nur aktiv, wenn MELDUNG_DATEI gesetzt ist."""
    pfad = os.environ.get("MELDUNG_DATEI", "").strip()
    if not pfad:
        return
    voll = os.path.join(BASIS, pfad)
    if titel is None:
        # Nichts zu melden - eine alte Datei darf nicht stehenbleiben,
        # sonst legt der Workflow beim naechsten Lauf dasselbe Issue nochmal an.
        if os.path.exists(voll):
            os.remove(voll)
        return
    with open(voll, "w", encoding="utf-8") as f:
        f.write("%s\n%s\n" % (titel, text))


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

    bevorzugt = aliase_laden(cfg)
    gebuehren = lade(os.path.join(cfg["ausgabe_verzeichnis"], "gebuehren.json"), {})
    korrekturen = korrekturen_laden(cfg)
    if korrekturen:
        print("%d Korrektur(en) vom Betreiber." % len(korrekturen))
    manuell, hallen_hinweise = betreiber_daten(cfg, venues)
    spiele += manuell
    personen, uebersicht = sammle_personen(spiele, cfg, venues, stand, bevorzugt, gebuehren, korrekturen, hallen_hinweise)
    print("%d Personen." % len(personen))

    unklar = sorted({t["paarung"] for p in personen for t in p["termine"]
                     if not t["halle_erkannt"]})
    for u in unklar:
        print("  ! Halle nicht erkannt: %s" % u, file=sys.stderr)
    konflikte = [(p["name"], t["hinweis"]) for p in personen for t in p["termine"]
                 if t.get("hinweis") and not t["vergangen"]]
    for name, hinweis in konflikte:
        print("  ! %s: %s" % (name, hinweis), file=sys.stderr)

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
    # Abgeschlossene Saisons einfrieren (docs/archiv/), Arbeitsdatei bleibt klein
    saison_index = saisonarchiv_einfrieren(historie, personen, stand)
    historie_alle = dict(saisonarchiv_laden())
    historie_alle.update(historie)
    stats, saison = statistik_aus_historie(historie_alle, stand)
    print("Archiv: %d Spiele insgesamt (%d neu, %d in Saison-Dateien), Saison %s."
          % (len(historie_alle), frisch, len(historie_alle) - len(historie), saison))

    try:
        archiv_in_db(historie_alle, uebersicht, personen, stand)
    except Exception as e:
        print("  ! Archiv nicht in die Datenbank geschrieben: %s" % str(e)[:120], file=sys.stderr)

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

    name_von = {p["schluessel"]: p["name"] for p in personen}

    def stat_fuer(p):
        s = stats.get(p["schluessel"])
        if not s:
            return None
        return {
            "gesamt": s["gesamt"], "saison": s["saison"],
            "rollen": dict(s["rollen"]),
            "ligen": s["ligen"].most_common(4),
            "hallen": s["hallen"].most_common(4),
            "partner": [(name_von.get(k, s["partner_namen"].get(k, k)), n)
                        for k, n in s["partner"].most_common(5)],
            "je_saison": sorted(s["je_saison"].items()),
            "erste": s["erste"], "letzte": s["letzte"],
        }

    daten = {
        "titel": cfg.get("titel", "Einteilungen"),
        "quelle": cfg["quelle"],
        "vorlauf_minuten": cfg["vorlauf_minuten"],
        "spiele_gesamt": len(gesehen),
        "saison": saison,
        "archiv_spiele": len(historie),
        "rollen": ROLLEN,
        "spieldauer_minuten": cfg["spieldauer_minuten"],
        # Koordinaten je Halle - die Webseite schaetzt daraus, wer in der
        # Naehe eines Spiels zu Hause ist (Tauschvorschlaege)
        "adressen": {h["name"]: h.get("adresse", "") for h in venues["hallen"].values()},
        "hallen": {h["name"]: h["koordinaten"] for h in venues["hallen"].values()
                   if h.get("koordinaten")},
        "personen": [{
            "slug": p["slug"],
            "name": p["name"],
            "varianten": p["varianten"],
            "statistik": stat_fuer(p),
            "spiele": [{
                "beginn": t["anstoss"].isoformat(),
                "treffpunkt": t["treffpunkt"].isoformat(),
                "rolle": t["rolle"],
                "system": t["system"],
                "liga": t["liga"],
                "paarung": t["paarung"],
                "ort": t["ort"],
                "halle": t["halle_name"],
                "koordinaten": t["koordinaten"],
                "gespann": t["gespann"],
                "halle_erkannt": t["halle_erkannt"],
                "vergangen": t["vergangen"],
                "aenderung": t.get("aenderung"),
                "hinweis": t.get("hinweis"),
                "id": t["id"],
                "korrektur": t.get("korrektur"),
                "manuell": t.get("manuell", False),
            } for t in p["termine"]],
        } for p in personen],
        # Gesamtuebersicht: jedes Spiel einmal, fuer den Spielplan nach Tagen
        "spiele": [{
            "beginn": s["anstoss"].isoformat(),
            "treffpunkt": s["treffpunkt"].isoformat(),
            "liga": s["liga"],
            "paarung": s["paarung"],
            "halle": s["halle_name"],
            "ort": s["ort"],
            "halle_erkannt": s["halle_erkannt"],
            "system": s["system"],
            "besetzung": s["besetzung"],
            "vergangen": s["vergangen"],
            "id": s["id"],
            "korrektur": s.get("korrektur"),
            "manuell": s.get("manuell", False),
        } for s in uebersicht],
        "hallen_hinweise": hallen_hinweise,
    }
    with open(os.path.join(ziel, "daten.json"), "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=1)

    # Saisonliste je Person aus dem Archiv - getrennt von daten.json, weil sie
    # ueber die Saison waechst und nur beim Aufklappen gebraucht wird.
    archiv = {}
    for p in personen:
        s = stats.get(p["schluessel"])
        if s and s["spiele_saison"]:
            archiv[p["slug"]] = sorted(s["spiele_saison"],
                                       key=lambda x: x["beginn"], reverse=True)
    saisons = sorted({e["saison"] for liste in archiv.values() for e in liste} | {i["saison"] for i in saison_index if i.get("saison")}, reverse=True)
    with open(os.path.join(ziel, "archiv.json"), "w", encoding="utf-8") as f:
        json.dump({"saison": saison, "saisons": saisons, "personen": archiv,
                   "dateien": {i["saison"]: i["datei"] for i in saison_index if i.get("saison")}},
                  f, ensure_ascii=False, separators=(",", ":"))

    # Der Zeitpunkt des Laufs steht bewusst in einer eigenen, winzigen Datei.
    # Sonst gaebe es allein deswegen bei jedem Lauf eine Aenderung an der
    # grossen daten.json - und damit alle 30 Minuten einen Commit.
    with open(os.path.join(ziel, "stand.json"), "w", encoding="utf-8") as f:
        json.dump({"stand": stand.isoformat(), "personen": len(personen),
                   "spiele": len(gesehen), "archiv": len(historie)},
                  f, ensure_ascii=False)

    schreibe("historie.json", historie)
    schreibe("state.json", neu_state)

    print("\n%d Feeds geschrieben nach %s/feeds/."
          % (len(personen) + 1, cfg["ausgabe_verzeichnis"]))
    if unklar:
        print("%d Begegnung(en) ohne erkannte Halle." % len(unklar))

    if neue or geaendert or entfallen:
        zeilen = []
        for t in neue:
            zeilen.append("Neu: %s Uhr – %s (Halle %s Uhr)" % (
                kurz_datum(t["anstoss"]), t["titel"],
                t["treffpunkt"].strftime("%H:%M")))
        for t in geaendert:
            zeilen.append("Geändert (%s): %s Uhr – %s" % (
                t.get("aenderung", "?"), kurz_datum(t["anstoss"]), t["titel"]))
        for e in entfallen:
            zeilen.append("Abgesetzt: %s Uhr – %s" % (
                kurz_datum(datetime.fromisoformat(e["beginn"])), e.get("titel", "")))

        teile = []
        if neue:
            teile.append("%d neu" % len(neue))
        if geaendert:
            teile.append("%d geändert" % len(geaendert))
        if entfallen:
            teile.append("%d abgesetzt" % len(entfallen))
        titel = "Einteilung: " + ", ".join(teile)
        text = "\n".join(zeilen)

        melde(text, titel)
        meldung_ablegen(titel, text)
        print("Benachrichtigung: %s." % ", ".join(teile))
    else:
        meldung_ablegen(None, None)


if __name__ == "__main__":
    main()
