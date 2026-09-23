#!/usr/bin/env python3
"""Verschluesselt die Daten, die die App braucht.

Warum: docs/ liegt auf GitHub Pages, und wer die Adresse kennt, kann jede
Datei darin abrufen. Ein Riegel in der App aendert daran nichts. Also liegen
die Einteilungen dort nur noch als Geheimtext; den Schluessel bekommt die App
aus Supabase, und den gibt es nur fuer freigeschaltete Mitglieder.

Format einer Tresordatei (.bin):

    "ESRW1"  5 Bytes Kennung
    Nonce   12 Bytes Zufall
    Rest         AES-256-GCM (Geheimtext samt Pruefsumme)

Der Schluessel sind 32 zufaellige Bytes, in base64 in der Umgebungsvariablen
DATEN_SCHLUESSEL (im Workflow: Repository -> Settings -> Secrets). Fehlt er,
schreibt das Skript wie frueher Klartext - dann ist nur nichts geschuetzt.

Einen Schluessel erzeugen:

    python tresor.py --neu

Selbsttest (verschluesseln, entschluesseln, vergleichen):

    python tresor.py --test
"""
import base64
import hashlib
import hmac
import io
import json
import os
import sys

KENNUNG = b"ESRW1"
NONCE_LAENGE = 12


def schluessel():
    """Die 32 Bytes aus der Umgebung - oder None, wenn keiner gesetzt ist."""
    roh = (os.environ.get("DATEN_SCHLUESSEL") or "").strip()
    if not roh:
        return None
    try:
        k = base64.b64decode(roh, validate=True)
    except Exception:
        raise SystemExit("DATEN_SCHLUESSEL ist kein base64 - bitte mit "
                         "'python tresor.py --neu' einen neuen erzeugen.")
    if len(k) != 32:
        raise SystemExit("DATEN_SCHLUESSEL muss 32 Bytes sein (base64), ist %d." % len(k))
    return k


def verschluesseln(klartext, k):
    """bytes -> bytes. Braucht das Paket 'cryptography'."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nonce = os.urandom(NONCE_LAENGE)
    return KENNUNG + nonce + AESGCM(k).encrypt(nonce, klartext, None)


def entschluesseln(daten, k):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    if not daten.startswith(KENNUNG):
        raise ValueError("keine Tresordatei")
    nonce = daten[len(KENNUNG):len(KENNUNG) + NONCE_LAENGE]
    return AESGCM(k).decrypt(nonce, daten[len(KENNUNG) + NONCE_LAENGE:], None)


def json_schreiben(pfad, inhalt, k, **json_args):
    """Schreibt <pfad>.bin verschluesselt - oder <pfad> im Klartext, wenn kein
    Schluessel da ist. Die jeweils andere Fassung wird geloescht, damit nie
    beides nebeneinander liegt."""
    text = json.dumps(inhalt, ensure_ascii=False, **json_args)
    if k:
        with open(pfad + ".bin", "wb") as f:
            f.write(verschluesseln(text.encode("utf-8"), k))
        if os.path.exists(pfad):
            os.remove(pfad)
    else:
        with io.open(pfad, "w", encoding="utf-8") as f:
            f.write(text)
        if os.path.exists(pfad + ".bin"):
            os.remove(pfad + ".bin")


def json_lesen(pfad, k, standard=None):
    """Liest <pfad>.bin (verschluesselt) oder <pfad> (Klartext)."""
    if k and os.path.exists(pfad + ".bin"):
        with open(pfad + ".bin", "rb") as f:
            return json.loads(entschluesseln(f.read(), k).decode("utf-8"))
    if os.path.exists(pfad):
        with io.open(pfad, encoding="utf-8") as f:
            return json.load(f)
    return standard


def text_schreiben(pfad, text, k):
    """Wie json_schreiben, aber fuer fertigen Text (Kalenderdateien bleiben
    Klartext - ein Kalender kann nicht entschluesseln)."""
    if k:
        with open(pfad + ".bin", "wb") as f:
            f.write(verschluesseln(text.encode("utf-8"), k))
        if os.path.exists(pfad):
            os.remove(pfad)
    else:
        with io.open(pfad, "w", encoding="utf-8", newline="") as f:
            f.write(text)


def marke(k, zweck):
    """Unratbarer Name fuer eine Datei, die nicht verschluesselt werden kann -
    die Kalenderdateien. Gleiche Rechnung in der App (HMAC-SHA256, 32 Zeichen),
    damit sie die Adresse selbst ausrechnen kann."""
    return hmac.new(k, zweck.encode("utf-8"), hashlib.sha256).hexdigest()[:32]


# ----------------------------------------------------------------- Werkzeug

def _neu():
    print(base64.b64encode(os.urandom(32)).decode())
    print("\nDamit:", file=sys.stderr)
    print("  1. GitHub -> Settings -> Secrets and variables -> Actions ->", file=sys.stderr)
    print("     New repository secret, Name: DATEN_SCHLUESSEL", file=sys.stderr)
    print("  2. In Supabase (SQL-Editor):", file=sys.stderr)
    print("     insert into public.tresor (id, schluessel) values (1, '<derselbe Wert>')", file=sys.stderr)
    print("       on conflict (id) do update set schluessel = excluded.schluessel;", file=sys.stderr)
    print("  Der Wert gehoert an keine dritte Stelle - auch nicht ins Repository.", file=sys.stderr)


def _test():
    k = base64.b64decode(base64.b64encode(os.urandom(32)))
    for probe in [b"", b"kurz", json.dumps({"a": "äöü", "b": [1, 2, 3]}).encode("utf-8"),
                  os.urandom(200000)]:
        zurueck = entschluesseln(verschluesseln(probe, k), k)
        assert zurueck == probe, "Rueckweg stimmt nicht"
    a = verschluesseln(b"gleich", k)
    b = verschluesseln(b"gleich", k)
    assert a != b, "gleicher Text darf nicht gleichen Geheimtext ergeben"
    kaputt = bytearray(verschluesseln(b"heikel", k))
    kaputt[-1] ^= 1
    try:
        entschluesseln(bytes(kaputt), k)
        raise AssertionError("verfaelschter Text haette auffallen muessen")
    except AssertionError:
        raise
    except Exception:
        pass
    assert len(marke(k, "feed:muster-max")) == 32
    assert marke(k, "feed:a") != marke(k, "feed:b")
    print("Tresor ok: Ver- und Entschluesseln, Zufallsnonce, Pruefsumme, Marken.")


if __name__ == "__main__":
    if "--neu" in sys.argv:
        _neu()
    elif "--test" in sys.argv:
        _test()
    else:
        sys.exit(__doc__)
