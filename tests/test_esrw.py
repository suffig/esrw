#!/usr/bin/env python3
"""
Regressionstest. Laeuft ohne Netz gegen eine eingefrorene Beispielseite und
faellt auf, wenn der Umbau von esrw.de oder eine Aenderung am Skript das
Auslesen kaputt macht.

    python tests/test_esrw.py

Kein pytest noetig. Rueckgabewert ungleich 0, wenn etwas nicht stimmt.
"""

import json
import os
import re
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
           "Spalte (L)SR gelesen", "(%s)" % erstes["besetzung"])
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
        ("RL FS: Ratinger Ice Aliens - Chiefs Leuwen Düsseldorf !!!",
         "Eishalle Brehmstraße", "unbekannter Gast: Ort steht hinten dran"),
        ("RL FS: Ratinger Ice Aliens - Chiefs Leuwen",
         "Eissporthalle Ratingen", "unbekannter Gast ohne Ort: Heimverein"),
        ("RL FS: Neusser EV - ESV Bergisch Gladbach",
         "Eissporthalle Neuss", "unbekannter Gast mit Ortsnamen, ohne '!': Heimverein"),
        ("RL FS: Dinslakener Kobras - ESV Grizzlys Bergkamen",
         "Eissporthalle Dinslaken", "Ortsname im Gastverein ist kein Spielort"),
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
    personen, uebersicht = E.sammle_personen(spiele, cfg, venues, jetzt)
    pruefe(len(uebersicht) == len(spiele), "Gesamtuebersicht enthaelt jedes Spiel einmal")
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

    # Ohne inhaltliche Aenderung muss die Datei Byte fuer Byte gleich bleiben,
    # sonst committet der Workflow alle 30 Minuten saemtliche Feeds.
    fest = dict(neu)
    fest["stempel"] = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)
    spaeter = jetzt + timedelta(hours=5)
    pruefe(E.baue_ics([fest], "Test", cfg, jetzt)
           == E.baue_ics([fest], "Test", cfg, spaeter),
           "gleicher Inhalt ergibt gleiche Datei, egal wann gebaut wird")
    pruefe("DTSTAMP:20260901T120000Z" in E.baue_ics([fest], "Test", cfg, jetzt),
           "DTSTAMP kommt vom letzten Wechsel, nicht vom Lauf")


# ------------------------------------------------------------------ Sonstiges


def test_rollen():
    print("\nRollen bestimmen")
    zwei = {"HSR": [], "(L)SR": ["A, B", "C, D"]}
    drei = {"HSR": ["H, H"], "(L)SR": ["A, B", "C, D"]}
    vier = {"HSR": ["H, H", "I, I"], "(L)SR": ["A, B", "C, D"]}
    pruefe([r for _, r in E.rollen_fuer(zwei)] == ["SR", "SR"],
           "Zwei-Mann-System: beide Schiedsrichter")
    pruefe([r for _, r in E.rollen_fuer(drei)] == ["HSR", "LSR", "LSR"],
           "Drei-Mann-System: Haupt- und Linienrichter")
    pruefe([r for _, r in E.rollen_fuer(vier)] == ["HSR", "HSR", "LSR", "LSR"],
           "Vier-Mann-System: zwei Haupt-, zwei Linienrichter")
    pruefe(all(r in E.ROLLEN for r in ("SR", "HSR", "LSR")), "alle Rollen haben Klartext")


def test_aliase():
    print("\nGleiche Personen zusammenfuehren")
    E.aliase_laden({"gleiche_personen": [["Melchert, Philip", "Melchert, Philipp"]]})
    try:
        pruefe(E.personen_schluessel("Melchert, Philipp") == E.personen_schluessel("Melchert, Philip"),
               "Philip und Philipp sind eine Person")
        pruefe(E.personen_schluessel("Melchert, Philipp") == E.personen_schluessel("Philip Melchert"),
               "auch in anderer Reihenfolge")
        pruefe(E.personen_schluessel("Heffler, Philipp") != E.personen_schluessel("Melchert, Philip"),
               "andere Nachnamen bleiben getrennt")
        gewaehlt = E.waehle_schreibweise({"Melchert, Philipp": 5, "Melchert, Philip": 1},
                                         bevorzugt={"Melchert, Philip"})
        pruefe(gewaehlt == "Melchert, Philip",
               "die konfigurierte Schreibweise gewinnt, auch wenn sie seltener ist")
    finally:
        E.aliase_laden({})


