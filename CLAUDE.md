# ESRW App – wie hier gearbeitet wird

Schiedsrichter-Einteilungen des ESRW als PWA auf **www.esrw.app**
(GitHub Pages aus `docs/`), dazu ein Python-Teil, der stündlich per
GitHub Actions läuft.

## Aufbau

| Teil | Datei | Aufgabe |
|---|---|---|
| Oberfläche | `docs/index.html` | Markup **und das ganze CSS** (Schichten, siehe unten) |
| Öffentliche Logik | `docs/app.js` | Start, Spielplan, Spielseite, Archiv, Änderungen, Karte |
| Mitgliederbereich | `docs/mitglieder.js` | Konto, Abrechnung, Rechnung, Info, Notizen, Admin |
| Rechnung | `docs/rechnung.js` | PDF der Gebührenabrechnung (eigener PDF-Schreiber) |
| Offline | `docs/sw.js` | Service Worker, netz-zuerst |
| Anleitung | `docs/tutorial/index.html` | www.esrw.app/tutorial – eigene Seite, Kapitel als `<section>`, Pflegehinweise im Kopf. Knopfnamen wie in der App: wer einen umbenennt, ändert ihn hier mit |
| Einteilungen holen | `esrw_ical.py` | esrw.de auslesen, Feeds, `daten.json`, Protokoll |
| Push | `push_senden.py` | Web Push über den Workflow |
| Tresor | `tresor.py` | AES-256-GCM für die Daten in `docs/` |
| Datenbank | `supabase/schema.sql` | Tabellen und Zugriffsregeln, fortlaufend v1…vN |

Kein Paketmanager, kein Bauschritt, keine Abhängigkeiten im Browser
ausser Leaflet (von der CDN, nur für Karten) und supabase-js.

## Sprache und Stil

* **Deutsch**: Bezeichner, Kommentare, Commit-Nachrichten, Oberfläche.
  Kommentare in ASCII (`ae`, `oe`, `ue`, `ss`) – der Rest mit Umlauten.
* Kommentare erklären **warum**, nicht was. Keine Kommentare, die den
  Code wiederholen.
* Vanilla JS im Stil der Umgebung: `var`, `function`, keine Pfeilfunktionen,
  keine Klassen, `document.createElement` bzw. der `h()`-Helfer in
  `mitglieder.js`.

## Änderungen an den grossen Dateien

`docs/app.js` und `docs/mitglieder.js` sind mehrere tausend Zeilen lang.
Änderungen laufen über ein **Patch-Skript im Scratchpad**, geschrieben mit
dem Write-Tool:

```python
def datei(pfad, paare):
    s = io.open(pfad, encoding='utf-8').read()
    for a, b in paare:
        assert s.count(a) == 1, (pfad, s.count(a), a[:90])   # Einzeltreffer
        s = s.replace(a, b)
    io.open(pfad, 'w', encoding='utf-8', newline='\n').write(s)
```

**Nie über ein Bash-Heredoc** – die Shell frisst hier Backslashes, aus
`\n` wird ein echter Zeilenumbruch und aus `\\u00e4` ein kaputtes Zeichen.
Umlaute und Sonderzeichen im Patch-Skript als echte Zeichen schreiben,
nicht als `\u…`-Fluchtsequenz.

## CSS

Alles in `docs/index.html`, in Schichten ("Design 1…14", "Runde 15…21").
**Spätere Blöcke gewinnen** – eine Korrektur muss also hinter die Regel,
die sie überschreiben soll; im Zweifel ans Ende ("Nachtrag"). Bei
gleicher Spezifität gewinnt die letzte Regel, bei höherer die
spezifischere: `.mg-zeile input` schlägt `.mg-zeile > *`.

### Der Präfix `:root[data-design="neu"]` bleibt

Seit Fassung 204 gibt es nur ein Design, und das Attribut steht fest
am `<html>`-Tag – die 146 Selektoren mit diesem Präfix sehen deshalb
nach Altlast aus. Sie sind keine: der Präfix trägt Spezifität, auf die
sich andere Regeln verlassen.

