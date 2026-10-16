/* Regressionstest fuer die Abrechnung.
 *
 *     node tests/test_abrechnung.js
 *
 * Kein Framework. Rueckgabewert ungleich 0, wenn etwas nicht stimmt -
 * genau wie tests/test_esrw.py.
 *
 * Geprueft wird das, was im Browser rechnet: docs/mitglieder.js wird mit
 * einer Browser-Attrappe in Node geladen und ueber window.Mitglieder.
 * pruefstand angesprochen. Die Gebuehrensaetze kommen aus der echten
 * docs/gebuehren.json - aendert der ESRW etwas und die Datei wird
 * angepasst, fallen die Erwartungen hier mit auf.
 *
 * Hier steht Geld. Jeder Fall, der einmal falsch gerechnet hat, gehoert
 * danach als Zeile hierher.
 */
"use strict";

var fs = require("fs");
var path = require("path");

var HIER = __dirname;
var WURZEL = path.dirname(HIER);

require(path.join(HIER, "attrappe_browser.js"));
require(path.join(WURZEL, "docs", "mitglieder.js"));

var P = window.Mitglieder.pruefstand;
var GEBUEHREN = JSON.parse(fs.readFileSync(path.join(WURZEL, "docs", "gebuehren.json"), "utf-8"));

var fehler = [];

function pruefe(bedingung, beschreibung, zusatz) {
  if (bedingung) {
    console.log("  ok   " + beschreibung);
  } else {
    console.log("  FEHL " + beschreibung + (zusatz ? "   " + zusatz : ""));
    fehler.push(beschreibung);
  }
}
function gleich(ist, soll, beschreibung) {
  pruefe(ist === soll, beschreibung, "ist " + JSON.stringify(ist) + ", soll " + JSON.stringify(soll));
}
// Betraege nie auf Bit-Gleichheit pruefen - 0,38 * 42 ist in keiner
// Fliesskommazahl exakt.
function etwa(ist, soll, beschreibung) {
  pruefe(typeof ist === "number" && Math.abs(ist - soll) < 0.005, beschreibung,
         "ist " + JSON.stringify(ist) + ", soll " + soll);
}
function abschnitt(titel) { console.log("\n" + titel); }

// Ein Spiel, wie es aus alleSpiele() kommt. Die Zeit ohne Zeitzone, damit
// der Zeitzuschlag die gleiche Ortszeit sieht wie im Browser.
function spiel(o) {
  return Object.assign({ kennung: "k1", beginn: "2026-10-20T19:30:00",
                         liga: "U17", paarung: "ESC Dresden - Eisloewen U17",
                         halle: "Arena", rolle: "SR", system: 2 }, o || {});
}
function grundstellung(o) {
  P.setze(Object.assign({
    gebuehren: GEBUEHREN,
    profil: { name: "Melchert, Philip", km_modell: "einfach", einstellungen: {} },
    einsaetze: {}, rechnungListe: [], rechnungWahl: {},
    ctx: { daten: { vorlauf_minuten: 60, spieldauer_minuten: 150 } }
  }, o || {}));
}


// ------------------------------------------------- Liga einordnen
abschnitt("Liga einordnen");
grundstellung();
(function () {
  function k(liga) { var e = P.ligaEinordnen(liga); return e ? e.klasse + "/" + e.stufe : null; }
  gleich(k("U17"), "U17/", "U17 ohne Stufe");
  gleich(k("U20 RL"), "U20/RL", "U20 Regionalliga");
  gleich(k("Regionalliga West"), "senioren/RL", "Regionalliga West");
  gleich(k("Landesliga NRW"), "senioren/LL", "Landesliga");
  gleich(k("Bezirksliga NRW"), "senioren/BL", "Bezirksliga");
  gleich(k("Frauen 2. Liga Nord"), "frauen/2LIGA", "Frauen 2. Liga");
  gleich(k("Frauen Landesliga"), "frauen/", "Frauen Landesliga");
  // Die DEB-Ligen stehen nicht in der ESRW-Ordnung. Sie muessen null
  // geben, damit die App den Betrag leer laesst statt zu raten.
  gleich(k("U17 I"), null, "U17 I ist DEB - kein Satz");
  gleich(k("U17 II"), null, "U17 II ist DEB - kein Satz");
  gleich(k("DNL"), null, "DNL ist DEB - kein Satz");
  gleich(k("Auswahlspiel"), null, "Auswahlspiel - kein Satz");
  gleich(k(""), null, "ohne Liga - kein Satz");
  gleich(k("Kreisliga Nordwest"), null, "unbekannte Liga - kein Satz");
})();