def test_konflikte():
    print("\nKonflikte erkennen")
    from datetime import datetime, timedelta, timezone
    cfg = E.lade("config.json")
    t0 = datetime(2026, 9, 20, 18, 0, tzinfo=timezone.utc)
    dauer = timedelta(minutes=cfg["spieldauer_minuten"])
    vorlauf = timedelta(minutes=cfg["vorlauf_minuten"])

    def termin(anstoss, halle, paarung):
        return {"anstoss": anstoss, "treffpunkt": anstoss - vorlauf, "ende": anstoss + dauer,
                "halle_name": halle, "paarung": paarung}

    # Zwei Spiele hintereinander in derselben Halle: normal, kein Hinweis
    a, b = termin(t0, "Halle X", "A – B"), termin(t0 + timedelta(hours=2), "Halle X", "C – D")
    E.pruefe_konflikte([a, b], cfg)
    pruefe("hinweis" not in a and "hinweis" not in b, "gleiche Halle nacheinander: kein Hinweis")

    # Zwei Spiele in verschiedenen Hallen, das zweite beginnt zu frueh
    a, b = termin(t0, "Halle X", "A – B"), termin(t0 + timedelta(minutes=90), "Halle Y", "C – D")
    E.pruefe_konflikte([a, b], cfg)
    pruefe("hinweis" in a and "90 Min" in a["hinweis"], "andere Halle, zu knapp: Hinweis mit Minuten")

    # Verschiedene Hallen mit genug Abstand
    a, b = termin(t0, "Halle X", "A – B"), termin(t0 + timedelta(hours=5), "Halle Y", "C – D")
    E.pruefe_konflikte([a, b], cfg)
    pruefe("hinweis" not in a, "andere Halle, genug Zeit: kein Hinweis")

    # Gleichzeitig
    a, b = termin(t0, "Halle X", "A – B"), termin(t0, "Halle Y", "C – D")
    E.pruefe_konflikte([a, b], cfg)
    pruefe("Gleichzeitig" in a.get("hinweis", ""), "gleiche Anstosszeit: Hinweis")


def test_hash_migration():
    print("\nAenderungserkennung bei Umbenennung der Rollen")
    alt = E.inhalt_hash("(L)SR · U13 · A – B", "Halle", "2026-09-20T17:00:00+02:00", "")
    neu_ohne = E.inhalt_hash("SR · U13 · A – B", "Halle", "2026-09-20T17:00:00+02:00", "")
    pruefe(alt == neu_ohne, "alte Bezeichnung (L)SR und neue SR ergeben denselben Fingerabdruck")
    zeit = E.inhalt_hash("SR · U13 · A – B", "Halle", "2026-09-20T18:00:00+02:00", "SR")
    basis = E.inhalt_hash("SR · U13 · A – B", "Halle", "2026-09-20T17:00:00+02:00", "SR")
    pruefe(zeit != basis, "eine echte Zeitaenderung wird weiterhin erkannt")
    rolle = E.inhalt_hash("HSR · U13 · A – B", "Halle", "2026-09-20T17:00:00+02:00", "HSR")
    pruefe(rolle != basis, "ein echter Rollenwechsel SR -> HSR wird erkannt")


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



def test_ausgaben():
    print("\nAusgelieferte Dateien")
    import glob, json
    wurzel = os.path.dirname(HIER)
    marker = ("<<<<<<< ", "=======", ">>>>>>> ")
    dateien = (glob.glob(os.path.join(wurzel, "docs", "*.json"))
               + glob.glob(os.path.join(wurzel, "docs", "feeds", "*.ics"))
               + [os.path.join(wurzel, n) for n in ("state.json", "historie.json")
                  if os.path.exists(os.path.join(wurzel, n))])
    kaputt = []
    for pfad in dateien:
        with open(pfad, encoding="utf-8", newline="") as f:
            inhalt = f.read()
        if any(zeile.startswith(marker) for zeile in inhalt.split(chr(10))):
            kaputt.append(os.path.relpath(pfad, wurzel) + " (Konfliktmarker)")
            continue
        if pfad.endswith(".json"):
            try:
                json.loads(inhalt)
            except ValueError as e:
                kaputt.append("%s (%s)" % (os.path.relpath(pfad, wurzel), e))
    pruefe(len(dateien) > 0, "Ausgaben vorhanden (%d Dateien)" % len(dateien))
    pruefe(not kaputt, "keine Konfliktmarker, alle JSON-Dateien gueltig",
           str(kaputt[:3]))

