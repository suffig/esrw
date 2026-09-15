#!/usr/bin/env python3
"""
Schickt Push-Nachrichten fuer neue, geaenderte und abgesetzte Einteilungen
an alle Mitglieder, die in der App Push eingeschaltet haben.

Laeuft im GitHub-Workflow direkt nach esrw_ical.py und liest dessen
aenderungen.json. Die Push-Abos kommen aus Supabase - mit dem
service_role-Schluessel, weil die Zugriffsregeln sonst nur die eigenen
Zeilen zeigen. Deshalb gehoert dieser Schluessel ausschliesslich in ein
GitHub-Secret.

Umgebung:
    SUPABASE_URL          Project URL
    SUPABASE_SERVICE_KEY  service_role-Schluessel (nie im Browser!)
    VAPID_PRIVATE         privater VAPID-Schluessel aus push_schluessel.py
    VAPID_KONTAKT         mailto:-Adresse des Betreibers (Pflicht laut Spezifikation)

Fehlt etwas davon, tut das Skript nichts und meldet das - der Workflow
laeuft weiter.

    pip install pywebpush
"""

import json
import os
import sys
import urllib.parse
import urllib.request

BASIS = os.path.dirname(os.path.abspath(__file__))


def api(url, schluessel, pfad, methode="GET", daten=None):
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/" + pfad, method=methode,
        data=json.dumps(daten).encode("utf-8") if daten is not None else None,
        headers={"apikey": schluessel, "Authorization": "Bearer " + schluessel,
                 "Content-Type": "application/json", "Prefer": "return=minimal"})
    with urllib.request.urlopen(req, timeout=30) as r:
        roh = r.read().decode("utf-8")
        return json.loads(roh) if roh else None


def main():
    url = os.environ.get("SUPABASE_URL", "").strip()
    service = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    vapid = os.environ.get("VAPID_PRIVATE", "").strip()
    kontakt = os.environ.get("VAPID_KONTAKT", "").strip() or "mailto:push@example.invalid"
    if not (url and service and vapid):
        print("Push: SUPABASE_URL, SUPABASE_SERVICE_KEY oder VAPID_PRIVATE fehlt - nichts zu tun.")
        return 0

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        print("Push: pywebpush fehlt (pip install pywebpush).")
        return 0

    pfad = os.path.join(BASIS, "aenderungen.json")
    if not os.path.exists(pfad):
        print("Push: keine aenderungen.json - nichts zu melden.")
        return 0
    with open(pfad, encoding="utf-8") as f:
        aenderungen = json.load(f).get("personen", {})
    if not aenderungen:
        print("Push: keine Aenderungen.")
        return 0

    # Wer hat Push an, und welche Person aus daten.json ist das?
    profile = api(url, service, "profile?select=id,slug&slug=in.(%s)"
                  % ",".join('"%s"' % s for s in aenderungen))
    slug_von = {p["id"]: p["slug"] for p in profile or []}
    if not slug_von:
        print("Push: keiner der Betroffenen hat ein Profil.")
        return 0
    abos = api(url, service, "push_abos?select=id,user_id,endpoint,p256dh,auth&user_id=in.(%s)"
               % ",".join(slug_von))
    if not abos:
        print("Push: keiner der Betroffenen hat Push an.")
        return 0

    gesendet, tot = 0, 0
    for abo in abos:
        slug = slug_von.get(abo["user_id"])
        a = aenderungen.get(slug) or {}
        zeilen = (["Neu: " + z for z in a.get("neu", [])]
                  + ["Geändert: " + z for z in a.get("geaendert", [])]
                  + ["Abgesetzt: " + z for z in a.get("entfallen", [])])
        if not zeilen:
            continue
        titel = "Einteilung: %s" % ", ".join(
            t for t, n in (("%d neu" % len(a.get("neu", [])), a.get("neu")),
                           ("%d geändert" % len(a.get("geaendert", [])), a.get("geaendert")),
                           ("%d abgesetzt" % len(a.get("entfallen", [])), a.get("entfallen"))) if n)
        nutzlast = json.dumps({"titel": titel, "text": "\n".join(zeilen)[:900],
                               "url": "./#" + slug}, ensure_ascii=False)
        try:
            webpush(
                subscription_info={"endpoint": abo["endpoint"],
                                   "keys": {"p256dh": abo["p256dh"], "auth": abo["auth"]}},
                data=nutzlast, vapid_private_key=vapid,
                vapid_claims={"sub": kontakt}, ttl=86400)
            gesendet += 1
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):
                # Abo ist tot (App deinstalliert, Berechtigung entzogen) - aufraeumen
                try:
                    api(url, service, "push_abos?id=eq." + urllib.parse.quote(abo["id"]), "DELETE")
                except Exception:
                    pass
                tot += 1
            else:
                print("Push an %s fehlgeschlagen: %s" % (slug, e), file=sys.stderr)
        except Exception as e:
            # Netzfehler o.ae. - ein einzelnes Abo darf den Lauf nicht abbrechen
            print("Push an %s nicht moeglich: %s" % (slug, str(e)[:120]), file=sys.stderr)
    print("Push: %d gesendet, %d tote Abos entfernt." % (gesendet, tot))
    return 0


if __name__ == "__main__":
    sys.exit(main())
