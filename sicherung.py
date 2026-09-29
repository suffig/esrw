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

    python sicherung.py                    Sicherung des Tages schreiben
    python sicherung.py --zeigen DATEI     eine Sicherung lesbar machen
    python sicherung.py --zurueck DATEI    Probelauf: was waere anders?
    python sicherung.py --zurueck DATEI --wirklich [tabelle ...]
                                           zurueckspielen, wirklich

Zum Zurueckspielen gehoert der Kopf dazu, nicht nur der Befehl: es
schreibt in die laufende Datenbank. Darum zeigt der Probelauf erst, was
sich aendern wuerde, und erst "--wirklich" tut es. Ohne Tabellennamen
sind alle gemeint; mit Namen nur die genannten - um eine Zeile zu retten,
muss man nicht alles anfassen.
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
# Der Workflow legt daraus ein Issue an - sonst faellt ein Ausfall erst
# auf, wenn man ihn braucht.
ALARM = os.environ.get("ALARM_DATEI") or "sicherung_alarm.txt"
ALARM_TAGE = 2

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


def melden(url, dienst, zeilen):
    """Eine Zeile in sicherung_lauf (Schema v37) - nur Zahlen. Damit steht
    im Adminbereich, ob die Sicherung laeuft, ohne dass jemand ins
    Repository schauen muss. Schlaegt das fehl, ist die Sicherung
    trotzdem geschrieben; also nur melden, nicht abbrechen."""
    daten = json.dumps(zeilen).encode("utf-8")
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/sicherung_lauf", data=daten, method="POST",
        headers={"apikey": dienst, "Authorization": "Bearer " + dienst,
                 "Content-Type": "application/json", "Prefer": "return=minimal"})
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True
    except Exception as e:
        print("Sicherung nicht protokolliert (%s) - Tabelle sicherung_lauf fehlt? schema.sql v37." % str(e)[:120])
        return False


def alarm(titel, text):
    """Eine Zeile Titel, darunter der Rumpf - dasselbe Format wie
    meldung.txt bei neuen Einteilungen."""
    try:
        with io.open(ALARM, "w", encoding="utf-8") as f:
            f.write(titel + "\n" + text + "\n")
    except Exception:
        pass
    print(titel)


def letzter_stand():
    """Datum der neuesten vorhandenen Sicherung, oder None."""
    tage = []
    for pfad in glob.glob(os.path.join(ORDNER, "*.json.bin")):
        try:
            tage.append(datetime.date.fromisoformat(os.path.basename(pfad).split(".")[0]))
        except ValueError:
            continue
    return max(tage) if tage else None


def alarm_pruefen(heute, grund):
    """Schlaegt an, wenn seit ALARM_TAGE keine Sicherung mehr entstanden
    ist. Ein einzelner missglueckter Lauf ist normal (Netz, Wartung bei
    Supabase) - zwei Tage am Stueck sind es nicht."""
    letzte = letzter_stand()
    if letzte is None:
        alarm("Sicherung: noch keine einzige vorhanden",
              "Die Datenbank wurde noch nie gesichert.\nGrund des letzten Versuchs: %s\n\n"
              "Siehe sicherung.py und den Schritt \"Datenbank sichern\" im Workflow." % grund)
        return
    alter = (heute - letzte).days
    if alter >= ALARM_TAGE:
        alarm("Sicherung haengt seit %d Tagen" % alter,
              "Die neueste Sicherung ist vom %s.\nGrund des letzten Versuchs: %s\n\n"
              "Solange das so bleibt, gibt es keinen Stand, auf den man zurueck koennte."
              % (letzte.isoformat(), grund))


def schluessel_passt(k):
    """Laesst sich die neueste vorhandene Sicherung noch entschluesseln?

    Wenn nicht, ist DATEN_SCHLUESSEL gewechselt worden. Dann waere alles
    Aeltere unlesbar - und niemand merkte es, weil die neuen Dateien ja
    weiter entstehen. Lieber einmal laut sagen."""
    vorhanden = sorted(glob.glob(os.path.join(ORDNER, "*.json.bin")))
    if not vorhanden:
        return True, None
    neueste = vorhanden[-1]
    try:
        with open(neueste, "rb") as f:
            tresor.entschluesseln(f.read(), k)
        return True, None
    except Exception:
        return False, os.path.basename(neueste)


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
        alarm_pruefen(datetime.date.today(), "SUPABASE_URL oder SUPABASE_SERVICE_KEY fehlt")
        print("SUPABASE_URL oder SUPABASE_SERVICE_KEY fehlt - keine Sicherung.")
        return 0
    k = tresor.schluessel()
    if not k:
        # Ohne Schluessel laege die halbe Kartei im Klartext im Repository.
        alarm_pruefen(datetime.date.today(), "DATEN_SCHLUESSEL fehlt")
        print("DATEN_SCHLUESSEL fehlt - eine Sicherung im Klartext waere schlimmer als keine.")
        return 0

    passt, wer = schluessel_passt(k)
    if not passt:
        print("ACHTUNG: %s laesst sich mit dem jetzigen DATEN_SCHLUESSEL nicht mehr oeffnen. "
              "Wurde der Schluessel gewechselt? Dann sind alle aelteren Sicherungen wertlos - "
              "bitte den alten Schluessel aufheben, sonst kommt niemand mehr an sie heran." % wer)

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
        alarm_pruefen(heute, "keine einzige Tabelle lesbar")
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

    melden(url, dienst, {"tabellen": len(daten), "zeilen": zeilen, "bytes": groesse,
                         "fehler": ", ".join(sorted(fehler)) or None})
    if fehler:
        alarm("Sicherung unvollstaendig: %d Tabelle(n) fehlen" % len(fehler),
              "Gesichert am %s, aber diese Tabellen kamen nicht mit:\n\n%s\n\n"
              "Meist fehlt eine Tabelle im Schema oder eine Zugriffsregel sperrt den "
              "service_role-Schluessel aus." % (
                  heute.isoformat(),
                  "\n".join("  * %s - %s" % (t, fehler[t]) for t in sorted(fehler))))
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