def test_saisonarchiv():
    """Abgeschlossene Saisons wandern in docs/archiv/<saison>.json und
    kommen fuer die Statistik unveraendert zurueck."""
    print("\nSaison-Archiv")
    import tempfile
    alt_basis = E.BASIS
    with tempfile.TemporaryDirectory() as tmp:
        E.BASIS = tmp
        try:
            historie = {
                "a": {"beginn": "2025-10-04T18:00:00+02:00", "begegnung": "U15: A - B", "liga": "U15", "paarung": "A – B",
                      "halle": "Halle X", "besetzung": {"HSR": [], "(L)SR": ["Muster, Max", "Beispiel, Bea"]}},
                "b": {"beginn": "2026-09-10T18:00:00+02:00", "begegnung": "U17: C - D", "liga": "U17", "paarung": "C – D",
                      "halle": "Halle Y", "besetzung": {"HSR": ["Muster, Max"], "(L)SR": ["Beispiel, Bea", "Dritte, Dora"]}},
            }
            personen = [{"schluessel": E.personen_schluessel("Muster, Max"), "slug": "muster-max"}]
            stand = datetime(2026, 9, 19, 12, 0, tzinfo=timezone.utc)
            index = E.saisonarchiv_einfrieren(historie, personen, stand)
            pruefe(list(historie.keys()) == ["b"], "laufende Saison bleibt in historie.json", str(list(historie.keys())))
            pruefe(index and index[0]["saison"] == "2025/26" and index[0]["spiele"] == 1, "Index nennt die eingefrorene Saison", str(index))
            zurueck = E.saisonarchiv_laden()
            e = zurueck.get("2025-10-04T18:00:00+02:00|A – B")
            pruefe(e is not None and e["besetzung"]["(L)SR"] == ["Muster, Max", "Beispiel, Bea"], "eingefrorene Saison kommt vollstaendig zurueck", str(e))
            # Zweiter Lauf: nichts geht verloren, nichts doppelt
            E.saisonarchiv_einfrieren(historie, personen, stand)
            pruefe(len(E.saisonarchiv_laden()) == 1, "zweiter Lauf aendert nichts")
            stats, _ = E.statistik_aus_historie(dict(E.saisonarchiv_laden(), **historie), stand)
            st = stats[E.personen_schluessel("Muster, Max")]
            pruefe(st["gesamt"] == 2 and st["saison"] == 1 and len(st["spiele_saison"]) == 1, "Statistik zaehlt alle Saisons, Liste nur die laufende", str((st["gesamt"], st["saison"], len(st["spiele_saison"]))))
            # Wochentage zaehlen ueber alle Saisons, sonst saehe man nach
            # einem Jahr nichts
            tage = [st["wochentage"].get(i, 0) for i in range(7)]
            pruefe(sum(tage) == 2, "Wochentage zaehlen jedes Spiel", str(tage))
        finally:
            E.BASIS = alt_basis


def test_ehemalige():
    """Wer gerade kein Spiel hat, faellt trotzdem nicht aus der Liste -
    sonst waere er in der App weg und sein Kalender-Abo gleich mit."""
    print("\nKollegen ohne aktuelles Spiel")
    E = esrw_ical_modul()
    personen = [{"slug": "muster-max", "name": "Muster, Max",
                 "schluessel": E.personen_schluessel("Muster, Max"),
                 "varianten": ["Muster, Max"], "termine": [{}]}]
    stats = {
        E.personen_schluessel("Muster, Max"): {"schreibweisen": {"Muster, Max": 3}},
        E.personen_schluessel("Alt, Anna"): {"schreibweisen": {"Alt, Anna": 2, "Alt, A.": 1}},
    }
    dazu = E.ergaenze_ehemalige(personen, stats)
    slugs = [x["slug"] for x in personen]
    pruefe(dazu == 1, "genau ein Kollege kommt dazu", str(dazu))
    pruefe(slugs == ["alt-anna", "muster-max"], "alphabetisch einsortiert", str(slugs))
    anna = [x for x in personen if x["slug"] == "alt-anna"][0]
    pruefe(anna["termine"] == [] and anna["ehemals"] is True, "ohne Termine und als ehemalig gekennzeichnet")
    pruefe(anna["name"] == "Alt, Anna", "haeufigste Schreibweise gewinnt", anna["name"])
    # Zweiter Lauf traegt nichts doppelt ein
    pruefe(E.ergaenze_ehemalige(personen, stats) == 0, "zweiter Lauf aendert nichts")
    # Der Kalender bleibt bestehen, nur eben leer - sonst reisst das Abo ab
    cfg = {"erinnerung_minuten": 60, "kalender_refresh": "PT1H"}
    ics = E.baue_ics([], "Einteilungen - Alt, Anna", cfg,
                     datetime(2026, 9, 27, 18, 0, tzinfo=timezone.utc))
    pruefe(ics.startswith("BEGIN:VCALENDAR") and "VEVENT" not in ics,
           "leerer Kalender bleibt ein gueltiger Kalender")


