#!/usr/bin/env python3
"""
Regressionstest. Laeuft ohne Netz gegen eine eingefrorene Beispielseite und
faellt auf, wenn der Umbau von esrw.de oder eine Aenderung am Skript das
Auslesen kaputt macht.

    python tests/test_esrw.py

Kein pytest noetig. Rueckgabewert ungleich 0, wenn etwas nicht stimmt.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HIER))

import esrw_ical as E  # noqa: E402

FEHLER = []


def pruefe(bedingung, beschreibung, zusatz=""):
    if bedingung:
        print("  ok   %s" % beschreibung)
    else:
        print("  FEHL %s %s" % (beschreibung, zusatz))
        FEHLER.append(beschreibung)


def beispielseite():
    with open(os.path.join(HIER, "beispielseite.html"), encoding="utf-8") as f:
        return f.read()


# ------------------------------------------------------------------- Parsing

def test_parsen():
    print("\nSeite auslesen")
    spiele = E.parse_seite(beispielseite())
    pruefe(len(spiele) == 7, "sieben Zeilen gefunden", "(%d)" % len(spiele))
    if not spiele:
        return

    erstes = spiele[0]
    pruefe(erstes["start"].tzinfo is not None, "Zeitzone am Datum vorhanden")
    pruefe(erstes["start"].hour == 18, "Uhrzeit richtig gelesen",
           "(%s)" % erstes["start"])
    pruefe("EV Duisburg" in erstes["begegnung"], "Begegnung gelesen")
    pruefe("Marks, Marcel" in erstes["besetzung"]["(L)SR"],
           "Linienrichter gelesen", "(%s)" % erstes["besetzung"])
    pruefe(all("<" not in n for s in spiele
               for liste in s["besetzung"].values() for n in liste),
           "keine HTML-Reste in den Namen")
    # &quot; im Quelltext muss als " ankommen
    kec = [s for s in spiele if "Haie" in s["begegnung"]]
    pruefe(kec and '"' in kec[0]["begegnung"], "HTML-Entities aufgeloest")


# ------------------------------------------------------------ Hallen-Findung

def test_hallen():
    print("\nHalle bestimmen")
    venues = E.lade("venues.json")
    erwartet = [
        ("U13 RLB: EV Duisburg - Düsseldorfer EG 1b",
         "PreZero Rheinlandhalle Duisburg", "Heimverein"),
        ("RL FS: Ratinger Ice Aliens - Herner EV in Essen !!!",
         "Eissporthalle Essen-West", "'in Essen' schlaegt Heimverein"),
        ("U17 RL: Herforder EV - Lippe Hockey Hamm Herford",
         "Eishalle Im Kleinen Felde", "Ortshinweis hinter dem Gast"),
        ("U17 FS: Herner EV - Eisadler Dortmund",
         "Gysenberghalle Herne", "'Dortmund' ist hier Vereinsname, kein Ort"),
        ("BL FS: Herner EV 1b - EHC Essen Ruhr",
         "Emscher-Lippe-Halle Gelsenkirchen", "1b hat eigene Halle"),
        ("U11 RL: Kölner Junghaie - Kölnarena 2",
         "Kölnarena 2", "Halle steht an Gaststelle"),
        ("U9 RL: Düsseldorfer EG - Brehmstraße",
         "Eishalle Brehmstraße", "Hallenname an Gaststelle"),
        ("U15 RLB: Iserlohner EC 1b - Düsseldorfer EG 1b",
         "Eissporthalle am Seilersee", "Mannschafts-Zusatz wird ignoriert"),
    ]
    for begegnung, halle_soll, warum in erwartet:
        halle, heim, gast, erkannt = E.finde_halle(begegnung, venues)
        ist = halle["name"] if halle else "(keine)"
        pruefe(ist == halle_soll, "%s: %s" % (warum, halle_soll), "-> %s" % ist)

    # Ohne Ortsangabe darf nichts erfunden werden
    halle, _, _, erkannt = E.finde_halle("DA FS: NEV/BW - Sachsen/Berlin", venues)
    pruefe(halle is None and not erkannt, "ohne Ort wird keine Halle geraten")

    # Jede Halle braucht Adresse und Koordinaten
    ohne_adresse = [s for s, h in venues["hallen"].items() if not h.get("adresse")]
    ohne_geo = [s for s, h in venues["hallen"].items() if not h.get("koordinaten")]
    pruefe(not ohne_adresse, "alle Hallen haben eine Adresse", str(ohne_adresse))
    pruefe(not ohne_geo, "alle Hallen haben Koordinaten", str(ohne_geo))

    # Jeder Verein muss auf eine existierende Halle zeigen
    fehlend = sorted({z for z in list(venues["vereine"].values())
                      + list(venues["orte"].values())
                      if z not in venues["hallen"]})
    pruefe(not fehlend, "alle Verweise zeigen auf bekannte Hallen", str(fehlend))


# --------------------------------------------------------------------- Namen

def test_namen():
    print("\nNamen zusammenfassen")
    gleich = [
        ("Keller, Alexander", "Keller Alexander", "Komma egal"),
        ("Keller, Alexander", "Alexander Keller", "Reihenfolge egal"),
        ("Heyer, Christoph (N)", "Heyer, Christoph", "Klammerzusatz egal"),
        ("Müller, Lars ", "müller, lars", "Gross/klein und Leerzeichen egal"),
        ("Garbsch, René", "Garbsch, Rene", "Akzent egal"),
    ]
    for a, b, warum in gleich:
        pruefe(E.personen_schluessel(a) == E.personen_schluessel(b),
               "%s (%s = %s)" % (warum, a, b))

    verschieden = [("Heffler, Philipp", "Heffler, Zsolt"),
                   ("Zynda, Jayden", "Zynda, Nick"),
                   ("Rieneck, Julian", "Rieneck, Maximilian")]
    for a, b in verschieden:
        pruefe(E.personen_schluessel(a) != E.personen_schluessel(b),
               "bleiben getrennt: %s / %s" % (a, b))

    pruefe(E.slug_aus("Schöche, Gian-Carlo") == "schoeche-gian-carlo",
           "Slug mit Umlaut und Bindestrich",
           "(%s)" % E.slug_aus("Schöche, Gian-Carlo"))
    pruefe(E.waehle_schreibweise({"Keller Alexander": 1, "Keller, Alexander": 1})
           == "Keller, Alexander", "Schreibweise mit Komma wird bevorzugt")


# ----------------------------------------------------------------- iCalendar

def test_faltung():
    print("\nZeilen falten (RFC 5545)")
    schlecht = 0
    for n in range(1, 300):
        for fuell in ("ü", "äöü", "xüx", "Straße", "😀"):
            text = "DESCRIPTION:" + (fuell * n)[:n]
            gefaltet = E.falte(text)
            if gefaltet.replace("\r\n ", "") != text:
                schlecht += 1
            if any(len(z.encode("utf-8")) > 75 for z in gefaltet.split("\r\n")):
                schlecht += 1
    pruefe(schlecht == 0, "Falten ist verlustfrei und haelt 75 Oktette ein",
           "(%d Faelle)" % schlecht)


def test_escape():
    print("\nSonderzeichen maskieren")
    pruefe(E.escape("a,b") == r"a\,b", "Komma maskiert")
    pruefe(E.escape("a;b") == r"a\;b", "Semikolon maskiert")
    pruefe(E.escape("a\nb") == r"a\nb", "Zeilenumbruch maskiert")
    pruefe(E.escape("a\\b") == r"a\\b", "Backslash maskiert")


def test_ics():
    print("\niCalendar bauen")
    cfg = E.lade("config.json")
    venues = E.lade("venues.json")
    jetzt = datetime.now(timezone.utc)
    spiele = E.parse_seite(beispielseite())
    personen = E.sammle_personen(spiele, cfg, venues, jetzt)
    pruefe(len(personen) > 0, "Personen aus der Beispielseite gebildet")

    person = personen[0]
    for t in person["termine"]:
        t["sequence"] = 0
    ics = E.baue_ics(person["termine"], "Test", cfg, jetzt)

    entfaltet = [z for z in ics.replace("\r\n ", "").split("\r\n") if z]
    pruefe(entfaltet[0] == "BEGIN:VCALENDAR" and entfaltet[-1] == "END:VCALENDAR",
           "Rahmen stimmt")
    pruefe(sum(z.startswith("BEGIN:") for z in entfaltet)
           == sum(z.startswith("END:") for z in entfaltet),
           "BEGIN und END sind ausgeglichen")
    pruefe(all(len(z.encode("utf-8")) <= 75 for z in ics.split("\r\n")),
           "keine Zeile laenger als 75 Oktette")
    pruefe(ics.endswith("\r\n") and "\r\n" in ics, "Zeilenenden sind CRLF")
    pruefe(any(z.startswith("GEO:") for z in entfaltet), "Koordinaten enthalten")
    pruefe(any(z.startswith("X-APPLE-STRUCTURED-LOCATION") for z in entfaltet),
           "Apple-Ortsangabe enthalten")

    # Treffpunkt liegt vor dem Anstoss, Ende dahinter
    termin = person["termine"][0]
    pruefe(termin["anstoss"] - termin["treffpunkt"]
           == timedelta(minutes=cfg["vorlauf_minuten"]),
           "Treffpunkt liegt %d Minuten vor Anstoss" % cfg["vorlauf_minuten"])
    pruefe(termin["ende"] > termin["anstoss"], "Ende liegt hinter dem Anstoss")

    # Vergangene Termine bekommen keine Erinnerung
    alt = dict(termin)
    alt.update(vergangen=True, sequence=0)
    pruefe("BEGIN:VALARM" not in E.baue_ics([alt], "Test", cfg, jetzt),
           "vergangene Termine ohne Erinnerung")
    neu = dict(termin)
    neu.update(vergangen=False, sequence=0)
    pruefe("BEGIN:VALARM" in E.baue_ics([neu], "Test", cfg, jetzt),
           "kuenftige Termine mit Erinnerung")

    # Aenderungen werden markiert
    markiert = dict(neu)
    markiert["aenderung"] = "Zeit (vorher 18:00 Uhr)"
    text = E.baue_ics([markiert], "Test", cfg, jetzt)
    pruefe("⚠" in text and "Geändert" in text, "Aenderung wird markiert")


# ------------------------------------------------------------------ Sonstiges

def test_saison():
    print("\nSaison bestimmen")
    faelle = [(datetime(2026, 9, 10), "2026/27"), (datetime(2026, 12, 31), "2026/27"),
              (datetime(2027, 1, 2), "2026/27"), (datetime(2027, 3, 30), "2026/27"),
              (datetime(2027, 7, 1), "2027/28")]
    for zeitpunkt, soll in faelle:
        ist = E.saison_von(zeitpunkt)
        pruefe(ist == soll, "%s -> %s" % (zeitpunkt.date(), soll), "(%s)" % ist)


def test_aenderungstext():
    print("\nAenderung beschreiben")
    jetzt = {"treffpunkt": datetime(2026, 9, 10, 17, 0, tzinfo=timezone.utc),
             "ort": "Halle A, Weg 1", "titel": "HSR · Spiel"}
    vorher = {"treffpunkt": "2026-09-10T16:00:00+00:00",
              "ort": "Halle A, Weg 1", "titel": "HSR · Spiel"}
    pruefe("Zeit" in E.beschreibe_aenderung(vorher, jetzt), "Zeitaenderung erkannt")
    vorher2 = dict(vorher, treffpunkt="2026-09-10T17:00:00+00:00", ort="Halle B, Weg 2")
    pruefe("Halle" in E.beschreibe_aenderung(vorher2, jetzt), "Hallenwechsel erkannt")


def main():
    print("Regressionstest esrw_ical")
    for test in (test_parsen, test_hallen, test_namen, test_faltung,
                 test_escape, test_ics, test_saison, test_aenderungstext):
        test()
    print("\n" + "-" * 58)
    if FEHLER:
        print("%d Pruefung(en) fehlgeschlagen:" % len(FEHLER))
        for f in FEHLER:
            print("  - %s" % f)
        return 1
    print("Alle Pruefungen bestanden.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