// ------------------------------------------------- Grundgebuehr
abschnitt("Grundgebuehr nach der Ordnung");
grundstellung();
gleich(P.grundgebuehr(spiel({ liga: "U17" })), 85, "U17 SR");
gleich(P.grundgebuehr(spiel({ liga: "U15" })), 80, "U15 SR");
gleich(P.grundgebuehr(spiel({ liga: "Regionalliga West" })), 180, "RL West, 2-Mann, SR");
gleich(P.grundgebuehr(spiel({ liga: "Regionalliga West", rolle: "HSR", system: 3 })), 160, "RL West HSR");
gleich(P.grundgebuehr(spiel({ liga: "Regionalliga West", rolle: "LSR", system: 3 })), 110, "RL West LSR");
gleich(P.grundgebuehr(spiel({ liga: "Landesliga NRW" })), 120, "Landesliga SR");
gleich(P.grundgebuehr(spiel({ liga: "Bezirksliga NRW" })), 100, "Bezirksliga SR");
gleich(P.grundgebuehr(spiel({ liga: "Frauen 2. Liga Nord" })), 95, "Frauen 2. Liga");
gleich(P.grundgebuehr(spiel({ liga: "U20 RL", rolle: "LSR", system: 3 })), 80, "U20 RL LSR");
gleich(P.grundgebuehr(spiel({ liga: "U20 Landesliga" })), 90, "U20 ohne RL");
// Im 1-Mann-System gilt der eigene, niedrigere Satz.
gleich(P.grundgebuehr(spiel({ liga: "U11", system: 1 })), 80, "U11 allein");
gleich(P.grundgebuehr(spiel({ liga: "U11", system: 2 })), 85, "U11 im Gespann");
// Eine Rolle, die es in dieser Klasse nicht gibt, faellt auf SR zurueck -
// sonst stuende im Nachwuchs nie ein Betrag.
gleich(P.grundgebuehr(spiel({ liga: "U15", rolle: "LSR", system: 3 })), 80, "U15 LSR faellt auf SR");
gleich(P.grundgebuehr(spiel({ liga: "U17 I" })), null, "DEB-Liga bleibt leer");
P.setze({ gebuehren: null });
gleich(P.grundgebuehr(spiel()), null, "ohne Ordnung kein Betrag");


// ------------------------------------------------- Eigene Regeln
abschnitt("Eigene Regeln schlagen die Ordnung");
grundstellung({ profil: { km_modell: "einfach", einstellungen: {
  regeln_liga: { "U17 I|SR": 70, "DNL|": 120 }, regeln_halle: { "Arena": 12 } } } });
gleich(P.sollBetrag(spiel({ liga: "U17 I" })), 70, "Regel fuellt, was die Ordnung nicht kennt");
gleich(P.sollBetrag(spiel({ liga: "DNL", rolle: "HSR" })), 120, "Regel ohne Rolle gilt fuer alle Rollen");
gleich(P.sollBetrag(spiel({ liga: "U17" })), 85, "ohne Regel zaehlt die Ordnung");
gleich(P.regelBetrag(spiel({ liga: "U15" })), null, "keine Regel fuer U15");
// Der Kilometer-Vorschlag nimmt die eigene Regel vor jeder Berechnung.
(function () {
  var v = P.kmVorschlag(spiel({ halle: "Arena" }));
  gleich(v && v.km, 12, "Hallenregel gibt die Kilometer");
  gleich(v && v.art, "regel", "und sagt, woher sie kommen");
  gleich(P.kmVorschlag(spiel({ halle: "Unbekannt" })), null, "ohne Regel und ohne Lage kein Vorschlag");
})();


