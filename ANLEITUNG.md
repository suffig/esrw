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

Die GitHub-Oberfläche ist auf Englisch, deshalb hier die Bezeichnungen genau so,
wie sie auf dem Bildschirm stehen. Die Adressen gelten für `suffig/esrw`.

### 4.1 Actions freischalten

<https://github.com/suffig/esrw/settings/actions>

Unter **Actions permissions**:

* **Allow all actions and reusable workflows** auswählen
* **Save** drücken

Direkt darunter auf derselben Seite, Abschnitt **Workflow permissions**:

* **Read and write permissions** auswählen — ohne das darf der Workflow die
  aktualisierten Feeds nicht ins Repository zurückschreiben, und jeder Lauf
  scheitert am `git push`
* **Save** drücken (das ist ein *zweiter* Save-Knopf, der erste zählt nicht mit)

### 4.2 Workflow das erste Mal starten

<https://github.com/suffig/esrw/actions>

Beim ersten Besuch zeigt GitHub den Hinweis *„Workflows aren't being run on this
forked repository"* oder einen grünen Knopf **I understand my workflows, go ahead
and enable them**. Falls er erscheint: drücken.

Dann:

1. In der linken Spalte unter **All workflows** auf **Einteilungen aktualisieren**
2. Rechts auf den grauen Knopf **Run workflow**
3. Im Aufklappmenü: *Use workflow from* → `Branch: main`, den Haken bei
   *Absichtlich scheitern…* **leer lassen**
4. Grüner Knopf **Run workflow**

Nach ein paar Sekunden erscheint der Lauf in der Liste. Draufklicken →
**aktualisieren** → dort siehst du die einzelnen Schritte. Alle mit grünem Haken
heißt: es läuft.

Ab jetzt startet er alle 30 Minuten von selbst.

### 4.3 Was die Überwachung genau tut

Drei Sicherungen, die verhindern, dass ein Ausfall unbemerkt bleibt:

| Sicherung | Wo | Was passiert |
|---|---|---|
| **Regressionstest** | Schritt *Regressionstest* | Prüft ohne Netz gegen `tests/beispielseite.html`, ob Auslesen, Hallenfindung und iCalendar-Aufbau noch stimmen. Schlägt fehl, bevor irgendetwas veröffentlicht wird. |
| **Null-Spiele-Sperre** | Schritt *Feed bauen* | Findet das Skript keine Spiele — etwa weil esrw.de umgebaut wurde — bricht es ab. Ein leerer Kalender würde allen Abonnenten die Termine vom Handy löschen. |
| **Fehler-Benachrichtigung** | Schritt *Bei Fehler benachrichtigen* | Läuft nur, wenn vorher etwas schiefging (`if: failure()`), und schickt eine Push-Nachricht mit Link zum Lauf. |

Ohne die dritte Sicherung würden die Feeds bei einem Fehler einfach einfrieren –
die Kalender blieben auf dem letzten Stand stehen, und niemand würde etwas
merken, bis jemand vergeblich zu einem Spiel fährt.

### 4.4 Fehlermeldungen per E-Mail (zusätzlich)

GitHub schickt von sich aus eine E-Mail, wenn ein Workflow scheitert. Prüfen
kannst du das unter <https://github.com/settings/notifications>, Abschnitt
**Actions**:

* **Notify me: Email** ankreuzen
* **Send notifications for: Failed workflows only** auswählen

Das kommt an deine GitHub-Adresse und ist unabhängig von ntfy. Die Push-Nachricht
aus Schritt 7 ist schneller, die E-Mail ist die Rückfallebene.

### 4.5 Wenn ein Lauf rot ist

Auf den roten Lauf klicken, dann auf den fehlgeschlagenen Schritt – die
Fehlermeldung steht ganz unten in der Ausgabe.

| Meldung im Log | Bedeutung |
|---|---|
| `Permission to … denied to github-actions[bot]` oder `403` beim `git push` | Schreibrechte fehlen → 4.1, **Workflow permissions** |
| `FEHLER: keine Spiele gefunden` | esrw.de wurde umgebaut → `parse_seite()` in `esrw_ical.py` anpassen |
| `Pruefung(en) fehlgeschlagen` im Regressionstest | Eine Änderung am Skript hat etwas kaputt gemacht; die Liste darunter sagt was |
| `FEHLER: … nicht erreichbar` | esrw.de war kurz weg. Passiert; der nächste Lauf in 30 Minuten holt es nach |
| `alle Hallen haben Koordinaten` | Neue Halle in `venues.json` ohne Koordinaten → `python geo_holen.py` |

