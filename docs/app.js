/* Logik der Startseite. Frueher inline in index.html; eigene Datei, damit
 * die Content-Security-Policy keine Inline-Skripte erlauben muss. */
(function () {
  "use strict";

  var basis = location.href.split("#")[0].split("?")[0].replace(/index\.html$/, "").replace(/\/?$/, "/");

  // Wird einmal je Fassung gezeigt, damit die Kollegen neue Funktionen finden.
  var NEUIGKEITEN = { version: "2026-09-16", punkte: [
    "Spielplan als Monatsraster, Filter „nur unbesetzte“ und Liga-Chips",
    "Unter jedem Spiel: Hallen-Hinweise, Kontakt zum Gespann, Fahrgemeinschaft, private Notiz (angemeldet)",
    "Abrechnung füllt sich nach dem Spiel von selbst – nur noch „bezahlt“ abhaken",
    "Karte oben zeigt die Abfahrtszeit, Push erinnert am Spieltag",
    "Neue Konten werden vom Betreiber freigeschaltet; Konto löschen und Datenexport unter Konto"
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

  function zeigeNeu() {
    var box = el("neu");
    if (lesen("neu-gesehen") === NEUIGKEITEN.version) { box.classList.add("versteckt"); return; }
    var ul = el("neu-liste"); ul.innerHTML = "";
    NEUIGKEITEN.punkte.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
    box.classList.remove("versteckt");
    el("neu-weg").onclick = function () { schreiben("neu-gesehen", NEUIGKEITEN.version); box.classList.add("versteckt"); };
  }

  var letzterStand = null;
  function netzAnzeigen() {
    var s = el("stand");
    if (!navigator.onLine) { s.className = "stand alt"; s.textContent = "Offline – gespeicherter Stand" + (letzterStand ? " von " + letzterStand : ""); }
    else if (daten) standAnzeigen(daten, letzterLauf);
  }
  window.addEventListener("online", netzAnzeigen);
  window.addEventListener("offline", netzAnzeigen);

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
      text.textContent = "Beim Öffnen der App bekommst du eine Mitteilung, wenn eine Einteilung dazugekommen ist oder sich geändert hat. Echtes Push auch bei geschlossener App gibt es im Mitgliederbereich.";
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
    if (s.liga) { var l = document.createElement("span"); l.className = "liga"; l.textContent = s.liga; datum.appendChild(l); }
    kopf.appendChild(datum); kopf.appendChild(rolleBadge(s.rolle));
    d.appendChild(kopf);

    var paarung = document.createElement("div");
    paarung.className = "paarung"; paarung.textContent = s.paarung;
    d.appendChild(paarung);

    d.appendChild(mitIkone("i-clock", "An der Halle: " + uhr(treff) + " Uhr" + (s.system >= 3 ? " · " + s.system + "er-System" : "")));

    if (s.ort) {
      var a = document.createElement("a");
      a.href = "https://maps.apple.com/?daddr=" + encodeURIComponent(s.ort);
      a.target = "_blank"; a.rel = "noopener"; a.textContent = s.ort;
      d.appendChild(mitIkone("i-pin", a));
    } else {
      var w = document.createElement("div"); w.className = "achtung";
      w.textContent = "Halle nicht automatisch erkannt – bitte selbst prüfen."; d.appendChild(w);
    }

    if (s.gespann && s.gespann.length) {
      var g = document.createElement("div"); g.className = "chips";
      s.gespann.forEach(function (k) { g.appendChild(chip(k, s.system >= 3)); });
      d.appendChild(g);
    }
    if (s.hinweis) { var hw = document.createElement("div"); hw.className = "achtung"; hw.textContent = "⚠ " + s.hinweis; d.appendChild(hw); }
    if (s.aenderung) { var ae = document.createElement("div"); ae.className = "geaendert"; ae.textContent = "⚠ Geändert: " + s.aenderung; d.appendChild(ae); }
    var extras = document.createElement("div"); extras.className = "extras-ziel"; karteEl.appendChild(extras);
    if (fuer && !s.vergangen) karteEl.appendChild(tauschBereich(s, fuer));
    karteEl._spiel = s;
    return karteEl;
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
      var r = document.createElement("a"); r.href = "https://maps.apple.com/?daddr=" + encodeURIComponent(s.ort);
      r.target = "_blank"; r.rel = "noopener"; r.appendChild(ikone("i-route")); r.appendChild(document.createTextNode("Route")); ak.appendChild(r);
    }
    if (s.gespann && s.gespann.length) {
      var ge = document.createElement("span");
      ge.appendChild(ikone("i-users")); ge.appendChild(document.createTextNode(s.gespann.map(function (x) { return x.name.split(",")[0]; }).join(", ")));
      ak.appendChild(ge);
    }
    h.appendChild(ak);
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
    ladeMitglieder().then(function (M) { return M.bereit(mitgliederKontext()); }).then(function (st) {
      if (!st.eingerichtet || !st.session) return;
      return window.Mitglieder.offeneAbrechnungen(p.slug, 21);
    }).then(function (offen) {
      if (!offen || !offen.length) return;
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
  function planModus() { var m = lesen("plan-modus"); return m === "liste" || m === "monat" ? m : (lesen("plan-kompakt") === "1" ? "liste" : "karten"); }
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
    var ligen = Object.keys(ligenWahl).length ? ligenWahl : null;
    return (daten.spiele || []).filter(function (s) {
      if (s.vergangen && !mitVergangenen) return false;
      if (nurMeine && hallen.indexOf(s.halle) < 0) return false;
      if (nurOffen && s.besetzung.length) return false;
      if (ligen && !ligen[ligaGruppe(s.liga)]) return false;
      if (f) {
        var text = suchtextVon([s.paarung, s.liga, s.halle].concat(s.besetzung.map(function (b) { return b.name; })).join(" "));
        if (text.indexOf(f) === -1) return false;
      }
      return true;
    });
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
          if (ich) { var i1 = document.createElement("i"); i1.className = "ich"; p.appendChild(i1); }
          if (offen) { var i2 = document.createElement("i"); i2.className = "offen"; p.appendChild(i2); }
          if (!ich || liste.length > 1) { var i3 = document.createElement("i"); p.appendChild(i3); }
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

  function zeigePlan() {
    var modus = planModus();
    Array.prototype.forEach.call(el("plan-modus").querySelectorAll("button"), function (b) { b.classList.toggle("aktiv", b.getAttribute("data-modus") === modus); });
    el("plan-hallen-label").classList.toggle("versteckt", !meineHallen());
    zeigeLigen(daten.spiele || []);
    filterHoehe();
    var ziel = el("plan-liste");
    ziel.innerHTML = "";
    el("plan-monat").classList.toggle("versteckt", modus !== "monat");
    el("plan-vergangene").parentNode.classList.toggle("versteckt", modus === "monat");
    el("plan-heute").classList.toggle("versteckt", modus === "monat");
    if (modus === "monat") { zeigeMonat(); return; }
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
    var d = document.createElement("div"); d.className = "spiel karte" + (s.vergangen ? " war" : "");
    var kopf = document.createElement("div"); kopf.className = "kopfzeile";
    var zeit = document.createElement("span"); zeit.className = "zeit"; zeit.textContent = uhr(beginn) + " Uhr"; kopf.appendChild(zeit);
    if (s.liga) { var liga = document.createElement("span"); liga.className = "liga"; liga.textContent = s.liga; kopf.appendChild(liga); }
    d.appendChild(kopf);
    var paarung = document.createElement("div"); paarung.className = "paarung"; paarung.textContent = s.paarung; d.appendChild(paarung);
    d.appendChild(mitIkone("i-pin", (s.halle || "Halle unbekannt") + " · Treffpunkt " + uhr(new Date(s.treffpunkt)) + " Uhr" + (s.system >= 3 ? " · " + s.system + "er-System" : "")));
    var chips = document.createElement("div"); chips.className = "chips"; besetzungOder(s, chips); d.appendChild(chips);
    return d;
  }
  function planZeile(s, beginn) {
    var z = document.createElement("div"); z.className = "zeile" + (s.vergangen ? " war" : "");
    var zeit = document.createElement("span"); zeit.className = "zeit"; zeit.textContent = uhr(beginn);
    var mitte = document.createElement("span");
    var titel = document.createElement("span"); titel.textContent = (s.liga ? s.liga + ": " : "") + s.paarung;
    var klein = document.createElement("small"); klein.textContent = s.halle || "Halle unbekannt";
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
    var h = document.createElement("h3"); h.className = "abschnitt"; h.textContent = "Statistik"; ziel.appendChild(h);
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
    el("profil-hinweis").textContent = (profil && profil.slug === p.slug) ? "dein Profil" : "fremdes Profil";
    el("abo").href = feedUrl(p.slug, "webcal:");
    el("laden").onclick = function () { location.href = feedUrl(p.slug, location.protocol); };
    zeigeHeld(p);
    zeigeNachtrag(p);
    var ziel = el("spiele"); ziel.innerHTML = "";
    var kommend = p.spiele.filter(function (s) { return !s.vergangen; });
    var gewesen = p.spiele.filter(function (s) { return s.vergangen; }).reverse();
    var h = document.createElement("h3"); h.className = "abschnitt"; h.textContent = "Kommende Einteilungen"; ziel.appendChild(h);
    var istIch = !!(profil && profil.slug === p.slug), karten = [];
    if (!kommend.length) ziel.appendChild(leerZustand("Zurzeit keine Einteilung. Der Kalender füllt sich von allein."));
    else kommend.forEach(function (s) { var k = karte(s, p); karten.push(k); ziel.appendChild(k); });
    extrasFuellen(karten, istIch);
    if (gewesen.length) {
      var box = document.createElement("details"); box.className = "karte zuletzt-box";
      var sum = document.createElement("summary"); sum.className = "abschnitt"; sum.textContent = "Zuletzt (" + gewesen.length + ")"; box.appendChild(sum);
      box.addEventListener("toggle", function () {
        if (!box.open || box.childNodes.length !== 1) return;
        var alte = gewesen.map(function (s) { var k = karte(s); box.appendChild(k); return k; });
        extrasFuellen(alte, istIch);
      });
      ziel.appendChild(box);
    }
    if (!profil || profil.slug !== p.slug) zuletztMerken(p.slug);
    zeigeStatistik(p); zeigeSaison(p); zeigeMeldeKarte();
    if (profil && profil.slug === p.slug) pruefeNeue(p, false);
    if (!stillesNachladen) window.scrollTo(0, 0);
  }

  function ansicht(name) {
    ["auswahl", "detail", "plan", "mitglieder"].forEach(function (id) { el(id).classList.toggle("versteckt", name !== id); });
    el("tab-meine").classList.toggle("aktiv", name === "auswahl" || name === "detail");
    el("tab-plan").classList.toggle("aktiv", name === "plan");
    el("tab-mitglieder").classList.toggle("aktiv", name === "mitglieder");
    Array.prototype.forEach.call(document.querySelectorAll(".leiste button"), function (b) {
      if (b.classList.contains("aktiv")) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
  }
  function zeigeAuswahl(wechsel) {
    aktuell = null; ansicht("auswahl"); el("statistik").innerHTML = "";
    el("frage").textContent = wechsel ? "Wen willst du sehen?" : "Wer bist du?";
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

  function ausHash() {
    var slug = location.hash.replace(/^#/, "");
    if (slug === "plan") { aktuell = null; ansicht("plan"); zeigePlan(); window.scrollTo(0, 0); return; }
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
  el("melde-knopf").addEventListener("click", meldeAnfragen);
  el("kopieren").addEventListener("click", function () {
    if (!aktuell) return;
    var url = feedUrl(aktuell.slug, location.protocol), knopf = el("kopieren");
    var fertig = function () { toast("Link kopiert ✓", "gut"); knopf.textContent = "Kopiert ✓"; setTimeout(function () { knopf.textContent = "Link kopieren"; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(fertig, function () { prompt("Link:", url); }); else prompt("Link:", url);
  });
  window.addEventListener("hashchange", ausHash);
  el("tab-plan").addEventListener("click", function () { location.hash = "plan"; });
  el("tab-mitglieder").addEventListener("click", function () { location.hash = "mitglieder"; });
  el("tab-meine").addEventListener("click", function () { if (location.hash === "" || location.hash === "#") ausHash(); else location.hash = ""; });
  el("plan-filter").addEventListener("input", zeigePlan);
  el("plan-vergangene").addEventListener("change", zeigePlan);
  el("plan-hallen").addEventListener("change", zeigePlan);
  el("plan-offen").addEventListener("change", zeigePlan);
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
    s.textContent = d.personen.length + " Schiedsrichter · " + d.spiele_gesamt + " Spiele";
    if (lauf && lauf.stand) {
      var stand = new Date(lauf.stand), alter = (Date.now() - stand.getTime()) / 3600000;
      s.textContent = "Stand " + stand.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + " · " + s.textContent;
      if (alter > 6) { s.className = "stand alt"; s.textContent += " – seit " + Math.round(alter) + " Std. nicht aktualisiert"; }
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
      zeigeListe(""); ausHash(); zeigeInstallHinweis(); zeigeNeu(); filterHoehe(); netzAnzeigen();
    })
    .catch(function () { el("stand").className = "stand alt"; el("stand").textContent = "Daten konnten nicht geladen werden."; });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