Gemessen (Fassung 206, Browser-Pane, alle berechneten Stile vorher und
nachher verglichen): pauschal entfernt ändern sich **1018 von 1128
Elementpositionen**. Auch die vorsichtige Auswahl – nur die 72 Regeln
ohne gleichlautendes präfixloses Gegenstück – ändert über 14 Seiten
noch an drei Stellen etwas, darunter die 44-px-Tippflächen der
Leaflet-Knöpfe: Leaflet bringt dieselbe Regel mit, und sein Stylesheet
kommt per JS, also später.

Ein Selektorvergleich findet das nicht. Wer den Präfix doch anfassen
will, misst vorher – Regel für Regel, in jedem Thema und jeder
Fensterbreite.

## Prüfen

* `node --check docs/*.js`, `python tests/test_esrw.py`,
  `node tests/test_abrechnung.js` und `node tests/test_spielplan.js` –
  die ersten beiden laufen auch als Hook automatisch.
* Die beiden Node-Tests laden `docs/mitglieder.js` bzw. `docs/app.js`
  mit der Browser-Attrappe aus `tests/attrappe_browser.js` in Node und
  rechnen über die Luken `window.Mitglieder.pruefstand` und
  `window.ESRW.pruefstand`. Im Abrechnungstest stehen Beträge,
  Zuschläge, eigene Regeln, Fahrtkosten und Rechnungsnummern; im
  Spielplantest der Spielschlüssel, die Zeitraum-Gruppierung, die
  Ligagruppen, die Suchtexte und die Chipfarben. **Jeder Fall, der
  einmal falsch gerechnet hat, gehört danach als Zeile hinein.**
* In die Luken kommt nur, was ohne DOM rechnet. Was die Felder der
  Oberfläche liest – `planGefiltert()` etwa – gehört in den
  Browser-Durchgang, nicht an eine Attrappe.
* Aussehen immer im Browser-Pane: `preview_start {name: "docs"}`,
  Ansicht 375 px, einmal angemeldet und einmal abgemeldet durchklicken,
  Konsole auf Fehler, `document.documentElement.scrollWidth` gegen die
  Fensterbreite (kein horizontaler Überlauf).
* **Alle** Seiten, nicht nur die geänderten, und die Konsole auf
  `Uncaught` ansehen. `seit is not defined` in `zeigeStatistik()` lag
  von Fassung 204 bis 216 draussen und nahm die Statistikseite samt
  der Saisonliste darunter mit: in 204 verschwand die Variable, der
  Verweis blieb. `node --check` sieht das nicht – ein freier Name ist
  gültiges JavaScript, der Fehler kommt erst beim Aufruf. Ein
  Hash-Durchlauf über alle Ansichten kostet eine Minute:

  ```js
  for (var i = 0; i < ziele.length; i++) { location.hash = ziele[i]; await warte(650); }
  ```
* **Wer einen Block aus der Seite nimmt, sieht nach, was darin geladen
  wurde.** `aktualisiereSummen()` beginnt mit
  `if (!wurzel.querySelector(".mg-summenblock")) return;` – und holte
  darin die Rechnungsliste. Als der Summenblock in Fassung 250 nur noch
  in den Stufen zum Nachsehen stand, blieb `aufRechnung` in jeder
  Arbeitsstufe leer: die Stufen „Abrechnen" und „Unterwegs"
  verschwanden aus der Leiste, der Geldweg teilte sich nicht mehr auf.
  `node --check` und die Testläufe sahen davon nichts – gefunden hat es
  erst der Durchgang im Pane. Laden gehört dorthin, wo die Seite
  entsteht, nicht in einen Block, den es manchmal nicht gibt.
* **Einen Rückruf, den man einbaut, muss man auch auslösen.** In
  Fassung 259 kam `datenGeaendert` in den Kontext und rief `aktuell()`
  – `aktuell` ist aber die angezeigte Person, keine Funktion. Beim
  Start stand „aktuell is not a function" in der Konsole. Der
  Durchgang sah davon nichts, weil der Rückruf nur feuert, wenn
  wirklich ein Name geändert ist, und die Attrappe mit leerer
  `namen_alias`-Tabelle lief. Wer einen Pfad einbaut, der an eine
  Bedingung hängt, stellt die Bedingung in der Attrappe her – sonst
  prüft der Durchgang alles ausser der neuen Zeile.
