#!/usr/bin/env python3
"""Taegliche Sicherung der Supabase-Datenbank.

Warum: der Free Plan von Supabase sichert nichts. Geht dort etwas kaputt,
oder loescht jemand aus Versehen eine Tabelle, waere alles weg - Einsaetze,
Abrechnungen, Notizen, Kontakte. Also zieht der Workflow einmal am Tag
jede Tabelle und legt sie verschluesselt in sicherungen/ ab. Damit liegt
die Sicherung versioniert bei GitHub und ist nur mit DATEN_SCHLUESSEL
lesbar - GitHub selbst sieht Geheimtext.

Nicht mitgesichert werden Dateien im Storage (die Belege). Die liegen bei
Supabase im Bucket 'belege'; wer sie sichern will, laedt sie in der App
unter Abrechnung herunter.

Welche Tabellen es gibt, liest das Skript aus supabase/schema.sql - so
faellt eine neue Tabelle nicht durchs Raster, nur weil hier niemand daran
gedacht hat.

Aufruf:

    python sicherung.py                 Sicherung des Tages schreiben
    python sicherung.py --zeigen DATEI  eine Sicherung wieder lesbar machen
"""
import datetime
import glob
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request

import tresor

ORDNER = "sicherungen"
SCHEMA = os.path.join("supabase", "schema.sql")

# Wie lange welche Sicherung liegen bleibt. Taeglich fuer den letzten Monat,
# danach nur noch die vom Monatsersten - sonst waechst das Repository ewig.
TAGE_TAEGLICH = 35
MONATE_MONATLICH = 24


def tabellen():
    """Alle Tabellen aus dem Schema, in der Reihenfolge ihrer Entstehung."""
    with io.open(SCHEMA, encoding="utf-8") as f:
        text = f.read()
    namen = []
    for n in re.findall(r"create table if not exists public\.([a-z_]+)", text):
        if n not in namen:
            namen.append(n)
    return namen


def hole(url, schluessel, tabelle):
    """Eine Tabelle vollstaendig, seitenweise - PostgREST liefert hoechstens
    1000 Zeilen auf einmal."""
    alles, schritt, von = [], 1000, 0
    while True:
        req = urllib.request.Request(
            url.rstrip("/") + "/rest/v1/" + tabelle + "?select=*",
            headers={"apikey": schluessel, "Authorization": "Bearer " + schluessel,
                     "Range-Unit": "items", "Range": "%d-%d" % (von, von + schritt - 1)})
        with urllib.request.urlopen(req, timeout=60) as r:
            teil = json.loads(r.read().decode("utf-8") or "[]")
        alles.extend(teil)
        if len(teil) < schritt:
            return alles
        von += schritt


def aufraeumen(heute):
    """Alte Sicherungen wegwerfen - taegliche nach 35 Tagen, Monatserste
    nach zwei Jahren."""
    weg = []
    for pfad in sorted(glob.glob(os.path.join(ORDNER, "*.json.bin"))):
        name = os.path.basename(pfad).split(".")[0]
        try:
            tag = datetime.date.fromisoformat(name)
        except ValueError:
            continue                        # nichts anfassen, was nicht so heisst
        alter = (heute - tag).days
        if alter <= TAGE_TAEGLICH:
            continue
        if tag.day == 1 and alter <= MONATE_MONATLICH * 31:
            continue
        os.remove(pfad)
        weg.append(name)
    return weg


def sichern():
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    dienst = (os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()
    if not url or not dienst:
        print("SUPABASE_URL oder SUPABASE_SERVICE_KEY fehlt - keine Sicherung.")
        return 0
    k = tresor.schluessel()
    if not k:
        # Ohne Schluessel laege die halbe Kartei im Klartext im Repository.
        print("DATEN_SCHLUESSEL fehlt - eine Sicherung im Klartext waere schlimmer als keine.")
        return 0

    heute = datetime.date.today()
    pfad = os.path.join(ORDNER, heute.isoformat() + ".json")
    if os.path.exists(pfad + ".bin") and "--erzwingen" not in sys.argv:
        # Der Workflow laeuft stuendlich, gesichert wird einmal am Tag
        return 0

    daten, fehler, zeilen = {}, {}, 0
    for t in tabellen():
        try:
            daten[t] = hole(url, dienst, t)
            zeilen += len(daten[t])
        except urllib.error.HTTPError as e:
            fehler[t] = "%s %s" % (e.code, e.reason)
        except Exception as e:                       # Netz, Zeitueberschreitung
            fehler[t] = str(e)

    if not daten:
        print("Keine einzige Tabelle gelesen - Sicherung abgebrochen.")
        return 1

    inhalt = {
        "stand": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "tabellen": daten,
        "fehler": fehler,
    }
    if not os.path.isdir(ORDNER):
        os.makedirs(ORDNER)
    tresor.json_schreiben(pfad, inhalt, k, separators=(",", ":"))
    groesse = os.path.getsize(pfad + ".bin")

    weg = aufraeumen(heute)
    print("Sicherung %s: %d Tabellen, %d Zeilen, %d KB%s%s" % (
        heute.isoformat(), len(daten), zeilen, groesse // 1024,
        (", %d nicht lesbar: %s" % (len(fehler), ", ".join(sorted(fehler)))) if fehler else "",
        (", %d alte entfernt" % len(weg)) if weg else ""))
    return 0


def zeigen(pfad):
    """Eine Sicherung wieder lesbar machen - fuer den Ernstfall."""
    k = tresor.schluessel()
    if not k:
        raise SystemExit("DATEN_SCHLUESSEL setzen, sonst laesst sich nichts lesen.")
    with open(pfad, "rb") as f:
        inhalt = json.loads(tresor.entschluesseln(f.read(), k).decode("utf-8"))
    print("Stand: %s" % inhalt.get("stand"))
    for t, zeilen in sorted(inhalt.get("tabellen", {}).items()):
        print("  %-20s %d Zeilen" % (t, len(zeilen)))
    if inhalt.get("fehler"):
        print("Nicht gelesen:", ", ".join(sorted(inhalt["fehler"])))
    ziel = os.path.splitext(pfad)[0]                 # ...json.bin -> ...json
    with io.open(ziel, "w", encoding="utf-8") as f:
        json.dump(inhalt, f, ensure_ascii=False, indent=1)
    print("Klartext liegt in %s - nach dem Blick bitte loeschen." % ziel)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--zeigen":
        zeigen(sys.argv[2])
    else:
        sys.exit(sichern())
