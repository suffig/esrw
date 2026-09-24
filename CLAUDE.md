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

## Prüfen

* `node --check docs/*.js` und `python tests/test_esrw.py` – beides läuft
  auch als Hook automatisch.
* Aussehen immer im Browser-Pane: `preview_start {name: "docs"}`,
  Ansicht 375 px, einmal angemeldet und einmal abgemeldet durchklicken,
  Konsole auf Fehler, `document.documentElement.scrollWidth` gegen die
  Fensterbreite (kein horizontaler Überlauf).
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
