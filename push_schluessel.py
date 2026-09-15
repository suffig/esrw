#!/usr/bin/env python3
"""
Erzeugt einmalig das Schluesselpaar fuer Web Push (VAPID).

    pip install pywebpush
    python push_schluessel.py

Danach:
  * den OEFFENTLICHEN Schluessel aus docs/push.json committen (der darf
    jeder sehen - Browser brauchen ihn zum Anmelden)
  * den PRIVATEN Schluessel aus vapid_privat.txt als GitHub-Secret
    VAPID_PRIVATE hinterlegen und die Datei danach loeschen. Er darf
    nirgends sonst liegen - wer ihn hat, kann in eurem Namen Push-
    Nachrichten schicken.

Die Datei vapid_privat.txt steht in .gitignore und kann nicht versehentlich
committet werden.
"""

import base64
import json
import os
import sys

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
except ImportError:
    sys.exit("Bitte zuerst:  pip install pywebpush")

BASIS = os.path.dirname(os.path.abspath(__file__))


def b64url(daten):
    return base64.urlsafe_b64encode(daten).rstrip(b"=").decode("ascii")


def main():
    pfad_privat = os.path.join(BASIS, "vapid_privat.txt")
    pfad_public = os.path.join(BASIS, "docs", "push.json")
    if os.path.exists(pfad_privat):
        sys.exit("vapid_privat.txt gibt es schon - erst loeschen, wenn du wirklich "
                 "ein neues Paar willst (alle Push-Abos muessten dann neu angelegt werden).")

    schluessel = ec.generate_private_key(ec.SECP256R1())
    privat_roh = schluessel.private_numbers().private_value.to_bytes(32, "big")
    oeffentlich_roh = schluessel.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)

    with open(pfad_privat, "w", encoding="utf-8") as f:
        f.write(b64url(privat_roh) + "\n")
    with open(pfad_public, "w", encoding="utf-8") as f:
        json.dump({"_hinweis": "Oeffentlicher VAPID-Schluessel fuer Web Push. Darf jeder sehen. "
                               "Der private liegt nur als GitHub-Secret VAPID_PRIVATE.",
                   "public_key": b64url(oeffentlich_roh)}, f, indent=2)
        f.write("\n")

    print("Oeffentlicher Schluessel -> docs/push.json (committen)")
    print("Privater Schluessel      -> vapid_privat.txt (als Secret VAPID_PRIVATE hinterlegen, dann loeschen)")
    print()
    print("Der private Schluessel wird hier absichtlich NICHT angezeigt.")


if __name__ == "__main__":
    main()
