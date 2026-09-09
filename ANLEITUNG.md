# Anleitung

Was du tun musst, in der Reihenfolge. Rechne mit 20–30 Minuten für alles.

---

## Schritt 1 – Einmal lokal ausprobieren

Damit du siehst, dass es tut, bevor irgendwas online geht. Erst der Test, der
läuft ohne Netz:

```bash
python tests/test_esrw.py
```

Muss mit „Alle Prüfungen bestanden" enden. Dann das eigentliche Bauen:

```bash
python esrw_ical.py
```

Ausgabe sollte ungefähr so aussehen:

```
69 Spiele gefunden (43 aktuell, 26 aus den letzten 30 Tagen).
60 Personen.
Archiv: 69 Spiele insgesamt (0 neu), Saison 2026/27.
61 Feeds geschrieben nach docs/feeds/.
```

Die Seite anschauen:

```bash
python -m http.server 8765 --directory docs
```

Dann im Browser <http://localhost:8765> öffnen. Du solltest die Namensliste
sehen, deinen Namen suchen und deine Spiele sehen können. Beenden mit `Strg+C`.

> Findest du dich nicht in der Liste? Dann warst du in den letzten 30 Tagen
> nicht eingeteilt. Sobald du eingeteilt wirst, tauchst du automatisch auf –
> du musst nichts eintragen.

---

## Schritt 2 – Auf GitHub hochladen

Du brauchst ein GitHub-Konto (kostenlos).

1. Auf <https://github.com/new> ein Repository anlegen.
   * Name z.B. `esrw-einteilungen`
   * **Public** wählen (siehe Kasten unten)
   * „Add a README" **nicht** ankreuzen
2. Diesen Ordner hochladen. Wenn du Git installiert hast, im Projektordner:

```bash
git init
git add .
git commit -m "Einteilungen als Kalender-Feeds"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/esrw-einteilungen.git
git push -u origin main
```

Ohne Git geht es auch über die Weboberfläche: im leeren Repository auf
„uploading an existing file" klicken und alle Dateien hineinziehen.

> **Warum public?** GitHub Pages funktioniert bei privaten Repositories nur mit
> einem kostenpflichtigen Konto. Public heißt: die Namen deiner Kollegen und
> ihre Einteilungen stehen unter einer öffentlichen Adresse. Die gleichen Daten
> stehen zwar schon offen auf esrw.de – aber dort sind sie nicht so bequem
> durchsuchbar. **Sprich das einmal kurz mit dem ESRW ab, bevor du den Link
> herumgibst.** Das ist keine Formalie: du veröffentlichst Daten über andere
> Leute, und die sollten davon wissen.

---

## Schritt 3 – GitHub Pages einschalten

Im Repository: **Settings → Pages**

* Source: `Deploy from a branch`
* Branch: `main`, Ordner: `/docs`
* Speichern

Nach ein bis zwei Minuten ist deine Seite erreichbar unter:

```
https://DEIN-NAME.github.io/esrw-einteilungen/
```

Das ist der Link, den du den Kollegen gibst.

---

## Schritt 4 – Automatik einschalten

Im Repository auf den Reiter **Actions**. GitHub fragt einmal nach, ob
Workflows laufen dürfen – bestätigen.

Danach unter Actions den Workflow „Einteilungen aktualisieren" auswählen und
einmal **Run workflow** drücken, um zu sehen, dass er durchläuft (grüner Haken).

Ab jetzt läuft er alle 30 Minuten von selbst und aktualisiert alle Feeds.

> Läuft der Workflow rot? Meistens fehlt die Schreibberechtigung. Unter
> **Settings → Actions → General → Workflow permissions** auf
> „Read and write permissions" stellen.

---

## Schritt 5 – Auf deinem iPhone abonnieren

1. Deine Seite im Safari öffnen, Namen suchen, antippen.
2. Auf **Im Kalender abonnieren** tippen.
3. iOS fragt nach → **Abonnieren**.
4. **„Alarme entfernen" auf AUS** stellen. Steht das auf An, wirft iOS genau
   die Erinnerungen weg, um die es hier geht.
5. Bei **Aktualisieren** „Alle 15 Minuten" oder „Stündlich" wählen. Die
   Voreinstellung ist träge.

Passiert beim Antippen nichts, nimm auf der Seite **Link kopieren** und trage
ihn hier ein: Einstellungen → Apps → Kalender → Accounts → Account hinzufügen →
Andere → Kalenderabo hinzufügen.

