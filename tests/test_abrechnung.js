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
  // DEB-Ligen nach der DEB-Ordnung (seit Fassung 290)
  gleich(k("U17 I"), "deb/u17", "U17 I ist DEB");
  gleich(k("U17 II"), "deb/u17", "U17 II ist DEB");
  gleich(k("DNL"), null, "DNL ohne Division - kein Satz");
  gleich(k("DNL III"), "deb/dnl3", "DNL III");
  gleich(k("U20 DNL Division 1"), "deb/dnl1", "U20 DNL Division 1");
  gleich(k("DNL Div. 2"), "deb/dnl2", "DNL Div. 2");
  gleich(k("U17 Meisterrunde"), "deb/u17_meisterrunde", "U17 Meisterrunde");
  gleich(k("U15 Endturnier"), "deb/u15_endturnier", "U15 Endturnier");
  gleich(k("Oberliga Nord"), "deb/oberliga", "Oberliga Nord");
  gleich(k("Oberliga Nord Playoffs"), "deb/oberliga_playoffs", "Oberliga Playoffs");
  gleich(k("DFEL"), "deb/dfel", "DFEL (1. Liga)");
  gleich(k("DFEL2 Nord"), "frauen/2LIGA", "DFEL2 bleibt beim ESRW");
  gleich(k("DEFL 2 FS"), "frauen/2LIGA", "DEFL 2 bleibt beim ESRW");
  gleich(k("U17 RL"), "U17/RL", "U17 RL bleibt beim ESRW");
  gleich(k("U17 FS"), "U17/", "U17 FS bleibt beim ESRW");
  gleich(k("U15 RLA"), "U15/RL", "U15 RLA bleibt beim ESRW");
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
// HSR und LSR gibt es laut Ordnung nur bei den Herren (RL, LL, BL)
// und in der U20 RL - vom Betreiber bestaetigt. In allen anderen
// Klassen pfeifen Schiedsrichter. Steht dort trotzdem ein HSR, fehlt
// nicht der Satz, sondern die Einteilung passt nicht zur Klasse: dann
// lieber nichts vorschlagen als den SR-Betrag, der frueher
// stillschweigend eingetragen wurde.
gleich(P.grundgebuehr(spiel({ liga: "U15", rolle: "LSR", system: 3 })), null, "U15 kennt keinen LSR, also kein Betrag");
gleich(P.grundgebuehr(spiel({ liga: "U15", rolle: "HSR", system: 3 })), null, "U15 HSR ebenso");
gleich(P.grundgebuehr(spiel({ liga: "U15", rolle: "SR", system: 2 })), 80, "der SR bekommt seinen Satz weiter");
gleich(P.grundgebuehr(spiel({ liga: "Frauen 2. Liga Nord", rolle: "LSR", system: 3 })), null, "bei den Frauen gibt es nur Schiedsrichter");
// Wo die Ordnung sie nennt, gelten sie unveraendert - das sind genau
// die Herren und die U20 RL.
gleich(P.grundgebuehr(spiel({ liga: "RL West", rolle: "HSR", system: 3 })), 160, "RL West HSR");
gleich(P.grundgebuehr(spiel({ liga: "RL West", rolle: "LSR", system: 3 })), 110, "RL West LSR");
gleich(P.grundgebuehr(spiel({ liga: "Landesliga NRW", rolle: "HSR", system: 3 })), 160, "Landesliga HSR");
gleich(P.grundgebuehr(spiel({ liga: "Landesliga NRW", rolle: "LSR", system: 3 })), 110, "Landesliga LSR");
gleich(P.grundgebuehr(spiel({ liga: "Bezirksliga NRW", rolle: "HSR", system: 3 })), 100, "Bezirksliga HSR");
gleich(P.grundgebuehr(spiel({ liga: "U20 RL West", rolle: "HSR", system: 3 })), 100, "U20 RL HSR");
gleich(P.grundgebuehr(spiel({ liga: "U20 RL West", rolle: "LSR", system: 3 })), 80, "U20 RL LSR");
// Und ausserhalb der RL kennt auch die U20 keine Linienrichter.
gleich(P.grundgebuehr(spiel({ liga: "U20 Landesliga", rolle: "LSR", system: 3 })), null, "U20 Landesliga ohne LSR");
gleich(P.grundgebuehr(spiel({ liga: "U20 Landesliga", rolle: "SR", system: 2 })), 90, "U20 Landesliga SR");
gleich(P.grundgebuehr(spiel({ liga: "U17 I" })), 125, "U17 I im 2er-System 125 (DEB)");
P.setze({ gebuehren: null });
gleich(P.grundgebuehr(spiel()), null, "ohne Ordnung kein Betrag");


// ------------------------------------------------- Eigene Regeln
abschnitt("Eigene Regeln schlagen die Ordnung");
grundstellung({ profil: { km_modell: "einfach", einstellungen: {
  regeln_liga: { "DA FS|SR": 70, "DNL|": 120 }, regeln_halle: { "Arena": 12 } } } });
gleich(P.sollBetrag(spiel({ liga: "DA FS" })), 70, "Regel fuellt, was die Ordnung nicht kennt");
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


// ------------------------------------------------- PDF-Schreiber
//
// docs/rechnung.js haengt einen zweiten Inhaltsstrom an die Vorlage des
// EHV NRW. Geht daran etwas kaputt, entsteht die Datei trotzdem - sie
// laesst sich nur nicht mehr oeffnen, oder die Umlaute sind zerstoert.
// Beides faellt ohne Pruefung erst dem Verein auf. test_esrw.py prueft
// die Vorlage, hier geht es um das, was daraus gemacht wird.
abschnitt("Rechnung als PDF");
require(path.join(WURZEL, "docs", "rechnung.js"));

var pdfFertig = window.Rechnung.felder().then(function (felder) {
  pruefe(Object.keys(felder).length > 15, "die Vorlage bringt ihre Felder mit",
         Object.keys(felder).length + " Felder");
  return window.Rechnung.bauen({
    "1": "Müller, Jörg", "2": "Straße 3", "3": "40210 Düsseldorf",
    "4": "04.10.2026", "Dropdown3": "LL FS",
    "Rechnungsempfänger Verein": "Soester EG", "PLZ und Ort": "59494 Soest"
  });
}).then(function (blob) {
  return blob.arrayBuffer();
}).then(function (buf) {
  var roh = Buffer.from(buf);
  var text = roh.toString("latin1");
  gleich(text.slice(0, 5), "%PDF-", "die Datei faengt als PDF an");
  pruefe(text.lastIndexOf("%%EOF") > roh.length - 40, "und hoert als PDF auf",
         "letztes %%EOF bei " + text.lastIndexOf("%%EOF") + " von " + roh.length);
  pruefe(roh.length > 50000, "die Vorlage steckt drin, nicht nur der Anhang",
         roh.length + " Bytes");
  // Der eingetragene Text steht unkomprimiert im angehaengten Strom.
  pruefe(text.indexOf("Soester EG") >= 0, "der Verein steht im PDF");
  pruefe(text.indexOf("59494 Soest") >= 0, "die Anschrift steht im PDF");
  // WinAnsi, nicht UTF-8: sonst steht im Formular Kauderwelsch.
  pruefe(text.indexOf("M\u00fcller, J\u00f6rg") >= 0,
         "Umlaute stehen als WinAnsi im PDF");
  pruefe(text.indexOf("Stra\u00dfe 3") >= 0, "auch das scharfe s");
}).catch(function (e) {
  pruefe(false, "das PDF laesst sich bauen", e && e.message);
});