// ------------------------------------------------- Zeitzuschlag
abschnitt("Zeitzuschlag (20 % frueh und spaet)");
grundstellung();
gleich(P.zeitzuschlag(spiel({ beginn: "2026-10-20T09:00:00" })), true, "09:00 ist frueh");
gleich(P.zeitzuschlag(spiel({ beginn: "2026-10-20T09:14:00" })), true, "09:14 noch frueh (einschliesslich)");
gleich(P.zeitzuschlag(spiel({ beginn: "2026-10-20T09:15:00" })), false, "09:15 nicht mehr");
gleich(P.zeitzuschlag(spiel({ beginn: "2026-10-20T21:45:00" })), false, "21:45 noch nicht spaet");
gleich(P.zeitzuschlag(spiel({ beginn: "2026-10-20T21:46:00" })), true, "21:46 ist spaet (einschliesslich)");
gleich(P.zeitzuschlag(spiel({ beginn: "2026-10-20T19:30:00" })), false, "19:30 ohne Zuschlag");


// ------------------------------------------------- Betrag je Spiel
abschnitt("Betrag je Spiel");
grundstellung();
(function () {
  var sp = spiel();
  etwa(P.betragFuer(sp, { verguetung: 85 }).betrag, 85, "ohne Zuschlag der Grundbetrag");
  etwa(P.betragFuer(spiel({ beginn: "2026-10-20T08:00:00" }), { verguetung: 85 }).betrag, 102,
       "frueher Anstoss: 85 + 20 %");
  // Uebergreifend: im 2-Mann-System mehr als im 3-Mann-System.
  etwa(P.betragFuer(spiel({ system: 2 }), { verguetung: 180, uebergreifend: true }).betrag, 255,
       "uebergreifend im 2-Mann-System +75");
  etwa(P.betragFuer(spiel({ system: 3 }), { verguetung: 180, uebergreifend: true }).betrag, 230,
       "uebergreifend im 3-Mann-System +50");
  etwa(P.betragFuer(sp, { verguetung: 85, ausgefallen: true }).betrag, 42.5,
       "Ausfall vor Ort halbiert");
  // Die Reihenfolge ist eine Annahme der App (die Ordnung sagt sie nicht)
  // und steht als Kommentar in betragFuer. Hier ist sie festgehalten:
  // Zeitzuschlag auf den Grundbetrag, dann uebergreifend, zum Schluss die
  // Halbierung auf die ganze Summe.
  etwa(P.betragFuer(spiel({ beginn: "2026-10-20T08:00:00", system: 2 }),
                    { verguetung: 100, uebergreifend: true, ausgefallen: true }).betrag, 97.5,
       "alle drei zusammen: (100 + 20 + 75) / 2");
  gleich(P.betragFuer(sp, { km: 30 }).betrag, null, "ohne Verguetung kein Betrag");
  gleich(P.betragFuer(sp, null).betrag, null, "ohne Eintrag kein Betrag");
  // Nur wo es den Zuschlag ueberhaupt gibt, darf die App ihn anbieten.
  gleich(P.uebergreifendMoeglich(spiel({ liga: "Regionalliga West" })), true, "RL: uebergreifend moeglich");
  gleich(P.uebergreifendMoeglich(spiel({ liga: "Frauen 2. Liga Nord" })), true, "Frauen 2. Liga: moeglich");
  gleich(P.uebergreifendMoeglich(spiel({ liga: "U17" })), false, "U17: nicht moeglich");
})();


// ------------------------------------------------- Fahrtkosten
abschnitt("Fahrtkosten");
grundstellung();
// Entfernungspauschale: einfache Strecke, nur volle Kilometer.
etwa(P.fahrtkosten({ km: 42.7 }), 15.96, "42,7 km einfach = 42 volle x 0,38");
etwa(P.fahrtkosten({ km: 0.9 }), 0, "unter einem Kilometer nichts");
P.setze({ profil: { km_modell: "hinrueck", einstellungen: {} } });
etwa(P.fahrtkosten({ km: 42 }), 25.2, "42 km hin und zurueck x 0,30");
etwa(P.fahrtkosten({ km: 42.5 }), 25.5, "hier zaehlen die angefangenen Kilometer mit");
P.setze({ profil: { km_modell: "einfach", satz_einfach: 0.5, einstellungen: {} } });
etwa(P.fahrtkosten({ km: 10 }), 5, "eigener Satz gilt");
gleich(P.fahrtkosten({ km: null }), 0, "ohne Kilometer keine Kosten");
gleich(P.fahrtkosten(null), 0, "ohne Eintrag keine Kosten");
P.setze({ profil: null });
gleich(P.fahrtkosten({ km: 42 }), 0, "ohne Profil keine Kosten");


