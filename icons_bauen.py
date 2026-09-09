#!/usr/bin/env python3
"""
Erzeugt die App-Symbole fuer die Webseite: schwarz-weisse Senkrechtstreifen
wie ein Schiedsrichtertrikot.

Muss nur laufen, wenn man das Symbol aendern will - die fertigen Dateien
liegen in docs/. Schreibt PNG von Hand, damit keine Bildbibliothek noetig ist.

    python icons_bauen.py
"""

import os
import struct
import zlib

BASIS = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(BASIS, "docs")

HELL = (242, 242, 239)
DUNKEL = (28, 28, 26)
STREIFEN = 7          # ungerade, damit aussen beide Raender dunkel sind
GROESSEN = {"icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180}


def png(breite, hoehe, zeilen):
    """Minimales PNG, Farbtyp 2 (RGB, ohne Alpha)."""
    roh = b"".join(b"\x00" + bytes(w for punkt in zeile for w in punkt)
                   for zeile in zeilen)

    def block(art, daten):
        inhalt = art + daten
        return (struct.pack(">I", len(daten)) + inhalt
                + struct.pack(">I", zlib.crc32(inhalt) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + block(b"IHDR", struct.pack(">IIBBBBB", breite, hoehe, 8, 2, 0, 0, 0))
            + block(b"IDAT", zlib.compress(roh, 9))
            + block(b"IEND", b""))


def trikot(groesse):
    """Senkrechte Streifen ueber die volle Flaeche. Voll ausgefuellt, weil
    Android und iOS das Symbol selbst rund beschneiden."""
    zeile = []
    for x in range(groesse):
        nummer = x * STREIFEN // groesse
        zeile.append(DUNKEL if nummer % 2 == 0 else HELL)
    return [zeile] * groesse


def main():
    os.makedirs(ZIEL, exist_ok=True)
    for name, groesse in GROESSEN.items():
        pfad = os.path.join(ZIEL, name)
        with open(pfad, "wb") as f:
            f.write(png(groesse, groesse, trikot(groesse)))
        print("  %-22s %3d x %3d  %5d Bytes" % (name, groesse, groesse,
                                                os.path.getsize(pfad)))


if __name__ == "__main__":
    main()
