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
* **Rolle**, Liga, echter Spielbeginn und das restliche Gespann. Im
  Zwei-Mann-System sind beide gleichberechtigte **Schiedsrichter (SR)**; erst ab
  drei Offiziellen gibt es **Hauptschiedsrichter (HSR)** und **Linienrichter
  (LSR)** – so, wie es auf dem Eis auch ist
* **Konflikt-Hinweis**, wenn zwei eigene Spiele sich nicht vereinbaren lassen:
  gleiche Anstoßzeit, oder das zweite Spiel in einer anderen Halle beginnt,
  bevor das erste vorbei sein kann. Zwei Spiele hintereinander in derselben
  Halle sind normal und bekommen keinen Hinweis
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
  index.html            Webseite (Aufbau und Stil), Logik in app.js
  app.js                Startseite: Namen, Kalender, Spielplan, Statistik
  daten.json            alle Personen und Spiele, für die Webseite
  stand.json            nur der Zeitpunkt des letzten Laufs
  archiv.json           Spiele je Person aus dem Archiv, alle Saisons
  mitglieder.js         Mitgliederbereich (Konto, Abrechnung, Tauschboerse,
                        Verfuegbarkeit, Push), laedt bei Bedarf
  push.json             oeffentlicher VAPID-Schluessel fuer Web Push
  supabase.json         Zugang zum Backend, leer = Mitgliederbereich aus
  gebuehren.json        ESRW-Gebührenordnung, Basis der Vergütungsvorschläge
  manifest.webmanifest  macht die Seite als App installierbar
  sw.js                 Service Worker, damit sie offline funktioniert
  feeds/
    garbsch-rene.ics    ein Kalender je Person
    …
    alle.ics            Gesamtkalender aller Spiele
historie.json           dauerhaftes Archiv aller je gesehenen Spiele
state.json              letzter Stand, um Änderungen zu erkennen
supabase/schema.sql     Tabellen und Zugriffsregeln für den Mitgliederbereich
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
| `python logo_bauen.py` | App-Symbole und Kopf-Logo aus `logo_esrw_app.png` erzeugen (braucht Pillow) |
| `python icons_bauen.py` | Fallback-Symbol (Puck) ohne Bildbibliothek |
| `python push_schluessel.py` | VAPID-Schlüsselpaar für Web Push erzeugen (einmalig) |
| `python push_senden.py` | Push-Nachrichten verschicken (läuft im Workflow) |

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
zu überschreiben – erkennbar an „fremdes Profil" in der Kopfzeile. Der Knopf
**Teilen** öffnet dafür das System-Menü (nur auf Geräten, die das können).

Das Gespann ist verlinkt: ein Tipp auf den Kollegen zeigt dessen Spiele. Unter
der Statistik klappt **„Alle Spiele der Saison"** die vollständige Saisonliste
aus dem Archiv auf – auch die Spiele, die auf esrw.de längst verschwunden sind.

## Spielplan

Der zweite Reiter zeigt **alle auf esrw.de veröffentlichten Spiele** nach Tag
und Uhrzeit, mit Halle, Treffpunkt und Besetzung – auch die, für die noch
niemand eingeteilt ist (gekennzeichnet als *noch nicht besetzt*). Heute und
morgen sind hervorgehoben. Das Suchfeld filtert nach Verein, Halle, Liga oder
Name; vergangene Spiele lassen sich zuschalten. Mit **als Liste** wird es eine
Zeile je Spiel, wie die Tabelle auf esrw.de; die Wahl bleibt gespeichert. Jeder
Name führt zum jeweiligen Profil. Der Reiter ist auch direkt erreichbar:
`…/#plan`.

## Tauschoptionen

Unter jedem eigenen kommenden Spiel klappt **Tauschoptionen** auf. Zwei Listen,
komplett aus den vorhandenen Daten gerechnet, ohne Server:

**Könnten übernehmen** – Kollegen, die an dem Tag kein Spiel haben oder deren
Spiel zeitlich nicht kollidiert. Sortiert nach Plausibilität: am selben Tag
schon in dieser Halle, kennt die Halle, spielt oft in der Nähe (aus den
Koordinaten seiner häufigsten Hallen geschätzt), war schon HSR (falls die
Rolle HSR ist), diese Woche frei. Wer drei oder mehr Spiele in der Woche hat,
rutscht nach hinten.

