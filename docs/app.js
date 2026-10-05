/* Logik der Startseite. Frueher inline in index.html; eigene Datei, damit
 * die Content-Security-Policy keine Inline-Skripte erlauben muss. */
(function () {
  "use strict";

  var basis = location.href.split("#")[0].split("?")[0].replace(/index\.html$/, "").replace(/\/?$/, "/");

  // Wird einmal je Fassung gezeigt, damit die Kollegen neue Funktionen finden.
  var NEUIGKEITEN = { version: "2026-09-27", punkte: [
    "Regeln: Strafenmatrix, Spielzeiten je Liga und die Bestimmungen des EHV NRW, alles auch offline",
    "Strafrechner: Strafen antippen, die Stärke auf dem Eis steht sofort da",
    "Einfacher Modus als Voreinstellung, die Leiste unten belegst du selbst",
    "Kollegen mit Telefon und Anschrift, Profil einmal ausfüllen für Abrechnung und Rechnung",
    "Suche über alles, Spieltag-Modus, Gespann-Chat und Push bei jeder Änderung von esrw.de",
    "Ziehen zum Aktualisieren auf Start und Spielplan"
  ] };
  // Die Versionsnummer aus dem eigenen Script-Tag (app.js?v=NNN). Damit
  // laedt mitglieder.js unter derselben Adresse wie beim letzten Start -
  // und beim naechsten Freigeben unter einer neuen.
  var APP_VERSION = (function () {
    try {
      var s = document.currentScript || document.querySelector('script[src*="app.js"]');
      var t = s && s.src && s.src.match(/[?&]v=(\d+)/);
      return t ? t[1] : "0";
    } catch (e) { return "0"; }
  })();
  var daten = null, aktuell = null, profil = null;
  var el = function (id) { return document.getElementById(id); };
  var wochentag = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  // ------------------------------------------------------------- Speicher

  function lesen(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function schreiben(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }

  // Einfache Ansicht: dieselbe App, nur weniger auf einmal. Was selten
  // gebraucht wird, steht dann eine Ebene tiefer statt in der ersten Reihe -
  // nichts verschwindet, nichts wird abgeschaltet. Der Schalter gilt fuer
  // das Geraet und wandert mit dem Konto auf die anderen.
  // Voreingestellt ist die einfache Ansicht: "0" heisst ausdruecklich aus,
  // alles andere (auch ein frisches Geraet) heisst an.
  function einfachAn() { return lesen("einfach") !== "0"; }
  function einfachAnwenden() {
    document.documentElement.classList.toggle("einfach", einfachAn());
    var k = el("einfachmodus");
    if (k) {
      k.classList.toggle("aktiv", einfachAn());
      k.setAttribute("aria-pressed", einfachAn() ? "true" : "false");
      k.title = einfachAn() ? "Einfache Ansicht \u2013 antippen zeigt alles" : "Alles sichtbar \u2013 antippen vereinfacht";
    }
    if (el("einfach")) el("einfach").checked = einfachAn();
  }
  function einfachSetzen(an, still) {
    if (einfachAn() === !!an) return;
    schreiben("einfach", an ? null : "0");
    einfachAnwenden(); einstellungenSync();
    if (!el("mehr").classList.contains("versteckt")) zeigeMehr();
    if (!el("einstellungen").classList.contains("versteckt")) setTimeout(einstellungenSprung, 60);
    if (!still) toast(an ? "Einfache Ansicht \u2013 Selteneres steht eine Ebene tiefer." : "Jetzt ist alles sichtbar.", "gut");
  }

  // Texte, die Funktionen aufzaehlen, muessen mitgehen, wenn der Betreiber
  // eine abschaltet - sonst steht unter den Spielen "Tipp fuer Route,
  // Tausch, Notiz", waehrend es die Tauschboerse gar nicht gibt.
  // Jedes Paar ist [Schluessel oder null, Wort]; null heisst "gibt es immer".
  function funktionsWorte(paare) {
    return paare.filter(function (p) { return !p[0] || funktion(p[0]); })
                .map(function (p) { return p[1]; });
  }
  function funktionsText(paare, letztes) {
    var w = funktionsWorte(paare);
    if (!w.length) return "";
    if (w.length === 1 || !letztes) return w.join(", ");
    return w.slice(0, -1).join(", ") + " " + letztes + " " + w[w.length - 1];
  }

  // ------------------------------------------------ Funktionen (Schalter)
  // Der Betreiber schaltet unter Admin -> Funktionen an und ab; die Tabelle
  // "funktionen" darf jeder lesen. Fehlt eine Zeile, gilt der Standard hier.
  var FUNKTIONEN = [
    ["tausch", "Tauschbörse", "Gesuche, Angebote, Vertretungs-Radar, Reiter „Tausch“ unten", false],
    ["frei", "Verfügbarkeit", "Sperrtage, „gern pfeifen“, Mini-Kalender", false],
    ["abrechnung", "Abrechnung", "km, Vergütung, Belege, Fahrtenbuch, Reiter unten", true],
    ["info", "Info und Termine", "Ankündigungen vom Betreiber, Termine auf Start", true],
    ["notizen", "Notizen", "private Spielnotizen", true],
    ["gespann", "Gespann", "Handynummern der Kollegen im Spiel, Kontaktknöpfe auf der Spielseite", true],
    ["chat", "Gespann-Chat", "Nachrichten ans Gespann auf der Spielseite, mit Push", true],
    ["mitfahren", "Zusammen fahren", "Fahrgemeinschaften, Wohnort teilen, Reiter „Mitfahren“", true],
    ["hallen", "Hallen-Hinweise und Hallenkarte", "Parken, Kabinen, Karte aller Hallen", true],
    ["statistik", "Statistik", "Saison, Archiv, Saisonziel, Saison-Bild", true],
    ["checkliste", "Spieltag-Checkliste", "auf der Spielseite", true],
    ["wetter", "Wetter", "auf Start und der Spielseite", true],
    ["push", "Push-Mitteilungen", "Geräte anmelden, Erinnerungen, Testnachricht", true],
    ["telefon", "Telefonliste", "Nummern der Kollegen im Reiter „Kollegen“", true],
    ["regeln", "Regeln", "Strafentabelle, Spielzeiten, Durchführungsbestimmungen", true],
    ["rechner", "Strafrechner", "Stärke auf dem Eis ausrechnen", true],
    ["archiv", "Archiv", "alle Spiele aller Saisons mit Filtern", true],
    ["obmann", "Obmann per E-Mail", "Obmann-Adresse im Profil, Absage und Fragen von der Spielseite, Mail bei einem Tausch", true],
    ["bild", "Profilbilder", "eigenes Bild hochladen und Bilder der Kollegen sehen", true],
    ["aenderungen", "Änderungen", "was sich an den Einteilungen getan hat, mit Vorher/Nachher", true]
  ];
  var funktionenStand = null;
  function funktionenLesen() {
    if (funktionenStand) return funktionenStand;
    try { funktionenStand = JSON.parse(lesen("funktionen") || "{}") || {}; } catch (e) { funktionenStand = {}; }
    return funktionenStand;
  }
  // "chat" und "mitfahren" standen frueher zusammen unter "gespann". Solange
  // der Betreiber sie nicht ausdruecklich setzt, gilt weiter, was fuer
  // "gespann" eingestellt ist - sonst waeren sie nach dem Update ploetzlich an.
  var ERBT_VON = { chat: "gespann", mitfahren: "gespann" };
  function funktionGlobal(k) {
    var f = funktionenLesen(); if (f[k] !== undefined) return !!f[k];
    if (ERBT_VON[k] && f[ERBT_VON[k]] !== undefined) return !!f[ERBT_VON[k]];
    var d = FUNKTIONEN.filter(function (x) { return x[0] === k; })[0]; return d ? d[3] : true;
  }
  function bereichAus(k) { try { return !!(JSON.parse(lesen("bereiche") || "{}") || {})[k]; } catch (e) { return false; } }
  // an, wenn der Betreiber sie eingeschaltet hat UND du sie nicht fuer dich ausgeblendet hast
  function funktion(k) { return funktionGlobal(k) && !bereichAus(k); }
  function bereicheRendern() {
    var box = el("bereiche"); if (!box) return; box.innerHTML = "";
    var n = 0;
    FUNKTIONEN.forEach(function (f) {
      if (!funktionGlobal(f[0])) return; n++;
      var l = document.createElement("label"); var t = document.createElement("span");
      var bb = document.createElement("b"); bb.textContent = f[1]; bb.style.display = "block"; var sm = document.createElement("small"); sm.textContent = f[2]; sm.style.color = "var(--dim)"; sm.style.fontWeight = "500";
      t.appendChild(bb); t.appendChild(sm);
      var c = document.createElement("input"); c.type = "checkbox"; c.checked = !bereichAus(f[0]);
      c.addEventListener("change", function () {
        var st = {}; try { st = JSON.parse(lesen("bereiche") || "{}") || {}; } catch (e) {}
        if (c.checked) delete st[f[0]]; else st[f[0]] = true;
        schreiben("bereiche", JSON.stringify(st)); einstellungenSync(); funktionenAnwenden(funktionenLesen()); startBausteineRendern();
        toast(f[1] + (c.checked ? " wieder eingeblendet" : " für dich ausgeblendet"), "");
      });
      l.appendChild(t); l.appendChild(c); box.appendChild(l);
    });
    if (!n) { var p = document.createElement("p"); p.className = "meta"; p.style.margin = "0"; p.textContent = "Der Betreiber hat zurzeit keine Bereiche eingeschaltet."; box.appendChild(p); }
  }
  function funktionenAnwenden(obj, neuZeichnen) {
    var alt = funktionenLesen(), vorher = JSON.stringify(alt);
    var dazu = [], weg = [];
    if (neuZeichnen) FUNKTIONEN.forEach(function (f) {
      var war = alt[f[0]] === undefined ? f[3] : !!alt[f[0]];
      var ist = (obj || {})[f[0]] === undefined ? f[3] : !!(obj || {})[f[0]];
      if (war !== ist) (ist ? dazu : weg).push(f[1]);
    });
    funktionenStand = obj || {}; schreiben("funktionen", JSON.stringify(funktionenStand));
    FUNKTIONEN.forEach(function (f) { document.documentElement.classList.toggle("ohne-" + f[0], !funktion(f[0])); });
    if (el("tab-tausch")) tabDritterAnwenden();
    if (neuZeichnen && vorher !== JSON.stringify(funktionenStand) && typeof ausHash === "function" && daten) ausHash();
    if (dazu.length || weg.length) {
      var m = [];
      if (dazu.length) m.push("Neu da: " + dazu.join(", "));
      if (weg.length) m.push("Abgeschaltet: " + weg.join(", "));
      toast(m.join(" · ") + ".", dazu.length && !weg.length ? "gut" : "");
    }
  }
  // supabase.json aendert sich waehrend einer Sitzung nicht. An jedem
  // hole() haengt aber ein Cache-Buster, also ging bisher fuer jede
  // Kleinigkeit - Funktionen, Korrekturen, jeder REST-Aufruf - eine eigene
  // Anfrage ins Netz. Einmal holen reicht; scheitert es, wird es neu
  // versucht.
  var zugangCfgLauf = null;
  function holeCfg() {
    if (!zugangCfgLauf) {
      zugangCfgLauf = hole("supabase.json").catch(function (e) { zugangCfgLauf = null; throw e; });
    }
    return zugangCfgLauf;
  }

  function funktionenLaden() {
    funktionenAnwenden(funktionenLesen());
    return holeCfg().then(function (cfg) {
      cfg = cfg || {};
      if (cfg.mock) { try { return JSON.parse(localStorage.getItem("mock_funktionen") || "[]"); } catch (e) { return []; } }
      if (!cfg.url || !cfg.anon_key) return null;
      return fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/funktionen?select=schluessel,aktiv", { headers: { apikey: cfg.anon_key, Authorization: "Bearer " + cfg.anon_key } })
        .then(function (r) { return r.ok ? r.json() : null; });
    }).then(function (zeilen) {
      if (!zeilen) return;
      var o = {}; zeilen.forEach(function (z) { o[z.schluessel] = !!z.aktiv; });
      funktionenAnwenden(o, !!funktionenBereit);
    }).catch(function () {}).then(function () { funktionenBereit = true; });
  }
  var funktionenBereit = false;
  document.addEventListener("mg-funktionen", function (e) { funktionenAnwenden(e.detail || {}, true); });

  // ------------------------------------------ Korrekturen (Admin, je Spiel)
  // Halle, Anstoss, Treffpunkt, Hinweis, Absage aus der Tabelle
  // spiel_korrekturen. Der Workflow baut sie in Kalender und daten.json ein;
  // hier werden sie zusaetzlich sofort angewendet (idempotent).
  var korrekturen = {};
  function korrekturAnwendenAuf(s) {
    var k = korrekturen[kennungVon(s)];
    if (!k) {
      if (s._orig) { s.beginn = s._orig.beginn; s.treffpunkt = s._orig.treffpunkt; s.halle = s._orig.halle; s.ort = s._orig.ort; if (s._orig.koordinaten !== undefined) s.koordinaten = s._orig.koordinaten; s.vergangen = new Date(s.beginn) < Date.now(); }
      if (s.korrektur && s.korrektur._app) s.korrektur = null;
      return;
    }
    if (!s.id) s.id = s.beginn + "|" + s.paarung;
    if (!s._orig) s._orig = { beginn: s.beginn, treffpunkt: s.treffpunkt, halle: s.halle, ort: s.ort, koordinaten: s.koordinaten };
    s.beginn = k.beginn || s._orig.beginn;
    s.treffpunkt = k.treffpunkt || (k.beginn ? new Date(new Date(k.beginn).getTime() - (daten.vorlauf_minuten || 60) * 60000).toISOString() : s._orig.treffpunkt);
    if (k.halle && daten.adressen && daten.adressen[k.halle] !== undefined) {
      s.halle = k.halle; s.ort = k.halle + ", " + daten.adressen[k.halle]; s.halle_erkannt = true;
      if (s._orig.koordinaten !== undefined) s.koordinaten = daten.hallen && daten.hallen[k.halle];
    } else { s.halle = s._orig.halle; s.ort = s._orig.ort; if (s._orig.koordinaten !== undefined) s.koordinaten = s._orig.koordinaten; }
    s.korrektur = { halle: k.halle || null, beginn: k.beginn || null, treffpunkt: k.treffpunkt || null, hinweis: k.hinweis || null, abgesagt: !!k.abgesagt, _app: true };
    if (!k.halle && !k.beginn && !k.treffpunkt && !k.hinweis && !k.abgesagt && !(k.besetzung && k.besetzung.length)) s.korrektur = null;
    s.vergangen = new Date(s.beginn) < Date.now();
  }
  // Spiele, die es nie gab: ausgefallen, standen aber weiter auf esrw.de.
  // Der Betreiber setzt die Marke, die Zeile in der Datenbank bleibt stehen -
  // in der App ist das Spiel weg, auch in Abrechnung und Archiv.
  function istGeloescht(s) { var k = korrekturen[kennungVon(s)]; return !!(k && k.geloescht); }
  function korrekturenAnwenden() {
    if (!daten) return;
    daten.spiele = (daten.spiele || []).filter(function (s) { return !istGeloescht(s); });
    (daten.personen || []).forEach(function (p) { p.spiele = (p.spiele || []).filter(function (s) { return !istGeloescht(s); }); });
    (daten.spiele || []).forEach(korrekturAnwendenAuf);
    (daten.personen || []).forEach(function (p) { p.spiele.forEach(korrekturAnwendenAuf); });
    gespannAnwenden();
    (daten.personen || []).forEach(function (p) { p.spiele.sort(function (a, b) { return a.beginn < b.beginn ? -1 : a.beginn > b.beginn ? 1 : 0; }); });
    (daten.spiele || []).sort(function (a, b) { return a.beginn < b.beginn ? -1 : a.beginn > b.beginn ? 1 : 0; });
  }

  // Archiv, Statistik und Abrechnung kommen aus Dateien, die der Workflow
  // baut - die wissen von einer frischen Korrektur noch nichts. Bis zum
  // naechsten Lauf blendet die App sie hier selbst ein.
  function gespannKorrektur(kennung) {
    var k = korrekturen[kennung];
    return k && k.besetzung && k.besetzung.length ? k.besetzung : null;
  }
  function gespannGehoert(kennung, slug) {
    var b = gespannKorrektur(kennung);
    if (!b || !slug) return null;
    return b.some(function (x) { return x.slug === slug; });
  }

  // Hat der Betreiber das Gespann geaendert, gilt seine Besetzung - auch
  // wenn esrw.de beim naechsten Lauf wieder etwas anderes meldet. Wer
  // rausfaellt, verliert das Spiel, wer dazukommt, bekommt es.
  function gespannAnwenden() {
    if (!daten) return;
    var betroffen = [];
    (daten.spiele || []).forEach(function (s) {
      var k = korrekturen[kennungVon(s)];
      var neu = k && k.besetzung && k.besetzung.length ? k.besetzung : null;
      if (!neu && !s._origBesetzung) return;
      if (!s._origBesetzung) s._origBesetzung = s.besetzung || [];
      s.besetzung = neu
        ? neu.filter(function (b) { return b && b.name; }).map(function (b) {
            return { name: b.name, slug: b.slug || null, rolle: b.rolle || "SR" };
          })
        : s._origBesetzung;
      s.system = s.besetzung.length;
      s.gespannBetreiber = !!neu;
      betroffen.push(s);
    });
    if (!betroffen.length) return;
    betroffen.forEach(function (s) {
      var kennung = kennungVon(s);
      (daten.personen || []).forEach(function (p) {
        p.spiele = (p.spiele || []).filter(function (x) { return kennungVon(x) !== kennung; });
      });
      s.besetzung.forEach(function (b) {
        if (!b.slug) return;
        var p = personMit(b.slug); if (!p) return;
        p.spiele.push(Object.assign({}, s, {
          rolle: b.rolle,
          koordinaten: (daten.hallen || {})[s.halle] || null,
          gespann: s.besetzung.filter(function (x) { return x !== b; })
            .map(function (x) { return { name: x.name, slug: x.slug, rolle: x.rolle }; })
        }));
      });
    });
  }
  // Der eigene Zugang, wenn jemand angemeldet ist - sonst der oeffentliche
  // Schluessel. Was damit sichtbar ist, entscheiden die Regeln in Supabase.
  function zugangKopf(cfg) {
    var anon = { apikey: cfg.anon_key, Authorization: "Bearer " + cfg.anon_key };
    if (!window.Mitglieder || !window.Mitglieder.zugang) return Promise.resolve(anon);
    return window.Mitglieder.zugang().then(function (t) {
      return t ? { apikey: cfg.anon_key, Authorization: "Bearer " + t } : anon;
    }).catch(function () { return anon; });
  }

  function korrekturenLaden(neuZeichnen) {
    return holeCfg().then(function (cfg) {
      cfg = cfg || {};
      if (cfg.mock) { try { return JSON.parse(localStorage.getItem("mock_spiel_korrekturen") || "[]"); } catch (e) { return []; } }
      if (!cfg.url || !cfg.anon_key) return null;
      return zugangKopf(cfg).then(function (kopf) {
        return fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/spiel_korrekturen?select=*", { headers: kopf })
          .then(function (r) { return r.ok ? r.json() : null; });
      });
    }).then(function (zeilen) {
      if (!zeilen) return false;
      var neu = {}; zeilen.forEach(function (z) { neu[z.kennung] = z; });
      var anders = JSON.stringify(neu) !== JSON.stringify(korrekturen);
      korrekturen = neu; korrekturenAnwenden();
      if (anders && neuZeichnen) ausHash();
      return anders;
    }).catch(function () { return false; });
  }
  // ------------------------- Betreiber: Spiele, Hallen, offizielle Hinweise
  // Manuelle Spiele, zusaetzliche Hallen und offizielle Hallen-Hinweise aus
  // Supabase. Der Workflow baut sie in daten.json ein; bis dahin ergaenzt die
  // App sie selbst (Spiele mit id "m:<uuid>" werden nicht doppelt angelegt).
  var betreiber = { spiele: [], hallen: [], hinweise: {} };
  function supabaseRest(pfad) {
    return holeCfg().then(function (cfg) {
      cfg = cfg || {};
      if (cfg.mock) { try { return JSON.parse(localStorage.getItem("mock_" + pfad.split("?")[0]) || "[]"); } catch (e) { return []; } }
      if (!cfg.url || !cfg.anon_key) return null;
      return zugangKopf(cfg).then(function (kopf) {
        return fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/" + pfad, { headers: kopf })
          .then(function (r) { return r.ok ? r.json() : null; });
      });
    });
  }
  function betreiberAnwenden() {
    if (!daten) return;
    daten.adressen = daten.adressen || {}; daten.hallen = daten.hallen || {}; daten.hallen_hinweise = daten.hallen_hinweise || {};
    betreiber.hallen.forEach(function (h) { if (!h.name) return; if (daten.adressen[h.name] === undefined) daten.adressen[h.name] = h.adresse || ""; if (h.lat != null && h.lon != null && !daten.hallen[h.name]) daten.hallen[h.name] = [h.lat, h.lon]; });
    Object.keys(betreiber.hinweise).forEach(function (halle) { daten.hallen_hinweise[halle] = betreiber.hinweise[halle]; });
    var vorhanden = {}; (daten.spiele || []).forEach(function (s) { if (s.id) vorhanden[s.id] = true; });
    var neu = false;
    betreiber.spiele.forEach(function (z) {
      var id = "m:" + z.id; if (vorhanden[id]) return; neu = true;
      var beginn = new Date(z.beginn).toISOString();
      var treff = z.treffpunkt ? new Date(z.treffpunkt).toISOString() : new Date(new Date(z.beginn).getTime() - (daten.vorlauf_minuten || 60) * 60000).toISOString();
      var bes = (z.besetzung || []).filter(function (b) { return b && b.name; }).map(function (b) {
        var p = daten.personen.filter(function (x) { return x.name === b.name || (x.varianten || []).indexOf(b.name) >= 0; })[0];
        return { name: b.name, rolle: bes3(z.besetzung, b), slug: p ? p.slug : null };
      });
      function bes3(alle, b) { return (alle || []).length >= 3 ? (b.rolle === "HSR" ? "HSR" : "LSR") : "SR"; }
      var halle = z.halle && daten.adressen[z.halle] !== undefined ? z.halle : (z.halle || "");
      var basis = { id: id, manuell: true, von: z.von || null, beginn: beginn, treffpunkt: treff, liga: z.liga || "", paarung: z.paarung, halle: halle, ort: halle && daten.adressen[halle] ? halle + ", " + daten.adressen[halle] : (halle || ""), halle_erkannt: !!(halle && daten.adressen[halle]), system: bes.length, vergangen: new Date(beginn) < Date.now(), korrektur: z.hinweis ? { hinweis: z.hinweis, abgesagt: false, halle: null, beginn: null, treffpunkt: null } : null };
      daten.spiele.push(Object.assign({ besetzung: bes }, basis));
      bes.forEach(function (b) {
        if (!b.slug) return; var p = personMit(b.slug); if (!p) return;
        p.spiele.push(Object.assign({ rolle: b.rolle, koordinaten: daten.hallen[halle] || null, gespann: bes.filter(function (x) { return x !== b; }).map(function (x) { return { name: x.name, slug: x.slug, rolle: x.rolle }; }), aenderung: null, hinweis: null }, basis));
      });
    });
    if (neu) {
      daten.spiele.sort(function (a, b) { return a.beginn < b.beginn ? -1 : a.beginn > b.beginn ? 1 : 0; });
      daten.personen.forEach(function (p) { p.spiele.sort(function (a, b) { return a.beginn < b.beginn ? -1 : a.beginn > b.beginn ? 1 : 0; }); });
    }
    return neu;
  }
  function betreiberLaden(neuZeichnen) {
    return Promise.all([
      supabaseRest("spiele_manuell?select=id,beginn,treffpunkt,liga,paarung,halle,hinweis,besetzung,von,angelegt"),
      supabaseRest("hallen_extra?select=name,adresse,lat,lon"),
      supabaseRest("hallen_notizen?select=halle,text&offiziell=eq.true&order=angelegt")
    ]).then(function (r) {
      if (r[0]) betreiber.spiele = r[0];
      if (r[1]) betreiber.hallen = r[1];
      if (r[2]) { var hw = {}; r[2].filter(function (z) { return z.offiziell !== false && z.halle && z.text; }).forEach(function (z) { (hw[z.halle] = hw[z.halle] || []).push(z.text); }); betreiber.hinweise = hw; }
      var neu = betreiberAnwenden();
      korrekturenAnwenden();
      if (neu && neuZeichnen) ausHash();
    }).catch(function () {});
  }
  document.addEventListener("mg-betreiber", function () { betreiberLaden(true); });
  // Wer hat es angelegt? Mit mehreren Obmaennern ist "vom Betreiber" zu
  // ungenau - der Vorname reicht, der Nachname steht ohnehin daneben.
  function vonWem(s) {
    var wer = ((s.von || (s.korrektur && s.korrektur.von) || "") + "").split(",")[0].trim();
    return wer ? " von " + wer : " vom Betreiber";
  }

  function korrekturZeile(s) {
    var k = s.korrektur; if (!k) return null;
    var z = document.createElement("div"); z.className = k.abgesagt ? "achtung" : "geaendert";
    var teile = [];
    if (k.abgesagt) teile.push("ABGESAGT");
    if (k.halle) teile.push("Halle: " + k.halle);
    if (k.beginn) teile.push("Anstoß " + uhr(new Date(s.beginn)) + " Uhr");
    if (k.treffpunkt) teile.push("Treffpunkt " + uhr(new Date(s.treffpunkt)) + " Uhr");
    if (k.hinweis) teile.push(k.hinweis);
    if (s.gespannBetreiber) teile.push("Gespann geändert");
    var wer = (k.von || "").split(",")[0].trim();
    z.textContent = "✎ " + (s.manuell ? "Angelegt" : "Geändert")
      + (wer ? " von " + wer : " vom Betreiber")
      + (k.geaendert ? " am " + datumKurz(new Date(k.geaendert)) : "")
      + (teile.length ? ": " + teile.join(" · ") : "");
    return z;
  }
  function profilLesen() {
    try { var roh = lesen("profil"); if (roh) return JSON.parse(roh); } catch (e) {}
    var alt = lesen("person");
    return alt ? { slug: alt, gesehen: {} } : null;
  }
  function profilSchreiben() { if (profil) schreiben("profil", JSON.stringify(profil)); }

  // ----------------------------------------------------------------- Thema

  // "abend": von 19 bis 7 Uhr dunkel, egal was das Handy eingestellt hat.
  // In der Halle ist es abends dunkel, das Telefon weiss davon nichts.
  var ABEND_VON = 19, ABEND_BIS = 7;
  function abendDunkel() {
    var st = new Date().getHours();
    return st >= ABEND_VON || st < ABEND_BIS;
  }
  function themaAnwenden() {
    var t = lesen("thema");
    var gewaehlt = t === "abend" ? (abendDunkel() ? "dark" : "light") : t;
    if (gewaehlt === "dark" || gewaehlt === "light") document.documentElement.setAttribute("data-theme", gewaehlt);
    else document.documentElement.removeAttribute("data-theme");
    var dunkel = gewaehlt === "dark" || (!gewaehlt && window.matchMedia("(prefers-color-scheme: dark)").matches);
    el("thema").querySelector("use").setAttribute("href", dunkel ? "#i-sun" : "#i-moon");
    var wahl = el("thema-wahl");
    if (wahl) Array.prototype.forEach.call(wahl.querySelectorAll("button"), function (b) {
      b.classList.toggle("aktiv", (b.getAttribute("data-thema") || "") === (t || ""));
    });
  }
  // Der Wechsel soll auch kommen, wenn die App offen liegen bleibt
  setInterval(function () { if (lesen("thema") === "abend") themaAnwenden(); }, 120000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) themaAnwenden(); });
  (function () {
    var wahl = el("thema-wahl");
    if (!wahl) return;
    Array.prototype.forEach.call(wahl.querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        var w = b.getAttribute("data-thema");
        schreiben("thema", w || null);
        themaAnwenden();
        if (w === "abend") toast("Abends dunkel, ab " + ABEND_VON + " Uhr bis " + ABEND_BIS + " Uhr.", "gut");
      });
    });
  })();
  // Auf schmalen Geraeten ist neben Knoepfen und Zeichen kein Platz fuer
  // "Einteilungen ESRW". Statt ihn abzuschneiden, steht dort die Kurzform.
  function titelAnpassen() {
    var h = el("titel");
    if (!h || !daten) return;
    var voll = daten.titel || "ESRW App";
    var kurz = voll.split(/\s+/).slice(-1)[0] || voll;
    h.textContent = voll;
    h.title = voll;
    if (h.scrollWidth > h.clientWidth + 1) h.textContent = kurz;
  }
  window.addEventListener("resize", titelAnpassen);
  // Die Schrift kommt nach - vorher misst der Browser die falsche Breite
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(titelAnpassen);

  // Profilbilder der Kollegen. Sie stehen in der Datenbank, kommen also
  // erst nach dem Anmelden - deshalb erst Buchstaben, dann nachtragen.
  var bilder = {};
  function bildFuer(slug) { return (bilder[slug] && bilder[slug].bild) || null; }
  function bildAnwenden(e, slug) {
    var b = bildFuer(slug);
    if (!b) return;
    e.style.backgroundImage = "url(" + b + ")";
    e.classList.add("mit-bild");
  }
  function bilderAnwenden() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-slug]"), function (e) {
      bildAnwenden(e, e.getAttribute("data-slug"));
    });
    avatarKopf();
  }
  function bilderLaden() {
    if (!sitzungVorhanden() || !funktion("bild")) return;
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.bilder() : null; })
      .then(function (b) { if (!b) return; bilder = b; bilderAnwenden(); })
      .catch(function () {});
  }

  function avatarKopf() {
    var b = el("avatar");
    if (profil && profil.name) { b.textContent = initialen(profil.name); b.classList.remove("leer"); b.style.background = farbeFuer(profil.slug); }
    else { b.textContent = "?"; b.classList.add("leer"); b.style.background = ""; }
    var eigen = (profil && bildFuer(profil.slug)) || lesen("mein-bild");
    b.classList.toggle("mit-bild", !!eigen);
    b.style.backgroundImage = eigen ? "url(" + eigen + ")" : "";
  }
  // Tipp auf die Stand-Anzeige holt frische Daten
  el("stand").addEventListener("click", function () {
    if (!navigator.onLine) { toast("Offline, es gibt gerade nichts Neues zu holen.", "warn"); return; }
    el("stand").classList.add("laedt");
    neuLaden().then(function () { el("stand").classList.remove("laedt"); toast("Aktualisiert.", "gut"); })
      .catch(function () { el("stand").classList.remove("laedt"); toast("Aktualisieren hat nicht geklappt.", "warn"); });
  });
  el("suche-knopf").addEventListener("click", function () {
    location.hash = "suche";
    setTimeout(function () { var f = el("suche"); f.focus(); f.select(); window.scrollTo({ top: 0 }); }, 150);
  });
  // Oben rechts: das eigene Profil - dort stehen Name, Anschrift, Nummer
  // und die Rechnungsdaten an einer Stelle.
  // Zoomen aus: die Angabe im <meta> ignoriert iOS seit Jahren, also hier
  // noch einmal - Doppeltipp und Aufziehen mit zwei Fingern abfangen.
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (n) {
    document.addEventListener(n, function (e) { e.preventDefault(); }, { passive: false });
  });
  (function () {
    var letzter = 0;
    document.addEventListener("touchend", function (e) {
      var jetzt = Date.now();
      if (jetzt - letzter < 320) e.preventDefault();
      letzter = jetzt;
    }, { passive: false });
  })();

  el("avatar").addEventListener("click", function () {
    if (sitzungVorhanden()) { location.hash = "mitglieder/profil"; return; }
    location.hash = profil && profil.slug ? "mehr" : "";
    if (!(profil && profil.slug)) zeigeAuswahl(false);
  });
  // Admin-Modus: nur fuer Admins sichtbar, schaltet die Betreiber-Funktionen
  // in der Oberflaeche an und aus (Rechte bleiben davon unberuehrt)
  function adminModusAn() { return lesen("adminaus") !== "1"; }
  function adminKnopfStand() {
    var k = el("adminmodus"); if (!k) return;
    var an = adminModusAn();
    k.classList.toggle("aktiv", an);
    k.title = an ? "Admin-Modus an, antippen schaltet ihn aus" : "Admin-Modus aus, antippen schaltet ihn ein";
    k.setAttribute("aria-pressed", an ? "true" : "false");
    document.documentElement.classList.toggle("admin-aus", !an);
  }
  // Testmodus: solange der Betreiber die App als jemand anderes ansieht,
  // steht das oben. Sonst vergisst man es und wundert sich, warum die
  // Haelfte fehlt.
  var TEST_NAMEN = { sr: "Schiedsrichter", rechte: "Obmann" };
  function testBalken() {
    var box = el("testbalken"); if (!box) return;
    var rolle = lesen("testrolle") || "";
    box.innerHTML = "";
    if (!rolle) { box.classList.add("versteckt"); document.documentElement.classList.remove("test-an"); return; }
    var rechte = [];
    try { rechte = JSON.parse(lesen("testrechte") || "[]") || []; } catch (e) {}
    box.classList.remove("versteckt"); document.documentElement.classList.add("test-an");
    var t = document.createElement("span");
    t.textContent = "Du siehst die App als " + (TEST_NAMEN[rolle] || rolle)
      + (rolle === "rechte" ? (rechte.length ? " mit " + rechte.length + (rechte.length === 1 ? " Freigabe" : " Freigaben") : " ohne Freigaben") : "")
      + ". Nur die Ansicht \u2013 gespeichert wird weiter als du.";
    box.appendChild(t);
    var aendern = document.createElement("button");
    aendern.type = "button"; aendern.textContent = "Ändern";
    aendern.title = "Zurück zur Auswahl, dort eine andere Rolle oder andere Freigaben";
    aendern.addEventListener("click", function () {
      schreiben("testrolle", null); schreiben("testrechte", null); schreiben("adminbereich", "ansehen");
      location.hash = "mitglieder/admin"; location.reload();
    });
    box.appendChild(aendern);
    var zurueck = document.createElement("button");
    zurueck.type = "button"; zurueck.textContent = "Beenden";
    zurueck.addEventListener("click", function () {
      schreiben("testrolle", null); schreiben("testrechte", null); schreiben("adminbereich", null);
      location.reload();
    });
    box.appendChild(zurueck);
  }
  document.addEventListener("mg-testrolle", function () { testBalken(); });

  function adminKnopfZeigen() {
    if (!sitzungVorhanden()) { el("adminmodus").classList.add("versteckt"); return; }
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { return st.eingerichtet && st.session && window.Mitglieder.adminRecht ? window.Mitglieder.adminRecht() : false; })
      // Im Testmodus gehoert der Schild-Knopf nicht ins Bild - man tut ja
      // gerade so, als waere man jemand ohne ihn
      .then(function (ja) { el("adminmodus").classList.toggle("versteckt", !ja || !!lesen("testrolle")); adminKnopfStand(); }).catch(function () {});
  }
  if (el("einfachmodus")) el("einfachmodus").addEventListener("click", function () { einfachSetzen(!einfachAn()); });
  if (el("fein-knopf")) el("fein-knopf").addEventListener("click", function () {
    var auf = document.documentElement.classList.toggle("fein-an");
    el("fein-knopf").textContent = auf ? "Feineinstellungen ausblenden" : "Mehr einstellen \u2026";
  });
  el("adminmodus").addEventListener("click", function () {
    var neu = !adminModusAn();
    schreiben("adminaus", neu ? null : "1");
    adminKnopfStand();
    toast(neu ? "Admin-Modus an, die Betreiber-Funktionen sind sichtbar." : "Admin-Modus aus, die App sieht aus wie für alle anderen.", "gut");
    zaehlerHolen(); ausHash();
  });
  document.addEventListener("mg-sitzung", function () { adminKnopfZeigen(); tabDritterAnwenden(); if (daten) ausHash(); });
  // Tipp auf den Reiter, auf dem man schon steht: nach oben scrollen
  Array.prototype.forEach.call(document.querySelectorAll(".leiste button"), function (b) {
    b.addEventListener("click", function () { if (b.classList.contains("aktiv")) window.scrollTo({ top: 0, behavior: "smooth" }); });
  });
  el("thema").addEventListener("click", function () {
    var t = lesen("thema");
    var dunkel = t === "abend" ? abendDunkel()
      : t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches);
    schreiben("thema", dunkel ? "light" : "dark");
    themaAnwenden();
  });
  themaAnwenden();

  // --------------------------------------------------------------- Helfer

  function ikone(name) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("class", "i");
    var u = document.createElementNS("http://www.w3.org/2000/svg", "use");
    u.setAttribute("href", "#" + name);
    s.appendChild(u);
    return s;
  }
  function ohneZeichen(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function ausgeschrieben(s) {
    return (s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function suchtextVon(s) { return ohneZeichen(s) + " " + ausgeschrieben(s); }
  function uhr(d) { return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); }
  function datumKurz(d) { return wochentag[d.getDay()] + ". " + d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }); }
  function feedUrl(slug, protokoll) {
    var name = tresorMarken[slug] || slug;
    return protokoll + "//" + basis.replace(/^https?:\/\//, "") + "feeds/" + name + ".ics";
  }
  // Kann vor dem ersten Laden gefragt werden - dann gibt es noch niemanden
  function personMit(slug) { return daten && daten.personen ? daten.personen.filter(function (p) { return p.slug === slug; })[0] : null; }
  function tagVon(iso) { return new Date(iso).toDateString(); }
  function mitIkone(name, text, klasse) {
    var d = document.createElement("div");
    d.className = klasse || "meta";
    d.appendChild(ikone(name));
    var s = document.createElement("span");
    if (typeof text === "string") s.textContent = text; else s.appendChild(text);
    d.appendChild(s);
    return d;
  }
  function leerZustand(text, aktion) {
    var p = document.createElement("p");
    p.className = "leer";
    p.appendChild(ikone("i-empty"));
    p.appendChild(document.createTextNode(text));
    if (aktion && aktion.label) {
      var a = document.createElement(aktion.href ? "a" : "button"); a.className = "anfrage leer-aktion"; a.textContent = aktion.label;
      if (aktion.href) a.href = aktion.href; else a.type = "button";
      if (aktion.fn) a.addEventListener("click", function (ev) { if (!aktion.href) ev.preventDefault(); aktion.fn(); });
      p.appendChild(a);
    }
    return p;
  }

  // Kurze Rueckmeldung unten ueber der Leiste. Auch mitglieder.js nutzt sie.
  var toastTimer = null;
  function toast(text, art, aktion) {
    var t = el("toast");
    clearTimeout(toastTimer);
    if (!text) { t.classList.remove("zeigt"); return; }
    t.textContent = text; t.className = "toast " + (art || "") + (aktion ? " mit-aktion" : "");
    if (aktion && aktion.label) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = aktion.label;
      b.addEventListener("click", function () { clearTimeout(toastTimer); t.classList.remove("zeigt"); try { aktion.fn(); } catch (e) {} });
      t.appendChild(b);
    }
    requestAnimationFrame(function () { t.classList.add("zeigt"); });
    toastTimer = setTimeout(function () { t.classList.remove("zeigt"); }, aktion ? 10000 : art === "warn" ? 7000 : 2500);
  }
  window.zeigeToast = toast;

  function onboardingStand() {
    var box = el("onboarding");
    if (lesen("onboarding-weg") === "1" || (aktuell && profil && profil.slug && aktuell.slug !== profil.slug)) { box.classList.add("versteckt"); el("onboarding-kurz").classList.add("versteckt"); return; }
    var s1 = !!(profil && profil.slug), s2 = lesen("abo-geklickt") === "1", s3 = sitzungVorhanden();
    var kurz = el("onboarding-kurz");
    kurz.classList.toggle("versteckt", !(s1 && s2 && !s3) || lesen("onboarding-kurz-weg") === "1" || el("auswahl").classList.contains("versteckt") === false);
    el("onboarding-kurz-weg").onclick = function () { schreiben("onboarding-kurz-weg", "1"); kurz.classList.add("versteckt"); };
    if (s1 && s2) { box.classList.add("versteckt"); return; }
    // Zwei Karten sagten dasselbe: die drei Schritte und "Alles
    // eingerichtet?", beide mit dem Punkt "Kalender abonnieren", direkt
    // untereinander. Die Schritte sind fuer Leute ohne Konto; wer eines
    // hat, wird von der Checkliste gefuehrt.
    if (s3 && startEinstellung("einrichtung") && !startEinstellung("ruhig")) { box.classList.add("versteckt"); return; }
    el("ob-1").classList.toggle("fertig", s1); el("ob-2").classList.toggle("fertig", s2); el("ob-3").classList.toggle("fertig", s3);
    box.classList.remove("versteckt");
    el("onboarding-weg").onclick = function () { schreiben("onboarding-weg", "1"); box.classList.add("versteckt"); };
  }
  function kalenderBoxStand() {
    var abo = lesen("abo-geklickt") === "1";
    var box = el("kalender-box");
    if (!box._gesetzt) { box.open = !abo; box._gesetzt = true; }
    var lage = ("Notification" in window) ? Notification.permission : "";
    el("kalender-stand").textContent = (abo ? "abonniert ✓" : "noch nicht abonniert") + (lage === "granted" ? " · Mitteilungen an" : "");
    if (aktuell && !box._pruefung) box.addEventListener("toggle", function () { if (box.open) feedPruefen(aktuell); });
    box._pruefung = true;
    if (box.open && aktuell) feedPruefen(aktuell);
  }
  // Ob der Feed erreichbar und aktuell ist. Was das Handy daraus macht, sieht
  // die Seite nicht - das steht nur im Kalender-Konto des Geraets.
  var feedGeprueft = {}, feedFehler = {};
  function feedPruefen(p, erzwingen) {
    var ziel = el("feed-pruefung");
    if (feedGeprueft[p.slug] && !erzwingen) { ziel.textContent = feedGeprueft[p.slug]; feedKnopf(p); return; }
    // Auch ein Fehlschlag zaehlt - sonst laeuft die Pruefung ohne Netz bei
    // jedem Seitenwechsel neu. Nach einer Minute darf sie es wieder versuchen.
    if (feedFehler[p.slug] && !erzwingen && Date.now() - feedFehler[p.slug].zeit < 60000) {
      ziel.textContent = feedFehler[p.slug].text; feedKnopf(p); return;
    }
    ziel.textContent = "Prüfe den Kalender-Link …";
    // Ohne Cache-Buster: genau die Adresse, die auch das Handy abruft
    feedBereit(p.slug).then(function () { return fetch(feedUrl(p.slug, location.protocol), { cache: erzwingen ? "reload" : "default" }); }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (t) {
      var n = (t.match(/BEGIN:VEVENT/g) || []).length, stempel = (t.match(/DTSTAMP:(\d{8}T\d{6}Z)/) || [])[1];
      var wann = stempel ? new Date(stempel.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z")) : null;
      var kommend = (personMit(p.slug) || { spiele: [] }).spiele.filter(function (s) { return !s.vergangen; }).length;
      var ok = n >= kommend;
      feedGeprueft[p.slug] = (ok ? "Kalender-Link geprüft ✓ · " : "Achtung: Der Kalender-Link zeigt weniger Termine als die App · ")
        + n + (n === 1 ? " Termin" : " Termine") + " im Abo, " + kommend + " kommende in der App"
        + (wann ? " · Stand " + wann.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "")
        + ". Wann dein Handy zuletzt abgerufen hat, zeigt nur das Handy: Einstellungen → Apps → Kalender → Accounts → Abo (Aktualisieren: stündlich).";
      ziel.textContent = feedGeprueft[p.slug];
      feedKnopf(p);
    }).catch(function () {
      var text = "Kalender-Link gerade nicht erreichbar. Ohne Netz ist das normal, sonst bitte später noch einmal.";
      feedFehler[p.slug] = { zeit: Date.now(), text: text };
      ziel.textContent = text; feedKnopf(p);
    });
  }
  function feedKnopf(p) {
    var ziel = el("feed-pruefung");
    if (ziel.querySelector("button")) return;
    var b = document.createElement("button"); b.type = "button"; b.className = "textknopf"; b.style.marginLeft = "6px"; b.textContent = "Neu prüfen";
    b.addEventListener("click", function () { delete feedGeprueft[p.slug]; delete feedFehler[p.slug]; feedPruefen(p, true); });
    ziel.appendChild(b);
  }
  function einstellungenLaden(nurAnwenden) {
    kalenderEinstRendern();
    el("karten-app").value = lesen("karten") || "auto";
    if (!nurAnwenden) el("karten-app").addEventListener("change", function (e) { schreiben("karten", e.target.value === "auto" ? null : e.target.value); if (aktuell && !el("detail").classList.contains("versteckt")) zeigePerson(aktuell, true); toast("Karten-App: " + e.target.options[e.target.selectedIndex].text, ""); einstellungenSync(); });
    einfachAnwenden();
    if (el("einfach")) {
      el("einfach").checked = einfachAn();
      if (!nurAnwenden) el("einfach").addEventListener("change", function (e) { einfachSetzen(e.target.checked); });
    }
    var k = lesen("kompakt") === "1"; el("kompakt").checked = k; document.body.classList.toggle("kompakt", k);
    if (!nurAnwenden) el("kompakt").addEventListener("change", function (e) { schreiben("kompakt", e.target.checked ? "1" : null); document.body.classList.toggle("kompakt", e.target.checked); einstellungenSync(); });
    function schriftSetzen(stufe) {
      if (stufe === "normal" || !stufe) document.documentElement.removeAttribute("data-schrift"); else document.documentElement.setAttribute("data-schrift", stufe);
      Array.prototype.forEach.call(el("schrift").querySelectorAll("button"), function (b) { b.classList.toggle("aktiv", (b.getAttribute("data-stufe") === (stufe || "normal"))); });
    }
    schriftSetzen(lesen("schrift"));
    if (!nurAnwenden) Array.prototype.forEach.call(el("schrift").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () { var st = b.getAttribute("data-stufe"); schreiben("schrift", st === "normal" ? null : st); schriftSetzen(st); filterHoehe(); einstellungenSync(); });
    });
    function akzentSetzen(farbe) {
      if (!farbe || farbe === "logo") document.documentElement.removeAttribute("data-akzent"); else document.documentElement.setAttribute("data-akzent", farbe);
      Array.prototype.forEach.call(el("akzent").querySelectorAll("button"), function (b) { b.classList.toggle("aktiv", (b.getAttribute("data-akzent") === (farbe || "logo"))); });
    }
    akzentSetzen(lesen("akzent"));
    if (!nurAnwenden) Array.prototype.forEach.call(el("akzent").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () { var f = b.getAttribute("data-akzent"); schreiben("akzent", f === "logo" ? null : f); akzentSetzen(f); einstellungenSync(); });
    });
    verkehrLaden(nurAnwenden);
    el("ziel").value = lesen("ziel") || "";
    startBausteineRendern();
    if (nurAnwenden) return;
    el("stand").style.cursor = "pointer"; el("stand").title = "Antippen: neu laden";
    el("stand").addEventListener("click", function () { neuLaden().then(function () { toast("Aktualisiert", "gut"); }); });
    el("abo").addEventListener("click", function () { schreiben("abo-geklickt", "1"); setTimeout(function () { kalenderBoxStand(); onboardingStand(); }, 500); });
  }

  function zeigeNeu() {
    var box = el("neu");
    // Neulinge bekommen das Onboarding, nicht die Aenderungsliste
    if (!profil || !profil.slug) { schreiben("neu-gesehen", NEUIGKEITEN.version); box.classList.add("versteckt"); return; }
    if (lesen("neu-gesehen") === NEUIGKEITEN.version) { box.classList.add("versteckt"); return; }
    var ul = el("neu-liste"); ul.innerHTML = "";
    NEUIGKEITEN.punkte.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
    box._offen = true; if (!el("detail").classList.contains("versteckt")) box.classList.remove("versteckt");
    el("neu-weg").onclick = function () { schreiben("neu-gesehen", NEUIGKEITEN.version); box._offen = false; box.classList.add("versteckt"); };
  }

  var letzterStand = null;
  function netzAnzeigen() {
    var s = el("stand");
    el("offline").classList.toggle("versteckt", !!navigator.onLine);
    if (!navigator.onLine) {
      s.className = "stand alt"; s.textContent = "Offline, gespeicherter Stand" + (letzterStand ? " von " + letzterStand : "");
      var q = 0; try { q = Object.keys(JSON.parse(localStorage.getItem("mg_queue") || "{}")).length; } catch (e) {}
      var geht = funktionsText([[null, "Spielplan"], [null, "Spielseiten"], [null, "Kalender"],
        ["abrechnung", "Abrechnung"], ["notizen", "Notizen"], ["regeln", "Regeln"]], "und");
      var netz = funktionsText([["push", "Push"], ["wetter", "Wetter"], ["tausch", "Tausch"],
        ["hallen", "Karte"], ["mitfahren", "Zusammen fahren"]], "und");
      el("offline-text").textContent = "Offline, Stand von " + (letzterStand || "?") + ". Geht: " + geht + " (gespeicherter Stand)."
        + (netz ? " Braucht Netz: " + netz + "." : "")
        + (q ? " " + q + (q === 1 ? " Änderung wartet" : " Änderungen warten") + " aufs Nachreichen." : "");
    }
    else if (daten) standAnzeigen(daten, letzterLauf);
  }
  window.addEventListener("online", netzAnzeigen);
  window.addEventListener("offline", netzAnzeigen);

  // Karten-App: Android-Handys haben selten Apple Karten
  function kartenApp() {
    var w = lesen("karten") || "auto";
    if (w !== "auto") return w;
    return /Android/i.test(navigator.userAgent) ? "google" : "apple";
  }
  function kartenLink(ort) {
    return kartenApp() === "google"
      ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(ort)
      : "https://maps.apple.com/?daddr=" + encodeURIComponent(ort);
  }
  function kopierKnopf(text, was) {
    var b = document.createElement("button"); b.type = "button"; b.className = "textknopf kopier knopf-zeichen";
    b.appendChild(ikone("i-kopieren"));
    b.title = (was || "Adresse") + " kopieren";
    b.setAttribute("aria-label", b.title);
    b.addEventListener("click", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast((was || "Adresse") + " kopiert ✓", "gut"); }, function () { prompt("Kopieren:", text); });
      else prompt("Kopieren:", text);
    });
    return b;
  }
  function hallenSlug(name) { return ohneZeichen(name).replace(/\s+/g, "-"); }
  function halleVonSlug(slug) {
    var namen = Object.keys(daten.hallen || {}).concat(Object.keys(daten.adressen || {}));
    (daten.spiele || []).forEach(function (sp) { if (sp.halle && namen.indexOf(sp.halle) < 0) namen.push(sp.halle); });
    return namen.filter(function (n) { return hallenSlug(n) === slug; })[0] || null;
  }
  function hallenLink(name) {
    if (!name) { var sp = document.createElement("span"); sp.textContent = "Halle unbekannt"; return sp; }
    var a = document.createElement("a"); a.className = "hallenlink"; a.href = "#halle/" + hallenSlug(name); a.textContent = name; return a;
  }

  function heuteSchluessel(s) { return new Date(s.beginn).toDateString(); }

  // Wischen auf einer Spielkarte: nach rechts Route, nach links Abrechnen (eigenes,
  // vergangenes Spiel) bzw. Spielseite. Kurze Vibration, wenn ausgeloest.
  function wischAktionen(karteEl, s) {
    if (!("ontouchstart" in window)) return;
    var meins = !!(profil && profil.slug && ((s.besetzung || []).some(function (b) { return b.slug === profil.slug; }) || s.rolle));
    var linksAktion = s.ort ? { text: "Route", icon: "i-route", tu: function () { window.open(kartenLink(s.ort), "_blank", "noopener"); } } : null;
    var rechtsAktion = meins && funktion("abrechnung") ? { text: s.vergangen ? "Abrechnen" : "Rechnung", icon: "i-euro", tu: function () { location.hash = (s.vergangen ? "abrechnen/" : "rechnung/") + encodeURIComponent(kennungVon(s)); } }
                     : meins && funktion("notizen") ? { text: "Notiz", icon: "i-note", tu: function () { location.hash = "spiel/" + encodeURIComponent(kennungVon(s)); } }
                     : { text: "Details", icon: "i-list", tu: function () { location.hash = "spiel/" + encodeURIComponent(kennungVon(s)); } };
    var l = document.createElement("div"); l.className = "wisch links"; if (linksAktion) { l.appendChild(ikone(linksAktion.icon)); l.appendChild(document.createTextNode(linksAktion.text)); }
    var r = document.createElement("div"); r.className = "wisch rechts"; r.appendChild(ikone(rechtsAktion.icon)); r.appendChild(document.createTextNode(rechtsAktion.text));
    karteEl.insertBefore(l, karteEl.firstChild); karteEl.insertBefore(r, karteEl.firstChild);
    var x0 = null, y0 = null, dx = 0, aktiv = false;
    karteEl.addEventListener("touchstart", function (ev) { if (ev.touches.length !== 1) return; x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; dx = 0; aktiv = false; karteEl._gewischt = false; }, { passive: true });
    karteEl.addEventListener("touchmove", function (ev) {
      if (x0 === null) return;
      var nx = ev.touches[0].clientX - x0, ny = ev.touches[0].clientY - y0;
      if (!aktiv) { if (Math.abs(ny) > 12 && Math.abs(ny) > Math.abs(nx)) { x0 = null; return; } if (Math.abs(nx) < 14) return; aktiv = true; karteEl.classList.add("wischt"); }
      dx = Math.max(-110, Math.min(110, nx)); if (dx > 0 && !linksAktion) dx = 0;
      karteEl.style.transform = "translateX(" + dx + "px)";
      l.style.opacity = dx > 30 ? Math.min(1, (dx - 30) / 40) : 0; r.style.opacity = dx < -30 ? Math.min(1, (-dx - 30) / 40) : 0;
    }, { passive: true });
    function ende() {
      if (x0 === null) return;
      var ausloesen = Math.abs(dx) >= 80 ? (dx > 0 ? linksAktion : rechtsAktion) : null;
      karteEl.classList.remove("wischt"); karteEl.style.transform = ""; l.style.opacity = 0; r.style.opacity = 0;
      if (aktiv) { karteEl._gewischt = true; setTimeout(function () { karteEl._gewischt = false; }, 400); }
      x0 = null;
      if (ausloesen) { if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} } setTimeout(ausloesen.tu, 120); }
    }
    karteEl.addEventListener("touchend", ende, { passive: true });
    karteEl.addEventListener("touchcancel", ende, { passive: true });
  }

  // Feste Farbe je Ligagruppe, damit U13 / RL / Frauen auf einen Blick unterscheidbar sind
  var LIGA_FARBEN = { U7: 195, U9: 175, U11: 150, U13: 120, U15: 90, U17: 60, U20: 35, RL: 260, LL: 290, BL: 320, DNL: 10, DA: 0, Frauen: 340 };
  function ligaFarbe(liga) {
    var g = ligaGruppe(liga), hue = LIGA_FARBEN[g];
    if (hue === undefined) { hue = 0; for (var i = 0; i < g.length; i++) hue = (hue * 31 + g.charCodeAt(i)) % 360; }
    var dunkel = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    return dunkel ? { bg: "hsl(" + hue + ", 35%, 22%)", fg: "hsl(" + hue + ", 70%, 78%)", punkt: "hsl(" + hue + ", 60%, 60%)" }
                  : { bg: "hsl(" + hue + ", 60%, 93%)", fg: "hsl(" + hue + ", 55%, 30%)", punkt: "hsl(" + hue + ", 55%, 45%)" };
  }
  function ligaPille(liga) {
    var l = document.createElement("span"); l.className = "liga"; l.textContent = liga;
    var f = ligaFarbe(liga); l.style.background = f.bg; l.style.color = f.fg; l.setAttribute("data-farbe", "1");
    return l;
  }

  function spielText(s) {
    var d = new Date(s.beginn);
    return datumKurz(d) + " " + uhr(d) + " Uhr, " + (s.liga ? s.liga + ": " : "") + s.paarung +
      "\nTreffpunkt " + uhr(new Date(s.treffpunkt)) + " Uhr" + (s.halle ? ", " + s.halle : "") +
      (s.ort ? "\n" + s.ort + "\nRoute: " + kartenLink(s.ort) : "");
  }
  function teilenKnopf(s) {
    var b = document.createElement("button"); b.type = "button"; b.className = "textknopf teilen-knopf";
    b.appendChild(ikone("i-teilen"));
    b.title = navigator.share ? "Spiel teilen" : "Spiel kopieren";
    b.setAttribute("aria-label", b.title);
    b.addEventListener("click", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var text = spielText(s);
      if (navigator.share) navigator.share({ text: text }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast("Spiel kopiert ✓", "gut"); });
      else prompt("Spiel:", text);
    });
    return b;
  }

  // Fehler sichtbar machen, statt still zu scheitern
  var letzterFehler = null;
  function fehlerZeigen(text) {
    letzterFehler = { zeit: new Date().toISOString(), text: text };
    var t = el("toast");
    toast("Fehler: " + text.slice(0, 80) + " · antippen zum Kopieren", "warn");
    t.onclick = function () {
      var voll = diagnoseText() + "\n\nFehler:\n" + text;
      if (navigator.clipboard) navigator.clipboard.writeText(voll).then(function () { toast("Fehlerbericht kopiert ✓", "gut"); });
      t.onclick = null;
    };
  }
  // Ein abgebrochener Abruf (Funkloch, Tab im Hintergrund, Wechsel ins WLAN)
  // ist kein Fehler zum Melden - dafuer gibt es den Offline-Streifen.
  function netzproblem(text) {
    return !navigator.onLine || /Failed to fetch|Load failed|NetworkError|network error|aborted|The operation was aborted/i.test(text || "");
  }
  window.addEventListener("error", function (e) {
    var t = (e.message || "unbekannt") + (e.filename ? " (" + e.filename.split("/").pop() + ":" + e.lineno + ")" : "");
    if (netzproblem(e.message)) return;
    fehlerZeigen(t);
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason, t = r && r.message ? r.message : String(r);
    if (netzproblem(t)) return;
    fehlerZeigen(t);
  });

  function initialen(name) {
    var t = String(name || "").split(",");
    var nach = (t[0] || "").trim(), vor = (t[1] || "").trim();
    return ((vor[0] || "") + (nach[0] || "")).toUpperCase() || "?";
  }
  function farbeFuer(text) {
    text = String(text == null ? "" : text);
    var hsum = 0; for (var i = 0; i < text.length; i++) hsum = (hsum * 31 + text.charCodeAt(i)) % 360;
    return "hsl(" + hsum + ", 45%, 42%)";
  }

  function zuletztLesen() { try { return JSON.parse(lesen("zuletzt") || "[]"); } catch (e) { return []; } }
  function zuletztMerken(slug) {
    if (profil && profil.slug === slug) return;
    var l = zuletztLesen().filter(function (x) { return x !== slug; });
    l.unshift(slug); schreiben("zuletzt", JSON.stringify(l.slice(0, 5)));
  }

  // --------------------------------------------------------- Namensliste

  function suchVerlaufRendern() {
    var box = el("such-verlauf"); if (!box) return;
    box.innerHTML = ""; box.classList.add("versteckt");
    if (!suchModus) return;
    var l = []; try { l = JSON.parse(lesen("suchverlauf") || "[]"); } catch (e) {}
    if (!l.length) return;
    l.forEach(function (q) {
      var c = document.createElement("button"); c.type = "button"; c.className = "chip"; c.textContent = q;
      c.addEventListener("click", function () { el("suche").value = q; zeigeListe(q); });
      box.appendChild(c);
    });
    var weg = document.createElement("button"); weg.type = "button"; weg.className = "textknopf"; weg.textContent = "leeren";
    weg.addEventListener("click", function () { schreiben("suchverlauf", null); suchVerlaufRendern(); });
    box.appendChild(weg);
    box.classList.remove("versteckt");
  }
  function suchVerlaufMerken(q) {
    q = (q || "").trim(); if (q.length < 3 || !suchModus) return;
    var l = []; try { l = JSON.parse(lesen("suchverlauf") || "[]"); } catch (e) {}
    l = [q].concat(l.filter(function (x) { return x !== q; })).slice(0, 4);
    schreiben("suchverlauf", JSON.stringify(l)); suchVerlaufRendern();
  }
  function suchEintrag(liste, titel, unter, aktion) {
    var li = document.createElement("li"); var b = document.createElement("button"); b.type = "button";
    var t = document.createElement("span"); t.textContent = titel; if (unter) { var sm = document.createElement("small"); sm.textContent = unter; t.appendChild(sm); }
    b.appendChild(t); b.addEventListener("click", aktion); li.appendChild(b); liste.appendChild(li); return li;
  }
  function suchGruppe(liste, name) { var li = document.createElement("li"); li.className = "gruppe"; li.textContent = name; liste.appendChild(li); }
  function zeigeListe(filter) {
    var liste = el("namen"), treffer = 0;
    liste.innerHTML = "";
    var f = ohneZeichen(filter);
    var lauf = liste._lauf = {};
    if (suchModus && f.length >= 2) {
      // Hallen
      var hallen = !funktion("hallen") ? [] :
        Object.keys(daten.hallen || {}).concat(Object.keys(daten.adressen || {})).filter(function (n, i, a) { return a.indexOf(n) === i; })
        .filter(function (n) { return ohneZeichen(n + " " + ((daten.adressen || {})[n] || "")).indexOf(f) >= 0; }).slice(0, 6);
      if (hallen.length) { suchGruppe(liste, "Hallen"); treffer += hallen.length; }
      hallen.forEach(function (n) { suchEintrag(liste, n, (daten.adressen || {})[n] || "", function () { location.hash = "halle/" + hallenSlug(n); }); });
      // Vereine (aus den Paarungen)
      var vereine = {};
      (daten.spiele || []).forEach(function (s) { (s.paarung || "").split(/\s[–-]\s/).forEach(function (v) { v = v.trim(); if (v && ohneZeichen(v).indexOf(f) >= 0) vereine[v] = (vereine[v] || 0) + (s.vergangen ? 0 : 1); }); });
      var vl = Object.keys(vereine).sort(function (a, b) { return vereine[b] - vereine[a]; });
      if (vl.some(function (v) { return vereine[v] > 0; })) vl = vl.filter(function (v) { return vereine[v] > 0; });
      vl = vl.slice(0, 6);
      if (vl.length) { suchGruppe(liste, "Vereine"); treffer += vl.length; }
      vl.forEach(function (v) { suchEintrag(liste, v, vereine[v] ? vereine[v] + (vereine[v] === 1 ? " Spiel im Plan" : " Spiele im Plan") : "keine kommenden Spiele", function () {
        location.hash = "plan"; setTimeout(function () { el("plan-filter").value = v; el("plan-filter").dispatchEvent(new Event("input", { bubbles: true })); }, 100);
      }); });
      // Spiele
      var spiele = (daten.spiele || []).filter(function (s) { return !s.vergangen && ohneZeichen((s.liga || "") + " " + s.paarung + " " + (s.halle || "")).indexOf(f) >= 0; }).slice(0, 8);
      if (spiele.length) { suchGruppe(liste, "Spiele"); treffer += spiele.length; }
      spiele.forEach(function (s) { var d = new Date(s.beginn); suchEintrag(liste, datumKurz(d) + " " + uhr(d) + " · " + (s.liga ? s.liga + ": " : "") + s.paarung, (s.halle || "") + (s.besetzung && s.besetzung.length ? " · " + s.besetzung.map(function (b) { return b.name.split(",")[0]; }).join(", ") : " · unbesetzt"), function () { location.hash = "spiel/" + encodeURIComponent(kennungVon(s)); }); });
      // Seiten der App. Die Liste steht unter "Mehr"; ist sie noch nicht
      // aufgebaut worden, hilft ein Blick darauf - deshalb einmal bauen.
      if (!mehrEintraege.length && el("mehr")) { var offen = !el("mehr").classList.contains("versteckt"); zeigeMehr(); if (!offen) el("mehr").classList.add("versteckt"); }
      var seiten = mehrEintraege.filter(function (e) {
        return ohneZeichen(e[2] + " " + (e[3] || "")).indexOf(f) >= 0;
      }).slice(0, 5);
      if (seiten.length) { suchGruppe(liste, "Seiten"); treffer += seiten.length; }
      seiten.forEach(function (e) { suchEintrag(liste, e[2], e[3] || "", function () { location.hash = e[0].replace(/^#/, ""); }); });

      // Eigene Notizen (Login)
      if (sitzungVorhanden() && funktion("notizen")) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
        .then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.notizenFuerSuche() : null; })
        .then(function (n) {
          if (!n || liste._lauf !== lauf) return;
          var nl = n.filter(function (x) { return ohneZeichen((x.text || "") + " " + (x.paarung || "")).indexOf(f) >= 0; }).slice(0, 5);
          if (!nl.length) return;
          suchGruppe(liste, "Meine Notizen"); el("nichts").classList.add("versteckt");
          nl.forEach(function (x) {
            var kurz = (x.text || "").length > 68 ? x.text.slice(0, 68).replace(/\s\S*$/, "") + " \u2026" : (x.text || "");
            suchEintrag(liste, x.paarung || "Notiz", kurz, function () { location.hash = "mitglieder/notizen"; });
          });
        }).catch(function () {});

      // Termine (Login)
      if (sitzungVorhanden() && funktion("info")) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
        .then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.termine() : null; })
        .then(function (t) {
          if (!t || liste._lauf !== lauf) return;
          var tl = t.filter(function (x) { return ohneZeichen(x.titel + " " + (x.text || "")).indexOf(f) >= 0; }).slice(0, 5);
          if (!tl.length) return;
          suchGruppe(liste, "Termine"); el("nichts").classList.add("versteckt");
          tl.forEach(function (x) { suchEintrag(liste, x.titel, x.termin.split("-").reverse().join("."), function () { location.hash = "mitglieder/info"; }); });
        }).catch(function () {});
      // Strafen und Bestimmungen liegen als Datei in der App, also auch offline
      // Strafen, Spielzeiten und Bestimmungen fuehren alle auf die
      // Regelseite - ist die aus, braucht sie auch niemand zu finden.
      var nachladen = [];
      if (!regelnDaten) nachladen.push(hole("strafen.json").then(function (d) { regelnDaten = d; }).catch(function () {}));
      if (!bestimmungenDaten) nachladen.push(hole("bestimmungen.json").then(function (d) { bestimmungenDaten = d; }).catch(function () {}));
      if (!zeitenDaten) nachladen.push(zeitenLaden().then(function (d) { zeitenDaten = d; }).catch(function () {}));
      if (!staerkenDaten) nachladen.push(staerkenLaden().then(function (d) { staerkenDaten = d; }).catch(function () {}));
      if (funktion("regeln")) Promise.all(nachladen).then(function () {
        if (liste._lauf !== lauf) return;
        var st = ((regelnDaten && regelnDaten.strafen) || []).filter(function (r) {
          return ohneZeichen(r.name + " " + (r.info || "")).indexOf(f) >= 0;
        }).slice(0, 6);
        if (st.length) {
          suchGruppe(liste, "Strafen"); el("nichts").classList.add("versteckt");
          st.forEach(function (r) {
            suchEintrag(liste, r.name, r.codes.join(" \u00b7 ") || "ohne eigene Strafart", function () {
              regelnTeil = "strafen"; regelArt = ""; location.hash = "regeln";
              setTimeout(function () {
                var i = el("regeln-filter"); if (!i) return;
                i.value = r.name; i.dispatchEvent(new Event("input", { bubbles: true }));
              }, 150);
            });
          });
        }
        var bs = [];
        ((bestimmungenDaten && bestimmungenDaten.bereiche) || []).forEach(function (b) {
          (b.punkte || []).forEach(function (pt) {
            if (bs.length < 5 && ohneZeichen(pt.text + " " + (pt.quelle || "")).indexOf(f) >= 0) bs.push({ b: b, p: pt });
          });
        });
        var zt = ((zeitenDaten && zeitenDaten.ligen) || []).filter(function (l) {
          return ohneZeichen(l.liga + " " + (l.gruppe || "") + " " + (l.spielzeit || "")).indexOf(f) >= 0;
        }).slice(0, 5);
        if (zt.length) {
          suchGruppe(liste, "Spielzeiten"); el("nichts").classList.add("versteckt");
          zt.forEach(function (l) {
            suchEintrag(liste, l.liga, [l.spielzeit, l.verlaengerung].filter(Boolean).join(" \u00b7 ") || "Angaben fehlen noch", function () {
              regelnTeil = "zeiten"; location.hash = "regeln";
            });
          });
        }
        var st2 = ((staerkenDaten && staerkenDaten.staerken) || []).filter(function (l) {
          return ohneZeichen(l.liga + " " + (l.gruppe || "") + " " + (l.feldspieler || "")).indexOf(f) >= 0;
        }).slice(0, 5);
        if (st2.length) {
          suchGruppe(liste, "Antrittsstärke"); el("nichts").classList.add("versteckt");
          st2.forEach(function (l) {
            suchEintrag(liste, l.liga + " (" + (l.saison || "") + ")", [l.feldspieler, l.torwart ? l.torwart + " Torhüter" : ""].filter(Boolean).join(" · ") || "Angaben fehlen noch", function () {
              regelnTeil = "staerken"; location.hash = "regeln";
            });
          });
        }
        if (bs.length) {
          suchGruppe(liste, "Bestimmungen"); el("nichts").classList.add("versteckt");
          bs.forEach(function (x) {
            var kurz = x.p.text.length > 68 ? x.p.text.slice(0, 68).replace(/\s\S*$/, "") + " \u2026" : x.p.text;
            suchEintrag(liste, kurz, x.b.titel + " \u00b7 " + x.p.quelle, function () {
              regelnTeil = "bestimmungen"; location.hash = "regeln";
            });
          });
        }
      });
      suchGruppe(liste, "Kollegen");
    }
    var personenTreffer = 0;
    // Die Liste waechst ueber die Saison auf alle Kollegen - wer gerade
    // nichts hat, steht deshalb unten unter einer eigenen Ueberschrift.
    var passend = daten.personen.filter(function (p) {
      var suchtext = suchtextVon(p.name + " " + (p.varianten || []).join(" "));
      if (!f) return true;
      if (suchtext.indexOf(f) >= 0) return true;
      return suchtext.split(" ").some(function (t) { return t.indexOf(f) === 0; });
    });
    var aktiv = passend.filter(function (p) { return p.spiele.some(function (s) { return !s.vergangen; }); });
    var ruht = passend.filter(function (p) { return aktiv.indexOf(p) < 0; });
    var ueberschrift = !suchModus && aktiv.length && ruht.length;
    aktiv.concat(ruht).forEach(function (p, nr) {
      if (ueberschrift && nr === aktiv.length) suchGruppe(liste, "Ohne aktuelles Spiel");
      treffer++; personenTreffer++;
      if (suchModus && f.length >= 2 && personenTreffer > 8) return;
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      var name = document.createElement("span");
      name.textContent = p.name;
      var n = p.spiele.filter(function (s) { return !s.vergangen; }).length;
      var anzahl = document.createElement("span");
      anzahl.className = "anzahl" + (n ? "" : " ruhig");
      // Wer gerade nichts hat, bleibt in der Liste - dann sagt die Zeile,
      // wann er zuletzt gepfiffen hat, statt nur eine nackte Null.
      var zuletzt = !n && p.statistik && p.statistik.letzte;
      anzahl.textContent = n ? n + (n === 1 ? " Spiel" : " Spiele")
        : zuletzt ? "zuletzt " + zuletzt.split("-").reverse().join(".") : "kein Spiel";
      b.appendChild(name); b.appendChild(anzahl);
      b.addEventListener("click", function () { if (suchModus) location.hash = p.slug; else profilSetzen(p); });
      li.appendChild(b);
      liste.appendChild(li);
    });
    if (suchModus && f.length >= 2 && !personenTreffer) { var letzte = liste.lastChild; if (letzte && letzte.classList.contains("gruppe")) letzte.remove(); }
    el("nichts").classList.toggle("versteckt", treffer > 0);
  }

  function profilSetzen(p) {
    var vorher = profil && profil.slug;
    profil = profil || {};
    if (profil.slug !== p.slug) profil = { slug: p.slug, gesehen: {}, begonnen: false };
    profil.slug = p.slug; profil.name = p.name;
    profilSchreiben();
    if (vorher !== p.slug) schreiben("person", null);
    location.hash = p.slug;
    zeigePerson(p);
  }

  // -------------------------------------------------- Benachrichtigungen

  var GESEHEN_VERSION = 2;
  function schluesselVon(s) { return s.beginn + "|" + s.paarung + "|" + (s.aenderung || ""); }
  function badgeSetzen(n) {
    try { if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n); else if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) {}
  }
  function alsApp() { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
  function meldeLage() {
    if (!("Notification" in window)) return alsApp() ? "geht-nicht" : "erst-installieren";
    if (Notification.permission === "granted") return "an";
    if (Notification.permission === "denied") return "abgelehnt";
    return "fragen";
  }
  function zeigeMeldeKarte() {
    var karte = el("melde"), status = el("melde-status"), text = el("melde-text"), knopf = el("melde-knopf");
    karte.classList.remove("versteckt"); knopf.classList.add("versteckt");
    var lage = meldeLage();
    status.className = "status " + (lage === "an" ? "an" : "aus");
    if (lage === "an") {
      status.textContent = "an";
      text.textContent = "Beim Öffnen der App bekommst du eine Mitteilung, wenn eine Einteilung dazugekommen ist oder sich geändert hat."
        + (funktion("push") ? " Echtes Push auch bei geschlossener App: Mehr → Konto → Push." : "");
    } else if (lage === "fragen") {
      status.textContent = "aus";
      text.textContent = "Die App meldet sich dann, wenn eine Einteilung dazukommt oder sich ändert.";
      knopf.textContent = "Benachrichtigungen einschalten"; knopf.classList.remove("versteckt");
    } else if (lage === "abgelehnt") {
      status.textContent = "abgelehnt";
      text.textContent = "Du hast Mitteilungen abgelehnt. Wieder erlauben in Einstellungen → Apps → Einteilungen → Mitteilungen.";
    } else if (lage === "erst-installieren") {
      status.textContent = "aus";
      text.textContent = "Dafür muss die Seite auf dem Home-Bildschirm liegen: in Safari auf Teilen → Zum Home-Bildschirm.";
    } else {
      status.textContent = "nicht möglich";
      text.textContent = "Dieser Browser kennt keine Mitteilungen. Der Kalender funktioniert trotzdem.";
    }
  }
  function meldeAnfragen() {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(function () { zeigeMeldeKarte(); if (Notification.permission === "granted") pruefeNeue(aktuell, true); });
  }
  function melden(titel, rumpf) {
    if (!("Notification" in window) || Notification.permission !== "granted" || !navigator.serviceWorker) return;
    navigator.serviceWorker.ready.then(function (reg) {
      reg.showNotification(titel, { body: rumpf, icon: "icon-192.png", badge: "icon-192.png", tag: "einteilung", renotify: true, data: { url: "./#" + (profil && profil.slug) } });
    }).catch(function () {});
  }
  function pruefeNeue(person, stumm) {
    if (!person || !profil) return;
    var kommend = person.spiele.filter(function (s) { return !s.vergangen; });
    var vorher = profil.gesehen || {};
    var neu = kommend.filter(function (s) { return !vorher[schluesselVon(s)]; });
    var jetzt = {};
    kommend.forEach(function (s) { jetzt[schluesselVon(s)] = 1; });
    var ersterBesuch = !profil.begonnen || profil.gesehenVersion !== GESEHEN_VERSION;
    profil.gesehen = jetzt; profil.gesehenVersion = GESEHEN_VERSION; profil.begonnen = true;
    profilSchreiben();
    if (ersterBesuch || !neu.length) { badgeSetzen(0); return; }
    badgeSetzen(neu.length);
    if (stumm) return;
    var e = neu[0], d = new Date(e.beginn);
    var zeile = datumKurz(d) + ", " + uhr(d) + " Uhr, " + e.paarung;
    melden(neu.length === 1 ? "Neue Einteilung" : neu.length + " neue Einteilungen",
           neu.length === 1 ? zeile : zeile + " und " + (neu.length - 1) + " weitere");
  }

  // ----------------------------------------------------------- Spielkarte

  function rolleBadge(rolle, klasse) {
    var r = document.createElement("span");
    r.className = (klasse || "rolle") + " " + (rolle || "");
    r.textContent = rolle || "";
    return r;
  }

  function karte(s, fuer) {
    var beginn = new Date(s.beginn), treff = new Date(s.treffpunkt);
    var karteEl = document.createElement("div");
    karteEl.className = "spiel karte zeit-links" + (s.vergangen ? " war" : "") + (s.aenderung ? " neu" : "");
    var wann = document.createElement("div"); wann.className = "wann";
    if (s.liga) { var lf = ligaFarbe(s.liga); wann.style.setProperty("--liga-bg", lf.bg); wann.style.setProperty("--liga-fg", lf.fg); }
    var wt = document.createElement("b"); wt.textContent = wochentag[beginn.getDay()];
    var tg = document.createElement("span"); tg.textContent = beginn.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
    var zt = document.createElement("em"); zt.textContent = uhr(beginn);
    wann.appendChild(wt); wann.appendChild(tg); wann.appendChild(zt);
    karteEl.appendChild(wann);
    var d = document.createElement("div"); d.className = "inhalt"; karteEl.appendChild(d);

    var kopf = document.createElement("div");
    kopf.className = "kopfzeile";
    var datum = document.createElement("span");
    datum.className = "datum";
    if (s.liga) datum.appendChild(ligaPille(s.liga));
    kopf.appendChild(datum); kopf.appendChild(rolleBadge(s.rolle));
    d.appendChild(kopf);

    var paarung = document.createElement("div");
    paarung.className = "paarung"; paarung.textContent = s.paarung;
    d.appendChild(paarung);

    var wo = document.createElement("span");
    wo.appendChild(document.createTextNode("Treffpunkt " + uhr(treff) + " Uhr · "));
    wo.appendChild(hallenLink(s.halle));
    if (s.system >= 3) wo.appendChild(document.createTextNode(" · " + s.system + "er-System"));
    d.appendChild(mitIkone("i-pin", wo));
    if (!s.ort) { var w = document.createElement("div"); w.className = "achtung"; w.textContent = "Halle nicht automatisch erkannt, bitte selbst prüfen."; d.appendChild(w); }

    if (s.gespann && s.gespann.length) {
      var g = document.createElement("div"); g.className = "chips" + (fuer ? "" : " klein");
      s.gespann.forEach(function (k) { if (!k || (!k.name && !k.slug)) return; var c = chip(k, s.system >= 3); if (!fuer) { var tn = Array.prototype.filter.call(c.childNodes, function (n) { return n.nodeType === 3; })[0]; if (tn) tn.textContent = (k.name || "").split(",")[0]; } g.appendChild(c); });
      d.appendChild(g);
    }
    if (s.hinweis) { var hw = document.createElement("div"); hw.className = "achtung"; hw.textContent = "⚠ " + s.hinweis; d.appendChild(hw); }
    if (s.aenderung) { var ae = document.createElement("div"); ae.className = "geaendert"; ae.textContent = "⚠ Geändert: " + s.aenderung; d.appendChild(ae); }
    var kz = korrekturZeile(s); if (kz) d.appendChild(kz);
    else if (s.manuell) { var mz = document.createElement("div"); mz.className = "geaendert"; mz.textContent = "✎ Angelegt" + vonWem(s); d.appendChild(mz); }
    if (s.korrektur && s.korrektur.abgesagt) d.classList.add("abgesagt");
    var mehr = document.createElement("div"); mehr.className = "meta"; mehr.style.marginTop = "6px"; mehr.style.color = "var(--akzent)";
    mehr.textContent = funktionsText([[null, "Details"], [null, "Route"], ["tausch", "Tausch"], ["notizen", "Notiz"]]) + " \u203a";
    d.appendChild(mehr);
    karteEl.classList.add("tippbar");
    karteEl.addEventListener("click", function (ev) { if (ev.target.closest("a, button") || karteEl._gewischt) return; location.hash = "spiel/" + encodeURIComponent(kennungVon(s)); });
    // Rollen-Kante: eigene Rolle (Start) oder meine Rolle in der Besetzung (Spielplan)
    var meineRolle = s.rolle || (profil && profil.slug && (s.besetzung || []).filter(function (b) { return b.slug === profil.slug; })[0] || {}).rolle;
    if (meineRolle) karteEl.classList.add("rolle-" + meineRolle);
    wischAktionen(karteEl, s);
    karteEl._spiel = s;
    return karteEl;
  }

  function kennungVon(s) { return s.id || (s.beginn + "|" + s.paarung); }

  // ---------------------------------------------------- Wetter (Open-Meteo)

  var wetterCache = {};
  var WETTER_CODES = { 0: "klar", 1: "meist klar", 2: "wolkig", 3: "bedeckt", 45: "Nebel", 48: "Nebel", 51: "Nieselregen", 53: "Nieselregen", 55: "Nieselregen",
    56: "gefrierender Niesel", 57: "gefrierender Niesel", 61: "Regen", 63: "Regen", 65: "starker Regen", 66: "gefrierender Regen", 67: "gefrierender Regen",
    71: "Schnee", 73: "Schnee", 75: "starker Schnee", 77: "Schneegriesel", 80: "Schauer", 81: "Schauer", 82: "starke Schauer", 85: "Schneeschauer", 86: "Schneeschauer", 95: "Gewitter", 96: "Gewitter", 99: "Gewitter" };
  function wetterFuer(koord, zeit) {
    if (!koord || !navigator.onLine) return Promise.resolve(null);
    var d = new Date(zeit), diff = (d - Date.now()) / 3600000;
    if (diff < -3 || diff > 60) return Promise.resolve(null);
    var key = koord[0].toFixed(2) + "," + koord[1].toFixed(2);
    var lauf = wetterCache[key] || (wetterCache[key] = fetch("https://api.open-meteo.com/v1/forecast?latitude=" + key.split(",")[0] + "&longitude=" + key.split(",")[1] +
      "&hourly=temperature_2m,precipitation,snowfall,weather_code&timezone=Europe%2FBerlin&forecast_days=3").then(function (r) { return r.json(); }).catch(function () { return null; }));
    return lauf.then(function (j) {
      var h = j && j.hourly; if (!h) return null;
      var stunde = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + "T" + ("0" + d.getHours()).slice(-2) + ":00";
      var i = h.time.indexOf(stunde); if (i < 0) return null;
      var temp = h.temperature_2m[i], regen = h.precipitation[i] || 0, schnee = h.snowfall[i] || 0, code = h.weather_code[i];
      var text = Math.round(temp) + " °C, " + (WETTER_CODES[code] || "wechselhaft"), warnt = false;
      if (schnee > 0) { text += ", Schnee, mehr Zeit einplanen"; warnt = true; }
      else if (temp <= 2 && regen > 0) { text += ", Glättegefahr"; warnt = true; }
      else if ([56, 57, 66, 67].indexOf(code) >= 0) { text += ", gefrierender Regen"; warnt = true; }
      return { text: text, warnt: warnt };
    });
  }
  function wetterZeile(koord, zeit, wann) {
    var z = document.createElement("div"); z.className = "wetter";
    wetterFuer(koord, zeit).then(function (w) {
      if (!w) { z.remove(); return; }
      if (w.warnt) z.classList.add("warnt");
      z.appendChild(ikone(w.warnt ? "i-bell" : "i-sun"));
      z.appendChild(document.createTextNode((wann || "Wetter an der Halle") + ": " + w.text));
    });
    return z;
  }

  // ------------------------------------------------------ Spiel-Detailseite

  function zeigeSpiel(kennung) {
    var s0 = (daten.spiele || []).filter(function (x) { return kennungVon(x) === kennung; })[0];
    if (!s0) { toast("Spiel nicht (mehr) im Datenfenster.", "warn"); return ausHash(location.hash = ""); }
    var meins = !!(profil && profil.slug && s0.besetzung.some(function (b) { return b.slug === profil.slug; }));
    var ps = meins ? (personMit(profil.slug).spiele.filter(function (x) { return kennungVon(x) === kennung; })[0] || null) : null;
    var s = Object.assign({}, s0, ps || {});
    if (!s.ort && s.halle && daten.adressen && daten.adressen[s.halle]) s.ort = s.halle + ", " + daten.adressen[s.halle];
    ansicht("spiel"); aktuell = null;
    var d = new Date(s.beginn), treff = new Date(s.treffpunkt);
    // Die Kopfzeile sagte Paarung, Datum, Uhrzeit und Rolle - und die
    // Karte direkt darunter noch einmal dasselbe, nur groesser. Auf dem
    // Handy waren das zwei lange Zeilen vor dem eigentlichen Inhalt.
    // Jetzt steht hier wie auf den anderen Unterseiten nur, wo man ist.
    el("spiel-titel").textContent = "Spiel";
    el("spiel-unter").textContent = meins ? "Dein Einsatz" : "Einteilung";

    var kopf = el("spiel-kopf"); kopf.innerHTML = "";
    var h = document.createElement("div"); h.className = "spiel-kopf";
    if (s.liga) {
      var hue = (function () { var g = ligaGruppe(s.liga), hv = LIGA_FARBEN[g]; if (hv === undefined) { hv = 0; for (var i = 0; i < g.length; i++) hv = (hv * 31 + g.charCodeAt(i)) % 360; } return hv; })();
      h.classList.add("liga-farbe"); h.style.setProperty("--liga-dunkel-1", "hsl(" + hue + ", 45%, 26%)"); h.style.setProperty("--liga-dunkel-2", "hsl(" + hue + ", 50%, 40%)");
    }
    var w = document.createElement("div"); w.className = "wann";
    var t = tagTitel(d); w.textContent = t[0] + (t[1] ? " · " + t[1] : ""); h.appendChild(w);
    var z = document.createElement("div"); z.className = "zeit"; z.textContent = uhr(d) + " Uhr"; h.appendChild(z);
    var pa = document.createElement("p"); pa.className = "paarung"; pa.textContent = s.paarung; h.appendChild(pa);
    var info = document.createElement("div"); info.className = "halle"; info.style.marginTop = "8px";
    info.appendChild(ikone("i-clock")); info.appendChild(document.createTextNode("Treffpunkt " + uhr(treff) + " Uhr" + (s.system >= 3 ? " · " + s.system + "er-System" : " · 2er-System")));
    h.appendChild(info);
    var pillen = document.createElement("div"); pillen.className = "grosse-pillen";
    if (s.liga) { var lp = document.createElement("span"); lp.textContent = s.liga; pillen.appendChild(lp); }
    if (meins && s.rolle) { var rp = document.createElement("span"); rp.textContent = "Du: " + s.rolle + ((daten.rollen && daten.rollen[s.rolle]) ? " · " + daten.rollen[s.rolle] : ""); pillen.appendChild(rp); }
    if (pillen.childNodes.length) h.appendChild(pillen);
    var ak = document.createElement("div"); ak.className = "aktionen";
    if (s.ort) { var r = document.createElement("a"); r.href = kartenLink(s.ort); r.target = "_blank"; r.rel = "noopener"; r.appendChild(ikone("i-route")); r.appendChild(document.createTextNode("Route")); ak.appendChild(r); }
    var tb = teilenKnopf(s); tb.className = "knopf-zeichen nur-zeichen"; ak.appendChild(tb);
    var kb = document.createElement("button"); kb.type = "button"; kb.appendChild(ikone("i-cal")); kb.appendChild(document.createTextNode("In Kalender"));
    kb.title = "Nur dieses Spiel als Kalenderdatei"; kb.addEventListener("click", function () { einzelIcs(s); }); ak.appendChild(kb);
    h.appendChild(ak);
    var kontaktZeile = document.createElement("div"); kontaktZeile.className = "kontakt-knoepfe versteckt"; h.appendChild(kontaktZeile);
    kopf.appendChild(h);

    var inhalt = el("spiel-inhalt"); inhalt.innerHTML = "";
    var symbole = { "Anfahrt": "i-route", "Halle": "i-pin", "Gespann": "i-users", "Besetzung": "i-users", "Tauschoptionen": "i-swap", "Weiteres": "i-list", "Spieltag-Checkliste": "i-check", "Änderungsverlauf": "i-clock" };
    function karteAbschnitt(titel) { var k = document.createElement("div"); k.className = "karte abschnitt-karte"; if (titel) { var hh = document.createElement("h4"); if (symbole[titel]) hh.appendChild(ikone(symbole[titel])); hh.appendChild(document.createTextNode(titel)); k.appendChild(hh); } inhalt.appendChild(k); return k; }

    // Alles zum Hinkommen in einer Karte: wann los, wie weit, wohin, wie das
    // Wetter wird. Vorher stand die Abfahrt klein unter der Anschrift.
    var ort = karteAbschnitt("Anfahrt");
    var abfahrtZeile = document.createElement("div"); abfahrtZeile.className = "abfahrt-gross versteckt";
    ort.appendChild(abfahrtZeile);
    // Der Name stand hier als Link und gleich darunter noch einmal als Reihe -
    // zweimal derselbe Weg. Hier bleibt nur die Anschrift zum Kopieren.
    if (s.ort) {
      var oz = document.createElement("div"); oz.className = "meta hallen-anschrift";
      var ad = document.createElement("span");
      ad.textContent = s.ort.indexOf(s.halle + ", ") === 0 ? s.ort.slice(s.halle.length + 2) : s.ort;
      oz.appendChild(ad); oz.appendChild(kopierKnopf(s.ort));
      ort.appendChild(oz);
    }
    var koord = daten.hallen && daten.hallen[s.halle];
    if (koord && !s.vergangen && funktion("wetter")) ort.appendChild(wetterZeile(koord, treff, "Wetter zum Treffpunkt"));
    ((daten.hallen_hinweise || {})[s.halle] || []).forEach(function (t) {
      var oh = document.createElement("div"); oh.className = "hinweis offiziell"; oh.style.marginTop = "8px"; oh.appendChild(ikone("i-pin"));
      var os = document.createElement("span"); var ob = document.createElement("span"); ob.className = "offiziell-badge"; ob.textContent = "Offiziell"; os.appendChild(ob); os.appendChild(document.createTextNode(t)); oh.appendChild(os); ort.appendChild(oh);
    });
    if (s.halle) {
      // Kein nackter Link mehr: eine Reihe zum Antippen, mit Zeichen und Pfeil
      var hz = document.createElement("a"); hz.className = "reihe-knopf"; hz.href = "#halle/" + hallenSlug(s.halle);
      hz.appendChild(ikone("i-pin"));
      var ht = document.createElement("span");
      var hb = document.createElement("b"); hb.textContent = s.halle; ht.appendChild(hb);
      var hs = document.createElement("small"); hs.textContent = funktion("hallen") ? "Hinweise, Route und alle Spiele dort" : "Route und alle Spiele dort";
      ht.appendChild(hs); hz.appendChild(ht);
      var hp = document.createElement("span"); hp.className = "pfeil"; hp.textContent = "›"; hz.appendChild(hp);
      ort.appendChild(hz); ort._hinweisZeile = hz; ort._hinweisText = hs;
    }
    if (meins && s.halle) {
      ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.abfahrt(s.halle) : null; })
        .then(function (roh) {
          if (!roh || !roh.minuten || !abfahrtZeile.isConnected) return;
          var sk = mitPuffer(roh); var ab = new Date(treff.getTime() - sk.minuten * 60000);
          abfahrtZeile.innerHTML = "";
          abfahrtZeile.appendChild(ikone("i-route"));
          var t1 = document.createElement("span");
          var b1 = document.createElement("b"); b1.textContent = "Abfahrt ca. " + uhr(ab) + " Uhr"; t1.appendChild(b1);
          var s1 = document.createElement("small"); s1.textContent = sk.minuten + " Min., " + sk.km + " km, " + verkehrText() + " · Treffpunkt " + uhr(treff) + " Uhr";
          t1.appendChild(s1); abfahrtZeile.appendChild(t1);
          abfahrtZeile.classList.remove("versteckt");
        }).catch(function () {});
    }
    if (s.hinweis) { var hw = document.createElement("div"); hw.className = "achtung"; hw.textContent = "⚠ " + s.hinweis; ort.appendChild(hw); }
    if (s.aenderung) { var ae = document.createElement("div"); ae.className = "geaendert"; ae.textContent = "⚠ Geändert: " + s.aenderung; ort.appendChild(ae); }
    var kz2 = korrekturZeile(s); if (kz2) ort.appendChild(kz2);
    else if (s.manuell) { var mz2 = document.createElement("div"); mz2.className = "geaendert"; mz2.textContent = "✎ Angelegt" + vonWem(s) + " (nicht auf esrw.de)"; ort.appendChild(mz2); }
    if (s.korrektur && s.korrektur.abgesagt) kopf.classList.add("abgesagt");

    var wer = karteAbschnitt(meins ? "Gespann" : "Besetzung");
    var chips = document.createElement("div"); chips.className = "chips";
    var liste = meins && s.gespann ? s.gespann : s.besetzung;
    if (liste.length) liste.forEach(function (k) { chips.appendChild(chip(k, s.system >= 3)); });
    else { var o = document.createElement("span"); o.className = "chip offen"; o.textContent = "noch nicht besetzt"; chips.appendChild(o); }
    wer.appendChild(chips);

    if (meins && !s.vergangen && funktion("checkliste")) checkliste(karteAbschnitt("Spieltag-Checkliste"), s);

    // Angemeldet: Hallen-Hinweise, Kontakte, Fahrgemeinschaft, Notiz
    var ex = karteAbschnitt(null);
    var skel = document.createElement("div"); skel.className = "skelett-karte"; skel.style.height = "70px"; skel.style.margin = "0"; ex.appendChild(skel);
    if (!sitzungVorhanden()) ex.classList.add("versteckt");
    var exZiel = document.createElement("div"); exZiel.className = "extras-ziel"; ex.appendChild(exZiel);
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) {
      skel.remove();
      if (!st.eingerichtet || !st.session) {
        var p = document.createElement("p"); p.className = "meta"; p.style.margin = "0";
        var a = document.createElement("a"); a.href = "#mitglieder"; a.textContent = "Anmelden"; p.appendChild(a);
        p.appendChild(document.createTextNode(" für " + [funktion("hallen") ? "Hallen-Hinweise" : "", funktion("gespann") ? "Kontakte" : "", funktion("chat") ? "Gespann-Chat" : "", funktion("mitfahren") ? "Fahrgemeinschaft" : "", funktion("notizen") ? "Notizen" : ""].filter(Boolean).join(", ") + "."));
        if (!funktion("hallen") && !funktion("gespann") && !funktion("chat") && !funktion("mitfahren") && !funktion("notizen")) { ex.classList.add("versteckt"); return; }
        ex.classList.remove("versteckt"); ex.appendChild(p); return;
      }
      return window.Mitglieder.extrasLaden([s]).then(function (ok) {
        if (!ok) return;
        window.Mitglieder.spielExtras(s, exZiel, meins, true);
        var det = exZiel.querySelector("details"); if (det) { det.open = true; ex.classList.remove("versteckt"); } else ex.classList.add("versteckt");
        // Kontakte des Gespanns direkt in die Kopfkarte
        var kontakte = window.Mitglieder.kontakteFuer(s);
        if (kontakte.length) {
          kontaktZeile.classList.remove("versteckt");
          kontakte.forEach(function (k) {
            var a1 = document.createElement("a"); a1.href = k.tel; a1.appendChild(ikone("i-users")); a1.appendChild(document.createTextNode(k.vorname + " anrufen")); kontaktZeile.appendChild(a1);
            var a2 = document.createElement("a"); a2.href = k.wa; a2.target = "_blank"; a2.rel = "noopener"; a2.textContent = "WhatsApp"; kontaktZeile.appendChild(a2);
          });
        }
        var n = window.Mitglieder.hinweisAnzahl(s.halle);
        if (ort._hinweisText && n) ort._hinweisText.textContent = n + (n === 1 ? " Hinweis" : " Hinweise") + " von Kollegen, Route und alle Spiele dort";
      });
    }).catch(function () {});

    if (meins && !s.vergangen && funktion("tausch")) {
      var ta = karteAbschnitt("Tauschoptionen");
      var box = tauschBereich(s, personMit(profil.slug)); ta.appendChild(box); box.open = true;
    }
    if (meins) {
      var ab = karteAbschnitt("Weiteres");
      if (funktion("abrechnung")) {
        var l = document.createElement("a"); l.className = "zeile-link"; l.href = "#abrechnen/" + encodeURIComponent(kennungVon(s));
        l.appendChild(ikone("i-euro")); l.appendChild(document.createTextNode("Zur Abrechnung dieses Spiels")); ab.appendChild(l);
        // Direkt zur Gebuehrenabrechnung fuer genau dieses Spiel: die Angaben
        // kommen aus dem Konto, aendern kann man sie vorher trotzdem.
        var rl = document.createElement("a"); rl.className = "zeile-link"; rl.href = "#rechnung/" + encodeURIComponent(kennungVon(s));
        rl.appendChild(ikone("i-note"));
        rl.appendChild(document.createTextNode("Rechnung schreiben (PDF fürs Formular)"));
        ab.appendChild(rl);
      }
      if (!s.vergangen && funktion("obmann")) {
        var mailZeile = document.createElement("div");
        var mail = document.createElement("a"); mail.className = "zeile-link"; mail.href = "#"; mail.appendChild(ikone("i-bell")); mail.appendChild(document.createTextNode("Obmann anschreiben (Absage / Frage)"));
        mail.addEventListener("click", function (ev) {
          ev.preventDefault();
          ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.obmann() : null; })
            .then(function (an) {
              var text = "Hallo,\n\nes geht um mein Spiel:\n" + spielText(s) + "\n\n[Grund / Frage hier eintragen]\n\nViele Grüße\n" + (profil.name ? profil.name.split(",").reverse().join(" ").trim() : "");
              location.href = "mailto:" + encodeURIComponent(an || "") + "?subject=" + encodeURIComponent("Spiel " + datumKurz(d) + " " + s.paarung) + "&body=" + encodeURIComponent(text);
              if (!an) toast("Obmann-Adresse fehlt. Trag sie unter Konto → Einstellungen ein, dann steht sie gleich drin.", "");
            }).catch(function () {});
        });
        mailZeile.appendChild(mail); ab.appendChild(mailZeile);
      }
    }
    // Aenderungsverlauf aus dem Protokoll (14 Tage): was wurde wann geaendert
    if (sitzungVorhanden()) hole("protokoll.json").then(function (pl) {
      if (inhalt._lauf !== lauf) return;
      var meine = (pl || []).filter(function (e) { return e.kennung && e.kennung === kennungVon(s); });
      if (!meine.length) return;
      var vb = karteAbschnitt("Änderungsverlauf"); var vl = document.createElement("div"); vl.className = "verlauf";
      meine.sort(function (a, b) { return a.stand < b.stand ? 1 : -1; }).forEach(function (e) {
        var z = document.createElement("div"); z.className = "eintrag";
        var namen = { neu: "Neu eingeteilt", geaendert: "Geändert", gespann: "Gespann gewechselt", entfallen: "Abgesetzt" };
        var kopf = document.createElement("b"); kopf.textContent = (namen[e.art] || AEND_NAMEN[e.art] || e.art) + (e.name ? " · " + e.name : "") + (e.quelle ? " · " + e.quelle : ""); z.appendChild(kopf);
        if (e.felder && e.felder.length) { var fl = document.createElement("span"); fl.className = "felder"; e.felder.forEach(function (f) { var sp = document.createElement("span"); var s1 = document.createElement("s"); s1.textContent = f.vorher; var b1 = document.createElement("b"); b1.textContent = f.nachher; sp.appendChild(document.createTextNode(f.feld + ": ")); sp.appendChild(s1); sp.appendChild(document.createTextNode(" → ")); sp.appendChild(b1); fl.appendChild(sp); }); z.appendChild(fl); }
        else if (e.was) { var w = document.createElement("div"); w.textContent = e.was; z.appendChild(w); }
        var d2 = new Date(e.stand); var sm = document.createElement("small"); sm.textContent = datumKurz(d2) + " " + uhr(d2) + " Uhr"; z.appendChild(sm);
        vl.appendChild(z);
      });
      vb.appendChild(vl);
    }).catch(function () {});
    // Betreiber und Obmaenner mit dem Recht: Spiel korrigieren
    var lauf = inhalt._lauf = {};
    if (sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { return st.eingerichtet && st.session && window.Mitglieder.darfKorrigieren ? window.Mitglieder.darfKorrigieren() : false; })
      .then(function (ja) { if (ja && inhalt._lauf === lauf) korrekturFormular(s, karteAbschnitt("Korrigieren")); }).catch(function () {});
    setTimeout(function () {
      var karten = Array.prototype.slice.call(inhalt.querySelectorAll(":scope > .karte"));
      var punkte = karten.map(function (k) {
        var h4 = k.querySelector("h4"); if (!h4 || k.classList.contains("versteckt")) return null;
        var titel = h4.textContent.replace(/\s*\d+\/\d+$/, "").replace(/\s*\(.*\)$/, "").trim();
        return [k, kurzTitel(titel)];
      }).filter(Boolean);
      sprungleiste("spiel-sprung", "spiel", punkte);
    }, 900);
    window.scrollTo(0, 0);
  }

  // Admin-Formular auf der Spielseite: Halle, Anstoss, Treffpunkt, Hinweis, Absage
  function lokalInput(iso) { if (!iso) return ""; var d = new Date(iso); function z(n) { return ("0" + n).slice(-2); } return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + "T" + z(d.getHours()) + ":" + z(d.getMinutes()); }
  function korrekturFormular(s, box) {
    var k = s.korrektur || {};
    var p = document.createElement("p"); p.className = "meta"; p.style.margin = "0 0 8px";
    p.textContent = "Gilt für alle: App sofort, Kalender und Push beim nächsten Lauf (bis 30 Min.). Leere Felder bleiben wie auf esrw.de.";
    box.appendChild(p);
    var form = document.createElement("div"); form.className = "mg-form";
    function feld(label, eingabe) { var l = document.createElement("label"); l.textContent = label; form.appendChild(l); form.appendChild(eingabe); return eingabe; }
    var halle = document.createElement("select"); halle.className = "mg-select";
    var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "wie erkannt (" + ((s._orig && s._orig.halle) || s.halle || "unbekannt") + ")"; halle.appendChild(o0);
    Object.keys(daten.adressen || {}).sort(function (a, b) { return a.localeCompare(b, "de"); }).forEach(function (n) { var o = document.createElement("option"); o.value = n; o.textContent = n; if (k.halle === n) o.selected = true; halle.appendChild(o); });
    feld("Halle", halle);
    var beginn = document.createElement("input"); beginn.type = "datetime-local"; beginn.value = lokalInput(k.beginn); feld("Anstoß (leer = " + uhr(new Date((s._orig && s._orig.beginn) || s.beginn)) + " Uhr)", beginn);
    var treff = document.createElement("input"); treff.type = "datetime-local"; treff.value = lokalInput(k.treffpunkt); feld("Treffpunkt (leer = " + (daten.vorlauf_minuten || 60) + " Min. vor Anstoß)", treff);
    var hinweis = document.createElement("input"); hinweis.type = "text"; hinweis.maxLength = 200; hinweis.placeholder = "z. B. „Nebenhalle, Eingang hinten“"; hinweis.value = k.hinweis || ""; feld("Hinweis für alle", hinweis);
    gespannFormular(s, form);
    var abgesagt = document.createElement("input"); abgesagt.type = "checkbox"; abgesagt.checked = !!k.abgesagt;
    var al = document.createElement("label"); al.className = "mg-check"; al.appendChild(abgesagt); al.appendChild(document.createTextNode(" Spiel abgesagt")); form.appendChild(al);
    box.appendChild(form);
    var zw = document.createElement("div"); zw.className = "zweit"; zw.style.marginTop = "10px";
    var speichern = document.createElement("button"); speichern.type = "button"; speichern.className = "anfrage"; speichern.textContent = "Korrektur speichern";
    speichern.addEventListener("click", function () {
      var obj = { halle: halle.value || null, beginn: beginn.value ? new Date(beginn.value).toISOString() : null, treffpunkt: treff.value ? new Date(treff.value).toISOString() : null, hinweis: hinweis.value.trim() || null, abgesagt: abgesagt.checked };
      var leer = !obj.halle && !obj.beginn && !obj.treffpunkt && !obj.hinweis && !obj.abgesagt;
      speichern.disabled = true;
      window.Mitglieder.korrekturSpeichern(kennungVon(s), leer ? null : obj).then(function (ok) {
        speichern.disabled = false; if (!ok) return;
        toast(leer ? "Korrektur entfernt." : "Korrektur gespeichert, alle sehen sie sofort.", "gut");
        korrekturenLaden(false).then(function () { zeigeSpiel(kennungVon(s)); });
      });
    });
    zw.appendChild(speichern);
    if (s.manuell) { var loesch = document.createElement("button"); loesch.type = "button"; loesch.style.color = "var(--rot)"; loesch.textContent = "Spiel löschen"; loesch.addEventListener("click", function () {
      if (!confirm("Dieses vom Betreiber angelegte Spiel löschen? Es verschwindet für alle (Kalender beim nächsten Lauf).")) return;
      window.Mitglieder.spielManuellLoeschen(kennungVon(s).slice(2)).then(function (ok) { if (!ok) return; toast("Spiel gelöscht.", "gut"); location.hash = "plan"; setTimeout(function () { location.reload(); }, 400); });
    }); zw.appendChild(loesch); }
    if (s.korrektur && !s.manuell) { var weg = document.createElement("button"); weg.type = "button"; weg.textContent = "Korrektur entfernen"; weg.addEventListener("click", function () {
      window.Mitglieder.korrekturSpeichern(kennungVon(s), null).then(function (ok) { if (!ok) return; toast("Korrektur entfernt.", "gut"); korrekturenLaden(false).then(function () { zeigeSpiel(kennungVon(s)); }); });
    }); zw.appendChild(weg); }
    box.appendChild(zw);
  }

  // Gespann aendern: die Zeilen stehen im selben Formular wie Halle und
  // Anstoss, werden aber getrennt gespeichert - eine Korrektur an der
  // Uhrzeit soll das Gespann nicht anfassen und umgekehrt.
  function gespannFormular(s, form) {
    var kor = korrekturen[kennungVon(s)] || {};
    var vomBetreiber = !!(kor.besetzung && kor.besetzung.length);
    var lbl = document.createElement("label");
    lbl.textContent = "Gespann";
    if (vomBetreiber) { var mk = document.createElement("span"); mk.className = "merkzeichen gut"; mk.style.marginLeft = "8px"; mk.textContent = "vom Betreiber"; lbl.appendChild(mk); }
    form.appendChild(lbl);

    var stand = (vomBetreiber ? kor.besetzung : (s._origBesetzung || s.besetzung || []))
      .map(function (b) { return { slug: b.slug || null, name: b.name, rolle: b.rolle || "SR" }; });
    var liste = document.createElement("div"); liste.className = "gespann-form";
    form.appendChild(liste);

    function zeichnen() {
      liste.innerHTML = "";
      stand.forEach(function (b, i) {
        var z = document.createElement("div"); z.className = "gespann-zeile";
        var wahl = document.createElement("select"); wahl.className = "mg-select";
        var leer = document.createElement("option"); leer.value = ""; leer.textContent = "Kollege wählen";
        wahl.appendChild(leer);
        (daten.personen || []).forEach(function (p) {
          var o = document.createElement("option"); o.value = p.slug; o.textContent = p.name;
          if (b.slug === p.slug) o.selected = true;
          wahl.appendChild(o);
        });
        if (!b.slug && b.name) { var fremd = document.createElement("option"); fremd.value = "_fremd"; fremd.textContent = b.name; fremd.selected = true; wahl.appendChild(fremd); }
        wahl.addEventListener("change", function () {
          var p = personMit(wahl.value);
          stand[i] = { slug: p ? p.slug : null, name: p ? p.name : (wahl.value === "_fremd" ? b.name : ""), rolle: stand[i].rolle };
        });
        z.appendChild(wahl);
        var rolle = document.createElement("select"); rolle.className = "mg-select gespann-rolle";
        [["SR", "SR"], ["HSR", "HSR"], ["LSR", "LSR"]].forEach(function (r) {
          var o = document.createElement("option"); o.value = r[0]; o.textContent = r[1];
          if (b.rolle === r[0]) o.selected = true; rolle.appendChild(o);
        });
        rolle.addEventListener("change", function () { stand[i].rolle = rolle.value; });
        z.appendChild(rolle);
        var weg = document.createElement("button"); weg.type = "button"; weg.className = "textknopf";
        weg.textContent = "\u00d7"; weg.title = "Zeile entfernen";
        weg.addEventListener("click", function () { stand.splice(i, 1); zeichnen(); });
        z.appendChild(weg);
        liste.appendChild(z);
      });
      var dazu = document.createElement("button"); dazu.type = "button"; dazu.className = "textknopf";
      dazu.textContent = "+ Schiedsrichter";
      dazu.addEventListener("click", function () { stand.push({ slug: null, name: "", rolle: stand.length >= 2 ? "LSR" : "SR" }); zeichnen(); });
      liste.appendChild(dazu);

      var zw = document.createElement("div"); zw.className = "zweit"; zw.style.marginTop = "6px";
      var sp = document.createElement("button"); sp.type = "button"; sp.className = "anfrage";
      sp.textContent = "Gespann speichern";
      sp.addEventListener("click", function () {
        var fertig = stand.filter(function (b) { return b.slug || b.name; });
        if (!fertig.length) { toast("Mindestens ein Schiedsrichter.", "warn"); return; }
        sp.disabled = true;
        window.Mitglieder.korrekturSpeichern(kennungVon(s), { besetzung: fertig }).then(function (ok) {
          sp.disabled = false; if (!ok) return;
          toast("Gespann gespeichert. Es gilt auch nach dem nächsten Lauf von esrw.de.", "gut");
          korrekturenLaden(false).then(function () { zeigeSpiel(kennungVon(s)); });
        });
      });
      zw.appendChild(sp);
      if (vomBetreiber) {
        var zurueck = document.createElement("button"); zurueck.type = "button";
        zurueck.textContent = "Wieder von esrw.de";
        zurueck.title = "Deine Besetzung verwerfen, ab dem nächsten Lauf gilt wieder esrw.de";
        zurueck.addEventListener("click", function () {
          if (!confirm("Dein Gespann verwerfen? Ab dem nächsten Lauf gilt wieder, was auf esrw.de steht.")) return;
          window.Mitglieder.korrekturSpeichern(kennungVon(s), { besetzung: null }).then(function (ok) {
            if (!ok) return;
            toast("Freigegeben, esrw.de gilt wieder.", "gut");
            korrekturenLaden(false).then(function () { zeigeSpiel(kennungVon(s)); });
          });
        });
        zw.appendChild(zurueck);
      }
      liste.appendChild(zw);
      var hin = document.createElement("p"); hin.className = "meta"; hin.style.margin = "6px 0 0";
      hin.textContent = vomBetreiber
        ? "Diese Besetzung gilt, auch wenn esrw.de etwas anderes meldet."
        : "Gespeichert gilt dein Gespann dauerhaft, bis du es wieder freigibst.";
      liste.appendChild(hin);
    }
    zeichnen();
  }

  // -------------------------------------------------------- Dashboard-Kacheln

  function zeigeStartWoche(p) {
    // Ohne kommendes Spiel gibt es keine Karte oben - dann steht der Streifen frei
    var ziel = el("start-woche"); ziel.innerHTML = "";
    if (!startEinstellung("woche") || p.spiele.some(function (s) { return !s.vergangen; })) { ziel.classList.add("versteckt"); return; }
    ziel.classList.remove("versteckt");
    startWocheFuellen(ziel, p);
  }
  function startWocheFuellen(ziel, p) {
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    var jeTag = {};
    p.spiele.forEach(function (s) { var k = new Date(s.beginn).toDateString(); (jeTag[k] = jeTag[k] || []).push(s); });
    for (var i = 0; i < 7; i++) {
      (function (i) {
        var d = new Date(heute.getTime() + i * 86400000), key = d.toDateString(), liste = jeTag[key] || [];
        var b = document.createElement("button"); b.type = "button"; b.className = i === 0 ? "heute" : "";
        var wt = document.createElement("span"); wt.textContent = wochentag[d.getDay()];
        var nr = document.createElement("b"); nr.textContent = d.getDate();
        var punkt = document.createElement("i"); punkt.className = liste.length ? "ich" : "keins";
        b.appendChild(wt); b.appendChild(nr); b.appendChild(punkt);
        b.title = liste.length ? liste.map(function (s) { return uhr(new Date(s.beginn)) + " " + s.paarung; }).join(", ") : "frei";
        b.addEventListener("click", function () {
          if (liste.length === 1) location.hash = "spiel/" + encodeURIComponent(kennungVon(liste[0]));
          else if (liste.length) { location.hash = "plan"; }
          else toast(datumKurz(d) + ": kein Spiel", "");
        });
        ziel.appendChild(b);
      })(i);
    }
  }

  function hochzaehlen(el, ziel) {
    var start = performance.now(), dauer = 500;
    function schritt(t) { var f = Math.min(1, (t - start) / dauer); el.textContent = Math.round(ziel * (1 - Math.pow(1 - f, 3))); if (f < 1) requestAnimationFrame(schritt); }
    requestAnimationFrame(schritt);
  }

  // Vertretungs-Radar: fremde Gesuche und unbesetzte Spiele, die zu dir passen
  function zeigeRadar(p) {
    var ziel = el("radar"); ziel.innerHTML = "";
    if (!profil || profil.slug !== p.slug || !sitzungVorhanden()) return;
    var lauf = ziel._lauf = {};
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.radar() : null; })
      .then(function (r) {
        if (!r || ziel._lauf !== lauf) return;
        var meineTage = {}; p.spiele.forEach(function (s) { if (!s.vergangen) meineTage[new Date(s.beginn).toDateString()] = 1; });
        function passt(beginn) {
          var d = new Date(beginn), tag = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
          return r.sperren[tag] !== "nein" && !meineTage[d.toDateString()];
        }
        var treffer = [];
        r.gesuche.forEach(function (g) {
          if (!passt(g.beginn)) return;
          var k = daten.hallen && daten.hallen[g.halle], km = k && r.heimat ? Math.round(kmZwischen(k, r.heimat)) : null;
          if (km !== null && km > 60) return;
          treffer.push({ art: "gesuch", g: g, km: km, beginn: g.beginn });
        });
        (daten.spiele || []).forEach(function (s) {
          if (s.vergangen || s.besetzung.length || !passt(s.beginn)) return;
          var k = daten.hallen && daten.hallen[s.halle], km = k && r.heimat ? Math.round(kmZwischen(k, r.heimat)) : null;
          if (km === null || km > 40) return;
          treffer.push({ art: "offen", s: s, km: km, beginn: s.beginn });
        });
        if (!treffer.length) return;
        treffer.sort(function (a, b) { return a.beginn < b.beginn ? -1 : 1; });
        var box = document.createElement("div"); box.className = "karte radar";
        var hh = document.createElement("h4"); hh.appendChild(ikone("i-swap")); hh.appendChild(document.createTextNode("Vertretungs-Radar")); box.appendChild(hh);
        var hint = document.createElement("p"); hint.className = "meta"; hint.style.margin = "0 0 6px";
        hint.textContent = "Gesuche der Kollegen und unbesetzte Spiele in deiner Nähe an Tagen, an denen du frei bist.";
        box.appendChild(hint);
        treffer.slice(0, 5).forEach(function (t) {
          var z = document.createElement("div"); z.className = "kandidat";
          var kopf = document.createElement("div"); kopf.className = "kandidat-kopf";
          var d = new Date(t.beginn);
          var links = document.createElement("span"); links.style.minWidth = "0";
          var b = document.createElement("b"); b.textContent = datumKurz(d) + " " + uhr(d) + " · " + (t.art === "gesuch" ? (t.g.liga ? t.g.liga + " " : "") + t.g.paarung : (t.s.liga ? t.s.liga + " " : "") + t.s.paarung);
          links.appendChild(b); kopf.appendChild(links);
          if (t.art === "gesuch") {
            var kn = document.createElement("button"); kn.type = "button"; kn.className = "anfrage"; kn.textContent = r.meineAngebote[t.g.id] ? "gemeldet ✓" : "Ich kann";
            kn.disabled = !!r.meineAngebote[t.g.id];
            kn.addEventListener("click", function () { window.Mitglieder.angebotMachen(t.g.id).then(function (ok) { if (ok) { kn.textContent = "gemeldet ✓"; kn.disabled = true; } }); });
            kopf.appendChild(kn);
          } else {
            var a = document.createElement("a"); a.className = "anfrage"; a.href = "#spiel/" + encodeURIComponent(kennungVon(t.s)); a.textContent = "Ansehen"; kopf.appendChild(a);
          }
          z.appendChild(kopf);
          var meta = document.createElement("div"); meta.className = "meta";
          meta.textContent = (t.art === "gesuch" ? t.g.name + " sucht Ersatz · " + (t.g.halle || "?") : "Noch unbesetzt auf esrw.de · " + (t.s.halle || "?")) + (t.km !== null ? " · ~" + t.km + " km" : "");
          z.appendChild(meta); box.appendChild(z);
        });
        ziel.appendChild(box);
      }).catch(function () {});
  }

  function zeigeUebersicht(p) {
    zeigeStartWoche(p);
    if (startEinstellung("radar") && funktion("tausch")) zeigeRadar(p); else el("radar").innerHTML = "";
    var ziel = el("uebersicht"); ziel.innerHTML = "";
    if (!profil || profil.slug !== p.slug || !sitzungVorhanden()) return;
    var lauf = ziel._lauf = {};
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { if (st.eingerichtet && st.session) return window.Mitglieder.zaehler(); })
      .then(function (z) {
        if (!z || ziel._lauf !== lauf) return;
        if (startEinstellung("termine") && funktion("info")) window.Mitglieder.termine().then(function (t) {
          if (!t || !t.length || ziel._lauf !== lauf) return;
          // Steht ein Termin unmittelbar bevor, bekommt er eine eigene Karte wie ein Spiel
          var heute0 = new Date(); heute0.setHours(0, 0, 0, 0);
          var naechster = t[0], dT = new Date(naechster.termin + "T00:00:00"), diffT = Math.round((dT - heute0) / 86400000);
          if (diffT >= 0 && diffT <= 3) {
            var tk = document.createElement("a"); tk.href = "#mitglieder/info"; tk.className = "karte termin-heute" + (diffT === 0 ? " jetzt" : "");
            var wann = document.createElement("div"); wann.className = "wann"; wann.textContent = (diffT === 0 ? "Heute" : diffT === 1 ? "Morgen" : "In " + diffT + " Tagen") + " · " + wochentag[dT.getDay()] + " " + dT.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }); tk.appendChild(wann);
            var tt = document.createElement("div"); tt.className = "titel"; tt.appendChild(ikone("i-cal")); tt.appendChild(document.createTextNode(naechster.titel)); tk.appendChild(tt);
            var tm = document.createElement("div"); tm.className = "meta"; tm.textContent = "Termin vom Betreiber · Zu-/Absage unter Info ›"; tk.appendChild(tm);
            ziel.appendChild(tk);
            t = t.slice(1);
          }
          if (!t.length) return;
          var box = document.createElement("a"); box.href = "#mitglieder/info"; box.className = "termine-karte";
          var k = document.createElement("div"); k.className = "zahl karte"; k.style.textAlign = "left";
          var b = document.createElement("b"); b.textContent = "Nächste Termine"; k.appendChild(b);
          t.forEach(function (x) { var sp = document.createElement("span"); sp.textContent = x.termin.split("-").reverse().slice(0, 2).join(".") + ". · " + x.titel; sp.style.display = "block"; k.appendChild(sp); });
          box.appendChild(k); ziel.appendChild(box);
        });
        if (z.wartend) {
          var hw = document.createElement("a"); hw.href = "#mitglieder/admin"; hw.className = "hinweis warn"; hw.style.display = "flex";
          hw.appendChild(ikone("i-shield")); var t2 = document.createElement("span");
          t2.textContent = z.wartend + (z.wartend === 1 ? " Konto wartet" : " Konten warten") + " auf Freischaltung ›"; hw.appendChild(t2); ziel.appendChild(hw);
        }
      }).catch(function () {});
  }

  // Hallen-Wiki, Kontakte, Fahrgemeinschaft, Notiz - nur angemeldet
  function extrasFuellen(karten, istIch) {
    if (!karten.length) return;
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) {
      if (!st.eingerichtet || !st.session) return;
      var spiele = karten.map(function (k) { return k._spiel; });
      return window.Mitglieder.extrasLaden(spiele).then(function (ok) {
        if (!ok) return;
        karten.forEach(function (k) { if (k.isConnected) window.Mitglieder.spielExtras(k._spiel, k.querySelector(".extras-ziel"), istIch); });
      });
    }).catch(function () {});
  }

  // "muster-max" -> "Muster, Max". Nur ein Notnagel: die Daten liefern
  // den Namen sonst mit.
  function namenAusSlug(slug) {
    if (!slug) return "";
    var t = String(slug).split("-").map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; });
    return t.length > 1 ? t.slice(0, -1).join(" ") + ", " + t[t.length - 1] : t[0];
  }

  function chip(person, mitRolle, klasseExtra) {
    var e = document.createElement(person.slug ? "a" : "span");
    e.className = "chip" + (profil && person.slug === profil.slug ? " ich" : "") + (klasseExtra ? " " + klasseExtra : "");
    if (person.slug) e.href = "#" + person.slug;
    var av = document.createElement("i"); av.className = "avatar"; av.textContent = initialen(person.name || person.slug);
    av.style.background = farbeFuer(person.slug || person.name);
    if (person.slug) { av.setAttribute("data-slug", person.slug); bildAnwenden(av, person.slug); }
    e.appendChild(av);
    // Fehlt der Name (eine Korrektur, die nur den Slug setzt), stand hier
    // wortwoertlich "undefined" auf der Spielseite
    e.appendChild(document.createTextNode(person.name || namenAusSlug(person.slug) || "ohne Namen"));
    if (mitRolle && person.rolle) {
      var b = document.createElement("b"); b.className = person.rolle; b.textContent = person.rolle;
      b.title = (daten.rollen && daten.rollen[person.rolle]) || person.rolle; e.appendChild(b);
    }
    return e;
  }

  // ---------------------------------------------------------------- Held

  function zeigeHeld(p) {
    var ziel = el("held");
    ziel.innerHTML = "";
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    var kommend = p.spiele.filter(function (s) {
      if (s.vergangen) return false;
      var t = new Date(s.beginn); t.setHours(0, 0, 0, 0);
      return t >= heute;
    });
    if (!kommend.length) return;
    var s = kommend[0], d = new Date(s.beginn);
    var tag = new Date(d); tag.setHours(0, 0, 0, 0);
    var diff = Math.round((tag - heute) / 86400000);
    var wann = diff === 0 ? "Heute" : diff === 1 ? "Morgen" : "In " + diff + " Tagen";
    if (diff === 0) {
      var min = Math.round((new Date(s.treffpunkt) - Date.now()) / 60000);
      if (min <= 0) wann = new Date(s.beginn) < Date.now() ? "Läuft" : "Jetzt hin";
      else if (min < 60) wann = "Treffpunkt in " + min + " Min.";
      else wann = "Treffpunkt in " + Math.floor(min / 60) + " Std. " + (min % 60) + " Min.";
    }

    var h = document.createElement("div"); h.className = "held";
    var heuteModus = diff === 0 && new Date(s.beginn).getTime() + 3 * 3600000 > Date.now();
    if (heuteModus) h.classList.add("heute");
    // "Am Spieltag gross": Kopfkarte fuellt den Bildschirm, der Rest kommt auf Tipp
    // Spieltag-Modus: nur das Spiel, sonst nichts. Er geht am Spieltag von
    // selbst an (wenn eingeschaltet) und laesst sich jederzeit beiderseits
    // umschalten - der Zustand gilt nur fuer diesen Tag.
    var schluessel = heuteSchluessel(s);
    var vollbild = heuteModus && !!(profil && profil.slug === p.slug)
      && (lesen("vollbild-an") === schluessel
          || (startEinstellung("vollbild") && lesen("vollbild-zu") !== schluessel));
    el("detail").classList.toggle("start-vollbild", vollbild);
    document.documentElement.classList.toggle("spieltag", vollbild);
    var w = document.createElement("div"); w.className = "wann"; w.textContent = wann + " · " + datumKurz(d); h.appendChild(w);
    h.appendChild(rolleBadge(s.rolle, "rolle"));
    var z = document.createElement("div"); z.className = "zeit"; z.textContent = uhr(d) + " Uhr"; h.appendChild(z);
    var pa = document.createElement("p"); pa.className = "paarung"; pa.textContent = (s.liga ? s.liga + ": " : "") + s.paarung; h.appendChild(pa);
    var ha = document.createElement("div"); ha.className = "halle"; ha.appendChild(ikone("i-pin"));
    ha.appendChild(document.createTextNode((s.halle || "Halle unbekannt") + " · Treffpunkt " + uhr(new Date(s.treffpunkt)) + " Uhr")); h.appendChild(ha);
    var ak = document.createElement("div"); ak.className = "aktionen";
    if (s.ort) {
      var r = document.createElement("a"); r.href = kartenLink(s.ort);
      r.target = "_blank"; r.rel = "noopener"; r.appendChild(ikone("i-route")); r.appendChild(document.createTextNode("Route")); ak.appendChild(r);
    }
    if (s.gespann && s.gespann.length) {
      var ge = document.createElement("span");
      ge.appendChild(ikone("i-users")); ge.appendChild(document.createTextNode(s.gespann.map(function (x) { return (x.name || x.slug || "").split(",")[0]; }).filter(Boolean).join(", ")));
      ak.appendChild(ge);
    }
    h.appendChild(ak);
    if (heuteModus && !!(profil && profil.slug === p.slug)) {
      // Ein Knopf, zwei Richtungen: rein in den Spieltag-Modus und wieder
      // heraus. Die Karte wird dabei nicht neu aufgebaut.
      var umschalter = document.createElement("button");
      umschalter.type = "button";
      function umschalterZeigen(an) {
        umschalter.innerHTML = "";
        umschalter.className = an ? "vollbild-mehr" : "spieltag-an";
        if (!an) umschalter.appendChild(ikone("i-clock"));
        umschalter.appendChild(document.createTextNode(an ? "Normale Ansicht \u2193" : "Spieltag-Modus"));
      }
      umschalterZeigen(vollbild);
      umschalter.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var an = !el("detail").classList.contains("start-vollbild");
        el("detail").classList.toggle("start-vollbild", an);
        document.documentElement.classList.toggle("spieltag", an);
        schreiben("vollbild-an", an ? schluessel : null);
        schreiben("vollbild-zu", an ? null : schluessel);
        umschalterZeigen(an);
        if (an) window.scrollTo(0, 0);
      });
      h.appendChild(umschalter);
    }
    var meins = !!(profil && profil.slug === p.slug);
    // Heute: Countdown bis Abfahrt/Treffpunkt, Kollegen anrufen, Checkliste direkt darunter
    var heuteBox = el("heute"); heuteBox.innerHTML = "";
    if (heuteModus) {
      var cd = document.createElement("div"); cd.className = "countdown"; cd.appendChild(ikone("i-clock"));
      var cdt = document.createElement("span"); cd.appendChild(cdt); h.appendChild(cd);
      var abfahrtZeit = null;
      function countdown() {
        if (h._timer && !h.isConnected) { clearInterval(h._timer); return; }
        var ziel = abfahrtZeit || new Date(s.treffpunkt), rest = Math.round((ziel - Date.now()) / 60000), was = abfahrtZeit ? "Abfahrt" : "Treffpunkt";
        var txt;
        if (rest > 0) txt = "<b>" + (rest >= 60 ? Math.floor(rest / 60) + " Std. " + (rest % 60) + " Min." : rest + " Min.") + "</b> bis zur " + (abfahrtZeit ? "Abfahrt" : "Ankunft") + "<small>" + was + " " + uhr(ziel) + " Uhr · Spielbeginn " + uhr(d) + " Uhr</small>";
        else if (new Date(s.beginn) > Date.now()) txt = "<b>" + (abfahrtZeit ? "Jetzt losfahren" : "Jetzt hin") + "</b><small>Spielbeginn " + uhr(d) + " Uhr</small>";
        else txt = "<b>Spiel läuft</b><small>seit " + uhr(d) + " Uhr, gutes Spiel!</small>";
        cdt.innerHTML = txt;
      }
      countdown(); h._timer = setInterval(countdown, 30000);
      h._abfahrtSetzen = function (t) { abfahrtZeit = t; countdown(); };
      if (meins && sitzungVorhanden() && funktion("gespann")) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) {
        if (!st.eingerichtet || !st.session) return;
        return window.Mitglieder.extrasLaden([s]).then(function () {
          if (!h.isConnected) return;
          window.Mitglieder.kontakteFuer(s).forEach(function (k) {
            var a1 = document.createElement("a"); a1.className = "kontakt"; a1.href = k.tel; a1.appendChild(ikone("i-users")); a1.appendChild(document.createTextNode(k.vorname + " anrufen")); ak.appendChild(a1);
          });
        });
      }).catch(function () {});
      if (meins && funktion("checkliste")) {
        var cb = document.createElement("div"); cb.className = "karte abschnitt-karte";
        var hh = document.createElement("h4"); hh.appendChild(ikone("i-check")); hh.appendChild(document.createTextNode("Checkliste für heute")); cb.appendChild(hh);
        checkliste(cb, s); heuteBox.appendChild(cb);
      }
    }
    el("start-woche").classList.add("versteckt");
    if (kommend[1] && startEinstellung("danach")) {
      var n2 = kommend[1], d2 = new Date(n2.beginn);
      var dn = document.createElement("div"); dn.className = "danach"; dn.appendChild(ikone("i-cal"));
      dn.appendChild(document.createTextNode("Danach: " + datumKurz(d2) + " · " + uhr(d2) + " · " + (n2.liga ? n2.liga + " " : "") + n2.paarung));
      h.appendChild(dn);
    }
    var koord = daten.hallen && daten.hallen[s.halle];
    if (koord && startEinstellung("wetter") && funktion("wetter")) { var wz = wetterZeile(koord, s.treffpunkt, "Wetter"); wz.classList.add("danach"); h.appendChild(wz); }
    h.classList.add("tippbar"); h.title = "Zum Spiel";
    h.addEventListener("click", function (ev) {
      if (ev.target.closest("a, button")) return;
      location.hash = "spiel/" + encodeURIComponent(kennungVon(s));
    });
    if (startEinstellung("woche")) { var wochenStreifen = document.createElement("div"); wochenStreifen.className = "woche start-woche"; h.appendChild(wochenStreifen); startWocheFuellen(wochenStreifen, p); }
    ziel.appendChild(h);
    if (profil && profil.slug === p.slug && s.halle && startEinstellung("abfahrt")) {
      ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) {
        if (!st.eingerichtet || !st.session) return null;
        return window.Mitglieder.abfahrt(s.halle);
      }).then(function (roh) {
        if (!roh || !roh.minuten || !h.isConnected) return;
        var st = mitPuffer(roh);
        var ab = new Date(new Date(s.treffpunkt).getTime() - st.minuten * 60000);
        if (h._abfahrtSetzen) h._abfahrtSetzen(ab);
        var z = document.createElement("div"); z.className = "abfahrt"; z.appendChild(ikone("i-route"));
        z.appendChild(document.createTextNode("Abfahrt ca. " + uhr(ab) + " Uhr · " + st.minuten + " Min., " + st.km + " km, " + verkehrText()));
        h.appendChild(z);
      }).catch(function () {});
    }
  }

  // ----------------------------------------------------- Nachtrag-Hinweis

  function zeigeNachtrag(p) {
    var ziel = el("nachtrag");
    ziel.innerHTML = "";
    if (!profil || profil.slug !== p.slug || !funktion("abrechnung")) return;
    var lauf = ziel._lauf = {};
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) {
      if (!st.eingerichtet || !st.session) return;
      return window.Mitglieder.offeneAbrechnungen(p.slug, 21);
    }).then(function (offen) {
      if (!offen || !offen.length || ziel._lauf !== lauf) return;
      var h = document.createElement("div"); h.className = "hinweis warn";
      h.appendChild(ikone("i-check"));
      var t = document.createElement("span");
      t.appendChild(document.createTextNode(offen.length === 1 ? "Ein Spiel ohne Abrechnung: " + offen[0] + ". "
        : offen.length + " Spiele ohne Abrechnung. "));
      var a = document.createElement("a"); a.href = "#mitglieder"; a.textContent = "Jetzt nachtragen"; t.appendChild(a);
      h.appendChild(t); ziel.appendChild(h);
    }).catch(function () {});
  }

  // ------------------------------------------------------ Tauschoptionen

  function fenster(s) {
    var dauer = (daten.spieldauer_minuten || 150) * 60000, b = new Date(s.beginn).getTime();
    return [new Date(s.treffpunkt).getTime(), b + dauer];
  }
  function ueberschneidet(a, b) { var fa = fenster(a), fb = fenster(b); return fa[0] < fb[1] && fb[0] < fa[1]; }
  function kmZwischen(a, b) {
    var r = 6371, p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180, dp = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * r * Math.asin(Math.sqrt(h));
  }
  function naeheZu(person, hallenName) {
    var ziel = daten.hallen && daten.hallen[hallenName];
    if (!ziel || !person.statistik || !person.statistik.hallen) return null;
    var beste = null;
    person.statistik.hallen.forEach(function (paar) { var k = daten.hallen[paar[0]]; if (!k) return; var d = kmZwischen(k, ziel); if (beste === null || d < beste) beste = d; });
    return beste;
  }
  function vorname(name) { var t = name.split(","); return (t.length > 1 ? t[1] : t[0]).trim().split(" ")[0]; }

  function tauschOptionen(spiel, ich, sperren) {
    var tag = tagVon(spiel.beginn), gespann = {};
    (spiel.gespann || []).forEach(function (g) { if (g.slug) gespann[g.slug] = 1; });
    var meineAnderen = ich.spiele.filter(function (s) { return s !== spiel && !s.vergangen && tagVon(s.beginn) === tag; });
    var uebernehmen = [], tausch = [];
    daten.personen.forEach(function (p) {
      if (p.slug === ich.slug || gespann[p.slug]) return;
      var sperre = sperren && sperren[p.slug];
      if (sperre === "nein") return;
      var amTag = p.spiele.filter(function (s) { return tagVon(s.beginn) === tag; });
      var frei = amTag.length === 0;
      var passtDazu = amTag.every(function (s) { return !ueberschneidet(s, spiel); });
      var gleicheHalle = amTag.some(function (s) { return s.halle && s.halle === spiel.halle; });
      var kenntHalle = !!(p.statistik && p.statistik.hallen && p.statistik.hallen.some(function (h) { return h[0] === spiel.halle; }));
      var warHSR = !!(p.statistik && p.statistik.rollen && p.statistik.rollen.HSR);
      var km = naeheZu(p, spiel.halle);
      var woche = p.spiele.filter(function (s) { return !s.vergangen && Math.abs(new Date(s.beginn) - new Date(spiel.beginn)) / 86400000 <= 3; }).length;
      var gruende = [], punkte = 0;
      if (sperre === "gern") { gruende.push("hat sich freigemeldet"); punkte += 5; }
      if (gleicheHalle) { gruende.push("am selben Tag in dieser Halle"); punkte += 4; }
      else if (frei) { gruende.push("kein Spiel an dem Tag"); punkte += 2; }
      else if (passtDazu) { gruende.push("passt zeitlich zu seinem Spiel"); punkte += 1; }
      if (kenntHalle) { gruende.push("kennt die Halle"); punkte += 2; }
      if (spiel.rolle === "HSR" && warHSR) { gruende.push("war schon HSR"); punkte += 1; }
      if (km !== null && km >= 2 && km <= 25) { gruende.push("spielt oft in der Nähe (~" + Math.round(km) + " km)"); punkte += 1; }
      else if (km !== null && km < 2) punkte += 1;
      if (woche === 0) { gruende.push("diese Woche frei"); punkte += 1; } else if (woche >= 3) punkte -= 1;
      if (frei || passtDazu) uebernehmen.push({ person: p, gruende: gruende, punkte: punkte, km: km, gern: sperre === "gern" });
      amTag.forEach(function (seins) {
        if (seins.vergangen) return;
        var seineAnderen = amTag.filter(function (x) { return x !== seins; });
        var ichKann = meineAnderen.every(function (m) { return !ueberschneidet(m, seins); });
        var erKann = seineAnderen.every(function (x) { return !ueberschneidet(x, spiel); });
        if (ichKann && erKann) {
          var wert = punkte;
          if (seins.halle && seins.halle === spiel.halle) wert += 3;
          else if (ich.statistik && ich.statistik.hallen && ich.statistik.hallen.some(function (h) { return h[0] === seins.halle; })) wert += 2;
          var meinWeg = naeheZu(ich, seins.halle);
          if (meinWeg !== null && meinWeg <= 25) wert += 1;
          tausch.push({ person: p, spiel: seins, punkte: wert });
        }
      });
    });
    uebernehmen.sort(function (a, b) { return b.punkte - a.punkte || (a.km || 999) - (b.km || 999); });
    tausch.sort(function (a, b) { return b.punkte - a.punkte; });
    return { uebernehmen: uebernehmen, tausch: tausch };
  }

  function anfrageText(spiel, ich, kandidat, seinSpiel) {
    var d = new Date(spiel.beginn);
    var text = "Hallo " + vorname(kandidat.name) + ", könntest du am " + datumKurz(d) + " um " + uhr(d) + " Uhr das Spiel " +
      (spiel.liga ? spiel.liga + " " : "") + spiel.paarung + (spiel.ort ? " (" + spiel.ort + ")" : "") + " für mich übernehmen?";
    if (seinSpiel) {
      text += " Ich würde dafür dein Spiel um " + uhr(new Date(seinSpiel.beginn)) + " Uhr (" + (seinSpiel.liga ? seinSpiel.liga + " " : "") + seinSpiel.paarung + ") übernehmen.";
    }
    return text + " Treffpunkt wäre " + uhr(new Date(spiel.treffpunkt)) + " Uhr. Danke, " + vorname(ich.name);
  }
  function anfragen(text) {
    if (navigator.share) navigator.share({ text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { alert("Anfrage kopiert, jetzt in WhatsApp einfügen."); });
    else prompt("Anfrage:", text);
  }
  function kandidatZeile(k, spiel, ich, seinSpiel) {
    var z = document.createElement("div"); z.className = "kandidat";
    var kopf = document.createElement("div"); kopf.className = "kandidat-kopf";
    kopf.appendChild(chip({ name: k.person.name, slug: k.person.slug }, false, k.gern ? "gern" : ""));
    var knopf = document.createElement("button"); knopf.type = "button"; knopf.className = "anfrage"; knopf.textContent = "Anfragen";
    knopf.addEventListener("click", function () { anfragen(anfrageText(spiel, ich, k.person, seinSpiel)); });
    kopf.appendChild(knopf); z.appendChild(kopf);
    var info = document.createElement("div"); info.className = "meta";
    info.textContent = seinSpiel
      ? "sein Spiel: " + uhr(new Date(seinSpiel.beginn)) + " Uhr · " + (seinSpiel.liga ? seinSpiel.liga + " " : "") + seinSpiel.paarung + (seinSpiel.halle ? " · " + seinSpiel.halle : "")
      : (k.gruende.join(" · ") || "zeitlich möglich");
    z.appendChild(info);
    return z;
  }

  function tauschBereich(spiel, ich) {
    var box = document.createElement("details"); box.className = "tausch";
    var kopf = document.createElement("summary"); kopf.textContent = "Tauschoptionen"; box.appendChild(kopf);
    var inhalt = document.createElement("div"); box.appendChild(inhalt);
    box.addEventListener("toggle", function () {
      if (!box.open || inhalt.childNodes.length) return;
      var lade = document.createElement("p"); lade.className = "meta"; lade.textContent = "Prüfe Anmeldung …"; inhalt.appendChild(lade);
      ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
        .then(function (st) {
          inhalt.innerHTML = "";
          if (!st.eingerichtet) { inhalt.appendChild(leerZustand("Tauschoptionen gibt es im Mitgliederbereich, der ist noch nicht eingerichtet.")); return; }
          if (!st.session) {
            var p1 = document.createElement("p"); p1.className = "meta";
            p1.appendChild(document.createTextNode("Tauschoptionen gibt es nur angemeldet. "));
            var a = document.createElement("a"); a.href = "#mitglieder"; a.textContent = "Zum Mitgliederbereich"; p1.appendChild(a);
            inhalt.appendChild(p1); return;
          }
          return window.Mitglieder.sperrenAm(spiel.beginn).then(function (sperren) { tauschRendern(spiel, ich, inhalt, sperren || {}); });
        })
        .catch(function (e) { inhalt.textContent = "Nicht verfügbar: " + (e.message || e); });
    });
    return box;
  }

  function tauschRendern(spiel, ich, inhalt, sperren) {
    var o = tauschOptionen(spiel, ich, sperren);
    var zeigen = 6;

    var gruppe = document.createElement("button"); gruppe.type = "button"; gruppe.className = "anfrage zweit gruppe-anfrage";
    gruppe.appendChild(ikone("i-users")); gruppe.appendChild(document.createTextNode("In der Gruppe fragen (Text teilen)"));
    gruppe.addEventListener("click", function () {
      var d = new Date(spiel.beginn);
      anfragen("Hallo zusammen, ich suche Ersatz für " + datumKurz(d) + " " + uhr(d) + " Uhr: " + (spiel.liga ? spiel.liga + " " : "") + spiel.paarung +
        (spiel.halle ? " in " + spiel.halle : "") + " (" + (spiel.rolle || "SR") + ", Treffpunkt " + uhr(new Date(spiel.treffpunkt)) + " Uhr). Wer kann? Danke, " + vorname(ich.name));
    });
    inhalt.appendChild(gruppe);
    var suche = document.createElement("button"); suche.type = "button"; suche.className = "anfrage zweit";
    suche.appendChild(ikone("i-swap")); suche.appendChild(document.createTextNode("Ersatz in der Tauschbörse suchen"));
    suche.addEventListener("click", function () {
      suche.disabled = true;
      window.Mitglieder.gesuchAnlegen(spiel, ich).then(function (ok) {
        suche.textContent = ok ? "In der Tauschbörse eingestellt ✓" : "Konnte nicht eingestellt werden";
      });
    });
    inhalt.appendChild(suche);

    var h1 = document.createElement("h4"); h1.textContent = "Könnten übernehmen"; inhalt.appendChild(h1);
    if (!o.uebernehmen.length) inhalt.appendChild(leerZustand("Niemand im Datenfenster, der frei wäre."));
    o.uebernehmen.slice(0, zeigen).forEach(function (k) { inhalt.appendChild(kandidatZeile(k, spiel, ich)); });
    if (o.uebernehmen.length > zeigen) {
      var mehr = document.createElement("button"); mehr.type = "button"; mehr.className = "textknopf"; mehr.textContent = "alle " + o.uebernehmen.length + " anzeigen";
      mehr.addEventListener("click", function () { o.uebernehmen.slice(zeigen).forEach(function (k) { inhalt.insertBefore(kandidatZeile(k, spiel, ich), mehr); }); mehr.remove(); });
      inhalt.appendChild(mehr);
    }
    var h2 = document.createElement("h4"); h2.textContent = "Tausch am selben Tag"; inhalt.appendChild(h2);
    if (!o.tausch.length) inhalt.appendChild(leerZustand("Kein Kollege mit einem tauschbaren Spiel an diesem Tag."));
    o.tausch.slice(0, zeigen).forEach(function (k) { inhalt.appendChild(kandidatZeile(k, spiel, ich, k.spiel)); });
    if (o.tausch.length > zeigen) {
      var mehr2 = document.createElement("button"); mehr2.type = "button"; mehr2.className = "textknopf"; mehr2.textContent = "alle " + o.tausch.length + " anzeigen";
      mehr2.addEventListener("click", function () { o.tausch.slice(zeigen).forEach(function (k) { inhalt.insertBefore(kandidatZeile(k, spiel, ich, k.spiel), mehr2); }); mehr2.remove(); });
      inhalt.appendChild(mehr2);
    }
    var fuss = document.createElement("p"); fuss.className = "meta";
    fuss.textContent = "Vorschläge aus den Einteilungen der letzten 30 Tage und der kommenden Spiele, abzüglich Kollegen, die sich für den Tag abgemeldet haben. Urlaub und Lizenz kennt die Liste nicht, fragen musst du selbst.";
    inhalt.appendChild(fuss);
  }

  // ----------------------------------------------------------- Spielplan

  function tagTitel(d) {
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    var tag = new Date(d); tag.setHours(0, 0, 0, 0);
    var diff = Math.round((tag - heute) / 86400000);
    var datum = wochentag[d.getDay()] + ". " + d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    if (diff === 0) return ["Heute", datum, true];
    if (diff === 1) return ["Morgen", datum, false];
    if (diff === -1) return ["Gestern", datum, false];
    return [datum, "", false];
  }
  function istMeins(s) { return !!(profil && profil.slug && s.besetzung && s.besetzung.some(function (b) { return b.slug === profil.slug; })); }
  function planModus() { var m = lesen("plan-modus"); return m === "liste" || m === "monat" || m === "woche" ? m : (lesen("plan-kompakt") === "1" ? "liste" : "karten"); }
  var schnellWahl = null, planWocheStart = null;
  function schnellAnzeigen() {
    Array.prototype.forEach.call(el("plan-schnell").querySelectorAll(".chip"), function (c) { c.classList.toggle("aktiv", c.getAttribute("data-schnell") === schnellWahl); });
  }

  // Wochenansicht: sieben Tage, jeder Tag ein Block (Desktop: Spalten)
  function zeigeWochenansicht() {
    var ziel = el("plan-wochenansicht"); ziel.innerHTML = ""; ziel.classList.remove("versteckt");
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    if (!planWocheStart) { var mo = new Date(heute); mo.setDate(heute.getDate() - ((heute.getDay() + 6) % 7)); planWocheStart = mo; }
    var start = planWocheStart, ende = new Date(start.getTime() + 7 * 86400000);
    var spiele = planGefiltert(true).filter(function (s) { var d = new Date(s.beginn); return d >= start && d < ende; });
    var kopf = document.createElement("div"); kopf.className = "wochenansicht-kopf";
    var z = document.createElement("button"); z.type = "button"; z.className = "rund"; z.textContent = "‹"; z.setAttribute("aria-label", "Vorwoche");
    var t = document.createElement("b"); t.textContent = "KW " + kalenderwoche(start) + " · " + start.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " bis " + new Date(ende.getTime() - 86400000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
    var v = document.createElement("button"); v.type = "button"; v.className = "rund"; v.textContent = "›"; v.setAttribute("aria-label", "Nächste Woche");
    z.addEventListener("click", function () { planWocheStart = new Date(start.getTime() - 7 * 86400000); zeigeWochenansicht(); });
    v.addEventListener("click", function () { planWocheStart = new Date(start.getTime() + 7 * 86400000); zeigeWochenansicht(); });
    kopf.appendChild(z); kopf.appendChild(t); kopf.appendChild(v); ziel.appendChild(kopf);
    var raster = document.createElement("div"); raster.className = "wochenansicht";
    for (var i = 0; i < 7; i++) {
      (function (i) {
        var d = new Date(start.getTime() + i * 86400000), key = d.toDateString();
        var liste = spiele.filter(function (s) { return new Date(s.beginn).toDateString() === key; });
        var box = document.createElement("div"); box.className = "karte wtag" + (key === heute.toDateString() ? " heute" : "");
        var tk = document.createElement("div"); tk.className = "tagkopf";
        var l = document.createElement("span"); l.textContent = wochentag[d.getDay()] + " " + d.getDate() + ".";
        var r = document.createElement("span"); r.textContent = liste.length ? liste.length + (liste.length === 1 ? " Spiel" : " Spiele") : "";
        tk.appendChild(l); tk.appendChild(r); box.appendChild(tk);
        if (!liste.length) { var le = document.createElement("div"); le.className = "leerzeile"; le.textContent = "·"; box.appendChild(le); }
        liste.forEach(function (s) { box.appendChild(planZeile(s, new Date(s.beginn))); });
        raster.appendChild(box);
      })(i);
    }
    ziel.appendChild(raster);
    el("plan-zaehler").textContent = spiele.length + (spiele.length === 1 ? " Spiel" : " Spiele");
  }
  function kalenderwoche(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var tag = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - tag); var jahr = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - jahr) / 86400000 + 1) / 7);
  }
  var ligenWahl = {}, planMonatStart = null, planTag = null;
  function ligaGruppe(liga) {
    var L = (liga || "").toUpperCase().trim();
    var u = L.match(/^U\s?(\d+)/); if (u) return "U" + u[1];
    if (/FRAUEN|DAMEN|DEFL|DFEL/.test(L)) return "Frauen";
    var t = L.split(/[\s:]+/)[0]; return t || "?";
  }
  // Ligen stehen nur noch im Filter-Blatt: eine Reihe Chips mit Anzahl, davor
  // "Alle" zum Zuruecksetzen. Gezaehlt wird ueber alle Spiele des Zeitraums,
  // nicht ueber die schon gefilterten - sonst verschwinden die Zahlen.
  function zeigeLigen(spiele) {
    var ziel = el("plan-ligen"); if (!ziel) return;
    var zaehler = {};
    spiele.forEach(function (s) { var g = ligaGruppe(s.liga); zaehler[g] = (zaehler[g] || 0) + 1; });
    Object.keys(ligenWahl).forEach(function (g) { if (!zaehler[g]) zaehler[g] = 0; });
    var gruppen = Object.keys(zaehler).sort(function (a, b) {
      var ua = /^U\d+$/.test(a), ub = /^U\d+$/.test(b);
      if (ua && ub) return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);
      if (ua !== ub) return ua ? 1 : -1;
      return a.localeCompare(b);
    });
    ziel.innerHTML = "";
    var titel = el("plan-ligen-titel");
    if (gruppen.length < 2) { ziel.classList.add("versteckt"); if (titel) titel.classList.add("versteckt"); return; }
    ziel.classList.remove("versteckt"); if (titel) titel.classList.remove("versteckt");
    // Name und Anzahl klar getrennt: die Zahl sitzt in einer eigenen Blase
    function ligaChip(name, zahl, aktiv, fn, farbe) {
      var c = document.createElement("span"); c.className = "chip liga-chip" + (aktiv ? " aktiv" : "");
      var t = document.createElement("span"); t.className = "liga-name"; t.textContent = name; c.appendChild(t);
      var z = document.createElement("i"); z.className = "liga-zahl"; z.textContent = zahl; c.appendChild(z);
      if (farbe) c.style.borderLeftColor = farbe;
      c.addEventListener("click", fn);
      return c;
    }
    ziel.appendChild(ligaChip("Alle", spiele.length, !Object.keys(ligenWahl).length, function () { ligenWahl = {}; zeigePlan(); }));
    gruppen.forEach(function (g) {
      var lf = ligaFarbe(g);
      ziel.appendChild(ligaChip(g, zaehler[g], !!ligenWahl[g], function () {
        if (ligenWahl[g]) delete ligenWahl[g]; else ligenWahl[g] = 1; zeigePlan();
      }, lf && lf.punkt));
    });
  }
  // ohneLigen: fuer die Zahlen an den Liga-Chips - sie sollen zeigen, was die
  // uebrigen Filter uebrig lassen, nicht was nach der Ligawahl bleibt.
  function planGefiltert(fuerMonat, ohneLigen) {
    var f = ohneZeichen(el("plan-filter").value);
    var mitVergangenen = el("plan-vergangene").checked || fuerMonat;
    var nurOffen = el("plan-offen").checked;
    var hallen = meineHallen();
    var nurMeine = hallen && el("plan-hallen").checked;
    var nurIch = profil && profil.slug && el("plan-meine").checked;
    var ligen = !ohneLigen && Object.keys(ligenWahl).length ? ligenWahl : null;
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    var wochenende = null;
    if (schnellWahl === "wochenende") {
      // Freitag bis Sonntag der laufenden Woche; ab Montag das kommende
      var tag = heute.getDay(), bisFreitag = (5 - tag + 7) % 7;
      var fr = new Date(heute.getTime() + (tag >= 5 || tag === 0 ? (tag === 0 ? -2 : 5 - tag) : bisFreitag) * 86400000);
      wochenende = [fr, new Date(fr.getTime() + 3 * 86400000)];
    }
    return (daten.spiele || []).filter(function (s) {
      if (s.vergangen && !mitVergangenen) return false;
      var d = new Date(s.beginn);
      if (schnellWahl === "wochenende" && (d < wochenende[0] || d >= wochenende[1])) return false;
      if (schnellWahl === "woche" && (d < heute || d >= new Date(heute.getTime() + 7 * 86400000))) return false;
      if (schnellWahl === "abends" && d.getHours() < 18) return false;
      if (schnellWahl === "frueh" && d.getHours() >= 13) return false;
      if (nurMeine && hallen.indexOf(s.halle) < 0) return false;
      if (nurIch && !istMeins(s)) return false;
      if (nurOffen && s.besetzung.length) return false;
      if (ligen && !ligen[ligaGruppe(s.liga)]) return false;
      if (f) {
        var text = suchtextVon([s.paarung, s.liga, s.halle].concat(s.besetzung.map(function (b) { return b.name; })).join(" "));
        if (text.indexOf(f) === -1) return false;
      }
      return true;
    });
  }
  // Naechste 14 Tage als Leiste zum Springen
  function zeigeWoche() {
    var ziel = el("plan-woche"); ziel.innerHTML = ""; ziel.classList.remove("versteckt");
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    var jeTag = {};
    (daten.spiele || []).forEach(function (sp) { var k = new Date(sp.beginn).toDateString(); (jeTag[k] = jeTag[k] || []).push(sp); });
    for (var i = 0; i < 14; i++) {
      (function (i) {
        var d = new Date(heute.getTime() + i * 86400000), key = d.toDateString(), liste = jeTag[key] || [];
        var b = document.createElement("button"); b.type = "button"; b.className = i === 0 ? "heute" : "";
        var wt = document.createElement("span"); wt.textContent = wochentag[d.getDay()];
        var nr = document.createElement("b"); nr.textContent = d.getDate();
        var punkt = document.createElement("i");
        if (!liste.length) punkt.className = "keins";
        else if (profil && liste.some(function (sp) { return sp.besetzung.some(function (x) { return x.slug === profil.slug; }); })) punkt.className = "ich";
        b.appendChild(wt); b.appendChild(nr); b.appendChild(punkt);
        b.title = liste.length ? liste.length + " Spiele" : "keine Spiele";
        b.addEventListener("click", function () {
          var h = el("plan-liste").querySelector('[data-tag="' + key + '"]');
          if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--filter-hoehe")) || 110) - 4, behavior: "smooth" });
          else toast("An dem Tag steht nichts im Plan.", "");
        });
        ziel.appendChild(b);
      })(i);
    }
  }

  function zeigeMonat() {
    var ziel = el("plan-monat"); ziel.innerHTML = "";
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    if (!planMonatStart) planMonatStart = new Date(heute.getFullYear(), heute.getMonth(), 1);
    var start = planMonatStart, ende = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    var spiele = planGefiltert(true), jeTag = {};
    spiele.forEach(function (s) { var k = new Date(s.beginn).toDateString(); (jeTag[k] = jeTag[k] || []).push(s); });

    var kopf = document.createElement("div"); kopf.className = "monat-kopf";
    var zurueck = document.createElement("button"); zurueck.type = "button"; zurueck.className = "rund"; zurueck.textContent = "‹"; zurueck.setAttribute("aria-label", "Vormonat");
    var titel = document.createElement("b"); titel.textContent = start.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    var vor = document.createElement("button"); vor.type = "button"; vor.className = "rund"; vor.textContent = "›"; vor.setAttribute("aria-label", "Nächster Monat");
    zurueck.addEventListener("click", function () { planMonatStart = new Date(start.getFullYear(), start.getMonth() - 1, 1); planTag = null; zeigeMonat(); });
    vor.addEventListener("click", function () { planMonatStart = new Date(start.getFullYear(), start.getMonth() + 1, 1); planTag = null; zeigeMonat(); });
    kopf.appendChild(zurueck); kopf.appendChild(titel); kopf.appendChild(vor); ziel.appendChild(kopf);

    var raster = document.createElement("div"); raster.className = "monat";
    ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach(function (w) { var e = document.createElement("div"); e.className = "wt"; e.textContent = w; raster.appendChild(e); });
    var leer = (start.getDay() + 6) % 7;
    for (var i = 0; i < leer; i++) { var z0 = document.createElement("div"); z0.className = "zelle leer"; raster.appendChild(z0); }
    var imMonat = 0;
    for (var tag = 1; tag <= ende.getDate(); tag++) {
      (function (tag) {
        var d = new Date(start.getFullYear(), start.getMonth(), tag), key = d.toDateString(), liste = jeTag[key] || [];
        imMonat += liste.length;
        var z = document.createElement("div");
        z.className = "zelle" + (d < heute ? " war" : "") + (key === heute.toDateString() ? " heute" : "") + (planTag === key ? " gewaehlt" : "");
        var nr = document.createElement("span"); nr.textContent = tag; z.appendChild(nr);
        if (liste.length) {
          var p = document.createElement("div"); p.className = "punkte";
          var ich = profil && liste.some(function (s) { return s.besetzung.some(function (b) { return b.slug === profil.slug; }); });
          var offen = liste.some(function (s) { return !s.besetzung.length; });
          liste.slice(0, 4).forEach(function (sp) {
            var i1 = document.createElement("i"); i1.style.background = ligaFarbe(sp.liga).punkt;
            if (profil && sp.besetzung.some(function (b) { return b.slug === profil.slug; })) i1.style.boxShadow = "0 0 0 2px var(--akzent)";
            else if (!sp.besetzung.length) i1.style.boxShadow = "0 0 0 2px var(--warn)";
            p.appendChild(i1);
          });
          void ich; void offen;
          z.appendChild(p);
          var n = document.createElement("small"); n.textContent = liste.length; z.appendChild(n);
          z.addEventListener("click", function () { planTag = planTag === key ? null : key; zeigeMonat(); });
        }
        raster.appendChild(z);
      })(tag);
    }
    ziel.appendChild(raster);
    el("plan-zaehler").textContent = imMonat + (imMonat === 1 ? " Spiel" : " Spiele");

    if (planTag && jeTag[planTag]) {
      var box = document.createElement("div"); box.className = "monat-tag";
      var t = tagTitel(new Date(planTag));
      var h = document.createElement("div"); h.className = "tag" + (t[2] ? " heute" : "");
      var l1 = document.createElement("span"); l1.textContent = t[0]; var r1 = document.createElement("span"); r1.textContent = t[1];
      h.appendChild(l1); h.appendChild(r1); box.appendChild(h);
      jeTag[planTag].forEach(function (s) { box.appendChild(planKarte(s, new Date(s.beginn))); });
      ziel.appendChild(box);
    }
  }
  function meineHallen() {
    var p = profil && personMit(profil.slug);
    if (!p || !p.statistik || !p.statistik.hallen) return null;
    return p.statistik.hallen.map(function (h) { return h[0]; });
  }

  function filterMerken() {
    try { sessionStorage.setItem("plan-filter", JSON.stringify({ v: el("plan-vergangene").checked, o: el("plan-offen").checked, h: el("plan-hallen").checked, m: el("plan-meine").checked, l: ligenWahl, s: el("plan-filter").value })); } catch (e) {}
  }
  function filterLaden() {
    try {
      var f = JSON.parse(sessionStorage.getItem("plan-filter") || "null");
      if (!f) { el("plan-meine").checked = !!(profil && profil.slug && lesen("plan-meine-aus") !== "1"); return; }
      el("plan-vergangene").checked = !!f.v; el("plan-offen").checked = !!f.o; el("plan-hallen").checked = !!f.h; el("plan-meine").checked = !!f.m;
      ligenWahl = f.l || {}; el("plan-filter").value = f.s || "";
    } catch (e) {}
  }
  function filterAktiv() {
    filterMerken();
    var n = 0;
    ["plan-vergangene", "plan-offen", "plan-hallen", "plan-meine"].forEach(function (id) { if (el(id).checked && !el(id).parentNode.classList.contains("versteckt")) n++; });
    n += Object.keys(ligenWahl).length + (schnellWahl ? 1 : 0);
    var z = el("plan-filter-zahl"); z.textContent = n; z.classList.toggle("versteckt", !n);
    el("plan-filter-knopf").classList.toggle("aktiv", n > 0);
    return n;
  }
  // Neue Aenderungen als Zahl am Knopf im Spielplan - dort steht jetzt,
  // was frueher einen eigenen Platz in der Leiste hatte.
  function aenderungenKnopf() {
    var k = el("plan-aenderungen"); if (!k) return;
    k.classList.toggle("versteckt", gesperrtFuerMich("#aenderungen"));
    var z = el("plan-aend-zahl"); if (!z || !sitzungVorhanden()) return;
    hole("protokoll.json").then(function (pl) {
      var gesehen = parseInt(lesen("aenderungen-gesehen") || "0", 10) || 0;
      var frisch = (pl || []).filter(function (e) {
        if (!e.stand || new Date(e.stand).getTime() <= gesehen) return false;
        return !(profil && profil.slug) || e.slug === profil.slug;
      }).length;
      z.textContent = frisch > 9 ? "9+" : String(frisch);
      z.classList.toggle("versteckt", !frisch);
    }).catch(function () {});
  }

  function zeigePlan() {
    filterAktiv();
    aenderungenKnopf();
    var modus = planModus();
    Array.prototype.forEach.call(el("plan-modus").querySelectorAll("button"), function (b) { b.classList.toggle("aktiv", b.getAttribute("data-modus") === modus); });
    el("plan-hallen-label").classList.toggle("versteckt", !meineHallen());
    el("plan-meine-label").classList.toggle("versteckt", !(profil && profil.slug));
    zeigeLigen(planGefiltert(planModus() === "monat", true));
    filterHoehe();
    var ziel = el("plan-liste");
    ziel.innerHTML = "";
    schnellAnzeigen();
    el("plan-monat").classList.toggle("versteckt", modus !== "monat");
    el("plan-wochenansicht").classList.toggle("versteckt", modus !== "woche");
    el("plan-vergangene").parentNode.classList.toggle("versteckt", modus === "monat" || modus === "woche");
    el("plan-heute").classList.toggle("versteckt", modus === "monat" || modus === "woche");
    if (modus === "monat") { el("plan-woche").classList.add("versteckt"); zeigeMonat(); return; }
    if (modus === "woche") { el("plan-woche").classList.add("versteckt"); zeigeWochenansicht(); return; }
    zeigeWoche();
    var kompakt = modus === "liste";
    ziel.classList.toggle("raster", !kompakt);
    var f = ohneZeichen(el("plan-filter").value);
    var letzterTag = null, treffer = 0, heuteGesetzt = false;
    var spiele = planGefiltert(false), gesamt = (daten.spiele || []).filter(function (s) { return !s.vergangen || el("plan-vergangene").checked; }).length;

    spiele.forEach(function (s) {
      treffer++;
      var beginn = new Date(s.beginn), tagKey = beginn.toDateString();
      if (tagKey !== letzterTag) {
        letzterTag = tagKey;
        var t = tagTitel(beginn);
        var h = document.createElement("div"); h.className = "tag" + (t[2] ? " heute" : "");
        if (!heuteGesetzt && beginn >= new Date(new Date().setHours(0, 0, 0, 0))) { h.id = "plan-ab-heute"; heuteGesetzt = true; }
        h.setAttribute("data-tag", tagKey);
        var links = document.createElement("span"); links.textContent = t[0];
        var rechts = document.createElement("span"); rechts.textContent = t[1];
        h.appendChild(links); h.appendChild(rechts); ziel.appendChild(h);
      }
      ziel.appendChild(kompakt ? planZeile(s, beginn) : planKarte(s, beginn));
    });
    el("plan-zaehler").textContent = treffer !== gesamt ? treffer + " von " + gesamt + " Spielen" : gesamt + (gesamt === 1 ? " Spiel" : " Spiele");
    var fk = el("plan-filter-fertig");
    if (fk) fk.textContent = "Fertig \u00b7 " + treffer + (treffer === 1 ? " Spiel" : " Spiele") + " zeigen";
    if (!treffer) ziel.appendChild(leerZustand(f || treffer !== gesamt ? "Nichts gefunden." : "Keine kommenden Spiele."));
  }
  function besetzungOder(s, ziel) {
    if (s.besetzung.length) s.besetzung.forEach(function (b) { ziel.appendChild(chip(b, s.system >= 3)); });
    else { var offen = document.createElement("span"); offen.className = "chip offen"; offen.textContent = "noch nicht besetzt"; ziel.appendChild(offen); }
  }
  function planKarte(s, beginn) {
    var d = document.createElement("div"); d.className = "spiel karte" + (s.vergangen ? " war" : "") + (istMeins(s) ? " meins" : "");
    var kopf = document.createElement("div"); kopf.className = "kopfzeile";
    var zeit = document.createElement("span"); zeit.className = "zeit"; zeit.textContent = uhr(beginn) + " Uhr"; kopf.appendChild(zeit);
    kopf.appendChild(teilenKnopf(s));
    if (s.liga) kopf.appendChild(ligaPille(s.liga));
    d.appendChild(kopf);
    var paarung = document.createElement("div"); paarung.className = "paarung"; paarung.textContent = s.paarung; d.appendChild(paarung);
    var wo = document.createElement("span"); wo.appendChild(hallenLink(s.halle));
    wo.appendChild(document.createTextNode(" · Treffpunkt " + uhr(new Date(s.treffpunkt)) + " Uhr" + (s.system >= 3 ? " · " + s.system + "er-System" : "")));
    d.appendChild(mitIkone("i-pin", wo));
    var chips = document.createElement("div"); chips.className = "chips"; besetzungOder(s, chips); d.appendChild(chips);
    d.classList.add("tippbar");
    d.addEventListener("click", function (ev) { if (ev.target.closest("a, button")) return; location.hash = "spiel/" + encodeURIComponent(kennungVon(s)); });
    return d;
  }
  function planZeile(s, beginn) {
    var z = document.createElement("div"); z.className = "zeile" + (s.vergangen ? " war" : "") + (istMeins(s) ? " meins" : "");
    var zeit = document.createElement("span"); zeit.className = "zeit"; zeit.textContent = uhr(beginn);
    var mitte = document.createElement("span");
    var titel = document.createElement("span"); titel.textContent = (s.liga ? s.liga + ": " : "") + s.paarung;
    var klein = document.createElement("small"); klein.appendChild(hallenLink(s.halle));
    mitte.appendChild(titel); mitte.appendChild(klein);
    var wer = document.createElement("span"); wer.className = "zeile-wer"; besetzungOder(s, wer);
    z.appendChild(zeit); z.appendChild(mitte); z.appendChild(wer);
    return z;
  }

  // ---------------------------------------------------- Statistik/Saison

  var archivDaten = null;
  function balken(titel, eintraege) {
    if (!eintraege || !eintraege.length) return null;
    var hoechste = eintraege[0][1] || 1;
    var box = document.createElement("div"); box.className = "balken karte";
    var h = document.createElement("h4"); h.textContent = titel; box.appendChild(h);
    eintraege.forEach(function (paar) {
      var reihe = document.createElement("div"); reihe.className = "reihe";
      var links = document.createElement("div"); links.textContent = paar[0];
      var strich = document.createElement("i"); strich.style.width = Math.max(6, Math.round(paar[1] / hoechste * 100)) + "%"; links.appendChild(strich);
      var rechts = document.createElement("em"); rechts.textContent = paar[1] + "×";
      reihe.appendChild(links); reihe.appendChild(rechts); box.appendChild(reihe);
    });
    return box;
  }
  // Die Wochentage kommen als sieben Zahlen ab Montag. Anders als die
  // uebrigen Balken zaehlen sie ueber alle Saisons - an welchen Tagen
  // jemand pfeift, zeigt sich erst nach ein paar Jahren.
  function wochentagBalken(zahlen) {
    if (!zahlen || !zahlen.length || !zahlen.some(function (n) { return n; })) return null;
    var NAMEN = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
    var paare = zahlen.map(function (n, i) { return [NAMEN[i], n]; })
      .filter(function (p2) { return p2[1]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    return balken("Wochentage", paare);
  }

  function zeigeStatistik(p) {
    var ziel = el("statistik"); ziel.innerHTML = "";
    var s = p.statistik; if (!s) return;
    var h = document.createElement("h3"); h.className = "abschnitt"; h.textContent = "Statistik";
    var hs2 = document.createElement("small"); hs2.textContent = "aus dem Archiv, seit " + (s.erste || "?").split("-").reverse().join("."); h.appendChild(hs2); ziel.appendChild(h);
    saisonziel(p, ziel);
    var zahlen = document.createElement("div"); zahlen.className = "zahlen";
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    var inSieben = p.spiele.filter(function (x) { var d = new Date(x.beginn); return d >= heute && d < new Date(heute.getTime() + 7 * 86400000); }).length;
    [["in 7 Tagen", inSieben], ["Saison " + (daten.saison || ""), s.saison], ["Insgesamt", s.gesamt], ["als HSR", (s.rollen && s.rollen["HSR"]) || 0]].forEach(function (paar) {
      var k = document.createElement("div"); k.className = "zahl karte";
      var b = document.createElement("b"); b.textContent = paar[1]; var t = document.createElement("span"); t.textContent = paar[0];
      k.appendChild(b); k.appendChild(t); zahlen.appendChild(k);
    });
    ziel.appendChild(zahlen);
    [balken("Meiste Ligen", s.ligen), balken("Meiste Hallen", s.hallen), balken("Meiste Gespannpartner", s.partner),
     s.je_saison && s.je_saison.length > 1 ? balken("Spiele je Saison", s.je_saison.slice().reverse()) : null,
     wochentagBalken(s.wochentage)
    ].forEach(function (b) { if (b) ziel.appendChild(b); });
    var hsr = (s.rollen && s.rollen.HSR) || 0, lsr = (s.rollen && s.rollen.LSR) || 0;
    if (hsr + lsr) {
      var q = document.createElement("p"); q.className = "meta"; q.style.marginTop = "10px";
      q.textContent = "Im 3er/4er-System: " + Math.round(hsr / (hsr + lsr) * 100) + " % als HSR (" + hsr + " von " + (hsr + lsr) + ").";
      ziel.appendChild(q);
    }
    var fuss = document.createElement("p"); fuss.className = "meta"; fuss.style.marginTop = "10px";
    fuss.textContent = "Gezählt seit " + (s.erste || "?").split("-").reverse().join(".") + ". Das Archiv wächst mit jedem Lauf, esrw.de selbst zeigt nur wenige Tage.";
    ziel.appendChild(fuss);
    if (s.gesamt) {
      var rk = document.createElement("button"); rk.type = "button"; rk.className = "mg-neben rueckblick-knopf"; rk.style.width = "100%";
      rk.className = "knopf-zeichen"; rk.appendChild(ikone("i-teilen")); rk.appendChild(document.createTextNode("Meine Saison als Bild teilen"));
      rk.addEventListener("click", function () { rueckblickBild(p, rk); });
      ziel.appendChild(rk);
    }
  }

  // Zeichnet die Saison auf eine Leinwand (1080x1350) und teilt sie als PNG
  function rueckblickBild(p, knopf) {
    var s = p.statistik, c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
    var x = c.getContext("2d");
    var g = x.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, "#0c0d10"); g.addColorStop(1, "#33353d");
    x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    x.fillStyle = "#e30613"; x.fillRect(0, 0, 18, 1350);
    // Logo oben rechts, wenn es geladen ist
    try { var lg = document.querySelector(".marke .logo"); if (lg && lg.complete && lg.naturalWidth) { x.save(); x.beginPath(); x.roundRect(900, 60, 120, 120, 26); x.clip(); x.drawImage(lg, 900, 60, 120, 120); x.restore(); } } catch (e) {}
    // Puck als Deko
    x.fillStyle = "rgba(0,0,0,.25)"; x.beginPath(); x.ellipse(900, 1180, 150, 55, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#15161a"; x.fillRect(750, 1100, 300, 80); x.beginPath(); x.ellipse(900, 1180, 150, 55, 0, 0, Math.PI); x.fill();
    x.fillStyle = "#2c2e34"; x.beginPath(); x.ellipse(900, 1100, 150, 55, 0, 0, Math.PI * 2); x.fill();
    var schrift = "Manrope, -apple-system, Segoe UI, Roboto, sans-serif";
    x.fillStyle = "rgba(255,255,255,.75)"; x.font = "700 34px " + schrift; x.fillText("SAISON " + (daten.saison || "").toUpperCase(), 80, 120);
    x.fillStyle = "#fff"; x.font = "800 64px " + schrift; x.fillText(p.name.split(",").reverse().join(" ").trim(), 80, 200);
    x.font = "500 32px " + schrift; x.fillStyle = "rgba(255,255,255,.8)"; x.fillText("Schiedsrichter · ESRW", 80, 250);
    function kachel(cx, cy, wert, label) {
      x.fillStyle = "rgba(255,255,255,.12)"; x.beginPath(); x.roundRect(cx, cy, 440, 200, 28); x.fill();
      x.fillStyle = "#fff"; x.font = "800 84px " + schrift; x.fillText(String(wert), cx + 32, cy + 110);
      x.fillStyle = "rgba(255,255,255,.75)"; x.font = "600 30px " + schrift; x.fillText(label, cx + 32, cy + 160);
    }
    var hsr = (s.rollen && s.rollen.HSR) || 0, lsr = (s.rollen && s.rollen.LSR) || 0;
    kachel(80, 320, s.saison, "Spiele diese Saison");
    kachel(560, 320, s.gesamt, "Spiele im Archiv");
    kachel(80, 550, hsr, "als Hauptschiedsrichter");
    kachel(560, 550, hsr + lsr ? Math.round(hsr / (hsr + lsr) * 100) + " %" : "?", "HSR-Anteil im 3er/4er");
    function zeile(y, titel, wert) {
      x.fillStyle = "rgba(255,255,255,.7)"; x.font = "600 28px " + schrift; x.fillText(titel, 80, y);
      x.fillStyle = "#fff"; x.font = "800 40px " + schrift; x.fillText(wert, 80, y + 50);
    }
    if (s.hallen && s.hallen[0]) zeile(850, "MEISTE HALLE", s.hallen[0][0] + " · " + s.hallen[0][1] + "×");
    if (s.ligen && s.ligen[0]) zeile(960, "MEISTE LIGA", s.ligen[0][0] + " · " + s.ligen[0][1] + "×");
    if (s.partner && s.partner[0]) zeile(1070, "MEISTER GESPANNPARTNER", s.partner[0][0].split(",").reverse().join(" ").trim() + " · " + s.partner[0][1] + "×");
    x.fillStyle = "rgba(255,255,255,.55)"; x.font = "500 26px " + schrift; x.fillText(basis.replace(/^https?:\/\//, ""), 80, 1290);
    c.toBlob(function (blob) {
      if (!blob) { toast("Bild konnte nicht erzeugt werden.", "warn"); return; }
      var datei = new File([blob], "meine-saison.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [datei] })) {
        navigator.share({ files: [datei], title: "Meine Saison" }).catch(function () {});
      } else {
        var alt = knopf.parentNode.querySelector(".rueckblick-bild"); if (alt) alt.remove();
        var img = document.createElement("img"); img.className = "rueckblick-bild"; img.src = URL.createObjectURL(blob); img.alt = "Saison-Rückblick";
        knopf.parentNode.appendChild(img);
        toast("Bild erzeugt, lange drücken zum Sichern.", "gut");
      }
    }, "image/png");
  }
  function zeigeSaison(p) {
    var box = el("saison"), liste = el("saison-liste"), s = p.statistik;
    if (!s || !s.gesamt) { box.classList.add("versteckt"); return; }
    box.classList.remove("versteckt"); box.open = false;
    el("saison-titel").textContent = "Alle " + s.gesamt + " Spiele im Archiv (filterbar unter Mehr → Archiv)";
    liste.innerHTML = "";
    function rendern(eintraege) {
      liste.innerHTML = "";
      var saison = null;
      eintraege.forEach(function (e) {
        if (e.saison !== saison) { saison = e.saison; var h = document.createElement("div"); h.className = "tag"; h.textContent = "Saison " + saison; liste.appendChild(h); }
        var d = new Date(e.beginn);
        var zeile = document.createElement("div"); zeile.className = "saisonzeile";
        var datum = document.createElement("span"); datum.textContent = datumKurz(d);
        var klein = document.createElement("small"); klein.textContent = uhr(d) + " Uhr"; datum.appendChild(klein);
        var text = document.createElement("span"); text.textContent = e.paarung;
        var halle = document.createElement("small"); halle.textContent = (e.liga ? e.liga + " · " : "") + (e.halle || ""); text.appendChild(halle);
        zeile.appendChild(datum); zeile.appendChild(rolleBadge(e.rolle)); zeile.appendChild(text); liste.appendChild(zeile);
      });
    }
    if (box._laden) box.removeEventListener("toggle", box._laden);
    box._laden = function laden() {
      if (!box.open) return;
      box.removeEventListener("toggle", laden); box._laden = null;
      (archivDaten ? Promise.resolve(archivDaten) : hole("archiv.json"))
        .then(function (a) {
          archivDaten = a;
          var eigene = ((a.personen && a.personen[p.slug]) || []).slice();
          var dateien = a.dateien || {};
          // Eingefrorene Saisons (docs/archiv/<saison>.json) dazuladen
          return Promise.all(Object.keys(dateien).map(function (sn) {
            return hole(dateien[sn]).then(function (d) {
              (d.spiele || []).forEach(function (z) { var ich = (z[4] || []).filter(function (b) { return b[1] === p.slug; })[0]; if (ich) eigene.push({ saison: sn, beginn: z[0], liga: z[1], paarung: z[2], halle: z[3], rolle: ich[2], system: z[4].length }); });
            }).catch(function () {});
          })).then(function () { eigene.sort(function (x, y) { return x.beginn < y.beginn ? 1 : -1; }); rendern(eigene); });
        })
        .catch(function () { liste.textContent = "Archiv konnte nicht geladen werden."; });
    };
    box.addEventListener("toggle", box._laden);
  }

  // ------------------------------------------------------------ Ansichten

  function zeigePerson(p, stillesNachladen) {
    aktuell = p;
    ansicht("detail");
    el("person").textContent = p.name;
    var pav = el("person-avatar");
    pav.textContent = initialen(p.name); pav.style.background = farbeFuer(p.slug);
    pav.setAttribute("data-slug", p.slug);
    pav.classList.remove("mit-bild"); pav.style.backgroundImage = "";
    bildAnwenden(pav, p.slug);
    avatarKopf();
    var meins = !!(profil && profil.slug === p.slug);
    el("detail").classList.toggle("start-ruhig", meins && startEinstellung("ruhig"));
    el("profil-hinweis").textContent = meins ? "dein Profil" : "fremdes Profil";
    // Mit Konto gehoert das Profil zum Konto - dann gibt es nichts zu wechseln
    el("uebernehmen").classList.toggle("versteckt", meins || kontoGebunden());
    el("uebernehmen").onclick = function () { profilSetzen(p); toast("„Start“ zeigt jetzt " + p.name, "gut"); };
    el("wechseln").classList.toggle("versteckt", !meins || kontoGebunden());
    var pz = el("detail").querySelector(".spalte-haupt > .profilzeile"), haupt = pz && pz.parentNode;
    if (haupt) { if (meins) haupt.insertBefore(pz, el("start-anpassen")); else haupt.insertBefore(pz, haupt.firstChild); }
    zeigeKollege(p, meins);
    pinKnopf(p); kalenderSpalte();
    // Die Adresse der Kalenderdatei haengt am Schluessel - erst ausrechnen
    feedBereit(p.slug).then(function () {
      el("abo").href = feedUrl(p.slug, "webcal:");
      el("laden").onclick = function () { location.href = feedUrl(p.slug, location.protocol); };
    });
    zeigeHeld(p);
    zeigeSchnellzugriff(p, meins);
    zeigeEinrichtung(p, meins);
    zeigeUebersicht(p);
    zeigeNachtrag(p);
    var ziel = el("spiele"); ziel.innerHTML = "";
    var kommend = p.spiele.filter(function (s) { return !s.vergangen; });
    var gewesen = p.spiele.filter(function (s) { return s.vergangen; }).reverse();
    var h = document.createElement("h3"); h.className = "abschnitt"; h.textContent = "Deine nächsten Spiele";
    var hs = document.createElement("small");
    hs.textContent = "Tipp für " + funktionsText([[null, "Route"], ["tausch", "Tausch"], ["notizen", "Notiz"], ["checkliste", "Checkliste"]]);
    h.appendChild(hs); ziel.appendChild(h);
    var istIch = !!(profil && profil.slug === p.slug);
    if (!kommend.length) {
      var zuletzt = p.statistik && p.statistik.letzte;
      ziel.appendChild(leerZustand(p.spiele.length || !zuletzt
        ? "Zurzeit keine Einteilung. Der Kalender füllt sich von allein."
        : "Zurzeit keine Einteilung, zuletzt im Einsatz am " + zuletzt.split("-").reverse().join(".") + ".",
        { label: "Spielplan ansehen", href: "#plan" }));
    }
    else kommend.forEach(function (s, i) { var k = karte(s, p); k.style.setProperty("--i", Math.min(i, 8)); ziel.appendChild(k); });
    // Die naechsten sieben Tage weiterschicken - steht bei den Spielen,
    // damit man es findet, wenn man gerade danach schaut.
    if (istIch && wocheText()) {
      var wz = document.createElement("p"); wz.className = "meta woche-teilen";
      var wk = document.createElement("button"); wk.type = "button"; wk.className = "textknopf";
      wk.className = "textknopf knopf-zeichen";
      wk.appendChild(ikone("i-teilen"));
      wk.appendChild(document.createTextNode(navigator.share ? " Woche teilen" : " Woche kopieren"));
      wk.addEventListener("click", wocheTeilen);
      wz.appendChild(wk); ziel.appendChild(wz);
    }
    if (gewesen.length && startEinstellung("vergangene")) {
      var box = document.createElement("details"); box.className = "karte zuletzt-box";
      var sum = document.createElement("summary"); sum.className = "abschnitt"; sum.textContent = "Vergangene Spiele (" + gewesen.length + ")"; box.appendChild(sum);
      box.addEventListener("toggle", function () {
        if (!box.open || box.childNodes.length !== 1) return;
        gewesen.forEach(function (s) { box.appendChild(karte(s)); });
        void istIch;
      });
      ziel.appendChild(box);
    }
    if (!profil || profil.slug !== p.slug) zuletztMerken(p.slug);
    zeigeMeldeKarte(); kalenderBoxStand(); onboardingStand(); zeigePins(p); startOrdnungAnwenden();
    el("kalender-box").classList.toggle("versteckt", !startEinstellung("kalender") && lesen("abo-geklickt") === "1");
    el("start-anpassen").classList.toggle("versteckt", !meins);
    el("abfahrt-ics").classList.add("versteckt");
    if (profil && profil.slug === p.slug && sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.heimat() : null; })
      .then(function (hm) { if (hm) el("abfahrt-ics").classList.remove("versteckt"); }).catch(function () {});
    if (profil && profil.slug === p.slug) pruefeNeue(p, false);
    if (!stillesNachladen && sprungZiel === null) window.scrollTo(0, 0);
  }

  // Der dritte Platz in der Leiste unten gehoert dem, was man wirklich
  // braucht - Tausch ist bei vielen aus. Auswahl steht in den Einstellungen
  // und wandert ueber das Konto mit.
  var TAB_ZIELE = [
    ["plan", "i-list", "Spielplan"],
    ["mitglieder/abrechnung", "i-euro", "Abrechnung", "abrechnung"],
    ["mitglieder/kollegen", "i-users", "Kollegen", "telefon"],
    ["mitglieder/tausch", "i-swap", "Tausch", "tausch"],
    ["aenderungen", "i-bell", "Änderungen", "aenderungen"],
    ["regeln", "i-buch", "Regeln", "regeln"],
    ["rechner", "i-rechner", "Strafrechner", "rechner"],
    ["archiv", "i-clock", "Archiv", "archiv"],
    ["mitfahren", "i-route", "Mitfahren", "mitfahren"],
    ["mitglieder/info", "i-info", "Info", "info"],
    ["mitglieder/frei", "i-cal", "Verfügbar", "frei"],
    ["statistik", "i-balken", "Statistik", "statistik"],
    ["karte", "i-pin", "Hallen", "hallen"],
    ["mitglieder/notizen", "i-note", "Notizen", "notizen"]
  ];
  // Die drei mittleren Plaetze belegt jeder selbst. "Start" und "Mehr"
  // bleiben, wo sie sind - sonst findet niemand mehr zurueck.
  var PLAETZE = [
    { knopf: "tab-plan", schluessel: "tab2", standard: "plan" },
    { knopf: "tab-tausch", schluessel: "tab3", standard: "" },
    { knopf: "tab-abrechnung", schluessel: "tab4", standard: "mitglieder/abrechnung" }
  ];
  function tabZiel(slug) {
    return TAB_ZIELE.filter(function (t) { return t[0] === slug; })[0] || null;
  }
  // Was auf dem freien Platz steht, wenn nichts gewaehlt ist
  function tabStandardDrei() {
    if (funktion("telefon")) return tabZiel("mitglieder/kollegen");
    if (funktion("tausch")) return tabZiel("mitglieder/tausch");
    if (funktion("aenderungen")) return tabZiel("aenderungen");
    return tabZiel("plan");
  }
  function tabFuerPlatz(p) {
    var w = lesen(p.schluessel);
    var gewaehlt = w && tabZiel(w);
    if (gewaehlt && (!gewaehlt[3] || funktion(gewaehlt[3])) && !gesperrtFuerMich(gewaehlt[0])) return gewaehlt;
    if (p.standard) {
      var std = tabZiel(p.standard);
      if (std && (!std[3] || funktion(std[3])) && !gesperrtFuerMich(std[0])) return std;
    }
    if (p.schluessel === "tab3") {
      var d = tabStandardDrei();
      if (d && !gesperrtFuerMich(d[0])) return d;
    }
    return null;
  }
  function tabDritter() { return tabFuerPlatz(PLAETZE[1]) || ["plan", "i-list", "Spielplan"]; }
  function tabsAnwenden() {
    PLAETZE.forEach(function (p) {
      var b = el(p.knopf); if (!b) return;
      var t = tabFuerPlatz(p);
      // Ohne Konto bleibt der Spielplan; der vierte Platz fuehrt zur Anmeldung
      if (!sitzungVorhanden()) {
        if (p.schluessel === "tab2") t = tabZiel("plan");
        else if (p.schluessel === "tab4") t = ["mitglieder", "i-lock", "Anmelden"];
        else t = null;
      }
      if (!t) { b.classList.add("versteckt"); b._ziel = ""; return; }
      b.classList.remove("versteckt");
      b._ziel = t[0];
      b.innerHTML = "";
      b.appendChild(ikone(t[1]));
      var lt = document.createElement("span"); lt.className = "tab-text"; lt.textContent = t[2];
      b.appendChild(lt);
      b.title = t[2];
    });
  }
  function tabDritterAnwenden() { tabsAnwenden(); }
  // Passt das Ziel eines Platzes zur gerade gezeigten Ansicht?
  function tabZielAktiv(ziel, name, reiter) {
    var t = String(ziel || "").split("/");
    if (!t[0]) return false;
    if (t[0] === "mitglieder") return name === "mitglieder" && reiter === (t[1] || "");
    if (t[0] === "statistik") return name === "statseite";
    if (t[0] === "plan") return name === "plan" || name === "halle";
    return name === t[0];
  }
  function tabWahlRendern() {
    var box = el("tab-wahl"); if (!box) return;
    box.innerHTML = "";
    var namen = { tab2: "Zweiter Platz", tab3: "Dritter Platz", tab4: "Vierter Platz" };
    PLAETZE.forEach(function (p) {
      var jetzt = tabFuerPlatz(p);
      var kopf = document.createElement("p");
      kopf.className = "listen-kopf"; kopf.style.margin = "10px 0 2px";
      kopf.textContent = namen[p.schluessel];
      box.appendChild(kopf);
      var wahl = document.createElement("select");
      wahl.className = "mg-select"; wahl.style.width = "100%";
      TAB_ZIELE.forEach(function (t) {
        if (t[3] && !funktion(t[3])) return;
        if (gesperrtFuerMich(t[0])) return;
        var o = document.createElement("option");
        o.value = t[0]; o.textContent = t[2];
        if (jetzt && jetzt[0] === t[0]) o.selected = true;
        wahl.appendChild(o);
      });
      wahl.addEventListener("change", function () {
        schreiben(p.schluessel, wahl.value);
        einstellungenSync(); tabsAnwenden(); ansicht(letzteAnsicht); tabWahlRendern();
        toast("„" + wahl.options[wahl.selectedIndex].text + "“ steht jetzt unten in der Leiste.", "gut");
      });
      box.appendChild(wahl);
    });
    var zurueck = document.createElement("button");
    zurueck.type = "button"; zurueck.className = "mg-neben"; zurueck.style.marginTop = "12px";
    zurueck.textContent = "Wieder wie voreingestellt";
    zurueck.addEventListener("click", function () {
      PLAETZE.forEach(function (p) { schreiben(p.schluessel, null); });
      einstellungenSync(); tabsAnwenden(); ansicht(letzteAnsicht); tabWahlRendern();
      toast("Leiste zurückgesetzt.", "gut");
    });
    box.appendChild(zurueck);
  }

  var SCHNELL_ZIELE = [
    ["#plan", "i-list", "Spielplan"],
    ["#mitglieder/abrechnung", "i-euro", "Abrechnung", "abrechnung"],
    ["#archiv", "i-clock", "Archiv", "archiv"],
    ["#mitfahren", "i-route", "Mitfahren", "mitfahren"],
    ["#aenderungen", "i-bell", "Änderungen", "aenderungen"],
    ["#mitglieder/tausch", "i-swap", "Tausch", "tausch"],
    ["#statistik", "i-balken", "Statistik", "statistik"],
    ["#mitglieder/frei", "i-cal", "Verfügbar", "frei"],
    ["#mitglieder/info", "i-info", "Info", "info"],
    ["#karte", "i-pin", "Hallenkarte", "hallen"],
    ["#regeln", "i-buch", "Regeln", "regeln"],
    ["#rechner", "i-rechner", "Strafrechner", "rechner"],
    ["#woche-teilen", "i-teilen", "Woche teilen"],
    ["#einstellungen", "i-key", "Einstellungen"]
  ];
  function schnellWahlRendern() {
    var box = el("schnell-wahl"); if (!box) return;
    box.innerHTML = "";
    var aus = {}; try { aus = JSON.parse(lesen("schnell-aus") || "{}") || {}; } catch (e) {}
    SCHNELL_ZIELE.forEach(function (e) {
      if (e[3] && !funktion(e[3])) return;
      if (inLeiste(e[0]) || gesperrtFuerMich(e[0])) return;
      var l = document.createElement("label"); var t = document.createElement("span");
      var b = document.createElement("b"); b.textContent = e[2]; b.style.display = "block"; t.appendChild(b);
      var c = document.createElement("input"); c.type = "checkbox"; c.checked = !aus[e[0]];
      c.addEventListener("change", function () {
        var st = {}; try { st = JSON.parse(lesen("schnell-aus") || "{}") || {}; } catch (x) {}
        if (c.checked) delete st[e[0]]; else st[e[0]] = true;
        schreiben("schnell-aus", JSON.stringify(st)); einstellungenSync();
        if (aktuell && !el("detail").classList.contains("versteckt")) zeigeSchnellzugriff(aktuell, !!(profil && profil.slug === aktuell.slug));
      });
      l.appendChild(t); l.appendChild(c); box.appendChild(l);
    });
  }

  // "Alles eingerichtet?": fehlende Schritte mit Direktlink, verschwindet, wenn alles da ist
  function zeigeEinrichtung(p, meins) {
    var box = el("einrichtung"); box.innerHTML = ""; box.className = "versteckt";
    if (!meins || !startEinstellung("einrichtung") || startEinstellung("ruhig")) return;
    var weg = lesen("einrichtung-weg"); if (weg && Date.now() - parseInt(weg, 10) < 14 * 86400000) return;
    var lauf = box._lauf = {};
    var punkte = [];
    punkte.push({ ok: lesen("abo-geklickt") === "1", titel: "Kalender abonnieren", text: "Spiele automatisch im iPhone-Kalender", href: "#", tu: function () { var kb = el("kalender-box"); if (kb) { kb.open = true; kb.scrollIntoView({ behavior: "smooth", block: "center" }); } } });
    var alsApp = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    var pushOk = ("Notification" in window) && Notification.permission === "granted";
    if (funktion("push")) punkte.push({ ok: pushOk, titel: alsApp ? "Push einschalten" : "Als App ablegen und Push einschalten", text: "Änderungen, Spieltag, Abfahrt", href: "#einstellungen" });
    if (!sitzungVorhanden()) {
      punkte.push({ ok: false, titel: "Konto anlegen", text: "Abrechnung, Notizen, Checkliste, Push auf allen Geräten", href: "#mitglieder" });
      rendern();
      return;
    }
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) {
      if (!st.eingerichtet || !st.session) return null;
      return Promise.all([window.Mitglieder.heimat(), null, window.Mitglieder.wohnortEigen ? window.Mitglieder.wohnortEigen() : null, window.Mitglieder.zaehler()]);
    }).then(function (r) {
      if (!r || box._lauf !== lauf) return;
      if (funktion("abrechnung")) punkte.push({ ok: !!r[0], titel: "Heimatadresse", text: "für Strecken, Abfahrtszeit, km in der Abrechnung", href: "#einstellungen" });
      if (funktion("mitfahren")) punkte.push({ ok: !!r[2], titel: "Wohnort teilen (freiwillig)", text: "damit „Zusammen fahren“ vorschlagen kann", href: "#einstellungen" });
      rendern();
    }).catch(function () { rendern(); });
    function rendern() {
      var offen = punkte.filter(function (x) { return !x.ok; });
      if (!offen.length) { schreiben("einrichtung-weg", String(Date.now() + 365 * 86400000)); return; }
      box.className = "karte einrichtung";
      var kz = document.createElement("div"); kz.className = "kopfzeile";
      var hh = document.createElement("h4"); hh.appendChild(ikone("i-check")); hh.appendChild(document.createTextNode("Alles eingerichtet? " + (punkte.length - offen.length) + " von " + punkte.length)); kz.appendChild(hh);
      var zu = document.createElement("button"); zu.type = "button"; zu.className = "textknopf"; zu.textContent = "Später"; zu.addEventListener("click", function () { schreiben("einrichtung-weg", String(Date.now())); box.className = "versteckt"; }); kz.appendChild(zu);
      box.appendChild(kz);
      var fort = document.createElement("div"); fort.className = "fortschritt"; var fi = document.createElement("i"); fi.style.width = Math.round((punkte.length - offen.length) / punkte.length * 100) + "%"; fort.appendChild(fi); box.appendChild(fort);
      offen.forEach(function (x) {
        var a = document.createElement("a"); a.className = "punkt"; a.href = x.href;
        if (x.tu) a.addEventListener("click", function (ev) { ev.preventDefault(); x.tu(); });
        var t = document.createElement("span"); var b = document.createElement("b"); b.textContent = x.titel; var sm = document.createElement("small"); sm.textContent = x.text; t.appendChild(b); t.appendChild(sm); a.appendChild(t);
        var pf = document.createElement("span"); pf.className = "meta"; pf.textContent = "›"; a.appendChild(pf);
        box.appendChild(a);
      });
    }
  }

  // Schnellzugriff unter der Kopfkarte: die Kernfunktionen mit einem Tipp
  // Was unten in der Leiste steht, muss hier nicht noch einmal stehen.
  function inLeiste(ziel) {
    var z = String(ziel).replace(/^#/, "");
    if (z === "mehr" || z === "") return true;
    return PLAETZE.filter(function (p) { var b = el(p.knopf); return b && b._ziel === z; }).length > 0;
  }
  // Die naechsten sieben Tage als kurzer Text - fuer die Fahrgemeinschaft
  // oder zu Hause. Teilen muss direkt aus dem Tipp kommen, sonst laesst
  // das Handy das Teilen-Fenster nicht zu.
  function wocheText() {
    if (!profil || !profil.slug || !daten) return "";
    var p = personMit(profil.slug);
    if (!p) return "";
    var jetzt = new Date(), bis = new Date(jetzt.getTime() + 7 * 86400000);
    var liste = (p.spiele || []).filter(function (s) {
      var d = new Date(s.beginn);
      return !s.vergangen && d >= jetzt && d <= bis && !istGeloescht(s);
    });
    if (!liste.length) return "";
    return "Meine Woche:\n" + liste.map(function (s) {
      var d = new Date(s.beginn);
      return "\u2022 " + datumKurz(d) + " " + uhr(d) + " Uhr, " + (s.liga ? s.liga + ": " : "") + s.paarung
        + (s.halle ? "\n  " + s.halle : "")
        + "\n  Treffpunkt " + uhr(new Date(s.treffpunkt)) + " Uhr";
    }).join("\n");
  }
  function wocheTeilen() {
    var text = wocheText();
    if (!text) { toast("In den nächsten sieben Tagen steht nichts an.", "warn"); return; }
    if (navigator.share) navigator.share({ text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast("Woche kopiert ✓", "gut"); });
    else toast("Teilen geht auf diesem Gerät nicht.", "warn");
  }

  function zeigeSchnellzugriff(p, meins) {
    var box = el("schnellzugriff"); box.innerHTML = "";
    if (!meins || !startEinstellung("schnell")) { box.classList.add("versteckt"); return; }
    var aus = {}; try { aus = JSON.parse(lesen("schnell-aus") || "{}") || {}; } catch (e) {}
    var eintraege = SCHNELL_ZIELE.filter(function (e) { return (!e[3] || funktion(e[3])) && !aus[e[0]] && !inLeiste(e[0]) && !gesperrtFuerMich(e[0]); });
    if (!eintraege.length) { box.classList.add("versteckt"); return; }
    var zuletzt = [];
    try { zuletzt = JSON.parse(lesen("zuletzt-ziele") || "[]"); } catch (e) {}
    eintraege.sort(function (a, b) { var ia = zuletzt.indexOf(a[0]), ib = zuletzt.indexOf(b[0]); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    eintraege.forEach(function (e) {
      // "Woche teilen" ist kein Ziel, sondern eine Tat - deshalb ein Knopf
      var tat = e[0] === "#woche-teilen";
      var a = document.createElement(tat ? "button" : "a");
      if (tat) { a.type = "button"; a.addEventListener("click", wocheTeilen); }
      else a.href = e[0];
      if (zuletzt.indexOf(e[0]) >= 0 && zuletzt.indexOf(e[0]) < 3) a.classList.add("zuletzt");
      a.appendChild(ikone(e[1])); a.appendChild(document.createTextNode(e[2]));
      box.appendChild(a);
    });
    box.classList.remove("versteckt");
  }

  // Admin-Modus auch in den Einstellungen (nur fuer Admins sichtbar)
  function adminZeileRendern() {
    var box = el("adminzeile"); if (!box) return;
    box.innerHTML = ""; box.classList.add("versteckt");
    if (!sitzungVorhanden()) return;
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { return st.eingerichtet && st.session && window.Mitglieder.adminRecht ? window.Mitglieder.adminRecht() : false; })
      .then(function (ja) {
        if (!ja) return;
        var h3 = document.createElement("h3"); h3.className = "abschnitt"; h3.textContent = "Betreiber";
        var sm = document.createElement("small"); sm.textContent = "Admin-Funktionen ein- oder ausblenden, die Rechte bleiben"; h3.appendChild(sm);
        box.appendChild(h3);
        var karte = document.createElement("div"); karte.className = "karte einstellungen-liste";
        var l = document.createElement("label"); var t = document.createElement("span");
        var b = document.createElement("b"); b.textContent = "Admin-Modus"; b.style.display = "block";
        var s2 = document.createElement("small"); s2.textContent = "Admin-Reiter, „Korrigieren“, Funktionen, alle Spiele im Archiv"; s2.style.color = "var(--dim)"; s2.style.fontWeight = "500";
        t.appendChild(b); t.appendChild(s2);
        var c = document.createElement("input"); c.type = "checkbox"; c.checked = adminModusAn();
        c.addEventListener("change", function () { schreiben("adminaus", c.checked ? null : "1"); adminKnopfStand(); zaehlerHolen(); toast(c.checked ? "Admin-Modus an." : "Admin-Modus aus.", "gut"); });
        l.appendChild(t); l.appendChild(c); karte.appendChild(l); box.appendChild(karte);
        box.classList.remove("versteckt");
      }).catch(function () {});
  }

  // Die letzten Push-Nachrichten (der Service Worker legt sie in IndexedDB ab)
  function pushVerlaufLesen() {
    return new Promise(function (ok) {
      if (!window.indexedDB) return ok([]);
      var a = indexedDB.open("esrw-push", 1);
      a.onupgradeneeded = function () { try { a.result.createObjectStore("nachrichten", { keyPath: "zeit" }); } catch (e) {} };
      a.onerror = function () { ok([]); };
      a.onsuccess = function () {
        var db = a.result;
        try {
          var t = db.transaction("nachrichten", "readonly").objectStore("nachrichten").getAll();
          t.onsuccess = function () { ok((t.result || []).sort(function (x, y) { return y.zeit - x.zeit; }).slice(0, 10)); db.close(); };
          t.onerror = function () { ok([]); db.close(); };
        } catch (e) { ok([]); }
      };
    });
  }
  function pushVerlaufRendern() {
    var box = el("push-verlauf"); if (!box) return;
    box.innerHTML = ""; box.classList.add("versteckt");
    pushVerlaufLesen().then(function (liste) {
      if (!liste.length) return;
      var h3 = document.createElement("h3"); h3.className = "abschnitt"; h3.textContent = "Zuletzt gemeldet";
      var sm = document.createElement("small"); sm.textContent = "die letzten Push-Nachrichten auf diesem Gerät"; h3.appendChild(sm);
      box.appendChild(h3);
      var k = document.createElement("div"); k.className = "karte protokoll";
      liste.forEach(function (n) {
        var z = document.createElement(n.url ? "a" : "div"); z.className = "zeile"; if (n.url) z.href = String(n.url).replace(/^\.\//, "");
        var t = document.createElement("span"); t.style.minWidth = "0";
        var b = document.createElement("b"); b.textContent = n.titel || "Mitteilung"; t.appendChild(b);
        var s2 = document.createElement("small"); s2.textContent = (n.text || "").slice(0, 120) + " · " + new Date(n.zeit).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); t.appendChild(s2);
        z.appendChild(t); k.appendChild(z);
      });
      box.appendChild(k);
      box.classList.remove("versteckt");
    });
  }

  // Fremdes Profil: gemeinsame Spiele, Kontakt, Mitfahrt anfragen
  function zeigeKollege(p, meins) {
    var alt = el("detail").querySelector(".kollege"); if (alt) alt.remove();
    if (meins || !profil || !profil.slug || !personMit(profil.slug)) return;
    var box = document.createElement("div"); box.className = "karte kollege";
    var hh = document.createElement("h4"); hh.appendChild(ikone("i-users")); hh.appendChild(document.createTextNode("Du und " + (p.name.split(",")[1] || p.name).trim())); box.appendChild(hh);
    var gemeinsam = p.spiele.filter(function (s) { return (s.gespann || []).some(function (g) { return g.slug === profil.slug; }); });
    var kommend = gemeinsam.filter(function (s) { return !s.vergangen; }), gewesen = gemeinsam.length - kommend.length;
    var meta = document.createElement("p"); meta.className = "meta"; meta.style.margin = "0 0 4px";
    meta.textContent = gemeinsam.length ? (kommend.length ? kommend.length + (kommend.length === 1 ? " gemeinsames Spiel" : " gemeinsame Spiele") + " demnächst" : "Zurzeit kein gemeinsames Spiel") + (gewesen ? " · " + gewesen + " im Datenfenster gepfiffen" : "") : "Noch kein gemeinsames Spiel im Datenfenster.";
    box.appendChild(meta);
    // Das Datumsraster der ".zeile" passt hier nicht - der Titel landete in
    // der schmalen Datumsspalte und brach mitten im Namen um.
    kommend.slice(0, 4).forEach(function (s) {
      var d = new Date(s.beginn), a = document.createElement("a"); a.className = "zeile-lauf"; a.href = "#spiel/" + encodeURIComponent(kennungVon(s));
      var l = document.createElement("span");
      var b = document.createElement("b"); b.textContent = datumKurz(d) + " · " + uhr(d) + " Uhr"; l.appendChild(b);
      var pa = document.createElement("span"); pa.className = "zeile-paarung";
      pa.textContent = (s.liga ? s.liga + ": " : "") + s.paarung; l.appendChild(pa);
      if (s.halle) { var sm = document.createElement("small"); sm.textContent = s.halle; l.appendChild(sm); }
      a.appendChild(l);
      var r = document.createElement("span"); r.className = "pfeil"; r.textContent = "›"; a.appendChild(r);
      box.appendChild(a);
    });
    // Erst anlegen, wenn wirklich Knoepfe kommen - sonst klaffte hier eine Luecke
    var zw = document.createElement("div"); zw.className = "zweit versteckt"; box.appendChild(zw);
    var pz = el("detail").querySelector(".spalte-haupt > .profilzeile");
    pz.parentNode.insertBefore(box, pz.nextSibling);
    if (!sitzungVorhanden() || !funktion("gespann")) { var m2 = document.createElement("p"); m2.className = "meta"; m2.style.margin = "8px 0 0"; m2.textContent = sitzungVorhanden() ? "" : "Angemeldet siehst du hier die Handynummer, wenn sie freigegeben ist."; if (m2.textContent) box.appendChild(m2); return; }
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.kontaktVon(p.slug) : null; })
      .then(function (k) {
        if (!box.isConnected) return;
        if (!k) { var m3 = document.createElement("p"); m3.className = "meta"; m3.style.margin = "8px 0 0"; m3.textContent = "Keine Handynummer freigegeben."; box.appendChild(m3); return; }
        zw.classList.remove("versteckt");
        var a1 = document.createElement("a"); a1.className = "anfrage knopf-zeichen"; a1.href = k.tel;
        a1.appendChild(ikone("i-telefon")); a1.appendChild(document.createTextNode("Anrufen")); zw.appendChild(a1);
        var a2 = document.createElement("a"); a2.className = "anfrage knopf-zeichen"; a2.href = k.wa; a2.target = "_blank"; a2.rel = "noopener";
        a2.appendChild(ikone("i-chat")); a2.appendChild(document.createTextNode("WhatsApp")); zw.appendChild(a2);
        if (kommend.length) {
          var s = kommend[0], d = new Date(s.beginn);
          var text = "Hallo " + (p.name.split(",")[1] || "").trim() + ", fahren wir am " + datumKurz(d) + " zusammen zum Spiel " + s.paarung + " (" + (s.halle || "") + ", Treffpunkt " + uhr(new Date(s.treffpunkt)) + " Uhr)? Viele Grüße, " + ((profil.name || "").split(",")[1] || profil.name || "").trim();
          var a3 = document.createElement("a"); a3.className = "anfrage zweit knopf-zeichen"; a3.href = k.wa.split("?")[0] + "?text=" + encodeURIComponent(text); a3.target = "_blank"; a3.rel = "noopener";
          a3.appendChild(ikone("i-route")); a3.appendChild(document.createTextNode("Mitfahrt anfragen")); zw.appendChild(a3);
        }
        var m4 = document.createElement("p"); m4.className = "meta"; m4.style.margin = "8px 0 0"; m4.textContent = k.telefon + (k.hinweis ? " · " + k.hinweis : ""); box.appendChild(m4);
      }).catch(function () {});
  }

  var letzteAnsicht = "auswahl";
  function ansicht(name) {
    letzteAnsicht = name;
    el("detail").classList.remove("start-laedt");
    ["auswahl", "detail", "plan", "mitglieder", "halle", "status", "spiel", "mehr", "einstellungen", "karte", "statseite", "aenderungen", "mitfahren", "archiv", "regeln", "rechner", "gesperrt"].forEach(function (id) { el(id).classList.toggle("versteckt", name !== id); });
    if (name !== "plan" && typeof filterBlatt === "function" && !el("plan-filter-blatt").classList.contains("versteckt")) filterBlatt(false);
    var reiter = (location.hash.split("/")[1] || "");
    if (name !== "auswahl" && name !== "detail") { el("onboarding").classList.add("versteckt"); el("onboarding-kurz").classList.add("versteckt"); el("neu").classList.add("versteckt"); }
    else if (name === "detail" && el("neu")._offen) el("neu").classList.remove("versteckt");
    el("tab-meine").classList.toggle("aktiv", name === "auswahl" || name === "detail" || name === "spiel" || name === "statseite");
    // Die drei mittleren Plaetze: aktiv ist, wessen Ziel gerade offen ist
    var einer = false;
    PLAETZE.forEach(function (p) {
      var b = el(p.knopf); if (!b) return;
      var an = tabZielAktiv(b._ziel, name, reiter);
      b.classList.toggle("aktiv", an);
      if (an) einer = true;
    });
    el("tab-mitglieder").classList.toggle("aktiv", !einer && (name === "mehr" || name === "einstellungen"
      || name === "karte" || name === "status" || name === "regeln" || name === "rechner" || name === "mitglieder"));
    Array.prototype.forEach.call(document.querySelectorAll(".leiste button"), function (b) {
      if (b.classList.contains("aktiv")) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
  }
  var suchModus = false;
  // Ein Obmann pfeift nicht selbst - statt "Wer bist du?" steht das hier.
  function obmannHinweis() {
    var f = el("frage"), u = el("frage-unter");
    if (!f || !u) return;
    f.textContent = "Du bist als Obmann eingetragen";
    u.textContent = "Du stehst in keiner Einteilung, deshalb gibt es hier kein eigenes Profil. "
      + "Spielplan, Kollegen und der Betreiberbereich stehen dir offen.";
    var liste = el("namen"); if (liste) liste.classList.add("versteckt");
    var suche = el("suche"); if (suche) suche.classList.add("versteckt");
  }

  function zeigeAuswahl(wechsel) {
    aktuell = null; ansicht("auswahl"); el("statistik").innerHTML = "";
    if (kontoObmann && !wechsel) { obmannHinweis(); return; }
    suchModus = wechsel === "suche";
    el("frage").textContent = suchModus ? "Suche" : wechsel ? "Profil wechseln" : "Wer bist du?";
    var quellen = funktionsText([[null, "Kollegen"], ["hallen", "Hallen"], [null, "Vereine"], [null, "Spiele"],
      [null, "Seiten"], ["notizen", "Notizen"], ["info", "Termine"], ["regeln", "Strafen"],
      ["regeln", "Antrittsstärken"], ["regeln", "Bestimmungen"]], "und");
    el("frage-unter").textContent = suchModus ? quellen + ". Tippen springt direkt hin." : wechsel ? "Der gewählte Name wird dein Profil auf diesem Gerät." : "Wähle deinen Namen. Danach siehst du deine Spiele, kannst den Kalender abonnieren und Mitteilungen bekommen.";
    el("suche").placeholder = suchModus
      ? funktionsText([[null, "Name"], ["hallen", "Halle"], [null, "Verein"], [null, "Spiel"], ["regeln", "Strafe"]]) + " …"
      : "Namen suchen …";
    if (!suchModus) el("suche").value = "";
    zeigeListe(el("suche").value);
    suchVerlaufRendern();
    onboardingStand();
    if (suchModus) { el("onboarding").classList.add("versteckt"); el("onboarding-kurz").classList.add("versteckt"); }
    el("abbrechen-zeile").classList.toggle("versteckt", !wechsel || !profil);
    var z = el("zuletzt"); z.innerHTML = "";
    var slugs = (profil && profil.slug ? [profil.slug] : []).concat(zuletztLesen());
    slugs.forEach(function (slug) {
      var p = personMit(slug); if (!p) return;
      var c = chip({ name: p.name, slug: p.slug }, false, profil && slug === profil.slug ? "ich" : "");
      c.addEventListener("click", function (ev) { ev.preventDefault(); if (profil && slug === profil.slug) zeigePerson(p); else { zuletztMerken(slug); location.hash = slug; } });
      z.appendChild(c);
    });
    z.classList.toggle("versteckt", !z.childNodes.length);
  }

  var mitgliederGeladen = null;
  // Frueher stand hier Date.now(): bei jedem Start eine neue Adresse, die
  // im Zwischenspeicher nie zu finden war - also jedes Mal uebers Netz.
  // Mit der Versionsnummer der App ist es dieselbe Adresse wie gestern,
  // und beim naechsten Freigeben eine neue.
  function ladeMitglieder() {
    if (!mitgliederGeladen) {
      mitgliederGeladen = new Promise(function (ok, nein) {
        if (window.Mitglieder) return ok(window.Mitglieder);
        var versuche = 0;
        function hol() {
          versuche++;
          var s = document.createElement("script");
          // Beim zweiten Versuch ohne Versionsnummer - falls genau die
          // eine Adresse im Zwischenspeicher kaputt liegt
          s.src = versuche === 1 ? "mitglieder.js?v=" + APP_VERSION : "mitglieder.js?neu=" + Date.now();
          s.onload = function () {
            if (window.Mitglieder) return ok(window.Mitglieder);
            if (versuche < 2) return hol();
            nein(new Error("mitglieder.js geladen, aber leer"));
          };
          s.onerror = function () {
            if (versuche < 2) return setTimeout(hol, 400);
            nein(new Error("mitglieder.js nicht ladbar"));
          };
          document.head.appendChild(s);
        }
        hol();
      });
      // Ein gescheiterter Versuch darf nicht fuer immer haengen bleiben -
      // sonst hilft auch ein spaeterer Tipp nicht mehr.
      mitgliederGeladen.catch(function () { mitgliederGeladen = null; });
    }
    return mitgliederGeladen;
  }
  // Leeres Geruest statt null: der Mitgliederbereich soll auch dann seinen
  // Anmeldeschirm zeichnen koennen, wenn noch keine Daten geladen sind.
  var LEER = { personen: [], spiele: [], hallen: {}, adressen: {}, hallen_hinweise: {}, saison: "", titel: "Einteilungen" };
  function mitgliederKontext() { return { gespannKorrektur: gespannKorrektur, gespannGehoert: gespannGehoert, daten: daten || LEER, slug: profil && profil.slug, personMit: personMit, hole: hole, ikone: ikone, funktion: funktion, funktionen: FUNKTIONEN, einstellungenSync: einstellungenSync, lesen: lesen, schreiben: schreiben }; }
  function zeigeMitglieder(reiter) {
    aktuell = null; ansicht("mitglieder");
    ladeMitglieder().then(function (M) { M.oeffnen(el("mitglieder"), mitgliederKontext(), reiter); })
      .catch(function (e) { el("mitglieder").textContent = "Mitgliederbereich konnte nicht geladen werden: " + e.message; });
    window.scrollTo(0, 0);
  }

  function zeigeHalle(slug) {
    var name = halleVonSlug(slug);
    if (!name) { toast("Halle nicht gefunden.", "warn"); return zeigeAuswahl(false); }
    ansicht("halle"); aktuell = null;
    var adresse = (daten.adressen && daten.adressen[name]) || "";
    el("halle-name").textContent = name;
    el("halle-adresse").textContent = adresse || "Adresse unbekannt";
    var kn = el("halle-knoepfe"); kn.innerHTML = "";
    if (adresse) {
      var r = document.createElement("a"); r.href = kartenLink(name + ", " + adresse); r.target = "_blank"; r.rel = "noopener";
      r.appendChild(ikone("i-route")); r.appendChild(document.createTextNode("Route")); kn.appendChild(r);
      var k = document.createElement("button"); k.type = "button"; k.textContent = "Adresse kopieren";
      k.addEventListener("click", function () { if (navigator.clipboard) navigator.clipboard.writeText(name + ", " + adresse).then(function () { toast("Adresse kopiert ✓", "gut"); }); });
      kn.appendChild(k);
      var kk = document.createElement("a"); kk.href = "#karte"; kk.appendChild(ikone("i-pin")); kk.appendChild(document.createTextNode("Karte")); kn.appendChild(kk);
    }
    var st = el("halle-strecke"); st.innerHTML = "";
    var hw = el("halle-hinweise"); hw.innerHTML = "";
    if (sitzungVorhanden()) { var hsk = document.createElement("div"); hsk.className = "skelett-karte"; hsk.style.height = "90px"; hw.appendChild(hsk); }
    var liste = el("halle-spiele"); liste.innerHTML = "";
    var spiele = (daten.spiele || []).filter(function (sp) { return sp.halle === name; });
    if (!spiele.length) liste.appendChild(leerZustand("Im Datenfenster kein Spiel in dieser Halle."));
    var letzterTag = null;
    spiele.forEach(function (sp) {
      var beginn = new Date(sp.beginn), tagKey = beginn.toDateString();
      if (tagKey !== letzterTag) {
        letzterTag = tagKey; var t = tagTitel(beginn);
        var h = document.createElement("div"); h.className = "tag" + (t[2] ? " heute" : "");
        var l1 = document.createElement("span"); l1.textContent = t[0]; var r1 = document.createElement("span"); r1.textContent = t[1];
        h.appendChild(l1); h.appendChild(r1); liste.appendChild(h);
      }
      liste.appendChild(planKarte(sp, beginn));
    });
    // Angemeldet: eigene Strecke und Hallen-Hinweise
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (stt) {
      if (!stt.eingerichtet || !stt.session) {
        var p = document.createElement("p"); p.className = "meta"; p.textContent = "Angemeldet siehst du hier deine Fahrzeit und die Hallen-Hinweise der Kollegen."; hw.appendChild(p); return;
      }
      window.Mitglieder.abfahrt(name).then(function (sk) {
        if (!sk || !sk.minuten) return;
        var h = document.createElement("div"); h.className = "hinweis gut"; h.appendChild(ikone("i-route"));
        var sp2 = document.createElement("span"); sp2.textContent = "Von zu Hause: " + sk.km + " km, ca. " + mitPuffer(sk).minuten + " Min. (" + verkehrText() + ")."; h.appendChild(sp2); st.appendChild(h);
      });
      if (funktion("hallen")) window.Mitglieder.hallenHinweise(name, hw);
    }).catch(function () {});
    var offiziell = (daten.hallen_hinweise || {})[name] || [];
    if (offiziell.length) {
      var ob = document.createElement("div"); ob.style.marginBottom = "10px";
      offiziell.forEach(function (t) { var oh = document.createElement("div"); oh.className = "hinweis offiziell"; oh.style.marginTop = "6px"; oh.appendChild(ikone("i-pin")); var os = document.createElement("span"); var bd = document.createElement("span"); bd.className = "offiziell-badge"; bd.textContent = "Offiziell"; os.appendChild(bd); os.appendChild(document.createTextNode(t)); oh.appendChild(os); ob.appendChild(oh); });
      hw.parentNode.insertBefore(ob, hw);
    }
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------ Zusammen fahren
  // Je eigenem Spiel der naechsten 14 Tage: wer ist am selben Tag in derselben
  // Halle (Gespann und andere Spiele), wer bietet oder sucht eine Mitfahrt,
  // Anruf-Knoepfe, eigener Status. Dazu eine Karte mit Hallen und Zuhause.
  var mitfahrKarte = null;
  function zeigeMitfahren() {
    ansicht("mitfahren"); aktuell = null; window.scrollTo(0, 0);
    var liste = el("mitfahren-liste"); liste.innerHTML = "";
    var kd = el("mitfahren-karte"); kd.classList.add("versteckt");
    if (!profil || !profil.slug || !personMit(profil.slug)) { liste.appendChild(leerZustand("Erst deinen Namen wählen.", { label: "Namen wählen", fn: function () { zeigeAuswahl(false); location.hash = ""; } })); return; }
    if (!sitzungVorhanden()) { var a = document.createElement("a"); a.href = "#mitglieder"; a.className = "hinweis"; a.style.display = "flex"; a.style.textDecoration = "none"; a.style.color = "inherit"; a.appendChild(ikone("i-lock")); var t = document.createElement("span"); t.textContent = "Anmelden, um Mitfahrten zu sehen, anzubieten oder zu suchen ›"; a.appendChild(t); liste.appendChild(a); return; }
    var me = personMit(profil.slug), bis = Date.now() + 14 * 86400000;
    var meine = me.spiele.filter(function (s) { return !s.vergangen && new Date(s.beginn).getTime() <= bis; });
    if (!meine.length) { liste.appendChild(leerZustand("In den nächsten 14 Tagen kein eigenes Spiel.", { label: "Spielplan ansehen", href: "#plan" })); return; }
    liste.appendChild(skelettKarte(120));
    // Alle Spiele je Halle/Tag, an denen ich beteiligt bin: dort fahren Kollegen hin
    var gruppen = meine.map(function (s) {
      var tag = new Date(s.beginn).toDateString();
      var dort = (daten.spiele || []).filter(function (x) { return !x.vergangen && x.halle === s.halle && new Date(x.beginn).toDateString() === tag; });
      var leute = {};
      dort.forEach(function (x) { (x.besetzung || []).forEach(function (b) { if (b.slug && b.slug !== profil.slug) leute[b.slug] = { name: b.name, slug: b.slug, spiel: x, gespann: kennungVon(x) === kennungVon(s) }; }); });
      return { s: s, dort: dort, leute: Object.keys(leute).map(function (k) { return leute[k]; }) };
    });
    var alleSpiele = []; gruppen.forEach(function (g) { g.dort.forEach(function (x) { if (alleSpiele.indexOf(x) < 0) alleSpiele.push(x); }); });
    var lauf = liste._lauf = {};
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) {
      if (!st.eingerichtet || !st.session) return null;
      return Promise.all([window.Mitglieder.mitfahrtenFuer(alleSpiele), window.Mitglieder.heimat()]);
    }).then(function (r) {
      if (liste._lauf !== lauf) return;
      liste.innerHTML = "";
      if (!r || !r[0]) { liste.appendChild(leerZustand("Mitfahrten gibt es nach der Freischaltung durch den Betreiber.", { label: "Wohnort schon mal teilen", href: "#einstellungen" })); return; }
      var mitfahrten = r[0], heim = r[1];
      // Der Hinweis auf die Heimatadresse stand bisher in jeder Karte - einmal
      // oben reicht, sonst liest ihn niemand mehr.
      if (!heim) {
        var hw = document.createElement("a"); hw.className = "hinweis"; hw.href = "#einstellungen";
        hw.style.display = "flex"; hw.style.textDecoration = "none"; hw.style.color = "inherit";
        hw.appendChild(ikone("i-route"));
        var hwt = document.createElement("span");
        hwt.innerHTML = "<b>Heimatadresse eintragen</b>, dann siehst du, wer auf deinem Weg zur Halle liegt ›";
        hw.appendChild(hwt); liste.appendChild(hw);
      }
      // Kurze Bilanz oben: wie viele Spiele, Angebote und Treffer auf dem Weg
      var zahlAngebote = 0, zahlWeg = 0;
      gruppen.forEach(function (g) {
        var a = {}; g.dort.forEach(function (x) { (mitfahrten[kennungVon(x)] || []).forEach(function (m) { if (m.slug !== profil.slug) a[m.slug] = m; }); });
        zahlAngebote += Object.keys(a).length;
        var v = window.Mitglieder.vorschlaegeFuer(g.s, g.leute.map(function (k) { return k.slug; }));
        zahlWeg += Object.keys(v || {}).length;
      });
      var bilanz = document.createElement("p"); bilanz.className = "meta"; bilanz.style.margin = "0 0 10px";
      bilanz.textContent = gruppen.length + (gruppen.length === 1 ? " Spiel" : " Spiele") + " in 14 Tagen · "
        + zahlAngebote + (zahlAngebote === 1 ? " Eintrag von Kollegen" : " Einträge von Kollegen")
        + (zahlWeg ? " · " + zahlWeg + " auf deinem Weg" : "");
      liste.appendChild(bilanz);
      gruppen.forEach(function (g) {
        var s = g.s, d = new Date(s.beginn), box = document.createElement("div"); box.className = "karte fahrt";
        var hh = document.createElement("h4"); hh.appendChild(ikone("i-pin")); hh.appendChild(document.createTextNode((s.halle || "Halle unbekannt") + " · " + datumKurz(d) + " " + uhr(d)));
        box.appendChild(hh);
        var meta = document.createElement("p"); meta.className = "meta"; meta.style.margin = "0 0 4px";
        meta.textContent = (s.liga ? s.liga + ": " : "") + s.paarung + (g.dort.length > 1 ? " · " + g.dort.length + " Spiele an dem Tag dort" : "");
        box.appendChild(meta);
        // Alle Mitfahrten zu Spielen an diesem Tag in dieser Halle
        var angebote = {}; g.dort.forEach(function (x) { (mitfahrten[kennungVon(x)] || []).forEach(function (m) { angebote[m.slug] = m; }); });
        var meinEintrag = angebote[profil.slug] || null;
        var vorschlaege = window.Mitglieder.vorschlaegeFuer(s, g.leute.map(function (k) { return k.slug; }));
        if (!g.leute.length) { var l0 = document.createElement("p"); l0.className = "meta"; l0.textContent = "Sonst niemand aus der Liste an dem Tag dort."; box.appendChild(l0); }
        g.leute.sort(function (a, b) { return ((vorschlaege[b.slug] ? 2 : 0) + (b.gespann ? 1 : 0)) - ((vorschlaege[a.slug] ? 2 : 0) + (a.gespann ? 1 : 0)) || a.name.localeCompare(b.name, "de"); }).forEach(function (k) {
          var z = document.createElement("div"); z.className = "wer";
          var links = document.createElement("span"); var b = document.createElement("b"); b.textContent = k.name; links.appendChild(b);
          var sm = document.createElement("small"); var kd2 = new Date(k.spiel.beginn), v = vorschlaege[k.slug], wo = window.Mitglieder.wohnortVon(k.slug);
          sm.textContent = (k.gespann ? "im Gespann" : "dort um " + uhr(kd2) + " Uhr") + (wo && wo.ort ? " · aus " + wo.ort : "") + (v ? (v.richtung === "ich" ? " · liegt auf deinem Weg" : " · du liegst auf seinem Weg") + (v.umweg > 0 ? ", Umweg ca. " + v.umweg + " km" : ", praktisch kein Umweg") : "") + (angebote[k.slug] ? " · " + angebote[k.slug].text : ""); links.appendChild(sm); z.appendChild(links);
          var rechts = document.createElement("span"); rechts.className = "knoepfe";
          if (v) { var vb = document.createElement("span"); vb.className = "status"; vb.textContent = "auf dem Weg"; rechts.appendChild(vb); }
          if (angebote[k.slug]) { var stt = document.createElement("span"); stt.className = "status " + (angebote[k.slug].art === "suche" ? "suche" : ""); stt.textContent = angebote[k.slug].art === "suche" ? "sucht Mitfahrt" : "bietet Mitfahrt"; rechts.appendChild(stt); }
          var nr = window.Mitglieder.telefonVon(k.slug);
          if (nr) { var a1 = document.createElement("a"); a1.className = "anfrage"; a1.href = nr.tel; a1.textContent = "Anrufen"; rechts.appendChild(a1); var a2 = document.createElement("a"); a2.className = "anfrage"; a2.href = nr.wa + "?text=" + encodeURIComponent("Hallo " + (k.name.split(",")[1] || "").trim() + ", fahren wir am " + datumKurz(d) + " zusammen nach " + (s.halle || "zur Halle") + "?"); a2.target = "_blank"; a2.rel = "noopener"; a2.textContent = "WhatsApp"; rechts.appendChild(a2); }
          else { var p1 = document.createElement("a"); p1.className = "textknopf"; p1.href = "#" + k.slug; p1.textContent = "Profil ›"; rechts.appendChild(p1); }
          z.appendChild(rechts); box.appendChild(z);
        });
        // Mein Eintrag: zwei Knoepfe, darunter das Feld fuer den Zusatz -
        // kein Systemdialog mehr, der auf dem Handy den Text verschluckt.
        var mein = document.createElement("div"); mein.className = "meins";
        var lbl = document.createElement("span"); lbl.className = "meta";
        lbl.textContent = meinEintrag ? (meinEintrag.art === "suche" ? "Du suchst mit:" : "Du bietest an:") : "Ich:";
        mein.appendChild(lbl);
        var form = document.createElement("div"); form.className = "mitfahr-form versteckt";
        function speichern(art, text) {
          window.Mitglieder.mitfahrtSetzen(s, art, text || undefined).then(function (ok) {
            if (ok) { toast(art ? "Gespeichert, Kollegen sehen es hier und auf ihrer Spielkarte." : "Zurückgezogen.", "gut"); zeigeMitfahren(); }
          });
        }
        [["biete", "Plätze anbieten", "z. B. ab Essen, 2 Plätze frei"], ["suche", "Mitfahrt suchen", "z. B. ab Bochum Hbf"]].forEach(function (o) {
          var an = meinEintrag && meinEintrag.art === o[0];
          var bt = document.createElement("button"); bt.type = "button"; bt.className = "anfrage" + (an ? " aktiv" : "");
          bt.textContent = an ? o[1].split(" ")[0] + " ✓" : o[1];
          bt.addEventListener("click", function () {
            if (an) { speichern(null); return; }
            form.innerHTML = ""; form.classList.remove("versteckt");
            var i = document.createElement("input"); i.type = "text"; i.maxLength = 80; i.placeholder = o[2];
            i.value = meinEintrag ? meinEintrag.text || "" : "";
            var sp = document.createElement("button"); sp.type = "button"; sp.className = "anfrage aktiv"; sp.textContent = "Speichern";
            sp.addEventListener("click", function () { speichern(o[0], i.value.trim()); });
            i.addEventListener("keydown", function (ev) { if (ev.key === "Enter") sp.click(); });
            form.appendChild(i); form.appendChild(sp);
            i.focus();
          });
          mein.appendChild(bt);
        });
        box.appendChild(mein);
        if (meinEintrag && meinEintrag.text) { var mt = document.createElement("p"); mt.className = "meta"; mt.style.margin = "4px 0 0"; mt.textContent = "„" + meinEintrag.text + "“"; box.appendChild(mt); }
        box.appendChild(form);
        var sl = document.createElement("a"); sl.className = "reihe-knopf"; sl.href = "#spiel/" + encodeURIComponent(kennungVon(s));
        sl.appendChild(ikone("i-list"));
        var slt = document.createElement("span"); var slb = document.createElement("b"); slb.textContent = "Zur Spielseite"; slt.appendChild(slb);
        var sls = document.createElement("small");
        sls.textContent = funktionsText([[null, "Route"], ["gespann", "Gespann"], ["checkliste", "Checkliste"], ["notizen", "Notizen"]], "und");
        slt.appendChild(sls);
        sl.appendChild(slt);
        var slp = document.createElement("span"); slp.className = "pfeil"; slp.textContent = "›"; sl.appendChild(slp);
        box.appendChild(sl);
        liste.appendChild(box);
      });
      // Karte: Hallen der naechsten Spiele, Zuhause
      var punkte = meine.filter(function (s) { return daten.hallen && daten.hallen[s.halle]; });
      if (!punkte.length && !heim) return;
      kd.classList.remove("versteckt");
      ladeLeaflet().then(function (L) {
        if (mitfahrKarte) { mitfahrKarte.remove(); mitfahrKarte = null; }
        kd.innerHTML = "";
        var m = L.map(kd, { scrollWheelZoom: false }); mitfahrKarte = m;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(m);
        var akzent = "#1d5a99", alle = [];
        var jeHalle = {}; punkte.forEach(function (s) { (jeHalle[s.halle] = jeHalle[s.halle] || []).push(s); });
        Object.keys(jeHalle).forEach(function (name) {
          var k = daten.hallen[name]; alle.push([k[0], k[1]]);
          var c = L.circleMarker([k[0], k[1]], { radius: 9, color: akzent, fillColor: akzent, fillOpacity: .9, weight: 2 }).addTo(m);
          var inhalt = document.createElement("div"); var b = document.createElement("b"); b.textContent = name; inhalt.appendChild(b);
          jeHalle[name].forEach(function (s) { var p = document.createElement("div"); var d = new Date(s.beginn); p.textContent = datumKurz(d) + " " + uhr(d) + " · " + s.paarung; inhalt.appendChild(p); });
          if (heim) { var km = Math.round(kmZwischen(k, [heim.lat, heim.lon])); var q = document.createElement("div"); q.className = "meta"; q.textContent = "~" + km + " km von zu Hause"; inhalt.appendChild(q); L.polyline([[heim.lat, heim.lon], [k[0], k[1]]], { color: akzent, weight: 2, dashArray: "4 6", opacity: .6 }).addTo(m); }
          c.bindPopup(inhalt);
        });
        if (heim) { L.circleMarker([heim.lat, heim.lon], { radius: 8, color: "#fff", fillColor: "#d97706", fillOpacity: 1, weight: 3 }).addTo(m).bindPopup("Zuhause"); alle.push([heim.lat, heim.lon]); }
        // Geteilte Wohnorte der Kollegen an diesen Tagen (grob, ~1 km)
        var gezeigt = {};
        gruppen.forEach(function (g) { g.leute.forEach(function (k) {
          var w = window.Mitglieder.wohnortVon(k.slug); if (!w || gezeigt[k.slug]) return; gezeigt[k.slug] = 1;
          L.circleMarker([w.lat, w.lon], { radius: 6, color: "#fff", fillColor: "#6b7280", fillOpacity: .9, weight: 2 }).addTo(m).bindPopup(k.name + (w.ort ? " · " + w.ort : "") + "<br><small>Wohnort geteilt, auf ~1 km gerundet</small>");
          alle.push([w.lat, w.lon]);
        }); });
        function einpassen2() {
          m.invalidateSize();
          var kern = kernPunkte(alle);
          if (kern.length > 1) m.fitBounds(kern, { padding: [24, 24], maxZoom: 11 }); else if (alle.length) m.setView(alle[0], 10);
        }
        einpassen2();
        setTimeout(einpassen2, 250);
      }).catch(function () { kd.classList.add("versteckt"); });
    }).catch(function () { if (liste._lauf === lauf) { liste.innerHTML = ""; liste.appendChild(leerZustand("Mitfahrten konnten nicht geladen werden.")); } });
  }

  // ------------------------------------------------------------- Archiv
  // Alle Spiele einer Person ueber alle Saisons: aktuelles Datenfenster,
  // archiv.json (laufende Saison), eingefrorene Saison-Dateien, Datenbank.
  // Admins koennen alle Spiele aller Kollegen sehen.
  var archivStand = { spiele: [], modus: "", lauf: null };
  function archivSaisonAus(beginn) { var d = new Date(beginn), j = d.getFullYear(); return d.getMonth() >= 6 ? j + "/" + String(j + 1).slice(2) : (j - 1) + "/" + String(j).slice(2); }
  function zeigeArchiv(modus) {
    ansicht("archiv"); aktuell = null; window.scrollTo(0, 0);
    var slug = profil && profil.slug, alle = modus === "alle";
    var liste = el("archiv-liste"); liste.innerHTML = ""; liste.appendChild(skelettKarte(120)); el("archiv-zahlen").innerHTML = "";
    el("archiv-alle").checked = alle; el("archiv-person").classList.toggle("versteckt", !alle);
    el("archiv-unter").textContent = alle ? "alle Spiele aller Kollegen" : slug ? "alle deine Spiele, alle Saisons" : "erst deinen Namen wählen";
    if (!slug && !alle) { liste.innerHTML = ""; liste.appendChild(leerZustand("Wähle zuerst deinen Namen, dann stehen hier alle deine Spiele.", { label: "Namen wählen", fn: function () { zeigeAuswahl(false); location.hash = ""; } })); return; }
    var lauf = archivStand.lauf = {};
    var karte = {};
    function merge(e) {
      var k = e.kennung; if (!k) return;
      var alt = karte[k] || {};
      karte[k] = { kennung: k, beginn: e.beginn, liga: e.liga || alt.liga || "", paarung: e.paarung || alt.paarung || "", halle: e.halle || alt.halle || "", system: e.system || alt.system || 0,
                   besetzung: (e.besetzung && e.besetzung.length ? e.besetzung : alt.besetzung) || [], saison: e.saison || alt.saison || archivSaisonAus(e.beginn), manuell: e.manuell || alt.manuell || false };
    }
    function archivKorrigieren() {
      Object.keys(karte).forEach(function (k) {
        var neu = gespannKorrektur(k);
        if (neu) { karte[k].besetzung = neu; karte[k].system = neu.length; }
        if (!alle && gespannGehoert(k, slug) === false) delete karte[k];
      });
    }
    // 1) Datenfenster
    (daten.spiele || []).forEach(function (s) {
      if (!alle && !(s.besetzung || []).some(function (b) { return b.slug === slug; })) return;
      merge({ kennung: kennungVon(s), beginn: s.beginn, liga: s.liga, paarung: s.paarung, halle: s.halle, system: s.system, besetzung: (s.besetzung || []).map(function (b) { return { name: b.name, slug: b.slug, rolle: b.rolle }; }), manuell: s.manuell });
    });
    var laeufe = [];
    // 2) archiv.json (laufende Saison je Person)
    laeufe.push((archivDaten ? Promise.resolve(archivDaten) : hole("archiv.json")).then(function (a) {
      archivDaten = a; var pers = a.personen || {};
      Object.keys(pers).forEach(function (ps) {
        if (!alle && ps !== slug) return;
        pers[ps].forEach(function (e) {
          var k = e.beginn + "|" + e.paarung, vorhanden = karte[k];
          var bes = (vorhanden && vorhanden.besetzung) ? vorhanden.besetzung.slice() : [];
          var p = personMit(ps); if (!bes.some(function (b) { return b.slug === ps; })) bes.push({ name: p ? p.name : ps, slug: ps, rolle: e.rolle });
          merge({ kennung: k, beginn: e.beginn, liga: e.liga, paarung: e.paarung, halle: e.halle, system: e.system, besetzung: bes, saison: e.saison });
        });
      });
      // 3) eingefrorene Saisons
      var dateien = a.dateien || {};
      return Promise.all(Object.keys(dateien).map(function (sn) {
        return hole(dateien[sn]).then(function (d) {
          (d.spiele || []).forEach(function (z) {
            var bes = (z[4] || []).map(function (b) { return { name: b[0], slug: b[1], rolle: b[2] }; });
            if (!alle && !bes.some(function (b) { return b.slug === slug; })) return;
            merge({ kennung: z[0] + "|" + z[2], beginn: z[0], liga: z[1], paarung: z[2], halle: z[3], system: bes.length, besetzung: bes, saison: sn });
          });
        }).catch(function () {});
      }));
    }).catch(function () {}));
    // 4) Datenbank (angemeldet)
    if (sitzungVorhanden()) laeufe.push(ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.archivAusDb(alle) : null; })
      .then(function (zeilen) { (zeilen || []).forEach(function (z) { merge({ kennung: z.kennung, beginn: z.beginn, liga: z.liga, paarung: z.paarung, halle: z.halle, system: z.system, besetzung: z.besetzung || [], saison: z.saison, manuell: z.manuell }); }); }).catch(function () {}));
    // Der Schalter "alle Kollegen" ist fuer Betreiber und Obmaenner
    if (sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) { return st.eingerichtet && st.session && window.Mitglieder.darfAlleSpiele ? window.Mitglieder.darfAlleSpiele() : false; })
      .then(function (ja) { el("archiv-admin").classList.toggle("versteckt", !ja); }).catch(function () {});
    else el("archiv-admin").classList.add("versteckt");
    Promise.all(laeufe).then(function () {
      if (archivStand.lauf !== lauf) return;
      archivKorrigieren();
      archivStand.spiele = Object.keys(karte).map(function (k) { return karte[k]; }).sort(function (a, b) { return a.beginn < b.beginn ? 1 : -1; });
      archivStand.modus = modus;
      // Filterlisten fuellen
      function fuellen(id, werte, leer) { var sel = el(id), alt = sel.value; sel.innerHTML = ""; var o0 = document.createElement("option"); o0.value = ""; o0.textContent = leer; sel.appendChild(o0); werte.forEach(function (w) { var o = document.createElement("option"); o.value = w[0]; o.textContent = w[1]; sel.appendChild(o); }); sel.value = werte.some(function (w) { return w[0] === alt; }) ? alt : ""; }
      var saisons = {}, ligen = {}, hallen = {}, personen = {};
      archivStand.spiele.forEach(function (s) { saisons[s.saison] = 1; if (s.liga) ligen[s.liga] = (ligen[s.liga] || 0) + 1; if (s.halle) hallen[s.halle] = (hallen[s.halle] || 0) + 1; s.besetzung.forEach(function (b) { if (b.slug) personen[b.slug] = b.name; }); });
      fuellen("archiv-saison", Object.keys(saisons).sort().reverse().map(function (x) { return [x, "Saison " + x]; }), "Alle Saisons");
      fuellen("archiv-liga", Object.keys(ligen).sort().map(function (x) { return [x, x + " (" + ligen[x] + ")"]; }), "Alle Ligen");
      fuellen("archiv-halle", Object.keys(hallen).sort(function (a, b) { return a.localeCompare(b, "de"); }).map(function (x) { return [x, x]; }), "Alle Hallen");
      if (alle) fuellen("archiv-person", Object.keys(personen).map(function (x) { return [x, personen[x]]; }).sort(function (a, b) { return a[1].localeCompare(b[1], "de"); }), "Alle Kollegen");
      archivChips();
      archivRendern();
    });
  }
  var archivAufschluesselung = null;
  function archivCsv(treffer, wer) {
    var zeilen = [["Datum", "Uhrzeit", "Saison", "Liga", "Begegnung", "Halle", "Rolle", "System", "Gespann"]];
    treffer.slice().reverse().forEach(function (s) {
      var d = new Date(s.beginn), ich = wer ? s.besetzung.filter(function (b) { return b.slug === wer; })[0] : null;
      zeilen.push([d.toLocaleDateString("de-DE"), uhr(d), s.saison || "", s.liga || "", s.paarung || "", s.halle || "", ich ? ich.rolle : "", s.system || s.besetzung.length || "", s.besetzung.filter(function (b) { return b.slug !== wer; }).map(function (b) { return b.name + (b.rolle && s.besetzung.length >= 3 ? " (" + b.rolle + ")" : ""); }).join(" / ")]);
    });
    var text = zeilen.map(function (z) { return z.map(function (f) { return '"' + String(f).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
    var blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Archiv_" + (wer || "alle") + "_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function archivTeilen(treffer, wer) {
    var text = treffer.slice().reverse().map(function (s) { var d = new Date(s.beginn), ich = wer ? s.besetzung.filter(function (b) { return b.slug === wer; })[0] : null; return datumKurz(d) + " " + uhr(d) + " " + (s.liga ? s.liga + ": " : "") + s.paarung + (s.halle ? " · " + s.halle : "") + (ich ? " (" + ich.rolle + ")" : ""); }).join("\n");
    var titel = treffer.length + " Spiele" + (wer && personMit(wer) ? " · " + personMit(wer).name : "");
    if (navigator.share) navigator.share({ title: titel, text: titel + "\n" + text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(titel + "\n" + text).then(function () { toast("Liste kopiert.", "gut"); }).catch(function () {});
  }
  function archivFilterStand() {
    return { q: el("archiv-suche").value.trim(), s: el("archiv-saison").value, l: el("archiv-liga").value, r: el("archiv-rolle").value, h: el("archiv-halle").value };
  }
  function archivFilterSetzen(f) {
    el("archiv-suche").value = f.q || ""; el("archiv-saison").value = f.s || ""; el("archiv-liga").value = f.l || "";
    el("archiv-rolle").value = f.r || ""; el("archiv-halle").value = f.h || "";
    archivRendern();
  }
  function archivChips() {
    var box = el("archiv-chips"); box.innerHTML = "";
    var vorlagen = []; try { vorlagen = JSON.parse(lesen("archiv-filter") || "[]"); } catch (e) {}
    var suchen = []; try { suchen = JSON.parse(lesen("archiv-suchen") || "[]"); } catch (e) {}
    vorlagen.forEach(function (v) {
      var c = document.createElement("span"); c.className = "chip"; c.textContent = v.name;
      c.title = "Antippen: anwenden · lange drücken: löschen";
      c.addEventListener("click", function () { archivFilterSetzen(v.f); });
      var weg = null, t = null;
      c.addEventListener("contextmenu", function (ev) { ev.preventDefault(); loeschen(); });
      c.addEventListener("touchstart", function () { t = setTimeout(loeschen, 600); }, { passive: true });
      ["touchend", "touchmove"].forEach(function (e2) { c.addEventListener(e2, function () { clearTimeout(t); }, { passive: true }); });
      function loeschen() {
        if (!confirm("Filter „" + v.name + "“ löschen?")) return;
        schreiben("archiv-filter", JSON.stringify(vorlagen.filter(function (x) { return x !== v; }))); archivChips();
      }
      void weg; box.appendChild(c);
    });
    suchen.forEach(function (q) {
      var c = document.createElement("span"); c.className = "chip leise"; c.textContent = "„" + q + "“";
      c.addEventListener("click", function () { el("archiv-suche").value = q; archivRendern(); });
      box.appendChild(c);
    });
    var neu = document.createElement("button"); neu.type = "button"; neu.className = "textknopf"; neu.textContent = "+ Filter merken";
    neu.addEventListener("click", function () {
      var f = archivFilterStand();
      if (!f.q && !f.s && !f.l && !f.r && !f.h) { toast("Erst filtern, dann merken.", ""); return; }
      var name = prompt("Name für diesen Filter:", [f.l, f.r, f.s, f.q].filter(Boolean).join(" ") || "Mein Filter");
      if (!name) return;
      vorlagen.push({ name: name.slice(0, 30), f: f });
      schreiben("archiv-filter", JSON.stringify(vorlagen.slice(-8))); archivChips(); toast("Filter gemerkt.", "gut");
    });
    box.appendChild(neu);
  }
  function archivSucheMerken(q) {
    q = (q || "").trim(); if (q.length < 3) return;
    var l = []; try { l = JSON.parse(lesen("archiv-suchen") || "[]"); } catch (e) {}
    l = [q].concat(l.filter(function (x) { return x !== q; })).slice(0, 3);
    schreiben("archiv-suchen", JSON.stringify(l)); archivChips();
  }
  function archivRendern() {
    var liste = el("archiv-liste"); liste.innerHTML = "";
    var altBk = el("archiv").querySelector(".balken.karte"); if (altBk) altBk.remove();
    var slug = profil && profil.slug, alle = archivStand.modus === "alle";
    var f = ohneZeichen(el("archiv-suche").value), sn = el("archiv-saison").value, lg = el("archiv-liga").value, rl = el("archiv-rolle").value, hl = el("archiv-halle").value, ps = alle ? el("archiv-person").value : "";
    var wer = alle ? (ps || null) : slug;
    var treffer = archivStand.spiele.filter(function (s) {
      if (sn && s.saison !== sn) return false;
      if (lg && s.liga !== lg) return false;
      if (hl && s.halle !== hl) return false;
      if (wer && !s.besetzung.some(function (b) { return b.slug === wer; })) return false;
      if (rl) { var ich = wer ? s.besetzung.filter(function (b) { return b.slug === wer; })[0] : null; if (ich ? ich.rolle !== rl : !s.besetzung.some(function (b) { return b.rolle === rl; })) return false; }
      if (f && ohneZeichen((s.liga || "") + " " + s.paarung + " " + (s.halle || "") + " " + s.besetzung.map(function (b) { return b.name; }).join(" ")).indexOf(f) < 0) return false;
      return true;
    });
    // Kennzahlen
    var z = el("archiv-zahlen"); z.innerHTML = "";
    var rollen = {}, km = 0, hsr = 0;
    treffer.forEach(function (s) { var ich = wer ? s.besetzung.filter(function (b) { return b.slug === wer; })[0] : null; if (ich) rollen[ich.rolle] = (rollen[ich.rolle] || 0) + 1; });
    var hallenN = Object.keys(treffer.reduce(function (o, s) { if (s.halle) o[s.halle] = 1; return o; }, {})).length;
    [[treffer.length, treffer.length === 1 ? "Spiel" : "Spiele", "liga"], [hallenN, hallenN === 1 ? "Halle" : "Hallen", "halle"], [wer ? ((rollen.HSR || 0) + " / " + (rollen.LSR || 0)) : Object.keys(treffer.reduce(function (o, s) { s.besetzung.forEach(function (b) { if (b.slug) o[b.slug] = 1; }); return o; }, {})).length, wer ? "HSR / LSR" : "Kollegen", "partner"]].forEach(function (p) {
      var k = document.createElement("div"); k.className = "zahl karte tippbar" + (archivAufschluesselung === p[2] ? " neu-markiert" : ""); k.title = "Antippen: Aufschlüsselung"; k.style.cursor = "pointer";
      var b = document.createElement("b"); b.textContent = p[0]; var sp = document.createElement("span"); sp.textContent = p[1] + " ›"; k.appendChild(b); k.appendChild(sp);
      k.addEventListener("click", function () { archivAufschluesselung = archivAufschluesselung === p[2] ? null : p[2]; archivRendern(); });
      z.appendChild(k);
    });
    // Aufschluesselung als Balken (Ligen, Hallen, Gespannpartner)
    if (archivAufschluesselung) {
      var zaehl = {}, titel = { liga: "Spiele je Liga", halle: "Spiele je Halle", partner: wer ? "Gespannpartner" : "Spiele je Kollege" }[archivAufschluesselung];
      treffer.forEach(function (s) {
        if (archivAufschluesselung === "liga") zaehl[s.liga || "ohne Liga"] = (zaehl[s.liga || "ohne Liga"] || 0) + 1;
        else if (archivAufschluesselung === "halle") zaehl[s.halle || "unbekannt"] = (zaehl[s.halle || "unbekannt"] || 0) + 1;
        else s.besetzung.forEach(function (b) { if (b.slug !== wer && b.name) zaehl[b.name] = (zaehl[b.name] || 0) + 1; });
      });
      var paare = Object.keys(zaehl).map(function (k) { return [k, zaehl[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 12);
      var bk = balken(titel, paare); if (bk) { bk.style.marginTop = "10px"; z.parentNode.insertBefore(bk, z.nextSibling); z._aufschl = bk; }
    }
    // Export der gefilterten Liste
    var ex = document.createElement("div"); ex.className = "zweit"; ex.style.margin = "8px 0 0";
    var c1 = document.createElement("button"); c1.type = "button"; c1.textContent = "CSV"; c1.addEventListener("click", function () { archivCsv(treffer, wer); }); ex.appendChild(c1);
    var c2 = document.createElement("button"); c2.type = "button"; c2.className = "knopf-zeichen";
    c2.appendChild(ikone("i-teilen"));
    c2.appendChild(document.createTextNode(navigator.share ? "Liste teilen" : "Liste kopieren"));
    c2.addEventListener("click", function () { archivTeilen(treffer, wer); }); ex.appendChild(c2);
    liste.appendChild(ex);
    if (!treffer.length) { liste.appendChild(leerZustand(archivStand.spiele.length ? "Nichts passt zu den Filtern." : "Noch keine Spiele im Archiv.")); return; }
    var monat = null, box = null, n = 0;
    treffer.forEach(function (s) {
      var d = new Date(s.beginn), m = d.getFullYear() + "-" + d.getMonth();
      if (m !== monat) {
        monat = m; var h = document.createElement("div"); h.className = "archiv-monat"; var l = document.createElement("span"); l.textContent = d.toLocaleDateString("de-DE", { month: "long", year: "numeric" }); h.appendChild(l);
        var anz = treffer.filter(function (x) { var dd = new Date(x.beginn); return dd.getFullYear() + "-" + dd.getMonth() === m; }).length; var r = document.createElement("span"); r.textContent = anz + (anz === 1 ? " Spiel" : " Spiele"); h.appendChild(r);
        liste.appendChild(h); box = document.createElement("div"); box.className = "karte archiv-liste"; liste.appendChild(box);
      }
      var imFenster = (daten.spiele || []).some(function (x) { return kennungVon(x) === s.kennung; });
      var zl = document.createElement(imFenster ? "a" : "div"); zl.className = "zeile"; if (imFenster) zl.href = "#spiel/" + encodeURIComponent(s.kennung);
      var dt = document.createElement("span"); dt.className = "datum"; dt.textContent = wochentag[d.getDay()] + " " + ("0" + d.getDate()).slice(-2) + "."; var sm0 = document.createElement("small"); sm0.textContent = uhr(d); dt.appendChild(sm0); zl.appendChild(dt);
      var ich = wer ? s.besetzung.filter(function (b) { return b.slug === wer; })[0] : null;
      zl.appendChild(rolleBadge(ich ? ich.rolle : (s.system >= 3 ? s.system + "er" : "2er")));
      var tx = document.createElement("span"); tx.className = "text"; var b1 = document.createElement("b"); b1.textContent = (s.liga ? s.liga + ": " : "") + s.paarung; tx.appendChild(b1);
      var sm = document.createElement("small"); sm.textContent = (s.halle || "Halle unbekannt") + (s.besetzung.length ? " · " + s.besetzung.filter(function (b) { return b.slug !== wer; }).map(function (b) { return b.name.split(",")[0]; }).join(", ") : "") + (s.manuell ? " · vom Betreiber" : ""); tx.appendChild(sm); zl.appendChild(tx);
      box.appendChild(zl); n++;
    });
  }

  // ------------------------------------------------ Aenderungsprotokoll
  // Filter, Sortierung und Suche liegen im Geraet - sie sollen beim naechsten
  // Besuch noch stehen, gehoeren aber nicht ins Konto.
  var AEND_NAMEN = { neu: "Neu", geaendert: "Geändert", gespann: "Gespann", entfallen: "Abgesetzt", korrektur: "Korrektur", abgesagt: "Abgesagt", angelegt: "Angelegt" };
  var AEND_ARTEN = [["alle", "Alles"], ["neu", "Neu"], ["geaendert", "Geändert"], ["gespann", "Gespann"], ["entfallen", "Abgesetzt"], ["betreiber", "Betreiber"]];
  var aendFilter = null, aendDaten = null, aendGesehen = 0;
  function aendFilterLesen() {
    if (aendFilter) return aendFilter;
    aendFilter = { wer: "meine", art: "alle", tage: 14, sort: "neu", suche: "", person: "" };
    try { var g = JSON.parse(lesen("aenderungen-filter") || "{}"); Object.keys(g || {}).forEach(function (k) { if (k in aendFilter) aendFilter[k] = g[k]; }); } catch (e) {}
    aendFilter.suche = "";
    if (!(profil && profil.slug)) aendFilter.wer = "alle";
    return aendFilter;
  }
  function aendFilterMerken() {
    var f = aendFilterLesen();
    schreiben("aenderungen-filter", JSON.stringify({ wer: f.wer, art: f.art, tage: f.tage, sort: f.sort, person: f.person || "" }));
  }
  function aendArt(e) { return e.art === "korrektur" || e.art === "abgesagt" || e.art === "angelegt" ? "betreiber" : e.art; }

  function zeigeAenderungen() {
    ansicht("aenderungen"); aktuell = null; window.scrollTo(0, 0);
    var f = aendFilterLesen();
    aendGesehen = parseInt(lesen("aenderungen-gesehen") || "0", 10) || 0;
    aendKopfBauen();
    var ziel = el("aenderungen-liste"); ziel.innerHTML = ""; ziel.appendChild(skelettKarte(90));
    Promise.all([hole("protokoll.json").catch(function () { return []; }), supabaseRest("spiel_korrekturen?select=kennung,halle,beginn,treffpunkt,hinweis,abgesagt,von,geaendert").catch(function () { return []; })])
      .then(function (r) {
        var eintraege = [];
        function spielZu(kennung) { return kennung ? (daten.spiele || []).filter(function (x) { return kennungVon(x) === kennung; })[0] : null; }
        (r[0] || []).forEach(function (e) {
          var s = spielZu(e.kennung);
          eintraege.push({ zeit: e.stand, art: e.art, titel: e.text, wer: e.name, quelle: e.quelle || "",
            halle: e.art === "neu" ? (e.halle || "") : "", felder: e.felder || null, was: e.was || null,
            href: s ? "#spiel/" + encodeURIComponent(kennungVon(s)) : "#" + e.slug, slug: e.slug,
            spiel: s ? new Date(s.beginn).getTime() : spielZeitAus(e.kennung) });
        });
        (r[1] || []).forEach(function (k) {
          var s = spielZu(k.kennung);
          var teile = []; if (k.abgesagt) teile.push("abgesagt"); if (k.halle) teile.push("Halle: " + k.halle); if (k.beginn) teile.push("Anstoß " + uhr(new Date(k.beginn)) + " Uhr"); if (k.treffpunkt) teile.push("Treffpunkt " + uhr(new Date(k.treffpunkt)) + " Uhr"); if (k.hinweis) teile.push(k.hinweis);
          var d = s ? new Date(s.beginn) : (k.beginn ? new Date(k.beginn) : null);
          eintraege.push({ zeit: k.geaendert, art: k.abgesagt ? "abgesagt" : "korrektur",
            titel: (s ? datumKurz(d) + " " + uhr(d) + " · " + (s.liga ? s.liga + ": " : "") + s.paarung : k.kennung.split("|")[1] || k.kennung) + ": " + teile.join(", "),
            wer: "Betreiber" + (k.von ? " (" + k.von + ")" : ""), href: s ? "#spiel/" + encodeURIComponent(kennungVon(s)) : null,
            spiel: d ? d.getTime() : 0 });
        });
        betreiber.spiele.forEach(function (z) {
          var d = new Date(z.beginn);
          eintraege.push({ zeit: z.angelegt, art: "angelegt", titel: datumKurz(d) + " " + uhr(d) + " · " + (z.liga ? z.liga + ": " : "") + z.paarung + (z.halle ? " · " + z.halle : ""),
            wer: "Betreiber" + (z.von ? " (" + z.von + ")" : ""), was: z.besetzung && z.besetzung.length ? "Gespann: " + z.besetzung.map(function (b) { return b.name; }).join(", ") : "",
            href: "#spiel/" + encodeURIComponent("m:" + z.id), spiel: d.getTime() });
        });
        eintraege = eintraege.filter(function (e) { return !!e.zeit; });
        aendDaten = eintraege;
        aendKopfBauen(); aendRendern();
        // Erst nach dem Rendern merken, damit "neu seit dem letzten Besuch"
        // diesmal noch zu sehen ist.
        schreiben("aenderungen-gesehen", String(Date.now()));
      });
  }
  // Ohne Spiel in den Daten: die Kennung faengt mit dem Datum an
  function spielZeitAus(kennung) { var t = kennung && Date.parse(String(kennung).split("|")[0]); return t || 0; }

  function aendMeins(e) {
    if (!(profil && profil.slug)) return true;
    if (e.slug) return e.slug === profil.slug;
    var kz = e.href && e.href.indexOf("#spiel/") === 0 ? decodeURIComponent(e.href.slice(7)) : null;
    var sp = kz && (daten.spiele || []).filter(function (x) { return kennungVon(x) === kz; })[0];
    return !!(sp && (sp.besetzung || []).some(function (b) { return b.slug === profil.slug; }));
  }
  function aendGefiltert(ohneArt) {
    var f = aendFilterLesen(), grenze = Date.now() - f.tage * 86400000;
    var suche = f.suche.trim().toLowerCase();
    return (aendDaten || []).filter(function (e) {
      if (new Date(e.zeit).getTime() < grenze) return false;
      if (f.wer === "meine" && !aendMeins(e)) return false;
      if (f.wer === "alle" && f.person && e.slug !== f.person) return false;
      if (!ohneArt && f.art !== "alle" && aendArt(e) !== f.art) return false;
      if (suche) {
        var heu = (e.titel + " " + (e.wer || "") + " " + (e.was || "") + " " +
          (e.felder || []).map(function (x) { return x.feld + " " + x.vorher + " " + x.nachher; }).join(" ")).toLowerCase();
        if (heu.indexOf(suche) < 0) return false;
      }
      return true;
    });
  }

  function aendKopfBauen() {
    var kopf = el("aenderungen-kopf"); if (!kopf) return;
    var f = aendFilterLesen();
    kopf.innerHTML = "";
    // Wer: nur sinnvoll, wenn ein Profil gewaehlt ist
    if (profil && profil.slug) {
      var wer = document.createElement("div"); wer.className = "filterchips";
      [["meine", "Meine Spiele"], ["alle", "Alle Kollegen"]].forEach(function (c) {
        var b = document.createElement("button"); b.type = "button"; b.className = "filterknopf" + (f.wer === c[0] ? " aktiv" : ""); b.textContent = c[1];
        b.addEventListener("click", function () { f.wer = c[0]; aendFilterMerken(); aendKopfBauen(); aendRendern(); });
        wer.appendChild(b);
      });
      kopf.appendChild(wer);
    }
    // Art mit Zahlen - was es nicht gibt, steht auch nicht da
    var zahlen = {}; aendGefiltert(true).forEach(function (e) { var a = aendArt(e); zahlen[a] = (zahlen[a] || 0) + 1; zahlen.alle = (zahlen.alle || 0) + 1; });
    var arten = document.createElement("div"); arten.className = "filterchips";
    AEND_ARTEN.forEach(function (a) {
      if (!zahlen[a[0]] && a[0] !== "alle" && f.art !== a[0]) return;
      var b = document.createElement("button"); b.type = "button"; b.className = "filterknopf" + (f.art === a[0] ? " aktiv" : "");
      b.appendChild(document.createTextNode(a[1]));
      var z = document.createElement("i"); z.textContent = zahlen[a[0]] || 0; b.appendChild(z);
      b._art = a[0];
      b.addEventListener("click", function () { f.art = a[0]; aendFilterMerken(); aendKopfBauen(); aendRendern(); });
      arten.appendChild(b);
    });
    kopf.appendChild(arten);
    // Zeitraum, Sortierung, Person und Suche standen alle offen da - mehr
    // Bedienung als Inhalt. Jetzt liegen sie hinter einem Aufklapper, der
    // sagt, was gerade eingestellt ist.
    var mehr = document.createElement("details");
    mehr.className = "tausch aend-mehr";
    mehr.open = !!(f.suche || f.person || f.tage !== 14 || f.sort !== "neu");
    var msum = document.createElement("summary");
    var teile = [];
    if (f.tage !== 14) teile.push(f.tage === 1 ? "24 Stunden" : f.tage + " Tage");
    if (f.sort !== "neu") teile.push(f.sort === "alt" ? "Älteste zuerst" : "Nach Spieltag");
    if (f.person) teile.push("eine Person");
    if (f.suche) teile.push("Suche „" + f.suche + "“");
    msum.textContent = teile.length ? "Filter: " + teile.join(" · ") : "Zeitraum, Sortierung, Suche";
    mehr.appendChild(msum);
    kopf.appendChild(mehr);
    // Zeitraum, Sortierung, Suche
    var zeile = document.createElement("div"); zeile.className = "filterzeile";
    function wahl(wert, punkte, fn) {
      var s = document.createElement("select");
      punkte.forEach(function (p) { var o = document.createElement("option"); o.value = String(p[0]); o.textContent = p[1]; if (String(p[0]) === String(wert)) o.selected = true; s.appendChild(o); });
      s.addEventListener("change", function () { fn(s.value); aendFilterMerken(); aendKopfBauen(); aendRendern(); });
      return s;
    }
    zeile.appendChild(wahl(f.tage, [[1, "24 Stunden"], [3, "3 Tage"], [7, "7 Tage"], [14, "14 Tage"]], function (v) { f.tage = parseInt(v, 10); }));
    zeile.appendChild(wahl(f.sort, [["neu", "Neueste zuerst"], ["alt", "Älteste zuerst"], ["spieltag", "Nach Spieltag"]], function (v) { f.sort = v; }));
    mehr.appendChild(zeile);
    // Bei "Alle Kollegen": auf eine Person eingrenzen
    if (f.wer === "alle") {
      var namen = {};
      (aendDaten || []).forEach(function (e) { if (e.slug && e.wer) namen[e.slug] = e.wer; });
      var slugs = Object.keys(namen).sort(function (a, b) { return namen[a].localeCompare(namen[b], "de"); });
      if (slugs.length > 1) {
        var wz = document.createElement("div"); wz.className = "filterzeile";
        wz.appendChild(wahl(f.person || "", [["", "Alle Kollegen"]].concat(slugs.map(function (sl) { return [sl, namen[sl]]; })),
          function (v) { f.person = v; }));
        mehr.appendChild(wz);
      }
    }
    var such = document.createElement("div"); such.className = "filterzeile";
    var si = document.createElement("input"); si.type = "search"; si.placeholder = "Name, Halle, Verein, Liga …"; si.value = f.suche; si.className = "aend-suche";
    si.addEventListener("input", function () { f.suche = si.value; aendZahlen(); aendRendern(); });
    such.appendChild(si);
    // Was gerade gefiltert ist, laesst sich weitergeben - fuer die Gruppe oder
    // den Obmann, ohne Screenshot.
    var kn = document.createElement("button"); kn.type = "button"; kn.className = "filterknopf"; kn.style.flex = "none";
    kn.className = "knopf-zeichen"; kn.innerHTML = "";
    kn.appendChild(ikone("i-teilen"));
    kn.appendChild(document.createTextNode(navigator.share ? "Teilen" : "Kopieren"));
    kn.addEventListener("click", aendTeilen);
    such.appendChild(kn);
    mehr.appendChild(such);
  }

  // Tagesueberschrift: "Heute", "Gestern" oder das Datum - aber nie beides
  function tagKopf(d) { var t = tagTitel(d); return t[1] ? t[0] + " · " + datumKurz(d) : t[0]; }
  function aendTeilen() {
    var liste = aendGefiltert(false);
    if (!liste.length) { toast("Nichts zum Weitergeben.", "warn"); return; }
    var text = liste.map(function (e) {
      var d = new Date(e.zeit);
      var was = e.felder && e.felder.length
        ? e.felder.map(function (x) { return x.feld + ": " + x.vorher + " → " + x.nachher; }).join(", ")
        : (e.was || "");
      return (AEND_NAMEN[e.art] || e.art) + " · " + e.titel + (was ? "\n   " + was : "") + "\n   " + datumKurz(d) + " " + uhr(d) + " Uhr";
    }).join("\n");
    var titel = liste.length + (liste.length === 1 ? " Änderung" : " Änderungen");
    if (navigator.share) navigator.share({ title: titel, text: titel + "\n" + text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(titel + "\n" + text).then(function () { toast("Liste kopiert ✓", "gut"); }).catch(function () {});
  }
  function aendZahlen() {
    var kopf = el("aenderungen-kopf"); if (!kopf) return;
    var zahlen = {}; aendGefiltert(true).forEach(function (e) { var a = aendArt(e); zahlen[a] = (zahlen[a] || 0) + 1; zahlen.alle = (zahlen.alle || 0) + 1; });
    Array.prototype.forEach.call(kopf.querySelectorAll(".filterknopf"), function (b) {
      var i = b.querySelector("i"); if (i && b._art) i.textContent = zahlen[b._art] || 0;
    });
  }
  function aendRendern() {
    var ziel = el("aenderungen-liste"); if (!ziel) return;
    var f = aendFilterLesen();
    ziel.innerHTML = "";
    var liste = aendGefiltert(false);
    if (!liste.length) {
      var alles = (aendDaten || []).length;
      ziel.appendChild(leerZustand(
        alles ? "Mit diesen Filtern ist nichts dabei." : "In den letzten 14 Tagen hat sich nichts geändert.",
        alles ? { label: "Filter zurücksetzen", fn: function () { aendFilter = { wer: profil && profil.slug ? "meine" : "alle", art: "alle", tage: 14, sort: "neu", suche: "", person: "" }; aendFilterMerken(); aendKopfBauen(); aendRendern(); } }
              : { label: "Zum Spielplan", href: "#plan" }));
      return;
    }
    // Nach Spieltag: was noch kommt zuerst (naechstes Spiel oben), Vergangenes
    // danach - und ohne erkennbaren Spieltag ganz unten.
    if (f.sort === "spieltag") liste.sort(function (a, b) {
      var jetzt = Date.now(), av = a.spiel || 0, bv = b.spiel || 0;
      var ar = av ? (av >= jetzt ? 0 : 1) : 2, br = bv ? (bv >= jetzt ? 0 : 1) : 2;
      if (ar !== br) return ar - br;
      if (ar === 0) return av - bv;
      return bv - av || (a.zeit < b.zeit ? 1 : -1);
    });
    else liste.sort(function (a, b) { return f.sort === "alt" ? (a.zeit < b.zeit ? -1 : 1) : (a.zeit < b.zeit ? 1 : -1); });
    var neue = liste.filter(function (e) { return aendGesehen && new Date(e.zeit).getTime() > aendGesehen; }).length;
    if (neue) {
      var hin = document.createElement("div"); hin.className = "aend-neu-hinweis";
      hin.textContent = neue === 1 ? "1 Eintrag ist neu seit deinem letzten Besuch" : neue + " Einträge sind neu seit deinem letzten Besuch";
      ziel.appendChild(hin);
    }
    var gruppe = null, box = null, imTag = {}, huellen = [];
    liste.forEach(function (e, nr) {
      var d = new Date(e.zeit);
      var titel, schluessel;
      if (f.sort === "spieltag") {
        var sd = e.spiel ? new Date(e.spiel) : null;
        schluessel = sd ? sd.toDateString() : "ohne";
        titel = sd ? "Spieltag " + tagKopf(sd) : "Ohne Spieltag";
      } else { schluessel = d.toDateString(); titel = tagKopf(d); }
      if (schluessel !== gruppe) {
        gruppe = schluessel; imTag = {};
        var hh = document.createElement("div"); hh.className = "protokoll-tag"; hh.textContent = titel; ziel.appendChild(hh);
        box = document.createElement("div"); box.className = "karte protokoll"; ziel.appendChild(box);
      }
      // Wird dasselbe Spiel an einem Tag mehrfach geaendert, standen hier
      // drei fast gleiche Zeilen untereinander. Jetzt steht die erste da,
      // der Rest dahinter in einem Aufklapper.
      var k = e.href || ("x" + nr);
      if (imTag[k]) { imTag[k].weitere.push(e); return; }
      var zeileEl = aendZeile(e, d);
      var huelle = { zeile: zeileEl, weitere: [] };
      imTag[k] = huelle; huellen.push(huelle);
      box.appendChild(zeileEl);
    });
    huellen.forEach(function (hu) {
      if (!hu.weitere.length || !hu.zeile.parentNode) return;
      var det = document.createElement("details"); det.className = "aend-weitere";
      var sum = document.createElement("summary");
      sum.textContent = hu.weitere.length === 1 ? "eine weitere Änderung an diesem Spiel"
                                                : hu.weitere.length + " weitere Änderungen an diesem Spiel";
      det.appendChild(sum);
      hu.weitere.forEach(function (e2) { det.appendChild(aendZeile(e2, new Date(e2.zeit))); });
      hu.zeile.parentNode.insertBefore(det, hu.zeile.nextSibling);
    });
  }

  function aendZeile(e, d) {
    var z = document.createElement(e.href ? "a" : "div"); z.className = "zeile";
    if (e.href) z.href = e.href;
    if (aendGesehen && d.getTime() > aendGesehen) z.classList.add("frisch");
    var art = document.createElement("span"); art.className = "art " + e.art; art.textContent = AEND_NAMEN[e.art] || e.art; z.appendChild(art);
    var txt = document.createElement("span"); txt.style.minWidth = "0";
    txt.appendChild(document.createTextNode(e.titel));
    if (e.felder && e.felder.length) {
      var fl = document.createElement("span"); fl.className = "felder";
      e.felder.forEach(function (f) {
        var sp = document.createElement("span");
        var s1 = document.createElement("s"); s1.textContent = f.vorher;
        var b1 = document.createElement("b"); b1.textContent = f.nachher;
        sp.appendChild(document.createTextNode(f.feld + ": "));
        sp.appendChild(s1); sp.appendChild(document.createTextNode(" → ")); sp.appendChild(b1);
        fl.appendChild(sp);
      });
      txt.appendChild(fl);
    } else if (e.was) { var w1 = document.createElement("span"); w1.className = "felder"; var w2 = document.createElement("span"); w2.textContent = e.was; w1.appendChild(w2); txt.appendChild(w1); }
    var sm = document.createElement("small");
    sm.textContent = [e.wer, e.quelle, e.halle, uhr(d) + " Uhr"].filter(Boolean).join(" · ");
    txt.appendChild(sm); z.appendChild(txt);
    return z;
  }
  function skelettKarte(hoehe) { var d = document.createElement("div"); d.className = "skelett-karte"; d.style.height = hoehe + "px"; return d; }

  // ---------------------------------------------------------- Anleitung
  //
  // Die Schritte entstehen beim Oeffnen, nicht einmal fest: ein Schritt
  // ueber die Tauschboerse hat nichts zu suchen, wenn sie aus ist. Das
  // fuenfte Feld eines Schritts ist der Funktionsschluessel, den er
  // braucht; fehlt es, gilt der Schritt immer.
  function tourBauen(name) {
    var start = [
      ["i-home", "Willkommen bei den Einteilungen", "Diese App zeigt dir deine Schiedsrichter-Einteilungen von esrw.de, immer aktuell, mit Halle, Treffpunkt, Route und Gespann. Ein paar kurze Schritte, dann bist du startklar."],
      ["i-users", "Deinen Namen wählen", "Tippe unten in der Liste auf deinen Namen. Das ist dein Profil auf diesem Gerät, „Start“ zeigt dann deine Spiele.\nKollegen ansehen geht jederzeit über die Lupe oben."],
      ["i-cal", "Kalender abonnieren", "Auf „Start“ findest du die Kalender-Karte: „Im Kalender abonnieren“ legt ein Abo im iPhone-Kalender an. Neue oder geänderte Spiele kommen von allein aufs Handy, mit Wecker zum Treffpunkt.\nWas im Termin steht und wann der Wecker klingelt, stellst du dort unter „Anpassen“ selbst ein.", "#", "Zur Startseite"],
      ["i-bell", "Als App und Push", "Safari: Teilen → „Zum Home-Bildschirm“. Danach unter Einstellungen „Push einschalten“: dann meldet sich die App bei neuen und geänderten Einteilungen, am Spieltag und zur Abfahrt.", "#einstellungen", "Zu den Einstellungen", "push"],
      ["i-key", "Konto (freiwillig)", "Mit Konto gibt es " + funktionsText([["abrechnung", "Abrechnung (km und Vergütung automatisch)"], ["notizen", "Notizen"], ["checkliste", "Checkliste"], ["info", "Ankündigungen"], ["push", "Push auf allen Geräten"]], "und") + ". Der Betreiber schaltet dich frei.", "#mitglieder", "Konto anlegen"],
      ["i-mehr", "Wo ist was", "Start: nächstes Spiel und deine Spiele · Spielplan: alle Spiele, Filter, Woche/Monat" + (funktion("abrechnung") ? " · Abrechnung" : "") + " · Mehr: " + funktionsText([["info", "Info"], ["statistik", "Statistik"], ["notizen", "Notizen"], [null, "Einstellungen"]]) + ".\nDiese Anleitung findest du jederzeit unter Mehr → Anleitung."]
    ];
    var konto = [
      ["i-check", "Konto angelegt ✓", funktionsText([["abrechnung", "Abrechnung"], ["notizen", "Notizen"], ["checkliste", "Checkliste"], ["push", "Push"]], "und") + " gehen sofort."
        + (funktionsWorte([["tausch", "Tauschbörse"], ["frei", "Verfügbarkeit"], ["hallen", "Hallen-Hinweise"], ["gespann", "Kontakte"]]).length
           ? " " + funktionsText([["tausch", "Tauschbörse"], ["frei", "Verfügbarkeit"], ["hallen", "Hallen-Hinweise"], ["gespann", "Kontakte"]], "und")
             + " schaltet der Betreiber nach der Freischaltung frei. Du bekommst das hier zu sehen." : "")],
      ["i-bell", "Push einschalten", "Unter Einstellungen → Push: Änderungen an deinen Spielen, Spieltag-Erinnerung mit Wetter, Abfahrt, Termine, Wochenvorschau. Wann die Erinnerung kommt, stellst du selbst ein. Die App muss dafür auf dem Home-Bildschirm liegen.", "#einstellungen", "Push einschalten", "push"],
      ["i-euro", "Abrechnung", "Vergangene Spiele bekommen km und Vergütung von selbst. Am Jahresende gibt es unter „Steuerjahre“ das Jahresblatt und die CSV fürs Finanzamt. Melden musst du nichts. Belege, Fahrtenbuch und Werkzeuge unter „Weitere“.\nHeimatadresse dafür unter Einstellungen → Profil eintragen.", "#mitglieder/abrechnung", "Zur Abrechnung", "abrechnung"],
      ["i-route", "Die Spielseite", "Ein Tipp auf ein Spiel: Route, Teilen, „In Kalender“" + (funktion("wetter") ? ", Wetter" : "") + ", Abfahrtszeit"
        + (funktion("checkliste") ? ", Checkliste" : "") + (funktion("chat") ? ", Gespann-Notizen" + (funktion("push") ? " (mit Push an die Kollegen)" : "") : "")
        + (funktion("mitfahren") ? ", Fahrgemeinschaft" : "") + (funktion("notizen") ? " und deine private Notiz" : "") + "."],
      ["i-swap", "Tausch und Verfügbarkeit", "Wenn freigeschaltet: Gesuche einstellen, Kollegen finden, die frei sind, Angebote annehmen."
        + (funktion("frei") ? " Unter Verfügbarkeit trägst du Sperrtage ein." : "") + " Der Radar auf Start zeigt dann passende offene Spiele.", null, null, "tausch"],
      ["i-sun", "Alles anpassbar", "Einstellungen → Startseite: welche Bausteine auf „Start“ stehen. Bereiche, die du nicht brauchst, blendest du aus. Schrift, Farbe und Karten-App wandern mit dem Konto auf jedes Gerät.", "#einstellungen", "Einstellungen öffnen"],
      ["i-bell", "Info und Termine", "Ankündigungen vom Betreiber unter Mehr → Info. Termine (Lehrgang, Sitzung) kannst du zu- oder absagen; am Vortag kommt eine Erinnerung.", "#mitglieder/info", "Zu Info", "info"]
    ];
    var roh = name === "alles" ? start.concat(konto) : name === "konto" ? konto : start;
    return roh.filter(function (sch) { return !sch[5] || funktion(sch[5]); });
  }
  var tourSchritte = [], tourPos = 0, tourName = "";
  function tourOeffnen(name) {
    tourSchritte = tourBauen(name);
    if (!tourSchritte.length) return;
    tourName = name; tourPos = 0; tourZeigen(); el("tour").classList.remove("versteckt"); document.body.style.overflow = "hidden";
  }
  function tourSchliessen() {
    el("tour").classList.add("versteckt"); document.body.style.overflow = "";
    if (tourName === "start" || tourName === "alles") schreiben("tour-start", "1");
    if (tourName === "konto" || tourName === "alles") schreiben("tour-konto", "1");
  }
  function tourZeigen() {
    var s = tourSchritte[tourPos], sym = el("tour-symbol"); sym.innerHTML = ""; sym.appendChild(ikone(s[0]));
    el("tour-schritt").textContent = "Anleitung · " + (tourPos + 1) + " von " + tourSchritte.length;
    el("tour-titel").textContent = s[1]; el("tour-text").textContent = s[2];
    var ak = el("tour-aktion"); ak.innerHTML = "";
    if (s[3]) { var a = document.createElement("a"); a.href = s[3]; a.textContent = s[4]; a.appendChild(document.createTextNode(" ›")); a.addEventListener("click", function () { tourSchliessen(); }); ak.appendChild(a); }
    var p = el("tour-punkte"); p.innerHTML = ""; tourSchritte.forEach(function (_, i) { var d = document.createElement("i"); if (i === tourPos) d.className = "aktiv"; p.appendChild(d); });
    el("tour-zurueck").disabled = tourPos === 0;
    el("tour-weiter").textContent = tourPos === tourSchritte.length - 1 ? "Fertig" : "Weiter";
  }
  el("tour-weiter").addEventListener("click", function () { if (tourPos < tourSchritte.length - 1) { tourPos++; tourZeigen(); } else tourSchliessen(); });
  el("tour-zurueck").addEventListener("click", function () { if (tourPos > 0) { tourPos--; tourZeigen(); } });
  el("tour-weg").addEventListener("click", tourSchliessen);
  el("tour").addEventListener("click", function (ev) { if (ev.target === el("tour")) tourSchliessen(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !el("tour").classList.contains("versteckt")) tourSchliessen(); });
  function tourWennNeu() {
    if (!el("tour").classList.contains("versteckt")) return;
    if (!lesen("tour-start") && !(profil && profil.slug)) setTimeout(function () { if (lesen("tour-start")) return; tourOeffnen("start"); }, 700);
  }
  // Nach der Registrierung: auf die Startseite, mit einem Wort dazu, was
  // noch fehlt. Sonst landet man in einem Bereich, der noch leer ist.
  document.addEventListener("mg-wartet", function () {
    location.hash = "";
    // Erst nach dem Aufbau der Startseite einhaengen - sonst raeumt sie den
    // Hinweis gleich wieder weg.
    setTimeout(wartehinweisZeigen, 250);
  });
  function wartehinweisZeigen() {
    // Die Startseite ist der Bereich "detail" mit der Hauptspalte darin
    var ziel = document.querySelector("#detail .spalte-haupt"); if (!ziel) return;
    var alt = el("wartehinweis"); if (alt) alt.remove();
    var d = document.createElement("div");
    d.className = "hinweis warn"; d.id = "wartehinweis";
    d.appendChild(ikone("i-lock"));
    var t = document.createElement("span");
    var b = document.createElement("b"); b.textContent = "Dein Konto steht.";
    t.appendChild(b);
    var danach = funktionsText([[null, "Einteilungen"], ["telefon", "Kollegen"], ["tausch", "Tausch"],
      ["frei", "Verfügbarkeit"], ["hallen", "Hallen-Hinweise"]], "und");
    var schon = funktionsText([["abrechnung", "Abrechnung"], ["notizen", "Notizen"], ["checkliste", "Checkliste"]], "und");
    t.appendChild(document.createTextNode(" Jetzt schaltet der Betreiber dich frei. Danach siehst du " + danach + ". "
      + (schon ? schon + " kannst du schon benutzen." : "")));
    d.appendChild(t);
    ziel.insertBefore(d, ziel.firstChild);
    window.scrollTo(0, 0);
  }
  document.addEventListener("mg-neu-konto", function () { if (!lesen("tour-konto")) setTimeout(function () { tourOeffnen("konto"); }, 600); });
  document.addEventListener("mg-profil", function () { if (!lesen("tour-konto") && sitzungVorhanden() && el("tour").classList.contains("versteckt")) setTimeout(function () { if (!lesen("tour-konto")) tourOeffnen("konto"); }, 900); });

  function diagnoseText() {
    return Object.keys(diagnose).map(function (k) { return k + ": " + diagnose[k]; }).join("\n");
  }
  var diagnose = {};
  // Sperrseite: sagt, was fehlt, und fuehrt zur Anmeldung - kein stilles
  // Umleiten, sonst sucht man den Fehler bei sich.
  var GESPERRT_NAMEN = { archiv: ["Archiv", "alle deine Spiele über alle Saisons, mit Filtern und Export"],
    statistik: ["Statistik", "Saison, Ligen, Hallen, Partner und dein Saisonziel"],
    aenderungen: ["Änderungen", "was sich zuletzt getan hat, mit Vorher und Nachher"],
    mitfahren: ["Zusammen fahren", "wer wohin fährt, Mitfahrt anbieten oder suchen"],
    karte: ["Hallenkarte", "alle Hallen auf der Karte"] };
  function zeigeSperre(slug) {
    ansicht("gesperrt"); aktuell = null; window.scrollTo(0, 0);
    var n = GESPERRT_NAMEN[String(slug).split("/")[0]] || ["Dieser Bereich", "nur für Mitglieder"];
    el("gesperrt-titel").textContent = n[0];
    el("gesperrt-text").textContent = n[1];
  }
  function zeigeStatus() {
    ansicht("status"); aktuell = null;
    var liste = el("status-liste"); liste.innerHTML = "";
    diagnose = {
      "App-Fassung": NEUIGKEITEN.version, "Adresse": location.href.split("#")[0],
      "Datenstand": letzterStand || "?", "Spiele / Personen": daten ? daten.spiele_gesamt + " / " + daten.personen.length : "?",
      "Profil": profil && profil.slug ? profil.slug : "keins", "Thema": lesen("thema") || "System", "Schrift": lesen("schrift") || "normal",
      "Online": navigator.onLine ? "ja" : "nein", "Als App": alsApp() ? "ja" : "nein",
      "Mitteilungen": ("Notification" in window) ? Notification.permission : "nicht verfügbar",
      "Browser": navigator.userAgent.replace(/Mozilla\/5\.0 \(/, "(").slice(0, 120),
      "Letzter Fehler": letzterFehler ? letzterFehler.zeit.slice(11, 19) + " " + letzterFehler.text : "keiner"
    };
    try { var n = 0; for (var i = 0; i < localStorage.length; i++) n += (localStorage.getItem(localStorage.key(i)) || "").length; diagnose["Speicher (localStorage)"] = Math.round(n / 1024) + " kB"; } catch (e) { diagnose["Speicher (localStorage)"] = "gesperrt"; }
    function rendern() {
      liste.innerHTML = "";
      Object.keys(diagnose).forEach(function (k) {
        var z = document.createElement("div"); var a = document.createElement("span"); a.textContent = k; var b = document.createElement("span"); b.textContent = diagnose[k];
        z.appendChild(a); z.appendChild(b); liste.appendChild(z);
      });
    }
    rendern();
    if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistration().then(function (reg) {
      diagnose["Service Worker"] = reg ? (reg.active ? "aktiv" : "wartet") : "keiner";
      return reg && reg.pushManager ? reg.pushManager.getSubscription().then(function (abo) { diagnose["Push-Abo"] = abo ? "vorhanden" : "keins"; }) : null;
    }).then(rendern).catch(function () {});
    if (sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) {
      diagnose["Mitglieder"] = !st.eingerichtet ? "nicht eingerichtet" : st.session ? "angemeldet als " + (st.session.user && st.session.user.email) : "nicht angemeldet";
      rendern();
    }).catch(function (e) { diagnose["Mitglieder"] = "Fehler: " + (e.message || e); rendern(); });
    else diagnose["Mitglieder"] = "nicht angemeldet";
    el("status-kopieren").onclick = function () {
      if (navigator.clipboard) navigator.clipboard.writeText(diagnoseText()).then(function () { toast("Diagnose kopiert ✓", "gut"); }, function () { prompt("Diagnose:", diagnoseText()); });
      else prompt("Diagnose:", diagnoseText());
    };
    window.scrollTo(0, 0);
  }

  // Selten gebraucht: steht in der einfachen Ansicht zugeklappt am Ende.
  var MEHR_SELTEN = { "#statistik": 1, "#mitglieder/frei": 1, "#anleitung": 1, "#status": 1 };
  // Was unter "Mehr" steht, haengt an Funktionen und Anmeldung. Die Liste
  // entsteht dort; die Suche greift darauf zu, statt sie nachzubauen.
  var mehrEintraege = [];

  function zeigeMehr() {
    ansicht("mehr"); aktuell = null;
    var liste = el("mehr-liste"); liste.innerHTML = "";
    var eintraege = [
      ["F\u00fcr dich"],
      funktion("archiv") ? ["#archiv", "i-clock", "Archiv", "Alle deine Spiele, alle Saisons, mit Filtern und Export"] : null,
      funktion("statistik") ? ["#statistik", "i-balken", "Statistik", "Saison, Ligen, Hallen, Partner, Saisonziel"] : null,
      funktion("aenderungen") ? ["#aenderungen", "i-list", "\u00c4nderungen", "Was sich in 14 Tagen getan hat \u2013 mit Vorher/Nachher"] : null,
      funktion("notizen") ? ["#mitglieder/notizen", "i-note", "Notizen", "Private Spielnotizen"] : null,
      funktion("regeln") ? ["#regeln", "i-buch", "Regeln", "Strafenmatrix, Spielzeiten und Bestimmungen, auch offline"] : null,
      funktion("rechner") ? ["#rechner", "i-rechner", "Strafrechner", "Wer sitzt, wer spielt: die Stärke auf dem Eis"] : null,
      ["Gemeinsam"],
      funktion("mitfahren") ? ["#mitfahren", "i-route", "Zusammen fahren", "Wer f\u00e4hrt wohin \u2013 auf dem Weg, bieten, suchen"] : null,
      funktion("telefon") ? ["#mitglieder/kollegen", "i-users", "Kollegen", "Telefonliste \u2013 anrufen, WhatsApp, kopieren"] : null,
      funktion("info") ? ["#mitglieder/info", "i-info", "Info", "Ank\u00fcndigungen und Termine", "info"] : null,
      funktion("frei") ? ["#mitglieder/frei", "i-cal", "Verf\u00fcgbarkeit", "Wann du nicht kannst oder gern pfeifst"] : null,
      funktion("hallen") ? ["#karte", "i-pin", "Hallenkarte", "Alle Hallen auf der Karte"] : null,
      ["Konto und App"],
      ["#einstellungen", "i-key", "Einstellungen", "Konto, Push, Startseite, Schrift, Farbe"],
      ["#mitglieder/admin", "i-shield", "Admin", "Freischaltung, Ank\u00fcndigungen", "wartend", true],
      ["#anleitung", "i-mehr", "Anleitung", "Kalender, Push, Konto \u2013 Schritt f\u00fcr Schritt"],
      ["#status", "i-check", "Diagnose", "F\u00fcr die Fehlersuche"]
    ];
    var links = {}, selten = [];
    eintraege = eintraege.filter(Boolean).filter(function (e) { return e.length === 1 || !gesperrtFuerMich(e[0]); });
    if (einfachAn()) eintraege = eintraege.filter(function (e) {
      if (e.length > 1 && MEHR_SELTEN[e[0]]) { selten.push(e); return false; }
      return true;
    });
    eintraege = eintraege.filter(function (e, i, a) { return e.length > 1 || (a[i + 1] && a[i + 1].length > 1); });
    if (!sitzungVorhanden()) eintraege.unshift(["#mitglieder", "i-lock", "Anmelden", "Konto anlegen oder anmelden \u2013 f\u00fcr " + [funktion("tausch") ? "Tausch" : "", funktion("abrechnung") ? "Abrechnung" : "", funktion("info") ? "Info" : "", "Notizen"].filter(Boolean).join(", ")]);

    // Die Seiten kennt jetzt auch die Lupe oben - eine Suche reicht
    mehrEintraege = eintraege.filter(function (e) { return e.length > 1; });

    function kachel(e) {
      var a = document.createElement("a"); a.href = e[0]; a.appendChild(ikone(e[1]));
      var sp = document.createElement("span"); sp.textContent = e[2]; var sm = document.createElement("small"); sm.textContent = e[3]; sp.appendChild(sm); a.appendChild(sp);
      if (e[4]) { var z = document.createElement("span"); z.className = "zaehler versteckt"; a.appendChild(z); links[e[4]] = z; }
      if (e[5]) { a.classList.add("versteckt"); a._nurAdmin = true; }
      a._ziel = e[0];
      return a;
    }
    eintraege.forEach(function (e) {
      if (e.length === 1) { var g = document.createElement("div"); g.className = "menue-gruppe"; g.textContent = e[0]; liste.appendChild(g); return; }
      liste.appendChild(kachel(e));
    });
    // Hat der Betreiber alles abgeschaltet, soll hier nicht nur Leere stehen
    if (!eintraege.some(function (e) { return e.length > 1; }) && !selten.length) {
      liste.appendChild(leerZustand("Der Betreiber hat die Zusatzbereiche abgeschaltet. Spielplan und Startseite gehen weiter.", { label: "Zum Spielplan", href: "#plan" }));
    }
    if (selten.length) {
      var kopf = document.createElement("button");
      kopf.type = "button"; kopf.className = "menue-gruppe menue-mehr";
      kopf.textContent = "Selten gebraucht (" + selten.length + ")";
      liste.appendChild(kopf);
      var kacheln = selten.map(function (e) { var a = kachel(e); a.classList.add("versteckt"); liste.appendChild(a); return a; });
      kopf.addEventListener("click", function () {
        var auf = kacheln[0].classList.contains("versteckt");
        kacheln.forEach(function (a) { a.classList.toggle("versteckt", !auf); });
        kopf.classList.toggle("offen", auf);
      });
    }

    // Umschalter oben: einfache Ansicht oder alles
    var wahl = el("mehr-ansicht");
    if (wahl) {
      wahl.innerHTML = "";
      [["Einfach", true], ["Alles", false]].forEach(function (w) {
        var b = document.createElement("button"); b.type = "button";
        b.className = "filterknopf" + (einfachAn() === w[1] ? " aktiv" : "");
        b.textContent = w[0];
        b.addEventListener("click", function () { einfachSetzen(w[1]); });
        wahl.appendChild(b);
      });
    }

    mehrZahlen(liste);
    if (sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { if (st.eingerichtet && st.session) return window.Mitglieder.zaehler(); })
      .then(function (z) {
        if (!z) return;
        if (z.admin) Array.prototype.forEach.call(liste.querySelectorAll("a"), function (a) {
          if (!a._nurAdmin) return;
          a.classList.remove("versteckt");
          if (!z.nurObmann) return;
          var sp = a.querySelector("span"); if (!sp) return;
          sp.firstChild.nodeValue = "Obmann";
          var sm = sp.querySelector("small"); if (sm) sm.textContent = "Was der Betreiber für dich freigegeben hat";
        });
        Object.keys(links).forEach(function (k) { if (z[k]) { links[k].textContent = z[k]; links[k].classList.remove("versteckt"); } });
      }).catch(function () {});
    window.scrollTo(0, 0);
  }
  // ---------------------------------------------------------- Regeln
  //
  // Zwei Nachschlagewerke fuer die Bande: die Strafenmatrix (Regelnummer,
  // Stichwort, welche Strafarten die Regel kennt) und die Punkte aus den
  // Durchfuehrungsbestimmungen, die Schiedsrichter betreffen. Beides sind
  // eigene Zusammenstellungen - der Wortlaut steht in den verlinkten
  // Dokumenten, und die liegen beim Verband, nicht hier.
  var regelnDaten = null, bestimmungenDaten = null, zeitenDaten = null, staerkenDaten = null, regelnTeil = "strafen", regelArt = "";
  // Die Suche oben faengt damit an, was sie schon geladen hat; sonst holt sie nach.
  // Jede Strafart hat ihre Farbe - von Gruen (2) bis Rot (MS). Die Klasse
  // kommt aus dem Kuerzel: "5+SPD" -> "farbe-5spd".
  function strafFarbe(code) {
    return "farbe-" + String(code).toLowerCase().replace(/\+/g, "").replace(/[^a-z0-9]/g, "");
  }
  function zeigeRegeln() {
    ansicht("regeln"); aktuell = null;
    Array.prototype.forEach.call(el("regeln-modus").querySelectorAll("button"), function (b) {
      b.classList.toggle("aktiv", b.getAttribute("data-teil") === regelnTeil);
      if (b._an) return;
      b._an = true;
      b.addEventListener("click", function () { regelnTeil = b.getAttribute("data-teil"); regelArt = ""; zeigeRegeln(); });
    });
    var suche = el("regeln-filter");
    if (!suche._an) { suche._an = true; suche.addEventListener("input", regelnZeichnen); }
    el("regeln-suchzeile").classList.toggle("versteckt", regelnTeil !== "strafen");
    el("regeln-arten").classList.toggle("versteckt", regelnTeil !== "strafen");
    Promise.all([
      regelnDaten ? Promise.resolve(regelnDaten) : hole("strafen.json").catch(function () { return null; }),
      bestimmungenDaten ? Promise.resolve(bestimmungenDaten) : hole("bestimmungen.json").catch(function () { return null; }),
      zeitenDaten ? Promise.resolve(zeitenDaten) : zeitenLaden(),
      staerkenDaten ? Promise.resolve(staerkenDaten) : staerkenLaden()
    ]).then(function (r) {
      regelnDaten = r[0] || regelnDaten; bestimmungenDaten = r[1] || bestimmungenDaten;
      zeitenDaten = r[2] || zeitenDaten; staerkenDaten = r[3] || staerkenDaten;
      regelnZeichnen();
    });
    window.scrollTo(0, 0);
  }
  // Mindestantrittsstaerken kommen nur aus der Datenbank - sie stehen in
  // den Bestimmungen des Verbandes und aendern sich selten, aber es gibt
  // keine Startfassung in der App.
  function staerkenLaden() {
    var leer = { staerken: [], einsatz: [] };
    if (!sitzungVorhanden()) return Promise.resolve(leer);
    return ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { return st.eingerichtet && st.session && window.Mitglieder.antrittsstaerken ? window.Mitglieder.antrittsstaerken() : leer; })
      .catch(function () { return leer; });
  }

  // Spielzeiten: der Betreiber pflegt sie in der Datenbank, die Datei in
  // der App ist Startfassung und Rueckfalloption (auch offline).
  function zeitenLaden() {
    var ausDatei = hole("spielzeiten.json").catch(function () { return null; });
    if (!sitzungVorhanden()) return ausDatei;
    return ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.spielzeiten() : null; })
      .then(function (reihen) {
        return ausDatei.then(function (d) {
          if (!d) d = { ligen: [], allgemein: [] };
          if (reihen && reihen.length) {
            d = { _hinweis: d._hinweis, stand: d.stand, quelle: d.quelle, allgemein: d.allgemein, ligen: reihen };
          }
          return d;
        });
      }).catch(function () { return ausDatei; });
  }

  // Strafrechner: was bleibt bei mehreren Strafen auf dem Eis? Regel 19.4
  // gibt die Reihenfolge vor - erst Grosse streichen, dann Kleine. Was sich
  // aufhebt, wird sofort ersetzt und zaehlt nicht fuer die Staerke.
  var rechner = { a: [], b: [], laufA: 0, laufB: 0, offen: false };
  var R_ARTEN = [
    { k: "2", t: "Kleine Strafe", e: [2] },
    { k: "2+2", t: "Doppelte kleine", e: [2, 2] },
    { k: "5", t: "Grosse Strafe", e: [5] },
    { k: "5+SPD", t: "Grosse mit Spieldauer", e: [5], mit: true },
    { k: "MS", t: "Matchstrafe", e: [5], mit: true },
    { k: "SPD", t: "Spieldauer", e: [] },
    { k: "10", t: "Disziplinar", e: [] }
  ];
  function rArt(k) { return R_ARTEN.filter(function (x) { return x.k === k; })[0] || R_ARTEN[0]; }

  function rechnerErgebnis() {
    function zaehlen(liste) {
      var z = { gross: 0, klein: 0 };
      liste.forEach(function (k) { rArt(k).e.forEach(function (m) { if (m === 5) z.gross++; else z.klein++; }); });
      return z;
    }
    var A2 = zaehlen(rechner.a), B2 = zaehlen(rechner.b);
    var wegGross = Math.min(A2.gross, B2.gross), wegKlein = Math.min(A2.klein, B2.klein);
    A2.gross -= wegGross; B2.gross -= wegGross; A2.klein -= wegKlein; B2.klein -= wegKlein;
    function uhr(z) {
      var l = [];
      for (var i = 0; i < z.klein; i++) l.push("2 Min");
      for (var j = 0; j < z.gross; j++) l.push("5 Min");
      return l;
    }
    var sichtA = rechner.laufA + A2.gross + A2.klein, sichtB = rechner.laufB + B2.gross + B2.klein;
    return {
      a: A2, b: B2, uhrA: uhr(A2), uhrB: uhr(B2), sichtA: sichtA, sichtB: sichtB,
      wegGross: wegGross, wegKlein: wegKlein,
      staerkeA: 5 - Math.min(2, sichtA), staerkeB: 5 - Math.min(2, sichtB)
    };
  }

  function strafrechnerKarte() {
    var d = document.createElement("div");
    d.className = "karte rechner-karte";
    var koerper = document.createElement("div");
    d.appendChild(koerper);

    function team(name, schluessel, laufSchluessel) {
      var kasten = document.createElement("div"); kasten.className = "rechner-team";
      var t = document.createElement("b"); t.textContent = name; kasten.appendChild(t);

      var chips = document.createElement("div"); chips.className = "rechner-chips";
      R_ARTEN.forEach(function (art) {
        var b = document.createElement("button"); b.type = "button";
        b.className = "chip " + strafFarbe(art.k);
        b.textContent = "+ " + art.k; b.title = art.t;
        b.addEventListener("click", function () { rechner[schluessel].push(art.k); zeichne(); });
        chips.appendChild(b);
      });
      kasten.appendChild(chips);

      var gewaehlt = document.createElement("div"); gewaehlt.className = "rechner-gewaehlt";
      if (!rechner[schluessel].length) {
        var leer = document.createElement("small"); leer.textContent = "keine Strafe in dieser Unterbrechung";
        gewaehlt.appendChild(leer);
      }
      rechner[schluessel].forEach(function (k, i) {
        var b = document.createElement("button"); b.type = "button";
        b.className = "chip ich " + strafFarbe(k);
        b.textContent = k + " \u00d7"; b.title = rArt(k).t + " entfernen";
        b.addEventListener("click", function () { rechner[schluessel].splice(i, 1); zeichne(); });
        gewaehlt.appendChild(b);
      });
      kasten.appendChild(gewaehlt);

      var lauf = document.createElement("div"); lauf.className = "rechner-lauf";
      var lt = document.createElement("span"); lt.textContent = "läuft schon"; lauf.appendChild(lt);
      function schritt(zeichen, wert) {
        var b = document.createElement("button"); b.type = "button"; b.className = "schrittknopf";
        b.textContent = zeichen;
        b.addEventListener("click", function () {
          rechner[laufSchluessel] = Math.max(0, Math.min(3, rechner[laufSchluessel] + wert)); zeichne();
        });
        return b;
      }
      lauf.appendChild(schritt("\u2212", -1));
      var z = document.createElement("b"); z.textContent = String(rechner[laufSchluessel]); lauf.appendChild(z);
      lauf.appendChild(schritt("+", 1));
      kasten.appendChild(lauf);
      return kasten;
    }

    function zeichne() {
      while (koerper.firstChild) koerper.removeChild(koerper.firstChild);
      var hinweis = document.createElement("p"); hinweis.className = "meta"; hinweis.style.margin = "0 0 8px";
      hinweis.textContent = "Strafen aus einer Unterbrechung antippen, dazu die Strafen, die schon laufen.";
      koerper.appendChild(hinweis);
      koerper.appendChild(team("Heim", "a", "laufA"));
      koerper.appendChild(team("Gast", "b", "laufB"));

      var e = rechnerErgebnis();
      var erg = document.createElement("div"); erg.className = "rechner-ergebnis";
      var gross = document.createElement("b"); gross.className = "rechner-staerke";
      gross.textContent = e.staerkeA + " gegen " + e.staerkeB;
      erg.appendChild(gross);
      var wer = document.createElement("small");
      wer.textContent = e.staerkeA === e.staerkeB ? "gleiche Stärke" :
        (e.staerkeA > e.staerkeB ? "Heim in Überzahl" : "Gast in Überzahl");
      erg.appendChild(wer);

      [["Heim", e.uhrA, rechner.laufA], ["Gast", e.uhrB, rechner.laufB]].forEach(function (paar) {
        var z = document.createElement("div"); z.className = "zeiten-wert";
        var k = document.createElement("span"); k.textContent = paar[0] + " auf die Uhr"; z.appendChild(k);
        var v = document.createElement("b");
        v.textContent = paar[1].length ? paar[1].join(" + ") : "nichts Neues";
        if (paar[2]) v.textContent += " (dazu " + paar[2] + " laufend)";
        z.appendChild(v);
        erg.appendChild(z);
      });
      koerper.appendChild(erg);

      var saetze = [];
      if (e.wegGross + e.wegKlein) {
        var weg = e.wegGross + e.wegKlein;
        saetze.push((weg === 1 ? "Je eine Strafe hebt sich auf" : "Je " + weg + " Strafen heben sich auf")
          + ". Die Spieler sitzen ab, ersetzt wird sofort, die Stärke bleibt gleich (Regel 19.4).");
      }
      if (e.sichtA > 2 || e.sichtB > 2) {
        saetze.push("Eine Mannschaft hat drei Strafen. Die dritte läuft erst an, wenn eine der beiden ersten "
          + "abgelaufen ist, auf dem Eis bleiben nie weniger als drei Feldspieler (Regel 26).");
      }
      if ((e.a.klein && e.b.gross) || (e.b.klein && e.a.gross)) {
        saetze.push("In den letzten fünf Minuten und in der Verlängerung wird die Differenz aus Kleiner und "
          + "Grosser Strafe sofort als Grosse Strafe über drei oder eine Minute angesagt (Regel 19.3).");
      }
      if (rechner.a.concat(rechner.b).some(function (k) { return rArt(k).mit; })) {
        saetze.push("Bei Matchstrafe und Grosser Strafe mit Spieldauer sitzt ein Mitspieler die fünf Minuten ab.");
      }
      if (rechner.a.concat(rechner.b).some(function (k) { return k === "SPD" || k === "10"; })) {
        saetze.push("Spieldauer und Disziplinarstrafe stehen nicht auf der Strafzeituhr, die Mannschaft ist "
          + "dadurch nicht in Unterzahl.");
      }
      saetze.forEach(function (t) {
        var p2 = document.createElement("small"); p2.className = "zeiten-hinweis"; p2.textContent = t;
        koerper.appendChild(p2);
      });

      if (rechner.a.length || rechner.b.length || rechner.laufA || rechner.laufB) {
        var zurueck = document.createElement("button"); zurueck.type = "button"; zurueck.className = "textknopf";
        zurueck.style.marginTop = "8px";
        zurueck.textContent = "Zurücksetzen";
        zurueck.addEventListener("click", function () {
          rechner.a = []; rechner.b = []; rechner.laufA = 0; rechner.laufB = 0; zeichne();
        });
        koerper.appendChild(zurueck);
      }
    }
    zeichne();
    return d;
  }

  // Liga des naechsten eigenen Spiels - damit die Spielzeiten gleich beim
  // richtigen Eintrag aufgehen, wenn man an der Bande nachschlaegt.
  function naechsteLiga() {
    if (!profil || !profil.slug) return "";
    var p = personMit(profil.slug);
    var s = p && (p.spiele || []).filter(function (x) { return !x.vergangen; })[0];
    return (s && s.liga) || "";
  }
  function ligaPasst(eintrag, liga) {
    if (!liga || !eintrag) return false;
    var lg = ohneZeichen(liga);
    return String(eintrag).split(/[,\/]/).some(function (t) {
      t = ohneZeichen(t.trim());
      return t.length > 1 && (lg.indexOf(t) >= 0 || t.indexOf(lg) >= 0);
    });
  }

  // Der Rechner hat eine eigene Seite - auf der Regelseite stand er den
  // 24 Vergehen im Weg, und in der Leiste unten ist er schneller da.
  function zeigeRechner() {
    ansicht("rechner"); aktuell = null;
    var ziel = el("rechner-inhalt"); ziel.innerHTML = "";
    if (!regelnDaten) {
      hole("strafen.json").then(function (d) { regelnDaten = d; if (!el("rechner").classList.contains("versteckt")) zeigeRechner(); }).catch(function () {});
    }
    ziel.appendChild(strafrechnerKarte());
    ziel.appendChild(hinweisKarte("Gerechnet nach Regel 19.4: erst so viele Grosse Strafen streichen wie möglich, dann die Kleinen. Auf dem Eis bleiben nie weniger als drei Feldspieler."));
    var zu = document.createElement("p"); zu.className = "meta";
    var a = document.createElement("a"); a.href = "#regeln"; a.textContent = "Zur Strafentabelle ›";
    zu.appendChild(a); ziel.appendChild(zu);
    window.scrollTo(0, 0);
  }

  function regelnZeichnen() {
    var ziel = el("regeln-liste"); ziel.innerHTML = "";
    var arten = el("regeln-arten"); arten.innerHTML = "";
    if (regelnTeil === "staerken") {
      el("regeln-unter").textContent = "Mindestantrittsstärken";
      if (!sitzungVorhanden()) { ziel.appendChild(hinweisKarte("Die Antrittsstärken stehen angemeldeten Kollegen offen.")); return; }
      var st = (staerkenDaten && staerkenDaten.staerken) || [];
      var ein = (staerkenDaten && staerkenDaten.einsatz) || [];
      if (!st.length && !ein.length) {
        ziel.appendChild(hinweisKarte("Noch nichts hinterlegt. Der Betreiber pflegt die Zahlen unter Admin → Antrittsstärken."));
        return;
      }
      var meineL = naechsteLiga();
      // Nach Saison gruppieren - die laufende steht offen, die naechste
      // darunter zum Aufklappen.
      var saisons = [];
      // Die Reihenfolge kommt aus der Datenbank, aber verlassen wir uns
      // nicht darauf - sortiert wird hier noch einmal.
      st = st.slice().sort(function (x, y) {
        if ((x.saison || "") !== (y.saison || "")) return (x.saison || "") < (y.saison || "") ? 1 : -1;
        return (x.reihenfolge || 100) - (y.reihenfolge || 100);
      });
      st.forEach(function (l) {
        var g = saisons.filter(function (x) { return x.titel === (l.saison || "ohne Saison"); })[0];
        if (!g) { g = { titel: l.saison || "ohne Saison", zeilen: [] }; saisons.push(g); }
        g.zeilen.push(l);
      });
      var jetzt = (daten && daten.saison) || "";
      saisons.forEach(function (g, nr) {
        var d = document.createElement("details"); d.className = "karte bestimmung-block";
        d.open = jetzt ? g.titel === jetzt : !nr;
        var sm = document.createElement("summary");
        var t = document.createElement("span");
        var b = document.createElement("b"); b.textContent = "Saison " + g.titel; t.appendChild(b);
        var anz = document.createElement("small");
        anz.textContent = g.zeilen.length + (g.zeilen.length === 1 ? " Altersklasse" : " Altersklassen")
          + (g.titel === jetzt ? " · läuft" : "");
        t.appendChild(anz);
        sm.appendChild(t); d.appendChild(sm);
        // Als Tabelle: Klasse, Feldspieler, Torhueter - so steht es auch
        // in den Bestimmungen, und so liest es sich am Spieltag am besten.
        var tab = document.createElement("div"); tab.className = "staerke-tabelle";
        var kopf = document.createElement("div"); kopf.className = "staerke-kopf";
        ["Altersklasse", "Feld", "Tor"].forEach(function (x) {
          var c = document.createElement("span"); c.textContent = x; kopf.appendChild(c);
        });
        tab.appendChild(kopf);
        g.zeilen.forEach(function (l) {
          var r2 = document.createElement("div"); r2.className = "staerke-zeile";
          if (ligaPasst(l.liga, meineL)) r2.classList.add("meine");
          var n1 = document.createElement("span"); n1.textContent = l.liga; r2.appendChild(n1);
          var n2 = document.createElement("b"); n2.textContent = (l.feldspieler || "–").replace(/\s*Feldspieler$/, ""); r2.appendChild(n2);
          var n3 = document.createElement("b"); n3.textContent = l.torwart || "–"; r2.appendChild(n3);
          tab.appendChild(r2);
          if (l.wartezeit || l.folge || l.hinweis) {
            var zus = document.createElement("small"); zus.className = "staerke-zusatz";
            zus.textContent = [l.wartezeit ? "Wartezeit: " + l.wartezeit : "",
                               l.folge ? "Reicht es nicht: " + l.folge : "", l.hinweis].filter(Boolean).join(" · ");
            tab.appendChild(zus);
          }
        });
        d.appendChild(tab);
        var q = (g.zeilen.filter(function (l) { return l.quelle; })[0] || {}).quelle;
        if (q) { var qe = document.createElement("small"); qe.className = "fundstelle"; qe.textContent = q; d.appendChild(qe); }
        ziel.appendChild(d);
      });

      // Wer darf eine Klasse tiefer spielen?
      if (ein.length) {
        var ed = document.createElement("details"); ed.className = "karte bestimmung-block";
        var esm = document.createElement("summary");
        var et = document.createElement("span");
        var eb = document.createElement("b"); eb.textContent = "Einsatz in der nächst niedrigeren Klasse"; et.appendChild(eb);
        var esmall = document.createElement("small"); esmall.textContent = "wer darf eine Klasse tiefer spielen"; et.appendChild(esmall);
        esm.appendChild(et); ed.appendChild(esm);
        ein.forEach(function (e) {
          var z2 = document.createElement("div"); z2.className = "zeiten-zeile";
          var k2 = document.createElement("b"); k2.textContent = e.was; z2.appendChild(k2);
          [["2026/27", e.saison_a], ["2027/28", e.saison_b]].forEach(function (paar) {
            var r3 = document.createElement("div"); r3.className = "zeiten-wert";
            var ks = document.createElement("span"); ks.textContent = paar[0]; r3.appendChild(ks);
            var vs = document.createElement("b"); vs.textContent = paar[1] || "nicht möglich"; r3.appendChild(vs);
            if (!paar[1]) vs.className = "aus";
            z2.appendChild(r3);
          });
          if (e.hinweis) { var hw2 = document.createElement("small"); hw2.className = "zeiten-hinweis"; hw2.textContent = e.hinweis; z2.appendChild(hw2); }
          ed.appendChild(z2);
        });
        ziel.appendChild(ed);
      }
      return;
    }
    if (regelnTeil === "zeiten") {
      el("regeln-unter").textContent = zeitenDaten ? "Spielzeiten, " + (zeitenDaten.stand || "") : "Spielzeiten";
      if (!zeitenDaten) { ziel.appendChild(hinweisKarte("Spielzeiten nicht geladen.")); return; }
      var meine = naechsteLiga();
      var gruppen = [];
      (zeitenDaten.ligen || []).forEach(function (l) {
        var g = gruppen.filter(function (x) { return x.titel === (l.gruppe || "Ligen"); })[0];
        if (!g) { g = { titel: l.gruppe || "Ligen", zeilen: [] }; gruppen.push(g); }
        g.zeilen.push(l);
      });
      var offeneGruppe = null;
      gruppen.forEach(function (g) {
        g.zeilen.forEach(function (l) { if (!offeneGruppe && ligaPasst(l.liga, meine)) offeneGruppe = g; });
      });
      gruppen.forEach(function (g, nr) {
        var d = document.createElement("details"); d.className = "karte bestimmung-block";
        d.open = offeneGruppe ? g === offeneGruppe : !nr;
        var sm = document.createElement("summary");
        var t = document.createElement("span");
        var b = document.createElement("b"); b.textContent = g.titel; t.appendChild(b);
        var anz = document.createElement("small"); anz.textContent = g.zeilen.length + (g.zeilen.length === 1 ? " Liga" : " Ligen"); t.appendChild(anz);
        sm.appendChild(t); d.appendChild(sm);
        g.zeilen.forEach(function (l) {
          var z = document.createElement("div"); z.className = "zeiten-zeile";
          var kopf = document.createElement("b"); kopf.textContent = l.liga;
          if (ligaPasst(l.liga, meine)) {
            z.classList.add("meine");
            var mk = document.createElement("span"); mk.className = "zeiten-marke";
            mk.textContent = "dein nächstes Spiel"; kopf.appendChild(mk);
          }
          z.appendChild(kopf);
          [["Spielzeit", l.spielzeit], ["Pause", l.pause], ["Verlängerung", l.verlaengerung],
           ["Penaltys", l.penalty]].forEach(function (paar) {
            if (!paar[1]) return;
            var r = document.createElement("div"); r.className = "zeiten-wert";
            var k = document.createElement("span"); k.textContent = paar[0]; r.appendChild(k);
            var v = document.createElement("b"); v.textContent = paar[1]; r.appendChild(v);
            z.appendChild(r);
          });
          if (l.hinweis) { var hw = document.createElement("small"); hw.className = "zeiten-hinweis"; hw.textContent = l.hinweis; z.appendChild(hw); }
          if (l.quelle) { var q = document.createElement("small"); q.className = "fundstelle"; q.textContent = l.quelle; z.appendChild(q); }
          d.appendChild(z);
        });
        ziel.appendChild(d);
      });
      if ((zeitenDaten.allgemein || []).length) {
        var ad = document.createElement("details"); ad.className = "karte bestimmung-block";
        var asm = document.createElement("summary");
        var at = document.createElement("span");
        var ab = document.createElement("b"); ab.textContent = "Für alle Spiele"; at.appendChild(ab);
        var aa = document.createElement("small"); aa.textContent = zeitenDaten.allgemein.length + " Punkte"; at.appendChild(aa);
        asm.appendChild(at); ad.appendChild(asm);
        zeitenDaten.allgemein.forEach(function (p2) {
          var z = document.createElement("div"); z.className = "bestimmung-punkt";
          var tb = document.createElement("b"); tb.textContent = p2.titel; tb.style.display = "block"; z.appendChild(tb);
          var tx = document.createElement("span"); tx.textContent = p2.text; z.appendChild(tx);
          var q = document.createElement("small"); q.className = "fundstelle"; q.textContent = p2.quelle; z.appendChild(q);
          ad.appendChild(z);
        });
        ziel.appendChild(ad);
      }
      ziel.appendChild(hinweisKarte(zeitenDaten._hinweis || ""));
      return;
    }

    if (regelnTeil === "bestimmungen") {
      el("regeln-unter").textContent = bestimmungenDaten ? "EHV NRW, " + bestimmungenDaten.stand : "Bestimmungen";
      if (!bestimmungenDaten) { ziel.appendChild(hinweisKarte("Bestimmungen nicht geladen.")); return; }
      // Ein Bereich je Karte, zugeklappt bis auf den ersten. Auf dem Handy
      // ist die Seite sonst eine einzige lange Rolle.
      bestimmungenDaten.bereiche.forEach(function (b, nr) {
        var d = document.createElement("details");
        d.className = "karte bestimmung-block";
        if (!nr) d.open = true;
        var sm = document.createElement("summary");
        var t = document.createElement("span");
        var bb = document.createElement("b"); bb.textContent = b.titel; t.appendChild(bb);
        var anz = document.createElement("small");
        anz.textContent = b.punkte.length + (b.punkte.length === 1 ? " Punkt" : " Punkte");
        t.appendChild(anz);
        sm.appendChild(t);
        d.appendChild(sm);
        b.punkte.forEach(function (p2) {
          var z = document.createElement("div"); z.className = "bestimmung-punkt";
          var text = document.createElement("span"); text.textContent = p2.text; z.appendChild(text);
          var q = document.createElement("small"); q.className = "fundstelle"; q.textContent = p2.quelle; z.appendChild(q);
          d.appendChild(z);
        });
        ziel.appendChild(d);
      });
      var dk = document.createElement("details"); dk.className = "karte dok-liste bestimmung-block";
      var dsm = document.createElement("summary");
      var dt = document.createElement("span");
      var db = document.createElement("b"); db.textContent = "Die Dokumente beim Verband"; dt.appendChild(db);
      var dz = document.createElement("small"); dz.textContent = bestimmungenDaten.dokumente.length + " PDFs"; dt.appendChild(dz);
      dsm.appendChild(dt); dk.appendChild(dsm);
      bestimmungenDaten.dokumente.forEach(function (dok) {
        var a = document.createElement("a"); a.href = dok.url; a.target = "_blank"; a.rel = "noopener";
        var sp = document.createElement("span"); sp.textContent = dok.titel;
        var sm2 = document.createElement("small"); sm2.textContent = "Stand " + dok.stand; sp.appendChild(sm2);
        a.appendChild(sp); dk.appendChild(a);
      });
      ziel.appendChild(dk);
      ziel.appendChild(hinweisKarte(bestimmungenDaten._hinweis));
      return;
    }

    el("regeln-unter").textContent = regelnDaten ? regelnDaten.stand : "Strafenmatrix";
    if (!regelnDaten) { ziel.appendChild(hinweisKarte("Strafen nicht geladen.")); return; }

    // Filterchips: alles, dann je Strafart
    var spalten = regelnDaten.spalten || [];
    (function () {
      var b = document.createElement("button"); b.type = "button";
      b.className = "chip" + (regelArt ? "" : " ich");
      b.textContent = "alle";
      b.addEventListener("click", function () { regelArt = ""; regelnZeichnen(); });
      arten.appendChild(b);
    })();
    spalten.forEach(function (sp) {
      var b = document.createElement("button"); b.type = "button";
      b.className = "chip " + strafFarbe(sp.code) + (regelArt === sp.code ? " ich" : "");
      b.textContent = sp.code; b.title = sp.name;
      b.addEventListener("click", function () { regelArt = regelArt === sp.code ? "" : sp.code; regelnZeichnen(); });
      arten.appendChild(b);
    });

    var q = ohneZeichen(el("regeln-filter").value);
    var treffer = (regelnDaten.strafen || []).filter(function (r) {
      if (regelArt && r.codes.indexOf(regelArt) < 0) return false;
      return !q || ohneZeichen(r.name + " " + (r.info || "")).indexOf(q) >= 0;
    });

    // Die Matrix: eine Zeile je Vergehen, ein Punkt je moeglicher Strafe.
    // Das Raster steht in einer CSS-Variablen, damit Kopf und Zeilen
    // garantiert dieselben Spalten haben.
    var karte = document.createElement("div");
    karte.className = "karte strafen-matrix";
    karte.style.setProperty("--spalten", spalten.length);
    if (!treffer.length) {
      ziel.appendChild(hinweisKarte("Nichts gefunden."));
    } else {
      var kopf = document.createElement("div"); kopf.className = "matrix-kopf";
      var leer = document.createElement("span"); leer.textContent = treffer.length + " Vergehen"; kopf.appendChild(leer);
      spalten.forEach(function (sp) {
        var z = document.createElement("span");
        z.className = "matrix-spalte " + strafFarbe(sp.code) + (regelArt === sp.code ? " aktiv" : "");
        z.textContent = sp.code; z.title = sp.name;
        kopf.appendChild(z);
      });
      karte.appendChild(kopf);
      treffer.forEach(function (r) {
        var zeile = document.createElement("div"); zeile.className = "matrix-zeile";
        zeile.tabIndex = 0; zeile.setAttribute("role", "button");
        zeile.setAttribute("aria-label", r.name + ": Strafen anzeigen");
        var name = document.createElement("span"); name.className = "matrix-name";
        var b = document.createElement("b"); b.textContent = r.name; name.appendChild(b);
        if (r.info) { var sm = document.createElement("small"); sm.textContent = r.info; name.appendChild(sm); }
        zeile.appendChild(name);
        spalten.forEach(function (sp) {
          var z = document.createElement("span");
          var da = r.codes.indexOf(sp.code) >= 0;
          z.className = "matrix-feld" + (da ? " da " + strafFarbe(sp.code) : "");
          z.textContent = da ? "\u25cf" : "\u00b7";
          if (da) z.title = r.name + ": " + sp.name;
          zeile.appendChild(z);
        });
        // Auf dem Handy gibt es keinen Mauszeiger, der den Titel zeigt -
        // ein Tipp auf die Zeile schreibt die Strafen aus.
        function klappen() {
          if (zeile._info) { zeile._info.remove(); zeile._info = null; zeile.classList.remove("offen"); return; }
          var info = document.createElement("div"); info.className = "matrix-info";
          spalten.forEach(function (sp) {
            if (r.codes.indexOf(sp.code) < 0) return;
            var c = document.createElement("span"); c.className = "strafmarke " + strafFarbe(sp.code);
            c.textContent = sp.code + " \u00b7 " + sp.name;
            info.appendChild(c);
          });
          if (!info.childNodes.length) {
            var ohne = document.createElement("small"); ohne.textContent = "Keine eigene Strafart in der Tabelle.";
            info.appendChild(ohne);
          }
          if (r.info) { var t = document.createElement("small"); t.textContent = r.info; info.appendChild(t); }
          zeile.parentNode.insertBefore(info, zeile.nextSibling);
          zeile._info = info; zeile.classList.add("offen");
        }
        zeile.addEventListener("click", klappen);
        zeile.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); klappen(); }
        });
        karte.appendChild(zeile);
      });
      ziel.appendChild(karte);
    }

    // Faustkampf passt nicht in die Spalten - eigene Karte
    var fk = regelnDaten.faustkampf;
    if (fk && !regelArt && !q) {
      var fkarte = document.createElement("div"); fkarte.className = "karte regel-karte";
      var fh = document.createElement("h4"); fh.textContent = fk.name; fh.style.margin = "0 0 6px"; fkarte.appendChild(fh);
      function rollenZeile(r) {
        var d = document.createElement("div"); d.className = "rollen-zeile";
        var w = document.createElement("span"); w.textContent = r.was; d.appendChild(w);
        var st = document.createElement("b"); st.className = "rollen-strafe"; st.textContent = r.strafe;
        if (/MS/.test(r.strafe)) st.classList.add("farbe-ms");
        else if (/SPD/.test(r.strafe)) st.classList.add("farbe-5spd");
        else if (/5/.test(r.strafe)) st.classList.add("farbe-5");
        else st.classList.add("farbe-2");
        d.appendChild(st);
        return d;
      }
      (fk.rollen || []).forEach(function (r) { fkarte.appendChild(rollenZeile(r)); });
      if ((fk.zusatz || []).length) {
        var zt = document.createElement("p"); zt.className = "regeln-kopf"; zt.textContent = "Dazu";
        fkarte.appendChild(zt);
        fk.zusatz.forEach(function (r) { fkarte.appendChild(rollenZeile(r)); });
      }
      ziel.appendChild(fkarte);
    }

    // Legende
    var legende = document.createElement("div"); legende.className = "karte regel-karte";
    var lh = document.createElement("h4"); lh.textContent = "Was die Kürzel heissen"; lh.style.margin = "0 0 6px"; legende.appendChild(lh);
    spalten.forEach(function (sp) {
      var d = document.createElement("div"); d.className = "legende-zeile";
      var s2 = document.createElement("span"); s2.className = "strafmarke " + strafFarbe(sp.code); s2.textContent = sp.code;
      var n2 = document.createElement("span"); n2.textContent = sp.name;
      d.appendChild(s2); d.appendChild(n2);
      legende.appendChild(d);
    });
    ziel.appendChild(legende);
    ziel.appendChild(hinweisKarte(regelnDaten._hinweis));
  }
  function hinweisKarte(text) {
    var p = document.createElement("p"); p.className = "meta"; p.style.margin = "12px 4px"; p.textContent = text;
    return p;
  }

  // Sprungleiste: Chips, die zu den Abschnitten einer langen Seite springen
  // Die Leiste zeigt nur, was gerade sichtbar ist. Sie muss also mitgehen,
  // wenn die einfache Ansicht die halbe Seite ein- oder ausblendet - sonst
  // fehlt hinterher der halbe Wegweiser.
  function einstellungenSprung() {
    sprungleiste("einstellungen-sprung", "einstellungen", [["konto-bereich", "Konto"], ["einfach", "Aussehen"], ["kalender-einst", "Kalender"], ["karten-app", "Unterwegs"], ["start-bausteine", "Startseite"], ["start-ordnung", "Reihenfolge"], ["schnell-wahl", "Schnellzugriff"], ["tab-wahl", "Leiste"], ["bereiche", "Bereiche"], ["sicherung-raus", "Sicherung"], ["adminzeile", "Betreiber"]]);
  }

  // Ein Chip-Titel darf kurz sein, aber nicht mitten im Wort enden -
  // "Spieltag-Checkliste" hat genau ein Zeichen zu viel und wurde zu
  // "Spieltag-Checklis…". Die Leiste rollt ohnehin seitwaerts.
  function kurzTitel(t) {
    if (t.length <= 22) return t;
    var schnitt = t.slice(0, 21);
    var i = Math.max(schnitt.lastIndexOf(" "), schnitt.lastIndexOf("-"));
    return (i > 10 ? schnitt.slice(0, i) : schnitt) + "…";
  }

  function sprungleiste(leisteId, bereichId, punkte) {
    var leiste = el(leisteId); if (!leiste) return;
    leiste.innerHTML = "";
    var sichtbar = punkte.filter(function (p) {
      var e = typeof p[0] === "string" ? el(p[0]) : p[0];
      return e && !e.classList.contains("versteckt") && e.offsetHeight > 0;
    });
    if (sichtbar.length < 3) { leiste.classList.add("versteckt"); return; }
    sichtbar.forEach(function (p) {
      var c = document.createElement("button"); c.type = "button"; c.className = "chip"; c.textContent = p[1];
      c.addEventListener("click", function () {
        var e = typeof p[0] === "string" ? el(p[0]) : p[0];
        if (!e) return;
        var kopf = e.previousElementSibling && e.previousElementSibling.classList.contains("abschnitt") ? e.previousElementSibling : e;
        var y = kopf.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      });
      leiste.appendChild(c);
    });
    leiste.classList.remove("versteckt");
    void bereichId;
  }

  // Kleine Zahlen auf den Kacheln unter "Mehr" - auf einen Blick, wo etwas ist
  function mehrZahlen(liste) {
    var ich = profil && profil.slug ? personMit(profil.slug) : null;
    function setze(ziel, text) {
      if (!text) return;
      var a = Array.prototype.filter.call(liste.querySelectorAll("a"), function (x) { return x._ziel === ziel; })[0];
      if (!a || a.querySelector(".kachel-zahl")) return;
      var p = document.createElement("span"); p.className = "kachel-zahl"; p.textContent = text; a.appendChild(p);
    }
    if (ich) {
      var gesamt = (ich.statistik && ich.statistik.gesamt) || ich.spiele.length;
      setze("#archiv", gesamt ? gesamt + " Spiele" : "");
      setze("#statistik", ich.statistik ? ich.statistik.saison + " in " + (daten.saison || "der Saison") : "");
      var bis = Date.now() + 14 * 86400000;
      var bald = ich.spiele.filter(function (s) { return !s.vergangen && new Date(s.beginn).getTime() <= bis; }).length;
      setze("#mitfahren", bald ? bald + " in 14 Tagen" : "");
    }
    if (!sitzungVorhanden()) return;
    hole("protokoll.json").then(function (pl) {
      var grenze = Date.now() - 14 * 86400000;
      var meine = (pl || []).filter(function (e) {
        if (!e.stand || new Date(e.stand).getTime() < grenze) return false;
        return !(profil && profil.slug) || e.slug === profil.slug;
      }).length;
      setze("#aenderungen", meine ? meine + (meine === 1 ? " Änderung" : " Änderungen") : "");
      // Was seit dem letzten Besuch dazugekommen ist, faellt auf
      var gesehen = parseInt(lesen("aenderungen-gesehen") || "0", 10) || 0;
      if (!gesehen) return;
      var frisch = (pl || []).filter(function (e) {
        if (!e.stand || new Date(e.stand).getTime() <= gesehen) return false;
        return !(profil && profil.slug) || e.slug === profil.slug;
      }).length;
      var a = Array.prototype.filter.call(liste.querySelectorAll("a"), function (x) { return x._ziel === "#aenderungen"; })[0];
      var p = a && a.querySelector(".kachel-zahl");
      if (frisch && p) { p.textContent = frisch + " neu"; p.classList.add("frisch"); }
    }).catch(function () {});
  }

  function zeigeEinstellungen(ziel) {
    ansicht("einstellungen"); aktuell = null; window.scrollTo(0, 0);
    // "#einstellungen/kalender" kommt aus der Kalenderkarte. Ohne das
    // Hinspringen muesste man die lange Seite erst absuchen.
    if (ziel) setTimeout(function () {
      var k = el(ziel === "kalender" ? "kalender-einst" : ziel);
      if (!k) return;
      // Ueber eine lange Seite ist weiches Rollen kein Genuss, sondern
      // zwei Sekunden Warten - ab anderthalb Bildschirmen also direkt hin.
      var weit = Math.abs(k.getBoundingClientRect().top) > window.innerHeight * 1.5;
      k.scrollIntoView({ behavior: weit ? "auto" : "smooth", block: "center" });
      k.classList.add("hervor");
      setTimeout(function () { k.classList.remove("hervor"); }, 2200);
    }, 300);
    bereicheRendern(); startBausteineRendern(); startOrdnungRendern(); schnellWahlRendern(); tabWahlRendern(); pushVerlaufRendern(); adminZeileRendern();
    setTimeout(einstellungenSprung, 400);
    var kb = el("konto-bereich"); kb.innerHTML = "";
    if (!sitzungVorhanden()) {
      var k = document.createElement("a"); k.href = "#mitglieder"; k.className = "hinweis"; k.style.display = "flex"; k.style.textDecoration = "none"; k.style.color = "inherit"; k.style.marginBottom = "12px";
      k.appendChild(ikone("i-lock")); var t = document.createElement("span"); t.innerHTML = "<b>Konto</b>: anmelden oder anlegen für Abrechnung, Notizen und Push ›"; k.appendChild(t); kb.appendChild(k);
      return;
    }
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) {
      if (!st.eingerichtet || !st.session) return;
      return window.Mitglieder.kontoRendern(kb);
    }).catch(function () {});
  }

  // ------------------------------------------------------------ Hallenkarte

  var leafletGeladen = null;
  function ladeLeaflet() {
    if (leafletGeladen) return leafletGeladen;
    leafletGeladen = new Promise(function (ok, nein) {
      var css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
      css.integrity = "sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"; css.crossOrigin = "anonymous"; document.head.appendChild(css);
      var js = document.createElement("script"); js.src = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
      js.integrity = "sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"; js.crossOrigin = "anonymous";
      js.onload = function () { ok(window.L); }; js.onerror = function () { nein(new Error("Karte nicht ladbar")); };
      document.head.appendChild(js);
    });
    return leafletGeladen;
  }
  var karteObjekt = null;
  function zeigeKarte() {
    ansicht("karte"); aktuell = null; window.scrollTo(0, 0);
    var div = el("karte-div");
    ladeLeaflet().then(function (L) {
      if (karteObjekt) { karteObjekt.remove(); karteObjekt = null; }
      div.innerHTML = "";
      var m = L.map(div, { scrollWheelZoom: false });
      karteObjekt = m;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(m);
      var meine = {};
      if (profil && personMit(profil.slug)) personMit(profil.slug).spiele.forEach(function (s) { if (!s.vergangen && s.halle) meine[s.halle] = (meine[s.halle] || 0) + 1; });
      var anzahl = {};
      (daten.spiele || []).forEach(function (s) { if (!s.vergangen && s.halle) anzahl[s.halle] = (anzahl[s.halle] || 0) + 1; });
      var punkte = [];
      // Blau: da hast du Spiele. Grau: Halle mit Spielen von Kollegen.
      // Hell: Halle ohne kommende Spiele. Orange: zu Hause.
      var MEIN = "#1d5a99", ANDERE = "#6b7280", LEER = "#c3c8d2";
      Object.keys(daten.hallen || {}).forEach(function (name) {
        var k = daten.hallen[name]; if (!k) return;
        var mein = !!meine[name], belegt = !!anzahl[name];
        var farbe = mein ? MEIN : belegt ? ANDERE : LEER;
        var c = L.circleMarker([k[0], k[1]], { radius: mein ? 10 : belegt ? 7 : 5, color: "#ffffff", fillColor: farbe, fillOpacity: .95, weight: 2 }).addTo(m);
        var inhalt = document.createElement("div");
        var b = document.createElement("b"); b.textContent = name; inhalt.appendChild(b);
        var p = document.createElement("div"); p.textContent = (anzahl[name] || 0) + " kommende Spiele" + (mein ? " · " + meine[name] + " eigene" : ""); inhalt.appendChild(p);
        var a = document.createElement("a"); a.href = "#halle/" + hallenSlug(name); a.textContent = "Hallen-Seite ›"; inhalt.appendChild(a);
        var adr = (daten.adressen || {})[name];
        var rl = document.createElement("a"); rl.href = kartenLink(adr || name); rl.target = "_blank"; rl.rel = "noopener";
        rl.textContent = "Route ›"; rl.style.marginLeft = "10px"; inhalt.appendChild(rl);
        c.bindPopup(inhalt);
        punkte.push([k[0], k[1]]);
      });
      kartenLegende(MEIN, ANDERE, LEER);
      function fertig(heim) {
        if (heim) {
          var hm = L.circleMarker([heim.lat, heim.lon], { radius: 8, color: "#fff", fillColor: "#d97706", fillOpacity: 1, weight: 3 }).addTo(m).bindPopup("Zuhause");
          [25, 50].forEach(function (km) { L.circle([heim.lat, heim.lon], { radius: km * 1000, color: "#d97706", weight: 1, fill: false, dashArray: "4 6" }).addTo(m); });
          punkte.push([heim.lat, heim.lon]);
          el("karte-unter").textContent = "Ringe: 25 und 50 km von zu Hause";
        }
        // Nah ranzoomen: mit Heimat die Hallen im Umkreis von 120 km, sonst der
        // Kern der Hallen. Ohne das zieht ein einzelnes Auswaertsspiel (Berlin)
        // den Ausschnitt auf halb Europa.
        var nah = heim ? punkte.filter(function (pt) { return kmZwischen(pt, [heim.lat, heim.lon]) <= 120; }) : kernPunkte(punkte);
        if (nah.length < 2) nah = punkte;
        // Erst Groesse melden, dann einpassen - sonst rechnet Leaflet mit einem
        // Kasten von 0 Pixeln und zeigt halb Europa.
        function einpassen() {
          m.invalidateSize();
          if (nah.length) m.fitBounds(nah, { padding: [24, 24], maxZoom: 11 }); else m.setView([51.4, 7.3], 8);
        }
        einpassen();
        setTimeout(einpassen, 250);
      }
      if (sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
        .then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.heimat() : null; }).then(fertig).catch(function () { fertig(null); });
      else fertig(null);
    }).catch(function (e) { div.textContent = "Karte konnte nicht geladen werden: " + e.message; });
  }

  // ------------------------------------------- Kalenderdatei mit Abfahrtsalarm

  function icsText(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
  function icsZeit(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function icsHerunterladen(zeilen, dateiname) {
    var blob = new Blob([zeilen.join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = dateiname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }
  // Ein einzelnes Spiel als Kalenderdatei (mit Abfahrt, wenn die Strecke bekannt ist)
  function einzelIcs(s) {
    var lauf = sitzungVorhanden() && s.halle ? ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.abfahrt(s.halle) : null; }).catch(function () { return null; }) : Promise.resolve(null);
    lauf.then(function (sk) {
      var zeilen = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Einteilungen//Einzel//DE", "CALSCALE:GREGORIAN"];
      zeilen = zeilen.concat(icsEvent(s, sk)); zeilen.push("END:VCALENDAR");
      icsHerunterladen(zeilen, "spiel-" + s.beginn.slice(0, 10) + ".ics");
      toast("Kalenderdatei erzeugt, öffnen und in den Kalender übernehmen.", "gut");
    });
  }
  function icsEvent(s, sk) {
    var treff = new Date(s.treffpunkt), ende = new Date(new Date(s.beginn).getTime() + (daten.spieldauer_minuten || 150) * 60000);
    var gepuffert = mitPuffer(sk);
    var puffer = gepuffert && gepuffert.minuten ? gepuffert.minuten + 10 : null, zeilen = [];
    zeilen.push("BEGIN:VEVENT", "UID:abfahrt-" + icsZeit(treff) + "-" + s.paarung.replace(/[^a-z0-9]/gi, "").slice(0, 30) + "@einteilungen",
      "DTSTAMP:" + icsZeit(new Date()), "DTSTART:" + icsZeit(treff), "DTEND:" + icsZeit(ende),
      "SUMMARY:" + icsText((s.rolle ? s.rolle + " · " : "") + (s.liga ? s.liga + ": " : "") + s.paarung),
      "LOCATION:" + icsText(s.ort || s.halle || ""),
      "DESCRIPTION:" + icsText("Treffpunkt " + uhr(treff) + " Uhr, Spielbeginn " + uhr(new Date(s.beginn)) + " Uhr" + (puffer ? "\nAbfahrt ca. " + uhr(new Date(treff.getTime() - (puffer - 10) * 60000)) + " Uhr (" + sk.km + " km, " + gepuffert.minuten + " Min., " + verkehrText() + ")" : "")));
    if (puffer) zeilen.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText("Losfahren: " + s.paarung + " (" + sk.km + " km)"), "TRIGGER:-PT" + puffer + "M", "END:VALARM");
    zeilen.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:In einer Stunde an der Halle", "TRIGGER:-PT1H", "END:VALARM", "END:VEVENT");
    return zeilen;
  }
  function abfahrtIcs(p) {
    var kommend = p.spiele.filter(function (s) { return !s.vergangen; });
    if (!kommend.length) { toast("Keine kommenden Spiele.", ""); return; }
    var knopf = el("abfahrt-ics"); knopf.disabled = true; knopf.textContent = "berechne Strecken …";
    var M = window.Mitglieder, zeilen = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Einteilungen//Abfahrt//DE", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Einteilungen mit Abfahrt"];
    var kette = Promise.resolve();
    kommend.forEach(function (s) {
      kette = kette.then(function () { return s.halle ? M.abfahrt(s.halle) : null; }).then(function (sk) {
        zeilen = zeilen.concat(icsEvent(s, sk)); return;
      });
    });
    kette.then(function () {
      zeilen.push("END:VCALENDAR");
      icsHerunterladen(zeilen, "einteilungen-abfahrt.ics");
      knopf.disabled = false; knopf.textContent = "Kalenderdatei mit Abfahrtsalarm laden";
      toast("Kalenderdatei erzeugt. Beim Öffnen in einen eigenen Kalender importieren, sonst stehen die Spiele doppelt drin.", "gut");
    }).catch(function (e) { knopf.disabled = false; knopf.textContent = "Kalenderdatei mit Abfahrtsalarm laden"; toast("Nicht möglich: " + (e.message || e), "warn"); });
  }

  // ------------------------------------------------------- Spieltag-Checkliste
  //
  // Privat und offline: Vorlage und Haken liegen im Geraet.

  var CHECK_STANDARD = ["Pfeife und Ersatzpfeife", "Lizenz / Ausweis", "Trikot, Hose, Helm", "Schlittschuhe geschliffen", "Spielbericht vorbereitet", "Anfahrt geprüft, Treffpunkt im Kopf"];
  function checkVorlage() { try { var v = JSON.parse(lesen("check-vorlage") || "null"); return Array.isArray(v) && v.length ? v : CHECK_STANDARD; } catch (e) { return CHECK_STANDARD; } }
  function checkStand(kennung) { try { return JSON.parse(lesen("check:" + kennung) || "{}"); } catch (e) { return {}; } }
  function checkliste(box, s) {
    var kennung = kennungVon(s), vorlage = checkVorlage(), stand = checkStand(kennung);
    var wrap = document.createElement("div"); wrap.className = "checkliste";
    var fort = document.createElement("div"); fort.className = "fortschritt"; var fi = document.createElement("i"); fort.appendChild(fi);
    var zaehler = document.createElement("div"); zaehler.className = "meta";
    function aktualisieren() {
      var n = vorlage.filter(function (t) { return stand[t]; }).length;
      fi.style.width = Math.round(n / vorlage.length * 100) + "%"; zaehler.textContent = n + " von " + vorlage.length + (n === vorlage.length ? ", alles gepackt ✓" : "");
      box.querySelector("h4").lastChild.textContent = "Spieltag-Checkliste " + n + "/" + vorlage.length;
    }
    wrap.appendChild(fort); wrap.appendChild(zaehler);
    vorlage.forEach(function (t) {
      var l = document.createElement("label"), c = document.createElement("input"); c.type = "checkbox"; c.className = "check"; c.checked = !!stand[t];
      l.className = c.checked ? "erledigt" : "";
      c.addEventListener("change", function () { stand[t] = c.checked; if (!c.checked) delete stand[t]; schreiben("check:" + kennung, JSON.stringify(stand)); l.className = c.checked ? "erledigt" : ""; aktualisieren(); });
      var tx = document.createElement("span"); tx.textContent = t;
      l.appendChild(c); l.appendChild(tx); wrap.appendChild(l);
    });
    var bearb = document.createElement("button"); bearb.type = "button"; bearb.className = "textknopf"; bearb.textContent = "Vorlage bearbeiten";
    bearb.addEventListener("click", function () {
      var neu = prompt("Ein Punkt je Zeile:", vorlage.join("\n"));
      if (neu === null) return;
      var liste = neu.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
      schreiben("check-vorlage", liste.length ? JSON.stringify(liste) : null); toast("Vorlage gespeichert, gilt für alle Spiele.", "gut");
      box.innerHTML = ""; var hh = document.createElement("h4"); hh.appendChild(ikone("i-check")); hh.appendChild(document.createTextNode("Spieltag-Checkliste")); box.appendChild(hh); checkliste(box, s);
    });
    wrap.appendChild(bearb); box.appendChild(wrap); aktualisieren();
  }

  // ------------------------------------------------------------ Saisonziel

  function saisonziel(p, ziel) {
    var s = p.statistik; if (!s) return;
    var meins = !!(profil && profil.slug === p.slug);
    var zielWert = parseInt(lesen("ziel") || "0", 10);
    if (meins && zielWert > 0) {
      var box = document.createElement("div"); box.className = "karte ziel";
      var kopf = document.createElement("div"); kopf.className = "kopfzeile";
      var b = document.createElement("b"); b.textContent = "Saisonziel: " + s.saison + " von " + zielWert + " Spielen";
      var q = document.createElement("span"); q.className = "meta"; q.textContent = Math.min(100, Math.round(s.saison / zielWert * 100)) + " %";
      kopf.appendChild(b); kopf.appendChild(q); box.appendChild(kopf);
      var rahmen = document.createElement("div"); rahmen.className = "balkenrahmen"; var i = document.createElement("i"); i.style.width = Math.min(100, Math.round(s.saison / zielWert * 100)) + "%"; rahmen.appendChild(i); box.appendChild(rahmen);
      var rest = zielWert - s.saison;
      var t = document.createElement("div"); t.className = "meta"; t.textContent = rest > 0 ? "Noch " + rest + (rest === 1 ? " Spiel" : " Spiele") + " bis zum Ziel." : "Ziel erreicht, stark!"; box.appendChild(t);
      ziel.appendChild(box);
    } else if (meins) {
      var hint = document.createElement("p"); hint.className = "meta"; hint.style.margin = "0 0 10px";
      var a = document.createElement("a"); a.href = "#einstellungen"; a.textContent = "Saisonziel setzen"; hint.appendChild(a); hint.appendChild(document.createTextNode(", dann steht hier der Fortschritt."));
      ziel.appendChild(hint);
    }
  }

  function zeigeStatSeite(slug) {
    var p = personMit(slug) || (profil && personMit(profil.slug));
    if (!p) return zeigeAuswahl(false);
    ansicht("statseite"); aktuell = p;
    el("stat-name").textContent = p.name; el("stat-avatar").textContent = initialen(p.name); el("stat-avatar").style.background = farbeFuer(p.slug);
    zeigeStatistik(p); zeigeSaison(p);
    if (!p.statistik) el("statistik").appendChild(leerZustand("Noch keine Statistik, das Archiv füllt sich mit jedem Lauf."));
    if (sprungZiel === null) window.scrollTo(0, 0);
  }

  // Pins: bis zu drei Kollegen als Avatare auf Start
  function pinsLesen() { try { return JSON.parse(lesen("pins") || "[]"); } catch (e) { return []; } }
  function zeigePins(p) {
    var box = el("pins"); box.innerHTML = "";
    var pins = pinsLesen().filter(function (s) { return personMit(s) && !(profil && profil.slug === s); });
    box.classList.toggle("versteckt", !startEinstellung("pins") || !(profil && profil.slug === p.slug) || !pins.length);
    pins.forEach(function (s) {
      var q = personMit(s), b = document.createElement("button"); b.type = "button";
      var av = document.createElement("i"); av.className = "avatar"; av.textContent = initialen(q.name); av.style.background = farbeFuer(q.slug);
      var n = q.spiele.filter(function (x) { return !x.vergangen; }).length;
      b.appendChild(av); b.appendChild(document.createTextNode(q.name.split(",")[1] ? q.name.split(",")[1].trim() : q.name));
      var z = document.createElement("span"); z.className = "anzahl"; z.textContent = n ? " · " + n : ""; b.appendChild(z);
      b.title = q.name; b.addEventListener("click", function () { location.hash = q.slug; });
      box.appendChild(b);
    });
  }
  function pinKnopf(p) {
    var b = el("pin"), meins = !!(profil && profil.slug === p.slug);
    b.classList.toggle("versteckt", meins);
    var pins = pinsLesen(), drin = pins.indexOf(p.slug) >= 0;
    b.textContent = drin ? "Lospinnen" : "Anpinnen";
    b.onclick = function () {
      var l = pinsLesen().filter(function (s) { return s !== p.slug; });
      if (!drin) { if (l.length >= 3) { toast("Höchstens drei Pins, erst einen lösen.", "warn"); return; } l.unshift(p.slug); }
      schreiben("pins", JSON.stringify(l)); pinKnopf(p);
      toast(drin ? "Pin gelöst." : p.name + " ist auf Start angepinnt.", "gut");
    };
  }

  // Kalender-Box: auf breiten Bildschirmen in die rechte Spalte
  function kalenderSpalte() {
    var box = el("kalender-box"), seite = el("spalte-seite"), haupt = el("spiele").parentNode;
    if (window.innerWidth >= 900) { if (box.parentNode !== seite) seite.appendChild(box); return; }
    // Handy: vor den Spielen, solange nicht abonniert - danach dahinter
    var ziel = lesen("abo-geklickt") === "1" ? el("start-anpassen") : el("spiele");
    if (box.nextSibling !== ziel || box.parentNode !== haupt) haupt.insertBefore(box, ziel);
  }
  window.addEventListener("resize", kalenderSpalte);

  function ausHash() {
    // Ohne geladene Daten gibt es nur den Anmeldeschirm. Steht er schon da,
    // bleibt er stehen - sonst ginge beim Tippen die Eingabe verloren.
    if (!daten) { if (el("mitglieder").classList.contains("versteckt")) anmeldeschirm(); return; }
    var slug = location.hash.replace(/^#/, "");
    var gesperrt = { "mitglieder/tausch": "tausch", "mitglieder/frei": "frei", "mitglieder/abrechnung": "abrechnung", "mitglieder/info": "info", "mitglieder/notizen": "notizen", "karte": "hallen", "statistik": "statistik" };
    var schl = gesperrt[slug] || (slug.indexOf("statistik/") === 0 ? "statistik" : null);
    if (schl && !funktion(schl)) { toast("Zurzeit abgeschaltet: " + FUNKTIONEN.filter(function (f) { return f[0] === schl; })[0][1] + ".", "warn"); location.hash = slug.indexOf("mitglieder") === 0 ? "mitglieder" : "mehr"; return; }
    if (gesperrtFuerMich(slug)) { zeigeSperre(slug); return; }
    if (slug === "status") { zeigeStatus(); return; }
    if (slug.indexOf("statistik") === 0) { zeigeStatSeite(slug.split("/")[1] || (profil && profil.slug) || ""); return; }
    if (slug === "mehr") { zeigeMehr(); return; }
    if (slug === "einstellungen" || slug.indexOf("einstellungen/") === 0) { zeigeEinstellungen(slug.split("/")[1] || null); return; }
    if (slug === "mitglieder/konto") { location.hash = "einstellungen"; return; }
    if (slug === "aenderungen") { if (!funktion("aenderungen")) { location.hash = "mehr"; return; } zeigeAenderungen(); return; }
    if (slug === "archiv" || slug.indexOf("archiv/") === 0) { if (!funktion("archiv")) { location.hash = "mehr"; return; } zeigeArchiv(slug.split("/")[1] || ""); return; }
    if (slug.indexOf("rechnung/") === 0) {
      var rk = decodeURIComponent(slug.slice(9));
      ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
        .then(function () { return window.Mitglieder.rechnungSprung(rk); }).catch(function () {});
      location.hash = "mitglieder/abrechnung"; return;
    }
    if (slug.indexOf("abrechnen/") === 0) { var kz = decodeURIComponent(slug.slice(10)); ladeMitglieder().then(function (M) { M.abrechnungSprung(kz); }).catch(function () {}); location.hash = "mitglieder/abrechnung"; return; }
    if (slug === "mitfahren") { if (!funktion("mitfahren")) { location.hash = "mehr"; return; } zeigeMitfahren(); return; }
    if (slug === "anleitung") { location.hash = "mehr"; tourOeffnen("alles"); return; }
    if (slug === "suche") { zeigeAuswahl("suche"); return; }
    if (slug === "karte") { zeigeKarte(); return; }
    if (slug === "regeln") { if (!funktion("regeln")) { location.hash = "mehr"; return; } zeigeRegeln(); return; }
    if (slug === "rechner") { if (!funktion("rechner")) { location.hash = "mehr"; return; } zeigeRechner(); return; }
    if (slug.indexOf("spiel/") === 0) { zeigeSpiel(decodeURIComponent(slug.slice(6))); return; }
    if (slug.indexOf("halle/") === 0) { zeigeHalle(slug.slice(6)); return; }
    if (slug === "plan") { aktuell = null; ansicht("plan"); zeigePlan(); if (sprungZiel === null) window.scrollTo(0, 0); return; }
    if (slug === "mitglieder" || slug.indexOf("mitglieder/") === 0) { zeigeMitglieder(slug.split("/")[1] || null); return; }
    // Links aus Supabase-Mails (Bestaetigung, Passwort vergessen) landen mit
    // Token in der Adresse - die verarbeitet der Mitgliederbereich
    if (/access_token=|type=recovery|error=|error_description=/.test(location.hash) || /[?&]code=/.test(location.search)) { zeigeMitglieder(); return; }
    if (slug) { var p = personMit(slug); if (p) { zeigePerson(p); return; } }
    if (profil && profil.slug && personMit(profil.slug)) { zeigePerson(personMit(profil.slug)); return; }
    zeigeAuswahl(false);
  }

  // ----------------------------------------------------------------- Start

  el("wechseln").addEventListener("click", function () { el("suche").value = ""; zeigeListe(""); zeigeAuswahl(true); });
  el("abbrechen").addEventListener("click", function () { if (profil && personMit(profil.slug)) zeigePerson(personMit(profil.slug)); });
  el("suche").addEventListener("input", function (e) { zeigeListe(e.target.value); });
  el("suche").addEventListener("change", function (e) { suchVerlaufMerken(e.target.value); });
  el("suche").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var erster = el("namen").querySelector("li button");
    if (erster) { e.preventDefault(); erster.click(); }
  });

  // Nach dem Login im Mitgliederbereich: "Meine Spiele" auf den dort
  // gewaehlten Namen stellen, damit niemand zweimal gefragt wird.
  var START_BAUSTEINE = [
    ["ruhig", "Nur nächstes Spiel", "ganz ruhige Startseite: Kopfkarte und deine Spiele, sonst nichts", false],
    ["schnell", "Schnellzugriff", "eine Reihe Knöpfe unter der Kopfkarte, ohne das, was unten schon in der Leiste steht", false],
    ["vollbild", "Am Spieltag groß", "ist heute ein Spiel, füllt die Kopfkarte den Bildschirm, der Rest kommt auf Tipp", false],
    ["einrichtung", "„Alles eingerichtet?“", "zeigt fehlende Schritte (Kalender, Push, Heimatadresse, Wohnort) mit Direktlink", true],
    ["danach", "„Danach“ auf der Karte oben", "das übernächste Spiel in einer Zeile", false],
    ["wetter", "Wetter auf der Karte oben", "zum Treffpunkt, mit Glättehinweis", true, "wetter"],
    ["abfahrt", "Abfahrtszeit auf der Karte oben", "braucht die Heimatadresse im Konto", true],
    ["woche", "Wochenstreifen", "die nächsten sieben Tage mit Punkten", false],
    ["termine", "Nächste Termine", "Ankündigungen mit Datum", true, "info"],
    ["radar", "Vertretungs-Radar", "offene Spiele und Gesuche in der Nähe (Login)", false, "tausch"],
    ["pins", "Angepinnte Kollegen", "Avatare unter dem Profil", true],
    ["kalender", "Kalender-Karte", "Abo, Link und Mitteilungen, zugeklappt wenn abonniert", true],
    ["vergangene", "Vergangene Spiele", "eingeklappt unter deinen Spielen", true]
  ];
  function startEinstellung(k) {
    try { var st = JSON.parse(lesen("start") || "{}"); if (st[k] !== undefined) return !!st[k]; } catch (e) {}
    var std = START_BAUSTEINE.filter(function (b) { return b[0] === k; })[0]; return std ? std[3] : true;
  }
  // Reihenfolge der Bloecke auf Start (die uebrigen sitzen fest in der Kopfkarte)
  var START_ORDNUNG = ["schnellzugriff", "einrichtung", "pins", "uebersicht", "radar", "nachtrag", "spiele", "kalender-box"];
  var START_NAMEN = { schnellzugriff: "Schnellzugriff", einrichtung: "„Alles eingerichtet?“", pins: "Angepinnte Kollegen", uebersicht: "Kacheln und Termine", radar: "Vertretungs-Radar", nachtrag: "Hinweis zur Abrechnung", spiele: "Deine Spiele", "kalender-box": "Kalender-Karte" };
  function startOrdnung() {
    var o = []; try { o = JSON.parse(lesen("start-ordnung") || "[]") || []; } catch (e) {}
    o = o.filter(function (x) { return START_ORDNUNG.indexOf(x) >= 0; });
    START_ORDNUNG.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); });
    return o;
  }
  function startOrdnungAnwenden() {
    var haupt = el("detail").querySelector(".spalte-haupt"); if (!haupt) return;
    var anker = el("start-anpassen");
    startOrdnung().forEach(function (id) {
      var e = el(id);
      if (e && e.parentNode === haupt) haupt.insertBefore(e, anker);
    });
    // Profilzeile bleibt ganz unten
    var pz = haupt.querySelector(":scope > .profilzeile");
    if (pz && profil && aktuell && profil.slug === aktuell.slug) haupt.insertBefore(pz, anker);
  }
  function startOrdnungRendern() {
    var box = el("start-ordnung"); if (!box) return; box.innerHTML = "";
    var o = startOrdnung();
    o.forEach(function (id, i) {
      var z = document.createElement("div"); z.className = "ordnung-zeile";
      var t = document.createElement("span"); t.textContent = START_NAMEN[id] || id; z.appendChild(t);
      var kn = document.createElement("span"); kn.className = "knoepfe";
      [["↑", -1], ["↓", 1]].forEach(function (p) {
        var b = document.createElement("button"); b.type = "button"; b.className = "rund klein"; b.textContent = p[0];
        b.setAttribute("aria-label", (p[1] < 0 ? "nach oben" : "nach unten") + ": " + (START_NAMEN[id] || id));
        b.disabled = (p[1] < 0 && i === 0) || (p[1] > 0 && i === o.length - 1);
        b.addEventListener("click", function () {
          var neu = o.slice(), j = i + p[1];
          neu.splice(j, 0, neu.splice(i, 1)[0]);
          schreiben("start-ordnung", JSON.stringify(neu)); einstellungenSync(); startOrdnungRendern();
          if (aktuell && !el("detail").classList.contains("versteckt")) startOrdnungAnwenden();
        });
        kn.appendChild(b);
      });
      z.appendChild(kn); box.appendChild(z);
    });
    var zur = document.createElement("button"); zur.type = "button"; zur.className = "textknopf"; zur.textContent = "Standard-Reihenfolge";
    zur.addEventListener("click", function () { schreiben("start-ordnung", null); einstellungenSync(); startOrdnungRendern(); if (aktuell) startOrdnungAnwenden(); });
    box.appendChild(zur);
  }
  function startBausteineRendern() {
    var box = el("start-bausteine"); if (!box) return; box.innerHTML = "";
    START_BAUSTEINE.forEach(function (b) {
      if (b[4] && !funktion(b[4])) return;
      var l = document.createElement("label"); var t = document.createElement("span");
      var bb = document.createElement("b"); bb.textContent = b[1]; bb.style.display = "block"; var sm = document.createElement("small"); sm.textContent = b[2]; sm.style.color = "var(--dim)"; sm.style.fontWeight = "500";
      t.appendChild(bb); t.appendChild(sm);
      var c = document.createElement("input"); c.type = "checkbox"; c.checked = startEinstellung(b[0]);
      c.addEventListener("change", function () {
        var st = {}; try { st = JSON.parse(lesen("start") || "{}"); } catch (e) {}
        st[b[0]] = c.checked; schreiben("start", JSON.stringify(st)); einstellungenSync();
      });
      l.appendChild(t); l.appendChild(c); box.appendChild(l);
    });
  }
  // Sicherung: alles, was nur hier liegt und nach einem verlorenen Konto
  // oder einem neuen Handy sonst neu getippt werden muesste.
  var SICHER_SCHLUESSEL = ["einfach", "karten", "schrift", "akzent", "kompakt", "ziel", "start", "bereiche",
    "pushwoche", "pushabrechnung", "pushvorlauf", "pushgespann", "kalender", "schnell-aus", "start-ordnung", "tab2", "tab3", "tab4", "thema", "funktionen", "verkehr"];
  function sicherungBauen() {
    var app = {};
    SICHER_SCHLUESSEL.forEach(function (k) { var w = lesen(k); if (w !== null && w !== undefined) app[k] = w; });
    var aus = { art: "esrw-sicherung", fassung: 1, stand: new Date().toISOString(), app: app,
                profil: profil ? { slug: profil.slug, name: profil.name } : null };
    try { aus.rechnung = JSON.parse(localStorage.getItem("mg_rechnung") || "null"); } catch (e) {}
    return aus;
  }
  function sicherungLaden() {
    var daten2 = sicherungBauen();
    var text = JSON.stringify(daten2, null, 1);
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "esrw-sicherung-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast("Sicherung geladen.", "gut");
  }
  function sicherungEinlesen(datei) {
    var leser = new FileReader();
    leser.onerror = function () { toast("Datei nicht lesbar.", "warn"); };
    leser.onload = function () {
      var d = null;
      try { d = JSON.parse(leser.result); } catch (e) {}
      if (!d || d.art !== "esrw-sicherung") { toast("Das ist keine Sicherung dieser App.", "warn"); return; }
      var wann = d.stand ? new Date(d.stand) : null;
      if (!confirm("Sicherung" + (wann ? " vom " + datumKurz(wann) : "") + " einlesen? Deine jetzigen Einstellungen werden überschrieben.")) return;
      Object.keys(d.app || {}).forEach(function (k) {
        if (SICHER_SCHLUESSEL.indexOf(k) >= 0) schreiben(k, d.app[k]);
      });
      if (d.rechnung && window.Mitglieder && window.Mitglieder.rechnungEinlesen) window.Mitglieder.rechnungEinlesen(d.rechnung);
      einstellungenLaden(true); themaAnwenden(); einfachAnwenden(); tabsAnwenden();
      funktionenAnwenden(funktionenLesen()); einstellungenSync();
      toast("Sicherung eingelesen.", "gut");
      setTimeout(function () { location.reload(); }, 900);
    };
    leser.readAsText(datei);
  }
  (function () {
    var raus = el("sicherung-raus"), rein = el("sicherung-rein"), feld = el("sicherung-datei");
    if (!raus || !rein || !feld) return;
    raus.addEventListener("click", sicherungLaden);
    rein.addEventListener("click", function () { feld.click(); });
    feld.addEventListener("change", function () {
      var f = feld.files && feld.files[0];
      if (f) sicherungEinlesen(f);
      feld.value = "";
    });
  })();

  // Der Routendienst rechnet ohne Verkehr - eine Live-Auskunft gibt es
  // nur gegen Geld. Statt zu tun, als wuessten wir es, gibt es einen
  // Aufschlag, den jeder fuer seine Gegend selbst einstellt.
  function verkehrPuffer() {
    var v = parseInt(lesen("verkehr") || "0", 10);
    return isNaN(v) || v < 0 || v > 60 ? 0 : v;
  }
  function mitPuffer(sk) {
    if (!sk || !sk.minuten) return sk;
    var p = verkehrPuffer();
    if (!p) return sk;
    return { minuten: Math.round(sk.minuten * (1 + p / 100)), km: sk.km, art: sk.art };
  }
  function verkehrText() {
    var p = verkehrPuffer();
    return p ? "inkl. " + p + " % Puffer" : "ohne Verkehr";
  }
  function verkehrLaden(nurAnwenden) {
    var box = el("verkehr"); if (!box) return;
    var jetzt = String(verkehrPuffer());
    Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) {
      b.classList.toggle("aktiv", b.getAttribute("data-puffer") === jetzt);
      if (nurAnwenden || b._an) return;
      b._an = true;
      b.addEventListener("click", function () {
        var w = b.getAttribute("data-puffer");
        schreiben("verkehr", w === "0" ? null : w);
        verkehrLaden(true); einstellungenSync();
        if (aktuell && !el("detail").classList.contains("versteckt")) zeigePerson(aktuell, true);
        toast(w === "0" ? "Ohne Puffer, reine Fahrzeit." : "Abfahrt " + w + " % früher.", "gut");
      });
    });
  }

  // Was mit dem Konto auf jedes Geraet wandert. Eine Liste, nicht drei:
  // frueher stand sie einmal hier und einmal beim Anwenden, und was man
  // nur an einer Stelle eintrug, wurde nie gespeichert (so ging es
  // "pushvorlauf", "pushgespann" und den Kalenderwuenschen).
  var SYNC_SCHLUESSEL = ["verkehr", "einfach", "karten", "schrift", "akzent", "kompakt",
    "ziel", "start", "bereiche", "pushwoche", "pushabrechnung", "pushvorlauf", "pushgespann",
    "kalender", "schnell-aus", "start-ordnung", "tab2", "tab3", "tab4"];

  function einstellungenSammeln() {
    var o = {};
    SYNC_SCHLUESSEL.forEach(function (k) { o[k] = lesen(k) || null; });
    return o;
  }
  var syncTimer = null;
  // ---- Kalender: was im Termin steht, wann der Wecker klingelt
  //
  // Die ICS-Dateien baut der Workflow, nicht der Browser - jeder hat
  // seine eigene Adresse. Die Wuensche stehen deshalb im Konto
  // (profile.einstellungen.kalender) und esrw_ical.py liest sie beim
  // naechsten Lauf. Sichtbar wird eine Aenderung also erst, wenn der
  // Kalender das naechste Mal nachsieht.
  var KAL_STANDARD = { rolle: true, liga: true, halle: false, gespann: false,
                       beginn: "treffpunkt", alarme: ["-PT1H"] };
  function kalenderEinst() {
    var g = {};
    try { g = JSON.parse(lesen("kalender") || "{}") || {}; } catch (e) {}
    var w = {};
    Object.keys(KAL_STANDARD).forEach(function (k) { w[k] = g[k] === undefined ? KAL_STANDARD[k] : g[k]; });
    if (!Array.isArray(w.alarme)) w.alarme = KAL_STANDARD.alarme.slice();
    return w;
  }
  function kalenderMerken(w) {
    schreiben("kalender", JSON.stringify(w));
    einstellungenSync();
    kalenderEinstRendern();
  }

  var KAL_ALARME = [["-PT30M", "30 Min."], ["-PT1H", "1 Std."], ["-PT2H", "2 Std."],
                    ["-PT3H", "3 Std."], ["-P1D", "Tag vorher"]];

  // In einem Satz, was im Kalender landet - steht direkt beim Abo-Knopf,
  // wo man an den Kalender denkt, und fuehrt zu den Einstellungen.
  function kalenderKurzRendern() {
    var box = el("kalender-kurz"); if (!box) return;
    box.innerHTML = "";
    var w = kalenderEinst();
    var teile = [];
    if (w.rolle) teile.push("Rolle");
    if (w.liga) teile.push("Liga");
    if (w.halle) teile.push("Halle");
    if (w.gespann) teile.push("Gespann");
    var text = "Im Titel: " + (teile.length ? teile.join(" · ") : "nur die Paarung")
      + " · Beginn " + (w.beginn === "anstoss" ? "zum Anpfiff" : "zum Treffpunkt")
      + " · " + (w.alarme.length ? w.alarme.length + " Erinnerung" + (w.alarme.length === 1 ? "" : "en") : "kein Wecker");
    var p = document.createElement("p"); p.className = "meta"; p.style.margin = "0 0 8px";
    p.textContent = text;
    box.appendChild(p);
    // Ein richtiger Knopf wie "Link kopieren" daneben - als Textlink neben
    // der Zeile uebersah man ihn, genau das war die Klage.
    var reihe = document.createElement("div"); reihe.className = "zweit";
    var k = document.createElement("button"); k.type = "button";
    k.textContent = "Kalender anpassen";
    k.addEventListener("click", function () { location.hash = "einstellungen/kalender"; });
    reihe.appendChild(k);
    box.appendChild(reihe);
  }

  function kalenderEinstRendern() {
    kalenderKurzRendern();
    var box = el("kalender-einst"); if (!box) return;
    box.innerHTML = "";
    var w = kalenderEinst();

    // Vorschau: so sieht ein Termin dann aus
    var vorschau = document.createElement("p");
    vorschau.className = "meta kal-vorschau";
    function vorschauBauen() {
      var teile = [];
      if (w.rolle) teile.push("(L)SR");
      teile.push((w.liga ? "U13 RLB: " : "") + "Herforder EV – Krefelder EV");
      if (w.halle) teile.push("Eishalle Herford");
      if (w.gespann) teile.push("mit Menzel, Hofer");
      vorschau.textContent = teile.join(" · ");
    }

    function schalter(schluessel, titel, erklaerung) {
      var l = document.createElement("label");
      var sp = document.createElement("span");
      var b = document.createElement("b"); b.textContent = titel; sp.appendChild(b);
      if (erklaerung) { var sm = document.createElement("small"); sm.textContent = erklaerung; sp.appendChild(sm); }
      l.appendChild(sp);
      var c = document.createElement("input"); c.type = "checkbox"; c.checked = !!w[schluessel];
      c.addEventListener("change", function () { w[schluessel] = c.checked; kalenderMerken(w); });
      l.appendChild(c);
      box.appendChild(l);
    }

    var kopf = document.createElement("p"); kopf.className = "listen-kopf"; kopf.style.margin = "0 0 2px";
    kopf.textContent = "Was im Titel steht";
    box.appendChild(kopf);
    vorschauBauen();
    box.appendChild(vorschau);
    schalter("rolle", "Deine Rolle", "„(L)SR“ vorneweg");
    schalter("liga", "Liga", "„U13 RLB:“ vor der Paarung");
    schalter("halle", "Halle", "hinten am Titel, auch ohne Ortsangabe sichtbar");
    schalter("gespann", "Gespann", "die Nachnamen der Kollegen");

    // Beginn
    var l2 = document.createElement("label");
    var s2 = document.createElement("span");
    var b2 = document.createElement("b"); b2.textContent = "Termin beginnt"; s2.appendChild(b2);
    var sm2 = document.createElement("small"); sm2.textContent = "Treffpunkt ist 60 Min. vor Anpfiff"; s2.appendChild(sm2);
    l2.appendChild(s2);
    var wahl = document.createElement("select"); wahl.className = "mg-select";
    [["treffpunkt", "zum Treffpunkt"], ["anstoss", "zum Anpfiff"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
      if (w.beginn === o[0]) op.selected = true; wahl.appendChild(op);
    });
    wahl.addEventListener("change", function () { w.beginn = wahl.value; kalenderMerken(w); });
    l2.appendChild(wahl);
    box.appendChild(l2);

    // Erinnerungen
    var kopf2 = document.createElement("p"); kopf2.className = "listen-kopf"; kopf2.style.margin = "12px 0 2px";
    kopf2.textContent = "Erinnerungen";
    box.appendChild(kopf2);
    var hin = document.createElement("p"); hin.className = "meta"; hin.style.margin = "0 0 6px";
    hin.textContent = w.alarme.length
      ? "Dein Kalender weckt dich " + w.alarme.length + "× vor dem gewählten Beginn."
      : "Kein Wecker - der Termin steht nur im Kalender.";
    box.appendChild(hin);
    var reihe = document.createElement("div"); reihe.className = "stufen kal-alarme";
    KAL_ALARME.forEach(function (a) {
      var k = document.createElement("button"); k.type = "button"; k.textContent = a[1];
      if (w.alarme.indexOf(a[0]) >= 0) k.classList.add("aktiv");
      k.addEventListener("click", function () {
        var i = w.alarme.indexOf(a[0]);
        if (i >= 0) w.alarme.splice(i, 1);
        else if (w.alarme.length >= 4) { toast("Mehr als vier Wecker nimmt der Kalender nicht.", "warn"); return; }
        else w.alarme.push(a[0]);
        kalenderMerken(w);
      });
      reihe.appendChild(k);
    });
    box.appendChild(reihe);

    var fuss = document.createElement("p"); fuss.className = "meta"; fuss.style.margin = "10px 0 0";
    fuss.textContent = "Die Kalenderdatei baut der Server. Deine Änderung steht spätestens in einer Stunde drin, "
      + "wenn dein Kalender das nächste Mal nachsieht.";
    box.appendChild(fuss);
  }

  function einstellungenSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      if (!sitzungVorhanden() || !window.Mitglieder) return;
      window.Mitglieder.einstellungenSpeichern(einstellungenSammeln()).catch(function () {});
    }, 800);
  }
  function einstellungenAnwenden(e) {
    if (!e) return;
    var geaendert = false;
    SYNC_SCHLUESSEL.forEach(function (k) { if ((lesen(k) || null) !== (e[k] || null)) { schreiben(k, e[k] || null); geaendert = true; } });
    if (geaendert) { einstellungenLaden(true); themaAnwenden(); einfachAnwenden(); tabsAnwenden(); funktionenAnwenden(funktionenLesen()); toast("Einstellungen vom Konto übernommen", ""); if (aktuell && !el("detail").classList.contains("versteckt")) zeigePerson(aktuell, true); }
  }
  // Das eigene Bild liegt zusaetzlich auf dem Geraet, damit die Kopfzeile
  // beim naechsten Start sofort stimmt - start.js liest es von dort.
  document.addEventListener("mg-bild", function (e) {
    var b = e.detail && e.detail.bild;
    schreiben("mein-bild", b || null);
    if (b && profil) { bilder[profil.slug] = { bild: b }; }
    avatarKopf();
  });
  // Steht im Konto ein Name, ist das Profil dieses Geraets daran gebunden.
  var kontoName = null;
  function kontoGebunden() { return !!(kontoName && sitzungVorhanden()); }
  var kontoObmann = false;
  document.addEventListener("mg-profil", function (e) {
    if (e.detail && e.detail.slug) kontoName = e.detail.slug;
    if (e.detail && e.detail.obmann) {
      kontoObmann = true;
      // Ohne eigene Einteilung ist die Namensliste der falsche Startpunkt
      if (!profil || !profil.slug) {
        obmannHinweis();
        if (!location.hash || location.hash === "#" || location.hash === "#meine") location.hash = "plan";
      }
    }
    if (e.detail && e.detail.einstellungen) einstellungenAnwenden(e.detail.einstellungen);
    else if (e.detail && sitzungVorhanden()) einstellungenSync();
    var slug = e.detail && e.detail.slug, p = slug && personMit(slug);
    if (!p || (profil && profil.slug === slug)) return;
    profil = { slug: p.slug, name: p.name, gesehen: {}, begonnen: false };
    profilSchreiben(); schreiben("person", null); avatarKopf();
    toast("„Start“ zeigt jetzt " + p.name, "gut");
  });
  document.addEventListener("mg-zaehler", function (e) { leisteZaehler(e.detail || {}); });
  document.addEventListener("mg-reiter", function () { if (!el("mitglieder").classList.contains("versteckt")) ansicht("mitglieder"); });

  // Punkt/Zahl am Reiter "Mitglieder": angemeldet, offene Gesuche, wartende Konten
  function leisteZaehler(z) {
    var b = el("tab-mitglieder"), alt = b.querySelector(".punkt");
    if (alt) alt.remove();
    if (!z.angemeldet) return;
    var n = (z.gesuche || 0) + (z.wartend || 0);
    try { if (navigator.setAppBadge) { if ((z.info || 0) + n > 0) navigator.setAppBadge((z.info || 0) + n); else if (navigator.clearAppBadge) navigator.clearAppBadge(); } } catch (e) {}
    var p = document.createElement("span"); p.className = "punkt" + (n ? " zahl" : "");
    if (n) p.textContent = n > 9 ? "9+" : String(n);
    p.title = n ? (z.gesuche || 0) + " offene Gesuche" + (z.wartend ? ", " + z.wartend + " warten auf Freischaltung" : "") : "angemeldet";
    b.appendChild(p);
  }
  // Ohne Konto sind nur die Namensauswahl, die Startseite einer Person, der
  // Spielplan und die Detailseiten dazu (Spiel, Halle) zu sehen. Alles
  // andere - Archiv, Statistik, Aenderungen, Zusammen fahren, Hallenkarte
  // und der ganze Mitgliederbereich - erst nach der Anmeldung.
  // Das ist die Anzeige; die Daten selbst schuetzen die Regeln in Supabase.
  var NUR_MITGLIEDER = { archiv: 1, statistik: 1, aenderungen: 1, mitfahren: 1, karte: 1 };
  function nurFuerMitglieder(ziel) {
    var slug = String(ziel || "").replace(/^#/, "").split("/")[0];
    return !!NUR_MITGLIEDER[slug];
  }
  // Fuer die Menues zaehlen auch die Unterseiten des Mitgliederbereichs dazu -
  // "Notizen" oder "Info" anzubieten, wenn daraus nur ein Anmeldefenster wird,
  // fuehrt in die Irre. Die Seite selbst bleibt erreichbar: dort steht das
  // Anmeldeformular.
  function gesperrtFuerMich(ziel) {
    if (sitzungVorhanden()) return false;
    var s = String(ziel || "").replace(/^#/, "");
    if (nurFuerMitglieder(s)) return true;
    return s.indexOf("mitglieder/") === 0;
  }
  function sitzungVorhanden() {
    try {
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k) || k === "mock_session") return true; }
    } catch (e) {}
    return false;
  }
  function zaehlerHolen() {
    if (!sitzungVorhanden()) return;
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { if (st.eingerichtet && st.session) return window.Mitglieder.zaehler(); })
      .then(function (z) { if (z) leisteZaehler(z); }).catch(function () {});
  }
  el("melde-knopf").addEventListener("click", meldeAnfragen);
  el("kopieren").addEventListener("click", function () {
    if (!aktuell) return;
    var url = feedUrl(aktuell.slug, location.protocol), knopf = el("kopieren");
    var fertig = function () { toast("Link kopiert ✓", "gut"); knopf.textContent = "Kopiert ✓"; setTimeout(function () { knopf.textContent = "Link kopieren"; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(fertig, function () { prompt("Link:", url); }); else prompt("Link:", url);
  });
  // Wie auf dem iPhone ueblich: ein zweiter Tipp auf den Platz, auf dem man
  // schon steht, scrollt die Seite nach oben.
  function tabTipp(knopf, fn) {
    knopf.addEventListener("click", function () {
      if (knopf.classList.contains("aktiv") && window.scrollY > 40) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      fn();
    });
  }
  tabTipp(el("tab-plan"), function () { location.hash = el("tab-plan")._ziel || "plan"; });
  el("gesperrt-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = ""; });
  el("aenderungen-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = "mehr"; });
  el("regeln-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = "mehr"; });
  el("rechner-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = "mehr"; });
  el("archiv-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = "mehr"; });
  ["archiv-suche", "archiv-saison", "archiv-liga", "archiv-rolle", "archiv-halle", "archiv-person"].forEach(function (id) { el(id).addEventListener(id === "archiv-suche" ? "input" : "change", function () { archivRendern(); }); });
  el("archiv-suche").addEventListener("change", function () { archivSucheMerken(el("archiv-suche").value); });
  el("archiv-alle").addEventListener("change", function () { el("archiv-person").classList.toggle("versteckt", !el("archiv-alle").checked); zeigeArchiv(el("archiv-alle").checked ? "alle" : ""); });
  el("mitfahren-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = "mehr"; });
  tabTipp(el("tab-tausch"), function () { location.hash = el("tab-tausch")._ziel || "mitglieder/tausch"; });
  tabTipp(el("tab-abrechnung"), function () { location.hash = el("tab-abrechnung")._ziel || "mitglieder/abrechnung"; });
  tabTipp(el("tab-mitglieder"), function () { location.hash = "mehr"; });
  el("spiel-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = ""; });
  el("einstellungen-zurueck").addEventListener("click", function () { location.hash = "mehr"; });
  el("stat-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = ""; });
  el("karte-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = "mehr"; });
  el("abfahrt-ics").addEventListener("click", function () { if (aktuell) abfahrtIcs(aktuell); });
  el("ziel").addEventListener("change", function (e) { var v = parseInt(e.target.value, 10); schreiben("ziel", v > 0 ? String(v) : null); toast(v > 0 ? "Saisonziel: " + v + " Spiele" : "Saisonziel entfernt", "gut"); einstellungenSync(); });
  el("halle-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = ""; });
  el("tab-meine").addEventListener("click", function () { if (location.hash === "" || location.hash === "#") ausHash(); else location.hash = ""; });
  el("plan-filter").addEventListener("input", zeigePlan);
  el("plan-vergangene").addEventListener("change", zeigePlan);
  el("plan-hallen").addEventListener("change", zeigePlan);
  el("plan-offen").addEventListener("change", zeigePlan);
  Array.prototype.forEach.call(el("plan-schnell").querySelectorAll(".chip"), function (c) {
    c.addEventListener("click", function () { var w = c.getAttribute("data-schnell"); schnellWahl = schnellWahl === w ? null : w; zeigePlan(); });
  });
  // Nach oben
  el("hoch").addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  window.addEventListener("scroll", function () { el("hoch").classList.toggle("versteckt", window.scrollY < 700); }, { passive: true });
  // Sprung-Merker: zurueck von der Spielseite landet wieder an der alten Stelle
  var scrollMerker = {}, sprungZiel = null;
  window.addEventListener("hashchange", function (e) {
    try { var alt = new URL(e.oldURL).hash; if (alt) { scrollMerker[alt] = window.scrollY; if (alt.indexOf("#spiel/") === 0) schreiben("zuletzt-spiel", alt); } } catch (x) {}
    var neu = location.hash;
    if (scrollMerker[neu] !== undefined) {
      var ziel = scrollMerker[neu]; delete scrollMerker[neu]; sprungZiel = ziel;
      // Listen laden teils nach - deshalb mehrere Anlaeufe, bis die Hoehe reicht
      [30, 300, 900].forEach(function (ms, i) { setTimeout(function () { if (sprungZiel === null && i) return; if (document.documentElement.scrollHeight - window.innerHeight >= ziel - 4 || i === 2) { window.scrollTo(0, ziel); sprungZiel = null; } }, ms); });
    }
  });
  // Welche Ziele zuletzt benutzt wurden - der Schnellzugriff sortiert danach
  window.addEventListener("hashchange", function () {
    var h = location.hash; if (!h || h.indexOf("#spiel/") === 0 || h === "#") return;
    var basis = h.split("/").slice(0, 2).join("/");
    var l = []; try { l = JSON.parse(lesen("zuletzt-ziele") || "[]"); } catch (e) {}
    l = [basis].concat(l.filter(function (x) { return x !== basis; })).slice(0, 6);
    schreiben("zuletzt-ziele", JSON.stringify(l));
  });
  window.addEventListener("hashchange", ausHash);
  // Das Blatt liegt im Markup in der Filterleiste; deren backdrop-filter wuerde ein
  // position:fixed-Kind einfangen (verschwommen, falsch positioniert) - also an den Body haengen
  document.body.appendChild(el("plan-filter-blatt"));
  function filterBlatt(offen) {
    var b = el("plan-filter-blatt"), hg = el("blatt-hintergrund");
    if (offen) { b.classList.remove("versteckt"); hg.classList.remove("versteckt"); setTimeout(function () { b.classList.add("offen"); }, 20); document.body.style.overflow = "hidden"; }
    else { b.classList.remove("offen"); hg.classList.add("versteckt"); document.body.style.overflow = ""; setTimeout(function () { if (!b.classList.contains("offen")) b.classList.add("versteckt"); }, 300); }
    filterHoehe();
  }
  el("plan-filter-knopf").addEventListener("click", function () { filterBlatt(el("plan-filter-blatt").classList.contains("versteckt")); });
  // Suchfeld im Spielplan spart Platz: nur auf Wunsch (oder wenn etwas drinsteht)
  function planSucheZeigen(an) {
    var z = el("plan-suchzeile"); z.classList.toggle("versteckt", !an);
    el("plan-suche-knopf").classList.toggle("aktiv", !!an);
    if (an) setTimeout(function () { el("plan-filter").focus(); }, 30);
    filterHoehe();
  }
  el("plan-suche-knopf").addEventListener("click", function () { planSucheZeigen(el("plan-suchzeile").classList.contains("versteckt")); });
  el("plan-filter").addEventListener("blur", function () { if (!el("plan-filter").value.trim()) planSucheZeigen(false); });
  el("plan-filter").addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); el("plan-filter").blur(); } });
  el("plan-filter-zu").addEventListener("click", function () { filterBlatt(false); });
  el("plan-filter-fertig").addEventListener("click", function () { filterBlatt(false); });
  el("plan-filter-blatt").querySelector(".blatt-griff").addEventListener("click", function () { filterBlatt(false); });
  el("blatt-hintergrund").addEventListener("click", function () { filterBlatt(false); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !el("plan-filter-blatt").classList.contains("versteckt")) filterBlatt(false); });
  // Blatt nach unten wischen schliesst
  (function () { var y0 = null; var b = el("plan-filter-blatt");
    b.addEventListener("touchstart", function (ev) { if (b.scrollTop <= 0 && ev.touches.length === 1) y0 = ev.touches[0].clientY; }, { passive: true });
    b.addEventListener("touchend", function (ev) { if (y0 !== null && ev.changedTouches[0].clientY - y0 > 80) filterBlatt(false); y0 = null; }, { passive: true });
  })();
  // 1) Leichte Vibration bei Schaltern (Android)
  document.addEventListener("change", function (ev) { if (ev.target && ev.target.type === "checkbox" && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} } });
  el("plan-teilen").addEventListener("click", function () {
    var liste = planGefiltert(false).filter(function (s) { return !s.vergangen; }).slice(0, 40);
    if (!liste.length) { toast("Nichts zu teilen.", ""); return; }
    var tag = null, zeilen = [];
    liste.forEach(function (s) {
      var d = new Date(s.beginn), k = d.toDateString();
      if (k !== tag) { tag = k; zeilen.push(""); zeilen.push(datumKurz(d).toUpperCase()); }
      zeilen.push(uhr(d) + " " + (s.liga ? s.liga + " " : "") + s.paarung + " · " + (s.halle || "?") + (s.besetzung.length ? " · " + s.besetzung.map(function (b) { return b.name.split(",")[0]; }).join("/") : " · OFFEN"));
    });
    var text = "Spielplan" + (filterAktiv() ? " (gefiltert)" : "") + ":" + zeilen.join("\n") + "\n\n" + basis + "#plan";
    if (navigator.share) navigator.share({ text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast("Spielplan kopiert ✓", "gut"); });
    else prompt("Spielplan:", text);
  });
  el("plan-filter-leeren").addEventListener("click", function () {
    ["plan-vergangene", "plan-offen", "plan-hallen", "plan-meine"].forEach(function (id) { el(id).checked = false; });
    ligenWahl = {}; schnellWahl = null; el("plan-filter").value = ""; zeigePlan();
  });
  el("plan-meine").addEventListener("change", function () { schreiben("plan-meine-aus", el("plan-meine").checked ? null : "1"); zeigePlan(); });
  // Wischen zwischen den Wochen (Wochenansicht) und Monaten (Monatsansicht)
  (function () {
    var x0 = null, y0 = null;
    el("plan").addEventListener("touchstart", function (ev) { if (!ev.touches || ev.touches.length !== 1) return; x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; }, { passive: true });
    el("plan").addEventListener("touchend", function (ev) {
      if (x0 === null || !ev.changedTouches) return;
      var dx = ev.changedTouches[0].clientX - x0, dy = ev.changedTouches[0].clientY - y0; x0 = y0 = null;
      if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
      var modus = planModus();
      if (modus === "woche" && planWocheStart) { planWocheStart = new Date(planWocheStart.getTime() + (dx < 0 ? 7 : -7) * 86400000); zeigeWochenansicht(); }
      else if (modus === "monat" && planMonatStart) { planMonatStart = new Date(planMonatStart.getFullYear(), planMonatStart.getMonth() + (dx < 0 ? 1 : -1), 1); planTag = null; zeigeMonat(); }
    }, { passive: true });
  })();
  el("plan-drucken").addEventListener("click", function () {
    if (planModus() === "monat") { toast("Drucken geht in der Karten- oder Listenansicht.", ""); return; }
    document.body.classList.add("druck-plan");
    var weg = function () { document.body.classList.remove("druck-plan"); window.removeEventListener("afterprint", weg); };
    window.addEventListener("afterprint", weg);
    window.print();
  });
  Array.prototype.forEach.call(el("plan-modus").querySelectorAll("button"), function (b) {
    b.addEventListener("click", function () { schreiben("plan-modus", b.getAttribute("data-modus")); schreiben("plan-kompakt", null); zeigePlan(); });
  });
  el("plan-heute").addEventListener("click", function () {
    var h = el("plan-ab-heute"); if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" });
  });
  if (navigator.share) {
    el("teilen").classList.remove("versteckt");
    el("teilen").addEventListener("click", function () { if (aktuell) navigator.share({ title: "Einteilungen " + aktuell.name, url: basis + "#" + aktuell.slug }).catch(function () {}); });
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && daten) neuLaden(); });

  // Der Kern einer Punktwolke: alles im Umkreis von 150 km um die Mitte.
  // Einzelne weit entfernte Hallen bleiben sichtbar, bestimmen aber nicht,
  // wie weit die Karte herauszoomt.
  function kernPunkte(punkte) {
    if (punkte.length < 3) return punkte;
    function mitte(i) { var w = punkte.map(function (p) { return p[i]; }).sort(function (a, b) { return a - b; }); return w[Math.floor(w.length / 2)]; }
    var m = [mitte(0), mitte(1)];
    var kern = punkte.filter(function (p) { return kmZwischen(p, m) <= 150; });
    return kern.length >= 2 ? kern : punkte;
  }
  // Legende unter der Hallenkarte - sonst raet man, was die Punkte bedeuten
  function kartenLegende(mein, andere, leer) {
    var alt = el("karte").querySelector(".karten-legende"); if (alt) alt.remove();
    var box = document.createElement("div"); box.className = "karten-legende";
    [[mein, "deine Spiele"], [andere, "Spiele von Kollegen"], [leer, "keine Spiele"], ["#d97706", "zu Hause"]].forEach(function (p) {
      var s = document.createElement("span"); var i = document.createElement("i"); i.style.background = p[0];
      s.appendChild(i); s.appendChild(document.createTextNode(p[1])); box.appendChild(s);
    });
    var k = el("karte-div");
    if (k && k.parentNode) k.parentNode.insertBefore(box, k.nextSibling); else el("karte").appendChild(box);
  }
  function filterHoehe() {
    var f = document.querySelector("#plan .filterleiste");
    if (f) document.documentElement.style.setProperty("--filter-hoehe", f.offsetHeight + "px");
  }
  window.addEventListener("resize", filterHoehe);

  // Tastatur am Desktop: / Suche, 1-5 Reiter, Pfeile Woche/Monat, Esc schliesst
  document.addEventListener("keydown", function (ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    var t = ev.target, tippt = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (ev.key === "Escape") {
      if (!el("tour").classList.contains("versteckt")) return;           // Tour hat eigenen Escape
      if (!el("plan-filter-blatt").classList.contains("versteckt")) return; // Blatt ebenso
      if (tippt && t.value !== undefined && t.value !== "") { t.value = ""; t.dispatchEvent(new Event("input", { bubbles: true })); return; }
      if (tippt) t.blur();
      return;
    }
    if (tippt) return;
    if (ev.key === "/") { ev.preventDefault(); location.hash = "suche"; setTimeout(function () { el("suche").focus(); }, 60); return; }
    if (ev.key === "?") { ev.preventDefault(); location.hash = "anleitung"; return; }
    var reiter = { "1": "tab-meine", "2": "tab-plan", "3": "tab-tausch", "4": "tab-abrechnung", "5": "tab-mitglieder" }[ev.key];
    if (reiter) { var k = el(reiter); if (k && getComputedStyle(k).display !== "none") { ev.preventDefault(); k.click(); } return; }
    if ((ev.key === "ArrowLeft" || ev.key === "ArrowRight") && !el("plan").classList.contains("versteckt")) {
      var vor = ev.key === "ArrowRight", modus = planModus();
      if (modus === "woche" && planWocheStart) { ev.preventDefault(); planWocheStart = new Date(planWocheStart.getTime() + (vor ? 7 : -7) * 86400000); zeigeWochenansicht(); }
      else if (modus === "monat" && planMonatStart) { ev.preventDefault(); planMonatStart = new Date(planMonatStart.getFullYear(), planMonatStart.getMonth() + (vor ? 1 : -1), 1); planTag = null; zeigeMonat(); }
    }
  });

  // Hinweis, die Seite als App abzulegen: iOS zeigt keinen eigenen Dialog,
  // Android liefert ein beforeinstallprompt-Ereignis, das wir aufheben.
  var installEreignis = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEreignis = e; zeigeInstallHinweis(); });
  function zeigeInstallHinweis() {
    var box = el("install");
    if (alsApp() || lesen("install-weg") === "1") { box.classList.add("versteckt"); return; }
    var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (!ios && !installEreignis) { box.classList.add("versteckt"); return; }
    box.classList.remove("versteckt");
    el("install-text").textContent = ios
      ? "In Safari unten auf Teilen tippen, dann „Zum Home-Bildschirm“. Dann gibt es auch Mitteilungen."
      : "Als App auf den Startbildschirm legen, startet schneller und kann Mitteilungen.";
    var knopf = el("install-knopf");
    knopf.classList.toggle("versteckt", !installEreignis);
    knopf.onclick = function () { if (installEreignis) { installEreignis.prompt(); installEreignis = null; box.classList.add("versteckt"); } };
    el("install-weg").onclick = function () { schreiben("install-weg", "1"); box.classList.add("versteckt"); };
  }

  var ladeZaehler = 0;
  // Beim Start dauert es einen Moment, bis die Einteilungen da sind: erst
  // der Schluessel aus der Datenbank, dann die Datei, dann das Entschluesseln.
  // Solange sagt der Platzhalter, woran es gerade liegt.
  var startStufen = ["Anmeldung prüfen", "Schlüssel holen", "Einteilungen laden", "Entschlüsseln", "Fast fertig"];
  // Ein Satz je Schritt - sonst steht da eine Zahl, die niemandem sagt,
  // worauf gerade gewartet wird.
  var startHinweise = [
    "Wir sehen nach, ob du angemeldet bist.",
    "Die Einteilungen liegen verschlüsselt – der Schlüssel kommt aus deinem Konto.",
    "Der aktuelle Stand wird geholt.",
    "Gleich sind die Spiele lesbar.",
    "Deine Seite wird aufgebaut."
  ];
  if (!navigator.onLine) {
    var st = el("start-stufe-text");
    if (st) st.textContent = "Offline, gespeicherter Stand wird geladen";
  }
  var startFertig = false;
  function startStufe(nr) {
    var d = el("detail");
    if (startFertig || !d || !d.classList.contains("start-laedt")) return;
    if (nr >= startStufen.length) startFertig = true;
    var t = el("start-stufe-text"), b = el("start-fortschritt");
    var z = el("start-stufe-zahl"), hw = el("start-stufe-hinweis");
    if (t) t.textContent = startStufen[nr - 1] || "";
    if (z) z.textContent = Math.min(nr, startStufen.length) + " von " + startStufen.length;
    if (hw) hw.textContent = startHinweise[nr - 1] || "";
    if (b) b.style.width = Math.round(nr / startStufen.length * 100) + "%";
  }
  // Dauert es ungewoehnlich lange, lieber sagen warum, als still warten
  setTimeout(function () {
    var d = el("detail"), t = el("start-stufe-text");
    if (d && d.classList.contains("start-laedt") && t) t.textContent = "Das dauert länger als sonst, die Verbindung ist langsam";
  }, 8000);

  function ladeAnzeige(an) {
    ladeZaehler = Math.max(0, ladeZaehler + (an ? 1 : -1));
    var b = el("ladebalken"); if (!b) return;
    b.classList.toggle("laeuft", ladeZaehler > 0);
  }
  window.ladeAnzeige = ladeAnzeige;
  function holeKlartext(name) {
    return fetch(name + "?" + Date.now()).then(function (r) { if (!r.ok) throw 0; return r.json(); });
  }
  function hole(name) {
    ladeAnzeige(true);
    var lauf = imTresor(name) ? holeTresor(name) : holeKlartext(name);
    return lauf.then(function (d) { ladeAnzeige(false); return d; }, function (e) { ladeAnzeige(false); throw e; });
  }
  // Erst den Tresor versuchen, dann - falls die Umstellung noch nicht gelaufen
  // ist - die alte Klartextdatei.
  function holeTresor(name) {
    return tresorAufschliessen().then(function (k) {
      if (!k) return holeKlartext(name).catch(function () {
        // Kein Schluessel und kein Klartext: das Konto ist noch nicht
        // freigeschaltet - das soll die App auch so sagen.
        throw new Error(sitzungVorhanden()
          ? "Dein Konto ist noch nicht freigeschaltet - der Betreiber macht das von Hand."
          : "Bitte anmelden.");
      });
      startStufe(3);
      return fetch(name + ".bin?" + Date.now()).then(function (r) {
        if (!r.ok) return holeKlartext(name);
        return r.arrayBuffer()
          .then(function (buf) { startStufe(4); return tresorOeffnen(buf); })
          .then(function (t) { return JSON.parse(t); })
          .catch(function () {
            // Schluessel gewechselt? Einmal frisch holen, dann aufgeben.
            schreiben("tresor", null); tresorKey = null; tresorHmac = null; tresorMarken = {};
            return tresorAufschliessen(true).then(function (k2) {
              if (!k2) throw new Error("Daten sind verschlüsselt - Freischaltung abwarten.");
              return fetch(name + ".bin?" + Date.now()).then(function (r2) { return r2.arrayBuffer(); })
                .then(tresorOeffnen).then(function (t) { return JSON.parse(t); });
            });
          });
      });
    });
  }
  // ================================================================
  // Tresor: die Daten in docs/ sind verschluesselt
  // ================================================================
  // daten.json, archiv.json, protokoll.json und die Saison-Dateien liegen
  // als .bin auf dem Server - AES-256-GCM. Den Schluessel gibt Supabase nur
  // freigeschalteten Mitgliedern heraus (Tabelle "tresor"). Damit nuetzt die
  // Adresse einer Datei allein niemandem etwas.
  var tresorKey = null, tresorHmac = null, tresorMarken = {}, tresorLauf = null;
  var TRESOR_DATEIEN = { "daten.json": 1, "archiv.json": 1, "protokoll.json": 1 };
  function imTresor(name) { return !!TRESOR_DATEIEN[name] || String(name).indexOf("archiv/") === 0; }

  function schluesselSetzen(b64) {
    var roh = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    return Promise.all([
      crypto.subtle.importKey("raw", roh, { name: "AES-GCM" }, false, ["decrypt"]),
      crypto.subtle.importKey("raw", roh, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    ]).then(function (k) { tresorKey = k[0]; tresorHmac = k[1]; return tresorKey; });
  }
  function tresorAufschliessen(nochmal) {
    if (tresorKey && !nochmal) return Promise.resolve(tresorKey);
    if (tresorLauf && !nochmal) return tresorLauf;
    var gemerkt = nochmal ? null : lesen("tresor");
    tresorLauf = (gemerkt ? Promise.resolve(gemerkt) : holeSchluessel())
      .then(function (b64) {
        if (!b64) { tresorLauf = null; return null; }
        schreiben("tresor", b64);
        return schluesselSetzen(b64);
      })
      .catch(function () { tresorLauf = null; return null; });
    return tresorLauf;
  }
  // Der Schluessel kommt ueber den angemeldeten Zugang - der anonyme
  // Schluessel darf die Tabelle nicht lesen.
  function holeSchluessel() {
    if (!sitzungVorhanden()) return Promise.resolve(null);
    startStufe(1);
    return ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) {
        startStufe(2);
        return st && st.session && window.Mitglieder.tresorSchluessel ? window.Mitglieder.tresorSchluessel() : null;
      })
      .catch(function () { return null; });
  }
  function tresorOeffnen(buf) {
    var b = new Uint8Array(buf);
    var kopf = String.fromCharCode(b[0], b[1], b[2], b[3], b[4]);
    if (b.length < 18 || kopf !== "ESRW1") return Promise.reject(new Error("keine Tresordatei"));
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(5, 17) }, tresorKey, b.slice(17))
      .then(function (p) { return new TextDecoder().decode(p); });
  }
  // Name der Kalenderdatei: derselbe HMAC wie in tresor.py
  function feedMarke(zweck) {
    if (tresorMarken[zweck]) return Promise.resolve(tresorMarken[zweck]);
    if (!tresorHmac) return Promise.resolve(null);
    return crypto.subtle.sign("HMAC", tresorHmac, new TextEncoder().encode("feed:" + zweck))
      .then(function (sig) {
        var hex = Array.prototype.map.call(new Uint8Array(sig), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
        tresorMarken[zweck] = hex.slice(0, 32);
        return tresorMarken[zweck];
      });
  }
  function feedBereit(slug) { return tresorAufschliessen().then(function () { return feedMarke(slug); }); }

  var letzterLauf = null;
  function standAnzeigen(d, lauf) {
    letzterLauf = lauf;
    if (lauf && lauf.stand) letzterStand = new Date(lauf.stand).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    var s = el("stand"); s.className = "stand"; s.innerHTML = "";
    var zahlen = d.spiele_gesamt + " Spiele · " + d.personen.length + " SR";
    if (lauf && lauf.stand) {
      var stand = new Date(lauf.stand), alter = (Date.now() - stand.getTime()) / 3600000, min = Math.round(alter * 60);
      var relativ = min < 1 ? "gerade eben" : min < 60 ? "vor " + min + " Min." : alter < 24 ? "vor " + Math.round(alter) + " Std." : stand.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      s.appendChild(document.createTextNode("Stand " + relativ));
      var mehr = document.createElement("span"); mehr.className = "stand-mehr"; mehr.textContent = " · " + zahlen; s.appendChild(mehr);
      s.title = "Letzter Lauf: " + stand.toLocaleString("de-DE") + " · " + zahlen;
      if (alter > 6) { s.className = "stand alt"; var w = document.createElement("span"); w.className = "stand-mehr"; w.textContent = ", lange nicht aktualisiert"; s.appendChild(w); }
    } else s.textContent = zahlen;
  }
  // Ziehen zum Aktualisieren: nur ganz oben und nur in den Listen. Der
  // Griff bleibt passiv, damit das Rollen nicht ruckelt.
  function ziehenEinrichten() {
    var band = el("ziehen");
    if (!band || !("ontouchstart" in window)) return;
    var start = -1, weg = 0, laeuft = false;
    function erlaubt() {
      if (laeuft || window.scrollY > 4) return false;
      return ["detail", "plan", "auswahl", "archiv", "aenderungen"].some(function (id) {
        var k = el(id); return k && !k.classList.contains("versteckt");
      });
    }
    document.addEventListener("touchstart", function (e) {
      start = (e.touches.length === 1 && erlaubt()) ? e.touches[0].clientY : -1;
      weg = 0;
    }, { passive: true });
    document.addEventListener("touchmove", function (e) {
      if (start < 0) return;
      var roh = e.touches[0].clientY - start;
      if (roh <= 0) { weg = 0; band.style.transform = ""; band.classList.remove("da", "bereit"); return; }
      weg = Math.min(roh * 0.5, 90);
      band.classList.add("da");
      band.classList.toggle("bereit", weg >= 55);
      band.style.transform = "translateY(" + weg + "px)";
      band.textContent = weg >= 55 ? "Loslassen, dann wird geladen" : "Zum Aktualisieren ziehen";
    }, { passive: true });
    document.addEventListener("touchend", function () {
      if (start < 0) return;
      var los = weg >= 55;
      start = -1; weg = 0;
      band.style.transform = "";
      if (!los) { band.classList.remove("da", "bereit"); return; }
      laeuft = true;
      band.classList.remove("bereit");
      band.style.transform = "translateY(0)";
      band.textContent = "Wird geladen \u2026";
      neuLaden().then(function () {
        laeuft = false;
        band.style.transform = "";
        band.classList.remove("da", "bereit");
        band.textContent = "Zum Aktualisieren ziehen";
        toast("Aktualisiert", "gut");
      });
    }, { passive: true });
  }
  ziehenEinrichten();

  function neuLaden() {
    return Promise.all([hole("daten.json"), hole("stand.json").catch(function () { return null; })])
      .then(function (b) {
        daten = b[0]; standAnzeigen(daten, b[1]); betreiberAnwenden(); korrekturenAnwenden(); betreiberLaden(false).then(function () { korrekturenLaden(false); });
        funktionenLaden();
        // Nur die gerade sichtbare Ansicht neu zeichnen - nie die Seite wechseln
        var sichtbar = function (id) { return !el(id).classList.contains("versteckt"); };
        if (aktuell && sichtbar("detail")) { var frisch = personMit(aktuell.slug); if (frisch) zeigePerson(frisch, true); }
        else if (aktuell && sichtbar("statseite")) zeigeStatSeite(aktuell.slug);
        else if (sichtbar("plan")) zeigePlan();
      }).catch(function () {});
  }

  // ----------------------------------------------------------------
  // Ohne Anmeldung passiert hier gar nichts: keine Daten, keine Seiten.
  // Die Einteilungen liegen verschluesselt auf dem Server, und der
  // Schluessel kommt erst nach der Anmeldung aus Supabase.
  // ----------------------------------------------------------------
  function anmeldeschirm(grund) {
    // Auch hier die Leiste setzen - ohne Konto fuehrt der vierte Platz
    // zur Anmeldung, der dritte bleibt leer.
    tabsAnwenden();
    document.documentElement.classList.add("abgemeldet");
    aktuell = null; daten = null;
    ansicht("mitglieder");
    if (grund) toast(grund, "warn");
    ladeMitglieder().then(function (M) { M.oeffnen(el("mitglieder"), mitgliederKontext(), null); })
      .catch(function (e) { el("mitglieder").textContent = "Anmeldung konnte nicht geladen werden: " + e.message; });
    el("stand").textContent = "nur für Mitglieder";
  }
  function startLaden() {
    document.documentElement.classList.remove("abgemeldet");
    return Promise.all([hole("daten.json"), hole("stand.json").catch(function () { return null; })])
    .then(function (b) {
      startStufe(5);
      daten = b[0]; profil = profilLesen();
      document.title = daten.titel || "ESRW App"; titelAnpassen(); setTimeout(titelAnpassen, 800); el("quelle").href = daten.quelle;
      standAnzeigen(daten, b[1]);
      el("fuss").textContent = "Termine beginnen " + daten.vorlauf_minuten + " Minuten vor Spielbeginn, damit du rechtzeitig an der Halle bist.";
      einstellungenLaden(); filterLaden(); avatarKopf(); zeigeListe("");
      // Erst die Funktions-Schalter (Cache sofort, Server kurz danach), dann routen - sonst
      // landet ein Direktlink auf "Tausch" beim ersten Besuch faelschlich auf "abgeschaltet"
      var geroutet = false, routen = function () { if (geroutet) return; geroutet = true; ausHash(); tourWennNeu(); };
      funktionenLaden().then(routen); setTimeout(routen, 1500);
      betreiberLaden(true).then(function () { korrekturenLaden(true); }); zeigeInstallHinweis(); zeigeNeu(); filterHoehe(); netzAnzeigen(); adminKnopfZeigen(); testBalken();
      setTimeout(zaehlerHolen, 1500);
      setTimeout(bilderLaden, 1200);
      // Gehoert das Konto einem Obmann, fragt die App nicht nach einem Namen
      if (sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
        .then(function (st) { return st.eingerichtet && st.session && window.Mitglieder.kontoKurz ? window.Mitglieder.kontoKurz() : null; })
        .then(function (k) {
          if (!k || !k.obmann) return;
          kontoObmann = true;
          if (profil && profil.slug) return;
          obmannHinweis();
          if (!el("auswahl").classList.contains("versteckt")) location.hash = "plan";
        }).catch(function () {});
    })
    .catch(function (e) {
      anmeldeschirm((e && e.message) || "Daten konnten nicht geladen werden.");
      el("stand").className = "stand alt";
    });
  }
  // Fusszeile: der Gesamtkalender heisst mit Schluessel anders
  feedBereit("alle").then(function (m) { if (m && el("alle")) { el("alle").href = "feeds/" + m + ".ics"; el("alle").textContent = "Kalender aller Spiele"; } });
  if (sitzungVorhanden()) startLaden(); else anmeldeschirm();
  // An- und Abmelden: einmal sauber neu aufbauen, statt halbe Zustaende zu flicken
  // Nur ein echter Wechsel (an -> aus oder aus -> an) baut die App neu auf.
  // Beim Start meldet der Mitgliederbereich die wiederhergestellte Sitzung -
  // das ist kein Wechsel, sonst laedt die Seite sich endlos selbst neu.
  var angemeldetStand = sitzungVorhanden();
  document.addEventListener("mg-sitzung", function (e) {
    var an = !!(e.detail && e.detail.angemeldet);
    if (an === angemeldetStand) return;
    angemeldetStand = an;
    if (!an) { try { localStorage.removeItem("tresor"); } catch (x) {} }
    location.reload();
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    var hatteController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      // Neue Fassung ist da - beim naechsten Laden aktiv; kurz sagen, statt dass sich Dinge still aendern
      if (hatteController) toast("Neue Fassung geladen, einmal neu öffnen, dann ist alles frisch.", "gut");
      hatteController = true;
    });
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
