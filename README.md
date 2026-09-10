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
* **Hallenadresse und Koordinaten** im Ortsfeld – antippbar, Karten navigiert
  direkt hin. Die Koordinaten sind zugleich die Voraussetzung dafür, dass iOS
  eine Abfahrtszeit rechnen kann
* **Rolle** (HSR / (L)SR), Liga, echter Spielbeginn und das restliche Gespann
* **Erinnerung** eine Stunde vor dem Termin, also zwei Stunden vor Spielbeginn.
  Den Abfahrtszeitpunkt rechnet iOS selbst verkehrsabhängig aus, sobald
  „Mit aktueller Wegzeit" eingeschaltet ist – dafür sind die Koordinaten da
  (siehe ANLEITUNG.md, Schritt 5)
* **Änderungshinweis**: ändert sich Zeit oder Halle, bekommt der Termin eine
  Woche lang ein ⚠ im Titel und eine Zeile, was vorher galt

Neue Einteilungen erscheinen von selbst, Absetzungen und Zeitänderungen ziehen
mit. Die letzten 30 Tage bleiben im Kalender stehen – praktisch für die
Spesenabrechnung.

## Wie es funktioniert

Es gibt keinen Server und keine Anmeldung. Ein Skript läuft bei GitHub Actions,
liest die Seite und schreibt einen Ordner mit fertigen Dateien:

```
docs/
  index.html            Webseite: Namen suchen, Kalender abonnieren, Statistik
  daten.json            alle Personen und Spiele, für die Webseite
  stand.json            nur der Zeitpunkt des letzten Laufs
  manifest.webmanifest  macht die Seite als App installierbar
  sw.js                 Service Worker, damit sie offline funktioniert
  feeds/
    garbsch-rene.ics    ein Kalender je Person
    …
    alle.ics            Gesamtkalender aller Spiele
historie.json           dauerhaftes Archiv aller je gesehenen Spiele
state.json              letzter Stand, um Änderungen zu erkennen
```

Feeds und `daten.json` sind **byte-stabil**: ändert sich inhaltlich nichts, sind
sie nach dem nächsten Lauf identisch. Dafür trägt jeder Termin als `DTSTAMP` den
Zeitpunkt seiner letzten echten Änderung, nicht den des Laufs. Sonst würde der
Workflow bei jedem Lauf alle 61 Feeds neu committen. Der Lauf-Zeitpunkt steht
deshalb allein in `stand.json` (rund 90 Byte) – das ist gleichzeitig der
Herzschlag, an dem man in der Commit-Historie sieht, dass die Automatik läuft.

Den Ordner `docs/` liefert GitHub Pages kostenlos aus. Das Handy abonniert eine
feste Adresse und holt sich selbst die Aktualisierungen.

## Wie oft es wirklich läuft

Der Zeitplan bittet um einen Lauf pro Stunde. **GitHub hält sich nicht daran.**
Gemessen in diesem Repository: von 36 vorgesehenen Slots eines Tages kamen
drei, im Abstand von zwei bis drei Stunden. Die Läufe, die kommen, starten
sofort (Wartezeit null) – GitHub legt für die übrigen Slots also gar keinen
Lauf erst an, statt sie zu verzögern. Bei kostenlosen öffentlichen Repositories
ist das bekannt und nicht abstellbar.

Rechne also mit **alle zwei bis drei Stunden**, nicht mit stündlich. Für
Schiedsrichter-Einteilungen, die Tage im Voraus veröffentlicht werden, reicht
das; für den Kalender kommt die Trägheit von iOS ohnehin obendrauf.

Wer es sofort braucht: Actions → *Einteilungen aktualisieren* → **Run
workflow**. Der manuelle Auslöser war nie betroffen.

Wer eine wirklich verlässliche Taktung braucht, stößt den Workflow von außen
an: ein kostenloser Cron-Dienst ruft im gewünschten Takt
`POST /repos/suffig/esrw/actions/workflows/einteilungen.yml/dispatches` auf.
Schritt für Schritt steht das in [ANLEITUNG.md](ANLEITUNG.md), Schritt 9.
Der Preis dafür ist ein Zugangstoken, das außerhalb von GitHub liegt – fein
granuliert, nur `Actions: Read and write` auf dieses eine Repository.

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

