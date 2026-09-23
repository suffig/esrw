#!/usr/bin/env python3
"""Macht aus der Blanko-Gebuehrenabrechnung die Vorlage fuer die App.

    python abrechnung_vorlage.py ESRW_Abrechnung_Blanko.pdf

Ergebnis (liegt im Repo, muss nur nach einer neuen Blanko-Fassung neu laufen):

    docs/abrechnung/blanko.pdf    dasselbe Formular, aber ohne Formularfelder.
                                  Die App haengt an diese Datei einen zweiten
                                  Inhaltsstrom mit dem ausgefuellten Text an -
                                  das kann jeder Betrachter, auch iOS.
    docs/abrechnung/vorlage.json  Objektnummern der Vorlage und die Rechtecke
                                  der frueheren Formularfelder. Danach richtet
                                  sich docs/rechnung.js beim Schreiben.

Braucht pypdf:  pip install pypdf
"""
import io
import json
import os
import re
import sys

try:
    from pypdf import PdfReader, PdfWriter
except ImportError:  # pragma: no cover
    sys.exit("pypdf fehlt:  pip install pypdf")

BASIS = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(BASIS, "docs", "abrechnung")


def baue(quelle):
    os.makedirs(ZIEL, exist_ok=True)
    leser = PdfReader(quelle)
    seite = leser.pages[0]

    # Erst die Felder merken, solange die Widgets noch da sind
    felder = {}
    for a in (seite.get("/Annots") or []):
        o = a.get_object()
        name = o.get("/T")
        eltern = o.get("/Parent")
        if name is None and eltern is not None:
            name = eltern.get_object().get("/T")
        r = [round(float(x), 2) for x in o.get("/Rect")]
        felder[str(name)] = {"x": r[0], "y": r[1], "x2": r[2], "y2": r[3]}
    if not felder:
        sys.exit("Keine Formularfelder gefunden - ist das die richtige Datei?")

    # Formularfelder entfernen: Wir malen den Text selbst auf die Seite.
    schreiber = PdfWriter()
    schreiber.add_page(seite)
    if "/Annots" in schreiber.pages[0]:
        del schreiber.pages[0]["/Annots"]
    if "/AcroForm" in schreiber._root_object:
        del schreiber._root_object["/AcroForm"]

    roh = io.BytesIO()
    schreiber.write(roh)
    daten = roh.getvalue()

    objekte = [(int(m.group(1)), m.start()) for m in re.finditer(rb'(?m)^(\d+) 0 obj', daten)]
    maxobj = max(n for n, _ in objekte)
    startxref = int(re.findall(rb'startxref\s+(\d+)', daten)[-1])
    root = int(re.findall(rb'/Root (\d+) 0 R', daten)[-1])

    seite_nr, seite_dict = None, None
    for n, pos in objekte:
        text = daten[pos:daten.find(b'endobj', pos)].decode('latin-1')
        if '/Type /Page' in text and '/Type /Pages' not in text:
            seite_nr, seite_dict = n, text.split('obj', 1)[1].strip()
            break
    if seite_nr is None:
        sys.exit("Seitenobjekt nicht gefunden")

    with open(os.path.join(ZIEL, "blanko.pdf"), "wb") as f:
        f.write(daten)
    plan = {
        "seite": seite_nr,
        "seiteDict": seite_dict,
        "root": root,
        "maxObj": maxobj,
        "startxref": startxref,
        "groesse": [round(float(x), 2) for x in seite.mediabox][2:],
        "felder": felder,
    }
    with io.open(os.path.join(ZIEL, "vorlage.json"), "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=1, sort_keys=True)

    print("blanko.pdf  %6d Bytes" % len(daten))
    print("vorlage.json: Seite %d, Root %d, maxObj %d, %d Felder"
          % (seite_nr, root, maxobj, len(felder)))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    baue(sys.argv[1])
