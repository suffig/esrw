#!/usr/bin/env python3
"""
Erzeugt die App-Symbole fuer die Webseite: ein Puck auf dunkelblauem Grund
(die alten Trikotstreifen gibt es weiter als trikot()).

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


NAVY_OBEN = (15, 61, 110)
NAVY_UNTEN = (29, 90, 153)
PUCK_KOERPER = (18, 19, 23)
PUCK_DECKEL = (44, 46, 52)
PUCK_KANTE = (70, 73, 82)


def puck(groesse, raster=3):
    """Puck von schraeg oben auf blauem Verlauf. Gezeichnet ueber ein
    feines Unterraster je Pixel, damit die Kanten weich werden."""
    cx, cy = 0.5, 0.54            # Mitte des Pucks (Anteile der Kantenlaenge)
    rx, ry = 0.34, 0.135          # Halbachsen der Deckel-Ellipse
    hoehe = 0.16                  # Dicke des Pucks
    kante = 0.018                 # heller Rand oben

    def farbe(u, v):
        t = (u + v) / 2
        hg = tuple(int(NAVY_OBEN[i] + (NAVY_UNTEN[i] - NAVY_OBEN[i]) * t) for i in range(3))
        # Deckel
        dx, dy = (u - cx) / rx, (v - cy) / ry
        if dx * dx + dy * dy <= 1:
            innen = (u - cx) / (rx - kante), (v - cy) / (ry - kante)
            return PUCK_DECKEL if innen[0] ** 2 + innen[1] ** 2 <= 1 else PUCK_KANTE
        # Seitenwand: unter dem Deckel, innerhalb der Breite, bis zur unteren Ellipse
        if abs(u - cx) <= rx and cy <= v <= cy + hoehe + ry:
            dy2 = (v - (cy + hoehe)) / ry
            if v <= cy + hoehe or dx * dx + dy2 * dy2 <= 1:
                return PUCK_KOERPER
        return hg

    zeilen = []
    for y in range(groesse):
        zeile = []
        for x in range(groesse):
            summe = [0, 0, 0]
            for j in range(raster):
                for i in range(raster):
                    f = farbe((x + (i + 0.5) / raster) / groesse, (y + (j + 0.5) / raster) / groesse)
                    summe[0] += f[0]; summe[1] += f[1]; summe[2] += f[2]
            n = raster * raster
            zeile.append((summe[0] // n, summe[1] // n, summe[2] // n))
        zeilen.append(zeile)
    return zeilen


def main():
    os.makedirs(ZIEL, exist_ok=True)
    for name, groesse in GROESSEN.items():
        pfad = os.path.join(ZIEL, name)
        with open(pfad, "wb") as f:
            f.write(png(groesse, groesse, puck(groesse)))
        print("  %-22s %3d x %3d  %5d Bytes" % (name, groesse, groesse,
                                                os.path.getsize(pfad)))


if __name__ == "__main__":
    main()