// Erst wenn das PDF fertig ist, steht das Ergebnis fest.
pdfFertig.then(function () {
  // ------------------------------------------------- Aus Eigenem lernen

console.log("\nGelernte Betraege und Kilometer");

// Die Ordnung kennt DNL und Auswahlspiele nicht - dort blieb das Feld
// leer, und man trug jedes Mal dasselbe von Hand ein.
P.setze({ gebuehren: GEBUEHREN, profil: { einstellungen: {} } });

var dnlAlt = spiel({ kennung: "g1", liga: "DA FS", rolle: "SR",
                     halle: "Halle Ost", beginn: "2026-09-10T18:00:00" });
var dnlNeu = spiel({ kennung: "g2", liga: "DA FS", rolle: "SR",
                     halle: "Halle Ost", beginn: "2026-11-01T18:00:00" });

pruefe(P.grundgebuehr(dnlNeu) == null, "die Ordnung kennt Auswahlspiele nicht");

// Nichts gelernt: nichts vorzuschlagen.
P.setze({ einsaetze: {} });
P.gelerntBauen([dnlAlt, dnlNeu]);
pruefe(P.sollBetrag(dnlNeu) == null, "ohne Vorbild bleibt es leer");

// Ein von Hand eingetragener Betrag (kein Herkunftsvermerk) zaehlt.
P.setze({ einsaetze: { g1: { verguetung: 95, km: 42 } } });
P.gelerntBauen([dnlAlt, dnlNeu]);
gleich(P.gelerntBetrag(dnlNeu), 95, "der eigene Betrag gilt beim naechsten Mal");
gleich(P.sollBetrag(dnlNeu), 95, "und sollBetrag gibt ihn weiter");
gleich(P.gelerntKm(dnlNeu), 42, "die Kilometer derselben Halle auch");

// Was die App selbst gerechnet hat, traegt einen Vermerk - daraus
// darf sie nicht lernen, sonst zementiert sie ihren eigenen Fehler.
P.setze({ einsaetze: { g1: { verguetung: 95, km: 42, herkunft: { verguetung: "ordnung", km: "luftlinie" } } } });
P.gelerntBauen([dnlAlt, dnlNeu]);
pruefe(P.gelerntBetrag(dnlNeu) == null, "aus Gerechnetem wird nicht gelernt");
pruefe(P.gelerntKm(dnlNeu) == null, "auch nicht bei den Kilometern");

// Gemischt: der bestaetigte Teil zaehlt, der gerechnete nicht.
P.setze({ einsaetze: { g1: { verguetung: 95, km: 42, herkunft: { km: "luftlinie" } } } });
P.gelerntBauen([dnlAlt, dnlNeu]);
gleich(P.gelerntBetrag(dnlNeu), 95, "der bestaetigte Betrag zaehlt");
pruefe(P.gelerntKm(dnlNeu) == null, "die gerechneten Kilometer nicht");

// Ein amtlicher Satz geht immer vor - sonst ueberschriebe eine alte
// Gewohnheit die Gebuehrenordnung.
var ll = spiel({ kennung: "g3", liga: "Landesliga Herren", rolle: "SR", system: 2,
                 halle: "Halle Ost", beginn: "2026-10-01T18:00:00" });
var llAlt = spiel({ kennung: "g4", liga: "Landesliga Herren", rolle: "SR", system: 2,
                    halle: "Halle Ost", beginn: "2026-08-01T18:00:00" });
P.setze({ einsaetze: { g4: { verguetung: 5 } } });
P.gelerntBauen([llAlt, ll]);
gleich(P.sollBetrag(ll), P.grundgebuehr(ll), "die Ordnung schlaegt die Gewohnheit");
pruefe(P.sollBetrag(ll) !== 5, "der alte Eigenwert gewinnt nicht");

// Mehrere Werte: der haeufigste gewinnt.
gleich(P.haeufigster([80, 95, 95]), 95, "der haeufigste Wert gewinnt");
gleich(P.haeufigster([95, 95, 80, 80]), 95, "bei Gleichstand der zuerst gesehene");
pruefe(P.haeufigster([]) == null, "aus nichts wird nichts");
pruefe(P.haeufigster(null) == null, "und aus null auch nicht");

// Drei richtige schlagen einen Tippfehler, auch wenn er juenger ist.
var vier = ["h1", "h2", "h3", "h4"].map(function (k, i) {
  return spiel({ kennung: k, liga: "Auswahlspiel Bezirk", rolle: "SR", halle: "Halle Ost",
                 beginn: "2026-0" + (6 + i) + "-01T18:00:00" });
});
P.setze({ einsaetze: { h1: { verguetung: 70 }, h2: { verguetung: 70 },
                       h3: { verguetung: 70 }, h4: { verguetung: 700 } } });
P.gelerntBauen(vier);
gleich(P.gelerntBetrag(vier[0]), 70, "ein Tippfehler gewinnt nicht gegen drei Eintraege");

// Eine andere Rolle erbt nicht einfach mit.
var zweiter = spiel({ kennung: "g5", liga: "DA FS", rolle: "2. SR",
                      halle: "Halle Ost", beginn: "2026-11-02T18:00:00" });
P.setze({ einsaetze: { g1: { verguetung: 95 } } });
P.gelerntBauen([dnlAlt, zweiter]);
pruefe(P.gelerntBetrag(zweiter) == null, "eine andere Rolle erbt nicht einfach");

// Die Kilometer haengen an der Halle, nicht an der Liga.
var andereHalle = spiel({ kennung: "g6", liga: "DA FS", rolle: "SR",
                          halle: "Sporthalle Nord", beginn: "2026-11-03T18:00:00" });
P.setze({ einsaetze: { g1: { verguetung: 95, km: 42 } } });
P.gelerntBauen([dnlAlt, andereHalle]);
pruefe(P.gelerntKm(andereHalle) == null, "eine andere Halle bekommt keine fremden Kilometer");

// Und kmVorschlag reicht das Gelernte weiter - vor der Luftlinie.
P.setze({ profil: { einstellungen: {}, heimat_lat: null, heimat_lon: null } });
P.setze({ einsaetze: { g1: { km: 42 } } });
P.gelerntBauen([dnlAlt, dnlNeu]);
var v = P.kmVorschlag(dnlNeu);
pruefe(!!v && v.km === 42, "kmVorschlag nimmt das Gelernte", v ? JSON.stringify(v) : "nichts");
gleich(v && v.art, "gelernt", "und sagt, woher es kommt");

P.setze({ einsaetze: {}, gebuehren: GEBUEHREN });
P.gelerntBauen([]);


// ---------------------------------------------------------------
// Die Stufen der Ablaufleiste: Angaben fehlen, Abrechnen, Unterwegs,
// Erledigt. Jedes vergangene Spiel gehoert in genau eine.
//
// Der Anlass: der Geldweg-Posten "unterwegs" fuehrte auf die Stufe
// "Geld fehlt", und die zeigte alles Unbezahlte - zehn Spiele statt
// der vier, die wirklich auf einer Rechnung stehen.
(function () {
  function sp(id, tage) {
    var d = new Date(); d.setDate(d.getDate() + tage);
    return { kennung: id, beginn: d.toISOString(), liga: "RL West", rolle: "SR",
             system: 2, halle: "Halle A", paarung: "A - B" };
  }
  var luecke   = sp("x1", -10);   // nichts eingetragen
  var offen    = sp("x2", -9);    // vollstaendig, keine Rechnung
  var unterweg = sp("x3", -8);    // vollstaendig, Rechnung da
  var fertig   = sp("x4", -7);    // bezahlt
  var kommt    = sp("x5", +7);    // noch nicht gespielt
  var alle = [luecke, offen, unterweg, fertig, kommt];

  // Ohne Heimatadresse zaehlen fehlende Kilometer nicht als Luecke -
  // sonst waere jedes Spiel unvollstaendig.
  P.setze({ profil: { einstellungen: {}, heimat_lat: null, heimat_lon: null },
            einsaetze: {
              x2: { verguetung: 180 },
              x3: { verguetung: 180 },
              x4: { verguetung: 180, bezahlt: new Date().toISOString() }
            },
            aufRechnung: { x3: 1 } });

  gleich(P.hatLuecke(luecke), true, "ohne Eintrag fehlen Angaben");
  gleich(P.hatLuecke(offen), false, "mit Vergütung ist nichts offen");
  gleich(P.hatLuecke(kommt), false, "ein kommendes Spiel hat keine Lücke");

  gleich(P.zumAbrechnen(offen), true, "vollständig und ohne Rechnung: abrechnen");
  gleich(P.zumAbrechnen(unterweg), false, "mit Rechnung nicht mehr abrechnen");
  gleich(P.zumAbrechnen(luecke), false, "mit Lücke noch nicht abrechnen");
  gleich(P.zumAbrechnen(fertig), false, "bezahlt wird nicht mehr abgerechnet");
  gleich(P.zumAbrechnen(kommt), false, "ein kommendes Spiel wird nicht abgerechnet");

  gleich(P.istUnterwegs(unterweg), true, "Rechnung geschrieben, Geld fehlt: unterwegs");
  gleich(P.istUnterwegs(offen), false, "ohne Rechnung ist nichts unterwegs");
  gleich(P.istUnterwegs(fertig), false, "bezahlt ist nicht mehr unterwegs");
  gleich(P.istUnterwegs(kommt), false, "ein kommendes Spiel ist nicht unterwegs");

  gleich(P.istErledigt(fertig), true, "abgehakt ist erledigt");
  gleich(P.istErledigt(offen), false, "ohne Zahlung nicht erledigt");

  // Und zusammen: keine Ueberschneidung, keiner faellt durch.
  var stufen = { fehlt: P.hatLuecke, abrechnen: P.zumAbrechnen,
                 unterwegs: P.istUnterwegs, erledigt: P.istErledigt };
  var mehrfach = [], keine = [];
  alle.forEach(function (x) {
    if (new Date(x.beginn) > new Date()) return;
    var treffer = Object.keys(stufen).filter(function (k) { return stufen[k](x); });
    if (treffer.length > 1) mehrfach.push(x.kennung + ": " + treffer.join("+"));
    if (!treffer.length) keine.push(x.kennung);
  });
  pruefe(!mehrfach.length, "keine Überschneidung der Stufen", mehrfach.join(", "));
  pruefe(!keine.length, "kein vergangenes Spiel ohne Stufe", keine.join(", "));

  // Ohne Rechnungsliste gilt alles Vollstaendige als abzurechnen - die
  // App zeigt die Stufe dann gar nicht erst an, aber die Rechnung
  // darf nicht behaupten, etwas sei unterwegs.
  P.setze({ aufRechnung: null });
  gleich(P.istUnterwegs(unterweg), false, "ohne Rechnungsliste ist nichts unterwegs");
  gleich(P.zumAbrechnen(unterweg), true, "ohne Rechnungsliste zählt es als abzurechnen");
  P.setze({ aufRechnung: null, einsaetze: {} });
})();


// ---------------------------------------------------------------------
// Abweichung vom Satz der Ordnung
//
// Bis Fassung 275 verglich das niemand: grundgebuehr() fuellte nur
// leere Felder. Ein HSR, dem eine alte Fassung den SR-Satz eintrug,
// behielt ihn fuer immer. Genau diese Faelle stehen hier.
(function () {
  function sp(id, liga, rolle, system, tage) {
    var d = new Date(); d.setDate(d.getDate() + (tage == null ? -5 : tage));
    // Fest auf 18 Uhr: mit der Uhrzeit des Testlaufs griff zwischen 21:46
    // und 09:14 der Zeitzuschlag, und aus 160 wurden 192 Euro - der Test
    // schlug abends fehl, morgens nicht.
    d.setHours(18, 0, 0, 0);
    return { kennung: id, beginn: d.toISOString(), liga: liga, rolle: rolle,
             system: system || 3, halle: "Halle A", paarung: "A - B" };
  }
  var hsrFalsch = sp("a1", "RL West", "HSR");          // bekam 180 statt 160
  var lsrFalsch = sp("a2", "RL West", "LSR");          // bekam 180 statt 110
  var hsrRecht  = sp("a3", "RL West", "HSR");          // 160, stimmt
  var srRecht   = sp("a4", "RL West", "SR", 2);        // 180, stimmt
  var llHsr     = sp("a5", "Landesliga Herren", "HSR");// 160, stimmt
  var u20Lsr    = sp("a6", "U20 RL", "LSR");           // 80, stimmt
  var unbekannt = sp("a7", "DA FS", "SR", 2); // Ordnung kennt sie nicht
  var leer      = sp("a8", "RL West", "HSR");          // nichts eingetragen
  var kommt     = sp("a9", "RL West", "HSR", 3, +7);   // noch nicht gespielt
  var cent      = sp("a10", "RL West", "HSR");         // 160,002 - Rundungsrest

  P.setze({ profil: { einstellungen: {}, heimat_lat: null, heimat_lon: null },
            aufRechnung: {},
            einsaetze: {
              a1: { verguetung: 180 }, a2: { verguetung: 180 },
              a3: { verguetung: 160 }, a4: { verguetung: 180 },
              a5: { verguetung: 160 }, a6: { verguetung: 80 },
              a7: { verguetung: 250 }, a9: { verguetung: 180 },
              a10: { verguetung: 160.002 }
            } });

  var ab = P.abweichung(hsrFalsch);
  pruefe(!!ab, "HSR mit SR-Satz faellt auf");
  if (ab) {
    gleich(ab.soll, 160, "HSR in der RL West: die Ordnung sagt 160");
    gleich(ab.ist, 180, "eingetragen waren 180");
  }
  var ab2 = P.abweichung(lsrFalsch);
  pruefe(!!ab2, "LSR mit SR-Satz faellt auf");
  if (ab2) gleich(ab2.soll, 110, "LSR in der RL West: die Ordnung sagt 110");

  gleich(P.abweichung(hsrRecht), null, "HSR mit 160 weicht nicht ab");
  gleich(P.abweichung(srRecht), null, "SR mit 180 weicht nicht ab");
  gleich(P.abweichung(llHsr), null, "HSR in der Landesliga mit 160 weicht nicht ab");
  gleich(P.abweichung(u20Lsr), null, "LSR in der U20 RL mit 80 weicht nicht ab");
  gleich(P.abweichung(unbekannt), null, "wo die Ordnung nichts sagt, gibt es keine Abweichung");
  gleich(P.abweichung(leer), null, "ein leeres Feld ist keine Abweichung, sondern eine Luecke");
  gleich(P.abweichung(kommt), null, "ein kommendes Spiel wird nicht geprueft");
  gleich(P.abweichung(cent), null, "Cent-Reste aus einer alten Rundung sind keine Abweichung");

  // Die Ordnung gilt fuer eine Saison. Ein Spiel der Vorsaison wird
  // nicht an den neuen Saetzen gemessen - sonst mahnte die App nach
  // jeder Erhoehung die ganze alte Saison an.
  var vorsaison = sp("a11", "RL West", "HSR", 3, -400);
  // Dazulegen, nicht ersetzen - die Faelle darunter brauchen ihre Zeilen.
  var mitVorsaison = {
    a1: { verguetung: 180 }, a2: { verguetung: 180 }, a3: { verguetung: 160 },
    a4: { verguetung: 180 }, a5: { verguetung: 160 }, a6: { verguetung: 80 },
    a7: { verguetung: 250 }, a9: { verguetung: 180 }, a10: { verguetung: 160.002 },
    a11: { verguetung: 180 } };
  P.setze({ einsaetze: mitVorsaison });
  gleich(P.abweichung(vorsaison), null, "ein Spiel der Vorsaison wird nicht an der neuen Ordnung gemessen");
  pruefe(!!P.abweichung(hsrFalsch), "dieselbe Abweichung in der laufenden Saison faellt weiter auf");

  // Eine eigene Regel ist eine bewusste Entscheidung - sie steht ueber
  // der Ordnung. Genau das macht der Knopf "So lassen".
  P.setze({ profil: { einstellungen: { regeln_liga: { "RL West|HSR": 180 } },
                      heimat_lat: null, heimat_lon: null } });
  gleich(P.abweichung(hsrFalsch), null, "eine eigene Regel schweigt den Hinweis");
  gleich(P.abweichung(lsrFalsch) === null, false, "die Regel gilt nur fuer diese Rolle");

  // Ein falscher Betrag darf nicht auf eine Rechnung wandern.
  P.setze({ profil: { einstellungen: {}, heimat_lat: null, heimat_lon: null } });
  gleich(P.zuPruefen(lsrFalsch), true, "falscher Betrag gehoert in die Stufe Pruefen");
  gleich(P.zuPruefen(hsrRecht), false, "ein richtiger Betrag ist geprueft");
  gleich(P.zuPruefen(leer), true, "ein leeres Feld gehoert ebenfalls in Pruefen");
  gleich(P.zumAbrechnen(lsrFalsch), false, "mit falschem Betrag wird nicht abgerechnet");
  gleich(P.zumAbrechnen(hsrRecht), true, "mit richtigem Betrag darf abgerechnet werden");

  // Die drei Zahlen am Weg. Bis Fassung 276 zaehlte die Nachfuehrung
  // nach jeder Eingabe selbst - nach hatLuecke, und in einer Leiste,
  // die es nicht mehr gab. Ein falscher Betrag muss mitzaehlen.
  P.setze({ aufRechnung: {} });
  var wz = P.wegZahlen([hsrFalsch, lsrFalsch, hsrRecht, leer, kommt]);
  gleich(wz[0].t, "3 Spiele", "Pruefen zaehlt Luecke und beide falschen Betraege");
  gleich(wz[0].f, false, "mit offenen Spielen ist Pruefen nicht fertig");
  pruefe(/160,00/.test(wz[1].t), "Abrechnen nennt die Summe des einen richtigen Spiels", wz[1].t);
  gleich(wz[2].t, "erledigt", "ohne geschriebene Rechnung ist nichts unterwegs");
  P.setze({ aufRechnung: null });
  gleich(P.wegZahlen([hsrRecht])[1].t, "…", "solange die Rechnungsliste laedt, keine Behauptung");
  gleich(P.wegZahlen([hsrRecht])[1].f, false, "und auch kein Haken");

  P.setze({ profil: { einstellungen: {}, heimat_lat: null, heimat_lon: null },
            einsaetze: {}, aufRechnung: null });
})();


// ---------------------------------------------------------------------
// Neue Gebuehrenordnung erkennen
//
// Verglichen wird mit einer Momentaufnahme der Saetze, nicht mit dem
// Stand-Text - auch eine Korrektur innerhalb einer Saison soll auffallen.
(function () {
  P.setze({ gebuehren: GEBUEHREN });
  var flach = P.gebuehrenFlach(GEBUEHREN);
  gleich(flach["senioren.RL.HSR"], 160, "flach: HSR RL West steht mit 160 drin");
  gleich(flach["nachwuchs.U20.RL.LSR"], 80, "flach: verschachtelte Saetze kommen mit");
  pruefe(!Object.keys(flach).some(function (k) { return /(^|\.)_/.test(k); }),
    "flach: Hinweistexte mit _ sind keine Saetze");

  P.setze({ profil: { einstellungen: {} } });
  gleich(P.gebuehrenAenderung().erstes, true, "ohne Momentaufnahme: nur still merken");

  P.setze({ profil: { einstellungen: { gebuehren_saetze: flach } } });
  gleich(P.gebuehrenAenderung().zeilen.length, 0, "unveraenderte Ordnung meldet nichts");

  var alt = JSON.parse(JSON.stringify(flach));
  alt["senioren.RL.HSR"] = 150;           // frueher 150, jetzt 160
  alt["senioren.XX.SR"] = 99;             // gab es, gibt es nicht mehr
  delete alt["frauen.SR"];                // gab es nicht, ist neu
  P.setze({ profil: { einstellungen: { gebuehren_saetze: alt } } });
  var z = P.gebuehrenAenderung().zeilen;
  function zeile(p) { return z.filter(function (x) { return x.pfad === p; })[0]; }
  gleich(z.length, 3, "genau die drei Aenderungen");
  gleich(zeile("senioren.RL.HSR") && zeile("senioren.RL.HSR").alt, 150, "geaenderter Satz: alter Wert");
  gleich(zeile("senioren.RL.HSR") && zeile("senioren.RL.HSR").neu, 160, "geaenderter Satz: neuer Wert");
  gleich(zeile("senioren.XX.SR") && zeile("senioren.XX.SR").neu, undefined, "weggefallener Satz");
  gleich(zeile("frauen.SR") && zeile("frauen.SR").alt, undefined, "neu hinzugekommener Satz");
  P.setze({ profil: { einstellungen: {}, heimat_lat: null, heimat_lon: null } });
})();


// ---------------------------------------------------------------------
// Ligennamen, wie esrw.de sie liefert
//
// Bis Fassung 277 landete "Senioren RLW" in der Bezirksliga: die
// Herrenregel pruefte \bRL\b, das W direkt dahinter liess sie
// durchfallen, und "...|SENIOREN" fing es auf. HSR bekam 100 statt 160,
// LSR 100 statt 110 - die App zeigte richtige Betraege als falsch an.
// Die Liste ist jeder Ligenname aus den Echtdaten vom 23.09.
(function () {
  P.setze({ gebuehren: GEBUEHREN, profil: { einstellungen: {} }, einsaetze: {} });
  function soll(liga, rolle) {
    return P.grundgebuehr({ liga: liga, rolle: rolle, system: rolle === "SR" ? 2 : 3 });
  }
  [
    // [Liga, Rolle, Satz] - null heisst: die Ordnung kennt diese Liga nicht
    ["Senioren RLW", "HSR", 160], ["Senioren RLW", "LSR", 110], ["Senioren RLW", "SR", 180],
    ["RL FS", "HSR", 160], ["RL FS", "LSR", 110],
    ["Senioren LL", "SR", 120], ["LL FS", "SR", 120],
    ["Senioren BZL", "SR", 100], ["BL FS", "SR", 100], ["BZ FS", "SR", 100],
    ["Frauen LL", "SR", 95], ["Frauen BZL", "SR", 95], ["Frauen Pokal Gr.A", "SR", 95],
    ["DEFL 2 FS", "SR", 95], ["DFEL2 Nord", "SR", 95],
    ["U20 RL", "HSR", 100], ["U20 RL", "LSR", 80], ["U20 RL", "SR", 90],
    ["U20 LL", "SR", 90], ["U20 FS", "SR", 90],
    ["U17 RL", "SR", 85], ["U17 LL", "SR", 85], ["U17 FS", "SR", 85],
    ["U15 RLA", "SR", 80], ["U15 RLB", "SR", 80], ["U15 LL", "SR", 80], ["U15 BZL", "SR", 80],
    ["U13 RLA", "SR", 80], ["U13 RLB", "SR", 80], ["U13 LL", "SR", 80],
    ["U11 RL", "SR", 85], ["U11 LL Rot", "SR", 85], ["U9 RL", "SR", 85], ["U9 LL Grün", "SR", 85],
    ["U7 Blau", "SR", 85],
    // DEB-Ligen nach der DEB-Ordnung, Auswahl kennt keine Ordnung
    ["U17 I", "SR", 125], ["U17 I", "HSR", 110], ["U17 I", "LSR", 80],
    ["DNL III", "HSR", 160], ["DNL III", "LSR", 85], ["DNL III", "SR", 170], ["DA FS", "SR", null]
  ].forEach(function (f) {
    gleich(soll(f[0], f[1]), f[2], "Ligenname \"" + f[0] + "\" als " + f[1]);
  });
  P.setze({ einsaetze: {} });
})();


// ---------------------------------------------------------------------
// Gebuehrenordnung als Uebersicht hinter dem Zahnrad
//
// (Hier stand bis Fassung 280 der Test fuer ohneAbgesetzte(). Abgesetzte
// Spiele nimmt jetzt der Workflow heraus - Test in tests/test_esrw.py.)
(function () {
  // Gebuehrenordnung als Uebersicht: gebaut aus gebuehren.json
  P.setze({ gebuehren: GEBUEHREN });
  var u = P.gebuehrenUebersicht();
  function zeileVon(name) { return u.filter(function (z) { return z.name === name; })[0] || {}; }
  gleich(zeileVon("Herren · Regionalliga").hsr, 160, "Uebersicht: Herren RL HSR 160");
  gleich(zeileVon("Herren · Regionalliga").lsr, 110, "Uebersicht: Herren RL LSR 110");
  gleich(zeileVon("U20 · Regionalliga").lsr, 80, "Uebersicht: U20 RL LSR 80");
  gleich(zeileVon("Frauen").hsr, undefined, "Uebersicht: Frauen ohne HSR");
  gleich(zeileVon("U11").allein, 80, "Uebersicht: U11 allein 80");
})();


// ---------------------------------------------------------------------
// DEB-Gebuehrenordnung (Fassung 290)
abschnitt("DEB-Ordnung");
grundstellung();
(function () {
  function g(liga, rolle, system) { return P.grundgebuehr(spiel({ liga: liga, rolle: rolle, system: system })); }
  gleich(g("U20 DNL Division 1", "HSR", 4), 185, "DNL 1 4er HSR");
  gleich(g("U20 DNL Division 1", "LSR", 4), 155, "DNL 1 4er LSR");
  gleich(g("U20 DNL Division 1", "HSR", 3), 260, "DNL 1 3er HSR");
  gleich(g("U20 DNL Division 1", "SR", 2), 270, "DNL 1 2er");
  gleich(g("DNL II", "HSR", 3), 240, "DNL 2 3er HSR");
  gleich(g("DNL III", "SR", 1), 255, "DNL 3 allein: 1,5 x 170");
  gleich(g("U17 Meisterrunde", "HSR", 4), 145, "U17 Meisterrunde 4er");
  gleich(g("U17 I", "HSR", 4), null, "U17 Gruppen 4er nennt die Ordnung nicht");
  gleich(g("U15 Endturnier", "LSR", 3), 110, "U15 Endturnier LSR");
  gleich(g("DFEL", "LSR", 3), 120, "DFEL LSR");
  gleich(g("Oberliga Nord", "HSR", 4), 315, "Oberliga HSR");
  gleich(g("Oberliga Playoffs", "LSR", 4), 250, "Oberliga Playoffs LSR");
  gleich(P.debGesamt("dnl1", 3), 570, "Gespann DNL 1 3er wie im Beispiel der Ordnung");
  gleich(P.debGesamt("oberliga", 4), 1090, "Gespann Oberliga 1.090");

  // Kein Uhrzeit-Zuschlag, Ausfall nach DEB-Regel
  var spaet = spiel({ liga: "DNL I", rolle: "HSR", system: 3, beginn: "2026-10-20T22:00:00" });
  gleich(P.zeitzuschlagAn(spaet), false, "DEB kennt keinen Uhrzeit-Zuschlag");
  etwa(P.betragFuer(spaet, { verguetung: 260 }).betrag, 260, "DEB-Betrag ohne Zuschlag");
  etwa(P.betragFuer(spaet, { verguetung: 260, ausgefallen: true }).betrag, 133, "Ausfall: (260+2x155) x 70 % / 3 = 133");
  var ol = spiel({ liga: "Oberliga Sued", rolle: "LSR", system: 4 });
  etwa(P.betragFuer(ol, { verguetung: 230, ausgefallen: true }).betrag, 136.25, "Oberliga-Ausfall: 1.090 x 50 % / 4");
  etwa(P.betragFuer(ol, { verguetung: 230, uebergreifend: true }).betrag, 230, "kein uebergreifender Zuschlag beim DEB");

  // Mehrere Spiele am selben Tag: 100 / 50 / 25 %
  var t1 = spiel({ kennung: "t1", liga: "U17 I", beginn: "2026-12-05T10:00:00", paarung: "A - B" });
  var t2 = spiel({ kennung: "t2", liga: "U17 I", beginn: "2026-12-05T13:00:00", paarung: "C - D" });
  var t3 = spiel({ kennung: "t3", liga: "U17 I", beginn: "2026-12-05T16:00:00", paarung: "E - F" });
  var esrw = spiel({ kennung: "t0", liga: "U17 RL", beginn: "2026-12-05T08:00:00", paarung: "X - Y" });
  var tag = [t3, esrw, t1, t2];
  gleich(P.debTagesFaktor(t1, tag), 1, "erstes DEB-Spiel des Tages voll");
  gleich(P.debTagesFaktor(t2, tag), 0.5, "zweites 50 %");
  gleich(P.debTagesFaktor(t3, tag), 0.25, "drittes 25 %");
  gleich(P.debTagesFaktor(t1, [t1]), 1, "allein am Tag voll");

  // Eigene Saetze auch fuer DEB-Zeilen
  grundstellung({ profil: { km_modell: "einfach", einstellungen: { gebuehren_eigen: { "deb.dnl3.3er": { HSR: 165 } } } } });
  gleich(g("DNL III", "HSR", 3), 165, "eigener DEB-Satz gilt");
  var zeile = P.gebuehrenUebersicht().filter(function (z) { return z.pfad === "deb.dnl3.3er"; })[0] || {};
  gleich(zeile.hsr, 165, "Uebersicht zeigt eigenen DEB-Satz");
  gleich(zeile.ordnung && zeile.ordnung.HSR, 160, "und den der DEB-Ordnung");
})();

// Vereine mit Tippfehler finden ihren Verein (Fassung 290)
abschnitt("Vereine mit Tippfehler");
(function () {
  P.vereinAliaseSetzen({ vereine: [{ verein: "Krefelder EV" }, { verein: "Neusser EV" }, { verein: "Düsseldorfer EG" },
                                   { verein: "Herner EV" }], aliase: {} });
  gleich(P.vereinKanon("Krefelderr EV"), "Krefelder EV", "ein Zeichen zu viel");
  gleich(P.vereinKanon("Neuser EV 1b"), "Neusser EV", "ein Zeichen zu wenig, mit Mannschaftszusatz");
  gleich(P.vereinKanon("Dusseldorfer EG U15"), "Düsseldorfer EG", "Umlaut vergessen");
  gleich(P.vereinKanon("Krefelder EC"), "Krefelder EC", "anderes Kuerzel ist ein anderer Verein");
  gleich(P.vereinKanon("Hamburger SV"), "Hamburger SV", "Unbekanntes bleibt, wie es ist");
  gleich(P.vereinAnschrift({ "Krefelder EV": { strasse: "X" } }, "Krefelderr EV").strasse, "X", "Anschrift trotz Tippfehler");
  P.vereinAliaseSetzen({});
})();

// ---------------------------------------------------------------------
// Netto fuer die Steuer (Fassung 281)
//
// Einnahmen sind die Pauschalen nach der Ordnung, Fahrt, Verpflegung und
// Auslagen gehen ab. Bis Fassung 280 zaehlten Aufstellung und
// Jahresabschluss sie dazu und nannten das "Zusammen".
abschnitt("Netto");
grundstellung();
(function () {
  var a = spiel({ kennung: "a", beginn: "2026-10-20T18:00:00" });
  P.setze({ einsaetze: { a: { km: 42.7, verguetung: 85, auslagen: 5, verpflegung: 14 } } });
  // 85 - 42 x 0,38 (15,96) - 14 - 5 = 50,04
  etwa(P.nettoSpiel(a, { km: 42.7, verguetung: 85, auslagen: 5, verpflegung: 14 }), 50.04,
    "Netto je Spiel: Pauschale minus Fahrt, Verpflegung, Auslagen");
  var s = P.summen([a]);
  etwa(P.netto(s), 50.04, "Netto der Summen ist dasselbe wie je Spiel");
  etwa(P.nettoSpiel(a, { km: 10 }), -3.8, "ohne Pauschale bleibt nur die Fahrt als Minus");
  etwa(P.nettoSpiel(a, null), 0, "ohne Eintrag null");

  // Kommende Spiele haben jetzt vorab einen Eintrag - in die Summen
  // gehoeren sie erst, wenn gespielt (oder schon bezahlt).
  var morgen = new Date(Date.now() + 86400000); morgen.setHours(18, 0, 0, 0);
  var k = spiel({ kennung: "kommt", beginn: morgen.toISOString() });
  var kb = spiel({ kennung: "kommtBezahlt", beginn: morgen.toISOString() });
  P.setze({ einsaetze: { a: { verguetung: 85 }, kommt: { verguetung: 85, km: 20 },
                         kommtBezahlt: { verguetung: 70, bezahlt: "2026-11-01" } } });
  var s2 = P.summen([a, k, kb]);
  gleich(s2.spiele, 2, "kommendes Spiel zaehlt nicht, kommendes bezahltes schon");
  etwa(s2.verg, 155, "Einnahmen ohne das kommende Spiel");
  etwa(s2.km, 0, "Kilometer des kommenden Spiels zaehlen nicht");
})();

// Eigene Saetze in der Gebuehrenordnung: je Ligaklasse und Rolle, gehen
// der Ordnung vor und gelten fuer jeden Ligatext dieser Klasse.
abschnitt("Eigene Saetze");
grundstellung();
(function () {
  var rlw = spiel({ liga: "Senioren RLW", rolle: "HSR", system: 3 });
  var rlfs = spiel({ liga: "RL FS", rolle: "HSR", system: 3 });
  var rlsr = spiel({ liga: "Senioren RLW", rolle: "SR", system: 2 });
  gleich(P.grundgebuehr(rlw), 160, "ohne eigenen Satz: Ordnung, HSR RL 160");
  grundstellung({ profil: { km_modell: "einfach", einstellungen: { gebuehren_eigen: { "senioren.RL": { HSR: 170 } } } } });
  gleich(P.grundgebuehr(rlw), 170, "eigener Satz gilt fuer Senioren RLW");
  gleich(P.grundgebuehr(rlfs), 170, "und fuer jeden anderen RL-Text");
  gleich(P.grundgebuehr(rlsr), 180, "andere Rolle bleibt bei der Ordnung");
  gleich(P.grundgebuehr(spiel({ liga: "Senioren LL", rolle: "HSR", system: 3 })), GEBUEHREN.senioren.LL.HSR,
    "andere Liga bleibt bei der Ordnung");
  var u = P.gebuehrenUebersicht();
  var rl = u.filter(function (z) { return z.name === "Herren · Regionalliga"; })[0];
  gleich(rl.hsr, 170, "Uebersicht zeigt den eigenen Satz");
  gleich(rl.ordnung.HSR, 160, "und kennt den der Ordnung");
  gleich(rl.pfad, "senioren.RL", "Pfad der Zeile");
  // Wo die Ordnung keinen Satz hat, darf man einen setzen.
  grundstellung({ profil: { km_modell: "einfach", einstellungen: { gebuehren_eigen: { "nachwuchs.U17": { HSR: 75 } } } } });
  gleich(P.grundgebuehr(spiel({ liga: "U17", rolle: "HSR", system: 3 })), 75,
    "Luecke der Ordnung mit eigenem Satz gefuellt");
  gleich(P.sollBetrag(spiel({ liga: "U17", rolle: "HSR", system: 3 })), 75, "sollBetrag nimmt ihn auch");
  // Ein Satz fuer einen einzelnen Ligatext geht weiter vor.
  grundstellung({ profil: { km_modell: "einfach", einstellungen: {
    gebuehren_eigen: { "senioren.RL": { HSR: 170 } }, regeln_liga: { "Senioren RLW|HSR": 150 } } } });
  gleich(P.sollBetrag(rlw), 150, "fester Betrag je Liga geht dem eigenen Satz vor");
  gleich(P.sollBetrag(rlfs), 170, "andere RL-Texte nehmen den eigenen Satz");
})();

abschnitt("Schalter uebergreifend");
grundstellung();
gleich(P.uebergreifendZeigen(), false, "aus, solange nicht eingeschaltet");
grundstellung({ profil: { km_modell: "einfach", einstellungen: { uebergreifend_zeigen: true } } });
gleich(P.uebergreifendZeigen(), true, "an, wenn in den Einstellungen gesetzt");
grundstellung({ profil: null });
gleich(P.uebergreifendZeigen(), false, "ohne Profil aus");


// ---------------------------------------------------------------------
// Doppelte Spiele in der Pflege (Fassung 282)
//
// Am 18.11. standen 36 Faelle in der Pflege, fast alle Doppelspieltage:
// Sa. abends und So. morgens gegen dieselbe Mannschaft. Die Faelle unten
// sind nach den echten Daten vom 23.09. gebaut.
abschnitt("Doppelte Spiele");
grundstellung({ ctx: { daten: { saison: "2026/27" } } });
(function () {
  function z(k, beginn, o) {
    return Object.assign({ kennung: k, beginn: beginn, liga: "U17 II",
                           paarung: "EV Duisburg – SCC Adler Berlin", saison: "2026/27" }, o || {});
  }
  function faelle(zeilen, ok) { return P.doppelteGruppen(zeilen, ok).length; }

  // Doppelspieltag, beide nach ihrem Tag noch auf esrw.de: gespielt.
  gleich(faelle([z("a", "2026-09-12T20:00:00+02:00", { gesehen: "2026-09-15" }),
                 z("b", "2026-09-13T10:00:00+02:00", { gesehen: "2026-09-15" })]), 0,
    "Sa/So beide gespielt: kein Fall");
  // Der erste Tag ist gespielt, der zweite steht noch im Spielplan.
  gleich(faelle([z("a", "2026-09-12T20:00:00+02:00", { gesehen: "2026-09-14" }),
                 z("b", "2026-09-13T10:00:00+02:00", { imPlan: true })]), 0,
    "einer gespielt, einer im Spielplan: kein Fall");
  // Verlegung als neues Spiel: die alte Zeit verschwand vor dem Tag.
  gleich(faelle([z("alt", "2026-09-18T19:30:00+02:00", { liga: "RL FS", paarung: "Ratingen – Leuwen",
                                                           gesehen: "2026-09-16" }),
                 z("neu", "2026-09-18T20:00:00+02:00", { liga: "RL FS", paarung: "Ratingen – Leuwen",
                                                           imPlan: true })]), 1,
    "alte Zeit vor dem Spieltag verschwunden: ein Fall");
  // Am Spieltag zuletzt gesehen zaehlt nicht als gespielt - genauso
  // urteilt abgesetzte_entfernen() im Abgleich.
  gleich(P.gespielt(z("x", "2026-09-18T19:30:00+02:00", { gesehen: "2026-09-18" })), false,
    "am Spieltag zuletzt gesehen: nicht als gespielt bestaetigt");
  gleich(P.gespielt(z("x", "2026-09-18T19:30:00+02:00", { gesehen: "2026-09-19" })), true,
    "am Tag danach gesehen: gespielt");
  // Ohne gesehen_bis (Spalte noch nicht da) urteilt der Finder wie bisher.
  gleich(faelle([z("a", "2026-09-12T20:00:00+02:00"), z("b", "2026-09-13T10:00:00+02:00")]), 1,
    "ohne gesehen_bis: Paar wie bisher gemeldet");
  // Fruehere Saison: abgeschlossen, kein Urteil mehr noetig.
  gleich(faelle([z("a", "2025-09-12T20:00:00+02:00", { saison: "2025/26" }),
                 z("b", "2025-09-13T10:00:00+02:00", { saison: "2025/26" })]), 0,
    "fruehere Saison: kein Fall");
  // Drei Wochen auseinander bleibt ausserhalb des Fensters.
  gleich(faelle([z("a", "2026-09-05T19:30:00+02:00"), z("b", "2026-09-27T19:30:00+02:00")]), 0,
    "mehr als 21 Tage auseinander: kein Fall");
  // "Kein Doppel" blendet genau diese Gruppe aus.
  var paar = [z("a", "2026-09-12T20:00:00+02:00"), z("b", "2026-09-13T10:00:00+02:00")];
  var g = P.doppelteGruppen(paar)[0];
  gleich(P.gruppenSchluessel(g), "a|b", "Schluessel: Kennungen sortiert");
  var ok = {}; ok[P.gruppenSchluessel(g)] = 1;
  gleich(faelle(paar, ok), 0, "als kein Doppel bestaetigt: weg");
  gleich(faelle(paar.concat([z("c", "2026-09-14T10:00:00+02:00")]), ok), 1,
    "kommt eine dritte Ansetzung dazu, ist die Gruppe wieder da");
})();


// ---------------------------------------------------------------------
// Offene Rechnungen (Fassung 284)
//
// Nach dem Einspielen von v54 standen Rechnungen als offen da, deren
// Spiele laengst abgehakt waren - bis Fassung 277 setzte das Schreiben
// nur die Spiele auf bezahlt, nicht gezahlt_am.
abschnitt("Offene Rechnungen");
grundstellung({ einsaetze: { a: { bezahlt: "2026-10-01T10:00:00Z" }, b: { bezahlt: "2026-10-02T10:00:00Z" }, c: {} } });
(function () {
  gleich(P.rechnungBezahlt({ gezahlt_am: "2026-10-05", kennungen: ["c"] }), true, "Eingang vermerkt: bezahlt");
  gleich(P.rechnungBezahlt({ gezahlt_am: null, kennungen: ["a", "b"] }), true, "alle Spiele abgehakt: bezahlt");
  gleich(P.rechnungBezahlt({ gezahlt_am: null, kennungen: ["a", "c"] }), false, "ein Spiel offen: offen");
  gleich(P.rechnungBezahlt({ gezahlt_am: null, kennungen: [] }), false, "ohne Spiele: nur ueber den Eingang");
  var o = P.rechnungenOffenSumme([{ gezahlt_am: null, kennungen: ["a", "b"], betrag: 100, datum: "2026-10-01" },
                                  { gezahlt_am: null, kennungen: ["c"], betrag: 85, datum: "2026-10-03" }]);
  gleich(o.zeilen.length, 1, "Summe zaehlt nur die wirklich offene");
  etwa(o.summe, 85, "offener Betrag");
})();


// ---------------------------------------------------------------------
// Vereine hinter Teamnamen (Fassung 285)
//
// Gemeldet: "Duesseldorf U15 ist zugehoerig zu DEG ev usw., auch
// Spielgemeinschaften von b und normalen Teams sind zusammen". Namen wie
// auf esrw.de (historie vom 23.09.).
abschnitt("Vereine");
grundstellung();
(function () {
  P.vereinAliaseSetzen({ aliase: { "EHC Essen": "EHC Essen Ruhr", "KEV 81": "Krefelder EV" },
                         keine_vereine: ["NRW", "Hessen", "NEV/BW"] });
  gleich(P.vereinHaupt("Düsseldorfer EG U15"), "Düsseldorfer EG", "U15 gehoert zum Verein");
  gleich(P.vereinHaupt("Krefelder EV 1b"), "Krefelder EV", "1b gehoert zum Verein");
  gleich(P.vereinHaupt("EHC Troisdorf 1c"), "EHC Troisdorf", "1c gehoert zum Verein");
  gleich(P.vereinHaupt("SpG ESV Grizzlys Bergkamen / ESC Rheine Young Cats"), "ESV Grizzlys Bergkamen",
    "Spielgemeinschaft: der erste Verein");
  gleich(P.vereinHaupt("SpG EHC Gelsenkirchen"), "EHC Gelsenkirchen", "SpG ohne Partner");
  gleich(P.vereinHaupt("SG Alt"), "SG Alt", "SG gehoert zum Vereinsnamen, nicht wegschneiden");
  gleich(P.vereinHaupt("Chiefs Leuwen Düsseldorf !!!"), "Chiefs Leuwen Düsseldorf", "Ausrufezeichen weg");
  gleich(P.vereinHaupt("ESC Rheine Young Cats"), "ESC Rheine Young Cats", "Vereinsname bleibt ganz");
  gleich(P.vereinKanon("EHC Essen"), "EHC Essen Ruhr", "Alias fuehrt zum Verein");
  gleich(P.vereinKanon("KEV 81 1b"), "Krefelder EV", "Alias auch mit Teamzusatz");
  var map = { "Düsseldorfer EG": { strasse: "Brehmstraße 27a" }, "KEC \"Die Haie\"": { strasse: "Gummersbacher Straße 4" },
              "EHC Essen Ruhr": { strasse: "Weidkamp 178" } };
  gleich((P.vereinAnschrift(map, "Düsseldorfer EG U15") || {}).strasse, "Brehmstraße 27a", "U15 findet die DEG-Anschrift");
  gleich((P.vereinAnschrift(map, "KEC „Die Haie“ 1c") || {}).strasse, "Gummersbacher Straße 4",
    "andere Anfuehrungszeichen, gleiche Anschrift");
  gleich((P.vereinAnschrift(map, "EHC Essen") || {}).strasse, "Weidkamp 178", "ueber den Alias");
  gleich(P.vereinAnschrift(map, "Neusser EV"), null, "unbekannter Verein: keine Anschrift");
  gleich(P.keinVerein("Finale", "U13 RLA"), true, "Finale ist kein Verein");
  gleich(P.keinVerein("Spiel um Platz 3", ""), true, "Spiel um Platz 3 ist kein Verein");
  gleich(P.keinVerein("NRW", "DA FS"), true, "Auswahl-Liga: kein Verein");
  gleich(P.keinVerein("Hessen", "U16"), true, "Landesauswahl aus der Liste");
  gleich(P.keinVerein("Herner EV 1b", "U17"), false, "normaler Verein");
  P.vereinAliaseSetzen(null);
})();


console.log("\n----------------------------------------------------------");
  if (fehler.length) {
    console.log(fehler.length + " Pruefung" + (fehler.length === 1 ? "" : "en") + " fehlgeschlagen:");
    fehler.forEach(function (f) { console.log("  - " + f); });
    process.exit(1);
  }
  console.log("Alle Pruefungen bestanden.");
});
