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

Ab jetzt startet er von selbst – wie oft, entscheidet GitHub (siehe unten).

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
| `FEHLER: … nicht erreichbar` | esrw.de war kurz weg. Passiert; der nächste Lauf holt es nach |
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

## Schritt 9 (optional) – Verlässliche Taktung von außen

Nur nötig, wenn dir GitHubs Zeitplan zu unregelmäßig ist. Gemessen an diesem
Repository legt GitHub für die meisten Slots gar keinen Lauf an; Abstände von
zwei bis sechs Stunden sind normal. Der manuelle Auslöser und `push` laufen
dagegen immer sofort – also stößt man den Workflow von außen als *Ereignis* an
statt ihn drinnen zu *planen*.

### 9.1 Warum cron-job.org und nicht cronjob.de

Die GitHub-API braucht drei Dinge: die Methode **POST**, einen eigenen
**Authorization-Header** und einen **JSON-Body**. Bei cronjob.de ist zu keinem
davon etwas dokumentiert, auch nicht in den bezahlten Tarifen.
[cron-job.org](https://cron-job.org) nennt „custom HTTP requests" mit frei
wählbarer Methode, Headern und Body ausdrücklich, ist kostenlos (bis 60 Aufrufe
pro Stunde) und quelloffen unter GPL.

### 9.2 Zugangstoken anlegen

<https://github.com/settings/personal-access-tokens> → **Generate new token**

* **Token name**: `cron-job.org – Einteilungen`
* **Expiration**: z.B. 1 Jahr. **Merk dir das Datum** – danach hört die
  Automatik ohne Vorwarnung auf
* **Repository access**: `Only select repositories` → **suffig/esrw**
* **Permissions → Repository permissions → Actions**: `Read and write`
  (nur dieses eine Recht, sonst nichts)
* **Generate token**

Der Token wird **einmal** angezeigt. Kopieren, gleich im nächsten Schritt
einsetzen, nirgends sonst speichern.

> **Was jemand damit anfangen könnte, der ihn in die Hände bekommt:** in diesem
> einen Repository Workflows starten und abbrechen. Sonst nichts – kein Zugriff
> auf dein Konto, keine anderen Repositories, kein Recht, Code zu ändern.
> Verloren gegangen? Auf derselben Seite **Revoke**, neu anlegen, im Cron-Dienst
> austauschen.

### 9.3 Cronjob einrichten

Konto auf <https://cron-job.org> anlegen, dann **Create cronjob**:

| Feld | Wert |
|---|---|
| Title | `Einteilungen aktualisieren` |
| URL | `https://api.github.com/repos/suffig/esrw/actions/workflows/einteilungen.yml/dispatches` |
| Schedule | *Every 30 minutes* |

Dann auf **Advanced** umschalten:

* **Request method**: `POST`
* **Headers** – vier Zeilen:

```
Authorization: Bearer DEIN_TOKEN
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

* **Request body**:

```json
{"ref":"main"}
```

Bei **Notify me when…** den Punkt *execution of the cronjob fails* einschalten,
und **Save responses in job history** ebenfalls – beides hilft beim Suchen,
falls etwas klemmt. Dann speichern.

> Kürzer als 30 Minuten würde ich nicht gehen. Jeder Lauf holt zwei Seiten von
> esrw.de; bei 15 Minuten sind das fast 200 Zugriffe am Tag auf die
> Vereinsseite, ohne dass die Einteilungen dadurch früher feststünden.

### 9.4 Prüfen

Im Cronjob auf **Test run**. Erwartet wird **HTTP 204** – GitHub antwortet bei
Erfolg ohne Inhalt, das ist kein Fehler.

| Antwort | Bedeutung |
|---|---|
| `204` | passt, der Lauf wurde ausgelöst |
| `401` mit `Requires authentication` | Der Header ist unbrauchbar – meist fehlt **`Bearer `** samt Leerzeichen vor dem Token |
| `401` mit `Bad credentials` | Header stimmt, aber der Token ist falsch, abgelaufen oder widerrufen |
| `403` | Token hat kein `Actions: Read and write` |
| `404` | Repository- oder Dateiname stimmt nicht, oder Token sieht das Repository nicht |
| `422` | Branch `main` stimmt nicht |

Um die Meldung überhaupt zu sehen, muss oben **„Save responses in job history"**
eingeschaltet sein – sonst zeigt cron-job.org nur die nackte Zahl.

Bei Erfolg stehen in der Antwort zwei nützliche Zeilen:
`x-accepted-github-permissions: actions=write` bestätigt, dass der Token genau
das darf, was er soll, und `github-authentication-token-expiration` nennt das
Ablaufdatum – das ist der Tag, an dem die Automatik ohne Vorwarnung aufhört.

> **Zur API-Version:** `2022-11-28` funktioniert, ist aber seit dem 10.03.2026
> als veraltet gekennzeichnet; abgeschaltet wird sie am 10.03.2028. Die
> Nachfolgerin heißt `2026-03-10`. Ein Wechsel ändert an diesem Aufruf nichts
> Messbares – GitHub meldet für den dispatches-Endpunkt weiterhin `2022-11-28`
> als gewählte Version – schadet aber auch nicht. Spätestens Anfang 2028
> umstellen.

Zwei Stolperfallen beim Eintippen, beide schon passiert:

* Der Wert von `Authorization` ist **`Bearer ` + Token**, nicht der Token allein.
* `Content-Type` heißt `application/json` – ein verschlucktes erstes Zeichen
  fällt in dem schmalen Feld kaum auf.

Danach unter <https://github.com/suffig/esrw/actions> nachsehen: dort muss ein
Lauf mit dem Auslöser **workflow_dispatch** stehen.

Zum Schluss in cron-job.org die Benachrichtigung bei Fehlern einschalten – dann
merkst du es, wenn der Token abläuft.

### 9.5 Was mit dem GitHub-Zeitplan passiert

Der bleibt drin und kostet nichts. Er läuft weiter, wann immer GitHub Lust hat,
und ist damit die Rückfallebene, falls der externe Dienst ausfällt. Doppelte
Läufe schaden nicht: ändert sich nichts, sind die Feeds byte-gleich und es wird
nicht einmal ein Commit erzeugt.

---

## Schritt 10 (optional) – Mitgliederbereich mit Supabase

Der Reiter **Mitglieder** bietet Konten, ein Profil und eine Abrechnung je Saison
(Kilometer, Vergütung, Auslagen, CSV-Export). Dafür braucht es zum ersten Mal
ein Backend: eine Datenbank mit Login. Supabase liefert beides, kostenlos für
diese Größenordnung. GitHub Pages bleibt, wie es ist – der Browser spricht
direkt mit Supabase.

Solange nichts eingerichtet ist, zeigt der Reiter nur einen Hinweis. Alles
andere funktioniert weiter wie bisher.

### 10.1 Projekt anlegen

1. <https://supabase.com> → **Start your project** → Konto anlegen (GitHub-Login
   geht)
2. **New project**
   * **Name**: `esrw`
   * **Database Password**: generieren lassen und im Passwortmanager ablegen –
     du brauchst es später praktisch nie, aber es lässt sich nicht anzeigen
   * **Region**: **Frankfurt (eu-central-1)** – die Daten bleiben in der EU
3. Warten, bis das Projekt steht (eine Minute)

### 10.2 Tabellen anlegen

Links **SQL Editor** → **New query** → den kompletten Inhalt von
`supabase/schema.sql` einfügen → **Run**.

Das legt die Tabellen an (`profile`, `einsaetze`, `gesuche`, `angebote`,
`sperren`, `push_abos`), den privaten Ablageordner `belege` für Quittungen
und die Zugriffsregeln: **Profil, Abrechnung, Belege und Push-Adressen sieht
und ändert ausschließlich der Besitzer.** Gesuche, Angebote und
Verfügbarkeiten sehen alle angemeldeten Mitglieder, ändern darf sie nur, wem
sie gehören. Das erzwingt die Datenbank selbst, nicht die Webseite. Auch wer
den anonymen Schlüssel aus dem Quelltext kopiert, kommt an fremde Daten nicht
heran.

Die Datei lässt sich gefahrlos mehrfach ausführen – **und das musst du auch
tun, wenn sie sich ändert** (steht dann im Commit; aktuell v9). Fehlt eine Tabelle, sagt
die App „Die Datenbank kennt eine Tabelle noch nicht“.

**Danach einmalig dich selbst zum Admin machen** (sonst kann niemand
freigeschaltet werden, auch du nicht). Reihenfolge:

1. In der App **Mitglieder → Konto anlegen**, Link in der Bestätigungsmail
   antippen. Die Profilzeile entsteht dabei von selbst (Datenbank-Trigger),
   einen Namen musst du dafür noch nicht wählen.
2. Im SQL Editor, mit deiner Adresse:

```sql
update public.profile set admin = true, freigeschaltet = true
 where email = 'deine@adresse.de';
```

3. Prüfen – die Zeile muss `admin = true` zeigen:

```sql
select email, slug, admin, freigeschaltet from public.profile;
```

4. In der App abmelden und wieder anmelden. In der Unterreiter-Leiste
   steht jetzt ganz rechts **Admin**.

Kommt bei Schritt 3 keine Zeile: Das Konto ist noch nicht bestätigt
(`select email, email_confirmed_at from auth.users;` – ist die Spalte leer,
den Link aus der Mail antippen oder in der App „Bestätigungsmail erneut
senden“) oder `schema.sql` wurde vor der Registrierung noch nicht bis v6
ausgeführt – dann einfach noch einmal ausführen, der Nachtrag holt
bestehende Konten in die Tabelle.

### 10.3 Login-Einstellungen

Links **Authentication** → **URL Configuration**:

* **Site URL**: `https://suffig.github.io/esrw/`
* **Redirect URLs** → **Add URL**: `https://suffig.github.io/esrw/**`

Ohne das landen Bestätigungslinks aus der E-Mail auf einer leeren Seite.

Unter **Authentication → Providers → Email** kannst du entscheiden, ob neue
Konten die E-Mail bestätigen müssen (**Confirm email**). Für einen
Kollegenkreis ist *an* sinnvoll – dann kann niemand mit fremder Adresse ein
Konto anlegen.

Empfohlene Schalter, alle unter **Authentication**:

| Wo | Schalter | Empfehlung |
|---|---|---|
| Providers → Email | Confirm email | **an** |
| Providers → Email | Minimum password length | **8** (die App verlangt es auch) |
| Providers → Email | Password requirements | mindestens „Letters and digits“ |
| Attack Protection (oder Settings) | Leaked password protection | **an**, wenn im Plan enthalten – lehnt Passwörter ab, die in bekannten Datenlecks stehen |
| Rate Limits | alles | Voreinstellung lassen |
| Providers → Email | Secure email change | **an** |

Die Links in den Mails (Bestätigung, Passwort vergessen) führen auf die
App; die verarbeitet sie im Reiter Mitglieder – beim Passwort-Link erscheint
dort direkt „Neues Passwort“. **Ohne die Site URL und Redirect URL von oben
landen die Links auf `localhost:3000`, also im Nichts** – das Konto ist
dann zwar bestätigt, aber niemand merkt es.

#### E-Mails auf Deutsch

Supabase verschickt englische Standardmails („Confirm your signup“). Unter
**Authentication → Email Templates** lassen sich Betreff und Text je Mail
ersetzen. Vorschläge – `{{ .ConfirmationURL }}` ist der Link und muss
drinbleiben:

**Confirm signup** – Betreff: `Einteilungen: E-Mail bestätigen`

```html
<h2>Willkommen bei den Einteilungen</h2>
<p>Du hast ein Konto für den Mitgliederbereich angelegt. Ein Tipp auf den
Link bestätigt deine Adresse und bringt dich zurück in die App:</p>
<p><a href="{{ .ConfirmationURL }}">E-Mail bestätigen</a></p>
<p>Danach wählst du in der App deinen Namen. Für Tauschbörse, Verfügbarkeit
und Hallen-Hinweise schaltet dich der Betreiber anschließend frei.</p>
<p>Wenn du das nicht warst, ignoriere diese Mail.</p>
```

**Reset password** – Betreff: `Einteilungen: Neues Passwort`

```html
<h2>Neues Passwort</h2>
<p>Jemand hat für dieses Konto ein neues Passwort angefordert. Der Link
bringt dich in die App, dort gibst du das neue Passwort ein:</p>
<p><a href="{{ .ConfirmationURL }}">Neues Passwort setzen</a></p>
<p>Wenn du das nicht warst, ignoriere diese Mail – das Passwort bleibt, wie
es ist.</p>
```

**Change email address** – Betreff: `Einteilungen: Neue E-Mail-Adresse bestätigen`

```html
<h2>Neue E-Mail-Adresse</h2>
<p>Bitte bestätige, dass dieses Konto künftig über {{ .NewEmail }} läuft:</p>
<p><a href="{{ .ConfirmationURL }}">Adresse bestätigen</a></p>
```

Die Absenderadresse bleibt `noreply@mail.app.supabase.io`, solange kein
eigener SMTP-Server eingetragen ist (Project Settings → Auth → SMTP). Für
einen Kollegenkreis reicht die Voreinstellung; sie ist auf wenige Mails pro
Stunde begrenzt.

### 10.4 Zugangsdaten eintragen

Links **Project Settings** (Zahnrad) → **API**:

* **Project URL** → nach `docs/supabase.json` in `"url"`
* **Project API keys → anon public** → nach `"anon_key"`

```json
{
  "url": "https://abcdefghijkl.supabase.co",
  "anon_key": "eyJhbGciOi…",
  "mock": false
}
```

Der **anon**-Schlüssel darf im Quelltext liegen – er ist genau dafür gemacht
und öffnet nichts, was die Zugriffsregeln nicht erlauben. Der **service_role**-
Schlüssel darunter ist etwas anderes: **niemals** irgendwo eintragen.

Committen, pushen, fertig. Beim nächsten Öffnen des Reiters erscheint die
Anmeldung.

### 10.5 Ausprobieren ohne Supabase

Mit `"mock": true` in `supabase.json` läuft eine Attrappe im Browser: Konten
und Einträge landen nur im `localStorage` dieses Geräts, nichts geht raus.
Damit lässt sich die Oberfläche durchklicken, bevor das Projekt steht. Vor dem
Veröffentlichen wieder auf `false`.

### 10.6 Was drin ist

Nach der Anmeldung wählt man einmal seinen Namen von esrw.de, die
**Heimatadresse** (Startpunkt für die Strecke; nach dem Tippen **Adresse
suchen** drücken) und das **Kilometermodell**:

| Modell | Rechnung | Voreinstellung |
|---|---|---|
| Entfernungspauschale | einfache Strecke, nur volle km | 0,38 €/km – gilt seit 01.01.2026 ab dem ersten Kilometer |
| Reisekosten | gefahrene km, hin und zurück | 0,30 €/km |

Welches Modell für Schiedsrichter passt, ist Sache des Steuerberaters; die
Sätze lassen sich jederzeit ändern.

**Abrechnung**: alle Spiele der Saison aus dem Archiv, auch die, die auf
esrw.de längst verschwunden sind. Drei Knöpfe oben:

* **Strecken berechnen** – holt einmal je Halle die Straßenkilometer von der
  Heimatadresse (Routendienst OSRM, nur Koordinaten gehen raus, kein Schlüssel
  nötig), merkt sie sich im Profil und trägt sie bei allen Spielen ohne
  km-Angabe ein. Fällt der Dienst aus, bleibt Luftlinie × 1,3.
* **Vergütung eintragen** – setzt die Grundgebühr nach der ESRW-Gebührenordnung
  (`docs/gebuehren.json`) aus Liga, Rolle und Anzahl Offizieller. Was sich nicht
  zuordnen lässt (DNL, U17-Bundesliga, Auswahlspiele), bleibt leer.
* **CSV** – für Excel oder den Steuerberater, mit allen Einzelposten.

Je Spiel: km einfach, Vergütung, Auslagen, Notiz und drei Schalter:
**bezahlt**, **vor Ort ausgefallen** (50 %), **übergreifend** (nur bei
Regionalliga West und Frauen 2. Liga; +50 € je SR, im 2-Mann-System +75 €).
Den **Zuschlag von 20 %** bei Spielbeginn bis 09:14 oder ab 21:46 Uhr setzt die
Seite selbst. Reihenfolge (die Ordnung sagt es nicht): erst +20 %, dann
übergreifend, dann die Halbierung.

Oben stehen die Summen doppelt: **Saison** und **Steuerjahr** – fürs Finanzamt
zählt das Kalenderjahr, für den Verband die Saison. Die Saison wählst du oben
aus; das Archiv behält alle Spielzeiten, die Steuerjahr-Summe rechnet über
Saisongrenzen hinweg.

Die Spiele sind nach Monat gruppiert; **Monat als bezahlt ✓** hakt alle
offenen Spiele des Monats auf einmal ab, wenn die Abrechnung des Verbands
gekommen ist.

**+ Beleg (Foto/PDF)** hängt Quittungen an ein Spiel (Parkticket, Bahnticket).
Die Dateien liegen in deinem privaten Ordner bei Supabase; niemand sonst kann
sie öffnen, auch nicht über einen weitergegebenen Link – der läuft nach fünf
Minuten ab.

Wenn der ESRW die Gebühren ändert: `docs/gebuehren.json` anpassen, committen.

**Tauschbörse** (zweiter Unterreiter): Wer ein Spiel abgeben muss, stellt es
ein – aus der Liste oder direkt aus den Tauschoptionen unter dem Spiel
(„Ersatz in der Tauschbörse suchen“). Alle Mitglieder sehen offene Gesuche
und melden mit **Ich kann übernehmen**, gern mit Handynummer im Feld dazu.
Der Suchende sieht die Namen, spricht sich ab und setzt das Gesuch auf
**Erledigt**. Eingeteilt wird weiterhin vom Obmann – die Börse zeigt nur,
wer könnte.

**Verfügbarkeit** (dritter Unterreiter): je Wochenendtag der nächsten zehn
Wochen **frei / nicht / gern**, andere Tage über das Datumsfeld. Das fließt
in die Tauschoptionen aller Kollegen ein: wer „nicht“ gesetzt hat, taucht
dort nicht auf; wer „gern“ gesetzt hat, steht ganz oben. Der Obmann sieht
das nicht automatisch – Abmeldungen laufen weiter über ihn.

**Notizen** (vierter Unterreiter): private Spielnotizen – Vorkommnisse,
Strafen, Lernpunkte. Eintragen direkt unter dem Spiel („Notiz“), hier alle
auf einmal, durchsuchbar. Sieht nur du.

**Konto** (fünfter Unterreiter): Einstellungen (Name, Adresse, Sätze),
Push-Benachrichtigungen (Schritt 11) und die **Handynummer für
Gespannkollegen** – freiwillig; wer sie freigibt, bekommt auf der Spielkarte
bei den Kollegen „Anrufen“ und „WhatsApp“ und umgekehrt.

**Unter jedem Spiel** (angemeldet) klappt eine Zeile wie „2 Hallen-Hinweise ·
1 Kontakt · Notiz ✓“ auf:

* **Hallen-Hinweise** – gemeinsames Wissen aller Mitglieder je Halle:
  Parken, Kabineneingang, Schlüssel, Kantine. Jeder kann ergänzen, löschen nur
  den eigenen Eintrag.
* **Gespann** – Anrufen / WhatsApp bei Kollegen, die ihre Nummer freigegeben
  haben.
* **Fahrgemeinschaft** – „Ich fahre ab Iserlohn, 2 Plätze frei“; die
  Gespannkollegen sehen es auf ihrer Karte desselben Spiels.
* **Meine Notiz** – privat, speichert von selbst.

**Abfahrtszeit**: Mit Heimatadresse steht auf der Karte oben „Abfahrt ca.
17:50 Uhr · 40 Min., 38 km ohne Verkehr“ – Fahrzeit vom Routendienst OSRM,
also ohne Stau. Einmal je Halle berechnet, im Profil gemerkt.

> **Keine Steuerberatung.** Die Abrechnung ist eine Aufstellung. Ob und wie
> Vergütung und Fahrtkosten steuerlich zählen – Ehrenamtspauschale,
> Übungsleiterpauschale, Werbungskosten – hängt vom Einzelfall ab und sagt
> dir dein Steuerberater, nicht diese Seite.

**Hinter dem Login liegen** außerdem die Tauschoptionen. Anzeigen, Spielplan
und Kalender bleiben offen.

### 10.6a Was ein neuer Kollege sieht

1. **Mitglieder → Konto anlegen** → Karte „Fast geschafft – wir haben eine
   E-Mail an … geschickt“.
2. Link in der Mail → landet in der App, Meldung „E-Mail bestätigt –
   willkommen!“, direkt die Frage „Wer bist du?“.
3. Name wählen, optional Adresse → Abrechnung geht sofort.
4. Gelber Hinweis „wartet auf Freischaltung“, bis du unter Konto →
   Freischaltung getippt hast.

Wer sich anmelden will, bevor der Link angetippt wurde, bekommt „noch nicht
bestätigt“ und einen Knopf **Bestätigungsmail erneut senden**. Abgelaufene
Links (24 Stunden) werden beim Ankommen erklärt, ebenfalls mit diesem Knopf.

### 10.6b Ankündigungen, Monatsabrechnung, Fahrtenbuch, Hallen-Seite

* **Info** (Unterreiter): Ankündigungen von dir an alle Mitglieder –
  Lehrgang, Regeltest, Sitzung. Als Admin siehst du oben „Neue Ankündigung“:
  Überschrift, Text, optional „gilt bis“, „wichtig“ und **„auch als Push an
  alle mit Push“** (geht beim nächsten Workflow-Lauf raus, also innerhalb
  von 30 Minuten). Ungelesene zählt der Reiter „Info“ und die Leiste unten.
* **Abrechnung → „per E-Mail“** am Monat: öffnet die Mail-App mit einer
  fertigen Aufstellung (Spiele, Vergütung, km, Summe). Empfänger kommt aus
  **Konto → Einstellungen → E-Mail des Obmanns**; ohne Eintrag bleibt das
  An-Feld leer.
* **Abrechnung → Fahrtenbuch**: Steuerjahr wählen, „Drucken / PDF“ –
  Datum, von (Heimatadresse), nach (Halle mit Adresse), Zweck, km, Betrag.
  Nur Spiele mit km-Eintrag.
* **Tauschbörse**: Steht auf esrw.de inzwischen jemand anderes im Spiel,
  setzt die App (und der Workflow) dein Gesuch von selbst auf „erledigt“;
  wer „Ich kann“ gemeldet hatte, bekommt einen Push.
* **Hallen-Seite** (ohne Login): Tipp auf einen Hallennamen – Adresse,
  Route, alle Spiele dort; angemeldet dazu deine Fahrzeit und die
  Hallen-Hinweise.
* **Statistik → „Meine Saison als Bild teilen“**: erzeugt ein Bild
  (1080×1350) fürs Teilen.

### 10.6c Wo ist was (seit dem Umbau auf fünf Reiter)

| Reiter unten | Inhalt |
|---|---|
| Start | nächstes Spiel mit Wetter/Abfahrt, Termine, Pins, Kalender-Karte, deine Spiele, ganz unten dein Profil mit „Wechseln“ – was davon erscheint, stellst du unter **Mehr → Einstellungen → Startseite** ein (Wochenstreifen, „Danach“ und Radar sind standardmäßig aus; der Link „Startseite anpassen“ steht auch unten auf Start). Die Zähl-Kacheln liegen jetzt in der Statistik („in 7 Tagen“) und als Zähler unter „Mehr“ |
| Statistik | eigene Seite (Mehr → Statistik oder Kachel auf Start): Saison, Ligen, Hallen, Partner, Saisonziel, Archiv, Saison-Bild |
| Spielplan | alle Spiele; Filter-Blatt (vergangene, unbesetzte, meine Hallen, meine Spiele, Ligen), Karten / Liste / Monat, Drucken |
| Tausch | Tauschbörse (Login) |
| Abrechnung | Abrechnung, Fahrtenbuch, CSV (Login) |
| Mehr | in drei Gruppen: **Gemeinsam** (Info, Verfügbarkeit, Hallenkarte, Admin), **Für dich** (Statistik, Notizen), **Konto und App** (Konto, Einstellungen, Diagnose) |

Ein Tipp auf ein Spiel öffnet die **Spielseite**: Route, Teilen, „In
Kalender“ (nur dieses Spiel als Datei mit Abfahrtsalarm), Anrufen/WhatsApp
der Gespannkollegen direkt in der Kopfkarte, Wetter, Abfahrt,
Spieltag-Checkliste (Vorlage selbst anpassbar, privat), Gespann-Notizen,
Fahrgemeinschaft, Notiz, Tauschoptionen. Unter „Mehr“ liegen die Bereiche
als Kacheln mit Zählern. Auf fremden Profilen: „Anpinnen“ – bis zu drei
Kollegen erscheinen als Avatare auf Start.

### 10.6d Termine und Tausch abschließen (Schema v8)

* **Termine**: Eine Ankündigung mit Datum („Termin“) erscheint bei allen auf
  der Startseite unter „Nächste Termine“; wer Push an hat, bekommt am
  Vortag ab 17 Uhr eine Erinnerung.
* **Tausch abschließen**: Der Suchende tippt in seinem Gesuch auf ein
  Angebot („annehmen“). Status wird „vereinbart“, der Helfer bekommt Push,
  und die Mail-App öffnet sich mit „Bitte Spiel X von A auf B umteilen“ an
  die Obmann-Adresse aus den Einstellungen. Sobald esrw.de den neuen Namen
  führt, setzt der Workflow das Gesuch auf „erledigt“. „Doch nicht“ macht es
  wieder offen.
* **Verfügbarkeit**: Zeitraum von–bis auf einmal (Urlaub), zwei Monate als
  Mini-Kalender (Tipp wechselt frei → nicht → gern).
* **Konto**: Übersicht (Freischaltung, Adresse, Push-Geräte) und E-Mail
  ändern (Bestätigung an beide Adressen).
* **Abrechnung**: kompakte Zeilen, Details klappen per Tipp auf; „bezahlt“
  direkt in der Zeile.

### 10.6e Gespann-Notizen, Radar, Geräte (Schema v9)

* **Gespann-Notizen**: Auf der Spielseite kurze Nachrichten, die nur die
  Kollegen im selben Spiel sehen (die Datenbank prüft das über die Slugs im
  Gespann). Push an die anderen beim nächsten Lauf.
* **Vertretungs-Radar** auf Start: fremde Gesuche und unbesetzte Spiele bis
  40 km von zu Hause an Tagen ohne eigenes Spiel und ohne „nicht“-Sperre –
  mit „Ich kann“ direkt aus der Karte.
* **Konto → Push-Geräte**: jedes Gerät einzeln abmelden, „Test“ schickt
  beim nächsten Lauf eine Server-Push nur an dieses Gerät.
* **Einstellungen im Konto**: Schrift, Farbe, Karten-App, kompakt und
  Saisonziel wandern beim Login auf jedes Gerät mit.
* **Kalender-Link prüfen**: Die Kalender-Karte prüft beim Aufklappen, ob der
  Feed erreichbar ist, wie viele Termine drinstehen und wann er sich zuletzt
  geändert hat. Ob das Handy ihn abruft, kann die Seite nicht sehen – das
  steht nur im Kalender-Konto des Geräts (Einstellungen → Kalender → Accounts).
* **Offline**: oranger Balken oben, Kalender/Spielplan/Spielseiten laufen aus
  dem Cache.

### 10.6f Funktionen an- und abschalten (Schema v10)

Unter **Mehr → Admin → Funktionen** schaltest du Bereiche für alle
Mitglieder an oder ab: Tauschbörse, Verfügbarkeit, Abrechnung, Info und
Termine, Notizen, Gespann (Gespann-Notizen, Handynummern, Fahrgemeinschaft),
Hallen-Hinweise und Hallenkarte, Statistik, Spieltag-Checkliste, Wetter,
Push. **Tauschbörse und Verfügbarkeit starten abgeschaltet** – einschalten,
wenn genug Kollegen dabei sind.

Abgeschaltete Bereiche verschwinden aus der Leiste unten, aus „Mehr“, von
den Spielseiten und aus den Einstellungen; Links darauf landen mit einem
Hinweis auf „Mehr“. Daten bleiben in der Datenbank, der Workflow schickt
für abgeschaltete Bereiche keinen Push. Die Schalter liegen in der Tabelle
`funktionen` (lesbar für alle, schreibbar nur für Admins) – dafür einmal
`supabase/schema.sql` neu ausführen.

Die Abrechnung zeigt oben nur noch Vergütung, Fahrtkosten und „noch offen“;
Saison-Details, Steuerjahre, Werkzeuge (Strecken, Vergütung, CSV,
Fahrtenbuch, Drucken) und die Rechenregeln klappen bei Bedarf auf.

### 10.6g Konto in den Einstellungen, Heute-Modus, Suche, Monatsabschluss (Schema v11)

* **Ein Ort für alles Persönliche:** Mehr → Einstellungen zeigt oben dein
  Konto (Profil bearbeiten, Push mit Geräten, Handynummer, E-Mail, Passwort,
  Daten, Abmelden), darunter App, Startseite und **Bereiche** – dort blendet
  jeder für sich aus, was er nicht braucht (nur auf den eigenen Geräten,
  mit Konto synchron). Der Unterreiter „Konto“ im Mitgliederbereich ist weg.
* **Heute-Modus:** Am Spieltag zeigt die Kopfkarte einen Countdown bis zur
  Abfahrt (mit Heimatadresse) bzw. bis zum Treffpunkt, Anruf-Knöpfe für die
  Gespannkollegen (wenn Nummern freigegeben) und die Checkliste direkt darunter.
* **Suche über alles:** Die Lupe oben sucht Kollegen, Hallen, Vereine,
  Spiele und Termine; ein Tipp springt direkt hin.
* **Kollegen-Seite:** Auf einem fremden Profil steht oben „Du und …“ mit den
  gemeinsamen Spielen, Anrufen/WhatsApp (wenn freigegeben) und „Mitfahrt
  anfragen“ (WhatsApp mit vorgefülltem Text zum nächsten gemeinsamen Spiel).
* **Monatsabschluss:** In der Abrechnung schließt „Monat abschließen“ den Monat
  ab – Monatsmail geht raus, alle Spiele gelten als abgerechnet; danach nur
  noch „alles bezahlt ✓“. Der Workflow erinnert ab dem 27. (bis zum 3. des
  Folgemonats, ab 17 Uhr) per Push an nicht abgeschlossene Spiele. Dafür
  `supabase/schema.sql` neu ausführen (Spalte `abgerechnet`).
* **Wochenvorschau:** Sonntags ab 18 Uhr kommt per Push „Deine Woche: …“ mit
  den Spielen der nächsten sieben Tage – abschaltbar in der Push-Karte.
* **Onboarding:** Die Drei-Schritte-Karte verschwindet nach dem Kalender-Abo;
  ohne Konto bleibt ein Einzeiler mit Link.

### 10.6h Spiele korrigieren (Schema v12)

Admins sehen auf jeder Spielseite unten **„Korrigieren (Admin)“**: Halle
(Auswahl aus venues.json), Anstoß, Treffpunkt, Hinweis für alle, „Spiel
abgesagt“. Leere Felder bleiben wie auf esrw.de. Die Korrektur gilt für
alle: in der App sofort (Karten, Spielseite, Kopfkarte zeigen „✎ Vom
Betreiber korrigiert: …“), in Kalender-Feeds und Push beim nächsten Lauf
(Titel „ABGESAGT · …“, Zeile „Korrektur vom Betreiber“ in der Beschreibung).
„Korrektur entfernen“ stellt den Stand von esrw.de wieder her. Tabelle
`spiel_korrekturen` – dafür `supabase/schema.sql` neu ausführen.

Hallen-Erkennung: Steht hinter einem **unbekannten** Gastverein ein Ort
(„Ratinger Ice Aliens - Chiefs Leuwen Düsseldorf !!!“), zählt der Ort als
Spielort (Düsseldorf). Bekannte Vereine mit Ortsnamen („Eisadler Dortmund“)
sind davon nicht betroffen.

### 10.6i Anleitung in der App, Spiele anlegen, Hallen pflegen, Termine, Änderungen (Schema v13)

* **Anleitung (Tour):** Beim ersten Öffnen führt die App in sechs Schritten
  durch Namen wählen, Kalender-Abo, App + Push, Konto und die Reiter. Nach
  dem ersten Einrichten eines Kontos folgt eine zweite Runde (Push,
  Abrechnung, Spielseite, Tausch, Einstellungen, Termine). Jederzeit wieder:
  Mehr → Anleitung.
* **Spiel anlegen (Admin):** Mehr → Admin → „Spiel anlegen“ – für Spiele,
  Turniere oder Lehrgänge, die auf esrw.de fehlen, mit Halle, Treffpunkt,
  Hinweis und Besetzung (bis vier Namen aus der Liste). In der App sofort,
  in Kalender und Push beim nächsten Lauf; auf der Spielseite steht „Vom
  Betreiber angelegt“, Admins können es dort löschen.
* **Hallen und Vereine (Admin):** Mehr → Admin → „Hallen und Vereine“ zeigt
  nicht erkannte Heimvereine und ordnet sie einer Halle zu; neue Hallen mit
  Adresse (Koordinaten über die Adresssuche). Tabellen `vereine_extra` und
  `hallen_extra` – der Workflow liest sie vor der Hallen-Erkennung.
  Dauerhaft gehört die Zuordnung trotzdem in `venues.json`.
* **Änderungen:** Mehr → Änderungen listet 14 Tage: neue, geänderte und
  abgesetzte Einteilungen aller Kollegen (`docs/protokoll.json`, vom
  Workflow gepflegt), Korrekturen und angelegte Spiele des Betreibers.
* **Termine zu-/absagen:** Ankündigungen mit Datum bekommen „Ich komme /
  Komme nicht“ mit Zähler; Admins sehen, wer geantwortet hat.
* **Offizielle Hallen-Hinweise:** Admins markieren einen Hallen-Hinweis als
  offiziell – er steht dann oben, auf der Spielseite und Hallen-Seite für
  alle (auch ohne Login) und in der Kalender-Beschreibung.
* **Korrektur-Push:** Ändert der Betreiber ein Spiel (oder esrw.de), meldet
  der nächste Lauf das den Betroffenen als „Korrektur vom Betreiber: …“
  bzw. „Geändert: …“ per Push – wie bei jeder Änderung auf esrw.de.

### 10.6j Abrechnung für Selbstständige, Verpflegung, eigene Spiele, Telefonliste, Zusammen fahren, Archiv (Schema v14)

* **Kilometer hin und zurück:** In der Abrechnung unter „Abrechnungsart“
  zwischen einfacher Strecke (Entfernungspauschale, 0,38 €/km) und „hin und
  zurück“ (Selbstständige, 0,30 €/km gefahren, km doppelt) umschalten – gilt
  sofort für alle Summen, CSV, Monatsmail und Fahrtenbuch.
* **Verpflegungsmehraufwand:** ebenfalls dort – aus, automatisch (14 € ab
  8 Std. Abwesenheit: Abfahrt bis Rückkehr, Fahrzeit aus der gemerkten
  Strecke) oder immer 14 €. Je Spiel änderbar („Verpflegung €“ in den
  Details), eigene Kachel in den Summen, Spalte in der CSV.
* **Spiel selbst eintragen:** Werkzeuge → „Spiel eintragen“ (Datum, Liga,
  Begegnung, Halle, Rolle). Nur für dich und die Abrechnung – mit km,
  Vergütung, Verpflegung, „selbst eingetragen“ als Kennzeichen, löschbar.
* **Telefonliste (Admin):** Mehr → Admin → „Telefonliste“ – Nummern aller
  Kollegen einzeln oder als Liste einfügen („Name; Nummer“ je Zeile).
  Freigeschaltete Mitglieder bekommen dann Anrufen/WhatsApp direkt in der
  Kopfkarte der Spielseite, auf der Kollegen-Seite und unter „Zusammen
  fahren“. Eine selbst freigegebene Nummer geht vor.
* **Zusammen fahren:** Mehr → „Zusammen fahren“ – je eigenem Spiel der
  nächsten 14 Tage: wer am selben Tag in derselben Halle ist (Gespann und
  andere Spiele), wer Mitfahrt bietet oder sucht, Anruf/WhatsApp, eigener
  Status „biete Plätze“ / „suche Mitfahrt“; oben eine Karte mit den Hallen,
  Zuhause und Luftlinien. Auf der Spielkarte gibt es dazu „Ich biete“ /
  „Ich suche“.
* **Alle Spiele in der Datenbank:** Der Workflow schreibt bei jedem Lauf das
  komplette Archiv (`historie.json`) plus das aktuelle Datenfenster mit
  Besetzung und Slugs in `spiele_archiv` (Service-Schlüssel, nur lesbar
  für angemeldete Mitglieder). Die Abrechnung liest daraus je Person – so
  bleiben alte Saisons erhalten, auch wenn `archiv.json` sie nicht mehr
  führt. Backup-Tipp: Supabase → Table Editor → Export CSV.

### 10.6k Wohnort teilen, Saison-Archive (Schema v15)

* **Auf dem Weg:** Wer unter Einstellungen → Profil „Wohnort für
  Fahrgemeinschaften teilen“ anhakt, legt nur den Ortsnamen und die Lage
  auf etwa einen Kilometer gerundet ab (Tabelle `wohnorte`, keine Adresse,
  jederzeit abwählbar). „Zusammen fahren“ und die Fahrgemeinschaft auf der
  Spielkarte zeigen dann „auf dem Weg“: Der Kollege liegt auf deinem Weg
  (Umweg höchstens 8 km oder 30 % der Strecke, Luftlinie × 1,3) oder du auf
  seinem. Geteilte Wohnorte erscheinen grob auf der Karte.
* **Saison-Archive:** Nach dem Saisonwechsel (1. Juli) friert der Workflow
  jede abgeschlossene Saison in `docs/archiv/<saison>.json` ein – kompakt,
  eine Zeile je Spiel mit Namen, Slug und Rolle – und nimmt sie aus
  `historie.json`, die damit klein bleibt. `docs/archiv/index.json` listet
  die Saisons. Statistik, Datenbank-Archiv (`spiele_archiv`), Abrechnung
  und „Alle Spiele im Archiv“ lesen die eingefrorenen Saisons bei Bedarf
  nach; `archiv.json` enthält nur noch die laufende Saison.

### 10.6l Neues Logo, Steuer-Export, Mitfahrt-Push, Schnellabrechnung, Offline (Schema v16)

* **Logo und Farben:** `logo_esrw_app_neu.png` ist die Quelle für alle
  Symbole (`python logo_bauen.py`). Die App ist jetzt schwarz-weiß-rot wie
  das Logo: schwarze Kopfkarte mit roter Kante, rote Rollen-Pille, schwarze
  aktive Reiter, roter Ring um den Avatar. Unter Einstellungen → Farbe ist
  „Schwarz-Rot (Logo)“ der Standard, Eisblau, Grün, Rot, Orange bleiben.
* **Steuer-Export je Kalenderjahr:** Abrechnung → „Saison im Detail und
  Steuerjahre“ → je Jahr „Jahr 2026 als CSV“ und „Jahresblatt drucken“:
  alle Spiele des Kalenderjahres über alle Saisons mit km, Fahrtkosten,
  Verpflegung, Auslagen, Vergütung und Saldo.
* **Mitfahrt-Push:** Setzt jemand „suche“ oder „biete“, bekommen beim
  nächsten Lauf die Gespannkollegen und alle, die laut geteiltem Wohnort
  auf dem Weg liegen, einen Push (Spalte `mitfahrten.gemeldet`).
* **Schnellabrechnung:** Abends (ab 17 Uhr) nach dem Spiel kommt „Spiel
  abrechnen?“, wenn noch keine Zeile da ist; ein Tipp öffnet das Spiel in
  der Abrechnung aufgeklappt und vorbelegt (`#abrechnen/<Kennung>`).
  Abschaltbar in der Push-Karte.
* **Offline-Abrechnung:** Ohne Netz zeigt die Abrechnung den letzten Stand
  (Profil und Einträge aus dem Zwischenspeicher); Änderungen landen in
  einer Warteschlange und werden nachgereicht, sobald Netz da ist oder
  die App neu geöffnet wird.

### 10.6m Archiv-Seite, Änderungen mit Vorher/Nachher

* **Archiv:** Mehr → Archiv zeigt alle eigenen Spiele über alle Saisons
  (Datenfenster, `archiv.json`, eingefrorene Saison-Dateien und – angemeldet –
  die Datenbank), gruppiert nach Monat, mit Suche und Filtern nach Saison,
  Liga, Rolle und Halle plus Kennzahlen (Spiele, Hallen, HSR/LSR). Spiele im
  aktuellen Datenfenster sind antippbar. Admins schalten „Alle Spiele aller
  Kollegen“ ein und filtern nach Person.
* **Änderungen:** Jeder Eintrag „Geändert“ zeigt jetzt, was sich geändert
  hat – Feld, vorher → nachher (Treffpunkt, Anstoß, Datum, Halle, Rolle,
  Ansetzung), Korrekturen des Betreibers sind markiert. Oben „Meine / Alle
  Kollegen“. Auf der Spielseite gibt es dazu den „Änderungsverlauf“ der
  letzten 14 Tage. Das Protokoll (`docs/protokoll.json`) speichert Kennung
  und Felder je Eintrag.

### 10.6n Kleine Runden: Spielplan, Push-Details, Archiv-Export, ruhige Startseite

* **Spielplan:** „Nur meine Spiele“ ist mit gewähltem Namen voreingestellt
  (abwählbar, wird gemerkt); in Wochen- und Monatsansicht wischt man nach
  links/rechts zur nächsten/vorigen Woche bzw. zum nächsten Monat.
* **Push „Geändert“** nennt die Felder vorher → nachher (z. B. „Halle
  Eissporthalle Neuss → Eishalle Brehmstraße, Treffpunkt 17:30 → 18:00“),
  Korrekturen des Betreibers mit „Betreiber:“ davor.
* **Archiv:** unter den Kennzahlen „CSV“ und „Liste teilen/kopieren“ für die
  gefilterte Liste; ein Tipp auf „Spiele“, „Hallen“ oder „Rollen/Kollegen“
  klappt die Aufschlüsselung als Balken auf (je Liga, je Halle,
  Gespannpartner bzw. je Kollege).
* **Startseite „Nur nächstes Spiel“:** Einstellungen → Startseite – blendet
  Kacheln, Termine, Radar, Pins, Kalender-Karte und Wochenstreifen aus; es
  bleiben Kopfkarte, Spiele und Profil.
* **Saison-Bild** in Logo-Schwarz mit rotem Balken.

### 10.6o Abrechnung: ein Status, Schnellzugriff auf Start

* **Abrechnung vereinfacht:** „bezahlt“ und „abgerechnet“ waren dasselbe –
  jetzt gibt es je Spiel nur noch **offen / abgerechnet ✓** (Pille rechts in
  der Zeile, antippen wechselt; in den Details ein Häkchen). Oben: Saison
  und Chips „Offen (n) / Alle“, darunter der Saldo. Je Monat ein Kopf mit
  Spielen, Summe, offenen Einträgen und einem Knopf **„Monat abschließen“**:
  E-Mail an den Obmann und alle Spiele des Monats gelten als abgerechnet;
  danach nur noch „E-Mail erneut“. Kommende Spiele zeigen „kommt“.
  Intern laufen beide Spalten (`bezahlt`, `abgerechnet`) gleich, damit
  Push-Erinnerung und alte Daten weiter passen.
* **Abrechnungs-Leiste:** Statt drei Klapp-Zeilen gibt es eine Leiste
  „Steuerjahre · Abrechnungsart · Werkzeuge · + Spiel · Regeln“; ein Tipp
  öffnet genau ein Panel darunter (Saison-Details und Steuerjahre mit
  CSV/Jahresblatt, km-Modell und Verpflegung, Strecken/Vergütung/CSV/
  Fahrtenbuch/Drucken, Spiel selbst eintragen, Rechenregeln).
* **Schnellzugriff:** Unter der Kopfkarte auf Start eine wischbare Reihe
  Knöpfe – Spielplan, Abrechnung, Archiv, Mitfahren, Änderungen, Tausch,
  Statistik, Einstellungen (nur was eingeschaltet ist). Abschaltbar unter
  Einstellungen → Startseite; in der ruhigen Startseite ausgeblendet.
* **Mehr:** Gruppe „Für dich“ (Archiv, Statistik, Änderungen, Notizen) steht
  jetzt oben, dann „Gemeinsam“, dann „Konto und App“.

### 10.6p Beleg-Foto aus der Zeile, Rückgängig, Liga-Chips, Termin-Karte, Mobil-Feinschliff

* **Beleg-Foto:** Kamera-Knopf rechts in jeder abgerechneten Spielzeile –
  öffnet die Kamera, das Bild wird auf 1600 px verkleinert (JPEG) und
  hochgeladen; die Zahl am Knopf zeigt die Belege. PDFs weiterhin über
  „+ Beleg“ in den Details.
* **Rückgängig:** Nach „Monat abschließen“ bleibt 10 Sekunden ein Knopf
  „Rückgängig“ in der Meldung, der die Spiele wieder auf „offen“ setzt.
* **Spielplan:** Liga-Chips mit Anzahl stehen direkt über den Schnellfiltern
  (farbige Kante je Liga); Hallenname auf jeder Karte führt zur Hallen-Seite.
* **Termin-Karte auf Start:** Steht ein Termin des Betreibers heute, morgen
  oder in bis zu drei Tagen an, bekommt er eine eigene Karte über den
  „Nächsten Terminen“ (Tipp führt zu Info mit Zu-/Absage).
* **Mobil:** Eingabefelder mit 16 px (kein iOS-Zoom beim Tippen), größere
  Tippflächen (Leiste 54 px, Chips/Knöpfe ≥ 34 px), Safe-Area oben, kein
  Tap-Highlight, Tablet-Breite 700–899 px mit drei Menü-Spalten, Querformat
  mit flacher Leiste, sehr schmale Geräte (≤ 360 px) mit zweispaltigen
  Kacheln und kleinerem Titel.

### 10.6q Schalter statt Häkchen

Alle Ja/Nein-Optionen (Einstellungen, Startseite, Bereiche, Filter-Blatt,
Abrechnungs-Details, Admin-Funktionen) sind jetzt große Schalter (46 × 28 px,
ganze Zeile tippbar, Text links, Schalter rechts). Listen zum Abhaken
(Spieltag-Checkliste) haben runde 28-px-Checks mit Haken. Dazu: feine
Kartenkontur, größere Menü-Symbole, einheitliche Auswahlfelder mit Pfeil.

### 10.6r Wischen, Bottom-Sheet, Abrechnungs-Kalender, Rollen-Kante, Einrichtungs-Check, Systemschrift

* **Wischen auf Spielkarten** (Start und Spielplan): nach rechts → Route,
  nach links → „Abrechnen“ (eigenes vergangenes Spiel), sonst Notiz/Details;
  kurze Vibration auf Android, ebenso bei jedem Schalter.
* **Filter als Bottom-Sheet:** Das Filter-Blatt im Spielplan schiebt sich
  von unten hoch (Griff, „Fertig“, Hintergrund antippen oder nach unten
  wischen schließt, Escape am Desktop).
* **Abrechnung → Kalender:** Monatsraster mit Betrag je Tag (rot = offen,
  grün = abgerechnet), Tipp auf einen Tag öffnet die Zeile.
* **Rollen-Kante:** Spielkarten haben links einen Streifen in Rollenfarbe
  (SR schwarz, HSR rot, LSR grau) – im Spielplan nach deiner Rolle in der
  Besetzung.
* **„Alles eingerichtet?“** auf Start (Baustein, abschaltbar): zeigt nur die
  fehlenden Schritte – Kalender-Abo, Push/App, Konto, Heimatadresse,
  Obmann-E-Mail, Wohnort – mit Fortschritt und Direktlink; „Später“ blendet
  14 Tage aus, komplett eingerichtet verschwindet die Karte.
* **Systemschrift:** Die App folgt der iOS-Textgröße (Dynamic Type); die
  eigene Schriftstufe (A−/A/A+) wirkt relativ dazu.

### 10.6s Seitenköpfe, Mehrfachauswahl, Nachricht an Einzelne (Schema v17)

* **Einheitliche Seitenköpfe:** Archiv, Änderungen, Statistik, Zusammen
  fahren, Einstellungen, Hallen- und Spielseite haben denselben Kopf –
  großer Titel, Kontextzeile, „Zurück“ als Pille rechts.
* **Spielkarten kompakter:** schmalere Zeitspalte, einzeilige Hallenzeile,
  im Spielplan Gespann nur mit Nachnamen als kleine Chips.
* **Leere Zustände mit Aktion:** z. B. „Namen wählen“, „Spielplan ansehen“,
  „+ Spiel selbst eintragen“, „Wohnort teilen“ als Knopf statt nur Text.
* **App-Badge:** die Zahl auf dem Home-Screen-Symbol (Ankündigungen,
  Gesuche, wartende Konten) wird jetzt auch wieder gelöscht.
* **Nachricht an Einzelne (Admin):** Im Ankündigungs-Formular „An: alle /
  Liga-Gruppe (alle dort Eingeteilten) / Kollege“. Nur die Empfänger (und
  Admins) sehen sie – per RLS, Spalte `ankuendigungen.an_slugs` –, Push und
  Termin-Erinnerung gehen nur an sie. `supabase/schema.sql` (v17) ausführen.
* **Zuletzt gesehen:** Scrollposition wird je Seite gemerkt (auch
  Spielseiten) und beim Zurückkommen wiederhergestellt – mit mehreren
  Anläufen, falls die Liste noch lädt.
* **Mehrfachauswahl in der Abrechnung:** Zeile lange drücken (Desktop:
  Rechtsklick) → Auswahlmodus mit runden Checks; Leiste unten: abgerechnet ✓,
  offen, CSV, Alle, Fertig.
* **Offline-Balken** nennt den Datenstand, was geht/was Netz braucht und wie
  viele Abrechnungs-Änderungen aufs Nachreichen warten.

### 10.6t Abrechnung ohne Abschluss – nur fürs Finanzamt

Die Abrechnung ist eine private Aufstellung: **nichts muss gemeldet oder
abgeschlossen werden.** Es gibt keinen Status „offen/abgerechnet“ und
keine Monatsmail mehr. Oben stehen Vergütung, Kosten (Fahrt, Verpflegung,
Auslagen) und der Saldo; der Filter „Unvollständig“ zeigt vergangene
Spiele ohne Vergütung oder km. Je Monat: Anzahl, Summe, fehlende Beträge.
Am Jahresende: Leiste → „Steuerjahre“ → Jahresblatt drucken / CSV; Anfang
Januar erinnert ein Push daran. „Alles eingerichtet?“ fragt nicht mehr
nach der Obmann-E-Mail (die bleibt nur für „Obmann anschreiben“ auf der
Spielseite). Mehrfachauswahl: Verpflegung 14 € setzen/entfernen, CSV.

### 10.6u Feinschliff-Runde (Bugfixes, Design, QoL)

* Direktlink auf einen Bereich (z. B. `#mitglieder/tausch`) beim ersten
  Besuch: erst die Funktions-Schalter laden, dann routen – vorher landete
  man fälschlich auf „abgeschaltet“.
* „In drei Schritten startklar“ und „Neu in der App“ erscheinen nur noch auf
  der eigenen Startseite, nicht auf fremden Profilen oder Unterseiten.
* Spielseite: „Weiteres“ als Zeilen mit Symbol und Pfeil („Zur Abrechnung
  dieses Spiels“ springt direkt zur Zeile, „Obmann anschreiben“); Extras
  (Fahrgemeinschaft, Gespann-Notizen, Notiz) mit Trennlinien statt
  aufklappbarem Kopf.
* Statistik-Kacheln passen zu viert in eine Reihe; Archiv-Kachel „HSR / LSR“
  kürzer; Text-Absätze (`.meta`) mit Links brechen wieder normal um.
* Dunkelmodus: Avatar-Initialen im Konto lesbar; Kartenmarker immer rot.
* Formulare: Datumsfelder in zweispaltigen Feldern laufen nicht mehr über,
  auf sehr schmalen Geräten einspaltig. Kopfzeile: „Stand vor 12 Min.“ –
  die Zahlen stehen auf dem Handy im Tooltip.
* Notizen leer → Knopf „Zum Spielplan“. Neuigkeiten-Karte aktualisiert.

* Filter-Blatt im Spielplan lag hinter dem abgedunkelten Hintergrund
  (Stapelkontext der klebenden Filterleiste) – das Blatt hängt jetzt direkt
  am Seitenkörper und liegt sauber oben.

### 10.6v Runde 11: Aufräumen, Ladebalken, Archiv-Filter, Push-Verlauf, Tastatur

* **Schema v18:** Die Spalten `einsaetze.bezahlt` und `einsaetze.abgerechnet`
  werden gelöscht (kein Status mehr), alte Push-Schlüssel der
  Monatsende-Erinnerung ebenfalls. Vorher ggf. die Tabelle exportieren.
* **Belege:** Beim Löschen eines selbst eingetragenen Spiels werden auch die
  hochgeladenen Belege aus dem Speicher entfernt.
* **Kalender:** Eine Korrektur des Betreibers ändert die Termin-Kennung nicht
  – im Kalender bleibt es derselbe Termin (Regressionstest dafür). Ein von
  esrw.de verschobenes Spiel ersetzt den alten Eintrag, weil der Feed immer
  vollständig ist.
* **Spielplan:** Das Suchfeld sitzt hinter der Lupe und klappt bei Bedarf auf;
  in der Wochenansicht nur noch Avatare statt voller Namen.
* **Ladebalken** oben statt springender Platzhalter bei kurzen Nachladungen.
* **Schnellzugriff** sortiert die zuletzt benutzten Ziele nach vorn (rot).
* **Archiv:** Filter merken („+ Filter merken“, antippen wendet an, langes
  Drücken löscht) und die letzten drei Suchbegriffe als Chips.
* **Kalender-Abo:** „Neu prüfen“ holt den Feed ohne Cache und vergleicht die
  Zahl der Termine mit der App.
* **Push-Verlauf:** Die letzten zehn Meldungen stehen unter Einstellungen
  („Zuletzt gemeldet“); der Service Worker legt sie in IndexedDB ab.
* **Tastatur am Desktop:** `/` Suche, `?` Anleitung, `1–5` Reiter, `←/→`
  Woche/Monat, `Esc` leert Felder bzw. schließt.

### 10.6w Admin-Modus zum Abschalten, Typografie

* **Admin-Modus:** Admins haben oben im Kopf einen Schild-Knopf (rot = an).
  Ausgeschaltet verhält sich die App wie für jeden anderen Schiedsrichter:
  kein Admin-Reiter, keine „Korrigieren (Admin)“-Karte auf der Spielseite,
  kein Admin-Eintrag unter „Mehr“, kein „Alle Spiele aller Kollegen“ im
  Archiv, keine Hinweise auf wartende Konten, kein Ankündigungs-Formular.
  Die Rechte in der Datenbank bleiben unverändert – es ist nur die
  Oberfläche. Der Schalter steht auch unter Einstellungen → Betreiber und
  gilt je Gerät.
* **Typografie:** Uhrzeiten, Beträge und Tabellen haben jetzt gleich breite
  Ziffern (springen beim Tippen nicht mehr), lange Vereins- und Hallennamen
  werden getrennt statt abgeschnitten, Großbuchstaben-Zeilen und Überschriften
  laufen ruhiger, Fließtext hat eine angenehme Zeilenlänge.
* **Kopfzeile** passt auch mit drei Knöpfen auf schmale Geräte (Titel kürzt
  sich, Knöpfe werden etwas kleiner).
* **Tipp auf den aktiven Reiter** unten scrollt nach oben.

### 10.6x Übersicht: Sprungleisten, Kachel-Zahlen, Schnellzugriff wählbar

* **Sprungleiste** auf langen Seiten: Die Spielseite bekommt oben Chips zu
  ihren Karten (Halle, Gespann, Checkliste, Fahrgemeinschaft, Weiteres …),
  die Einstellungen zu ihren Abschnitten (Konto, App, Startseite,
  Schnellzugriff, Bereiche, Betreiber, Gemeldet). Ein Tipp scrollt hin.
* **Zahlen auf den „Mehr“-Kacheln**: Archiv („6 Spiele“), Statistik („4 in
  2026/27“), Änderungen („2 Änderungen“ in 14 Tagen), Zusammen fahren
  („3 in 14 Tagen“) – man sieht sofort, wo etwas liegt.
* **Schnellzugriff wählbar**: Unter Einstellungen → Schnellzugriff legt man
  fest, welche Knöpfe unter der Kopfkarte stehen (auch Verfügbarkeit, Info,
  Hallenkarte); die Auswahl wandert mit dem Konto auf alle Geräte.
* **Suche merkt sich die letzten vier Begriffe** (Chips über der Liste,
  „leeren“ entfernt sie).

### 10.6y Startseite sortierbar, Gespann-Verlauf, ZIP-Export, dunkle Karte

* **Reihenfolge auf Start selbst festlegen**: Einstellungen → „Reihenfolge auf
  Start“ listet die Bausteine (Schnellzugriff, „Alles eingerichtet?“,
  Angepinnte Kollegen, Kacheln und Termine, Vertretungs-Radar, Hinweis zur
  Abrechnung, Deine Spiele, Kalender-Karte). Mit ↑ und ↓ schiebt man sie an
  die gewünschte Stelle, „Standard-Reihenfolge“ setzt zurück. Die Kopfkarte
  mit dem nächsten Spiel bleibt immer oben, die Profilzeile immer unten. Die
  Reihenfolge liegt im Konto und gilt damit auf allen Geräten.
* **Gespann-Notizen als Verlauf**: Auf der Spielseite stehen die Nachrichten
  jetzt als kleiner Chat – eigene rechts, fremde links mit Namen und
  Zeitstempel. Was seit dem letzten Öffnen dazugekommen ist, bekommt einen
  roten Rand, und die Zeile über den Extras zählt mit („3 Gespann-Notizen
  (2 neu)“). Gelesen wird beim Aufklappen vermerkt, gerätelokal.
* **Alles als ZIP exportieren**: Einstellungen → Daten → „Alles als ZIP (mit
  Belegen)“ packt `daten.json` (alle Tabellen deines Kontos),
  `abrechnung.csv` (alle Saisons mit km, Fahrtkosten, Verpflegung, Auslagen,
  Vergütung), `notizen.txt` und jeden hochgeladenen Beleg unter `belege/` in
  eine Datei. Das ZIP entsteht im Browser, es geht nichts an Dritte.
  „Nur JSON“ bleibt für den schnellen Blick.
* **Dunkle Hallenkarte**: Im Dunkelmodus werden die Kartenkacheln (Hallenkarte
  und „Zusammen fahren“) abgedunkelt, Popups und der Quellenhinweis bekommen
  die dunklen Farben. Im Hellmodus bleibt alles unverändert.
* **„Am Spieltag groß“** (Einstellungen → Startseite): Ist heute ein Spiel,
  füllt die Kopfkarte den Bildschirm – Uhrzeit, Paarung, Halle, Route und
  Gespann, sonst nichts. „Alles anzeigen ↓“ holt den Rest zurück, für diesen
  Spieltag gemerkt. Auf breiten Bildschirmen bleibt die normale Ansicht.
* **Stand-Pille aktualisiert**: Ein Tipp auf „Stand vor … Min.“ im Kopf lädt
  die Einteilungen neu.

### 10.6z Änderungen mit Filter und Gespannwechsel, Leiste unten wählbar

* **Gespannwechsel werden mitgeschrieben.** Tauscht esrw.de einen Kollegen
  aus, steht das jetzt im Protokoll – „Gespann: Alt, Anton (SR) → Neu, Nina
  (SR)“ –, ebenso wenn jemand dazukommt oder wegfällt. Zu sehen unter
  Änderungen und im Änderungsverlauf auf der Spielseite. **Push gibt es dafür
  bewusst nicht**: sonst meldet sich das Handy jedes Mal, wenn der Ansetzer
  ein Gespann nach und nach füllt. Im Kalender steht das Gespann trotzdem
  frisch, weil der Termin eine neue Fassung bekommt.
* **Filter auf der Änderungsseite**: Meine Spiele / Alle Kollegen, dazu eine
  Leiste mit Art und Anzahl (Alles, Neu, Geändert, Gespann, Abgesetzt,
  Betreiber). Was es gerade nicht gibt, steht auch nicht da.
* **Zeitraum und Sortierung**: 24 Stunden, 3, 7 oder 14 Tage; sortiert nach
  Neueste zuerst, Älteste zuerst oder nach Spieltag (das nächste Spiel oben,
  Vergangenes danach). Die Einstellung bleibt bis zum nächsten Besuch stehen.
* **Suchfeld** über Name, Halle, Verein, Liga und die geänderten Felder;
  „Teilen“ (bzw. „Kopieren“) gibt genau die gefilterte Liste als Text weiter.
* **Neu seit deinem letzten Besuch**: frische Einträge sind hinterlegt, oben
  steht, wie viele es sind, und die Kachel unter „Mehr“ zeigt „3 neu“ in Rot.
* **Leiste unten wählbar** (Einstellungen → Leiste unten): Der dritte Platz
  gehörte fest der Tauschbörse – die bei vielen aus ist. Jetzt steht dort, was
  man wählt: Änderungen, Archiv, Mitfahren, Info, Verfügbar, Statistik,
  Hallen oder Notizen. Start, Spielplan, Abrechnung und Mehr bleiben. Die
  Wahl wandert über das Konto auf alle Geräte.
* **Seitenköpfe mit Zeichen**: Änderungen, Archiv, Zusammen fahren,
  Hallenkarte und Einstellungen haben oben ein Symbol, den Titel und eine
  Zeile, was die Seite kann – man sieht auf einen Blick, wo man ist.

### 10.7 Freischaltung neuer Konten

Wer sich registriert, kann sofort Abrechnung, Notizen und Push nutzen –
alles, was nur ihn selbst betrifft. **Tauschbörse, Verfügbarkeiten,
Hallen-Hinweise, Kontakte und Mitfahrten** sieht er erst, wenn du ihn
freischaltest: **Mitglieder → Reiter „Admin“** (ganz rechts in der
Unterreiter-Leiste, nur für Admins sichtbar, mit Zähler) listet, wer wartet
(Name von esrw.de und E-Mail), ein Tipp auf **Freischalten** genügt. Dort
kannst du auch wieder sperren und weitere Admins ernennen. Der Reiter
„Mitglieder“ unten zeigt dir die Zahl wartender Konten als Badge.

Das erzwingt die Datenbank (`ist_freigeschaltet()` in den Zugriffsregeln),
nicht die App – ein fremdes Konto sieht auch mit Bastelei keine
Handynummern. Sag neuen Kollegen, dass sie nach dem Registrieren erst den
Namen wählen müssen, sonst tauchen sie in deiner Liste nicht auf.

### 10.8 Konto löschen und Daten mitnehmen

Jeder kann unter **Konto** alle eigenen Daten als JSON herunterladen und
das Konto selbst löschen – samt Belegen, Notizen, Push-Abos, Gesuchen.
Das läuft über die Datenbankfunktion `konto_loeschen()`; du musst nichts
tun. Freigegebene Handynummern und Hallen-Hinweise des Kontos verschwinden
dabei mit.

### 10.9 Zwei Dinge, die man wissen muss

**Kostenlose Supabase-Projekte werden nach sieben Tagen ohne Zugriff
pausiert.** Dann meldet der Reiter „nicht erreichbar", bis du im Dashboard auf
**Restore project** drückst. Bei regelmäßiger Nutzung passiert das nicht; in
der Sommerpause vermutlich schon. Die Daten gehen dabei nicht verloren.

**Du bist Betreiber.** Mit Konten verarbeitest du personenbezogene Daten deiner
Kollegen (E-Mail, Adresse, Einnahmen). Das ist etwas anderes als das
Weiterreichen öffentlicher Einteilungen. Wer mitmacht, sollte wissen, wo die
Daten liegen (Supabase, Frankfurt) und dass du sie als Betreiber sehen
*könntest* – über das Dashboard, nicht über die Webseite.

---

## Schritt 11 (optional) – Echte Push-Benachrichtigungen

Bisher meldet sich die App nur beim Öffnen. Mit Web Push kommt die Nachricht
auch bei geschlossener App – auf dem iPhone ab iOS 16.4, wenn die Seite auf
dem Home-Bildschirm liegt. Braucht Schritt 10 (die Push-Adressen liegen bei
Supabase, jeder sieht nur seine eigenen) und einmalig ein Schlüsselpaar.

### 11.1 Schlüsselpaar erzeugen

Auf deinem Rechner, im Ordner des Repositories:

```bash
pip install pywebpush
```

```bash
python push_schluessel.py
```

Das schreibt zwei Dateien: `docs/push.json` mit dem **öffentlichen**
Schlüssel (darf jeder sehen, wird committet) und `vapid_privat.txt` mit dem
**privaten** (steht in `.gitignore`, wird nie committet und nicht auf dem
Bildschirm angezeigt). Wer den privaten Schlüssel hat, kann in eurem Namen
Push-Nachrichten schicken – er gehört nur an einen Ort: ein GitHub-Secret.

### 11.2 Vier Secrets im Repository

GitHub → dein Repository → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**, viermal:

| Name | Inhalt | Woher |
|---|---|---|
| `VAPID_PRIVATE` | Inhalt von `vapid_privat.txt` (eine Zeile) | Schritt 11.1 |
| `VAPID_KONTAKT` | `mailto:deine@adresse.de` | deine E-Mail, Pflicht laut Push-Standard |
| `SUPABASE_URL` | Project URL | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_KEY` | **service_role**-Schlüssel | Supabase → Project Settings → API → „service_role“, **Reveal** |

Der `service_role`-Schlüssel umgeht alle Zugriffsregeln. Er gehört
**ausschließlich** in dieses Secret – nie in `supabase.json`, nie in den
Quelltext, nie in einen Screenshot. Der Workflow braucht ihn, um die
Push-Adressen aller Mitglieder zu lesen; im Browser liegt weiterhin nur der
`anon`-Schlüssel.

Danach `vapid_privat.txt` löschen. Brauchst du das Paar irgendwann neu
(Schlüssel verloren oder verraten): Datei löschen, `push_schluessel.py` erneut
laufen lassen, Secret ersetzen, `push.json` committen – alle Kollegen müssen
Push dann einmal aus- und wieder einschalten.

### 11.3 Committen und ausprobieren

`docs/push.json` committen und pushen. Dann auf dem Handy: App vom
Home-Bildschirm öffnen → **Mitglieder** → anmelden → **Konto** → **Push
einschalten** → Mitteilungen erlauben. Steht dort „an“, ist das Gerät
eingetragen.

Beim nächsten Lauf, der für dich eine neue, geänderte oder abgesetzte
Einteilung findet, schickt der Schritt **Push senden** die Nachricht. Im
Lauf-Protokoll steht `Push: 1 gesendet, 0 tote Abos entfernt.` Zum Testen
ohne echte Änderung: `state.json` im Repository um ein eigenes Spiel kürzen
und committen – der nächste Lauf sieht es als „neu“.

Push geht nur an Mitglieder, die im Profil den passenden Namen gewählt haben;
die Zuordnung läuft über den `slug` (`melchert-philip`). Wer Push
ausschaltet oder die App löscht, fällt beim nächsten Versand von selbst aus
der Liste.

### 11.4 Was noch kommt, wenn Push an ist

* **Spieltag-Erinnerung**: am Spieltag beim ersten Lauf nach 07:00 Uhr je
  Spiel „Heute: … als HSR – 19:30 Uhr, Treffpunkt 18:30, Halle, Abfahrt ca.
  17:50“. Die Abfahrt steht nur drin, wenn die Strecke im Profil berechnet
  ist.
* **Losfahren**: „In ~30 Min. losfahren“ – ebenfalls nur mit berechneter
  Strecke. Da der Lauf alle 30 Minuten kommt (cron-job.org), landet die
  Nachricht irgendwo zwischen 45 und 15 Minuten vor der Abfahrt. Verkehr
  kennt sie nicht.

Damit nichts doppelt kommt, merkt sich die Tabelle `push_gesendet`, was
raus ist (räumt sich nach sieben Tagen selbst auf). Ohne cron-job.org
(Schritt 9) sind die Erinnerungen unzuverlässig – GitHub lässt Läufe aus.

---

## Wenn mal etwas nicht stimmt

**Zuerst: Diagnose.** Ganz unten auf der Seite steht „Diagnose“ (oder
direkt `…/esrw/#status`): App-Fassung, Datenstand, Profil, Mitteilungen,
Push-Abo, Anmeldung. „Kopieren“ und den Text schicken lassen – das
beantwortet die meisten Fragen, bevor man raten muss. Tritt in der App ein
Fehler auf, erscheint unten ein roter Hinweis; antippen kopiert den
Fehlerbericht.

**Registriert, Mail bestätigt, aber „ich bin nicht in der Datenbank“ /
Admin-SQL wirkt nicht.** Drei Ursachen, in dieser Reihenfolge prüfen:

1. `select email, email_confirmed_at from auth.users;` – Konto da? Spalte
   gefüllt? Wenn leer: Link nicht angekommen (Spam, oder Site URL fehlt →
   Link ging auf localhost). In der App „Bestätigungsmail erneut senden“.
2. `select email, admin, freigeschaltet from public.profile;` – Zeile da?
   Wenn nicht: `schema.sql` (ab v6) noch einmal ausführen, der Nachtrag legt
   sie an. Vor v6 entstand die Zeile erst beim Speichern des Namens in der
   App, und das Admin-SQL lief ins Leere.
3. Admin-SQL mit `where email = '…'` ausführen, nicht mit der `id`-Unterabfrage
   aus älteren Fassungen. Danach in der App **ab- und wieder anmelden**.

**„E-Mail oder Passwort stimmt nicht“ direkt nach der Registrierung.**
Supabase meldet bei unbestätigten Konten je nach Einstellung diesen Text
statt „nicht bestätigt“. Also: erst den Link in der Mail, dann anmelden.


| Symptom | Ursache und Abhilfe |
|---|---|
| Workflow schlägt fehl mit „keine Spiele gefunden" | Der ESRW hat die Seite umgebaut. Das ist Absicht so gebaut: lieber Abbruch als leere Kalender, die allen die Termine löschen. Anzupassen ist `parse_seite()` in `esrw_ical.py` – die einzige Stelle, die HTML anfasst. |
| Bei einem Spiel steht „Halle nicht automatisch erkannt" | Neuer Verein oder ungewohnte Schreibweise. In `venues.json` unter `vereine` ergänzen, Schreibweise egal, danach einmal `python geo_holen.py`. Steht auf esrw.de gar kein Ort, kann das Skript auch keinen finden. |
| Test schlägt fehl mit „alle Hallen haben Koordinaten" | Neue Halle ohne Koordinaten. `python geo_holen.py` holt nur die fehlenden nach. |
| Statistik zeigt wenig an | Das Archiv sammelt erst ab dem ersten Lauf. Achte darauf, dass `historie.json` mit im Repository liegt und nicht in `.gitignore` steht. |
| Jemand taucht doppelt in der Liste auf | Auf esrw.de zwei Schreibweisen, die zu weit auseinanderliegen (z.B. Tippfehler im Nachnamen). Gleiche Namensbestandteile werden automatisch zusammengefasst, echte Abweichungen nicht. |
| Termine erscheinen, aber ohne Erinnerung | Beim Abonnieren stand „Alarme entfernen" auf An. Abo löschen und neu anlegen. |
| Neue Einteilung ist auf der Seite, aber nicht im Handy | iOS aktualisiert Abos träge. Im Kalender einmal nach unten ziehen, oder das Intervall wie in Schritt 5 herabsetzen. |