> **Nach 60 Tagen ohne Aktivität** schaltet GitHub geplante Workflows ab und
> zeigt oben ein Banner mit dem Knopf **Enable workflow**. Da dieser Workflow
> regelmäßig selbst committet, sollte das nicht eintreten – falls doch, einmal
> auf den Knopf drücken.

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

### Die zwei Wecker

**Termin selbst** beginnt zum Treffpunkt, also eine Stunde vor Spielbeginn.

**Eingebauter Alert:** eine Stunde vor dem Termin – bei Spielbeginn 18:00 Uhr
also um 16:00 Uhr. Änderbar in `config.json` unter `erinnerungen`.

**Abfahrtszeitpunkt** rechnet iOS selbst aus, verkehrsabhängig vom aktuellen
Standort. Dafür einmal einschalten:

**Einstellungen → Apps → Kalender → Standardwarnzeiten → „Mit aktueller
Wegzeit"** (je nach iOS-Version auch „Zeit zum Aufbrechen" oder „Zeit zum
Losfahren").

Zusätzlich braucht der Kalender den Standort:
**Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Kalender →
Beim Verwenden der App**.

Die Termine bringen Adresse **und** Koordinaten mit, damit iOS die Halle
sicher findet – ohne das kann es keine Fahrzeit rechnen.

> **Ehrliche Einschränkung:** Ich kann von hier aus nicht prüfen, ob iOS diese
> Funktion auch bei *abonnierten* Kalendern anbietet – abonnierte Termine sind
> schreibgeschützt, und die Funktion ist laut Nutzerberichten ohnehin
> wechselhaft (schaltet sich nach Updates gelegentlich selbst ab). Prüf beim
> nächsten Spiel, ob die Meldung kommt.
>
> Kommt sie nicht, trag stattdessen einen festen Wecker in `config.json` ein –
> eine Zeile genügt:
>
> ```json
> "erinnerungen": [
>   { "wann": "-PT1H",  "text": "In einer Stunde an der Halle" },
>   { "wann": "-PT45M", "text": "Losfahren" }
> ]
> ```
>
> `-PT45M` heißt 45 Minuten vor dem Treffpunkt. Das gilt dann für alle
> Kollegen gleich, weil alle denselben Feed-Bauplan benutzen.

### Als App auf den Startbildschirm

In Safari auf *Teilen* → *Zum Home-Bildschirm*. Dann hat die Seite ein eigenes
Symbol, startet ohne Browserleiste und zeigt die Einteilungen auch dann, wenn du
in der Halle keinen Empfang hast.

**Das lohnt sich auch aus einem zweiten Grund:** Mitteilungen funktionieren auf
dem iPhone ausschließlich, wenn die App auf dem Home-Bildschirm liegt. In einem
normalen Safari-Tab gibt es sie nicht.

### Profil und Mitteilungen in der App

Beim ersten Öffnen fragt die App **„Wer bist du?"**. Nach der Auswahl startet sie
immer direkt mit deinen Spielen und deiner Statistik. Über **Wechseln** in der
Kopfzeile lässt sich das ändern.

Die Auswahl liegt nur in deinem Handy – keine Anmeldung, kein Konto. Schickst du
jemandem den Link mit deinem Namen dran (`…/#garbsch-rene`), sieht er deine
Spiele, ohne dass sein eigenes Profil überschrieben wird.

Darunter steht die Karte **Benachrichtigungen**. Ein Tipp auf *Einschalten*, iOS
fragt nach, fertig. Danach meldet sich die App, wenn eine Einteilung dazukommt
oder sich ändert, und das Symbol auf dem Home-Bildschirm zeigt die Anzahl.