* **Zähler und Liste kommen aus derselben Funktion.** In Fassung 276
  zählte die Leiste `zuPruefen` (Lücken *und* falsche Beträge), die
  Liste darunter filterte weiter `hatLuecke`. Am Knopf stand „Prüfen –
  10 Spiele", darunter lagen acht Karten, und die beiden Spiele mit
  falschem Betrag – der Anlass des ganzen Umbaus – waren nirgends zu
  sehen. `node --check` und die Testläufe sahen davon nichts: beide
  Funktionen sind für sich richtig. Wer ein Prädikat erweitert, sucht
  **alle** Stellen, die es benutzen – `grep -n` auf den alten Namen,
  nicht nur die, die man gerade umbaut.
* **Ein Ablauf an zwei Stellen wird an beiden korrigiert.** Eine
  geschriebene Rechnung hakte das Spiel sofort als bezahlt ab. Bei der
  Einzelrechnung (`rechnungErzeugen`) war das behoben – im
  Rechnungslauf (`laufEine`) stand dieselbe Zeile weiter, und die
  Spiele sprangen dort bis Fassung 277 an „Geld“ vorbei ins Archiv.
  Wer eine Regel ändert, sucht jede Stelle, die denselben Schritt tut:
  `grep -n` auf das Feld (`bezahlt:`), nicht auf den Funktionsnamen.
* **Vor einem neuen Klassennamen `grep` auf den Namen.** In Fassung 311
  bekamen Leerzustände die Klasse `mit-bild` – die gab es schon für
  Avatarfotos, mit `color:transparent` und `text-indent:-999px`. Bild
  und Knopf standen da, der Satz dazwischen war unsichtbar.
  `node --check` und die Tests sahen nichts; gefunden hat es der
  Screenshot.
* **Backticks nie in ein doppelt gequotetes `python -c "…"`.** Bash
  führt sie als Befehle aus und setzt das (leere) Ergebnis ein – so
  verlor genau dieser Eintrag beim ersten Schreiben alle Code-Namen,
  ohne Fehlermeldung von Python. Texte mit Backticks gehören in ein
  Patch-Skript, geschrieben mit dem Write-Tool.
* **Einordnungen gegen echte Namen prüfen, nicht gegen erfundene.**
  `ligaEinordnen()` lief bis Fassung 277 mit allen Tests durch – die
  Tests kannten „RL West", esrw.de liefert „Senioren RLW". Die
  Herrenregel prüfte `\bRL\b`, das W dahinter ließ sie durchfallen, und
  die Regionalliga landete in der Bezirksliga: HSR 100 statt 160 €,
  angezeigt als „falsch“. Die echten Ligennamen stehen im Klartext in
  der Historie (`git show 9a2e5732:docs/daten.json`, ins Scratchpad,
  danach löschen); jeder davon steht jetzt als Zeile im
  Abrechnungstest.
* **Eine neue Spalte im `select` braucht einen Rückfall.** `rechnungenLaden()`
  fragte `gezahlt_am` (v54) mit ab; fehlte die Spalte, scheiterte die
  Abfrage, und `.catch` machte daraus still eine leere Liste. Die App sah
  wochenlang keine einzige Rechnung – nach dem Einspielen des Schemas
  standen alle auf einmal als offen da. Neue Spalten erst mit, bei Fehler
  ohne sie fragen (`holen(mit).catch(function () { return holen(ohne); })`).
* **Zwei Funktionen gleichen Namens: die zweite gewinnt überall.**
  `offeneRechnungen` stand bis Fassung 284 zweimal in `mitglieder.js`
  (Liste → Summe, Slug → Startseite); die Rechnungsübersicht bekam ein
  Promise statt einer Summe. `node --check` meldet das nicht. Vor jedem
  Freigeben:

  ```bash
  grep -oE "^  function [A-Za-z0-9_]+" docs/mitglieder.js | sort | uniq -d
  ```