def test_gespannwechsel():
    """Wechselt ein Kollege, steht das als vorher/nachher im Protokoll -
    aber nur, wenn das Gedaechtnis das alte Gespann schon kannte."""
    print("\nGespannwechsel")
    jetzt = {"treffpunkt": datetime(2026, 9, 10, 17, 0, tzinfo=timezone.utc),
             "anstoss": datetime(2026, 9, 10, 18, 0, tzinfo=timezone.utc),
             "ort": "Halle A, Weg 1", "titel": "HSR \u00b7 Spiel",
             "gespann": [{"name": "Neu, Nina", "slug": "neu-nina", "rolle": "SR"}]}
    basis = {"treffpunkt": "2026-09-10T17:00:00+00:00", "beginn": "2026-09-10T18:00:00+00:00",
             "ort": "Halle A, Weg 1", "titel": "HSR \u00b7 Spiel"}
    ohne = dict(basis)
    pruefe(E.gespann_wechsel(ohne, jetzt) == ("", ""), "ohne Gedaechtnis kein Wechsel")
    alt = dict(basis, gespann="SR:Alt, Anton")
    raus, rein = E.gespann_wechsel(alt, jetzt)
    pruefe(raus == "Alt, Anton (SR)" and rein == "Neu, Nina (SR)", "Wechsel mit vorher/nachher", str((raus, rein)))
    gleich = dict(basis, gespann=E.gespann_kurz(jetzt))
    pruefe(E.gespann_wechsel(gleich, jetzt) == ("", ""), "gleiches Gespann meldet nichts")
    dazu = dict(basis, gespann="")
    pruefe(E.gespann_wechsel(dazu, jetzt) == ("", "Neu, Nina (SR)"), "Kollege kommt dazu")
    felder = E.aenderungs_details(alt, jetzt)
    pruefe(any(f["feld"] == "Gespann" and f["vorher"] == "Alt, Anton (SR)" for f in felder),
           "Gespann steht in den Details", str(felder))
    pruefe("Gespann" in E.beschreibe_aenderung(alt, jetzt), "Kurztext nennt das Gespann")


def test_korrektur_uid():
    """Eine Korrektur verschiebt Anstoss und Halle - Kennung und UID bleiben,
    damit im Kalender kein zweiter Termin entsteht."""
    print("\nKorrektur: Kennung bleibt")
    cfg = {"vorlauf_minuten": 60, "spieldauer_minuten": 150, "quelle": "http://x", "ausgabe_verzeichnis": "docs"}
    venues = E.lade("venues.json")
    start = datetime(2026, 11, 7, 18, 30, tzinfo=timezone(timedelta(hours=1)))
    spiel = {"start": start, "begegnung": "U15 FS: EHC Essen Ruhr - Herner EV",
             "besetzung": {"HSR": [], "(L)SR": ["Muster, Max"]}}
    jetzt = datetime(2026, 11, 1, tzinfo=timezone.utc)
    ohne, u1 = E.sammle_personen([dict(spiel)], cfg, venues, jetzt)
    app_id = u1[0]["id"]
    korr = {app_id: {"beginn": "2026-11-07T20:00:00+01:00", "halle": "Eissporthalle Dinslaken"}}
    mit, u2 = E.sammle_personen([dict(spiel)], cfg, venues, jetzt, korrekturen=korr)
    pruefe(u1[0]["kennung"] == u2[0]["kennung"], "Kennung bleibt trotz Korrektur gleich")
    pruefe(u2[0]["id"] == app_id, "App-Kennung bleibt gleich")
    pruefe(u2[0]["anstoss"].hour == 20 and u2[0]["halle_name"] == "Eissporthalle Dinslaken", "Korrektur greift",
           str((u2[0]["anstoss"], u2[0]["halle_name"])))
    t1 = ohne[0]["termine"][0]
    t2 = mit[0]["termine"][0]
    pruefe(t1["kennung"] == t2["kennung"], "Termin-Kennung (Basis der UID) bleibt gleich")


