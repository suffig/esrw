#!/usr/bin/env node
/*
 * Typprüfung über die vorhandenen JS-Dateien - ohne Bauschritt.
 *
 *     node tests/test_typen.js
 *
 * Warum es das gibt: `node --check` findet nur Syntaxfehler. Ein freier
 * Name ist gültiges JavaScript, und ein Objekt als Funktion aufzurufen
 * auch - beides fällt erst zur Laufzeit auf, beim Nutzer. Genau so ist
 * es zweimal passiert:
 *
 *   `seit is not defined`        Fassung 204 bis 216 live, nahm die
 *                                Statistikseite samt Saisonliste mit
 *   `aktuell is not a function`  Fassung 259, Fehler beim Start
 *
 * TypeScript findet beide. Aber `tsc --strict` meldet über die drei
 * Dateien 2530 Dinge, fast alles Typen von DOM-Knoten und Felder an
 * window - als Tor wäre das unbrauchbar. Deshalb läuft hier strict,
 * und gewertet wird nur die Auswahl unten: Fehler, die zur Laufzeit
 * wirklich knallen.
 *
 * Die Dateien bleiben Vanilla JS und werden weiter direkt ausgeliefert.
 * TypeScript kommt über npx und landet nicht im Repository - kein
 * Paketmanager, kein Bauschritt, nichts in docs/.
 */

var cp = require("child_process");
var path = require("path");

var WURZEL = path.join(__dirname, "..");
var DATEIEN = ["docs/app.js", "docs/mitglieder.js", "docs/rechnung.js"];

// Nur diese Codes zählen. Jeder steht für einen Fehler, den man sonst
// erst im Browser sieht - der Rest (Typen von DOM-Knoten, fehlende
// Felder an window) ist Rauschen und wird nicht gewertet.
var ECHTE = {
  TS2304: "Name gibt es nicht",
  TS2552: "Name gibt es nicht",
  TS2349: "kein Aufruf möglich",
  TS2554: "falsche Zahl an Argumenten",
  TS2555: "zu wenige Argumente",
  TS1117: "Eigenschaft steht zweimal im selben Objekt",
  TS2448: "vor der Deklaration benutzt",
  TS2454: "benutzt, bevor etwas zugewiesen wurde",
  TS2705: "await ohne async"
};

function lauf() {
  var befehl = "npx -y -p typescript@5.7.2 tsc --noEmit --allowJs --checkJs"
    + " --strict --target es2017 --lib es2017,dom " + DATEIEN.join(" ");
  try {
    cp.execSync(befehl, { cwd: WURZEL, encoding: "utf8", stdio: "pipe" });
    return "";
  } catch (e) {
    // tsc endet mit Rückgabewert 1, sobald es irgendetwas meldet - auch
    // wenn davon nichts gewertet wird. Die Ausgabe ist trotzdem gültig.
    if (e && typeof e.stdout === "string") return e.stdout;
    throw e;
  }
}

function main() {
  console.log("Typprüfung (TypeScript über die vorhandenen .js-Dateien) …\n");
  var ausgabe;
  try {
    ausgabe = lauf();
  } catch (e) {
    console.log("TypeScript liess sich nicht starten: " + (e && e.message));
    console.log("Ohne Netz oder npx wird diese Prüfung übersprungen.");
    return 0;
  }

  var zeilen = ausgabe.split(/\r?\n/).filter(function (z) { return /error TS\d+/.test(z); });
  var treffer = [];
  zeilen.forEach(function (z) {
    var m = z.match(/error (TS\d+)/);
    if (m && ECHTE[m[1]]) treffer.push({ code: m[1], text: z.trim() });
  });

  console.log(zeilen.length + " Meldungen insgesamt, davon " + treffer.length + " gewertet.");
  console.log("(Nicht gewertet: Typen von DOM-Knoten und Felder an window - dort");
  console.log(" ist der Code absichtlich dynamisch.)\n");

  if (!treffer.length) {
    console.log("----------------------------------------------------------");
    console.log("Keine Laufzeitfehler gefunden.");
    return 0;
  }

  treffer.forEach(function (t) {
    console.log("  " + ECHTE[t.code]);
    console.log("    " + t.text.replace(/^.*?docs[\\/]/, "docs/"));
  });
  console.log("\n----------------------------------------------------------");
  console.log(treffer.length + (treffer.length === 1 ? " Stelle" : " Stellen") + " zum Ansehen.");
  return 1;
}

process.exit(main());
