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
        finally:
            E.BASIS = alt_basis


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


def main():
    print("Regressionstest esrw_ical")
    for test in (test_parsen, test_hallen, test_namen, test_rollen, test_aliase,
                 test_konflikte, test_hash_migration, test_ausgaben, test_faltung,
                 test_escape, test_ics, test_saison, test_aenderungstext, test_saisonarchiv,
                 test_korrektur_uid, test_gespannwechsel):
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