def test_besetzung_korrektur():
    """Aendert der Betreiber das Gespann, gewinnt das gegen esrw.de -
    sonst waere die Korrektur beim naechsten Lauf wieder weg."""
    print("\nGespann vom Betreiber")
    E = esrw_ical_modul()
    venues = json.load(open(os.path.join(os.path.dirname(HIER), "venues.json"), encoding="utf-8"))
    beginn = datetime(2026, 10, 4, 18, 0, tzinfo=timezone.utc)
    spiel = {"start": beginn, "begegnung": "U15 LL: EHC Essen Ruhr - Herforder EV",
             "besetzung": {"HSR": [], "(L)SR": ["Alt, Anton", "Alt, Berta"]}}
    halle, heim, gast, _ = E.finde_halle(spiel["begegnung"], venues)
    paarung = "%s – %s" % (heim, gast) if gast else heim
    kennung = beginn.isoformat() + "|" + paarung
    korr = {kennung: {"besetzung": [{"name": "Neu, Nina", "rolle": "SR"}, {"name": "Neu, Nils", "rolle": "SR"}]}}
    n = E.besetzung_korrigieren([spiel], korr, venues)
    pruefe(n == 1, "ein Spiel umbesetzt", str(n))
    pruefe(E.rollen_fuer(spiel["besetzung"]) == [("Neu, Nina", "SR"), ("Neu, Nils", "SR")],
           "das neue Gespann steht drin", str(spiel["besetzung"]))
    # Ohne Korrektur bleibt alles, wie es von esrw.de kommt
    spiel2 = {"start": beginn, "begegnung": spiel["begegnung"], "besetzung": {"HSR": [], "(L)SR": ["Alt, Anton"]}}
    pruefe(E.besetzung_korrigieren([spiel2], {}, venues) == 0, "ohne Korrektur aendert sich nichts")
    # Rueckwirkend: das Archiv weiss nichts von esrw.de, also muss die
    # Korrektur auch dort greifen - sonst steht das Spiel bei dem, der
    # gar nicht mehr eingeteilt ist, weiter in Abrechnung und Statistik.
    historie = {"x": {"beginn": beginn.isoformat(), "paarung": paarung,
                      "besetzung": {"HSR": [], "(L)SR": ["Alt, Anton", "Alt, Berta"]}}}
    n2 = E.historie_umbesetzen(historie, korr)
    pruefe(n2 == 1, "ein Archiveintrag umbesetzt", str(n2))
    pruefe(historie["x"]["besetzung"]["(L)SR"] == ["Neu, Nina", "Neu, Nils"],
           "das Archiv kennt das neue Gespann", str(historie["x"]["besetzung"]))
    pruefe(E.historie_umbesetzen(historie, korr) == 0, "zweiter Lauf aendert nichts mehr")
    # Drei Offizielle: HSR bleibt HSR
    korr3 = {kennung: {"besetzung": [{"name": "Chef, Carla", "rolle": "HSR"},
                                     {"name": "Linie, Lea", "rolle": "LSR"},
                                     {"name": "Linie, Leo", "rolle": "LSR"}]}}
    spiel3 = {"start": beginn, "begegnung": spiel["begegnung"], "besetzung": {"HSR": [], "(L)SR": []}}
    E.besetzung_korrigieren([spiel3], korr3, venues)
    pruefe(E.rollen_fuer(spiel3["besetzung"])[0] == ("Chef, Carla", "HSR"), "HSR bleibt HSR", str(E.rollen_fuer(spiel3["besetzung"])))


def test_csp():
    """Die Seite erlaubt nur Skripte aus Dateien (Content-Security-Policy).
    Ein Skript direkt in index.html wird vom Browser stillschweigend
    verworfen - das faellt sonst erst auf, wenn etwas nicht funktioniert.
    Ebenso muss jede Skriptdatei im Offline-Vorrat stehen."""
    print("\nSeite und Sicherheitsregel")
    wurzel = os.path.dirname(HIER)
    seite = os.path.join(wurzel, "docs", "index.html")
    sw = os.path.join(wurzel, "docs", "sw.js")
    if not (os.path.exists(seite) and os.path.exists(sw)):
        pruefe(False, "index.html und sw.js vorhanden")
        return
    with open(seite, encoding="utf-8") as f:
        html = f.read()
    with open(sw, encoding="utf-8") as f:
        worker = f.read()
    regel = re.search(r'Content-Security-Policy"[^>]*content="([^"]+)"', html)
    pruefe(regel is not None, "Sicherheitsregel steht in der Seite")
    erlaubt_inline = bool(regel) and "unsafe-inline" in (regel.group(1).split("script-src")[1].split(";")[0] if "script-src" in regel.group(1) else "")
    inline = [m for m in re.findall(r"<script([^>]*)>", html) if "src=" not in m]
    pruefe(erlaubt_inline or not inline, "kein Skript in der Seite selbst", str(inline))
    dateien = re.findall(r'<script[^>]*src="([^"?]+)', html)
    pruefe(bool(dateien), "Skripte kommen aus Dateien", str(dateien))
    for d in dateien:
        name = d.lstrip("./")
        pruefe(os.path.exists(os.path.join(wurzel, "docs", name)), "%s liegt in docs/" % name)
        pruefe('"./%s"' % name in worker, "%s steht im Offline-Vorrat" % name)


