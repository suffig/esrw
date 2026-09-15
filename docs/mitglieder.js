/* Mitgliederbereich: Konto, Profil, Abrechnung.
 *
 * Spricht direkt aus dem Browser mit Supabase (Datenbank + Login). Was ein
 * Nutzer sehen und aendern darf, erzwingt die Datenbank ueber Row Level
 * Security - siehe supabase/schema.sql. Der "anon"-Schluessel im Quelltext
 * ist dafuer vorgesehen und oeffnet nichts, was die Regeln nicht erlauben.
 *
 * Wird von index.html erst geladen, wenn der Reiter "Mitglieder" geoeffnet
 * wird oder eine Funktion hinter dem Login gebraucht wird (Tauschoptionen).
 *
 * Mit "mock": true in supabase.json laeuft eine Attrappe im Browser, um die
 * Oberflaeche ohne Supabase auszuprobieren. Sie speichert in localStorage.
 */

window.Mitglieder = (function () {
  "use strict";

  var wurzel = null, ctx = null, cfg = null, sb = null, gebuehren = null;
  var session = null, profil = null, einsaetze = {}, archivDaten = null;
  var speicherTimer = {}, bereitVersprechen = null;

  var SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
  var OSRM = "https://router.project-osrm.org/route/v1/driving/";
  var WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  // ------------------------------------------------------------ Hilfen

  function h(tag, attrs, kinder) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    });
    (kinder || []).forEach(function (k) {
      if (k === null || k === undefined) return;
      e.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    });
    return e;
  }

  function leeren(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function euro(n) {
    return (Math.round((n || 0) * 100) / 100).toLocaleString("de-DE",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  function zahl(s) {
    if (s === null || s === undefined || s === "") return null;
    var n = parseFloat(String(s).replace(",", "."));
    return isNaN(n) ? null : n;
  }

  function uhr(d) { return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); }
  function datum(d) { return WT[d.getDay()] + ". " + d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }); }

  function kmZwischen(a, b) {
    var r = 6371, p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180;
    var dp = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180;
    var x = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * r * Math.asin(Math.sqrt(x));
  }

  function meldung(text, art) {
    if (!wurzel) return;
    var m = wurzel.querySelector(".mg-meldung");
    if (!m) { m = h("div", { class: "mg-meldung" }); wurzel.insertBefore(m, wurzel.firstChild); }
    m.textContent = text;
    m.className = "mg-meldung " + (art || "");
    m.hidden = !text;
  }

  function skriptLaden(url) {
    return new Promise(function (ok, nein) {
      if (window.supabase && window.supabase.createClient) return ok();
      var s = document.createElement("script");
      s.src = url; s.onload = ok; s.onerror = function () { nein(new Error("Supabase-Bibliothek nicht ladbar")); };
      document.head.appendChild(s);
    });
  }

  function holeJson(name, standard) {
    return fetch(name + "?" + Date.now())
      .then(function (r) { return r.ok ? r.json() : standard; })
      .catch(function () { return standard; });
  }

  // --------------------------------------------------------- Attrappe
  //
  // Bildet genau die Handvoll Aufrufe nach, die dieses Modul benutzt.
  // Passwoerter liegen im Klartext im localStorage - eine Attrappe zum
  // Ausprobieren der Oberflaeche, kein Login.

  function attrappe() {
    function lies(k, std) { try { return JSON.parse(localStorage.getItem("mock_" + k)) || std; } catch (e) { return std; } }
    function schreib(k, v) { localStorage.setItem("mock_" + k, JSON.stringify(v)); }
    var hoerer = [];
    function sitzung() {
      var s = lies("session", null);
      return s ? { user: { id: s.id, email: s.email } } : null;
    }
    function melde() { var s = sitzung(); hoerer.forEach(function (f) { f(s ? "SIGNED_IN" : "SIGNED_OUT", s); }); }

    function tabelle(name) {
      var zeilen = lies(name, []);
      var filter = [];
      var api = {
        select: function () { return api; },
        eq: function (feld, wert) { filter.push([feld, wert]); return api; },
        order: function () { return api; },
        maybeSingle: function () { return Promise.resolve({ data: api._treffer()[0] || null, error: null }); },
        then: function (ok) { return Promise.resolve({ data: api._treffer(), error: null }).then(ok); },
        _treffer: function () {
          return zeilen.filter(function (z) { return filter.every(function (f) { return z[f[0]] === f[1]; }); });
        },
        upsert: function (obj, opt) {
          var liste = Array.isArray(obj) ? obj : [obj];
          liste.forEach(function (o) {
            var i = -1;
            if (name === "profile") i = zeilen.findIndex(function (z) { return z.id === o.id; });
            else if (opt && opt.onConflict) i = zeilen.findIndex(function (z) { return z.user_id === o.user_id && z.kennung === o.kennung; });
            else if (o.id) i = zeilen.findIndex(function (z) { return z.id === o.id; });
            var neu = Object.assign({}, i >= 0 ? zeilen[i] : { id: o.id || ("m" + Date.now() + Math.random()) }, o, { geaendert: new Date().toISOString() });
            if (i >= 0) zeilen[i] = neu; else zeilen.push(neu);
          });
          schreib(name, zeilen);
          return { select: function () { return Promise.resolve({ data: liste, error: null }); },
                   then: function (ok) { return Promise.resolve({ data: liste, error: null }).then(ok); } };
        },
        delete: function () {
          return { eq: function (feld, wert) {
            zeilen = zeilen.filter(function (z) { return z[feld] !== wert; });
            schreib(name, zeilen);
            return Promise.resolve({ error: null });
          } };
        }
      };
      return api;
    }

    return {
      _attrappe: true,
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: sitzung() } }); },
        onAuthStateChange: function (f) { hoerer.push(f); return { data: { subscription: { unsubscribe: function () {} } } }; },
        signUp: function (p) {
          var nutzer = lies("users", {});
          if (nutzer[p.email]) return Promise.resolve({ error: { message: "Konto gibt es schon" } });
          nutzer[p.email] = { id: "u_" + btoa(p.email).replace(/=/g, ""), pw: p.password };
          schreib("users", nutzer);
          schreib("session", { id: nutzer[p.email].id, email: p.email });
          melde();
          return Promise.resolve({ data: { user: { id: nutzer[p.email].id }, session: sitzung() }, error: null });
        },
        signInWithPassword: function (p) {
          var nutzer = lies("users", {});
          var u = nutzer[p.email];
          if (!u || u.pw !== p.password) return Promise.resolve({ error: { message: "Invalid login credentials" } });
          schreib("session", { id: u.id, email: p.email });
          melde();
          return Promise.resolve({ data: { session: sitzung() }, error: null });
        },
        signOut: function () { localStorage.removeItem("mock_session"); melde(); return Promise.resolve({ error: null }); },
        resetPasswordForEmail: function () { return Promise.resolve({ error: null }); }
      },
      from: tabelle
    };
  }

  // ------------------------------------------------------------ Start
  //
  // bereit(): Verbindung und Sitzung herstellen, ohne etwas zu zeichnen.
  // Wird auch von index.html gebraucht, um Funktionen hinter dem Login
  // (Tauschoptionen) freizugeben.

  function bereit(kontext) {
    if (kontext) ctx = kontext;
    if (bereitVersprechen) return bereitVersprechen;
    bereitVersprechen = Promise.all([holeJson("supabase.json", {}), holeJson("gebuehren.json", null)])
      .then(function (r) {
        cfg = r[0] || {}; gebuehren = r[1];
        if (cfg.mock) { sb = attrappe(); return; }
        if (!cfg.url || !cfg.anon_key) { sb = null; return; }
        return skriptLaden(SUPABASE_CDN).then(function () {
          sb = window.supabase.createClient(cfg.url, cfg.anon_key);
        });
      })
      .then(function () {
        if (!sb) return { eingerichtet: false, session: null };
        sb.auth.onAuthStateChange(function (ereignis, s) {
          session = s;
          if (!s) { profil = null; einsaetze = {}; if (wurzel) zeigeAnmeldung(); }
          document.dispatchEvent(new CustomEvent("mg-sitzung", { detail: { angemeldet: !!s } }));
        });
        return sb.auth.getSession().then(function (r) {
          session = r.data.session;
          return { eingerichtet: true, session: session };
        });
      });
    return bereitVersprechen;
  }

  function angemeldet() { return !!session; }

  function oeffnen(container, kontext) {
    wurzel = container; ctx = kontext;
    leeren(wurzel);
    wurzel.appendChild(h("p", { class: "meta", text: "Mitgliederbereich wird geladen …" }));
    bereit(kontext)
      .then(function (st) {
        if (!st.eingerichtet) { zeigeKeinBackend(); return; }
        return session ? nachLogin() : zeigeAnmeldung();
      })
      .catch(function (e) {
        leeren(wurzel);
        wurzel.appendChild(h("p", { class: "achtung", text: "Mitgliederbereich nicht erreichbar: " + (e.message || e) }));
      });
  }

  function zeigeKeinBackend() {
    leeren(wurzel);
    wurzel.appendChild(h("div", { class: "melde" }, [
      h("h4", { text: "Mitgliederbereich noch nicht eingerichtet" }),
      h("p", { text: "Hier kommen Konto, Abrechnung und Tauschoptionen hin. Dafür muss der " +
        "Betreiber einmal ein Supabase-Projekt anlegen und die Zugangsdaten in " +
        "supabase.json eintragen – Schritt 10 in der Anleitung." })
    ]));
  }

  // --------------------------------------------------------- Anmeldung

  function zeigeAnmeldung(modus) {
    modus = modus || "anmelden";
    leeren(wurzel);
    var email = h("input", { type: "email", placeholder: "E-Mail", autocomplete: "email", required: "" });
    var pw = h("input", { type: "password", placeholder: "Passwort (mind. 8 Zeichen)",
                          autocomplete: modus === "registrieren" ? "new-password" : "current-password", minlength: "8" });
    var knopf = h("button", { type: "submit", class: "mg-haupt",
      text: modus === "registrieren" ? "Konto anlegen" : modus === "vergessen" ? "Link schicken" : "Anmelden" });

    var form = h("form", { class: "mg-form", onsubmit: function (e) {
      e.preventDefault();
      knopf.disabled = true;
      var p = { email: email.value.trim(), password: pw.value };
      var lauf;
      if (modus === "registrieren") {
        lauf = sb.auth.signUp({ email: p.email, password: p.password,
          options: { emailRedirectTo: location.href.split("#")[0] } });
      } else if (modus === "vergessen") {
        lauf = sb.auth.resetPasswordForEmail(p.email, { redirectTo: location.href.split("#")[0] });
      } else {
        lauf = sb.auth.signInWithPassword(p);
      }
      lauf.then(function (r) {
        knopf.disabled = false;
        if (r.error) { meldung(fehlerText(r.error), "warn"); return; }
        if (modus === "vergessen") { meldung("Falls es das Konto gibt, ist eine E-Mail mit dem Link unterwegs.", "gut"); return; }
        if (modus === "registrieren" && !(r.data && r.data.session)) {
          meldung("Konto angelegt. Bitte den Bestätigungslink in der E-Mail antippen, danach hier anmelden.", "gut");
          return;
        }
        session = r.data.session;
        nachLogin();
      }).catch(function (e) { knopf.disabled = false; meldung(String(e.message || e), "warn"); });
    } }, [
      h("h4", { text: modus === "registrieren" ? "Konto anlegen" : modus === "vergessen" ? "Passwort vergessen" : "Anmelden" }),
      email,
      modus === "vergessen" ? null : pw,
      knopf
    ]);

    var wechsel = h("p", { class: "meta mg-wechsel" }, modus === "anmelden" ? [
      h("button", { type: "button", class: "textknopf", text: "Konto anlegen", onclick: function () { zeigeAnmeldung("registrieren"); } }),
      " · ",
      h("button", { type: "button", class: "textknopf", text: "Passwort vergessen", onclick: function () { zeigeAnmeldung("vergessen"); } })
    ] : [
      h("button", { type: "button", class: "textknopf", text: "Zurück zur Anmeldung", onclick: function () { zeigeAnmeldung("anmelden"); } })
    ]);

    wurzel.appendChild(h("div", { class: "melde" }, [
      form, wechsel,
      h("p", { class: "meta", text: "Konto und Daten liegen bei Supabase" +
        (sb && sb._attrappe ? " – hier gerade als Attrappe im Browser, nichts geht raus." : ". Jeder sieht nur seine eigenen Einträge.") })
    ]));
    if (sb && sb._attrappe) meldung("Attrappe aktiv: Konten werden nur in diesem Browser gespeichert.", "");
  }

  function fehlerText(err) {
    var m = (err && err.message) || "";
    if (/invalid login/i.test(m)) return "E-Mail oder Passwort stimmt nicht.";
    if (/already registered|gibt es schon/i.test(m)) return "Für diese E-Mail gibt es schon ein Konto.";
    if (/email not confirmed/i.test(m)) return "Bitte erst den Bestätigungslink in der E-Mail antippen.";
    if (/password/i.test(m) && /short|least/i.test(m)) return "Das Passwort ist zu kurz.";
    if (/rate limit/i.test(m)) return "Zu viele Versuche – kurz warten.";
    return m || "Unbekannter Fehler.";
  }

  // --------------------------------------------------------- Nach Login

  function nachLogin() {
    leeren(wurzel);
    wurzel.appendChild(h("p", { class: "meta", text: "Lade dein Profil …" }));
    return sb.from("profile").select("*").eq("id", session.user.id).maybeSingle()
      .then(function (r) {
        if (r.error) throw r.error;
        profil = r.data;
        if (!profil || !profil.slug) return zeigeEinrichtung();
        return ladeEinsaetze().then(zeigeAbrechnung);
      })
      .catch(function (e) { meldung("Profil konnte nicht geladen werden: " + (e.message || e), "warn"); });
  }

  function abmelden() {
    sb.auth.signOut().then(function () { session = null; profil = null; einsaetze = {}; zeigeAnmeldung(); });
  }

  // --------------------------------------------------------- Einrichtung

  function zeigeEinrichtung(zurueck) {
    leeren(wurzel);
    var p = profil || {};
    var kmStd = (gebuehren && gebuehren.kilometer) || {};
    var auswahl = h("select", { class: "mg-select" },
      [h("option", { value: "", text: "– bitte wählen –" })].concat(
        ctx.daten.personen.map(function (x) {
          var o = h("option", { value: x.slug, text: x.name });
          if ((p.slug || ctx.slug) === x.slug) o.selected = true;
          return o;
        })));
    var heimat = h("input", { type: "text", placeholder: "Straße Hausnummer, PLZ Ort", value: p.heimat || "", autocomplete: "street-address" });
    var koord = h("span", { class: "meta", text: p.heimat_lat ? "gefunden ✓" : "" });
    var lat = p.heimat_lat || null, lon = p.heimat_lon || null, adresseGeaendert = false;
    heimat.addEventListener("input", function () { adresseGeaendert = true; lat = lon = null; koord.textContent = "noch nicht gesucht"; });

    var modell = h("select", { class: "mg-select" }, [
      h("option", { value: "einfach", text: "Entfernungspauschale – einfache Strecke, volle km" }),
      h("option", { value: "hinrueck", text: "Reisekosten – gefahrene km, hin und zurück" })
    ]);
    modell.value = p.km_modell || "einfach";
    var satzEinfach = h("input", { type: "number", step: "0.01", min: "0",
      value: p.satz_einfach != null ? p.satz_einfach : (kmStd.satz_einfach || 0.38) });
    var satzHinrueck = h("input", { type: "number", step: "0.01", min: "0",
      value: p.satz_hinrueck != null ? p.satz_hinrueck : (kmStd.satz_hinrueck || 0.30) });

    var suchen = h("button", { type: "button", class: "mg-neben", text: "Adresse suchen", onclick: function () {
      var q = heimat.value.trim();
      if (!q) return;
      koord.textContent = "suche …";
      fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de,nl,be&q=" + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (t) {
          if (!t.length) { koord.textContent = "nicht gefunden – genauer eingeben (Straße, Hausnummer, Ort)"; lat = lon = null; return; }
          lat = parseFloat(t[0].lat); lon = parseFloat(t[0].lon);
          koord.textContent = "gefunden: " + t[0].display_name.split(",").slice(0, 3).join(",");
        })
        .catch(function () { koord.textContent = "Suche nicht erreichbar"; });
    } });

    var speichern = h("button", { type: "submit", class: "mg-haupt", text: "Speichern" });
    var form = h("form", { class: "mg-form", onsubmit: function (e) {
      e.preventDefault();
      if (!auswahl.value) { meldung("Bitte deinen Namen wählen.", "warn"); return; }
      if (heimat.value.trim() && lat == null) { meldung("Bitte erst „Adresse suchen“ drücken, damit die Strecke berechnet werden kann.", "warn"); return; }
      speichern.disabled = true;
      var person = ctx.personMit(auswahl.value);
      var zeile = { id: session.user.id, slug: auswahl.value, name: person ? person.name : auswahl.value,
                    heimat: heimat.value.trim() || null, heimat_lat: lat, heimat_lon: lon,
                    km_modell: modell.value,
                    satz_einfach: zahl(satzEinfach.value) != null ? zahl(satzEinfach.value) : 0.38,
                    satz_hinrueck: zahl(satzHinrueck.value) != null ? zahl(satzHinrueck.value) : 0.30,
                    km_satz: modell.value === "einfach" ? zahl(satzEinfach.value) : zahl(satzHinrueck.value),
                    // Neue Adresse -> alte Strecken sind wertlos
                    strecken: adresseGeaendert ? {} : (p.strecken || {}) };
      sb.from("profile").upsert(zeile).then(function (r) {
        speichern.disabled = false;
        if (r.error) { meldung("Speichern fehlgeschlagen: " + r.error.message, "warn"); return; }
        profil = zeile;
        meldung("Gespeichert.", "gut");
        ladeEinsaetze().then(zeigeAbrechnung);
      });
    } }, [
      h("h4", { text: zurueck ? "Einstellungen" : "Wer bist du?" }),
      h("label", { text: "Dein Name auf esrw.de" }), auswahl,
      h("label", { text: "Heimatadresse – Startpunkt für die Strecke zur Halle" }),
      h("div", { class: "mg-zeile" }, [heimat, suchen]), koord,
      h("label", { text: "Kilometermodell" }), modell,
      h("div", { class: "mg-felder mg-zwei" }, [
        h("label", {}, ["€ je km, einfache Strecke", satzEinfach]),
        h("label", {}, ["€ je km, hin und zurück", satzHinrueck])
      ]),
      h("p", { class: "meta", text: "Voreinstellung: Entfernungspauschale 0,38 € ab dem ersten vollen Kilometer " +
        "(gilt seit 01.01.2026), Reisekosten 0,30 € je gefahrenem km. Welches Modell für dich " +
        "passt, sagt dir dein Steuerberater – die Sätze lassen sich jederzeit ändern." }),
      h("p", { class: "meta", text: "Die Adresse liegt in deinem Profil bei Supabase und ist für niemanden sonst " +
        "lesbar. Für die Streckenberechnung gehen nur Koordinaten an den Routendienst (OSRM), keine Adresse." }),
      speichern,
      zurueck ? h("button", { type: "button", class: "mg-neben", text: "Zurück", onclick: function () { zeigeAbrechnung(); } }) : null
    ]);
    wurzel.appendChild(h("div", { class: "melde" }, [form]));
  }

  // ------------------------------------------------------------ Strecken
  //
  // Strassenkilometer von der Heimatadresse zur Halle, einmal je Halle
  // berechnet (OSRM-Demoserver, ohne Schluessel) und im Profil gespeichert.
  // Faellt der Dienst aus, bleibt die Luftlinie mal Strassenfaktor.

  function streckeGespeichert(halle) {
    return profil && profil.strecken && profil.strecken[halle] ? profil.strecken[halle] : null;
  }

  function luftlinie(halle) {
    if (!profil || profil.heimat_lat == null || !halle) return null;
    var ziel = ctx.daten.hallen && ctx.daten.hallen[halle];
    if (!ziel) return null;
    var faktor = (gebuehren && gebuehren.kilometer && gebuehren.kilometer.strassenfaktor_luftlinie) || 1.3;
    return Math.round(kmZwischen([profil.heimat_lat, profil.heimat_lon], ziel) * faktor * 10) / 10;
  }

  function streckeBerechnen(halle) {
    var gesp = streckeGespeichert(halle);
    if (gesp && gesp.art === "route") return Promise.resolve(gesp);
    if (!profil || profil.heimat_lat == null) return Promise.resolve(null);
    var ziel = ctx.daten.hallen && ctx.daten.hallen[halle];
    if (!ziel) return Promise.resolve(null);
    var url = OSRM + profil.heimat_lon + "," + profil.heimat_lat + ";" + ziel[1] + "," + ziel[0] + "?overview=false";
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (d.code !== "Ok" || !d.routes || !d.routes[0]) throw new Error(d.code || "keine Route");
      return { km: Math.round(d.routes[0].distance / 100) / 10, art: "route", am: new Date().toISOString() };
    }).catch(function () {
      var l = luftlinie(halle);
      return l == null ? null : { km: l, art: "luftlinie", am: new Date().toISOString() };
    });
  }

  function streckenFuer(hallen) {
    // Nacheinander, mit kleiner Pause - der Demoserver ist ein Gemeingut.
    var offen = hallen.filter(function (x) { return x && !(streckeGespeichert(x) && streckeGespeichert(x).art === "route"); });
    var ergebnis = Object.assign({}, profil.strecken || {});
    var kette = Promise.resolve();
    offen.forEach(function (halle, i) {
      kette = kette.then(function () {
        return new Promise(function (ok) { setTimeout(ok, i ? 350 : 0); })
          .then(function () { return streckeBerechnen(halle); })
          .then(function (s) { if (s) ergebnis[halle] = s; });
      });
    });
    return kette.then(function () {
      profil.strecken = ergebnis;
      return sb.from("profile").upsert({ id: session.user.id, strecken: ergebnis }).then(function () { return ergebnis; });
    });
  }

  function kmVorschlag(spiel) {
    var s = streckeGespeichert(spiel.halle);
    if (s) return s;
    var l = luftlinie(spiel.halle);
    return l == null ? null : { km: l, art: "luftlinie" };
  }

  // ------------------------------------------------------- Verguetung
  //
  // Spielleitungsgebuehr laut gebuehren.json aus Liga, Rolle und Anzahl
  // Offizieller. Was sich nicht eindeutig zuordnen laesst (DNL, Auswahl-
  // spiele, DEB-Ligen), bleibt leer und wird von Hand eingetragen.

  function ligaEinordnen(liga) {
    var L = (liga || "").toUpperCase();
    var alter = L.match(/\bU(7|9|11|13|15|17|20)\b/);
    if (alter) {
      var stufe = /\bRL[A-Z]?\b|REGIONAL/.test(L) ? "RL" : /\bLL\b|LANDES/.test(L) ? "LL" : /\bBL\b|\bBZL\b|BEZIRK/.test(L) ? "BL" : "";
      // U17 I / U17 II und DNL sind DEB-Ligen - nicht in der ESRW-Ordnung
      if (/\bDNL\b/.test(L) || /\bU17 (I|II)\b/.test(L)) return null;
      return { klasse: "U" + alter[1], stufe: stufe };
    }
    if (/\bDNL\b|\bDA\b|AUSWAHL/.test(L)) return null;
    if (/FRAUEN|DAMEN|DEFL|\bDFEL\b/.test(L)) return { klasse: "frauen", stufe: /\b2\b|DEFL|DFEL/.test(L) ? "2LIGA" : "" };
    if (/\bRL\b|REGIONAL/.test(L)) return { klasse: "senioren", stufe: "RL" };
    if (/\bLL\b|LANDES/.test(L)) return { klasse: "senioren", stufe: "LL" };
    if (/\bBL\b|\bBZL\b|BEZIRK|SENIOREN/.test(L)) return { klasse: "senioren", stufe: "BL" };
    return null;
  }

  function grundgebuehr(spiel) {
    if (!gebuehren) return null;
    var e = ligaEinordnen(spiel.liga);
    if (!e) return null;
    var rolle = spiel.rolle || "SR", system = spiel.system || 2, satz = null;
    if (e.klasse === "senioren") {
      satz = gebuehren.senioren[e.stufe] || null;
    } else if (e.klasse === "frauen") {
      satz = gebuehren.frauen;
    } else {
      var n = gebuehren.nachwuchs[e.klasse];
      if (!n) return null;
      if (e.klasse === "U20") satz = e.stufe === "RL" ? n.RL : n.sonst;
      else satz = n;
    }
    if (!satz) return null;
    if (satz.SR_allein != null && system <= 1) return satz.SR_allein;
    var betrag = satz[rolle];
    if (betrag == null) betrag = satz.SR;
    return betrag == null ? null : betrag;
  }

  function zeitzuschlag(spiel) {
    var z = gebuehren && gebuehren.zuschlag_zeit;
    if (!z) return false;
    var d = new Date(spiel.beginn);
    var hm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    return hm <= z.bis_einschliesslich || hm >= z.ab_einschliesslich;
  }

  function uebergreifendMoeglich(spiel) {
    var e = ligaEinordnen(spiel.liga);
    return !!(e && ((e.klasse === "senioren" && e.stufe === "RL") || (e.klasse === "frauen" && e.stufe === "2LIGA")));
  }

  function betragFuer(spiel, e) {
    // Reihenfolge (Annahme, die Ordnung sagt es nicht): Zeitzuschlag auf die
    // Grundgebuehr, dann der Zuschlag fuer uebergreifenden Einsatz, zum
    // Schluss die Halbierung bei Ausfall vor Ort.
    var grund = e && e.verguetung != null ? e.verguetung : null;
    if (grund == null) return { grund: null, betrag: null };
    var zeit = zeitzuschlag(spiel) ? grund * ((gebuehren.zuschlag_zeit.prozent || 0) / 100) : 0;
    var ueber = 0;
    if (e.uebergreifend && gebuehren.zuschlag_uebergreifend) {
      ueber = (spiel.system || 2) === 2 ? gebuehren.zuschlag_uebergreifend.je_sr_2mann : gebuehren.zuschlag_uebergreifend.je_sr;
    }
    var summe = grund + zeit + ueber;
    var ausfall = e.ausgefallen ? summe * ((gebuehren.ausfall_vor_ort_prozent || 50) / 100) : 0;
    return { grund: grund, zeit: zeit, ueber: ueber, ausfall: ausfall, betrag: summe - ausfall };
  }

  function fahrtkosten(e) {
    if (!e || e.km == null || !profil) return 0;
    if ((profil.km_modell || "einfach") === "einfach") {
      return Math.floor(e.km) * (profil.satz_einfach != null ? profil.satz_einfach : 0.38);
    }
    return e.km * 2 * (profil.satz_hinrueck != null ? profil.satz_hinrueck : 0.30);
  }

  // --------------------------------------------------------- Abrechnung

  function ladeEinsaetze() {
    return sb.from("einsaetze").select("*").eq("user_id", session.user.id)
      .then(function (r) {
        if (r.error) throw r.error;
        einsaetze = {};
        (r.data || []).forEach(function (z) { einsaetze[z.kennung] = z; });
      });
  }

  function saisonSpiele() {
    var person = ctx.personMit(profil.slug);
    var karte = {};
    var archiv = (archivDaten && archivDaten.personen && archivDaten.personen[profil.slug]) || [];
    archiv.forEach(function (s) {
      karte[s.beginn + "|" + s.paarung] = { beginn: s.beginn, liga: s.liga, paarung: s.paarung, halle: s.halle, rolle: s.rolle, system: s.system };
    });
    if (person) person.spiele.forEach(function (s) {
      karte[s.beginn + "|" + s.paarung] = { beginn: s.beginn, liga: s.liga, paarung: s.paarung, halle: s.halle, rolle: s.rolle, system: s.system };
    });
    return Object.keys(karte).map(function (k) { var s = karte[k]; s.kennung = k; return s; })
      .sort(function (a, b) { return a.beginn < b.beginn ? 1 : -1; });
  }

  function speichereEinsatz(spiel, aenderung) {
    var alt = einsaetze[spiel.kennung] || {};
    var zeile = Object.assign({
      user_id: session.user.id, kennung: spiel.kennung, beginn: spiel.beginn,
      liga: spiel.liga, paarung: spiel.paarung, halle: spiel.halle, rolle: spiel.rolle,
      km: alt.km != null ? alt.km : null, km_satz: profil.km_satz != null ? profil.km_satz : null,
      verguetung: alt.verguetung != null ? alt.verguetung : null,
      auslagen: alt.auslagen != null ? alt.auslagen : null,
      bezahlt: !!alt.bezahlt, ausgefallen: !!alt.ausgefallen, uebergreifend: !!alt.uebergreifend,
      notiz: alt.notiz || null
    }, alt.id ? { id: alt.id } : {}, aenderung);
    einsaetze[spiel.kennung] = zeile;
    aktualisiereSummen();
    aktualisiereZeile(spiel);
    clearTimeout(speicherTimer[spiel.kennung]);
    speicherTimer[spiel.kennung] = setTimeout(function () {
      sb.from("einsaetze").upsert(zeile, { onConflict: "user_id,kennung" }).then(function (r) {
        if (r.error) { meldung("Speichern fehlgeschlagen: " + r.error.message, "warn"); return; }
        if (r.data && r.data[0] && r.data[0].id) einsaetze[spiel.kennung].id = r.data[0].id;
        meldung("Gespeichert ✓", "gut");
        setTimeout(function () { meldung("", ""); }, 1500);
      });
    }, 600);
  }

  function summen(spiele, filter) {
    var s = { spiele: 0, km: 0, fahrt: 0, verg: 0, ausl: 0, offen: 0, offenBetrag: 0 };
    spiele.forEach(function (sp) {
      if (filter && !filter(sp)) return;
      var e = einsaetze[sp.kennung];
      if (!e) return;
      s.spiele++;
      s.km += e.km || 0;
      s.fahrt += fahrtkosten(e);
      var b = betragFuer(sp, e).betrag || 0;
      s.verg += b; s.ausl += e.auslagen || 0;
      if (!e.bezahlt && b > 0) { s.offen++; s.offenBetrag += b; }
    });
    return s;
  }

  function summenBox(titel, s) {
    var box = h("div", {}, [h("h3", { text: titel })]);
    var z = h("div", { class: "zahlen mg-summen" });
    var einfach = (profil.km_modell || "einfach") === "einfach";
    [["Spiele erfasst", s.spiele],
     [einfach ? "km einfach" : "km gefahren", Math.round(einfach ? s.km : s.km * 2) + " km"],
     ["Fahrtkosten", euro(s.fahrt)], ["Vergütung", euro(s.verg)],
     ["Auslagen", euro(s.ausl)], ["noch offen", s.offen ? euro(s.offenBetrag) : "–"]
    ].forEach(function (p) {
      z.appendChild(h("div", { class: "zahl" }, [h("b", { text: String(p[1]) }), h("span", { text: p[0] })]));
    });
    box.appendChild(z);
    return box;
  }

  function aktualisiereSummen() {
    var alt = wurzel.querySelector(".mg-summenblock");
    if (!alt) return;
    var spiele = saisonSpiele();
    var jahr = new Date().getFullYear();
    var neu = h("div", { class: "mg-summenblock" }, [
      summenBox("Saison " + (ctx.daten.saison || ""), summen(spiele)),
      summenBox("Steuerjahr " + jahr, summen(spiele, function (sp) { return new Date(sp.beginn).getFullYear() === jahr; }))
    ]);
    alt.parentNode.replaceChild(neu, alt);
  }

  function aktualisiereZeile(spiel) {
    var el = wurzel.querySelector('[data-kennung="' + spiel.kennung.replace(/"/g, "") + '"] .mg-betrag');
    if (!el) return;
    var e = einsaetze[spiel.kennung];
    var b = betragFuer(spiel, e);
    el.textContent = betragText(spiel, e, b);
  }

  function betragText(spiel, e, b) {
    if (b.betrag == null) return "Betrag: – (Vergütung eintragen)";
    var teile = ["Betrag " + euro(b.betrag)];
    if (b.zeit) teile.push("+20 % Uhrzeit");
    if (b.ueber) teile.push("+" + euro(b.ueber) + " übergreifend");
    if (b.ausfall) teile.push("−50 % Ausfall");
    if (e && e.km != null) teile.push("Fahrt " + euro(fahrtkosten(e)));
    return teile.join(" · ");
  }

  function csvExport(spiele) {
    var einfach = (profil.km_modell || "einfach") === "einfach";
    var zeilen = [["Datum", "Uhrzeit", "Liga", "Begegnung", "Halle", "Rolle", "System",
                   "km einfach", "km gefahren", "Kilometermodell", "Satz €/km", "Fahrtkosten",
                   "Grundgebühr", "Zuschlag Uhrzeit", "Zuschlag übergreifend", "Ausfall vor Ort", "Vergütung",
                   "Auslagen", "bezahlt", "Notiz"]];
    var dez = function (n) { return n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","); };
    spiele.forEach(function (sp) {
      var e = einsaetze[sp.kennung] || {};
      var d = new Date(sp.beginn);
      var b = betragFuer(sp, e);
      zeilen.push([
        d.toLocaleDateString("de-DE"), uhr(d), sp.liga || "", sp.paarung || "", sp.halle || "", sp.rolle || "",
        sp.system || "", dez(e.km), dez(e.km != null ? e.km * 2 : null), einfach ? "einfache Strecke" : "hin und zurück",
        dez(einfach ? profil.satz_einfach : profil.satz_hinrueck), dez(e.km != null ? fahrtkosten(e) : null),
        dez(b.grund), dez(b.zeit || null), dez(b.ueber || null), e.ausgefallen ? "ja" : "", dez(b.betrag),
        dez(e.auslagen), e.bezahlt ? "ja" : "nein", e.notiz || ""
      ]);
    });
    var text = zeilen.map(function (z) {
      return z.map(function (f) { return '"' + String(f).replace(/"/g, '""') + '"'; }).join(";");
    }).join("\r\n");
    var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Abrechnung_" + (ctx.daten.saison || "").replace("/", "-") + "_" + profil.slug + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function zeigeAbrechnung() {
    leeren(wurzel);
    wurzel.appendChild(h("p", { class: "meta", text: "Lade Saison …" }));
    (archivDaten ? Promise.resolve(archivDaten) : ctx.hole("archiv.json").catch(function () { return { personen: {} }; }))
      .then(function (a) { archivDaten = a; rendereAbrechnung(); });
  }

  function rendereAbrechnung() {
    leeren(wurzel);
    var spiele = saisonSpiele();
    wurzel.appendChild(h("div", { class: "profilzeile" }, [
      h("span", {}, [h("b", { text: profil.name || profil.slug }), h("small", { text: session.user.email })]),
      h("span", {}, [
        h("button", { type: "button", class: "textknopf", text: "Einstellungen", onclick: function () { zeigeEinrichtung(true); } }),
        " · ",
        h("button", { type: "button", class: "textknopf", text: "Abmelden", onclick: abmelden })
      ])
    ]));

    wurzel.appendChild(h("div", { class: "mg-summenblock" }));

    var hallen = []; spiele.forEach(function (sp) { if (sp.halle && hallen.indexOf(sp.halle) < 0) hallen.push(sp.halle); });
    var strecken = h("button", { type: "button", text: "Strecken berechnen", onclick: function () {
      if (!profil.heimat_lat) { meldung("Erst in den Einstellungen die Heimatadresse setzen und suchen lassen.", "warn"); return; }
      strecken.disabled = true; strecken.textContent = "berechne …";
      streckenFuer(hallen).then(function () {
        var n = 0;
        spiele.forEach(function (sp) {
          var e = einsaetze[sp.kennung];
          if (e && e.km != null) return;
          var v = kmVorschlag(sp);
          if (v) { speichereEinsatz(sp, { km: v.km }); n++; }
        });
        meldung(hallen.length + " Hallen berechnet, " + n + " Spiele eingetragen.", "gut");
        rendereAbrechnung();
      }).catch(function (e) { meldung("Streckenberechnung fehlgeschlagen: " + (e.message || e), "warn"); rendereAbrechnung(); });
    } });
    var gebuehr = h("button", { type: "button", text: "Vergütung eintragen", onclick: function () {
      var n = 0, offen = 0;
      spiele.forEach(function (sp) {
        var e = einsaetze[sp.kennung];
        if (e && e.verguetung != null) return;
        var g = grundgebuehr(sp);
        if (g == null) { offen++; return; }
        speichereEinsatz(sp, { verguetung: g }); n++;
      });
      meldung(n + " Spiele nach Gebührenordnung eingetragen" + (offen ? ", " + offen + " ohne Zuordnung (bitte von Hand)" : "") + ".", n ? "gut" : "warn");
      rendereAbrechnung();
    } });
    wurzel.appendChild(h("div", { class: "zweit" }, [strecken, gebuehr,
      h("button", { type: "button", text: "CSV", onclick: function () { csvExport(spiele); } })]));

    if (!spiele.length) wurzel.appendChild(h("p", { class: "leer", text: "Noch keine Spiele in dieser Saison." }));

    spiele.forEach(function (sp) { wurzel.appendChild(eintrag(sp)); });

    wurzel.appendChild(h("p", { class: "meta mg-fuss", text:
      "km = einfache Strecke Wohnung → Halle (Straßenkilometer, wenn berechnet; sonst Luftlinie × 1,3). " +
      "Vergütung nach ESRW-Gebührenordnung (" + ((gebuehren && gebuehren.stand) || "?") + "): " +
      "+20 % bei Spielbeginn bis 09:14 oder ab 21:46 Uhr, Zuschlag für landesverbandsübergreifenden " +
      "Einsatz in RL West / Frauen 2. Liga nur auf Anforderung, 50 % bei Ausfall vor Ort. Das ist eine " +
      "Aufstellung für dich oder deinen Steuerberater; was davon steuerlich zählt, sagt sie nicht." }));

    aktualisiereSummen();
  }

  function eintrag(sp) {
    var e = einsaetze[sp.kennung] || {};
    var d = new Date(sp.beginn);
    var vorschlag = kmVorschlag(sp);
    var gebuehr = grundgebuehr(sp);
    var vergangen = d < new Date();

    var km = h("input", { type: "number", step: "0.1", min: "0", inputmode: "decimal",
      value: e.km != null ? e.km : "", placeholder: vorschlag ? "~" + vorschlag.km : "km",
      onchange: function (ev) { speichereEinsatz(sp, { km: zahl(ev.target.value) }); } });
    var verg = h("input", { type: "number", step: "0.5", min: "0", inputmode: "decimal",
      value: e.verguetung != null ? e.verguetung : "", placeholder: gebuehr != null ? "~" + gebuehr : "€",
      onchange: function (ev) { speichereEinsatz(sp, { verguetung: zahl(ev.target.value) }); } });
    var ausl = h("input", { type: "number", step: "0.5", min: "0", inputmode: "decimal",
      value: e.auslagen != null ? e.auslagen : "", placeholder: "€",
      onchange: function (ev) { speichereEinsatz(sp, { auslagen: zahl(ev.target.value) }); } });
    var bez = h("input", { type: "checkbox", onchange: function (ev) { speichereEinsatz(sp, { bezahlt: ev.target.checked }); } });
    bez.checked = !!e.bezahlt;
    var ausf = h("input", { type: "checkbox", onchange: function (ev) { speichereEinsatz(sp, { ausgefallen: ev.target.checked }); } });
    ausf.checked = !!e.ausgefallen;
    var ueb = h("input", { type: "checkbox", onchange: function (ev) { speichereEinsatz(sp, { uebergreifend: ev.target.checked }); } });
    ueb.checked = !!e.uebergreifend;
    var notiz = h("input", { type: "text", value: e.notiz || "", placeholder: "Notiz",
      onchange: function (ev) { speichereEinsatz(sp, { notiz: ev.target.value.trim() || null }); } });

    var b = betragFuer(sp, e);
    return h("div", { class: "spiel mg-eintrag" + (vergangen ? "" : " war"), "data-kennung": sp.kennung.replace(/"/g, "") }, [
      h("div", { class: "kopf" }, [
        h("span", { class: "datum", text: datum(d) + " · " + uhr(d) + " Uhr" + (zeitzuschlag(sp) ? " · +20 %" : "") }),
        h("span", { class: "rolle", text: (sp.rolle || "") + (sp.system >= 3 ? " · " + sp.system + "er" : "") })
      ]),
      h("div", { class: "paarung", text: (sp.liga ? sp.liga + ": " : "") + sp.paarung }),
      h("div", { class: "meta", text: (sp.halle || "Halle unbekannt") +
        (vorschlag && vorschlag.art === "route" ? " · " + vorschlag.km + " km Straße" : "") }),
      h("div", { class: "mg-felder" }, [
        h("label", {}, ["km einfach", km]), h("label", {}, ["Vergütung €", verg]), h("label", {}, ["Auslagen €", ausl])
      ]),
      h("div", { class: "mg-schalter" }, [
        h("label", { class: "mg-check" }, [bez, " bezahlt"]),
        h("label", { class: "mg-check" }, [ausf, " vor Ort ausgefallen"]),
        uebergreifendMoeglich(sp) ? h("label", { class: "mg-check" }, [ueb, " übergreifend"]) : null
      ]),
      h("div", { class: "mg-felder" }, [h("label", { class: "mg-notiz" }, ["Notiz", notiz])]),
      h("div", { class: "meta mg-betrag", text: betragText(sp, e, b) })
    ]);
  }

  return { oeffnen: oeffnen, bereit: bereit, angemeldet: angemeldet };
})();
