# -*- coding: utf-8 -*-
"""Zeigt, welche CSS-Selektoren in docs/index.html mehrfach vorkommen und
ob sich die Vorkommen gefahrlos zusammenfassen liessen.

Hintergrund: Das Stylesheet ist in rund sechzig Schichten gewachsen
("Design 3...10", "Runde 11...64"); spaetere Bloecke gewinnen. Wer eine
Regel aendert, muss wissen, ob derselbe Selektor weiter unten noch einmal
steht - sonst wirkt die Aenderung nicht.

Eine Zusammenfassung gilt hier nur dann als gefahrlos, wenn zwischen dem
ersten und dem letzten Vorkommen keine andere Regel eine der betroffenen
Eigenschaften setzt. Stand 08.10.2026 trifft das auf keinen einzigen der
109 Faelle zu - das Stylesheet ist zu dicht verwoben, um mechanisch
umsortiert zu werden. Umbauten gehen nur Stueck fuer Stueck mit
Bildvergleich gegen referenz/.

    python werkzeuge/css_schichten.py
    python werkzeuge/css_schichten.py .leiste    # nur ein Selektor
"""
import collections
import io
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEITE = os.path.join(WURZEL, "docs", "index.html")


def regeln_lesen(css):
    """Regeln der obersten Ebene; @media-Bloecke werden uebersprungen."""
    raus = []
    i, n = 0, len(css)
    while i < n:
        auf = css.find("{", i)
        if auf < 0:
            break
        sel = " ".join(re.sub(r"/\*.*?\*/", "", css[i:auf], flags=re.S).split())
        if sel.startswith("@"):
            tiefe, j = 1, auf + 1
            while j < n and tiefe:
                if css[j] == "{":
                    tiefe += 1
                elif css[j] == "}":
                    tiefe -= 1
                j += 1
            i = j
            continue
        zu = css.find("}", auf)
        if zu < 0:
            break
        raus.append((sel, css[auf + 1:zu]))
        i = zu + 1
    return raus


def eigenschaften(koerper):
    namen = []
    for teil in re.split(r";(?![^(]*\))", koerper):
        if ":" in teil:
            namen.append(teil.split(":", 1)[0].strip().lower())
    return {x for x in namen if x and not x.startswith("/*")}


def main():
    filter_sel = sys.argv[1] if len(sys.argv) > 1 else None
    with io.open(SEITE, encoding="utf-8") as f:
        s = f.read()
    css = s[s.index("<style>"):s.index("</style>")]
    regeln = regeln_lesen(css)

    orte = collections.OrderedDict()
    for idx, (sel, koerper) in enumerate(regeln):
        if sel:
            orte.setdefault(sel, []).append(idx)

    mehrfach = [(sel, i) for sel, i in orte.items() if len(i) > 1]
    if filter_sel:
        mehrfach = [(sel, i) for sel, i in mehrfach if filter_sel in sel]

    frei, belegt = [], []
    for sel, idxe in mehrfach:
        betroffen = set()
        for k in idxe:
            betroffen |= eigenschaften(regeln[k][1])
        stoerer = None
        for mitte in range(idxe[0] + 1, idxe[-1]):
            if mitte not in idxe and betroffen & eigenschaften(regeln[mitte][1]):
                stoerer = regeln[mitte][0]
                break
        (belegt if stoerer else frei).append((sel, len(idxe), stoerer))

    print("Regeln auf oberster Ebene: %d, verschiedene Selektoren: %d"
          % (len(regeln), len(orte)))
    print("mehrfach vorhanden: %d" % len(mehrfach))
    print("  gefahrlos zusammenfassbar: %d" % len(frei))
    print("  dazwischen liegt etwas:    %d" % len(belegt))
    for sel, k, stoerer in sorted(belegt, key=lambda x: -x[1])[:15]:
        print("  %2dx  %-42s  dazwischen: %s" % (k, sel[:42], (stoerer or "")[:26]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