def test_rechnungsvorlage():
    """Die Vorlage fuer die Gebuehrenabrechnung muss zur App passen:
    klassische xref-Tabelle (sonst kann der Browser nichts anhaengen) und
    die Feldnamen, die docs/rechnung.js ausfuellt."""
    print("\nVorlage Gebuehrenabrechnung")
    wurzel = os.path.dirname(HIER)
    pdf = os.path.join(wurzel, "docs", "abrechnung", "blanko.pdf")
    plan = os.path.join(wurzel, "docs", "abrechnung", "vorlage.json")
    if not (os.path.exists(pdf) and os.path.exists(plan)):
        pruefe(False, "Vorlage vorhanden", "(docs/abrechnung fehlt)")
        return
    with open(plan, encoding="utf-8") as f:
        p = json.load(f)
    with open(pdf, "rb") as f:
        roh = f.read()
    pruefe(roh.startswith(b"%PDF"), "blanko.pdf ist ein PDF")
    pruefe(b"\nxref" in roh, "klassische xref-Tabelle (der Browser haengt an)")
    pruefe(b"/AcroForm" not in roh, "keine Formularfelder mehr drin")
    pruefe(p.get("startxref") and roh[p["startxref"]:p["startxref"] + 4] == b"xref",
           "startxref zeigt auf die Tabelle", str(p.get("startxref")))
    gebraucht = ["undefined", "Rechnungssteller Schiedsrichter", "Rechnungsempf\u00e4nger Verein",
                 "Stra\u00dfe und Nr", "Stra\u00dfe und Nr_2", "PLZ und Ort", "PLZ und Ort 1",
                 "PLZ und Ort 2", "Steuernummer", "1", "2", "3", "4", "undefined_2",
                 "undefined_3", "undefined_4", "Spielort", "Dropdown3",
                 "\u20ac", "\u20ac_2", "\u20ac_3", "\u20ac_4", "Kleinunternehmer nach  19 UStG"]
    fehlt = [f for f in gebraucht if f not in (p.get("felder") or {})]
    pruefe(not fehlt, "alle Felder, die die App ausfuellt, sind bekannt", str(fehlt))
    pruefe(p.get("seite") and p.get("root") and p.get("maxObj"), "Objektnummern notiert")


def test_tresor():
    """Verschluesselt geschrieben, verschluesselt gelesen - und ohne
    Schluessel bleibt es Klartext. Geprueft an einer Wegwerfdatei unter
    docs/archiv, weil dort dieselbe Regel gilt wie fuer daten.json."""
    print("\nTresor")
    import base64, importlib
    try:
        import tresor
    except ImportError:
        pruefe(False, "tresor.py vorhanden")
        return
    try:
        tresor.verschluesseln(b"x", b"0" * 32)
    except ImportError:
        print("  --   Paket 'cryptography' fehlt, Test uebersprungen")
        return
    wurzel = os.path.dirname(HIER)
    probe = os.path.join(wurzel, "docs", "archiv", "0000-00.json")
    alt = os.environ.get("DATEN_SCHLUESSEL")
    try:
        os.environ["DATEN_SCHLUESSEL"] = base64.b64encode(b"T" * 32).decode()
        importlib.reload(esrw_ical_modul())
        E2 = esrw_ical_modul()
        inhalt = {"saison": "0000/00", "spiele": [["2000-01-01T00:00:00+01:00", "L", "A - B", "H", []]]}
        E2.schreibe(os.path.join("docs", "archiv", "0000-00.json"), inhalt)
        pruefe(os.path.exists(probe + ".bin"), "verschluesselte Datei entsteht")
        pruefe(not os.path.exists(probe), "Klartext bleibt nicht liegen")
        roh = open(probe + ".bin", "rb").read()
        pruefe(roh.startswith(b"ESRW1"), "Kennung stimmt")
        pruefe(b"A - B" not in roh, "die Paarung steht nicht lesbar drin")
        zurueck = E2.lade(os.path.join("docs", "archiv", "0000-00.json"), None)
        pruefe(zurueck == inhalt, "gelesen wie geschrieben")
    finally:
        for p in (probe, probe + ".bin"):
            if os.path.exists(p):
                os.remove(p)
        if alt is None:
            os.environ.pop("DATEN_SCHLUESSEL", None)
        else:
            os.environ["DATEN_SCHLUESSEL"] = alt
        importlib.reload(esrw_ical_modul())


