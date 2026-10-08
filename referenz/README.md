# Design-Referenz

Hier liegt je Design-Stand ein Ordner mit Bildschirmfotos bei 375 px und
dem passenden Git-Tag. Zweck: nach einem Umbau nachsehen, wie es vorher
aussah – und im Zweifel zurückkehren.

Die Bilder werden nicht ausgeliefert (sie liegen bewusst neben `docs/`,
nicht darin), kosten also nichts im Offline-Vorrat.

## Stände

| Ordner | Tag | Stand |
|---|---|---|
| `design-v126/` | `design-v126` | 08.10.2026, `app.js?v=126`, `sw.js v117` |
| `vor-umbau-b1-c1/` | `vor-umbau-b1-c1` | 08.10.2026, vor dem Umbau der Navigation und der CSS-Sortierung |

## Zurückkehren

Das **ganze CSS steht in `docs/index.html`**. Ein Rückfall betrifft also
genau eine Datei und lässt die Logik in `app.js` und `mitglieder.js` in
Ruhe:

```bash
git checkout design-v126 -- docs/index.html
```

Danach wie immer: Fassung in `docs/index.html` (`app.js?v=N`) und
`VERSION` in `docs/sw.js` hochzählen, prüfen, committen.

Nur einen einzelnen Abschnitt zurückholen? Erst den Unterschied ansehen:

```bash
git diff design-v126 -- docs/index.html
```

## Neuen Stand aufnehmen

1. `git tag -a design-vN -m "…"` auf dem veröffentlichten Commit
2. Browser-Pane bei 375 px, Attrappe an (`docs/supabase.json` auf
   `"mock": true`, Klartextdaten daneben), und dieselben vier Ansichten
   fotografieren: Startseite dunkel, Spielplan hell, Spielseite hell,
   Einstellungen mit dem Push-Feld hell
3. Bilder nach `referenz/design-vN/`, Zeile in der Tabelle oben ergänzen
