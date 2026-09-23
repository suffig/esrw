/* Schiedsrichter-Gebuehrenabrechnung als fertiges PDF.
 *
 * Die Vorlage (docs/abrechnung/blanko.pdf) ist das Formular des EHV NRW ohne
 * Formularfelder. Statt die Felder auszufuellen - was auf dem iPhone oft leer
 * bleibt, weil Apple die Darstellung nicht selbst erzeugt - malen wir den Text
 * direkt auf die Seite: ein Anhang an die PDF-Datei mit einem zweiten
 * Inhaltsstrom. Das versteht jeder Betrachter und jeder Drucker.
 *
 * docs/abrechnung/vorlage.json sagt, wo die Felder liegen und welche
 * Objektnummern die Vorlage benutzt (erzeugt von scratchpad/vorlage_bauen.py).
 */
(function () {
  "use strict";

  var basis = document.currentScript ? document.currentScript.src.replace(/rechnung\.js.*$/, "") : "";
  var vorlagePromise = null;

  function laden() {
    if (!vorlagePromise) {
      vorlagePromise = Promise.all([
        fetch(basis + "abrechnung/vorlage.json").then(function (r) { if (!r.ok) throw new Error("Vorlage fehlt"); return r.json(); }),
        fetch(basis + "abrechnung/blanko.pdf").then(function (r) { if (!r.ok) throw new Error("Blanko fehlt"); return r.arrayBuffer(); })
      ]).then(function (r) { return { plan: r[0], pdf: new Uint8Array(r[1]) }; })
        .catch(function (e) { vorlagePromise = null; throw e; });
    }
    return vorlagePromise;
  }

  // --- kleine PDF-Helfer -------------------------------------------------
  // Text im PDF ist WinAnsi (Latin-1); Umlaute passen da hinein.
  function latin1(text) {
    var aus = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c === 0x2013 || c === 0x2014) c = 45;        // Gedankenstrich -> Bindestrich
      else if (c === 0x201e || c === 0x201c || c === 0x201d) c = 34; // Anfuehrungszeichen
      else if (c === 0x2019 || c === 0x2018) c = 39;
      else if (c === 0x20ac) c = 128;                   // Euro liegt in WinAnsi auf 128
      else if (c > 255) c = 63;                         // sonst Fragezeichen
      aus.push(c);
    }
    return aus;
  }
  function pdfText(text) {
    var roh = latin1(String(text == null ? "" : text)), aus = [];
    for (var i = 0; i < roh.length; i++) {
      var c = roh[i];
      if (c === 40 || c === 41 || c === 92) aus.push(92); // ( ) \ maskieren
      aus.push(c);
    }
    return aus;
  }
  // Breite eines Textes in Helvetica, grob nach den Standardbreiten
  var BREITEN = { " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333, "{": 334, "|": 260, "}": 334, "~": 584 };
  function breite(text, groesse) {
    var s = 0;
    for (var i = 0; i < text.length; i++) {
      var z = text[i], w;
      if (BREITEN[z] !== undefined) w = BREITEN[z];
      else if (z >= "0" && z <= "9") w = 556;
      else if (z >= "A" && z <= "Z") w = "IJ".indexOf(z) >= 0 ? 278 : "MW".indexOf(z) >= 0 ? 889 : 667;
      else if (z >= "a" && z <= "z") w = "ijl".indexOf(z) >= 0 ? 222 : "fkrt".indexOf(z) >= 0 ? 306 : "mw".indexOf(z) >= 0 ? 833 : 556;
      else w = 556;
      s += w;
    }
    return s * groesse / 1000;
  }
  // Passt der Text nicht ins Feld, wird die Schrift kleiner (bis 6,5 pt)
  function passendeGroesse(text, maxBreite, start) {
    var g = start || 10;
    while (g > 6.5 && breite(text, g) > maxBreite) g -= 0.5;
    return g;
  }

  function zeichnen(plan, werte) {
    var teile = ["q", "0 g", "BT"];
    var letzteGroesse = null;
    function feld(name, text, ausrichtung) {
      if (text === undefined || text === null || text === "") return;
      var f = plan.felder[name]; if (!f) return;
      text = String(text);
      var platz = f.x2 - f.x - 6;
      var g = passendeGroesse(text, platz, 10);
      var x = f.x + 3;
      if (ausrichtung === "rechts") x = f.x2 - 3 - breite(text, g);
      var y = f.y + (f.y2 - f.y) / 2 - g * 0.36;
      if (g !== letzteGroesse) { teile.push("/F1 " + g + " Tf"); letzteGroesse = g; }
      teile.push("1 0 0 1 " + x.toFixed(2) + " " + y.toFixed(2) + " Tm");
      teile.push("(" + String.fromCharCode.apply(null, pdfText(text)) + ") Tj");
    }
    Object.keys(werte).forEach(function (name) {
      var w = werte[name];
      if (w && typeof w === "object") feld(name, w.text, w.ausrichtung);
      else feld(name, w);
    });
    teile.push("ET");
    // Kleinunternehmer: Kreuz in das Kaestchen
    if (werte._kreuz) {
      var k = plan.felder[werte._kreuz];
      if (k) {
        var m = 2;
        teile.push("1.1 w 0 G");
        teile.push((k.x + m).toFixed(2) + " " + (k.y + m).toFixed(2) + " m " + (k.x2 - m).toFixed(2) + " " + (k.y2 - m).toFixed(2) + " l S");
        teile.push((k.x + m).toFixed(2) + " " + (k.y2 - m).toFixed(2) + " m " + (k.x2 - m).toFixed(2) + " " + (k.y + m).toFixed(2) + " l S");
      }
    }
    teile.push("Q");
    return teile.join("\n");
  }

  // --- Anhang an die PDF-Datei ------------------------------------------
  function anhaengen(plan, pdf, inhalt) {
    var neu = plan.maxObj + 1, schrift = plan.maxObj + 2;
    var seiteDict = plan.seiteDict
      .replace(/\/Contents\s+(\d+)\s+0\s+R/, "/Contents [ $1 0 R " + neu + " 0 R ]")
      .replace(/\/Font\s*<</, "/Font <<\n/F1 " + schrift + " 0 R");
    if (seiteDict.indexOf("/F1 ") < 0) throw new Error("Vorlage ohne Schriftbereich");

    var stuecke = [];
    var laenge = pdf.length;
    function zaehle(text) { var b = latin1(text); stuecke.push(b); laenge += b.length; return b.length; }

    var positionen = {};
    zaehle("\n");
    positionen[neu] = laenge;
    zaehle(neu + " 0 obj\n<< /Length " + latin1(inhalt).length + " >>\nstream\n" + inhalt + "\nendstream\nendobj\n");
    positionen[schrift] = laenge;
    zaehle(schrift + " 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n");
    positionen[plan.seite] = laenge;
    zaehle(plan.seite + " 0 obj\n" + seiteDict + "\nendobj\n");

    var xrefPos = laenge;
    function eintrag(pos) {
      var s = String(pos); while (s.length < 10) s = "0" + s;
      return s + " 00000 n \n";
    }
    var nummern = [plan.seite, neu, schrift].sort(function (a, b) { return a - b; });
    var tabelle = "xref\n0 1\n0000000000 65535 f \n";
    // Zusammenhaengende Nummern in einen Abschnitt
    var i = 0;
    while (i < nummern.length) {
      var j = i;
      while (j + 1 < nummern.length && nummern[j + 1] === nummern[j] + 1) j++;
      tabelle += nummern[i] + " " + (j - i + 1) + "\n";
      for (var k = i; k <= j; k++) tabelle += eintrag(positionen[nummern[k]]);
      i = j + 1;
    }
    zaehle(tabelle);
    zaehle("trailer\n<< /Size " + (plan.maxObj + 3) + " /Root " + plan.root + " 0 R /Prev " + plan.startxref + " >>\nstartxref\n" + xrefPos + "\n%%EOF\n");

    var gesamt = new Uint8Array(laenge);
    gesamt.set(pdf, 0);
    var pos = pdf.length;
    stuecke.forEach(function (b) { gesamt.set(b, pos); pos += b.length; });
    return gesamt;
  }

  // --- oeffentlich -------------------------------------------------------
  // werte: { "Feldname": "Text" | {text, ausrichtung}, _kreuz: "Feldname" }
  function bauen(werte) {
    return laden().then(function (v) {
      var inhalt = zeichnen(v.plan, werte);
      var bytes = anhaengen(v.plan, v.pdf, inhalt);
      return new Blob([bytes], { type: "application/pdf" });
    });
  }

  window.Rechnung = {
    bauen: bauen,
    felder: function () { return laden().then(function (v) { return v.plan.felder; }); }
  };
})();
