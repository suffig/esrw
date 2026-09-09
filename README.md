# Einteilungen im Kalender

Macht aus den Schiedsrichter-Einteilungen auf
[esrw.de](https://www.esrw.de/einteilungen.html) für **jeden dort genannten
Schiedsrichter** einen eigenen Kalender-Feed. Auf einer kleinen Webseite sucht
sich jeder seinen Namen und abonniert seinen persönlichen Kalender – einmal,
danach läuft es von allein.

**→ Einrichtung Schritt für Schritt: [ANLEITUNG.md](ANLEITUNG.md)**

## Was im Kalender landet

Pro Einteilung ein Termin mit:

* **Beginn = Treffpunkt**, also eine Stunde vor Spielbeginn — der Termin fängt
  um 17:00 Uhr an, wenn das Spiel um 18:00 Uhr ist
* **Hallenadresse und Koordinaten**. Durch die Koordinaten erkennt iOS die
  Halle als echten Ort und rechnet „Zeit zum Losfahren" verkehrsabhängig aus –
  Iserlohn am Freitagabend ist etwas anderes als Duisburg am Sonntagmorgen
* **Rolle** (HSR / (L)SR), Liga, echter Spielbeginn und das restliche Gespann
* **zwei Erinnerungen**: am Vortag und eine Stunde vor Treffpunkt
* **Änderungshinweis**: ändert sich Zeit oder Halle, bekommt der Termin eine
  Woche lang ein ⚠ im Titel und eine Zeile, was vorher galt

Neue Einteilungen erscheinen von selbst, Absetzungen und Zeitänderungen ziehen
mit. Die letzten 30 Tage bleiben im Kalender stehen – praktisch für die
Spesenabrechnung.

## Wie es funktioniert

Es gibt keinen Server und keine Anmeldung. Ein Skript läuft alle 30 Minuten bei
GitHub Actions, liest die Seite und schreibt einen Ordner mit fertigen Dateien:

```
docs/
  index.html            Webseite: Namen suchen, Kalender abonnieren, Statistik
  daten.json            alle Personen und Spiele, für die Webseite
  manifest.webmanifest  macht die Seite als App installierbar
  sw.js                 Service Worker, damit sie offline funktioniert
  feeds/
    garbsch-rene.ics    ein Kalender je Person
    …
    alle.ics            Gesamtkalender aller Spiele
historie.json           dauerhaftes Archiv aller je gesehenen Spiele
state.json              letzter Stand, um Änderungen zu erkennen
```

Den Ordner `docs/` liefert GitHub Pages kostenlos aus. Das Handy abonniert eine
feste Adresse und holt sich selbst die Aktualisierungen.

Braucht Python 3.8+, keine Pakete.

| Befehl | Zweck |
|---|---|
| `python esrw_ical.py` | alles bauen |
| `python esrw_ical.py --wer` | gefundene Personen auflisten |
| `python esrw_ical.py --dry` | nur anzeigen, nichts schreiben |
| `python tests/test_esrw.py` | Regressionstest, ohne Netz |
| `python geo_holen.py` | Koordinaten für neue Hallen nachtragen |
| `python icons_bauen.py` | App-Symbole neu erzeugen |

## Als App aufs Handy

Die Seite ist eine PWA: in Safari über *Teilen → Zum Home-Bildschirm* landet sie
als eigenes Symbol auf dem Startbildschirm, startet ohne Browserleiste und zeigt
die zuletzt geladenen Einteilungen auch ohne Empfang. Kalenderdateien werden
bewusst **nie** zwischengespeichert – veraltete Termine wären schlimmer als gar
keine Antwort.

## Archiv und Statistik

esrw.de zeigt nur wenige Tage rückwärts. Jeder Lauf trägt neu gesehene Spiele in
`historie.json` ein, das damit über die Saison zu einem vollständigen Archiv
wächst. Daraus rechnet die Seite je Person: Einsätze in der laufenden Saison,
insgesamt, als HSR, dazu die häufigsten Ligen und Hallen.

Das Archiv beginnt erst mit dem ersten Lauf zu sammeln – rückwirkend lässt sich
nichts holen. **`historie.json` gehört ins Repository**, sonst fängt die Zählung
bei jedem Lauf von vorn an.

## Einstellungen

Alles in [config.json](config.json):

| Feld | Bedeutung |
|---|---|
| `vorlauf_minuten` | Wie lange vor Spielbeginn man an der Halle sein soll (Standard 60) |
| `spieldauer_minuten` | Wie lang der Termin insgesamt läuft (Standard 150) |
| `vergangene_tage` | Wie viel Vergangenheit im Kalender bleibt, `0` schaltet es ab |
| `erinnerungen` | Alarme, relativ zum **Treffpunkt**. `-P1D` = ein Tag, `-PT1H` = eine Stunde vorher |
| `eigene_namen` | Nur für die ntfy-Push-Nachricht — für die Kalender selbst muss niemand eingetragen werden |

Die Einstellungen gelten für alle Feeds gemeinsam. Wer eine andere Vorlaufzeit
möchte, verschiebt sich den Termin im eigenen Kalender oder betreibt eine eigene
Kopie.

## Namen

Personen werden über ihre Namensbestandteile zusammengefasst, nicht über die
genaue Schreibweise. `Keller, Alexander`, `Keller Alexander` und
`Alexander Keller` sind dieselbe Person und bekommen einen Kalender — auf
esrw.de kommen tatsächlich mehrere Schreibweisen nebeneinander vor. Zusätze in
Klammern wie `(N)` werden ignoriert.

Was das **nicht** kann: zwei verschiedene Leute mit identischem Namen
auseinanderhalten, und Tippfehler im Namen selbst zusammenführen. Beides fällt
in der Namensliste sofort auf.

Die Suche auf der Webseite ist bei Sonderzeichen nachsichtig — `muller`,
`mueller` und `müller` finden alle „Müller", `rene` findet „René".

## Hallen-Adressen und Koordinaten

Die Adressen in [venues.json](venues.json) stammen aus dem
[Hallenverzeichnis des Eishockeyverbands NRW](https://ehv-nrw.de/club/rinklist/)
(Stand 09.09.2026), die Koordinaten von
[OpenStreetMap](https://www.openstreetmap.org/) über `geo_holen.py`.

Die Halle wird in dieser Reihenfolge bestimmt:

1. ein ausdrücklicher Zusatz auf der Seite — `… in Essen !!!`
2. ein Ortshinweis hinter dem Gastnamen — `Herforder EV – Eisadler Dortmund Herford`
3. sonst der Heimverein

Getestet gegen alle 62 Begegnungen der aktuellen und der vergangenen Woche:
61 richtig zugeordnet. Der Rest (`DA FS: NEV/BW - Sachsen/Berlin`) hat auf der
Seite selbst keinen Ort — solche Termine bekommen einen sichtbaren Warnhinweis
statt einer erfundenen Adresse.

Beim Nachtragen von Koordinaten gilt die Verbandsadresse als Grundlage. Ein
Treffer über den Hallennamen wird nur übernommen, wenn er höchstens 2 km entfernt
liegt **und** ein Sportstätten-Objekt ist – in Paderborn steht sonst ein Autohof
namens „Eisbahn" 250 m neben der richtigen Adresse.

Zwei Zuordnungen bitte beim ersten eigenen Einsatz gegenprüfen, da stütze ich
mich auf Verbandsangaben und nicht auf eigene Anschauung:

* **Herner EV 1b → Emscher-Lippe-Halle Gelsenkirchen** (das EHV-Verzeichnis führt
  die 1b als Spielgemeinschaft mit Gelsenkirchen; die Erste spielt am Gysenberg)
* **Krefelder EV → Rheinlandhalle** (Nachwuchs; die Yayla Arena liegt 200 m
  weiter in derselben Straße und ist als `yayla-arena-krefeld` hinterlegt)

Neue Vereine trägst du unter `vereine` ein, Schreibweise egal. Danach einmal
`python geo_holen.py` – der Test besteht sonst nicht, weil er Koordinaten für
jede Halle verlangt.

## Wenn etwas schiefgeht

Drei Sicherungen sind eingebaut:

* Findet das Skript **null** Spiele, bricht es ab und schreibt nichts. Leere
  Kalender würden allen Abonnenten die Termine vom Handy löschen.
* Bei Netzproblemen wird dreimal wiederholt, bevor aufgegeben wird.
* Schlägt der Workflow fehl, geht eine Push-Nachricht raus (falls `NTFY_TOPIC`
  hinterlegt ist). Sonst würden die Feeds still einfrieren und niemand merkt es.

Der Regressionstest läuft ohne Netz gegen `tests/beispielseite.html`, einen
eingefrorenen Ausschnitt der echten Seite, und prüft Auslesen, Hallenfindung,
Namenszusammenführung, Zeilenfaltung und den iCalendar-Aufbau. Die Beispielseite
bitte **nicht** aktualisieren – sonst prüft der Test nichts mehr.

## Rechtliches

Die Daten sind öffentlich abrufbar, es sind aber personenbezogene Daten
anderer Leute. Für den eigenen Kalender ist das unkritisch. **Bevor du den Link
im Kollegenkreis verteilst, frag einmal beim ESRW nach** — die Namen stehen
dann unter einer eigenen öffentlichen Adresse und deutlich bequemer
durchsuchbar als auf esrw.de. Das Archiv verstärkt das noch: es hält Einsätze
fest, die die Quelle längst vergessen hat.

Möglicherweise hat das SR-Portal (`esrw.de/portal`) auch eine Schnittstelle.
Dann fiele das Auslesen der HTML-Seite weg und die Sache würde robuster.