> **Wichtige Einschränkung, ehrlich gesagt:** Die App meldet sich, **wenn du sie
> öffnest** oder aus dem Hintergrund holst – nicht von selbst im Hintergrund.
> Für echtes Hintergrund-Push bräuchte es einen Absender mit geheimem Schlüssel
> und eine Liste aller Push-Adressen. In einem öffentlichen Repository wäre die
> für jeden lesbar, deshalb ist sie bewusst nicht gebaut.
>
> Der Zähler am Symbol bleibt aber stehen, auch wenn die App zu ist – du siehst
> also beim Blick aufs Handy, dass etwas dazugekommen ist. Willst du eine echte
> Meldung ohne Öffnen, nimm zusätzlich Schritt 7.

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

## Schritt 7 – Meldung bei neuer Einteilung

Das Kalender-Abo aktualisiert still im Hintergrund. Damit du aktiv Bescheid
bekommst, wenn eine Einteilung dazukommt, sich ändert oder **du herausgenommen
wirst**, gibt es zwei Wege. Sie schließen sich nicht aus.

Beide melden nur *deine* Einteilungen. Dafür muss in `config.json` deine
Schreibweise stehen – genau so, wie sie auf esrw.de steht
(`python esrw_ical.py --wer` listet alle auf):

```json
"eigene_namen": ["Melchert, Philip"]
```

### Weg A – GitHub-Issue (ohne zusätzliche App)

Braucht **keine Einrichtung**. Sobald sich bei dir etwas ändert, legt der
Workflow im Repository ein Issue an. GitHub verschickt dafür von sich aus eine
E-Mail an dich als Eigentümer.

Falls keine E-Mail kommt, prüfe:

* <https://github.com/suffig/esrw> oben rechts **Watch** → **All Activity**
  (oder mindestens *Participating and @mentions* plus **Issues**)
* <https://github.com/settings/notifications> → **Watching** → **Email**
  angehakt

Wer die **GitHub-App** auf dem iPhone hat, bekommt dazu eine echte
Push-Nachricht – das ist der schnellste Weg ohne weitere Installation.

### Weg B – ntfy (echter Push, eigene App)

1. App **ntfy** installieren (iOS und Android, kostenlos, kein Konto nötig).
2. App öffnen und die Nachfrage nach Mitteilungen **erlauben**. Wurde sie
   abgelehnt, nachträglich: **Einstellungen → ntfy → Mitteilungen →
   Mitteilungen erlauben**. Ohne das bleibt es still, obwohl der Server
   die Nachricht annimmt.
3. In der App ein Thema abonnieren, z.B. `esrw-philip-k7t2x9`.
   **Wer das Thema kennt, liest mit** – also nichts Erratbares nehmen.
4. Das Thema als Secret hinterlegen:
   <https://github.com/suffig/esrw/settings/secrets/actions>
   * Knopf **New repository secret**
   * **Name**: `NTFY_TOPIC` (genau so, Großbuchstaben)
   * **Secret**: nur der Themenname, **nicht** die volle Adresse
     `https://ntfy.sh/…`
   * **Add secret**

Danach steht es in der Liste unter **Repository secrets**. Ansehen kannst du es
nicht mehr, nur überschreiben (**Update**) oder löschen.

Ob der Weg steht, prüfst du am schnellsten ohne GitHub:

```bash
curl -H "Title: Test" -d "Kommt das an?" https://ntfy.sh/DEIN-THEMA
```

Kommt hier nichts, liegt es am Handy (Punkt 2), nicht am Workflow.

### Was die Kollegen bekommen

Nichts davon – für sie bleibt es beim Kalender-Abo, weil jeder ein eigenes
Thema und einen eigenen GitHub-Zugang bräuchte. Neue Einteilungen tauchen bei
ihnen trotzdem automatisch im Kalender auf.

---

## Schritt 8 – Die Überwachung testen

Eine Alarmanlage, die man nie ausgelöst hat, ist keine Alarmanlage. Vier
Prüfungen, von harmlos nach scharf.

### 8.1 Kommt eine ntfy-Nachricht überhaupt an?

Erst die Kette Handy ↔ ntfy prüfen, ganz ohne GitHub. Auf deinem Rechner:

```bash
curl -H "Title: Test" -d "Kommt das an?" https://ntfy.sh/DEIN-THEMA
```

Innerhalb weniger Sekunden muss die Nachricht auf dem Handy aufschlagen. Kommt
nichts:

