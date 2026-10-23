/* Ein Browser, der gerade genug kann, damit docs/mitglieder.js in Node
 * laedt.
 *
 * Die Datei ist fuer den Browser geschrieben und greift beim Laden auf
 * window, document und localStorage zu. Statt jsdom als Abhaengigkeit
 * aufzunehmen - das Projekt hat bewusst keinen Paketmanager - stehen hier
 * die paar Dutzend Zeilen, die beim Laden wirklich angefasst werden.
 *
 * Die Attrappe zeichnet nichts und merkt sich nichts. Sie soll nur
 * verhindern, dass das Laden abbricht; die geprueften Rechenfunktionen
 * fassen kein DOM an. Fehlt einmal etwas, bricht der Test mit genau der
 * Zeile ab, die es braucht - dann hier ergaenzen.
 */
"use strict";

function knoten(kennung) {
  return {
    style: {}, dataset: {}, children: [], childNodes: [],
    value: "", textContent: "", innerHTML: "", className: "", isConnected: false,
    id: kennung || "", checked: false, disabled: false, href: "", src: "", title: "",
    tagName: "DIV", nodeType: 1, parentNode: null, firstChild: null,
    options: [], selectedIndex: 0, scrollWidth: 0, clientWidth: 0, offsetHeight: 0,
    contains: function () { return false; },
    classList: { add: function () {}, remove: function () {}, toggle: function () {},
                 contains: function () { return false; } },
    appendChild: function (x) { this.children.push(x); return x; },
    removeChild: function () {}, insertBefore: function (x) { return x; },
    setAttribute: function () {}, removeAttribute: function () {},
    getAttribute: function () { return null; },
    addEventListener: function () {}, removeEventListener: function () {},
    // Ein Knoten statt null: app.js kettet oft weiter
    // (tk.querySelector("use").setAttribute(...)), und eine Attrappe,
    // die dort null gibt, bricht an Stellen ab, die im Browser nie
    // leer sind. querySelectorAll bleibt leer - wer zaehlt, soll
    // nicht zaehlen, was es nicht gibt.
    querySelector: function () { return knoten(); }, querySelectorAll: function () { return []; },
    closest: function () { return null; },
    focus: function () {}, blur: function () {}, click: function () {},
    dispatchEvent: function () { return true; },
    hasAttribute: function () { return false; },
    remove: function () {}, scrollIntoView: function () {},
    getBoundingClientRect: function () {
      return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 };
    }
  };
}

function speicher() {
  return { getItem: function () { return null; }, setItem: function () {},
           removeItem: function () {}, clear: function () {} };
}

global.window = global;
global.location = { hash: "", href: "http://test/", origin: "http://test",
                    pathname: "/", search: "",
                    reload: function () {}, replace: function () {} };
global.history = { replaceState: function () {}, pushState: function () {} };
global.document = {
  addEventListener: function () {}, removeEventListener: function () {},
  createElement: knoten, createElementNS: knoten, createDocumentFragment: knoten,
  createTextNode: function (t) { var k = knoten(); k.textContent = t; return k; },
  querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  // Je Kennung derselbe Knoten. app.js holt manche Elemente mehrfach
  // und vergleicht sie (el("x") === ev.target); mit jedes Mal einem
  // neuen Knoten liefe es in den falschen Zweig.
  getElementById: (function () {
    var gemerkt = {};
    return function (kennung) {
      if (!gemerkt[kennung]) gemerkt[kennung] = knoten(kennung);
      return gemerkt[kennung];
    };
  })(),
  documentElement: knoten(), body: knoten(), head: knoten(),
  hidden: false, visibilityState: "visible"
};
global.localStorage = speicher();
global.sessionStorage = speicher();
// Node hat selbst ein navigator-Objekt, und zwar nur mit Getter -
// eine Zuweisung bricht ab. Also die Eigenschaft ersetzen.
Object.defineProperty(global, "navigator", {
  value: { userAgent: "node", onLine: true }, writable: true, configurable: true
});
global.addEventListener = function () {};
global.removeEventListener = function () {};
global.matchMedia = function () {
  return { matches: false, addEventListener: function () {}, addListener: function () {} };
};
// Kein Netz im Test. Wer es doch versucht, soll scheitern und nicht
// stillschweigend auf das echte Supabase gehen.
//
// Ausnahme sind die Dateien aus docs/: der PDF-Schreiber holt sich so
// seine Vorlage (abrechnung/vorlage.json und blanko.pdf), und ohne sie
// liesse er sich gar nicht pruefen. Alles ausserhalb von docs/ bleibt
// gesperrt, damit kein Test versehentlich ins Netz geht.
var pfadmodul = require("path");
var dateimodul = require("fs");
var DOCS = pfadmodul.join(pfadmodul.dirname(__dirname), "docs");
global.fetch = function (url) {
  var name = String(url).replace(/^https?:\/\/[^/]*/, "").replace(/^\//, "").split("?")[0];
  var ziel = pfadmodul.resolve(DOCS, name);
  if (ziel.indexOf(DOCS) !== 0 || !dateimodul.existsSync(ziel)) {
    return Promise.reject(new Error("kein Netz im Test: " + url));
  }
  var roh = dateimodul.readFileSync(ziel);
  return Promise.resolve({
    ok: true, status: 200,
    text: function () { return Promise.resolve(roh.toString("utf-8")); },
    json: function () { return Promise.resolve(JSON.parse(roh.toString("utf-8"))); },
    arrayBuffer: function () {
      return Promise.resolve(roh.buffer.slice(roh.byteOffset, roh.byteOffset + roh.byteLength));
    }
  });
};
// Der PDF-Schreiber liest daraus seinen Basispfad.
global.document.currentScript = { src: "rechnung.js" };
global.CustomEvent = function (name, opt) { this.type = name; this.detail = opt && opt.detail; };
global.Event = global.CustomEvent;
global.requestAnimationFrame = function (f) { return setTimeout(f, 0); };
global.scrollTo = function () {};
global.Image = knoten;

module.exports = { knoten: knoten };