def test_zurueckspielen():
    """Der Weg zurueck muss im Ernstfall funktionieren - und vorher nichts
    anfassen. Geprueft wird beides: der Probelauf schreibt nicht, und der
    Ernstfall schickt genau die Zeilen aus der Sicherung."""
    print("\nSicherung zurueckspielen")
    import base64, datetime, shutil, tempfile
    try:
        import sicherung, tresor
    except ImportError:
        pruefe(False, "sicherung.py vorhanden")
        return
    try:
        tresor.verschluesseln(b"x", b"0" * 32)
    except ImportError:
        print("  --   Paket 'cryptography' fehlt, Test uebersprungen")
        return

    alt_key = os.environ.get("DATEN_SCHLUESSEL")
    alt_url = os.environ.get("SUPABASE_URL")
    alt_dienst = os.environ.get("SUPABASE_SERVICE_KEY")
    alt_ordner, alt_alarm = sicherung.ORDNER, sicherung.ALARM
    alt_hole, alt_upsert = sicherung.hole, sicherung._upsert
    ordner = tempfile.mkdtemp()
    try:
        os.environ["DATEN_SCHLUESSEL"] = base64.b64encode(b"Z" * 32).decode()
        os.environ["SUPABASE_URL"] = "https://beispiel.test"
        os.environ["SUPABASE_SERVICE_KEY"] = "probe"
        sicherung.ORDNER = ordner
        sicherung.ALARM = os.path.join(ordner, "alarm.txt")
        k = tresor.schluessel()

        inhalt = {"stand": "2026-01-01T00:00:00+00:00",
                  "tabellen": {"profile": [{"id": "a", "slug": "muster-max"}],
                               "einsaetze": [{"id": 1}, {"id": 2}]},
                  "fehler": {}}
        pfad = os.path.join(ordner, "2026-01-01.json")
        tresor.json_schreiben(pfad, inhalt, k, separators=(",", ":"))

        geschrieben = []
        sicherung.hole = lambda url, d, t: []                      # Datenbank ist leer
        sicherung._upsert = lambda url, d, t, z, schritt=500: (geschrieben.append((t, len(z))) or len(z))

        pruefe(sicherung.zurueck(pfad + ".bin", False, []) == 0, "Probelauf laeuft durch")
        pruefe(geschrieben == [], "Probelauf schreibt nichts")

        pruefe(sicherung.zurueck(pfad + ".bin", True, []) == 0, "Ernstfall laeuft durch")
        pruefe(sorted(geschrieben) == [("einsaetze", 2), ("profile", 1)],
               "genau die Zeilen aus der Sicherung", str(sorted(geschrieben)))

        geschrieben[:] = []
        sicherung.zurueck(pfad + ".bin", True, ["profile"])
        pruefe(geschrieben == [("profile", 1)], "einzelne Tabelle laesst den Rest in Ruhe", str(geschrieben))

        # Eine Tabelle, die es in der Sicherung nicht gibt, darf nicht
        # stillschweigend nichts tun
        try:
            sicherung.zurueck(pfad + ".bin", True, ["gibtsnicht"])
            pruefe(False, "unbekannte Tabelle bricht ab")
        except SystemExit:
            pruefe(True, "unbekannte Tabelle bricht ab")

        # Schluesselwechsel bemerken
        pruefe(sicherung.schluessel_passt(k)[0], "eigener Schluessel passt")
        fremd = base64.b64decode(base64.b64encode(b"Y" * 32))
        passt, wer = sicherung.schluessel_passt(fremd)
        pruefe(not passt and wer == "2026-01-01.json.bin", "fremder Schluessel faellt auf", str((passt, wer)))

        # Alarm, wenn lange nichts mehr kam
        sicherung.alarm_pruefen(datetime.date(2026, 1, 1), "Probe")
        pruefe(not os.path.exists(sicherung.ALARM), "frische Sicherung loest keinen Alarm aus")
        sicherung.alarm_pruefen(datetime.date(2026, 1, 9), "Probe")
        pruefe(os.path.exists(sicherung.ALARM), "acht Tage Stillstand loesen Alarm aus")
        with open(sicherung.ALARM, encoding="utf-8") as f:
            text = f.read()
        pruefe(text.splitlines()[0].startswith("Sicherung haengt"), "Alarm hat eine Titelzeile", text[:60])
    finally:
        sicherung.ORDNER, sicherung.ALARM = alt_ordner, alt_alarm
        sicherung.hole, sicherung._upsert = alt_hole, alt_upsert
        for name, wert in (("DATEN_SCHLUESSEL", alt_key), ("SUPABASE_URL", alt_url),
                           ("SUPABASE_SERVICE_KEY", alt_dienst)):
            if wert is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = wert
        shutil.rmtree(ordner, ignore_errors=True)