// ------------------------------------------------- Summen
abschnitt("Summen ueber die Saison");
grundstellung();
(function () {
  var a = spiel({ kennung: "a", beginn: "2026-10-20T19:30:00" });
  var b = spiel({ kennung: "b", beginn: "2026-10-21T19:30:00" });
  var c = spiel({ kennung: "c", beginn: "2026-10-22T19:30:00" });
  P.setze({ einsaetze: {
    a: { km: 42.7, verguetung: 85, auslagen: 5, verpflegung: 14 },
    b: { km: 10 },                       // nur Kilometer, kein Betrag
    c: null                              // gar kein Eintrag
  } });
  var s = P.summen([a, b, c]);
  gleich(s.spiele, 2, "zwei Spiele mit Eintrag");
  // Die Trennung war noetig: die Zeile hiess "Spiele mit Betrag" und
  // zeigte die erste Zahl. Wer nur Kilometer eingetragen hat, zaehlt
  // beim Saldo mit, aber nicht als abgerechnetes Spiel.
  gleich(s.mitBetrag, 1, "nur eines mit Betrag");
  etwa(s.km, 52.7, "Kilometer summiert");
  etwa(s.verg, 85, "Verguetung summiert");
  etwa(s.ausl, 5, "Auslagen summiert");
  etwa(s.verpf, 14, "Verpflegung summiert");
  etwa(s.fahrt, 19.76, "Fahrtkosten: 42 x 0,38 + 10 x 0,38");
  var nur = P.summen([a, b, c], function (sp) { return sp.kennung === "a"; });
  gleich(nur.spiele, 1, "Filter wirkt");
  var leer = P.summen([]);
  gleich(leer.spiele + leer.km + leer.verg, 0, "leere Liste gibt Nullen");
})();


// ------------------------------------------------- Rechnungssumme
abschnitt("Rechnungssumme und Umsatzsteuer");
(function () {
  var b = P.rechnungSummeAus(100, 20, false);
  etwa(b.ust, 22.8, "19 % auf Pauschale und Zuschlag");
  etwa(b.gesamt, 142.8, "Gesamt mit Steuer");
  var k = P.rechnungSummeAus(100, 20, true);
  etwa(k.ust, 0, "Kleinunternehmer ohne Steuer");
  etwa(k.gesamt, 120, "Gesamt ohne Steuer");
  var leer = P.rechnungSummeAus("", null, false);
  etwa(leer.gesamt, 0, "leere Felder geben null");
  // Aus dem Formular kommen Zeichenketten, keine Zahlen.
  etwa(P.rechnungSummeAus("85", "0", true).gesamt, 85, "Text wird gerechnet, nicht aneinandergehaengt");
})();


// ------------------------------------------------- Dateiname
abschnitt("Dateiname der Rechnung");
gleich(P.rechnungDateiname("2026-003", "Düsseldorfer EG"),
       "Abrechnung_2026-003_DuesseldorferEG.pdf", "Umlaute werden umgeschrieben");
gleich(P.rechnungDateiname("2026-004", "Großer SV"),
       "Abrechnung_2026-004_GrosserSV.pdf", "scharfes s wird ss");
gleich(P.rechnungDateiname("2026-005", "Érsekújvár SC"),
       "Abrechnung_2026-005_ErsekujvarSC.pdf", "Akzente fallen weg");
gleich(P.rechnungDateiname("2026/006", ""),
       "Abrechnung_2026_006_Verein.pdf", "ohne Verein ein Ersatzname");


// ------------------------------------------------- Rechnungsnummern
abschnitt("Rechnungsnummer vorschlagen");
grundstellung({ profil: { einstellungen: {}, rechnung: {} },
                rechnungListe: [{ nummer: "2026-005" }, { nummer: "2026-002" }] });
gleich(P.nummerVorschlag({}), "2026-006", "ohne eigenen Zaehler die naechste nach der hoechsten");
// Der gespeicherte Zaehler ist eine Ansage: wer von 005 auf 002 zurueck
// will, soll 002 bekommen. Vorher gewann immer die hoechste vergebene.
grundstellung({ profil: { einstellungen: {}, rechnung: { nummer: 2 } },
                rechnungListe: [{ nummer: "2026-005" }] });
gleich(P.nummerVorschlag({}), "2026-002", "gesetzter Zaehler gewinnt, auch wenn er kleiner ist");
grundstellung({ profil: { einstellungen: {}, rechnung: { praefix: "RG-2000-" } },
                rechnungListe: [] });