Der Kalender ist nur lesend. Änderungen macht immer der ESRW, du bekommst sie
automatisch nach. Ändert sich Zeit oder Halle, steht eine Woche lang ein ⚠ im
Termintitel und in der Beschreibung, was vorher galt.

**Noch als App auf den Startbildschirm:** in Safari auf *Teilen* → *Zum
Home-Bildschirm*. Dann hat die Seite ein eigenes Symbol, startet ohne
Browserleiste und zeigt die Einteilungen auch dann, wenn du in der Halle keinen
Empfang hast.

---

## Schritt 6 – Kollegen Bescheid geben

Du gibst einfach den Link aus Schritt 3 weiter. Jeder sucht seinen eigenen
Namen und abonniert seinen eigenen Kalender. Auf der Seite steht die Anleitung
für iPhone und Android unter „Wie abonniere ich das?" – du musst niemandem
etwas erklären.

Wenn du jemandem seinen Kalender direkt schicken willst, hängst du den Namen an
die Adresse an:

```
https://DEIN-NAME.github.io/esrw-einteilungen/#garbsch-rene
```

Die Kurzform steht in `docs/daten.json` unter `slug`, oder du siehst sie in der
Adresszeile, sobald du jemanden angetippt hast.

---

## Schritt 7 (optional) – Push-Nachricht bei neuer Einteilung

Das Kalender-Abo aktualisiert still im Hintergrund. Wenn du zusätzlich aktiv
Bescheid bekommen willst:

1. App **ntfy** installieren (iOS und Android, kostenlos, kein Konto nötig).
2. In der App ein Thema abonnieren, z.B. `esrw-philip-k7t2x9`.
   **Wer das Thema kennt, liest mit** – also nichts Erratbares nehmen.
3. In `config.json` unter `eigene_namen` deine Schreibweise eintragen:

```json
"eigene_namen": ["Melchert, Philip"]
```

4. Im Repository: **Settings → Secrets and variables → Actions → New
   repository secret**, Name `NTFY_TOPIC`, Wert das Thema von oben.

Ab dann bekommst du eine Nachricht, sobald bei dir eine Einteilung dazukommt,
sich ändert oder **du aus einem Spiel herausgenommen wirst** – letzteres würde
sonst kommentarlos vom Handy verschwinden. Außerdem meldet sich der Workflow,
wenn er selbst scheitert; ohne das würden die Kalender still einfrieren.

Das gilt nur für dich – für die Kollegen bleibt es beim Kalender-Abo, weil jeder
sein eigenes Thema bräuchte.

Lokal testen:

```bash
NTFY_TOPIC=esrw-philip-k7t2x9 python esrw_ical.py
```

---

## Wenn mal etwas nicht stimmt

| Symptom | Ursache und Abhilfe |
|---|---|
| Workflow schlägt fehl mit „keine Spiele gefunden" | Der ESRW hat die Seite umgebaut. Das ist Absicht so gebaut: lieber Abbruch als leere Kalender, die allen die Termine löschen. Anzupassen ist `parse_seite()` in `esrw_ical.py` – die einzige Stelle, die HTML anfasst. |
| Bei einem Spiel steht „Halle nicht automatisch erkannt" | Neuer Verein oder ungewohnte Schreibweise. In `venues.json` unter `vereine` ergänzen, Schreibweise egal, danach einmal `python geo_holen.py`. Steht auf esrw.de gar kein Ort, kann das Skript auch keinen finden. |
| Test schlägt fehl mit „alle Hallen haben Koordinaten" | Neue Halle ohne Koordinaten. `python geo_holen.py` holt nur die fehlenden nach. |
| Statistik zeigt wenig an | Das Archiv sammelt erst ab dem ersten Lauf. Achte darauf, dass `historie.json` mit im Repository liegt und nicht in `.gitignore` steht. |
| Jemand taucht doppelt in der Liste auf | Auf esrw.de zwei Schreibweisen, die zu weit auseinanderliegen (z.B. Tippfehler im Nachnamen). Gleiche Namensbestandteile werden automatisch zusammengefasst, echte Abweichungen nicht. |
| Termine erscheinen, aber ohne Erinnerung | Beim Abonnieren stand „Alarme entfernen" auf An. Abo löschen und neu anlegen. |
| Neue Einteilung ist auf der Seite, aber nicht im Handy | iOS aktualisiert Abos träge. Im Kalender einmal nach unten ziehen, oder das Intervall wie in Schritt 5 herabsetzen. |