def test_erinnerungszeit():
    """Wann die Spieltag-Erinnerung raus darf. Falsch gerechnet hiesse:
    sie kommt mitten in der Nacht oder erst nach dem Spiel."""
    print("\nErinnerungszeit")
    import datetime
    try:
        import push_senden as P
    except ImportError as e:
        print("  --   push_senden nicht ladbar (%s), Test uebersprungen" % e)
        return
    treff = datetime.datetime(2026, 9, 12, 12, 30, tzinfo=P.BERLIN)
    pruefe(P.vorlauf_zeit({}, treff).hour == 7, "ohne Einstellung bleibt es bei 07:00")
    pruefe(P.vorlauf_zeit({}, treff).date() == treff.date(), "und zwar am Spieltag")
    drei = P.vorlauf_zeit({"einstellungen": {"pushvorlauf": "3"}}, treff)
    pruefe(drei == treff - datetime.timedelta(hours=3), "3 Stunden vor dem Treffpunkt")
    abend = P.vorlauf_zeit({"einstellungen": {"pushvorlauf": "abend"}}, treff)
    pruefe(abend.date() == treff.date() - datetime.timedelta(days=1) and abend.hour == 18,
           "Abend davor ist der Vortag um 18 Uhr")
    for kaputt in ("0", "99", "", "morgen", None):
        pruefe(P.vorlauf_zeit({"einstellungen": {"pushvorlauf": kaputt}}, treff).hour == 7,
               "unsinnige Angabe %r faellt auf 07:00 zurueck" % (kaputt,))
    pruefe(P.verkehr_puffer({"einstellungen": {"verkehr": "20"}}) == 20, "Verkehrspuffer wird uebernommen")
    pruefe(P.verkehr_puffer({"einstellungen": {"verkehr": "999"}}) == 0, "unsinniger Puffer zaehlt nicht")
    pruefe(P.verkehr_puffer({}) == 0, "ohne Einstellung kein Puffer")


def test_sicherung():
    """Die Sicherung muss jede Tabelle des Schemas erfassen und sich
    hinterher wieder lesen lassen - sonst waere sie im Ernstfall wertlos."""
    print("\nSicherung")
    import base64, json, tempfile
    try:
        import sicherung, tresor
    except ImportError:
        pruefe(False, "sicherung.py vorhanden")
        return
    namen = sicherung.tabellen()
    pruefe(len(namen) > 25, "alle Tabellen aus dem Schema gelesen (%d)" % len(namen))
    for muss in ("profile", "einsaetze", "spielnotizen", "kontakte", "rechnungen"):
        pruefe(muss in namen, "%s ist dabei" % muss)
    pruefe("tresor" in namen, "auch die Tresor-Tabelle - ohne sie kaeme niemand mehr an die Daten")
    try:
        tresor.verschluesseln(b"x", b"0" * 32)
    except ImportError:
        print("  --   Paket 'cryptography' fehlt, Rueckweg uebersprungen")
        return
    alt = os.environ.get("DATEN_SCHLUESSEL")
    ordner = tempfile.mkdtemp()
    try:
        os.environ["DATEN_SCHLUESSEL"] = base64.b64encode(b"S" * 32).decode()
        k = tresor.schluessel()
        inhalt = {"stand": "2026-01-01T00:00:00+00:00", "tabellen": {"profile": [{"slug": "aeoeuess"}]}, "fehler": {}}
        ziel = os.path.join(ordner, "2026-01-01.json")
        tresor.json_schreiben(ziel, inhalt, k, separators=(",", ":"))
        with open(ziel + ".bin", "rb") as f:
            roh = f.read()
        pruefe(b"aeoeuess" not in roh, "die Sicherung liegt nicht im Klartext")
        zurueck = json.loads(tresor.entschluesseln(roh, k).decode("utf-8"))
        pruefe(zurueck == inhalt, "gelesen wie geschrieben")
    finally:
        if alt is None:
            os.environ.pop("DATEN_SCHLUESSEL", None)
        else:
            os.environ["DATEN_SCHLUESSEL"] = alt
        import shutil
        shutil.rmtree(ordner, ignore_errors=True)


def esrw_ical_modul():
    return sys.modules["esrw_ical"]


def main():
    print("Regressionstest esrw_ical")
    for test in (test_parsen, test_hallen, test_namen, test_rollen, test_aliase,
                 test_konflikte, test_hash_migration, test_ausgaben, test_faltung,
                 test_escape, test_ics, test_saison, test_aenderungstext, test_saisonarchiv,
                 test_korrektur_uid, test_gespannwechsel, test_ehemalige,
                 test_besetzung_korrektur, test_csp,
                 test_rechnungsvorlage, test_sicherung, test_erinnerungszeit, test_zurueckspielen,
                 test_tresor):
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