gleich(P.nummerVorschlag({}), "RG-2026-001", "das Jahr im eigenen Praefix wird nachgezogen");
grundstellung({ profil: { einstellungen: {}, rechnung: {} }, rechnungListe: [],
                rechnungWahl: { k9: { beginn: "2024-03-01T19:30:00" } } });
gleich(P.nummerVorschlag({ kennungen: ["k9"] }), "2024-001", "das Jahr kommt vom Spiel, nicht von heute");


abschnitt("Nummern im Rechnungslauf");
(function () {
  grundstellung({ profil: { einstellungen: {}, rechnung: {} },
                  rechnungListe: [{ nummer: "2026-002" }] });
  var buendel = [
    { gewaehlt: true, tag: new Date("2026-10-20T12:00:00") },
    { gewaehlt: true, tag: new Date("2026-10-21T12:00:00") },
    { gewaehlt: false, tag: new Date("2026-10-22T12:00:00") },
    { gewaehlt: true, tag: new Date("2026-10-23T12:00:00") }
  ];
  P.laufNummern(buendel);
  // 2026-002 ist vergeben und wird uebersprungen - zwei gleiche Nummern
  // auf zwei Rechnungen waere der Fehler, der dem Finanzamt auffaellt.
  gleich(buendel[0].nummer, "2026-003", "erstes Buendel nach der hoechsten");
  gleich(buendel[1].nummer, "2026-004", "zweites zaehlt weiter");
  gleich(buendel[2].nummer, null, "nicht gewaehlt bekommt keine Nummer");
  gleich(buendel[3].nummer, "2026-005", "die Luecke zaehlt nicht mit");

  grundstellung({ profil: { einstellungen: {}, rechnung: {} },
                  rechnungListe: [{ nummer: "2026-003" }, { nummer: "2026-004" }] });
  var zwei = [{ gewaehlt: true, tag: new Date("2026-10-20T12:00:00") },
              { gewaehlt: true, tag: new Date("2026-10-21T12:00:00") }];
  P.laufNummern(zwei);
  gleich(zwei[0].nummer, "2026-005", "schon vergebene Nummern werden ausgelassen");
  gleich(zwei[1].nummer, "2026-006", "und zwar alle");

  // Jahreswechsel innerhalb eines Laufs: jedes Jahr zaehlt fuer sich.
  grundstellung({ profil: { einstellungen: {}, rechnung: {} }, rechnungListe: [] });
  var ueberJahr = [{ gewaehlt: true, tag: new Date("2026-12-28T12:00:00") },
                   { gewaehlt: true, tag: new Date("2027-01-04T12:00:00") }];
  P.laufNummern(ueberJahr);
  gleich(ueberJahr[0].nummer, "2026-001", "altes Jahr");
  gleich(ueberJahr[1].nummer, "2027-001", "neues Jahr faengt wieder bei eins an");
})();


// ------------------------------------------------- Verein aus der Paarung
abschnitt("Heimverein aus der Paarung");
gleich(P.heimVereinVon({ paarung: "ESC Dresden - Eisloewen U17" }), "ESC Dresden", "mit Bindestrich");
gleich(P.heimVereinVon({ paarung: "ESC Dresden – Eisloewen" }), "ESC Dresden", "mit Gedankenstrich");
// Vereinsnamen tragen selbst Bindestriche - getrennt wird nur am Strich
// mit Leerzeichen drumherum, sonst wird aus "Bergisch-Gladbach" ein
// eigener Verein und der Rechnungslauf buendelt falsch.
gleich(P.heimVereinVon({ paarung: "Bergisch-Gladbach - Neuss" }), "Bergisch-Gladbach",
       "Bindestrich im Namen trennt nicht");
gleich(P.heimVereinVon({ paarung: "Turnier" }), "Turnier", "ohne Gegner der ganze Text");
gleich(P.heimVereinVon({}), "", "ohne Paarung leer");


console.log("\n----------------------------------------------------------");
if (fehler.length) {
  console.log(fehler.length + " Pruefung" + (fehler.length === 1 ? "" : "en") + " fehlgeschlagen:");
  fehler.forEach(function (f) { console.log("  - " + f); });
  process.exit(1);
}
console.log("Alle Pruefungen bestanden.");
