#!/usr/bin/env python3
"""
Erzeugt aus logo_esrw_app.png die App-Symbole und das Kopf-Logo in docs/.

    pip install pillow
    python logo_bauen.py

Muss nur laufen, wenn sich das Logo aendert. icons_bauen.py (Puck) bleibt
als Fallback liegen, wird aber nicht mehr gebraucht.
"""

import os

from PIL import Image

BASIS = os.path.dirname(os.path.abspath(__file__))
QUELLE = os.path.join(BASIS, "logo_esrw_app.png")
ZIEL = os.path.join(BASIS, "docs")
GROESSEN = {"icon-512.png": 512, "icon-192.png": 192, "apple-touch-icon.png": 180,
            "logo-256.png": 256, "logo-96.png": 96}


def main():
    im = Image.open(QUELLE).convert("RGB")
    for name, groesse in GROESSEN.items():
        pfad = os.path.join(ZIEL, name)
        im.resize((groesse, groesse), Image.LANCZOS).save(pfad, optimize=True)
        print("  %-22s %3d x %3d  %6d Bytes" % (name, groesse, groesse, os.path.getsize(pfad)))


if __name__ == "__main__":
    main()