**Tausch am selben Tag** – Kollegen mit einem Spiel an dem Tag, bei dem der
Tausch für beide aufgeht: er nimmt meins, ich nehme seins, und nichts
überschneidet sich mit den restlichen Spielen des Tages. Sortiert danach, wie
attraktiv *sein* Spiel für *mich* ist – gleiche Halle, eine Halle, die ich
kenne, oder in meiner Nähe.

Der Knopf **Anfragen** formuliert die Nachricht vor („Hallo Cedric, könntest du
am Mi. 16.09. um 19:30 Uhr das Spiel … für mich übernehmen? Treffpunkt wäre
18:30 Uhr. Danke, René") und öffnet das Teilen-Menü – WhatsApp, SMS, was
immer da ist. Telefonnummern kennt die App nicht; den Empfänger wählst du
selbst.

**Was die Liste nicht weiß:** Sie kennt nur Leute, die im Datenfenster (letzte
30 Tage plus kommende Spiele) irgendwo eingeteilt waren. Wer gerade nirgends
pfeift, taucht nicht auf. Urlaub, Verletzung, Lizenzstufe und ob jemand
überhaupt Lust hat – all das steht nirgends. Es ist eine Vorschlagsliste, die
das Suchen abkürzt, keine Zusage.

## Mitgliederbereich

Der dritte Reiter ist der einzige Teil mit Backend: Konten, Profil und eine
Abrechnung je Saison, gespeichert bei [Supabase](https://supabase.com)
(Postgres + Login, Frankfurt). Der Browser spricht direkt damit; GitHub Pages
bleibt statisch. Was ein Nutzer sehen und ändern darf, erzwingt die Datenbank
über Row Level Security (`supabase/schema.sql`) – jeder ausschließlich seine
eigenen Zeilen. Der `anon`-Schlüssel in `docs/supabase.json` ist dafür gemacht,
öffentlich zu sein.

Solange `supabase.json` leer ist, zeigt der Reiter nur einen Hinweis; alles
andere läuft unverändert. Einrichtung: ANLEITUNG.md, Schritt 10.

**Abrechnung**: alle Spiele der Saison aus dem Archiv, je Spiel km, Vergütung,
Auslagen, bezahlt, vor Ort ausgefallen (50 %), übergreifend, Notiz. Summen für
Saison und Steuerjahr. Straßenkilometer je Halle einmal über OSRM berechnet
und im Profil gespeichert; Kilometermodell wählbar (Entfernungspauschale
0,38 €/km einfache Strecke seit 2026, oder Reisekosten 0,30 €/km gefahren).
Vergütung nach ESRW-Gebührenordnung aus `docs/gebuehren.json` – Liga, Rolle,
System, +20 % bei früher/später Anstoßzeit. CSV-Export mit allen Posten. Es
ist eine Aufstellung, keine Steuerberatung.

**Mehrere Saisons und Belege**: Saison oben wählbar, das Archiv behält alle
Spielzeiten, die Steuerjahr-Summe rechnet über Saisongrenzen. Spiele nach
Monat gruppiert mit „Monat als bezahlt“. Quittungen (Foto/PDF) hängen am
Spiel und liegen im privaten Storage-Ordner des Nutzers.

**Tauschbörse**: Gesuche für Spiele, die man abgeben muss – aus der Liste
oder direkt aus den Tauschoptionen. Alle Mitglieder sehen sie und melden
„Ich kann übernehmen“. Eingeteilt wird weiterhin vom Obmann.

**Verfügbarkeit**: je Wochenendtag frei / nicht / gern. Fließt in die
Tauschoptionen aller ein – Gesperrte fallen raus, Freigemeldete rutschen nach
oben.

**Hallen-Wiki, Kontakt, Fahrgemeinschaft, Notizen**: unter jedem Spiel
(angemeldet) Hinweise aller Mitglieder zur Halle, Anrufen/WhatsApp bei
Gespannkollegen mit freigegebener Nummer, Mitfahrangebote je Spiel und eine
private Spielnotiz. Mit Heimatadresse zeigt die Karte oben die Abfahrtszeit
(OSRM-Fahrzeit, ohne Verkehr).

**Push**: echte Web-Push-Nachricht bei neuer, geänderter oder abgesetzter
Einteilung, auch bei geschlossener App; dazu Spieltag-Erinnerung ab 07:00
und „In ~30 Min. losfahren“ (mit berechneter Strecke).

**Abrechnung automatisch**: vergangene Spiele bekommen ihre Zeile von
selbst (km aus der gemerkten Strecke, Vergütung nach Ordnung); übrig bleibt
„bezahlt“ abhaken. Filter „nur unbezahlte / unvollständige“, Drucken.

**Ankündigungen**: Admin → Info, optional als Push an alle. **Monatsabrechnung
per E-Mail** an den Obmann, **Fahrtenbuch** zum Drucken, **Saison-Rückblick**
als Bild. Gesuche in der Tauschbörse erledigen sich von selbst, sobald
esrw.de jemand anderen führt. **Hallen-Seite** je Halle (Adresse, Route,
Spiele, Hinweise). Karten-Links passen sich dem Handy an (Google Maps auf
Android), Adresse kopieren, Wochenleiste und Liga-Farben im Spielplan,
Onboarding für neue Kollegen.

**Navigation**: fünf Reiter (Start · Spielplan · Tausch · Abrechnung · Mehr).
„Start“ ist ein Dashboard (nächstes Spiel mit Wetter und Abfahrt, Spiele in
7 Tagen, offene Gesuche, neue Ankündigungen, fehlende Abrechnungen). Jedes
Spiel hat eine eigene Seite (`#spiel/<kennung>`) mit Route, Wetter, Gespann
und Kontakt, Tauschoptionen, Hallen-Hinweisen, Fahrgemeinschaft, Notiz.
Filter im Spielplan liegen in einem Blatt. **Hallenkarte** (Leaflet /
OpenStreetMap) mit eigenen Spielen und Heimatringen. **Kalenderdatei mit
Abfahrtsalarm** (einmaliger Download, Alarm aus der eigenen Strecke).
**Saisonziel** mit Fortschritt in der Statistik.
Wetter kommt von Open-Meteo (ohne Schlüssel), auch in der Spieltag-Push.

**Aufgeräumt**: Statistik auf eigener Seite, Start nur mit Spielen und
Kacheln; einheitliche Kartenköpfe; „Mehr“ als Kachel-Raster. Spieltag-
Checkliste je Spiel (privat, Vorlage anpassbar), einzelnes Spiel als
Kalenderdatei, Profil-Pins (bis drei Kollegen auf Start), Gespann-Kontakte
direkt in der Kopfkarte der Spielseite.

**Gespann-Notizen & Radar**: Nachrichten am Spiel nur fürs Gespann (RLS über
die Slugs, Push an die Kollegen), Vertretungs-Radar auf Start (fremde Gesuche
und unbesetzte Spiele in der Nähe an freien Tagen), Push-Geräte einzeln
verwalten mit Server-Test, Einstellungen im Konto synchron, Kalender-Link-
Prüfung, Offline-Balken; Spielseite in Ligafarbe, ruhigere Startseite mit
Wochenstreifen in der Karte oben, sanfte Übergänge (reduced-motion respektiert).

**Startseite einstellbar**: Start zeigt nur das Wichtigste (nächstes
Spiel, Termine, Pins, Kalender, eigene Spiele, Profil ganz unten); jeder
Baustein lässt sich unter Einstellungen → Startseite an- oder abschalten
(Wochenstreifen, „Danach“, Radar sind standardmäßig aus), synchron über das
Konto. „Mehr“ ist in Gemeinsam / Für dich / Konto und App gruppiert, die
Checkliste steht auf der Spielseite vor den Extras.

**Funktionen schaltbar (Schema v10)**: Admin → Funktionen schaltet Tauschbörse,
Verfügbarkeit, Abrechnung, Info, Notizen, Gespann, Hallen, Statistik,
Checkliste, Wetter und Push für alle an oder ab (Tabelle `funktionen`, für
alle lesbar, nur Admins schreiben). Tausch und Verfügbarkeit starten aus.
Abrechnung aufgeräumt: Saldo oben, Details/Steuerjahre/Werkzeuge klappen auf.

**Konto in den Einstellungen, Heute-Modus, Suche (Schema v11)**: Einstellungen
bündelt Konto, Push, App, Startseite und persönliche Bereiche; am Spieltag
Countdown bis Abfahrt, Anruf-Knöpfe und Checkliste in der Kopfkarte; Suche
über Kollegen, Hallen, Vereine, Spiele, Termine; „Du und …“-Karte auf fremden
Profilen mit Mitfahrt-Anfrage; Monatsabschluss in der Abrechnung mit
Push-Erinnerung am Monatsende; Wochenvorschau-Push sonntags; Onboarding
verschwindet nach dem Kalender-Abo.

**Spiele korrigieren (Schema v12)**: Admins ändern je Spiel Halle, Anstoß,
Treffpunkt, Hinweis oder setzen „abgesagt“ – sofort in der App, beim
nächsten Lauf auch in Feeds und Push (Tabelle `spiel_korrekturen`).
Hallen-Erkennung: Ort hinter unbekanntem Gastverein zählt als Spielort.

**Termine & Tausch abschließen**: Ankündigungen mit Datum erscheinen auf
Start als „Nächste Termine“ (Push am Vortag); in der Tauschbörse nimmt der
Suchende ein Angebot an → „vereinbart“, Push an den Helfer, fertige
Umteilungs-Mail an den Obmann; erledigt sich, sobald esrw.de umgeteilt hat.
Spielplan mit Schnellfiltern (Wochenende, 7 Tage, abends, vormittags) und
Wochenansicht; Verfügbarkeit als Zeitraum und Mini-Kalender; Konto-Übersicht
und E-Mail ändern; Abrechnung als kompakte Zeilen; Nach-oben-Knopf; Zurück
von der Spielseite landet an der alten Stelle; Skelett-Platzhalter beim Laden.

**Kleinigkeiten**: Stand als „vor 12 Min.“, Hinweis wenn eine neue Fassung
geladen wurde, Spielplan-Filter bleiben für die Sitzung erhalten, „Teilen“ im
Filter-Blatt schickt den (gefilterten) Spielplan als Text in die Gruppe, auf
der Spielseite „Obmann anschreiben“ (Absage/Frage, Adresse aus dem Profil),
Gesuche verlinken auf die Spielseite.

**Teilen & Diagnose**: „Teilen“ an jeder Spielkarte (Text für WhatsApp),
Spieltag-Push mit „Route“-Knopf (Android), Seite `#status` mit allem für die
Fehlersuche; Laufzeitfehler erscheinen als Toast mit „kopieren“. Schriftgröße
(A−/A/A+) und Akzentfarbe im Fuß, eigene Spiele im Spielplan hervorgehoben
(„nur meine“), Wochenzettel drucken, Abrechnungs-Kacheln filtern per Tipp,
Monatsbalken je Steuerjahr.

**Spielplan**: Karten, Liste oder Monatsraster (eigene Spiele, unbesetzte
Spiele und Rest als Punkte, Tag antippen), Filter „nur unbesetzte“, Liga-Chips.
Auf breiten Bildschirmen zwei Spalten. Der Workflow-Schritt `push_senden.py`
liest die Push-Adressen mit dem `service_role`-Schlüssel (nur als
GitHub-Secret) und signiert mit dem privaten VAPID-Schlüssel (ebenfalls nur
Secret; `push_schluessel.py` erzeugt das Paar, der öffentliche Teil steht in
`docs/push.json`). Einrichtung: ANLEITUNG.md, Schritt 11.

Tauschoptionen liegen ebenfalls hinter dem Login; Anzeigen, Spielplan und
Kalender bleiben offen.

Die Logik liegt in `docs/mitglieder.js` und wird erst geladen, wenn jemand
den Reiter öffnet. Mit `"mock": true` läuft eine Attrappe im Browser, um die
Oberfläche ohne Supabase auszuprobieren.

## Benachrichtigungen in der App

Liegt die App auf dem Home-Bildschirm (iOS 16.4+ oder Android), kann sie
Mitteilungen anzeigen, wenn eine Einteilung dazugekommen ist oder sich geändert
hat. Zusätzlich zeigt das Symbol auf dem Home-Bildschirm die Anzahl als Zähler,
und der bleibt dort stehen, auch wenn die App geschlossen ist.

**Ohne Login** meldet sich die App nur, wenn du sie öffnest oder aus dem
Hintergrund holst. Echtes Web Push im Hintergrund braucht eine Ablage der
Push-Adressen und einen geheimen Absenderschlüssel – beides gibt es erst mit
dem Mitgliederbereich (Supabase, Row Level Security) und den GitHub-Secrets
aus Schritt 11; die Adressen liegen nie im Repository. Alternativen ohne
Konto: ntfy oder die GitHub-Meldung aus dem nächsten Abschnitt.

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
| `gleiche_personen` | Gruppen von Schreibweisen, die derselbe Mensch sind (siehe „Namen") |

Die Einstellungen gelten für alle Feeds gemeinsam. Wer eine andere Vorlaufzeit
möchte, verschiebt sich den Termin im eigenen Kalender oder betreibt eine eigene
Kopie.

## Namen

Personen werden über ihre Namensbestandteile zusammengefasst, nicht über die
genaue Schreibweise. `Keller, Alexander`, `Keller Alexander` und
`Alexander Keller` sind dieselbe Person und bekommen einen Kalender — auf
esrw.de kommen tatsächlich mehrere Schreibweisen nebeneinander vor. Zusätze in
Klammern wie `(N)` werden ignoriert.

Was das **nicht** von allein kann: zwei verschiedene Leute mit identischem
Namen auseinanderhalten, und echte Buchstabenunterschiede zusammenführen.
Letzteres geht über `config.json`:

```json
"gleiche_personen": [
  ["Melchert, Philip", "Melchert, Philipp"]
]
```

Alle Schreibweisen einer Gruppe sind dann eine Person; die **erste** gilt als
richtig und erscheint auf der Webseite und im Kalendernamen – auch wenn der
Obmann die andere häufiger benutzt.

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

## Sicherheit

* **Zugriff**: Row Level Security in Postgres, nicht die Webseite. Eigene
  Daten (Abrechnung, Belege, Notizen, Push-Abos) sieht nur der Besitzer;
  gemeinsame Tabellen (Tauschbörse, Verfügbarkeit, Hallen-Wiki, Kontakte,
  Mitfahrten) nur, wer vom Admin **freigeschaltet** wurde. Der Admin ist
  ein Flag in `profile`, das nur per SQL gesetzt wird; ein Trigger
  verhindert, dass sich jemand selbst freischaltet.
* **Schlüssel**: im Browser liegt nur der `anon`-Schlüssel (dafür gemacht).
  `service_role` und der private VAPID-Schlüssel existieren ausschließlich
  als GitHub-Secrets und werden nur im Workflow benutzt.
* **Content-Security-Policy** in `index.html`: Skripte nur von der Seite
  selbst und jsdelivr, Verbindungen nur zu Supabase, OSRM und Nominatim.
  supabase-js ist auf eine feste Version mit Prüfsumme (SRI) gepinnt – eine
  veränderte Datei lädt der Browser nicht. Kein Inline-JavaScript.
* **Belege**: privater Bucket, Ordner je Nutzer, nur Bilder/PDF bis 10 MB
  (serverseitig), Links laufen nach 5 Minuten ab.
* **Konto**: Passwort-Reset über Supabase-Mail, Passwort ändern, Konto
  samt allen Daten selbst löschen (`konto_loeschen()`), Datenexport als
  JSON. Alle Texte werden als Text gerendert, nie als HTML.
* **Was offen bleibt**: Wer den `anon`-Schlüssel hat, kann sich ein Konto
  anlegen – er sieht damit aber nichts Gemeinsames, bis der Admin
  freischaltet. Der Kalender und der Spielplan sind öffentlich, wie auf
  esrw.de.

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