## Profil

Beim ersten Öffnen fragt die App „Wer bist du?". Nach der Auswahl startet sie
immer direkt mit den eigenen Spielen und der eigenen Statistik. Die Auswahl
liegt nur im Browser des jeweiligen Handys (`localStorage`) – es gibt keine
Anmeldung, kein Konto und keinen Server, der irgendetwas darüber weiß.

Über **Wechseln** lässt sich das Profil ändern. Ein geteilter Link wie
`…/#garbsch-rene` zeigt die Spiele dieser Person an, **ohne** das eigene Profil
zu überschreiben – erkennbar an „fremdes Profil" in der Kopfzeile.

## Benachrichtigungen in der App

Liegt die App auf dem Home-Bildschirm (iOS 16.4+ oder Android), kann sie
Mitteilungen anzeigen, wenn eine Einteilung dazugekommen ist oder sich geändert
hat. Zusätzlich zeigt das Symbol auf dem Home-Bildschirm die Anzahl als Zähler,
und der bleibt dort stehen, auch wenn die App geschlossen ist.

**Was das nicht kann:** von selbst im Hintergrund melden. Dafür bräuchte es
echtes Web Push, und das verlangt einen Absender mit geheimem Schlüssel sowie
eine Ablage der Push-Adressen aller Nutzer. In einem **öffentlichen**
Repository wäre diese Ablage für jeden lesbar – deshalb ist sie hier bewusst
nicht gebaut. Die App meldet sich also, wenn du sie öffnest oder aus dem
Hintergrund holst.

Wer eine echte Hintergrund-Benachrichtigung will, nimmt ntfy oder die
GitHub-Meldung aus dem nächsten Abschnitt.

## Archiv und Statistik

esrw.de zeigt nur wenige Tage rückwärts. Jeder Lauf trägt neu gesehene Spiele in
`historie.json` ein, das damit über die Saison zu einem vollständigen Archiv
wächst. Daraus rechnet die Seite je Person: Einsätze in der laufenden Saison,
insgesamt, als HSR, dazu die häufigsten Ligen und Hallen.

Das Archiv beginnt erst mit dem ersten Lauf zu sammeln – rückwirkend lässt sich
nichts holen. **`historie.json` gehört ins Repository**, sonst fängt die Zählung
bei jedem Lauf von vorn an.

## Meldungen bei neuer Einteilung

Ändert sich etwas an *deinen* Einteilungen (neu, verschoben, abgesetzt), gehen
zwei voneinander unabhängige Meldungen raus:

* **GitHub-Issue** – der Workflow legt eines an, GitHub schickt dir dafür eine
  E-Mail. Braucht keine Einrichtung und keine zusätzliche App.
* **ntfy-Push** – nur wenn das Secret `NTFY_TOPIC` hinterlegt ist.

Wer gemeint ist, steht in `config.json` unter `eigene_namen`. Kollegen bekommen
nichts davon; bei ihnen taucht die Einteilung einfach im Kalender auf.

## Einstellungen

Alles in [config.json](config.json):

| Feld | Bedeutung |
|---|---|
| `vorlauf_minuten` | Wie lange vor Spielbeginn man an der Halle sein soll (Standard 60) |
| `spieldauer_minuten` | Wie lang der Termin insgesamt läuft (Standard 150) |
| `vergangene_tage` | Wie viel Vergangenheit im Kalender bleibt, `0` schaltet es ab |
| `erinnerungen` | Alarme, relativ zum Terminbeginn (= Treffpunkt). `-PT1H` = eine Stunde, `-PT45M` = 45 Minuten, `-P1D` = ein Tag vorher |
| `eigene_namen` | Nur für die Meldungen an dich (GitHub-Issue und ntfy) — für die Kalender selbst muss niemand eingetragen werden |

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
* Schlägt der Workflow fehl, geht eine Nachricht raus (falls `NTFY_TOPIC`
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
