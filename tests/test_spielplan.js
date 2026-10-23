/* Regressionstest fuer den Spielplan.
 *
 *     node tests/test_spielplan.js
 *
 * Kein Framework. Rueckgabewert ungleich 0, wenn etwas nicht stimmt -
 * genau wie tests/test_esrw.py und tests/test_abrechnung.js.
 *
 * Geprueft wird das, was im Browser rechnet: docs/app.js wird mit der
 * Browser-Attrappe in Node geladen und ueber window.ESRW.pruefstand
 * angesprochen.
 *
 * Der Anlass steht am Anfang: der Spielschluessel war dreimal falsch -
 * im Archiv (Fassung 200), in archiv.json (191) und im Doppelt-Finder
 * (189), jedesmal dieselbe Verwechslung bei einem verlegten Spiel.
 * Geprueft wurde er bis hierher nur ueber den Quelltext oder von Hand
 * im Browser; was die Funktion wirklich zurueckgibt, stand nirgends.
 *
 * Alles hier rechnet relativ zu heute, damit der Test an jedem Tag
 * laeuft und nicht im naechsten Januar rot wird.
 */
"use strict";

var path = require("path");

var HIER = __dirname;
var WURZEL = path.dirname(HIER);

require(path.join(HIER, "attrappe_browser.js"));
require(path.join(WURZEL, "docs", "app.js"));

var P = window.ESRW.pruefstand;

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