* Thema in der App exakt gleich geschrieben? Groß-/Kleinschreibung zählt.
* In iOS: **Einstellungen → ntfy → Mitteilungen → Mitteilungen erlauben** an?

### 8.2 Meldet sich das Skript bei neuen Einteilungen?

```bash
NTFY_TOPIC=DEIN-THEMA python esrw_ical.py
```

Beim allerersten Lauf kommt bewusst nichts – ohne Vergleichsstand wäre *jede*
Einteilung „neu", und du bekämst eine Nachricht mit allem auf einmal. Lösche für
einen echten Test `state.json` **nicht**, sondern warte den nächsten Lauf ab,
bei dem sich wirklich etwas ändert.

Willst du es sofort sehen: `state.json` in einem Editor öffnen, bei einem
beliebigen Eintrag den Wert von `"inhalt"` auf `"test"` ändern, speichern, Skript
laufen lassen. Es meldet dann eine Änderung. Danach `state.json` löschen und das
Skript einmal normal laufen lassen, damit kein falscher ⚠-Marker in den Feeds
stehen bleibt.

### 8.3 Schlägt die Fehler-Benachrichtigung an? (der eigentliche Test)

Dafür ist der Schalter im Workflow da. Er lässt den Lauf absichtlich scheitern,
**bevor** irgendetwas gebaut oder veröffentlicht wird – die bestehenden Feeds
bleiben unangetastet.

1. <https://github.com/suffig/esrw/actions>
2. Links **Einteilungen aktualisieren** anklicken
3. Rechts **Run workflow**
4. Im Aufklappmenü den Haken bei **Absichtlich scheitern, um die
   Fehler-Benachrichtigung zu pruefen** setzen
5. **Run workflow**

Erwartetes Ergebnis:

* Der Lauf wird nach wenigen Sekunden **rot**
* Der Schritt *Testfehler ausloesen* schlägt fehl, *Regressionstest*,
  *Feed bauen* und *Aenderungen veroeffentlichen* stehen auf **Skipped**
* Der Schritt *Bei Fehler benachrichtigen* läuft **grün** durch
* Auf dem Handy erscheint: **„Einteilungen: Test der Fehlermeldung"** mit dem
  Text, dass es ein absichtlicher Testfehler war, plus Link zum Lauf
* Kurz darauf zusätzlich die GitHub-E-Mail (siehe 4.4)

**Kommt keine Nachricht, obwohl der Lauf rot ist?** Der Schritt *Bei Fehler
benachrichtigen* zeigt in seinem Log, woran es lag. Auf den Lauf klicken, dann
auf den Schritt, dann die Ausgabe aufklappen:

| Im Log steht | Bedeutung |
|---|---|
| `Kein NTFY_TOPIC hinterlegt - keine Benachrichtigung moeglich.` | Das Secret fehlt → Schritt 7, Weg B, Punkt 4 |
| nur eine JSON-Zeile mit `"topic": …` | ntfy hat die Nachricht **angenommen** – dann hängt es am Handy, nicht am Workflow. Mitteilungen für ntfy erlauben (Schritt 7, Weg B, Punkt 2) |
| `curl: (…)` | ntfy.sh war nicht erreichbar |

Die E-Mail von GitHub kommt unabhängig davon (siehe 4.4) – wenn die da ist,
funktioniert die Überwachung grundsätzlich, und es fehlt nur der Push-Kanal.

Danach einmal normal durchlaufen lassen (**Run workflow** ohne Haken), damit der
letzte Lauf wieder grün ist.

### 8.4 Greift die Null-Spiele-Sperre?

Das ist die Sicherung, die verhindert, dass ein Umbau von esrw.de allen die
Termine vom Handy löscht. Lokal prüfen, **nicht** auf GitHub:

```bash
python -c "import json,io; c=json.load(io.open('config.json',encoding='utf-8')); c['quelle']='https://www.esrw.de/kontakt.html'; json.dump(c,io.open('config.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)"
python esrw_ical.py
```

Erwartet: `FEHLER: keine Spiele gefunden - hat sich der Seitenaufbau geaendert?`
und Rückgabewert 1. Wichtig ist, dass `docs/feeds/` dabei **unverändert** bleibt.

Danach die Quelle zurücksetzen:

```bash
git checkout config.json
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