* Tippflächen: alles, was man antippt, ist 44 px hoch. Gemessen wird
  mit `elementFromPoint` um die Elementmitte, **nicht** nur mit
  `getBoundingClientRect` – das sieht ein `::after` nicht und meldet
  die Kopfknöpfe falsch als zu klein. Die Kopfknöpfe liegen bei
  42 × 44 (36 px plus `::after -4px -3px`, 6 px Lücke); mehr ginge
  nur auf Kosten des Nachbarn. Für einen schnellen Überblick:

  ```js
  [].slice.call(document.querySelectorAll('button, a[href], input, select, summary'))
    .filter(function (e) { var r = e.getBoundingClientRect();
      return e.offsetParent && r.height && r.height < 44; }).length
  ```

  Node findet das nie – dort gibt es keine Layout-Engine.
* Die Attrappe für den Browser liegt nicht im Repository – `daten.json`
  mit `personen[].spiele` (nicht `termine`), `statistik.gesamt`,
  `rollen`, `hallen`, `adressen`, dazu `archiv.json`, ein leeres Array
  in `protokoll.json` und `archiv/<saison>.json`. Dazu im localStorage
  `mock_session` und `mock_funktionen` (ohne die sind alle Funktionen
  aus und halbe App unsichtbar). Hinterher alle vier Dateien löschen.
* Zum Testen `docs/supabase.json` auf `"mock": true` stellen – das ist
  die Attrappe im Browser. **Vor jedem Commit zurücksetzen.**
* Verschlüsselte Daten testen: Klartext aus der Historie holen, mit dem
  Probeschlüssel `UFJPQkUtU0NITFVFU1NFTC0zMi1CWVRFUy1MQU5HISE=`
  verschlüsseln, `mock_tresor` im localStorage setzen, hinterher die
  echten `.bin` mit `git checkout --` zurückholen.

## Veröffentlichen

`/freigeben` – oder von Hand: Attrappe zurücksetzen, `app.js?v=N` in
`docs/index.html` und `VERSION` in `docs/sw.js` hochzählen, prüfen,
committen, `git pull --rebase && git push`, dann warten, bis
www.esrw.app die neue Fassung ausliefert (`curl -sL`, ohne `-L` kommt
nur die 301).

Der Workflow committet stündlich selbst (`Einteilungen aktualisiert …`).
Bei Rebase-Konflikten in erzeugten Dateien gilt die Fassung vom Server.

## Daten und Geheimnisse

* Die Daten in `docs/` liegen verschlüsselt (`.bin`), Schlüssel in der
  Supabase-Tabelle `tresor`, nur für Freigeschaltete lesbar.
* Seit Fassung 311 ist der Klartext vor dem Verschlüsseln gzip-gepackt
  (Kennung `ESRW2`, `ESRW1` bleibt lesbar). `stand.json` trägt unter
  `marken` einen Abdruck jeder großen Datei; die App lädt sie nur neu,
  wenn er sich ändert (`daten.json.bin?m=<marke>`).
* Ein Spiel heißt überall nach seiner **Kennung aus der Registratur**
  (`spiel_kennungen`, v51): die von der ersten Sichtung, auch nach
  einer Verlegung. Sie sieht aus wie `beginn|paarung`, ist aber kein
  Rechenergebnis – nie aus Anstoß und Paarung nachbauen. Die
  Saisondateien `docs/archiv/<saison>.json` tragen sie seit Fassung 316
  als sechste Spalte (`saison_zeile_kennung()` / `saisonKennung()`);
  bis dahin hätte ein verlegtes Spiel beim Einfrieren eine zweite Zeile
  bekommen, und Abrechnung, Notizen und Mitfahrten hingen an nichts.
* Der Schlüssel liegt als GitHub-Secret `DATEN_SCHLUESSEL`; er gehört
  **nirgendwo sonst hin** – nicht ins Repository, nicht in einen Chat.
* `docs/supabase.json` enthält die öffentliche anon-Kennung. Das ist
  Absicht; was sie darf, steht in `supabase/schema.sql`.
* Schutz entsteht in den RLS-Regeln, nicht in der App. Jede neue Tabelle
  braucht `enable row level security` und eine Regel, die sagt, wer
  lesen darf: nur ich / nur freigeschaltet / (selten) anon.

## Schema

`supabase/schema.sql` ist idempotent und wächst nach unten (v1…vN). Neue
Änderungen immer als neuer Abschnitt mit Nummer und Begründung anhängen;
der Betreiber spielt die Datei von Hand im SQL-Editor ein.