def _lesen(pfad):
    k = tresor.schluessel()
    if not k:
        raise SystemExit("DATEN_SCHLUESSEL setzen, sonst laesst sich nichts lesen.")
    with open(pfad, "rb") as f:
        return json.loads(tresor.entschluesseln(f.read(), k).decode("utf-8"))


def zurueck(pfad, wirklich, nur):
    """Eine Sicherung wieder einspielen.

    Standard ist der Probelauf: er sagt Tabelle fuer Tabelle, wie viele
    Zeilen in der Sicherung stehen, wie viele jetzt da sind und was das
    Einspielen aendern wuerde. Erst mit --wirklich passiert etwas, und
    auch dann wird nur geschrieben, nie geloescht: die Zeilen gehen als
    upsert rein (gleicher Primaerschluessel = ueberschrieben, neuer =
    angelegt). Was seit der Sicherung dazukam, bleibt also stehen.
    Wer wirklich einen Stand von damals will, leert die Tabelle vorher
    von Hand im SQL-Editor - das ist Absicht, so etwas soll niemand
    versehentlich tun."""
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    dienst = (os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()
    if not url or not dienst:
        raise SystemExit("SUPABASE_URL und SUPABASE_SERVICE_KEY setzen - ohne sie geht kein Schreiben.")

    inhalt = _lesen(pfad)
    tab = inhalt.get("tabellen", {})
    print("Sicherung vom %s\n" % inhalt.get("stand"))
    if nur:
        fehlt = [t for t in nur if t not in tab]
        if fehlt:
            raise SystemExit("Nicht in dieser Sicherung: %s" % ", ".join(fehlt))
        tab = {t: tab[t] for t in nur}

    fehler = 0
    for name in sorted(tab):
        zeilen = tab[name] or []
        try:
            jetzt = len(hole(url, dienst, name))
        except Exception as e:
            print("  %-22s ? (jetzt nicht lesbar: %s)" % (name, str(e)[:60]))
            jetzt = None
        wie = "%d in der Sicherung, %s jetzt" % (len(zeilen), jetzt if jetzt is not None else "?")
        if not wirklich:
            print("  %-22s %s" % (name, wie))
            continue
        if not zeilen:
            print("  %-22s %s - nichts einzuspielen" % (name, wie))
            continue
        try:
            geschrieben = _upsert(url, dienst, name, zeilen)
            print("  %-22s %s -> %d geschrieben" % (name, wie, geschrieben))
        except Exception as e:
            fehler += 1
            print("  %-22s %s -> FEHLER: %s" % (name, wie, str(e)[:160]))

    if not wirklich:
        print("\nProbelauf, es wurde nichts geaendert. Wenn das so stimmt:")
        print("  python sicherung.py --zurueck %s --wirklich%s"
              % (pfad, (" " + " ".join(nur)) if nur else ""))
        return 0
    print("\nFertig%s." % (" - %d Tabelle(n) mit Fehlern, siehe oben" % fehler if fehler else ""))
    return 1 if fehler else 0


def _upsert(url, dienst, tabelle, zeilen, schritt=500):
    """Zeilen in Haeppchen zurueckschreiben. merge-duplicates heisst:
    vorhandene Primaerschluessel werden ueberschrieben, neue angelegt."""
    geschrieben = 0
    for i in range(0, len(zeilen), schritt):
        teil = zeilen[i:i + schritt]
        req = urllib.request.Request(
            url.rstrip("/") + "/rest/v1/" + tabelle,
            data=json.dumps(teil).encode("utf-8"), method="POST",
            headers={"apikey": dienst, "Authorization": "Bearer " + dienst,
                     "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"})
        with urllib.request.urlopen(req, timeout=120):
            geschrieben += len(teil)
    return geschrieben


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) > 1 and args[0] == "--zeigen":
        zeigen(args[1])
    elif len(args) > 1 and args[0] == "--zurueck":
        rest = args[2:]
        sys.exit(zurueck(args[1], "--wirklich" in rest,
                         [a for a in rest if not a.startswith("--")]))
    else:
        sys.exit(sichern())
