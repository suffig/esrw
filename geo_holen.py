#!/usr/bin/env python3
"""
Ergaenzt venues.json um Koordinaten (OpenStreetMap / Nominatim).

Muss nur laufen, wenn eine Halle dazukommt - die Koordinaten stehen danach in
venues.json und werden beim normalen Bauen nicht neu geholt.

    python geo_holen.py            # nur fehlende Hallen
    python geo_holen.py --alle     # alle neu holen
"""

import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BASIS = os.path.dirname(os.path.abspath(__file__))
UA = "esrw-ical/2.1 (privater Kalender-Export; Hallen-Koordinaten)"
PAUSE = 1.2  # Nominatim erlaubt eine Anfrage pro Sekunde

# Nur solche OSM-Objekte gelten als Sportstaette; alles andere
# (Autohoefe, Tankstellen, Strassen) wird als Namenstreffer abgelehnt.
SPORTSTAETTE = re.compile(
    r"ice_rink|sports_centre|sports_hall|stadium|arena|pitch|"
    r"leisure_centre|building/|tourism/attraction|amenity/community_centre",
    re.I)


def entfernung_km(a, b):
    """Grosskreis-Entfernung zwischen zwei Punkten."""
    r = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = math.radians(b[0] - a[0])
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def frage(suchbegriff):
    p = urllib.parse.urlencode({"q": suchbegriff, "format": "json",
                                "limit": 1, "countrycodes": "de,nl,be,lu"})
    req = urllib.request.Request(
        "https://nominatim.openstreetmap.org/search?" + p,
        headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)


def main():
    alle = "--alle" in sys.argv
    pfad = os.path.join(BASIS, "venues.json")
    with open(pfad, encoding="utf-8") as f:
        venues = json.load(f)

    offen = [(s, h) for s, h in venues["hallen"].items()
             if alle or not h.get("koordinaten")]
    if not offen:
        print("Alle Hallen haben schon Koordinaten.")
        return
    print("%d Halle(n) zu holen.\n" % len(offen))

    for slug, halle in offen:
        # Ort aus der Adresse ziehen: "Strasse 1, 47055 Duisburg" -> "Duisburg"
        m = re.search(r"\d{4,5}\s+(.+)$", halle["adresse"])
        ort = m.group(1) if m else ""
        # Die Adresse kommt aus dem Verbandsverzeichnis und ist die
        # verlaessliche Grundlage. Eine Suche nach dem Hallennamen trifft zwar
        # oft das Gebaeude genauer, geht aber auch mal daneben - in Paderborn
        # gibt es tatsaechlich einen Autohof namens "Eisbahn". Deshalb wird der
        # Namenstreffer nur uebernommen, wenn er dicht an der Adresse liegt.
        def punkt(suchbegriff):
            try:
                treffer = frage(suchbegriff)
            except Exception as e:
                print("  %-28s FEHLER (%s)" % (slug, e))
                return None, "", ""
            finally:
                time.sleep(PAUSE)
            if not treffer:
                return None, "", ""
            t = treffer[0]
            return ([round(float(t["lat"]), 6), round(float(t["lon"]), 6)],
                    t["display_name"], "%s/%s" % (t.get("class", ""), t.get("type", "")))

        basis, woher, _ = punkt(halle["adresse"])
        if basis is None:
            print("  %-28s KEIN TREFFER fuer die Adresse" % slug)
            continue

        genauer, name_woher, sorte = punkt("%s, %s" % (halle["name"], ort))
        art = "Adresse"
        if genauer:
            abstand = entfernung_km(basis, genauer)
            passend = SPORTSTAETTE.search(sorte)
            if abstand > 2.0:
                art = "Adresse (Namenstreffer %.1f km weg, verworfen)" % abstand
            elif not passend:
                # Naehe allein reicht nicht: in Paderborn liegt ein Autohof
                # namens "Eisbahn" 250 m neben der echten Adresse.
                art = "Adresse (Namenstreffer ist %s, verworfen)" % sorte
            else:
                basis, woher, art = genauer, name_woher, "Name"

        halle["koordinaten"] = basis
        print("  %-28s %-10s %-10s %s\n%s<- %s"
              % (slug, basis[0], basis[1], art, " " * 32, woher[:70]))

    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(venues, f, ensure_ascii=False, indent=2)
    fehlend = [s for s, h in venues["hallen"].items() if not h.get("koordinaten")]
    print("\nvenues.json geschrieben. Ohne Koordinaten: %s"
          % (", ".join(fehlend) if fehlend else "keine"))


if __name__ == "__main__":
    main()
