/* Logik der Startseite. Frueher inline in index.html; eigene Datei, damit
 * die Content-Security-Policy keine Inline-Skripte erlauben muss. */
(function () {
  "use strict";

  var basis = location.href.split("#")[0].split("?")[0].replace(/index\.html$/, "").replace(/\/?$/, "/");

  // Wird einmal je Fassung gezeigt, damit die Kollegen neue Funktionen finden.
  var NEUIGKEITEN = { version: "2026-09-19", punkte: [
    "Neues Logo und Design in Schwarz-Weiß-Rot, Schalter statt Häkchen, Wischen auf Spielkarten",
    "Abrechnung: private Aufstellung fürs Finanzamt – Steuerjahre, Jahresblatt, Verpflegung, km hin und zurück, eigene Spiele",
    "Archiv aller Saisons mit Filtern, Änderungen mit Vorher/Nachher, Zusammen fahren mit „auf dem Weg“",
    "Start: Schnellzugriff, „Alles eingerichtet?“, Termin-Karte; Einstellungen mit Konto und Bereichen",
    "Anleitung unter Mehr → Anleitung, Offline-Abrechnung mit Nachreichen"
  ] };
  var daten = null, aktuell = null, profil = null;
  var el = function (id) { return document.getElementById(id); };
  var wochentag = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  // ------------------------------------------------------------- Speicher

  function lesen(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function schreiben(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }

  // ------------------------------------------------ Funktionen (Schalter)
  // Der Betreiber schaltet unter Admin -> Funktionen an und ab; die Tabelle
  // "funktionen" darf jeder lesen. Fehlt eine Zeile, gilt der Standard hier.
  var FUNKTIONEN = [
    ["tausch", "Tauschbörse", "Gesuche, Angebote, Vertretungs-Radar, Reiter „Tausch“ unten", false],
    ["frei", "Verfügbarkeit", "Sperrtage, „gern pfeifen“, Mini-Kalender", false],
    ["abrechnung", "Abrechnung", "km, Vergütung, Belege, Fahrtenbuch, Reiter unten", true],
    ["info", "Info und Termine", "Ankündigungen vom Betreiber, Termine auf Start", true],
    ["notizen", "Notizen", "private Spielnotizen", true],
    ["gespann", "Gespann", "Gespann-Notizen, Handynummern, Fahrgemeinschaft", true],
    ["hallen", "Hallen-Hinweise und Hallenkarte", "Parken, Kabinen, Karte aller Hallen", true],
    ["statistik", "Statistik", "Saison, Archiv, Saisonziel, Saison-Bild", true],
    ["checkliste", "Spieltag-Checkliste", "auf der Spielseite", true],
    ["wetter", "Wetter", "auf Start und der Spielseite", true],
    ["push", "Push-Mitteilungen", "Geräte anmelden, Erinnerungen, Testnachricht", true]
  ];
  var funktionenStand = null;
  function funktionenLesen() {
    if (funktionenStand) return funktionenStand;
    try { funktionenStand = JSON.parse(lesen("funktionen") || "{}") || {}; } catch (e) { funktionenStand = {}; }
    return funktionenStand;
  }
  function funktionGlobal(k) {
    var f = funktionenLesen(); if (f[k] !== undefined) return !!f[k];
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
    var vorher = JSON.stringify(funktionenLesen());
    funktionenStand = obj || {}; schreiben("funktionen", JSON.stringify(funktionenStand));
    FUNKTIONEN.forEach(function (f) { document.documentElement.classList.toggle("ohne-" + f[0], !funktion(f[0])); });
    if (el("tab-tausch")) tabDritterAnwenden();
    if (neuZeichnen && vorher !== JSON.stringify(funktionenStand) && typeof ausHash === "function" && daten) ausHash();
  }
  function funktionenLaden() {
    funktionenAnwenden(funktionenLesen());
    return hole("supabase.json").then(function (cfg) {
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
    s.vergangen = new Date(s.beginn) < Date.now();
  }
  function korrekturenAnwenden() {
    if (!daten) return;
    (daten.spiele || []).forEach(korrekturAnwendenAuf);
    (daten.personen || []).forEach(function (p) { p.spiele.forEach(korrekturAnwendenAuf); p.spiele.sort(function (a, b) { return a.beginn < b.beginn ? -1 : a.beginn > b.beginn ? 1 : 0; }); });
    (daten.spiele || []).sort(function (a, b) { return a.beginn < b.beginn ? -1 : a.beginn > b.beginn ? 1 : 0; });
  }
  function korrekturenLaden(neuZeichnen) {
    return hole("supabase.json").then(function (cfg) {
      cfg = cfg || {};
      if (cfg.mock) { try { return JSON.parse(localStorage.getItem("mock_spiel_korrekturen") || "[]"); } catch (e) { return []; } }
      if (!cfg.url || !cfg.anon_key) return null;
      return fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/spiel_korrekturen?select=kennung,halle,beginn,treffpunkt,hinweis,abgesagt,von,geaendert", { headers: { apikey: cfg.anon_key, Authorization: "Bearer " + cfg.anon_key } })
        .then(function (r) { return r.ok ? r.json() : null; });
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
    return hole("supabase.json").then(function (cfg) {
      cfg = cfg || {};
      if (cfg.mock) { try { return JSON.parse(localStorage.getItem("mock_" + pfad.split("?")[0]) || "[]"); } catch (e) { return []; } }
      if (!cfg.url || !cfg.anon_key) return null;
      return fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/" + pfad, { headers: { apikey: cfg.anon_key, Authorization: "Bearer " + cfg.anon_key } })
        .then(function (r) { return r.ok ? r.json() : null; });
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
      var basis = { id: id, manuell: true, beginn: beginn, treffpunkt: treff, liga: z.liga || "", paarung: z.paarung, halle: halle, ort: halle && daten.adressen[halle] ? halle + ", " + daten.adressen[halle] : (halle || ""), halle_erkannt: !!(halle && daten.adressen[halle]), system: bes.length, vergangen: new Date(beginn) < Date.now(), korrektur: z.hinweis ? { hinweis: z.hinweis, abgesagt: false, halle: null, beginn: null, treffpunkt: null } : null };
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
  function korrekturZeile(s) {
    var k = s.korrektur; if (!k) return null;
    var z = document.createElement("div"); z.className = k.abgesagt ? "achtung" : "geaendert";
    var teile = [];
    if (k.abgesagt) teile.push("ABGESAGT");
    if (k.halle) teile.push("Halle: " + k.halle);
    if (k.beginn) teile.push("Anstoß " + uhr(new Date(s.beginn)) + " Uhr");
    if (k.treffpunkt) teile.push("Treffpunkt " + uhr(new Date(s.treffpunkt)) + " Uhr");
    if (k.hinweis) teile.push(k.hinweis);
    z.textContent = (s.manuell ? "✎ Vom Betreiber angelegt" : "✎ Vom Betreiber korrigiert") + (teile.length ? ": " + teile.join(" · ") : "");
    return z;
  }
  function profilLesen() {
    try { var roh = lesen("profil"); if (roh) return JSON.parse(roh); } catch (e) {}
    var alt = lesen("person");
    return alt ? { slug: alt, gesehen: {} } : null;
  }
  function profilSchreiben() { if (profil) schreiben("profil", JSON.stringify(profil)); }

  // ----------------------------------------------------------------- Thema

  function themaAnwenden() {
    var t = lesen("thema");
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    var dunkel = t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches);
    el("thema").querySelector("use").setAttribute("href", dunkel ? "#i-sun" : "#i-moon");
  }
  el("thema2").addEventListener("click", function () { el("thema").click(); });
  function avatarKopf() {
    var b = el("avatar");
    if (profil && profil.name) { b.textContent = initialen(profil.name); b.classList.remove("leer"); b.style.background = farbeFuer(profil.slug); }
    else { b.textContent = "?"; b.classList.add("leer"); b.style.background = ""; }
  }
  // Tipp auf die Stand-Anzeige holt frische Daten
  el("stand").addEventListener("click", function () {
    if (!navigator.onLine) { toast("Offline – es gibt gerade nichts Neues zu holen.", "warn"); return; }
    el("stand").classList.add("laedt");
    neuLaden().then(function () { el("stand").classList.remove("laedt"); toast("Aktualisiert.", "gut"); })
      .catch(function () { el("stand").classList.remove("laedt"); toast("Aktualisieren hat nicht geklappt.", "warn"); });
  });
  el("suche-knopf").addEventListener("click", function () {
    location.hash = "suche";
    setTimeout(function () { var f = el("suche"); f.focus(); f.select(); window.scrollTo({ top: 0 }); }, 150);
  });
  el("avatar").addEventListener("click", function () { location.hash = profil && profil.slug ? "mehr" : ""; if (!(profil && profil.slug)) zeigeAuswahl(false); });
  // Admin-Modus: nur fuer Admins sichtbar, schaltet die Betreiber-Funktionen
  // in der Oberflaeche an und aus (Rechte bleiben davon unberuehrt)
  function adminModusAn() { return lesen("adminaus") !== "1"; }
  function adminKnopfStand() {
    var k = el("adminmodus"); if (!k) return;
    var an = adminModusAn();
    k.classList.toggle("aktiv", an);
    k.title = an ? "Admin-Modus an – antippen zum Ausschalten" : "Admin-Modus aus – antippen zum Einschalten";
    k.setAttribute("aria-pressed", an ? "true" : "false");
    document.documentElement.classList.toggle("admin-aus", !an);
  }
  function adminKnopfZeigen() {
    if (!sitzungVorhanden()) { el("adminmodus").classList.add("versteckt"); return; }
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { return st.eingerichtet && st.session && window.Mitglieder.adminRecht ? window.Mitglieder.adminRecht() : false; })
      .then(function (ja) { el("adminmodus").classList.toggle("versteckt", !ja); adminKnopfStand(); }).catch(function () {});
  }
  el("adminmodus").addEventListener("click", function () {
    var neu = !adminModusAn();
    schreiben("adminaus", neu ? null : "1");
    adminKnopfStand();
    toast(neu ? "Admin-Modus an – Betreiber-Funktionen sichtbar." : "Admin-Modus aus – App wie für alle anderen.", "gut");
    zaehlerHolen(); ausHash();
  });
  document.addEventListener("mg-sitzung", function () { adminKnopfZeigen(); tabDritterAnwenden(); ausHash(); });
  // Tipp auf den Reiter, auf dem man schon steht: nach oben scrollen
  Array.prototype.forEach.call(document.querySelectorAll(".leiste button"), function (b) {
    b.addEventListener("click", function () { if (b.classList.contains("aktiv")) window.scrollTo({ top: 0, behavior: "smooth" }); });
  });
  el("thema").addEventListener("click", function () {
    var t = lesen("thema");
    var dunkel = t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches);
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
  function feedUrl(slug, protokoll) { return protokoll + "//" + basis.replace(/^https?:\/\//, "") + "feeds/" + slug + ".ics"; }
  function personMit(slug) { return daten.personen.filter(function (p) { return p.slug === slug; })[0]; }
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
  var feedGeprueft = {};
  function feedPruefen(p, erzwingen) {
    var ziel = el("feed-pruefung");
    if (feedGeprueft[p.slug] && !erzwingen) { ziel.textContent = feedGeprueft[p.slug]; feedKnopf(p); return; }
    ziel.textContent = "Prüfe den Kalender-Link …";
    // Ohne Cache-Buster: genau die Adresse, die auch das Handy abruft
    fetch(feedUrl(p.slug, location.protocol), { cache: erzwingen ? "reload" : "default" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (t) {
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
    }).catch(function () { ziel.textContent = "Kalender-Link gerade nicht erreichbar – ohne Netz normal, sonst bitte später noch einmal."; feedKnopf(p); });
  }
  function feedKnopf(p) {
    var ziel = el("feed-pruefung");
    if (ziel.querySelector("button")) return;
    var b = document.createElement("button"); b.type = "button"; b.className = "textknopf"; b.style.marginLeft = "6px"; b.textContent = "Neu prüfen";
    b.addEventListener("click", function () { delete feedGeprueft[p.slug]; feedPruefen(p, true); });
    ziel.appendChild(b);
  }
  function einstellungenLaden(nurAnwenden) {
    el("karten-app").value = lesen("karten") || "auto";
    if (!nurAnwenden) el("karten-app").addEventListener("change", function (e) { schreiben("karten", e.target.value === "auto" ? null : e.target.value); if (aktuell && !el("detail").classList.contains("versteckt")) zeigePerson(aktuell, true); toast("Karten-App: " + e.target.options[e.target.selectedIndex].text, ""); einstellungenSync(); });
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
      s.className = "stand alt"; s.textContent = "Offline – gespeicherter Stand" + (letzterStand ? " von " + letzterStand : "");
      var q = 0; try { q = Object.keys(JSON.parse(localStorage.getItem("mg_queue") || "{}")).length; } catch (e) {}
      el("offline-text").textContent = "Offline – Stand von " + (letzterStand || "?") + ". Geht: Spielplan, Spielseiten, Kalender, Abrechnung (gespeicherter Stand). Braucht Netz: Push, Wetter, Tausch, Karte." + (q ? " " + q + (q === 1 ? " Änderung wartet" : " Änderungen warten") + " aufs Nachreichen." : "");
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
    var b = document.createElement("button"); b.type = "button"; b.className = "textknopf kopier"; b.textContent = "kopieren";
    b.title = (was || "Adresse") + " kopieren";
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
    var rechtsAktion = meins && s.vergangen && funktion("abrechnung") ? { text: "Abrechnen", icon: "i-euro", tu: function () { location.hash = "abrechnen/" + encodeURIComponent(kennungVon(s)); } }
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
    return datumKurz(d) + " " + uhr(d) + " Uhr – " + (s.liga ? s.liga + ": " : "") + s.paarung +
      "\nTreffpunkt " + uhr(new Date(s.treffpunkt)) + " Uhr" + (s.halle ? ", " + s.halle : "") +
      (s.ort ? "\n" + s.ort + "\nRoute: " + kartenLink(s.ort) : "");
  }
  function teilenKnopf(s) {
    var b = document.createElement("button"); b.type = "button"; b.className = "textknopf teilen-knopf"; b.textContent = "Teilen";
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
    var t = name.split(",");
    var nach = (t[0] || "").trim(), vor = (t[1] || "").trim();
    return ((vor[0] || "") + (nach[0] || "")).toUpperCase() || "?";
  }
  function farbeFuer(text) {
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
      var hallen = Object.keys(daten.hallen || {}).concat(Object.keys(daten.adressen || {})).filter(function (n, i, a) { return a.indexOf(n) === i; })
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
      suchGruppe(liste, "Kollegen");
    }
    var personenTreffer = 0;
    daten.personen.forEach(function (p) {
      var suchtext = suchtextVon(p.name + " " + (p.varianten || []).join(" "));
      if (f && suchtext.indexOf(f) === -1) {
        if (!suchtext.split(" ").some(function (t) { return t.indexOf(f) === 0; })) return;
      }
      treffer++; personenTreffer++;
      if (suchModus && f.length >= 2 && personenTreffer > 8) return;
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      var name = document.createElement("span");
      name.textContent = p.name;
      var n = p.spiele.filter(function (s) { return !s.vergangen; }).length;
      var anzahl = document.createElement("span");
      anzahl.className = "anzahl";
      anzahl.textContent = n === 0 ? "–" : n + (n === 1 ? " Spiel" : " Spiele");
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
      text.textContent = "Beim Öffnen der App bekommst du eine Mitteilung, wenn eine Einteilung dazugekommen ist oder sich geändert hat. Echtes Push auch bei geschlossener App: Mehr → Konto → Push.";
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
    var zeile = datumKurz(d) + ", " + uhr(d) + " Uhr – " + e.paarung;
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
    if (!s.ort) { var w = document.createElement("div"); w.className = "achtung"; w.textContent = "Halle nicht automatisch erkannt – bitte selbst prüfen."; d.appendChild(w); }

    if (s.gespann && s.gespann.length) {
      var g = document.createElement("div"); g.className = "chips" + (fuer ? "" : " klein");
      s.gespann.forEach(function (k) { var c = chip(k, s.system >= 3); if (!fuer) { var tn = Array.prototype.filter.call(c.childNodes, function (n) { return n.nodeType === 3; })[0]; if (tn) tn.textContent = (k.name || "").split(",")[0]; } g.appendChild(c); });
      d.appendChild(g);
    }
    if (s.hinweis) { var hw = document.createElement("div"); hw.className = "achtung"; hw.textContent = "⚠ " + s.hinweis; d.appendChild(hw); }
    if (s.aenderung) { var ae = document.createElement("div"); ae.className = "geaendert"; ae.textContent = "⚠ Geändert: " + s.aenderung; d.appendChild(ae); }
    var kz = korrekturZeile(s); if (kz) d.appendChild(kz);
    else if (s.manuell) { var mz = document.createElement("div"); mz.className = "geaendert"; mz.textContent = "✎ Vom Betreiber angelegt"; d.appendChild(mz); }
    if (s.korrektur && s.korrektur.abgesagt) d.classList.add("abgesagt");
    var mehr = document.createElement("div"); mehr.className = "meta"; mehr.style.marginTop = "6px"; mehr.style.color = "var(--akzent)"; mehr.textContent = "Details, Route, Tausch ›";
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
      if (schnee > 0) { text += " – Schnee, mehr Zeit einplanen"; warnt = true; }
      else if (temp <= 2 && regen > 0) { text += " – Glättegefahr"; warnt = true; }
      else if ([56, 57, 66, 67].indexOf(code) >= 0) { text += " – gefrierender Regen"; warnt = true; }
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
    el("spiel-titel").textContent = (s.liga ? s.liga + ": " : "") + s.paarung;
    el("spiel-unter").textContent = datumKurz(d) + " · " + uhr(d) + " Uhr" + (meins ? " · du als " + (s.rolle || "SR") : "");

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
    var tb = teilenKnopf(s); tb.className = ""; tb.textContent = "Teilen"; ak.appendChild(tb);
    var kb = document.createElement("button"); kb.type = "button"; kb.appendChild(ikone("i-cal")); kb.appendChild(document.createTextNode("In Kalender"));
    kb.title = "Nur dieses Spiel als Kalenderdatei"; kb.addEventListener("click", function () { einzelIcs(s); }); ak.appendChild(kb);
    h.appendChild(ak);
    var kontaktZeile = document.createElement("div"); kontaktZeile.className = "kontakt-knoepfe versteckt"; h.appendChild(kontaktZeile);
    kopf.appendChild(h);

    var inhalt = el("spiel-inhalt"); inhalt.innerHTML = "";
    var symbole = { "Halle": "i-pin", "Gespann": "i-users", "Besetzung": "i-users", "Tauschoptionen": "i-swap", "Weiteres": "i-list", "Spieltag-Checkliste": "i-check", "Änderungsverlauf": "i-clock" };
    function karteAbschnitt(titel) { var k = document.createElement("div"); k.className = "karte abschnitt-karte"; if (titel) { var hh = document.createElement("h4"); if (symbole[titel]) hh.appendChild(ikone(symbole[titel])); hh.appendChild(document.createTextNode(titel)); k.appendChild(hh); } inhalt.appendChild(k); return k; }

    var ort = karteAbschnitt("Halle");
    var oz = document.createElement("div"); oz.appendChild(hallenLink(s.halle));
    if (s.ort) { oz.appendChild(document.createTextNode(" · ")); var ad = document.createElement("span"); ad.className = "meta"; ad.style.display = "inline"; ad.textContent = s.ort.indexOf(s.halle + ", ") === 0 ? s.ort.slice(s.halle.length + 2) : s.ort; oz.appendChild(ad); oz.appendChild(document.createTextNode(" ")); oz.appendChild(kopierKnopf(s.ort)); }
    ort.appendChild(oz);
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
        .then(function (sk) { if (!sk || !sk.minuten) return; var ab = new Date(treff.getTime() - sk.minuten * 60000);
          var zz = document.createElement("div"); zz.className = "meta"; zz.style.marginTop = "6px"; zz.textContent = "Abfahrt ca. " + uhr(ab) + " Uhr · " + sk.minuten + " Min., " + sk.km + " km ohne Verkehr"; ort.appendChild(zz); }).catch(function () {});
    }
    if (s.hinweis) { var hw = document.createElement("div"); hw.className = "achtung"; hw.textContent = "⚠ " + s.hinweis; ort.appendChild(hw); }
    if (s.aenderung) { var ae = document.createElement("div"); ae.className = "geaendert"; ae.textContent = "⚠ Geändert: " + s.aenderung; ort.appendChild(ae); }
    var kz2 = korrekturZeile(s); if (kz2) ort.appendChild(kz2);
    else if (s.manuell) { var mz2 = document.createElement("div"); mz2.className = "geaendert"; mz2.textContent = "✎ Vom Betreiber angelegt (nicht auf esrw.de)"; ort.appendChild(mz2); }
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
        p.appendChild(document.createTextNode(" für " + [funktion("hallen") ? "Hallen-Hinweise" : "", funktion("gespann") ? "Kontakte und Fahrgemeinschaft" : "", funktion("notizen") ? "Notizen" : ""].filter(Boolean).join(", ") + "."));
        if (!funktion("hallen") && !funktion("gespann") && !funktion("notizen")) { ex.classList.add("versteckt"); return; }
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
      if (funktion("abrechnung")) { var l = document.createElement("a"); l.className = "zeile-link"; l.href = "#abrechnen/" + encodeURIComponent(kennungVon(s)); l.appendChild(ikone("i-euro")); l.appendChild(document.createTextNode("Zur Abrechnung dieses Spiels")); ab.appendChild(l); }
      if (!s.vergangen) {
        var mailZeile = document.createElement("div");
        var mail = document.createElement("a"); mail.className = "zeile-link"; mail.href = "#"; mail.appendChild(ikone("i-bell")); mail.appendChild(document.createTextNode("Obmann anschreiben (Absage / Frage)"));
        mail.addEventListener("click", function (ev) {
          ev.preventDefault();
          ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.obmann() : null; })
            .then(function (an) {
              var text = "Hallo,\n\nes geht um mein Spiel:\n" + spielText(s) + "\n\n[Grund / Frage hier eintragen]\n\nViele Grüße\n" + (profil.name ? profil.name.split(",").reverse().join(" ").trim() : "");
              location.href = "mailto:" + encodeURIComponent(an || "") + "?subject=" + encodeURIComponent("Spiel " + datumKurz(d) + " " + s.paarung) + "&body=" + encodeURIComponent(text);
              if (!an) toast("Obmann-Adresse fehlt – unter Konto → Einstellungen eintragen, dann steht sie gleich drin.", "");
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
    // Admin: Spiel korrigieren
    var lauf = inhalt._lauf = {};
    if (sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.istAdmin() : false; })
      .then(function (istAdmin) { if (istAdmin && inhalt._lauf === lauf) korrekturFormular(s, karteAbschnitt("Korrigieren (Admin)")); }).catch(function () {});
    setTimeout(function () {
      var karten = Array.prototype.slice.call(inhalt.querySelectorAll(":scope > .karte"));
      var punkte = karten.map(function (k) {
        var h4 = k.querySelector("h4"); if (!h4 || k.classList.contains("versteckt")) return null;
        var titel = h4.textContent.replace(/\s*\d+\/\d+$/, "").replace(/\s*\(.*\)$/, "").trim();
        return [k, titel.length > 18 ? titel.slice(0, 17) + "…" : titel];
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
    var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "– wie erkannt (" + ((s._orig && s._orig.halle) || s.halle || "unbekannt") + ") –"; halle.appendChild(o0);
    Object.keys(daten.adressen || {}).sort(function (a, b) { return a.localeCompare(b, "de"); }).forEach(function (n) { var o = document.createElement("option"); o.value = n; o.textContent = n; if (k.halle === n) o.selected = true; halle.appendChild(o); });
    feld("Halle", halle);
    var beginn = document.createElement("input"); beginn.type = "datetime-local"; beginn.value = lokalInput(k.beginn); feld("Anstoß (leer = " + uhr(new Date((s._orig && s._orig.beginn) || s.beginn)) + " Uhr)", beginn);
    var treff = document.createElement("input"); treff.type = "datetime-local"; treff.value = lokalInput(k.treffpunkt); feld("Treffpunkt (leer = " + (daten.vorlauf_minuten || 60) + " Min. vor Anstoß)", treff);
    var hinweis = document.createElement("input"); hinweis.type = "text"; hinweis.maxLength = 200; hinweis.placeholder = "z. B. „Nebenhalle, Eingang hinten“"; hinweis.value = k.hinweis || ""; feld("Hinweis für alle", hinweis);
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
        toast(leer ? "Korrektur entfernt." : "Korrektur gespeichert – alle sehen sie sofort.", "gut");
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

  function chip(person, mitRolle, klasseExtra) {
    var e = document.createElement(person.slug ? "a" : "span");
    e.className = "chip" + (profil && person.slug === profil.slug ? " ich" : "") + (klasseExtra ? " " + klasseExtra : "");
    if (person.slug) e.href = "#" + person.slug;
    var av = document.createElement("i"); av.className = "avatar"; av.textContent = initialen(person.name);
    av.style.background = farbeFuer(person.slug || person.name); e.appendChild(av);
    e.appendChild(document.createTextNode(person.name));
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
    var kommend = p.spiele.filter(function (s) { return !s.vergangen; });
    if (!kommend.length) return;
    var s = kommend[0], d = new Date(s.beginn);
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
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
    var vollbild = heuteModus && startEinstellung("vollbild") && !!(profil && profil.slug === p.slug) && lesen("vollbild-zu") !== heuteSchluessel(s);
    el("detail").classList.toggle("start-vollbild", vollbild);
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
      ge.appendChild(ikone("i-users")); ge.appendChild(document.createTextNode(s.gespann.map(function (x) { return x.name.split(",")[0]; }).join(", ")));
      ak.appendChild(ge);
    }
    h.appendChild(ak);
    if (vollbild) {
      // ganz unten in der Karte, damit der Daumen ihn erreicht
      var mehr = document.createElement("button"); mehr.type = "button"; mehr.className = "vollbild-mehr"; mehr.textContent = "Alles anzeigen ↓";
      mehr.addEventListener("click", function (ev) { ev.stopPropagation(); schreiben("vollbild-zu", heuteSchluessel(s)); el("detail").classList.remove("start-vollbild"); mehr.remove(); });
      h.appendChild(mehr);
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
        else txt = "<b>Spiel läuft</b><small>seit " + uhr(d) + " Uhr – gutes Spiel!</small>";
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
      }).then(function (st) {
        if (!st || !st.minuten || !h.isConnected) return;
        var ab = new Date(new Date(s.treffpunkt).getTime() - st.minuten * 60000);
        if (h._abfahrtSetzen) h._abfahrtSetzen(ab);
        var z = document.createElement("div"); z.className = "abfahrt"; z.appendChild(ikone("i-route"));
        z.appendChild(document.createTextNode("Abfahrt ca. " + uhr(ab) + " Uhr · " + st.minuten + " Min., " + st.km + " km ohne Verkehr"));
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
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { alert("Anfrage kopiert – in WhatsApp o.ä. einfügen."); });
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
          if (!st.eingerichtet) { inhalt.appendChild(leerZustand("Tauschoptionen gibt es im Mitgliederbereich – der ist noch nicht eingerichtet.")); return; }
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
    fuss.textContent = "Vorschläge aus den Einteilungen der letzten 30 Tage und der kommenden Spiele, abzüglich Kollegen, die sich für den Tag abgemeldet haben. Urlaub und Lizenz kennt die Liste nicht – fragen musst du selbst.";
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
    var t = document.createElement("b"); t.textContent = "KW " + kalenderwoche(start) + " · " + start.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " – " + new Date(ende.getTime() - 86400000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
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
        if (!liste.length) { var le = document.createElement("div"); le.className = "leerzeile"; le.textContent = "–"; box.appendChild(le); }
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
  function zeigePlan() {
    filterAktiv();
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
     s.je_saison && s.je_saison.length > 1 ? balken("Spiele je Saison", s.je_saison.slice().reverse()) : null
    ].forEach(function (b) { if (b) ziel.appendChild(b); });
    var hsr = (s.rollen && s.rollen.HSR) || 0, lsr = (s.rollen && s.rollen.LSR) || 0;
    if (hsr + lsr) {
      var q = document.createElement("p"); q.className = "meta"; q.style.marginTop = "10px";
      q.textContent = "Im 3er/4er-System: " + Math.round(hsr / (hsr + lsr) * 100) + " % als HSR (" + hsr + " von " + (hsr + lsr) + ").";
      ziel.appendChild(q);
    }
    var fuss = document.createElement("p"); fuss.className = "meta"; fuss.style.marginTop = "10px";
    fuss.textContent = "Gezählt seit " + (s.erste || "?").split("-").reverse().join(".") + ". Das Archiv wächst mit jedem Lauf – esrw.de selbst zeigt nur wenige Tage.";
    ziel.appendChild(fuss);
    if (s.gesamt) {
      var rk = document.createElement("button"); rk.type = "button"; rk.className = "mg-neben rueckblick-knopf"; rk.style.width = "100%";
      rk.textContent = "Meine Saison als Bild teilen";
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
    kachel(560, 550, hsr + lsr ? Math.round(hsr / (hsr + lsr) * 100) + " %" : "–", "HSR-Anteil im 3er/4er");
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
        toast("Bild erzeugt – lange drücken zum Sichern.", "gut");
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
    el("person-avatar").textContent = initialen(p.name); el("person-avatar").style.background = farbeFuer(p.slug);
    avatarKopf();
    var meins = !!(profil && profil.slug === p.slug);
    el("detail").classList.toggle("start-ruhig", meins && startEinstellung("ruhig"));
    el("profil-hinweis").textContent = meins ? "dein Profil" : "fremdes Profil";
    el("uebernehmen").classList.toggle("versteckt", meins);
    el("uebernehmen").onclick = function () { profilSetzen(p); toast("„Start“ zeigt jetzt " + p.name, "gut"); };
    el("wechseln").classList.toggle("versteckt", !meins);
    var pz = el("detail").querySelector(".spalte-haupt > .profilzeile"), haupt = pz && pz.parentNode;
    if (haupt) { if (meins) haupt.insertBefore(pz, el("start-anpassen")); else haupt.insertBefore(pz, haupt.firstChild); }
    zeigeKollege(p, meins);
    pinKnopf(p); kalenderSpalte();
    el("abo").href = feedUrl(p.slug, "webcal:");
    el("laden").onclick = function () { location.href = feedUrl(p.slug, location.protocol); };
    zeigeHeld(p);
    zeigeSchnellzugriff(p, meins);
    zeigeEinrichtung(p, meins);
    zeigeUebersicht(p);
    zeigeNachtrag(p);
    var ziel = el("spiele"); ziel.innerHTML = "";
    var kommend = p.spiele.filter(function (s) { return !s.vergangen; });
    var gewesen = p.spiele.filter(function (s) { return s.vergangen; }).reverse();
    var h = document.createElement("h3"); h.className = "abschnitt"; h.textContent = "Deine nächsten Spiele";
    var hs = document.createElement("small"); hs.textContent = "Tipp für Route, Tausch, Notiz"; h.appendChild(hs); ziel.appendChild(h);
    var istIch = !!(profil && profil.slug === p.slug);
    if (!kommend.length) ziel.appendChild(leerZustand("Zurzeit keine Einteilung. Der Kalender füllt sich von allein.", { label: "Spielplan ansehen", href: "#plan" }));
    else kommend.forEach(function (s, i) { var k = karte(s, p); k.style.setProperty("--i", Math.min(i, 8)); ziel.appendChild(k); });
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
    ["mitglieder/tausch", "i-swap", "Tausch", "tausch"],
    ["aenderungen", "i-bell", "Änderungen"],
    ["archiv", "i-clock", "Archiv"],
    ["mitfahren", "i-route", "Mitfahren", "gespann"],
    ["mitglieder/info", "i-bell", "Info", "info"],
    ["mitglieder/frei", "i-cal", "Verfügbar", "frei"],
    ["statistik", "i-users", "Statistik", "statistik"],
    ["karte", "i-pin", "Hallen", "hallen"],
    ["mitglieder/notizen", "i-note", "Notizen", "notizen"]
  ];
  function tabDritter() {
    var w = lesen("tab3");
    var gewaehlt = w && TAB_ZIELE.filter(function (t) { return t[0] === w; })[0];
    if (gewaehlt && (!gewaehlt[3] || funktion(gewaehlt[3])) && !gesperrtFuerMich(gewaehlt[0])) return gewaehlt;
    if (!sitzungVorhanden()) return ["plan", "i-list", "Spielplan"];
    return funktion("tausch") ? TAB_ZIELE[0] : TAB_ZIELE[1];
  }
  function tabDritterAnwenden() {
    var b = el("tab-tausch"); if (!b) return;
    // Ohne Konto bleibt der dritte Platz leer - sonst staende dort ein
    // zweites Mal "Spielplan".
    if (!sitzungVorhanden()) { b.classList.add("versteckt"); b._ziel = ""; }
    else {
      b.classList.remove("versteckt");
      var t = tabDritter();
      b._ziel = t[0];
      b.innerHTML = "";
      b.appendChild(ikone(t[1]));
      b.appendChild(document.createTextNode(t[2]));
      b.title = t[2];
    }
    // Vierter Platz: ohne Konto fuehrt er zur Anmeldung, nicht zur Abrechnung
    var ab = el("tab-abrechnung"); if (!ab) return;
    var an = sitzungVorhanden();
    ab._ziel = an ? "mitglieder/abrechnung" : "mitglieder";
    ab.innerHTML = "";
    ab.appendChild(ikone(an ? "i-euro" : "i-lock"));
    ab.appendChild(document.createTextNode(an ? "Abrechnung" : "Anmelden"));
  }
  function tabWahlRendern() {
    var box = el("tab-wahl"); if (!box) return;
    box.innerHTML = "";
    var jetzt = tabDritter();
    TAB_ZIELE.forEach(function (t) {
      if (t[3] && !funktion(t[3])) return;
      if (gesperrtFuerMich(t[0])) return;
      var l = document.createElement("label");
      var s = document.createElement("span"); var b = document.createElement("b"); b.textContent = t[2]; b.style.display = "block"; s.appendChild(b);
      var r = document.createElement("input"); r.type = "radio"; r.name = "tab3"; r.checked = jetzt[0] === t[0];
      r.addEventListener("change", function () {
        schreiben("tab3", t[0]); einstellungenSync(); tabDritterAnwenden(); ansicht(letzteAnsicht);
        toast("„" + t[2] + "“ steht jetzt unten in der Leiste.", "gut");
      });
      l.appendChild(s); l.appendChild(r); box.appendChild(l);
    });
  }

  var SCHNELL_ZIELE = [
    ["#plan", "i-list", "Spielplan"],
    ["#mitglieder/abrechnung", "i-euro", "Abrechnung", "abrechnung"],
    ["#archiv", "i-clock", "Archiv"],
    ["#mitfahren", "i-route", "Mitfahren", "gespann"],
    ["#aenderungen", "i-bell", "Änderungen"],
    ["#mitglieder/tausch", "i-swap", "Tausch", "tausch"],
    ["#statistik", "i-users", "Statistik", "statistik"],
    ["#mitglieder/frei", "i-cal", "Verfügbar", "frei"],
    ["#mitglieder/info", "i-bell", "Info", "info"],
    ["#karte", "i-pin", "Hallenkarte", "hallen"],
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
      return Promise.all([window.Mitglieder.heimat(), window.Mitglieder.obmann(), window.Mitglieder.wohnortEigen ? window.Mitglieder.wohnortEigen() : null, window.Mitglieder.zaehler()]);
    }).then(function (r) {
      if (!r || box._lauf !== lauf) return;
      if (funktion("abrechnung")) punkte.push({ ok: !!r[0], titel: "Heimatadresse", text: "für Strecken, Abfahrtszeit, km in der Abrechnung", href: "#einstellungen" });
      if (funktion("gespann")) punkte.push({ ok: !!r[2], titel: "Wohnort teilen (freiwillig)", text: "damit „Zusammen fahren“ vorschlagen kann", href: "#einstellungen" });
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
    if (z === "plan" || z === "mehr" || z === "") return true;
    if (z === "mitglieder/abrechnung" && funktion("abrechnung")) return true;
    return z === (el("tab-tausch") && el("tab-tausch")._ziel);
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
    eintraege.forEach(function (e) { var a = document.createElement("a"); a.href = e[0]; if (zuletzt.indexOf(e[0]) >= 0 && zuletzt.indexOf(e[0]) < 3) a.classList.add("zuletzt"); a.appendChild(ikone(e[1])); a.appendChild(document.createTextNode(e[2])); box.appendChild(a); });
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
        var sm = document.createElement("small"); sm.textContent = "Admin-Funktionen ein- oder ausblenden – die Rechte bleiben"; h3.appendChild(sm);
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
    kommend.slice(0, 4).forEach(function (s) {
      var d = new Date(s.beginn), a = document.createElement("a"); a.className = "zeile"; a.href = "#spiel/" + encodeURIComponent(kennungVon(s));
      var l = document.createElement("span"); var b = document.createElement("b"); b.textContent = datumKurz(d) + " " + uhr(d) + " · " + (s.liga ? s.liga + " " : "") + s.paarung; l.appendChild(b);
      var sm = document.createElement("small"); sm.textContent = s.halle || ""; l.appendChild(sm); a.appendChild(l);
      var r = document.createElement("span"); r.className = "meta"; r.textContent = "›"; a.appendChild(r); box.appendChild(a);
    });
    var zw = document.createElement("div"); zw.className = "zweit"; box.appendChild(zw);
    var pz = el("detail").querySelector(".spalte-haupt > .profilzeile");
    pz.parentNode.insertBefore(box, pz.nextSibling);
    if (!sitzungVorhanden() || !funktion("gespann")) { var m2 = document.createElement("p"); m2.className = "meta"; m2.style.margin = "8px 0 0"; m2.textContent = sitzungVorhanden() ? "" : "Angemeldet siehst du hier die Handynummer, wenn sie freigegeben ist."; if (m2.textContent) box.appendChild(m2); return; }
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.kontaktVon(p.slug) : null; })
      .then(function (k) {
        if (!box.isConnected) return;
        if (!k) { var m3 = document.createElement("p"); m3.className = "meta"; m3.style.margin = "8px 0 0"; m3.textContent = "Keine Handynummer freigegeben."; box.appendChild(m3); return; }
        var a1 = document.createElement("a"); a1.className = "anfrage"; a1.href = k.tel; a1.textContent = "Anrufen"; zw.appendChild(a1);
        var a2 = document.createElement("a"); a2.className = "anfrage"; a2.href = k.wa; a2.target = "_blank"; a2.rel = "noopener"; a2.textContent = "WhatsApp"; zw.appendChild(a2);
        if (kommend.length) {
          var s = kommend[0], d = new Date(s.beginn);
          var text = "Hallo " + (p.name.split(",")[1] || "").trim() + ", fahren wir am " + datumKurz(d) + " zusammen zum Spiel " + s.paarung + " (" + (s.halle || "") + ", Treffpunkt " + uhr(new Date(s.treffpunkt)) + " Uhr)? Viele Grüße, " + ((profil.name || "").split(",")[1] || profil.name || "").trim();
          var a3 = document.createElement("a"); a3.className = "anfrage"; a3.href = k.wa.split("?")[0] + "?text=" + encodeURIComponent(text); a3.target = "_blank"; a3.rel = "noopener"; a3.textContent = "Mitfahrt anfragen"; zw.appendChild(a3);
        }
        var m4 = document.createElement("p"); m4.className = "meta"; m4.style.margin = "8px 0 0"; m4.textContent = k.telefon + (k.hinweis ? " · " + k.hinweis : ""); box.appendChild(m4);
      }).catch(function () {});
  }

  var letzteAnsicht = "auswahl";
  function ansicht(name) {
    letzteAnsicht = name;
    ["auswahl", "detail", "plan", "mitglieder", "halle", "status", "spiel", "mehr", "einstellungen", "karte", "statseite", "aenderungen", "mitfahren", "archiv", "gesperrt"].forEach(function (id) { el(id).classList.toggle("versteckt", name !== id); });
    if (name !== "plan" && typeof filterBlatt === "function" && !el("plan-filter-blatt").classList.contains("versteckt")) filterBlatt(false);
    var reiter = (location.hash.split("/")[1] || "");
    if (name !== "auswahl" && name !== "detail") { el("onboarding").classList.add("versteckt"); el("onboarding-kurz").classList.add("versteckt"); el("neu").classList.add("versteckt"); }
    else if (name === "detail" && el("neu")._offen) el("neu").classList.remove("versteckt");
    el("tab-meine").classList.toggle("aktiv", name === "auswahl" || name === "detail" || name === "spiel" || name === "statseite");
    el("tab-plan").classList.toggle("aktiv", name === "plan" || name === "halle");
    // Dritter Tab: passt sein Ziel gerade zur Ansicht?
    var drei = (el("tab-tausch")._ziel || "").split("/");
    var dreiAktiv = drei[0] === "mitglieder" ? (name === "mitglieder" && reiter === (drei[1] || "")) : name === (drei[0] === "statistik" ? "statseite" : drei[0]);
    el("tab-tausch").classList.toggle("aktiv", !!dreiAktiv);
    el("tab-abrechnung").classList.toggle("aktiv", name === "mitglieder" && reiter === "abrechnung");
    el("tab-mitglieder").classList.toggle("aktiv", !dreiAktiv && (name === "mehr" || name === "einstellungen" || name === "karte" || name === "status" || (name === "mitglieder" && reiter !== "tausch" && reiter !== "abrechnung")));
    Array.prototype.forEach.call(document.querySelectorAll(".leiste button"), function (b) {
      if (b.classList.contains("aktiv")) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
  }
  var suchModus = false;
  function zeigeAuswahl(wechsel) {
    aktuell = null; ansicht("auswahl"); el("statistik").innerHTML = "";
    suchModus = wechsel === "suche";
    el("frage").textContent = suchModus ? "Suche" : wechsel ? "Profil wechseln" : "Wer bist du?";
    el("frage-unter").textContent = suchModus ? "Kollegen, Hallen, Vereine, Spiele und Termine – tippen springt direkt hin." : wechsel ? "Der gewählte Name wird dein Profil auf diesem Gerät." : "Wähle deinen Namen – danach siehst du deine Spiele, kannst den Kalender abonnieren und Mitteilungen bekommen.";
    el("suche").placeholder = suchModus ? "Name, Halle, Verein, Spiel, Termin …" : "Namen suchen …";
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
  function ladeMitglieder() {
    if (!mitgliederGeladen) {
      mitgliederGeladen = new Promise(function (ok, nein) {
        if (window.Mitglieder) return ok(window.Mitglieder);
        var s = document.createElement("script"); s.src = "mitglieder.js?" + Date.now();
        s.onload = function () { ok(window.Mitglieder); }; s.onerror = function () { nein(new Error("mitglieder.js nicht ladbar")); };
        document.head.appendChild(s);
      });
    }
    return mitgliederGeladen;
  }
  function mitgliederKontext() { return { daten: daten, slug: profil && profil.slug, personMit: personMit, hole: hole, ikone: ikone, funktion: funktion, funktionen: FUNKTIONEN, einstellungenSync: einstellungenSync, lesen: lesen, schreiben: schreiben }; }
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
        var sp2 = document.createElement("span"); sp2.textContent = "Von zu Hause: " + sk.km + " km, ca. " + sk.minuten + " Min. ohne Verkehr."; h.appendChild(sp2); st.appendChild(h);
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
        hwt.innerHTML = "<b>Heimatadresse eintragen</b> – dann siehst du, wer auf deinem Weg zur Halle liegt ›";
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
            if (ok) { toast(art ? "Gespeichert – Kollegen sehen es hier und auf ihrer Spielkarte." : "Zurückgezogen.", "gut"); zeigeMitfahren(); }
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
        var sls = document.createElement("small"); sls.textContent = "Route, Gespann, Checkliste und Notizen"; slt.appendChild(sls);
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
    if (!slug && !alle) { liste.innerHTML = ""; liste.appendChild(leerZustand("Wähle zuerst deinen Namen – dann stehen hier alle deine Spiele.", { label: "Namen wählen", fn: function () { zeigeAuswahl(false); location.hash = ""; } })); return; }
    var lauf = archivStand.lauf = {};
    var karte = {};
    function merge(e) {
      var k = e.kennung; if (!k) return;
      var alt = karte[k] || {};
      karte[k] = { kennung: k, beginn: e.beginn, liga: e.liga || alt.liga || "", paarung: e.paarung || alt.paarung || "", halle: e.halle || alt.halle || "", system: e.system || alt.system || 0,
                   besetzung: (e.besetzung && e.besetzung.length ? e.besetzung : alt.besetzung) || [], saison: e.saison || alt.saison || archivSaisonAus(e.beginn), manuell: e.manuell || alt.manuell || false };
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
    // Admin-Schalter nur fuer Admins zeigen
    if (sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.istAdmin() : false; })
      .then(function (ja) { el("archiv-admin").classList.toggle("versteckt", !ja); }).catch(function () {});
    else el("archiv-admin").classList.add("versteckt");
    Promise.all(laeufe).then(function () {
      if (archivStand.lauf !== lauf) return;
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
    var c2 = document.createElement("button"); c2.type = "button"; c2.textContent = navigator.share ? "Liste teilen" : "Liste kopieren"; c2.addEventListener("click", function () { archivTeilen(treffer, wer); }); ex.appendChild(c2);
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
            titel: (s ? datumKurz(d) + " " + uhr(d) + " · " + (s.liga ? s.liga + ": " : "") + s.paarung : k.kennung.split("|")[1] || k.kennung) + " – " + teile.join(", "),
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
    kopf.appendChild(zeile);
    // Bei "Alle Kollegen": auf eine Person eingrenzen
    if (f.wer === "alle") {
      var namen = {};
      (aendDaten || []).forEach(function (e) { if (e.slug && e.wer) namen[e.slug] = e.wer; });
      var slugs = Object.keys(namen).sort(function (a, b) { return namen[a].localeCompare(namen[b], "de"); });
      if (slugs.length > 1) {
        var wz = document.createElement("div"); wz.className = "filterzeile";
        wz.appendChild(wahl(f.person || "", [["", "Alle Kollegen"]].concat(slugs.map(function (sl) { return [sl, namen[sl]]; })),
          function (v) { f.person = v; }));
        kopf.appendChild(wz);
      }
    }
    var such = document.createElement("div"); such.className = "filterzeile";
    var si = document.createElement("input"); si.type = "search"; si.placeholder = "Name, Halle, Verein, Liga …"; si.value = f.suche; si.className = "aend-suche";
    si.addEventListener("input", function () { f.suche = si.value; aendZahlen(); aendRendern(); });
    such.appendChild(si);
    // Was gerade gefiltert ist, laesst sich weitergeben - fuer die Gruppe oder
    // den Obmann, ohne Screenshot.
    var kn = document.createElement("button"); kn.type = "button"; kn.className = "filterknopf"; kn.style.flex = "none";
    kn.textContent = navigator.share ? "Teilen" : "Kopieren";
    kn.addEventListener("click", aendTeilen);
    such.appendChild(kn);
    kopf.appendChild(such);
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
    var gruppe = null, box = null;
    liste.forEach(function (e) {
      var d = new Date(e.zeit);
      var titel, schluessel;
      if (f.sort === "spieltag") {
        var sd = e.spiel ? new Date(e.spiel) : null;
        schluessel = sd ? sd.toDateString() : "ohne";
        titel = sd ? "Spieltag " + tagKopf(sd) : "Ohne Spieltag";
      } else { schluessel = d.toDateString(); titel = tagKopf(d); }
      if (schluessel !== gruppe) {
        gruppe = schluessel;
        var hh = document.createElement("div"); hh.className = "protokoll-tag"; hh.textContent = titel; ziel.appendChild(hh);
        box = document.createElement("div"); box.className = "karte protokoll"; ziel.appendChild(box);
      }
      box.appendChild(aendZeile(e, d));
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
  var TOUR = {
    start: [
      ["i-home", "Willkommen bei den Einteilungen", "Diese App zeigt dir deine Schiedsrichter-Einteilungen von esrw.de – immer aktuell, mit Halle, Treffpunkt, Route und Gespann. Fünf kurze Schritte, dann bist du startklar."],
      ["i-users", "1 · Deinen Namen wählen", "Tippe unten in der Liste auf deinen Namen. Das ist dein Profil auf diesem Gerät – „Start“ zeigt dann deine Spiele.\nKollegen ansehen geht jederzeit über die Lupe oben."],
      ["i-cal", "2 · Kalender abonnieren", "Auf „Start“ findest du die Kalender-Karte: „Im Kalender abonnieren“ legt ein Abo im iPhone-Kalender an. Neue oder geänderte Spiele kommen von allein aufs Handy, mit Wecker zum Treffpunkt.", "#", "Zur Startseite"],
      ["i-bell", "3 · Als App und Push", "Safari: Teilen → „Zum Home-Bildschirm“. Danach unter Einstellungen „Push einschalten“: dann meldet sich die App bei neuen und geänderten Einteilungen, am Spieltag und zur Abfahrt.", "#einstellungen", "Zu den Einstellungen"],
      ["i-key", "4 · Konto (freiwillig)", "Mit Konto gibt es Abrechnung (km und Vergütung automatisch), Notizen, Checkliste, Ankündigungen und Push auf allen Geräten. Der Betreiber schaltet dich frei.", "#mitglieder", "Konto anlegen"],
      ["i-mehr", "5 · Wo ist was", "Start: nächstes Spiel und deine Spiele · Spielplan: alle Spiele, Filter, Woche/Monat · Abrechnung · Mehr: Info, Statistik, Notizen, Einstellungen.\nDiese Anleitung findest du jederzeit unter Mehr → Anleitung."]
    ],
    konto: [
      ["i-check", "Konto angelegt ✓", "Abrechnung, Notizen, Checkliste und Push gehen sofort. Tauschbörse, Verfügbarkeit, Hallen-Hinweise und Kontakte schaltet der Betreiber nach der Freischaltung frei – du bekommst das hier zu sehen."],
      ["i-bell", "Push einschalten", "Unter Einstellungen → Push: Änderungen an deinen Spielen, Spieltag-Erinnerung mit Wetter, Abfahrt, Termine, Wochenvorschau. Die App muss dafür auf dem Home-Bildschirm liegen.", "#einstellungen", "Push einschalten"],
      ["i-euro", "Abrechnung", "Vergangene Spiele bekommen km und Vergütung von selbst. Am Jahresende gibt es unter „Steuerjahre“ das Jahresblatt und die CSV fürs Finanzamt – gemeldet werden muss nichts. Belege, Fahrtenbuch und Werkzeuge in der Leiste.\nHeimatadresse dafür unter Einstellungen → Profil eintragen.", "#mitglieder/abrechnung", "Zur Abrechnung"],
      ["i-route", "Die Spielseite", "Ein Tipp auf ein Spiel: Route, Teilen, „In Kalender“, Wetter, Abfahrtszeit, Checkliste, Gespann-Notizen (mit Push an die Kollegen), Fahrgemeinschaft und deine private Notiz."],
      ["i-swap", "Tausch und Verfügbarkeit", "Wenn freigeschaltet: Gesuche einstellen, Kollegen finden, die frei sind, Angebote annehmen. Unter Verfügbarkeit trägst du Sperrtage ein – der Radar auf Start zeigt passende offene Spiele."],
      ["i-sun", "Alles anpassbar", "Einstellungen → Startseite: welche Bausteine auf „Start“ stehen. Bereiche, die du nicht brauchst, blendest du aus. Schrift, Farbe, Karten-App – alles wandert mit dem Konto auf jedes Gerät.", "#einstellungen", "Einstellungen öffnen"],
      ["i-bell", "Info und Termine", "Ankündigungen vom Betreiber unter Mehr → Info. Termine (Lehrgang, Sitzung) kannst du zu- oder absagen; am Vortag kommt eine Erinnerung.", "#mitglieder/info", "Zu Info"]
    ]
  };
  var tourSchritte = [], tourPos = 0, tourName = "";
  function tourOeffnen(name) {
    tourSchritte = name === "alles" ? TOUR.start.concat(TOUR.konto) : (TOUR[name] || []);
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
    mitfahren: ["Zusammen fahren", "wer wohin fährt – Mitfahrt anbieten oder suchen"],
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

  function zeigeMehr() {
    ansicht("mehr"); aktuell = null;
    var liste = el("mehr-liste"); liste.innerHTML = "";
    var eintraege = [
      ["Für dich"],
      ["#archiv", "i-clock", "Archiv", "Alle deine Spiele, alle Saisons, mit Filtern und Export"],
      funktion("statistik") ? ["#statistik", "i-users", "Statistik", "Saison, Ligen, Hallen, Partner, Saisonziel"] : null,
      ["#aenderungen", "i-list", "Änderungen", "Was sich in 14 Tagen getan hat – mit Vorher/Nachher"],
      funktion("notizen") ? ["#mitglieder/notizen", "i-note", "Notizen", "Private Spielnotizen"] : null,
      ["Gemeinsam"],
      funktion("gespann") ? ["#mitfahren", "i-route", "Zusammen fahren", "Wer fährt wohin – auf dem Weg, bieten, suchen"] : null,
      funktion("info") ? ["#mitglieder/info", "i-bell", "Info", "Ankündigungen und Termine", "info"] : null,
      funktion("frei") ? ["#mitglieder/frei", "i-cal", "Verfügbarkeit", "Wann du nicht kannst oder gern pfeifst"] : null,
      funktion("hallen") ? ["#karte", "i-pin", "Hallenkarte", "Alle Hallen auf der Karte"] : null,
      ["Konto und App"],
      ["#einstellungen", "i-key", "Einstellungen", "Konto, Push, Startseite, Schrift, Farbe"],
      ["#mitglieder/admin", "i-shield", "Admin", "Freischaltung, Ankündigungen", "wartend", true],
      ["#anleitung", "i-mehr", "Anleitung", "Kalender, Push, Konto – Schritt für Schritt"],
      ["#status", "i-check", "Diagnose", "Für die Fehlersuche"]
    ];
    var links = {};
    eintraege = eintraege.filter(Boolean).filter(function (e) { return e.length === 1 || !gesperrtFuerMich(e[0]); });
    eintraege = eintraege.filter(function (e, i, a) { return e.length > 1 || (a[i + 1] && a[i + 1].length > 1); });
    if (!sitzungVorhanden()) eintraege.unshift(["#mitglieder", "i-lock", "Anmelden", "Konto anlegen oder anmelden – für " + [funktion("tausch") ? "Tausch" : "", funktion("abrechnung") ? "Abrechnung" : "", funktion("info") ? "Info" : "", "Notizen"].filter(Boolean).join(", ")]);
    eintraege.forEach(function (e) {
      if (e.length === 1) { var g = document.createElement("div"); g.className = "menue-gruppe"; g.textContent = e[0]; liste.appendChild(g); return; }
      var a = document.createElement("a"); a.href = e[0]; a.appendChild(ikone(e[1]));
      var sp = document.createElement("span"); sp.textContent = e[2]; var sm = document.createElement("small"); sm.textContent = e[3]; sp.appendChild(sm); a.appendChild(sp);
      if (e[4]) { var z = document.createElement("span"); z.className = "zaehler versteckt"; a.appendChild(z); links[e[4]] = z; }
      if (e[5]) a.classList.add("versteckt");
      liste.appendChild(a); if (e[5]) a._nurAdmin = true;
      a._ziel = e[0];
    });
    mehrZahlen(liste);
    if (sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { if (st.eingerichtet && st.session) return window.Mitglieder.zaehler(); })
      .then(function (z) {
        if (!z) return;
        if (z.admin) Array.prototype.forEach.call(liste.querySelectorAll("a"), function (a) { if (a._nurAdmin) a.classList.remove("versteckt"); });
        Object.keys(links).forEach(function (k) { if (z[k]) { links[k].textContent = z[k]; links[k].classList.remove("versteckt"); } });
      }).catch(function () {});
    window.scrollTo(0, 0);
  }
  // Sprungleiste: Chips, die zu den Abschnitten einer langen Seite springen
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

  function zeigeEinstellungen() {
    ansicht("einstellungen"); aktuell = null; window.scrollTo(0, 0);
    bereicheRendern(); startBausteineRendern(); startOrdnungRendern(); schnellWahlRendern(); tabWahlRendern(); pushVerlaufRendern(); adminZeileRendern();
    setTimeout(function () { sprungleiste("einstellungen-sprung", "einstellungen", [["konto-bereich", "Konto"], ["karten-app", "App"], ["start-bausteine", "Startseite"], ["start-ordnung", "Reihenfolge"], ["schnell-wahl", "Schnellzugriff"], ["tab-wahl", "Leiste"], ["bereiche", "Bereiche"], ["adminzeile", "Betreiber"], ["push-verlauf", "Gemeldet"]]); }, 400);
    var kb = el("konto-bereich"); kb.innerHTML = "";
    if (!sitzungVorhanden()) {
      var k = document.createElement("a"); k.href = "#mitglieder"; k.className = "hinweis"; k.style.display = "flex"; k.style.textDecoration = "none"; k.style.color = "inherit"; k.style.marginBottom = "12px";
      k.appendChild(ikone("i-lock")); var t = document.createElement("span"); t.innerHTML = "<b>Konto</b> – anmelden oder anlegen für Abrechnung, Notizen und Push ›"; k.appendChild(t); kb.appendChild(k);
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
      toast("Kalenderdatei erzeugt – öffnen und in den Kalender übernehmen.", "gut");
    });
  }
  function icsEvent(s, sk) {
    var treff = new Date(s.treffpunkt), ende = new Date(new Date(s.beginn).getTime() + (daten.spieldauer_minuten || 150) * 60000);
    var puffer = sk && sk.minuten ? sk.minuten + 10 : null, zeilen = [];
    zeilen.push("BEGIN:VEVENT", "UID:abfahrt-" + icsZeit(treff) + "-" + s.paarung.replace(/[^a-z0-9]/gi, "").slice(0, 30) + "@einteilungen",
      "DTSTAMP:" + icsZeit(new Date()), "DTSTART:" + icsZeit(treff), "DTEND:" + icsZeit(ende),
      "SUMMARY:" + icsText((s.rolle ? s.rolle + " · " : "") + (s.liga ? s.liga + ": " : "") + s.paarung),
      "LOCATION:" + icsText(s.ort || s.halle || ""),
      "DESCRIPTION:" + icsText("Treffpunkt " + uhr(treff) + " Uhr, Spielbeginn " + uhr(new Date(s.beginn)) + " Uhr" + (puffer ? "\nAbfahrt ca. " + uhr(new Date(treff.getTime() - (puffer - 10) * 60000)) + " Uhr (" + sk.km + " km, " + sk.minuten + " Min. ohne Verkehr)" : "")));
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
      toast("Kalenderdatei erzeugt – beim Öffnen in einen eigenen Kalender importieren, sonst stehen die Spiele doppelt drin.", "gut");
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
      fi.style.width = Math.round(n / vorlage.length * 100) + "%"; zaehler.textContent = n + " von " + vorlage.length + (n === vorlage.length ? " – alles gepackt ✓" : "");
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
      schreiben("check-vorlage", liste.length ? JSON.stringify(liste) : null); toast("Vorlage gespeichert – gilt für alle Spiele.", "gut");
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
      var t = document.createElement("div"); t.className = "meta"; t.textContent = rest > 0 ? "Noch " + rest + (rest === 1 ? " Spiel" : " Spiele") + " bis zum Ziel." : "Ziel erreicht – stark!"; box.appendChild(t);
      ziel.appendChild(box);
    } else if (meins) {
      var hint = document.createElement("p"); hint.className = "meta"; hint.style.margin = "0 0 10px";
      var a = document.createElement("a"); a.href = "#einstellungen"; a.textContent = "Saisonziel setzen"; hint.appendChild(a); hint.appendChild(document.createTextNode(" – dann steht hier der Fortschritt."));
      ziel.appendChild(hint);
    }
  }

  function zeigeStatSeite(slug) {
    var p = personMit(slug) || (profil && personMit(profil.slug));
    if (!p) return zeigeAuswahl(false);
    ansicht("statseite"); aktuell = p;
    el("stat-name").textContent = p.name; el("stat-avatar").textContent = initialen(p.name); el("stat-avatar").style.background = farbeFuer(p.slug);
    zeigeStatistik(p); zeigeSaison(p);
    if (!p.statistik) el("statistik").appendChild(leerZustand("Noch keine Statistik – das Archiv füllt sich mit jedem Lauf."));
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
      if (!drin) { if (l.length >= 3) { toast("Höchstens drei Pins – erst einen lösen.", "warn"); return; } l.unshift(p.slug); }
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
    var slug = location.hash.replace(/^#/, "");
    var gesperrt = { "mitglieder/tausch": "tausch", "mitglieder/frei": "frei", "mitglieder/abrechnung": "abrechnung", "mitglieder/info": "info", "mitglieder/notizen": "notizen", "karte": "hallen", "statistik": "statistik" };
    var schl = gesperrt[slug] || (slug.indexOf("statistik/") === 0 ? "statistik" : null);
    if (schl && !funktion(schl)) { toast("Zurzeit abgeschaltet: " + FUNKTIONEN.filter(function (f) { return f[0] === schl; })[0][1] + ".", "warn"); location.hash = slug.indexOf("mitglieder") === 0 ? "mitglieder" : "mehr"; return; }
    if (gesperrtFuerMich(slug)) { zeigeSperre(slug); return; }
    if (slug === "status") { zeigeStatus(); return; }
    if (slug.indexOf("statistik") === 0) { zeigeStatSeite(slug.split("/")[1] || (profil && profil.slug) || ""); return; }
    if (slug === "mehr") { zeigeMehr(); return; }
    if (slug === "einstellungen") { zeigeEinstellungen(); return; }
    if (slug === "mitglieder/konto") { location.hash = "einstellungen"; return; }
    if (slug === "aenderungen") { zeigeAenderungen(); return; }
    if (slug === "archiv" || slug.indexOf("archiv/") === 0) { zeigeArchiv(slug.split("/")[1] || ""); return; }
    if (slug.indexOf("abrechnen/") === 0) { var kz = decodeURIComponent(slug.slice(10)); ladeMitglieder().then(function (M) { M.abrechnungSprung(kz); }).catch(function () {}); location.hash = "mitglieder/abrechnung"; return; }
    if (slug === "mitfahren") { if (!funktion("gespann")) { location.hash = "mehr"; return; } zeigeMitfahren(); return; }
    if (slug === "anleitung") { location.hash = "mehr"; tourOeffnen("alles"); return; }
    if (slug === "suche") { zeigeAuswahl("suche"); return; }
    if (slug === "karte") { zeigeKarte(); return; }
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
    ["schnell", "Schnellzugriff", "eine Reihe Knöpfe unter der Kopfkarte – ohne das, was unten schon in der Leiste steht", false],
    ["vollbild", "Am Spieltag groß", "ist heute ein Spiel, füllt die Kopfkarte den Bildschirm – der Rest kommt auf Tipp", false],
    ["einrichtung", "„Alles eingerichtet?“", "zeigt fehlende Schritte (Kalender, Push, Heimatadresse, Wohnort, Obmann) mit Direktlink", true],
    ["danach", "„Danach“ auf der Karte oben", "das übernächste Spiel in einer Zeile", false],
    ["wetter", "Wetter auf der Karte oben", "zum Treffpunkt, mit Glättehinweis", true, "wetter"],
    ["abfahrt", "Abfahrtszeit auf der Karte oben", "braucht die Heimatadresse im Konto", true],
    ["woche", "Wochenstreifen", "die nächsten sieben Tage mit Punkten", false],
    ["termine", "Nächste Termine", "Ankündigungen mit Datum", true, "info"],
    ["radar", "Vertretungs-Radar", "offene Spiele und Gesuche in der Nähe (Login)", false, "tausch"],
    ["pins", "Angepinnte Kollegen", "Avatare unter dem Profil", true],
    ["kalender", "Kalender-Karte", "Abo, Link, Mitteilungen – zugeklappt, wenn abonniert", true],
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
  function einstellungenSammeln() {
    return { karten: lesen("karten") || null, schrift: lesen("schrift") || null, akzent: lesen("akzent") || null, kompakt: lesen("kompakt") || null, ziel: lesen("ziel") || null, start: lesen("start") || null, bereiche: lesen("bereiche") || null, pushwoche: lesen("pushwoche") || null, pushabrechnung: lesen("pushabrechnung") || null, "schnell-aus": lesen("schnell-aus") || null, "start-ordnung": lesen("start-ordnung") || null, tab3: lesen("tab3") || null };
  }
  var syncTimer = null;
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
    ["karten", "schrift", "akzent", "kompakt", "ziel", "start", "bereiche", "pushwoche", "pushabrechnung", "schnell-aus", "start-ordnung", "tab3"].forEach(function (k) { if ((lesen(k) || null) !== (e[k] || null)) { schreiben(k, e[k] || null); geaendert = true; } });
    if (geaendert) { einstellungenLaden(true); themaAnwenden(); funktionenAnwenden(funktionenLesen()); toast("Einstellungen vom Konto übernommen", ""); if (aktuell && !el("detail").classList.contains("versteckt")) zeigePerson(aktuell, true); }
  }
  document.addEventListener("mg-profil", function (e) {
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
  tabTipp(el("tab-plan"), function () { location.hash = "plan"; });
  el("gesperrt-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = ""; });
  el("aenderungen-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = "mehr"; });
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
      : "Als App auf den Startbildschirm legen – startet schneller, kann Mitteilungen.";
    var knopf = el("install-knopf");
    knopf.classList.toggle("versteckt", !installEreignis);
    knopf.onclick = function () { if (installEreignis) { installEreignis.prompt(); installEreignis = null; box.classList.add("versteckt"); } };
    el("install-weg").onclick = function () { schreiben("install-weg", "1"); box.classList.add("versteckt"); };
  }

  var ladeZaehler = 0;
  function ladeAnzeige(an) {
    ladeZaehler = Math.max(0, ladeZaehler + (an ? 1 : -1));
    var b = el("ladebalken"); if (!b) return;
    b.classList.toggle("laeuft", ladeZaehler > 0);
  }
  window.ladeAnzeige = ladeAnzeige;
  function hole(name) {
    ladeAnzeige(true);
    return fetch(name + "?" + Date.now()).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) { ladeAnzeige(false); return d; }, function (e) { ladeAnzeige(false); throw e; });
  }
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
      if (alter > 6) { s.className = "stand alt"; var w = document.createElement("span"); w.className = "stand-mehr"; w.textContent = " – lange nicht aktualisiert"; s.appendChild(w); }
    } else s.textContent = zahlen;
  }
  function neuLaden() {
    return Promise.all([hole("daten.json"), hole("stand.json").catch(function () { return null; })])
      .then(function (b) {
        daten = b[0]; standAnzeigen(daten, b[1]); betreiberAnwenden(); korrekturenAnwenden(); betreiberLaden(false).then(function () { korrekturenLaden(false); });
        // Nur die gerade sichtbare Ansicht neu zeichnen - nie die Seite wechseln
        var sichtbar = function (id) { return !el(id).classList.contains("versteckt"); };
        if (aktuell && sichtbar("detail")) { var frisch = personMit(aktuell.slug); if (frisch) zeigePerson(frisch, true); }
        else if (aktuell && sichtbar("statseite")) zeigeStatSeite(aktuell.slug);
        else if (sichtbar("plan")) zeigePlan();
      }).catch(function () {});
  }

  Promise.all([hole("daten.json"), hole("stand.json").catch(function () { return null; })])
    .then(function (b) {
      daten = b[0]; profil = profilLesen();
      document.title = daten.titel; el("titel").textContent = (daten.titel || "Einteilungen").replace(/\s*ESRW\s*$/, ""); el("quelle").href = daten.quelle;
      standAnzeigen(daten, b[1]);
      el("fuss").textContent = "Termine beginnen " + daten.vorlauf_minuten + " Minuten vor Spielbeginn, damit du rechtzeitig an der Halle bist.";
      einstellungenLaden(); filterLaden(); avatarKopf(); zeigeListe("");
      // Erst die Funktions-Schalter (Cache sofort, Server kurz danach), dann routen - sonst
      // landet ein Direktlink auf "Tausch" beim ersten Besuch faelschlich auf "abgeschaltet"
      var geroutet = false, routen = function () { if (geroutet) return; geroutet = true; ausHash(); tourWennNeu(); };
      funktionenLaden().then(routen); setTimeout(routen, 1500);
      betreiberLaden(true).then(function () { korrekturenLaden(true); }); zeigeInstallHinweis(); zeigeNeu(); filterHoehe(); netzAnzeigen(); adminKnopfZeigen();
      setTimeout(zaehlerHolen, 1500);
    })
    .catch(function () { el("stand").className = "stand alt"; el("stand").textContent = "Daten konnten nicht geladen werden."; });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    var hatteController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      // Neue Fassung ist da - beim naechsten Laden aktiv; kurz sagen, statt dass sich Dinge still aendern
      if (hatteController) toast("Neue Fassung geladen – einmal neu öffnen, dann ist alles frisch.", "gut");
      hatteController = true;
    });
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