// Ein Tag ab heute - dieselbe Rechnung wie in zeitraum() und
// tagTitel(), damit der Vergleich nicht an der Sommerzeit scheitert.
function tagePlus(n, stunde) {
  var d = new Date();
  d.setHours(stunde === undefined ? 12 : stunde, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}


// ---------------------------------------------------- Spielschluessel

console.log("\nSpielschluessel");

gleich(P.kennungVon({ beginn: "2026-10-25T17:00:00+02:00", paarung: "A - B" }),
       "2026-10-25T17:00:00+02:00|A - B",
       "ohne id: beginn und Paarung");

gleich(P.kennungVon({ id: "kennung-7", beginn: "2026-10-25T17:00:00+02:00", paarung: "A - B" }),
       "kennung-7",
       "mit id: die id gewinnt");

// Der Fall, der dreimal falsch war: die Registratur haelt die alte
// Kennung fest, waehrend beginn schon die neue Zeit traegt. Beide
// Fassungen desselben Spiels muessen denselben Schluessel ergeben -
// sonst steht es zweimal in der Liste.
var vorher = { id: "2026-10-25T08:30:00+02:00|U17: Heim - Gast",
               beginn: "2026-10-25T08:30:00+02:00", paarung: "U17: Heim - Gast" };
var verlegt = { id: "2026-10-25T08:30:00+02:00|U17: Heim - Gast",
                beginn: "2026-10-25T09:30:00+02:00", paarung: "U17: Heim - Gast" };
gleich(P.kennungVon(verlegt), P.kennungVon(vorher),
       "verlegtes Spiel behaelt seinen Schluessel");
pruefe(P.kennungVon(verlegt) !== verlegt.beginn + "|" + verlegt.paarung,
       "und zwar nicht den aus der neuen Zeit");

// Eine leere id ist keine id - sonst wird aus "" ein Schluessel, den
// alle Spiele ohne Kennung teilen.
gleich(P.kennungVon({ id: "", beginn: "2026-10-25T17:00:00+02:00", paarung: "A - B" }),
       "2026-10-25T17:00:00+02:00|A - B",
       "leere id faellt auf beginn und Paarung zurueck");


// ------------------------------------------------- Ausgeblendete Spiele

console.log("\nAusgeblendete Spiele");

P.setze({ korrekturen: { "kennung-7": { geloescht: true },
                         "kennung-8": { beginn: "2026-10-25T10:00:00+02:00" } } });

pruefe(P.istAusgeblendet("kennung-7"), "ausdruecklich geloescht");
pruefe(!P.istAusgeblendet("kennung-8"), "nur verlegt ist nicht geloescht");
pruefe(!P.istAusgeblendet("gibt-es-nicht"), "unbekannt ist nicht geloescht");
pruefe(P.istGeloescht({ id: "kennung-7" }), "istGeloescht geht ueber den Schluessel");
pruefe(!P.istGeloescht({ beginn: "2026-10-25T17:00:00+02:00", paarung: "A - B" }),
       "und laesst ein unbekanntes Spiel stehen");

P.setze({ korrekturen: {} });


// --------------------------------------------------- Archiv sammeln

console.log("\nArchiv: vier Quellen, ein Spiel");

// Dasselbe Spiel, wie es aus den vier Quellen kommt. Es wurde von 8:30
// auf 9:30 verlegt: die Registratur haelt die alte Kennung fest,
// waehrend beginn schon die neue Zeit traegt. Genau hier stand es
// dreimal zweimal in der Liste (Fassungen 189, 191, 200).
var KENNUNG = "2026-10-25T08:30:00+02:00|U17: Heim - Gast";
var NEU = "2026-10-25T09:30:00+02:00";

function ausDatenfenster() {
  return { id: KENNUNG, beginn: NEU, liga: "U17", paarung: "U17: Heim - Gast",
           halle: "Eishalle", system: 2,
           besetzung: [{ name: "Ich", slug: "ich", rolle: "SR" }] };
}
function ausArchivJson() {
  // So steht es in archiv.json: eigene Zeile je Person, mit id.
  return { id: KENNUNG, beginn: NEU, liga: "U17", paarung: "U17: Heim - Gast",
           halle: "Eishalle", system: 2, rolle: "SR", saison: "2026/27" };
}

var karte = {};
var d1 = ausDatenfenster();
P.archivMerge(karte, { kennung: P.kennungVon(d1), beginn: d1.beginn, liga: d1.liga,
                       paarung: d1.paarung, halle: d1.halle, system: d1.system,
                       besetzung: d1.besetzung });
var a1 = ausArchivJson();
P.archivMerge(karte, { kennung: P.kennungVon(a1), beginn: a1.beginn, liga: a1.liga,
                       paarung: a1.paarung, halle: a1.halle, system: a1.system,
                       besetzung: [{ name: "Ich", slug: "ich", rolle: a1.rolle }],
                       saison: a1.saison });
// Die Datenbank liefert die Kennung fertig mit.
P.archivMerge(karte, { kennung: KENNUNG, beginn: NEU, liga: "U17",
                       paarung: "U17: Heim - Gast", halle: "Eishalle", system: 2,
                       besetzung: [{ name: "Ich", slug: "ich", rolle: "SR" }],
                       saison: "2026/27" });

gleich(Object.keys(karte).length, 1,
       "verlegtes Spiel aus drei Quellen bleibt eine Zeile");
gleich(Object.keys(karte)[0], KENNUNG, "und zwar unter der alten Kennung");

// Hier steht die eine Haelfte: dass dieselbe Kennung zu einer Zeile
// wird. Die andere - dass jede Quelle in app.js auch wirklich
// kennungVon() fragt, statt die Formel abzuschreiben - steht in
// test_esrw.py unter test_spielschluessel(). Gemessen: dieser Test
// hier bleibt gruen, wenn man die Archivschleife auf die alte,
// fehlerhafte Formel zurueckdreht; der dort faellt dann um. Beide
// zusammen decken den Fall, keiner allein.

// Zwei verschiedene Spiele bleiben zwei - sonst waere die Pruefung
// oben auch gruen, wenn alles in einen Topf faellt.
P.archivMerge(karte, { kennung: "ein-anderes", beginn: "2026-10-26T17:00:00+02:00",
                       liga: "BL", paarung: "A - B", halle: "Halle 2", system: 2,
                       besetzung: [{ name: "Ich", slug: "ich", rolle: "SR" }] });
gleich(Object.keys(karte).length, 2, "zwei verschiedene Spiele bleiben zwei");

// Ohne Kennung wird nichts eingetragen - sonst sammelten sich alle
// Spiele ohne Schluessel unter "undefined".
var vorher2 = Object.keys(karte).length;
P.archivMerge(karte, { beginn: "2026-10-27T17:00:00+02:00", paarung: "Ohne - Schluessel" });
gleich(Object.keys(karte).length, vorher2, "ohne Kennung kein Eintrag");

// Die eingefrorene Saison ist die Ausnahme: dort stehen die Zeilen als
// Feldliste auf der Platte, eine Kennung gibt es nicht. Der Schluessel
// entsteht aus beginn und Paarung - und muss dasselbe Spiel treffen.
var eingefroren = {};
P.archivMerge(eingefroren, { kennung: "2025-11-02T18:00:00+01:00|Alt - Neu",
                             beginn: "2025-11-02T18:00:00+01:00", liga: "BL",
                             paarung: "Alt - Neu", halle: "Alte Halle", system: 2,
                             besetzung: [{ name: "Ich", slug: "ich", rolle: "SR" }],
                             saison: "2025/26" });
gleich(Object.keys(eingefroren).length, 1, "eingefrorene Saison traegt ihren Schluessel selbst");

// Spaetere Quellen fuellen Luecken, ueberschreiben aber nichts, was
// schon dasteht - sonst loescht eine duenne Archivzeile die Besetzung.
var fuellen = {};
P.archivMerge(fuellen, { kennung: "k", beginn: NEU, liga: "U17", paarung: "A - B",
                         halle: "Eishalle", system: 2,
                         besetzung: [{ name: "Ich", slug: "ich", rolle: "SR" }] });
P.archivMerge(fuellen, { kennung: "k", beginn: NEU, saison: "2026/27" });
gleich(fuellen.k.besetzung.length, 1, "eine Zeile ohne Gespann loescht keines");
gleich(fuellen.k.halle, "Eishalle", "und keine Halle");
gleich(fuellen.k.saison, "2026/27", "die Saison kommt dazu");

// Die Saison wird aus dem Datum erschlossen, wenn keine dabeisteht.
gleich(P.archivSaisonAus("2026-10-25T17:00:00+02:00"), "2026/27", "Oktober gehoert zur neuen Saison");
gleich(P.archivSaisonAus("2026-03-15T17:00:00+01:00"), "2025/26", "Maerz noch zur alten");
gleich(P.archivSaisonAus("2026-07-01T17:00:00+02:00"), "2026/27", "Juli ist der Schnitt");

// Ausgeblendete Spiele fliegen heraus, und zwar ueber die Kennung -
// das Archiv kommt aus Dateien, die von der Korrektur nichts wissen.
P.setze({ korrekturen: { "weg": { geloescht: true } } });
var mitWeg = {};
P.archivMerge(mitWeg, { kennung: "weg", beginn: NEU, paarung: "Geloescht - X",
                        besetzung: [{ name: "Ich", slug: "ich", rolle: "SR" }] });
P.archivMerge(mitWeg, { kennung: "bleibt", beginn: NEU, paarung: "Bleibt - X",
                        besetzung: [{ name: "Ich", slug: "ich", rolle: "SR" }] });
P.archivKorrigieren(mitWeg, "ich", true);
pruefe(!mitWeg.weg, "ausgeblendetes Spiel faellt aus dem Archiv");
pruefe(!!mitWeg.bleibt, "das andere bleibt");
P.setze({ korrekturen: {} });


// ------------------------------------------------------- Zeitraeume

console.log("\nZeitraeume im Spielplan");

gleich(P.zeitraum(tagePlus(0))[0], "heute", "heute");
gleich(P.zeitraum(tagePlus(0))[1], "Heute", "und heisst so");
gleich(P.zeitraum(tagePlus(1))[0], "morgen", "morgen");
gleich(P.zeitraum(tagePlus(-1))[0], "war", "gestern ist vergangen");
gleich(P.zeitraum(tagePlus(-40))[0], "war", "lange her ist auch vergangen");

// Alles ab uebermorgen haengt vom Wochentag ab. Statt einen Kalender
// nachzubauen wird geprueft, was unabhaengig davon gelten muss.
var heuteTag = new Date(); heuteTag.setHours(0, 0, 0, 0);
var bisSo = 6 - ((heuteTag.getDay() + 6) % 7);

if (bisSo >= 2) {
  var inDerWoche = P.zeitraum(tagePlus(2))[0];
  pruefe(inDerWoche === "we" || inDerWoche === "woche",
         "uebermorgen liegt noch in dieser Woche", "ist " + inDerWoche);
}
gleich(P.zeitraum(tagePlus(bisSo + 3))[0], "naechste", "drei Tage nach Sonntag: naechste Woche");
pruefe(P.zeitraum(tagePlus(bisSo + 40))[0].indexOf("m") === 0,
       "weiter weg: nach Monat gruppiert", P.zeitraum(tagePlus(bisSo + 40))[0]);

// Ein Wochenendtag in dieser Woche gehoert unter "Dieses Wochenende".
for (var i = 2; i <= bisSo; i++) {
  var d = tagePlus(i);
  if (d.getDay() === 0 || d.getDay() === 6) {
    gleich(P.zeitraum(d)[0], "we", "Samstag oder Sonntag dieser Woche");
    break;
  }
}

// Zwei Spiele am selben Tag gehoeren in dieselbe Gruppe - sonst
// bekaeme jedes seinen eigenen Kopf.
gleich(P.zeitraum(tagePlus(1, 9))[0], P.zeitraum(tagePlus(1, 21))[0],
       "frueh und spaet am selben Tag: eine Gruppe");


// --------------------------------------------------------- Tagestitel

console.log("\nTagestitel");

gleich(P.tagTitel(tagePlus(0))[0], "Heute", "heute");
pruefe(P.tagTitel(tagePlus(0))[2] === true, "und ist als heute markiert");
gleich(P.tagTitel(tagePlus(1))[0], "Morgen", "morgen");
gleich(P.tagTitel(tagePlus(-1))[0], "Gestern", "gestern");
pruefe(P.tagTitel(tagePlus(1))[2] === false, "morgen ist nicht heute");
pruefe(/\d{2}\.\d{2}\.\d{4}/.test(P.tagTitel(tagePlus(0))[1]),
       "das Datum steht daneben", P.tagTitel(tagePlus(0))[1]);
pruefe(P.tagTitel(tagePlus(10))[1] === "",
       "ein ferner Tag traegt seinen Namen vorn, nicht doppelt");


// ------------------------------------------------------- Ligagruppen

console.log("\nLigagruppen");

gleich(P.ligaGruppe("U13 FS"), "U13", "Jugend mit Zusatz");
gleich(P.ligaGruppe("U7"), "U7", "einstellige Jugend");
gleich(P.ligaGruppe("u 17 RLA"), "U17", "klein geschrieben, mit Leerzeichen");
gleich(P.ligaGruppe("Frauen BZL"), "Frauen", "Frauen");
gleich(P.ligaGruppe("DFEL"), "Frauen", "DFEL zaehlt zu den Frauen");
gleich(P.ligaGruppe("Damen LL"), "Frauen", "Damen auch");
gleich(P.ligaGruppe("BL FS"), "BL", "Erwachsene: das erste Wort");
gleich(P.ligaGruppe("RLA: Heim - Gast"), "RLA", "Doppelpunkt trennt wie ein Leerzeichen");
gleich(P.ligaGruppe(""), "?", "ohne Liga");
gleich(P.ligaGruppe(null), "?", "null faellt nicht um");

// U13 und U13 FS sind dieselbe Gruppe - sonst stehen im Filter zwei
// Chips fuer dieselbe Jugend.
gleich(P.ligaGruppe("U13"), P.ligaGruppe("U13 FS"), "mit und ohne Zusatz: eine Gruppe");


// ----------------------------------------------------------- Suchtext

console.log("\nSuchtext");

gleich(P.ohneZeichen("Düsseldorfer EG"), "dusseldorfer eg", "Umlaut faellt weg");
gleich(P.ausgeschrieben("Düsseldorfer EG"), "duesseldorfer eg", "Umlaut wird ausgeschrieben");
gleich(P.ohneZeichen("Löwen Frankfurt"), "lowen frankfurt", "oe ohne Zeichen");
gleich(P.ausgeschrieben("Löwen Frankfurt"), "loewen frankfurt", "oe ausgeschrieben");
gleich(P.ohneZeichen("Straßenheim"), "strassenheim", "scharfes s wird ss");
gleich(P.ausgeschrieben("Straßenheim"), "strassenheim", "auch ausgeschrieben");
gleich(P.ohneZeichen("Krefelder EV – Löwen"), "krefelder ev lowen", "Gedankenstrich faellt weg");
gleich(P.ohneZeichen(null), "", "null gibt leer");

// Wer "duesseldorf" tippt und wer "dusseldorf" tippt, muss dasselbe
// Spiel finden - deshalb stehen beide Schreibungen im Suchtext.
var text = P.suchtextVon("Düsseldorfer EG");
pruefe(text.indexOf("dusseldorfer") >= 0, "Suchtext enthaelt die Form ohne Umlaut");
pruefe(text.indexOf("duesseldorfer") >= 0, "und die ausgeschriebene");


// ------------------------------------------------------ Naechstes Spiel

console.log("\nDein naechstes Spiel");

// Nach Beginn sortiert, so wie korrekturenAnwenden() die Liste
// hinterlaesst. naechstesEigenes() nimmt das erste passende und
// verlaesst sich darauf - mit unsortierter Liste kaeme hier das
// spaetere Spiel heraus. Siehe die Pruefung weiter unten.
var meineSpiele = {
  spiele: [
    { id: "a", beginn: tagePlus(-2).toISOString(), paarung: "Vergangen - X",
      besetzung: [{ slug: "ich" }] },
    { id: "d", beginn: tagePlus(0, 23).toISOString(), paarung: "Fremd - X",
      besetzung: [{ slug: "jemand-anders" }] },
    { id: "c", beginn: tagePlus(1).toISOString(), paarung: "Meins frueher - X",
      besetzung: [{ slug: "ich" }] },
    { id: "b", beginn: tagePlus(3).toISOString(), paarung: "Meins spaeter - X",
      besetzung: [{ slug: "ich" }] }
  ]
};
P.setze({ daten: meineSpiele, profil: { slug: "ich" } });

var n = P.naechstesEigenes();
pruefe(!!n, "es gibt ein naechstes Spiel");
if (n) {
  gleich(n.id, "c", "und zwar das fruehere der beiden eigenen");
  pruefe(n.id !== "a", "nicht das vergangene");
  pruefe(n.id !== "d", "und nicht das fremde");
}

// Die Annahme ausdruecklich: die Funktion sortiert nicht selbst. Wer
// ihr eine unsortierte Liste gibt, bekommt das falsche Spiel. Im
// Betrieb sortiert korrekturenAnwenden() - wird das einmal entfernt,
// faellt es hier auf und nicht erst auf der Startseite.
P.setze({ daten: { spiele: meineSpiele.spiele.slice().reverse() } });
var unsortiert = P.naechstesEigenes();
pruefe(unsortiert && unsortiert.id === "b",
       "unsortiert liefert sie das falsche - sie verlaesst sich auf die Sortierung",
       unsortiert && unsortiert.id);

P.setze({ profil: null });
gleich(P.naechstesEigenes(), null, "ohne Profil kein eigenes Spiel");

P.setze({ profil: { slug: "niemand" } });
gleich(P.naechstesEigenes(), null, "wer nirgends eingeteilt ist, hat keins");

P.setze({ daten: { spiele: [] }, profil: { slug: "ich" } });
gleich(P.naechstesEigenes(), null, "ohne Spiele auch nicht");


// ------------------------------------------------------------- Farben

console.log("\nFarben der Liga-Chips");

var f1 = P.farbeFuer("U13"), f2 = P.farbeFuer("U13"), f3 = P.farbeFuer("BL");
gleich(f1, f2, "dieselbe Liga bekommt dieselbe Farbe");
pruefe(f1 !== f3, "verschiedene Ligen verschiedene", f1 + " / " + f3);
pruefe(/^hsl\(/.test(f1), "als HSL", f1);
gleich(P.farbeFuer(null), P.farbeFuer(""), "null und leer sind dasselbe");

// Die Helligkeit wird je Farbton gesenkt, bis weisse Schrift 4.5:1
// erreicht - siehe farbeFuer(). Ueber 60 Prozent kann das nicht
// stimmen, da traegt kein Farbton mehr weissen Text.
var hell = ["U7", "U9", "U11", "U13", "U15", "U17", "BL", "RLA", "Frauen", "OL"]
  .map(function (liga) {
    var m = P.farbeFuer(liga).match(/,\s*([\d.]+)%\s*\)$/);
    return { liga: liga, l: m ? parseFloat(m[1]) : -1 };
  });
var zuHell = hell.filter(function (x) { return x.l < 0 || x.l > 60; });
pruefe(!zuHell.length, "keine Chipfarbe ist zu hell fuer weisse Schrift",
       zuHell.map(function (x) { return x.liga + "=" + x.l + "%"; }).join(", "));


// ------------------------------------------------------- Verkehrspuffer

console.log("\nVerkehrspuffer");

gleich(P.mitPuffer(null), null, "ohne Strecke nichts zu rechnen");
var ohneMinuten = { km: 20 };
gleich(P.mitPuffer(ohneMinuten), ohneMinuten, "ohne Minuten unveraendert");
var strecke = P.mitPuffer({ minuten: 30, km: 25 });
pruefe(strecke && strecke.minuten >= 30, "mit Puffer dauert es nicht kuerzer",
       strecke && String(strecke.minuten));
gleich(strecke.km, 25, "die Strecke bleibt dieselbe");


// ------------------------------------------------------------- Ergebnis

console.log("\n----------------------------------------------------------");
if (fehler.length) {
  console.log(fehler.length + " Pruefung" + (fehler.length === 1 ? "" : "en") + " fehlgeschlagen:");
  fehler.forEach(function (f) { console.log("  - " + f); });
  process.exit(1);
}
console.log("Alle Pruefungen bestanden.");
// app.js laesst Zeitgeber laufen (Standzeile, Wetter). Ohne das hier
// haengt Node, bis sie von selbst aufhoeren - und das tun sie nicht.
process.exit(0);
