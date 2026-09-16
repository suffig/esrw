/* Logik der Startseite. Frueher inline in index.html; eigene Datei, damit
 * die Content-Security-Policy keine Inline-Skripte erlauben muss. */
(function () {
  "use strict";

  var basis = location.href.split("#")[0].split("?")[0].replace(/index\.html$/, "").replace(/\/?$/, "/");

  // Wird einmal je Fassung gezeigt, damit die Kollegen neue Funktionen finden.
  var NEUIGKEITEN = { version: "2026-09-17", punkte: [
    "Fünf Reiter unten: Start · Spielplan · Tausch · Abrechnung · Mehr – Einstellungen und Diagnose unter Mehr",
    "Tipp auf ein Spiel öffnet die Spielseite: Route, Wetter, Gespann, Tausch, Hallen-Hinweise, Notiz",
    "Start: Wochenstreifen, Kacheln für Gesuche und Ankündigungen, Abfahrtszeit und Wetter",
    "Hallenkarte, Kalenderdatei mit Abfahrtsalarm, Saisonziel, Schriftgröße und Farbe",
    "Neues Design: Avatar oben, Suche im Kopf, Datumskachel in Ligafarbe"
  ] };
  var daten = null, aktuell = null, profil = null;
  var el = function (id) { return document.getElementById(id); };
  var wochentag = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  // ------------------------------------------------------------- Speicher

  function lesen(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function schreiben(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
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
  el("suche-knopf").addEventListener("click", function () {
    location.hash = "plan";
    setTimeout(function () { var f = el("plan-filter"); f.focus(); f.select(); window.scrollTo({ top: 0 }); }, 150);
  });
  el("avatar").addEventListener("click", function () { location.hash = profil && profil.slug ? "mehr" : ""; if (!(profil && profil.slug)) zeigeAuswahl(false); });
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
  function leerZustand(text) {
    var p = document.createElement("p");
    p.className = "leer";
    p.appendChild(ikone("i-empty"));
    p.appendChild(document.createTextNode(text));
    return p;
  }

  // Kurze Rueckmeldung unten ueber der Leiste. Auch mitglieder.js nutzt sie.
  var toastTimer = null;
  function toast(text, art) {
    var t = el("toast");
    clearTimeout(toastTimer);
    if (!text) { t.classList.remove("zeigt"); return; }
    t.textContent = text; t.className = "toast " + (art || "");
    requestAnimationFrame(function () { t.classList.add("zeigt"); });
    toastTimer = setTimeout(function () { t.classList.remove("zeigt"); }, art === "warn" ? 7000 : 2500);
  }
  window.zeigeToast = toast;

  function onboardingStand() {
    var box = el("onboarding");
    if (lesen("onboarding-weg") === "1") { box.classList.add("versteckt"); return; }
    var s1 = !!(profil && profil.slug), s2 = lesen("abo-geklickt") === "1", s3 = sitzungVorhanden();
    if (s1 && s2 && s3) { box.classList.add("versteckt"); return; }
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
  function feedPruefen(p) {
    var ziel = el("feed-pruefung");
    if (feedGeprueft[p.slug]) { ziel.textContent = feedGeprueft[p.slug]; return; }
    ziel.textContent = "Prüfe den Kalender-Link …";
    fetch(feedUrl(p.slug, location.protocol) + "?" + Date.now()).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (t) {
      var n = (t.match(/BEGIN:VEVENT/g) || []).length, stempel = (t.match(/DTSTAMP:(\d{8}T\d{6}Z)/) || [])[1];
      var wann = stempel ? new Date(stempel.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z")).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "?";
      feedGeprueft[p.slug] = "Kalender-Link geprüft ✓ · " + n + (n === 1 ? " Termin" : " Termine") + " · letzte Änderung " + wann +
        ". Ob dein Handy ihn abruft, zeigt nur das Handy: Einstellungen → Kalender → Accounts → Abo (Aktualisieren: stündlich).";
      ziel.textContent = feedGeprueft[p.slug];
    }).catch(function () { ziel.textContent = "Kalender-Link gerade nicht erreichbar – ohne Netz normal, sonst bitte später noch einmal."; });
  }
  function einstellungenLaden(nurAnwenden) {
    el("karten-app").value = lesen("karten") || "auto";
    if (!nurAnwenden) el("karten-app").addEventListener("change", function (e) { schreiben("karten", e.target.value === "auto" ? null : e.target.value); if (aktuell) zeigePerson(aktuell, true); toast("Karten-App: " + e.target.options[e.target.selectedIndex].text, ""); einstellungenSync(); });
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
      if (!farbe || farbe === "blau") document.documentElement.removeAttribute("data-akzent"); else document.documentElement.setAttribute("data-akzent", farbe);
      Array.prototype.forEach.call(el("akzent").querySelectorAll("button"), function (b) { b.classList.toggle("aktiv", (b.getAttribute("data-akzent") === (farbe || "blau"))); });
    }
    akzentSetzen(lesen("akzent"));
    if (!nurAnwenden) Array.prototype.forEach.call(el("akzent").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () { var f = b.getAttribute("data-akzent"); schreiben("akzent", f === "blau" ? null : f); akzentSetzen(f); einstellungenSync(); });
    });
    el("ziel").value = lesen("ziel") || "";
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
    box.classList.remove("versteckt");
    el("neu-weg").onclick = function () { schreiben("neu-gesehen", NEUIGKEITEN.version); box.classList.add("versteckt"); };
  }

  var letzterStand = null;
  function netzAnzeigen() {
    var s = el("stand");
    el("offline").classList.toggle("versteckt", !!navigator.onLine);
    if (!navigator.onLine) {
      s.className = "stand alt"; s.textContent = "Offline – gespeicherter Stand" + (letzterStand ? " von " + letzterStand : "");
      el("offline-text").textContent = "Offline – Stand von " + (letzterStand || "?") + ". Kalender, Spielplan und Spielseiten gehen; Mitgliederbereich und Wetter brauchen Netz.";
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
  window.addEventListener("error", function (e) { fehlerZeigen((e.message || "unbekannt") + (e.filename ? " (" + e.filename.split("/").pop() + ":" + e.lineno + ")" : "")); });
  window.addEventListener("unhandledrejection", function (e) { var r = e.reason; fehlerZeigen(r && r.message ? r.message : String(r)); });

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

  function zeigeListe(filter) {
    var liste = el("namen"), treffer = 0;
    liste.innerHTML = "";
    var f = ohneZeichen(filter);
    daten.personen.forEach(function (p) {
      var suchtext = suchtextVon(p.name + " " + (p.varianten || []).join(" "));
      if (f && suchtext.indexOf(f) === -1) {
        if (!suchtext.split(" ").some(function (t) { return t.indexOf(f) === 0; })) return;
      }
      treffer++;
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
      b.addEventListener("click", function () { profilSetzen(p); });
      li.appendChild(b);
      liste.appendChild(li);
    });
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
      var g = document.createElement("div"); g.className = "chips";
      s.gespann.forEach(function (k) { g.appendChild(chip(k, s.system >= 3)); });
      d.appendChild(g);
    }
    if (s.hinweis) { var hw = document.createElement("div"); hw.className = "achtung"; hw.textContent = "⚠ " + s.hinweis; d.appendChild(hw); }
    if (s.aenderung) { var ae = document.createElement("div"); ae.className = "geaendert"; ae.textContent = "⚠ Geändert: " + s.aenderung; d.appendChild(ae); }
    var mehr = document.createElement("div"); mehr.className = "meta"; mehr.style.marginTop = "6px"; mehr.style.color = "var(--akzent)"; mehr.textContent = "Details, Route, Tausch ›";
    d.appendChild(mehr);
    karteEl.classList.add("tippbar");
    karteEl.addEventListener("click", function (ev) { if (ev.target.closest("a, button")) return; location.hash = "spiel/" + encodeURIComponent(kennungVon(s)); });
    karteEl._spiel = s;
    return karteEl;
  }

  function kennungVon(s) { return s.beginn + "|" + s.paarung; }

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
    h.appendChild(ak);
    kopf.appendChild(h);

    var inhalt = el("spiel-inhalt"); inhalt.innerHTML = "";
    var symbole = { "Halle": "i-pin", "Gespann": "i-users", "Besetzung": "i-users", "Tauschoptionen": "i-swap", "Weiteres": "i-list" };
    function karteAbschnitt(titel) { var k = document.createElement("div"); k.className = "karte abschnitt-karte"; if (titel) { var hh = document.createElement("h4"); if (symbole[titel]) hh.appendChild(ikone(symbole[titel])); hh.appendChild(document.createTextNode(titel)); k.appendChild(hh); } inhalt.appendChild(k); return k; }

    var ort = karteAbschnitt("Halle");
    var oz = document.createElement("div"); oz.appendChild(hallenLink(s.halle));
    if (s.ort) { oz.appendChild(document.createTextNode(" · ")); var ad = document.createElement("span"); ad.className = "meta"; ad.style.display = "inline"; ad.textContent = s.ort.indexOf(s.halle + ", ") === 0 ? s.ort.slice(s.halle.length + 2) : s.ort; oz.appendChild(ad); oz.appendChild(document.createTextNode(" ")); oz.appendChild(kopierKnopf(s.ort)); }
    ort.appendChild(oz);
    var koord = daten.hallen && daten.hallen[s.halle];
    if (koord && !s.vergangen) ort.appendChild(wetterZeile(koord, treff, "Wetter zum Treffpunkt"));
    if (meins && s.halle) {
      ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.abfahrt(s.halle) : null; })
        .then(function (sk) { if (!sk || !sk.minuten) return; var ab = new Date(treff.getTime() - sk.minuten * 60000);
          var zz = document.createElement("div"); zz.className = "meta"; zz.style.marginTop = "6px"; zz.textContent = "Abfahrt ca. " + uhr(ab) + " Uhr · " + sk.minuten + " Min., " + sk.km + " km ohne Verkehr"; ort.appendChild(zz); }).catch(function () {});
    }
    if (s.hinweis) { var hw = document.createElement("div"); hw.className = "achtung"; hw.textContent = "⚠ " + s.hinweis; ort.appendChild(hw); }
    if (s.aenderung) { var ae = document.createElement("div"); ae.className = "geaendert"; ae.textContent = "⚠ Geändert: " + s.aenderung; ort.appendChild(ae); }

    var wer = karteAbschnitt(meins ? "Gespann" : "Besetzung");
    var chips = document.createElement("div"); chips.className = "chips";
    var liste = meins && s.gespann ? s.gespann : s.besetzung;
    if (liste.length) liste.forEach(function (k) { chips.appendChild(chip(k, s.system >= 3)); });
    else { var o = document.createElement("span"); o.className = "chip offen"; o.textContent = "noch nicht besetzt"; chips.appendChild(o); }
    wer.appendChild(chips);

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
        p.appendChild(document.createTextNode(" für Hallen-Hinweise, Kontakte, Fahrgemeinschaft und Notizen."));
        ex.classList.remove("versteckt"); ex.appendChild(p); return;
      }
      return window.Mitglieder.extrasLaden([s]).then(function (ok) {
        if (!ok) return;
        window.Mitglieder.spielExtras(s, exZiel, meins);
        var det = exZiel.querySelector("details"); if (det) { det.open = true; ex.classList.remove("versteckt"); } else ex.classList.add("versteckt");
      });
    }).catch(function () {});

    if (meins && !s.vergangen) {
      var ta = karteAbschnitt("Tauschoptionen");
      var box = tauschBereich(s, personMit(profil.slug)); ta.appendChild(box); box.open = true;
    }
    if (meins) {
      var ab = karteAbschnitt("Weiteres");
      var l = document.createElement("a"); l.href = "#mitglieder/abrechnung"; l.textContent = "Zur Abrechnung (km, Vergütung, bezahlt)"; ab.appendChild(l);
      if (!s.vergangen) {
        var mailZeile = document.createElement("div"); mailZeile.style.marginTop = "8px";
        var mail = document.createElement("a"); mail.href = "#"; mail.textContent = "Obmann anschreiben (Absage / Frage zu diesem Spiel)";
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
    window.scrollTo(0, 0);
  }

  // -------------------------------------------------------- Dashboard-Kacheln

  function zeigeStartWoche(p) {
    // Ohne kommendes Spiel gibt es keine Karte oben - dann steht der Streifen frei
    var ziel = el("start-woche"); ziel.innerHTML = "";
    if (p.spiele.some(function (s) { return !s.vergangen; })) { ziel.classList.add("versteckt"); return; }
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
    zeigeRadar(p);
    var ziel = el("uebersicht"); ziel.innerHTML = "";
    if (!profil || profil.slug !== p.slug) return;
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    var inSieben = p.spiele.filter(function (s) { var d = new Date(s.beginn); return d >= heute && d < new Date(heute.getTime() + 7 * 86400000); });
    var kachelN = 0;
    function kachel(wert, label, href, markiert) {
      var a = document.createElement(href ? "a" : "div"); if (href) a.href = href;
      var k = document.createElement("div"); k.className = "zahl karte" + (markiert ? " neu-markiert" : ""); k.style.setProperty("--i", kachelN++);
      var b = document.createElement("b"); b.textContent = wert; var sp = document.createElement("span"); sp.textContent = label;
      if (typeof wert === "number" && wert > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) hochzaehlen(b, wert);
      k.appendChild(b); k.appendChild(sp); a.appendChild(k); return a;
    }
    ziel.appendChild(kachel(inSieben.length, "Spiele in 7 Tagen" + (inSieben.length ? ": " + inSieben.map(function (s) { return wochentag[new Date(s.beginn).getDay()]; }).join(", ") : ""), "#plan"));
    if (!sitzungVorhanden()) { ziel.appendChild(kachel("→", "Anmelden für Tausch, Abrechnung, Info", "#mitglieder")); return; }
    var lauf = ziel._lauf = {};
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { if (st.eingerichtet && st.session) return window.Mitglieder.zaehler(); })
      .then(function (z) {
        if (!z || ziel._lauf !== lauf) return;
        ziel.appendChild(kachel(z.gesuche || 0, "offene Gesuche", "#mitglieder/tausch", z.gesuche > 0));
        window.Mitglieder.termine().then(function (t) {
          if (!t || !t.length || ziel._lauf !== lauf) return;
          var box = document.createElement("a"); box.href = "#mitglieder/info"; box.style.gridColumn = "1 / -1";
          var k = document.createElement("div"); k.className = "zahl karte"; k.style.textAlign = "left";
          var b = document.createElement("b"); b.textContent = "Nächste Termine"; k.appendChild(b);
          t.forEach(function (x) { var sp = document.createElement("span"); sp.textContent = x.termin.split("-").reverse().slice(0, 2).join(".") + ". · " + x.titel; sp.style.display = "block"; k.appendChild(sp); });
          box.appendChild(k); ziel.appendChild(box);
        });
        ziel.appendChild(kachel(z.info || 0, "neue Ankündigungen", "#mitglieder/info", z.info > 0));
        if (z.wartend) ziel.appendChild(kachel(z.wartend, "warten auf Freischaltung", "#mitglieder/admin", true));
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
    el("start-woche").classList.add("versteckt");
    if (kommend[1]) {
      var n2 = kommend[1], d2 = new Date(n2.beginn);
      var dn = document.createElement("div"); dn.className = "danach"; dn.appendChild(ikone("i-cal"));
      dn.appendChild(document.createTextNode("Danach: " + datumKurz(d2) + " · " + uhr(d2) + " · " + (n2.liga ? n2.liga + " " : "") + n2.paarung));
      h.appendChild(dn);
    }
    var koord = daten.hallen && daten.hallen[s.halle];
    if (koord) { var wz = wetterZeile(koord, s.treffpunkt, "Wetter"); wz.classList.add("danach"); h.appendChild(wz); }
    h.classList.add("tippbar"); h.title = "Zum Spiel";
    h.addEventListener("click", function (ev) {
      if (ev.target.closest("a, button")) return;
      location.hash = "spiel/" + encodeURIComponent(kennungVon(s));
    });
    var wochenStreifen = document.createElement("div"); wochenStreifen.className = "woche start-woche"; h.appendChild(wochenStreifen);
    startWocheFuellen(wochenStreifen, p);
    ziel.appendChild(h);
    if (profil && profil.slug === p.slug && s.halle) {
      ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) {
        if (!st.eingerichtet || !st.session) return null;
        return window.Mitglieder.abfahrt(s.halle);
      }).then(function (st) {
        if (!st || !st.minuten || !h.isConnected) return;
        var ab = new Date(new Date(s.treffpunkt).getTime() - st.minuten * 60000);
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
    if (!profil || profil.slug !== p.slug) return;
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
  function zeigeLigen(spiele) {
    var ziel = el("plan-ligen"), zaehler = {};
    spiele.forEach(function (s) { var g = ligaGruppe(s.liga); zaehler[g] = (zaehler[g] || 0) + 1; });
    var gruppen = Object.keys(zaehler).sort(function (a, b) {
      var ua = /^U\d+$/.test(a), ub = /^U\d+$/.test(b);
      if (ua && ub) return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);
      if (ua !== ub) return ua ? 1 : -1;
      return a.localeCompare(b);
    });
    ziel.innerHTML = "";
    if (gruppen.length < 2) return;
    gruppen.forEach(function (g) {
      var c = document.createElement("span"); c.className = "chip" + (ligenWahl[g] ? " aktiv" : ""); c.textContent = g;
      c.addEventListener("click", function () { if (ligenWahl[g]) delete ligenWahl[g]; else ligenWahl[g] = 1; zeigePlan(); });
      ziel.appendChild(c);
    });
  }
  function planGefiltert(fuerMonat) {
    var f = ohneZeichen(el("plan-filter").value);
    var mitVergangenen = el("plan-vergangene").checked || fuerMonat;
    var nurOffen = el("plan-offen").checked;
    var hallen = meineHallen();
    var nurMeine = hallen && el("plan-hallen").checked;
    var nurIch = profil && profil.slug && el("plan-meine").checked;
    var ligen = Object.keys(ligenWahl).length ? ligenWahl : null;
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
      var f = JSON.parse(sessionStorage.getItem("plan-filter") || "null"); if (!f) return;
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
    zeigeLigen(daten.spiele || []);
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
    [["Saison " + (daten.saison || ""), s.saison], ["Insgesamt", s.gesamt], ["als HSR", (s.rollen && s.rollen["HSR"]) || 0]].forEach(function (paar) {
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
    var g = x.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, "#0f3d6e"); g.addColorStop(1, "#1d5a99");
    x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
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
    el("saison-titel").textContent = "Alle " + s.gesamt + " Spiele im Archiv";
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
        .then(function (a) { archivDaten = a; rendern((a.personen && a.personen[p.slug]) || []); })
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
    el("profil-hinweis").textContent = meins ? "dein Profil" : "fremdes Profil";
    el("uebernehmen").classList.toggle("versteckt", meins);
    el("uebernehmen").onclick = function () { profilSetzen(p); toast("„Meine Spiele“ zeigt jetzt " + p.name, "gut"); };
    el("abo").href = feedUrl(p.slug, "webcal:");
    el("laden").onclick = function () { location.href = feedUrl(p.slug, location.protocol); };
    zeigeHeld(p);
    zeigeUebersicht(p);
    zeigeNachtrag(p);
    var ziel = el("spiele"); ziel.innerHTML = "";
    var kommend = p.spiele.filter(function (s) { return !s.vergangen; });
    var gewesen = p.spiele.filter(function (s) { return s.vergangen; }).reverse();
    var h = document.createElement("h3"); h.className = "abschnitt"; h.textContent = "Deine nächsten Spiele";
    var hs = document.createElement("small"); hs.textContent = "Tipp für Route, Tausch, Notiz"; h.appendChild(hs); ziel.appendChild(h);
    var istIch = !!(profil && profil.slug === p.slug);
    if (!kommend.length) ziel.appendChild(leerZustand("Zurzeit keine Einteilung. Der Kalender füllt sich von allein."));
    else kommend.forEach(function (s, i) { var k = karte(s, p); k.style.setProperty("--i", Math.min(i, 8)); ziel.appendChild(k); });
    if (gewesen.length) {
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
    zeigeStatistik(p); zeigeSaison(p); zeigeMeldeKarte(); kalenderBoxStand(); onboardingStand();
    el("abfahrt-ics").classList.add("versteckt");
    if (profil && profil.slug === p.slug && sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.heimat() : null; })
      .then(function (hm) { if (hm) el("abfahrt-ics").classList.remove("versteckt"); }).catch(function () {});
    if (profil && profil.slug === p.slug) pruefeNeue(p, false);
    if (!stillesNachladen && sprungZiel === null) window.scrollTo(0, 0);
  }

  function ansicht(name) {
    ["auswahl", "detail", "plan", "mitglieder", "halle", "status", "spiel", "mehr", "einstellungen", "karte"].forEach(function (id) { el(id).classList.toggle("versteckt", name !== id); });
    var reiter = (location.hash.split("/")[1] || "");
    el("tab-meine").classList.toggle("aktiv", name === "auswahl" || name === "detail" || name === "spiel");
    el("tab-plan").classList.toggle("aktiv", name === "plan" || name === "halle");
    el("tab-tausch").classList.toggle("aktiv", name === "mitglieder" && reiter === "tausch");
    el("tab-abrechnung").classList.toggle("aktiv", name === "mitglieder" && reiter === "abrechnung");
    el("tab-mitglieder").classList.toggle("aktiv", name === "mehr" || name === "einstellungen" || name === "karte" || name === "status" || (name === "mitglieder" && reiter !== "tausch" && reiter !== "abrechnung"));
    Array.prototype.forEach.call(document.querySelectorAll(".leiste button"), function (b) {
      if (b.classList.contains("aktiv")) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
  }
  function zeigeAuswahl(wechsel) {
    aktuell = null; ansicht("auswahl"); el("statistik").innerHTML = "";
    el("frage").textContent = wechsel ? "Wen willst du sehen?" : "Wer bist du?";
    el("frage-unter").textContent = wechsel ? "Du kannst jeden Kollegen ansehen – dein eigenes Profil bleibt gemerkt." : "Wähle deinen Namen – danach siehst du deine Spiele, kannst den Kalender abonnieren und Mitteilungen bekommen.";
    onboardingStand();
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
  function mitgliederKontext() { return { daten: daten, slug: profil && profil.slug, personMit: personMit, hole: hole, ikone: ikone }; }
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
      window.Mitglieder.hallenHinweise(name, hw);
    }).catch(function () {});
    window.scrollTo(0, 0);
  }

  function diagnoseText() {
    return Object.keys(diagnose).map(function (k) { return k + ": " + diagnose[k]; }).join("\n");
  }
  var diagnose = {};
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
      ["#mitglieder/info", "i-bell", "Info", "Ankündigungen vom Betreiber", "info"],
      ["#mitglieder/frei", "i-cal", "Verfügbarkeit", "Wann du nicht kannst oder gern pfeifst"],
      ["#mitglieder/notizen", "i-note", "Notizen", "Private Spielnotizen"],
      ["#mitglieder/konto", "i-key", "Konto", "Profil, Push, Passwort, Handynummer"],
      ["#mitglieder/admin", "i-shield", "Admin", "Freischaltung, Ankündigungen", "wartend", true],
      ["#karte", "i-pin", "Hallenkarte", "Alle Hallen auf der Karte"],
      ["#einstellungen", "i-sun", "Einstellungen", "Karten-App, Schrift, Farbe, Saisonziel"],
      ["#status", "i-check", "Diagnose", "Für die Fehlersuche"]
    ];
    var links = {};
    if (!sitzungVorhanden()) eintraege.unshift(["#mitglieder", "i-lock", "Anmelden", "Konto anlegen oder anmelden – für Tausch, Abrechnung, Info"]);
    eintraege.forEach(function (e) {
      var a = document.createElement("a"); a.href = e[0]; a.appendChild(ikone(e[1]));
      var sp = document.createElement("span"); sp.textContent = e[2]; var sm = document.createElement("small"); sm.textContent = e[3]; sp.appendChild(sm); a.appendChild(sp);
      if (e[4]) { var z = document.createElement("span"); z.className = "zaehler versteckt"; a.appendChild(z); links[e[4]] = z; }
      if (e[5]) a.classList.add("versteckt");
      liste.appendChild(a); if (e[5]) a._nurAdmin = true;
    });
    if (sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
      .then(function (st) { if (st.eingerichtet && st.session) return window.Mitglieder.zaehler(); })
      .then(function (z) {
        if (!z) return;
        if (z.admin) Array.prototype.forEach.call(liste.querySelectorAll("a"), function (a) { if (a._nurAdmin) a.classList.remove("versteckt"); });
        Object.keys(links).forEach(function (k) { if (z[k]) { links[k].textContent = z[k]; links[k].classList.remove("versteckt"); } });
      }).catch(function () {});
    window.scrollTo(0, 0);
  }
  function zeigeEinstellungen() { ansicht("einstellungen"); aktuell = null; window.scrollTo(0, 0); }

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
      var akzent = getComputedStyle(document.documentElement).getPropertyValue("--akzent").trim() || "#0f3d6e";
      Object.keys(daten.hallen || {}).forEach(function (name) {
        var k = daten.hallen[name]; if (!k) return;
        var mein = !!meine[name];
        var c = L.circleMarker([k[0], k[1]], { radius: mein ? 10 : 7, color: mein ? akzent : "#6b7280", fillColor: mein ? akzent : "#9ca3af", fillOpacity: .85, weight: 2 }).addTo(m);
        var inhalt = document.createElement("div");
        var b = document.createElement("b"); b.textContent = name; inhalt.appendChild(b);
        var p = document.createElement("div"); p.textContent = (anzahl[name] || 0) + " kommende Spiele" + (mein ? " · " + meine[name] + " eigene" : ""); inhalt.appendChild(p);
        var a = document.createElement("a"); a.href = "#halle/" + hallenSlug(name); a.textContent = "Hallen-Seite ›"; inhalt.appendChild(a);
        c.bindPopup(inhalt);
        punkte.push([k[0], k[1]]);
      });
      function fertig(heim) {
        if (heim) {
          var hm = L.circleMarker([heim.lat, heim.lon], { radius: 8, color: "#fff", fillColor: "#d97706", fillOpacity: 1, weight: 3 }).addTo(m).bindPopup("Zuhause");
          [25, 50].forEach(function (km) { L.circle([heim.lat, heim.lon], { radius: km * 1000, color: "#d97706", weight: 1, fill: false, dashArray: "4 6" }).addTo(m); });
          punkte.push([heim.lat, heim.lon]);
          el("karte-unter").textContent = "Ringe: 25 und 50 km von zu Hause";
        }
        // Nah ranzoomen: mit Heimat nur Hallen im Umkreis von 120 km, sonst alle
        var nah = heim ? punkte.filter(function (pt) { return kmZwischen(pt, [heim.lat, heim.lon]) <= 120; }) : punkte;
        if (nah.length < 2) nah = punkte;
        if (nah.length) m.fitBounds(nah, { padding: [24, 24], maxZoom: 11 }); else m.setView([51.4, 7.3], 8);
        setTimeout(function () { m.invalidateSize(); }, 200);
      }
      if (sitzungVorhanden()) ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); })
        .then(function (st) { return st.eingerichtet && st.session ? window.Mitglieder.heimat() : null; }).then(fertig).catch(function () { fertig(null); });
      else fertig(null);
    }).catch(function (e) { div.textContent = "Karte konnte nicht geladen werden: " + e.message; });
  }

  // ------------------------------------------- Kalenderdatei mit Abfahrtsalarm

  function icsText(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
  function icsZeit(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function abfahrtIcs(p) {
    var kommend = p.spiele.filter(function (s) { return !s.vergangen; });
    if (!kommend.length) { toast("Keine kommenden Spiele.", ""); return; }
    var knopf = el("abfahrt-ics"); knopf.disabled = true; knopf.textContent = "berechne Strecken …";
    var M = window.Mitglieder, zeilen = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Einteilungen//Abfahrt//DE", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Einteilungen mit Abfahrt"];
    var kette = Promise.resolve();
    kommend.forEach(function (s) {
      kette = kette.then(function () { return s.halle ? M.abfahrt(s.halle) : null; }).then(function (sk) {
        var treff = new Date(s.treffpunkt), ende = new Date(new Date(s.beginn).getTime() + (daten.spieldauer_minuten || 150) * 60000);
        var puffer = sk && sk.minuten ? sk.minuten + 10 : null;
        zeilen.push("BEGIN:VEVENT", "UID:abfahrt-" + icsZeit(treff) + "-" + s.paarung.replace(/[^a-z0-9]/gi, "").slice(0, 30) + "@einteilungen",
          "DTSTAMP:" + icsZeit(new Date()), "DTSTART:" + icsZeit(treff), "DTEND:" + icsZeit(ende),
          "SUMMARY:" + icsText((s.rolle ? s.rolle + " · " : "") + (s.liga ? s.liga + ": " : "") + s.paarung),
          "LOCATION:" + icsText(s.ort || s.halle || ""),
          "DESCRIPTION:" + icsText("Treffpunkt " + uhr(treff) + " Uhr, Spielbeginn " + uhr(new Date(s.beginn)) + " Uhr" + (puffer ? "\nAbfahrt ca. " + uhr(new Date(treff.getTime() - (puffer - 10) * 60000)) + " Uhr (" + sk.km + " km, " + sk.minuten + " Min. ohne Verkehr)" : "")));
        if (puffer) zeilen.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText("Losfahren: " + s.paarung + " (" + sk.km + " km)"), "TRIGGER:-PT" + puffer + "M", "END:VALARM");
        zeilen.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:In einer Stunde an der Halle", "TRIGGER:-PT1H", "END:VALARM", "END:VEVENT");
      });
    });
    kette.then(function () {
      zeilen.push("END:VCALENDAR");
      var blob = new Blob([zeilen.join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "einteilungen-abfahrt.ics";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
      knopf.disabled = false; knopf.textContent = "Kalenderdatei mit Abfahrtsalarm laden";
      toast("Kalenderdatei erzeugt – beim Öffnen in einen eigenen Kalender importieren, sonst stehen die Spiele doppelt drin.", "gut");
    }).catch(function (e) { knopf.disabled = false; knopf.textContent = "Kalenderdatei mit Abfahrtsalarm laden"; toast("Nicht möglich: " + (e.message || e), "warn"); });
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

  function ausHash() {
    var slug = location.hash.replace(/^#/, "");
    if (slug === "status") { zeigeStatus(); return; }
    if (slug === "mehr") { zeigeMehr(); return; }
    if (slug === "einstellungen") { zeigeEinstellungen(); return; }
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
  el("suche").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var erster = el("namen").querySelector("li button");
    if (erster) { e.preventDefault(); erster.click(); }
  });

  // Nach dem Login im Mitgliederbereich: "Meine Spiele" auf den dort
  // gewaehlten Namen stellen, damit niemand zweimal gefragt wird.
  function einstellungenSammeln() {
    return { karten: lesen("karten") || null, schrift: lesen("schrift") || null, akzent: lesen("akzent") || null, kompakt: lesen("kompakt") || null, ziel: lesen("ziel") || null };
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
    ["karten", "schrift", "akzent", "kompakt", "ziel"].forEach(function (k) { if ((lesen(k) || null) !== (e[k] || null)) { schreiben(k, e[k] || null); geaendert = true; } });
    if (geaendert) { einstellungenLaden(true); themaAnwenden(); toast("Einstellungen vom Konto übernommen", ""); if (aktuell) zeigePerson(aktuell, true); }
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
    try { if (navigator.setAppBadge && (z.info || 0) + n > 0) navigator.setAppBadge((z.info || 0) + n); } catch (e) {}
    var p = document.createElement("span"); p.className = "punkt" + (n ? " zahl" : "");
    if (n) p.textContent = n > 9 ? "9+" : String(n);
    p.title = n ? (z.gesuche || 0) + " offene Gesuche" + (z.wartend ? ", " + z.wartend + " warten auf Freischaltung" : "") : "angemeldet";
    b.appendChild(p);
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
  el("tab-plan").addEventListener("click", function () { location.hash = "plan"; });
  el("tab-tausch").addEventListener("click", function () { location.hash = "mitglieder/tausch"; });
  el("tab-abrechnung").addEventListener("click", function () { location.hash = "mitglieder/abrechnung"; });
  el("tab-mitglieder").addEventListener("click", function () { location.hash = "mehr"; });
  el("spiel-zurueck").addEventListener("click", function () { if (history.length > 1) history.back(); else location.hash = ""; });
  el("einstellungen-zurueck").addEventListener("click", function () { location.hash = "mehr"; });
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
    try { var alt = new URL(e.oldURL).hash; if (alt && alt.indexOf("#spiel/") !== 0) scrollMerker[alt] = window.scrollY; } catch (x) {}
    var neu = location.hash;
    if (scrollMerker[neu] !== undefined) {
      sprungZiel = scrollMerker[neu]; delete scrollMerker[neu];
      setTimeout(function () { if (sprungZiel !== null) { window.scrollTo(0, sprungZiel); sprungZiel = null; } }, 30);
    }
  });
  window.addEventListener("hashchange", ausHash);
  el("plan-filter-knopf").addEventListener("click", function () { el("plan-filter-blatt").classList.toggle("versteckt"); filterHoehe(); });
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
  el("plan-meine").addEventListener("change", zeigePlan);
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

  function filterHoehe() {
    var f = document.querySelector("#plan .filterleiste");
    if (f) document.documentElement.style.setProperty("--filter-hoehe", f.offsetHeight + "px");
  }
  window.addEventListener("resize", filterHoehe);

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

  function hole(name) { return fetch(name + "?" + Date.now()).then(function (r) { if (!r.ok) throw 0; return r.json(); }); }
  var letzterLauf = null;
  function standAnzeigen(d, lauf) {
    letzterLauf = lauf;
    if (lauf && lauf.stand) letzterStand = new Date(lauf.stand).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    var s = el("stand"); s.className = "stand";
    s.textContent = d.spiele_gesamt + " Spiele · " + d.personen.length + " SR";
    if (lauf && lauf.stand) {
      var stand = new Date(lauf.stand), alter = (Date.now() - stand.getTime()) / 3600000, min = Math.round(alter * 60);
      var relativ = min < 1 ? "gerade eben" : min < 60 ? "vor " + min + " Min." : alter < 24 ? "vor " + Math.round(alter) + " Std." : stand.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      s.textContent = "Stand " + relativ + " · " + s.textContent;
      s.title = "Letzter Lauf: " + stand.toLocaleString("de-DE");
      if (alter > 6) { s.className = "stand alt"; s.textContent += " – lange nicht aktualisiert"; }
    }
  }
  function neuLaden() {
    return Promise.all([hole("daten.json"), hole("stand.json").catch(function () { return null; })])
      .then(function (b) {
        daten = b[0]; standAnzeigen(daten, b[1]);
        if (aktuell) { var frisch = personMit(aktuell.slug); if (frisch) zeigePerson(frisch, true); }
        else if (!el("plan").classList.contains("versteckt")) zeigePlan();
      }).catch(function () {});
  }

  Promise.all([hole("daten.json"), hole("stand.json").catch(function () { return null; })])
    .then(function (b) {
      daten = b[0]; profil = profilLesen();
      document.title = daten.titel; el("titel").textContent = daten.titel; el("quelle").href = daten.quelle;
      standAnzeigen(daten, b[1]);
      el("fuss").textContent = "Termine beginnen " + daten.vorlauf_minuten + " Minuten vor Spielbeginn, damit du rechtzeitig an der Halle bist.";
      einstellungenLaden(); filterLaden(); avatarKopf(); zeigeListe(""); ausHash(); zeigeInstallHinweis(); zeigeNeu(); filterHoehe(); netzAnzeigen();
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
