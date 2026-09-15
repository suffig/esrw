/* Mitgliederbereich: Konto, Abrechnung, Tauschboerse, Verfuegbarkeit, Push.
 *
 * Spricht direkt aus dem Browser mit Supabase (Datenbank + Login + Storage).
 * Was ein Nutzer sehen und aendern darf, erzwingt die Datenbank ueber Row
 * Level Security - siehe supabase/schema.sql. Der "anon"-Schluessel im
 * Quelltext ist dafuer vorgesehen und oeffnet nichts, was die Regeln nicht
 * erlauben.
 *
 * Wird von index.html erst geladen, wenn der Reiter "Mitglieder" geoeffnet
 * wird oder eine Funktion hinter dem Login gebraucht wird (Tauschoptionen,
 * Hinweis auf fehlende Abrechnungen).
 *
 * Mit "mock": true in supabase.json laeuft eine Attrappe im Browser, um die
 * Oberflaeche ohne Supabase auszuprobieren. Sie speichert in localStorage.
 */

window.Mitglieder = (function () {
  "use strict";

  var wurzel = null, inhalt = null, ctx = null, cfg = null, sb = null, gebuehren = null, pushCfg = null;
  var session = null, profil = null, einsaetze = {}, archivDaten = null;
  var speicherTimer = {}, bereitVersprechen = null, profilVersprechen = null;
  var reiter = "abrechnung", gewaehlteSaison = null, nurOffene = false;

  var SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
  var OSRM = "https://router.project-osrm.org/route/v1/driving/";
  var WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  var MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

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
  function ikone(name) { return ctx && ctx.ikone ? ctx.ikone(name) : document.createTextNode(""); }

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
  function datumLang(d) { return WT[d.getDay()] + ". " + d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  function isoTag(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function kennungVon(s) { return s.beginn + "|" + s.paarung; }
  function sicher(s) { return String(s).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80); }

  function kmZwischen(a, b) {
    var r = 6371, p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180;
    var dp = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180;
    var x = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * r * Math.asin(Math.sqrt(x));
  }

  function meldung(text, art) {
    if (window.zeigeToast) window.zeigeToast(text, art);
    if (!wurzel) return;
    // Fehler bleiben zusaetzlich oben stehen, bis etwas anderes passiert
    var m = wurzel.querySelector(".mg-meldung");
    if (!m) { m = h("div", { class: "mg-meldung" }); wurzel.insertBefore(m, wurzel.firstChild); }
    m.textContent = art === "warn" ? text : "";
    m.className = "mg-meldung " + (art || "");
    m.hidden = art !== "warn" || !text;
  }
  function kurzMeldung(text, art) { meldung(text, art); }

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

  function rolleBadge(rolle) { return h("span", { class: "rolle " + (rolle || ""), text: rolle || "" }); }

  // --------------------------------------------------------- Attrappe
  //
  // Bildet die Aufrufe nach, die dieses Modul benutzt (Auth, Tabellen mit
  // Filtern, Storage). Passwoerter liegen im Klartext im localStorage -
  // eine Attrappe zum Ausprobieren der Oberflaeche, kein Login.

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
      var filter = [], sortierung = null, aktion = null, nutz = null, opt = null, limitN = null;
      function passt(z) {
        return filter.every(function (f) {
          var v = z[f[0]];
          switch (f[1]) {
            case "eq": return v === f[2];
            case "neq": return v !== f[2];
            case "in": return f[2].indexOf(v) >= 0;
            case "gte": return v >= f[2];
            case "lte": return v <= f[2];
            case "lt": return v < f[2];
          }
          return true;
        });
      }
      function ausfuehren() {
        var zeilen = lies(name, []);
        if (!aktion || aktion === "select") {
          var t = zeilen.filter(passt);
          if (sortierung) t.sort(function (a, b) { var x = a[sortierung[0]], y = b[sortierung[0]]; return (x < y ? -1 : x > y ? 1 : 0) * (sortierung[1] ? 1 : -1); });
          if (limitN) t = t.slice(0, limitN);
          return { data: t, error: null };
        }
        if (aktion === "insert" || aktion === "upsert") {
          var liste = Array.isArray(nutz) ? nutz : [nutz], raus = [];
          liste.forEach(function (o) {
            var i = -1;
            if (aktion === "upsert") {
              var felder = name === "profile" ? ["id"] : opt && opt.onConflict ? opt.onConflict.split(",") : ["id"];
              i = zeilen.findIndex(function (z) { return felder.every(function (f) { return z[f.trim()] === o[f.trim()]; }); });
            }
            var neu = Object.assign({}, i >= 0 ? zeilen[i] : { id: o.id || ("m" + Date.now() + Math.random().toString(36).slice(2)), angelegt: new Date().toISOString() },
                                    o, { geaendert: new Date().toISOString() });
            if (i >= 0) zeilen[i] = neu; else zeilen.push(neu);
            raus.push(neu);
          });
          schreib(name, zeilen);
          return { data: raus, error: null };
        }
        if (aktion === "update") {
          var geaendert = [];
          zeilen.forEach(function (z) { if (passt(z)) { Object.assign(z, nutz, { geaendert: new Date().toISOString() }); geaendert.push(z); } });
          schreib(name, zeilen);
          return { data: geaendert, error: null };
        }
        if (aktion === "delete") {
          schreib(name, zeilen.filter(function (z) { return !passt(z); }));
          return { data: null, error: null };
        }
        return { data: null, error: { message: "unbekannte Aktion" } };
      }
      var api = {
        select: function () { if (!aktion) aktion = "select"; return api; },
        eq: function (f, w) { filter.push([f, "eq", w]); return api; },
        neq: function (f, w) { filter.push([f, "neq", w]); return api; },
        in: function (f, w) { filter.push([f, "in", w]); return api; },
        gte: function (f, w) { filter.push([f, "gte", w]); return api; },
        lte: function (f, w) { filter.push([f, "lte", w]); return api; },
        lt: function (f, w) { filter.push([f, "lt", w]); return api; },
        order: function (f, o) { sortierung = [f, !(o && o.ascending === false)]; return api; },
        limit: function (n) { limitN = n; return api; },
        insert: function (o) { aktion = "insert"; nutz = o; return api; },
        upsert: function (o, op) { aktion = "upsert"; nutz = o; opt = op; return api; },
        update: function (o) { aktion = "update"; nutz = o; return api; },
        delete: function () { aktion = "delete"; return api; },
        maybeSingle: function () { return Promise.resolve().then(ausfuehren).then(function (r) { return { data: (r.data || [])[0] || null, error: r.error }; }); },
        then: function (ok, nein) { return Promise.resolve().then(ausfuehren).then(ok, nein); }
      };
      return api;
    }

    function ablage(bucket) {
      return {
        upload: function (pfad, datei) {
          return new Promise(function (ok) {
            if (datei.size > 1500000) return ok({ data: null, error: { message: "Attrappe: Datei über 1,5 MB" } });
            var r = new FileReader();
            r.onload = function () { try { localStorage.setItem("mock_datei_" + bucket + "/" + pfad, r.result); ok({ data: { path: pfad }, error: null }); }
                                     catch (e) { ok({ data: null, error: { message: "Speicher im Browser voll" } }); } };
            r.onerror = function () { ok({ data: null, error: { message: "Datei nicht lesbar" } }); };
            r.readAsDataURL(datei);
          });
        },
        createSignedUrl: function (pfad) {
          return Promise.resolve({ data: { signedUrl: localStorage.getItem("mock_datei_" + bucket + "/" + pfad) || "" }, error: null });
        },
        remove: function (pfade) {
          pfade.forEach(function (p) { localStorage.removeItem("mock_datei_" + bucket + "/" + p); });
          return Promise.resolve({ data: pfade, error: null });
        }
      };
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
      from: tabelle,
      storage: { from: ablage }
    };
  }

  // ------------------------------------------------------------ Start
  //
  // bereit(): Verbindung und Sitzung herstellen, ohne etwas zu zeichnen.
  // Wird auch von index.html gebraucht, um Funktionen hinter dem Login
  // freizugeben.

  function bereit(kontext) {
    if (kontext) ctx = kontext;
    if (bereitVersprechen) return bereitVersprechen;
    bereitVersprechen = Promise.all([holeJson("supabase.json", {}), holeJson("gebuehren.json", null), holeJson("push.json", {})])
      .then(function (r) {
        cfg = r[0] || {}; gebuehren = r[1]; pushCfg = r[2] || {};
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
          if (!s) { profil = null; profilVersprechen = null; einsaetze = {}; if (wurzel) zeigeAnmeldung(); }
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

  function ladeProfil() {
    if (!session) return Promise.resolve(null);
    if (profil && profil.id === session.user.id) return Promise.resolve(profil);
    if (profilVersprechen) return profilVersprechen;
    profilVersprechen = sb.from("profile").select("*").eq("id", session.user.id).maybeSingle()
      .then(function (r) { if (r.error) throw r.error; profil = r.data; return profil; });
    return profilVersprechen;
  }

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
    wurzel.appendChild(h("div", { class: "melde karte" }, [
      h("h4", { text: "Mitgliederbereich noch nicht eingerichtet" }),
      h("p", { text: "Hier kommen Konto, Abrechnung, Tauschbörse und Push hin. Dafür muss der " +
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

    wurzel.appendChild(h("div", { class: "melde karte" }, [
      form, wechsel,
      h("p", { class: "meta", text: "Konto und Daten liegen bei Supabase" +
        (sb && sb._attrappe ? " – hier gerade als Attrappe im Browser, nichts geht raus." : ". Jeder sieht nur seine eigenen Einträge; Tauschbörse und Verfügbarkeiten sehen alle Mitglieder.") })
    ]));
    wurzel.appendChild(h("div", { class: "melde karte" }, [
      h("h4", { text: "Was gibt es hier?" }),
      h("p", { text: "Abrechnung mit Strecken und Gebührenordnung, Belege, CSV für die Steuer · " +
        "Tauschbörse für Spiele, die du abgeben musst · Tage, an denen du nicht kannst oder gern pfeifen würdest · " +
        "echte Push-Nachrichten bei neuen Einteilungen." })
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
    if (/does not exist|schema cache/i.test(m)) return "Die Datenbank kennt eine Tabelle noch nicht – bitte supabase/schema.sql erneut ausführen (Anleitung Schritt 10).";
    return m || "Unbekannter Fehler.";
  }

  // --------------------------------------------------------- Nach Login

  function nachLogin() {
    leeren(wurzel);
    wurzel.appendChild(h("p", { class: "meta", text: "Lade dein Profil …" }));
    return ladeProfil()
      .then(function () {
        if (!profil || !profil.slug) return zeigeEinrichtung();
        return ladeEinsaetze().then(function () { rahmen(); zeigeReiter(reiter); });
      })
      .catch(function (e) { meldung("Profil konnte nicht geladen werden: " + fehlerText(e), "warn"); });
  }

  function abmelden() {
    sb.auth.signOut().then(function () { session = null; profil = null; profilVersprechen = null; einsaetze = {}; zeigeAnmeldung(); });
  }

  // Kopf mit Name und Unterreitern; der Inhalt darunter wechselt.
  function rahmen() {
    leeren(wurzel);
    wurzel.appendChild(h("div", { class: "profilzeile karte" }, [
      h("span", {}, [h("b", { text: profil.name || profil.slug }), h("small", { text: session.user.email })]),
      h("button", { type: "button", class: "textknopf", text: "Abmelden", onclick: abmelden })
    ]));
    var leiste = h("div", { class: "mg-untertabs" });
    [["abrechnung", "Abrechnung"], ["tausch", "Tauschbörse"], ["frei", "Verfügbarkeit"], ["notizen", "Notizen"], ["konto", "Konto"]].forEach(function (t) {
      leiste.appendChild(h("button", { type: "button", "data-reiter": t[0], text: t[1], onclick: function () { zeigeReiter(t[0]); } }));
    });
    wurzel.appendChild(leiste);
    inhalt = h("div", { class: "mg-inhalt" });
    wurzel.appendChild(inhalt);
  }

  function zeigeReiter(name) {
    reiter = name;
    if (!inhalt) rahmen();
    Array.prototype.forEach.call(wurzel.querySelectorAll(".mg-untertabs button"), function (b) {
      b.classList.toggle("aktiv", b.getAttribute("data-reiter") === name);
    });
    leeren(inhalt);
    if (name === "abrechnung") zeigeAbrechnung();
    else if (name === "tausch") zeigeTausch();
    else if (name === "frei") zeigeVerfuegbarkeit();
    else if (name === "notizen") zeigeNotizen();
    else zeigeKonto();
  }

  // --------------------------------------------------------- Einrichtung

  function zeigeEinrichtung(zurueck) {
    var ziel = zurueck && inhalt ? inhalt : wurzel;
    leeren(ziel);
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
        if (r.error) { meldung("Speichern fehlgeschlagen: " + fehlerText(r.error), "warn"); return; }
        profil = zeile;
        meldung("Gespeichert.", "gut");
        ladeEinsaetze().then(function () { rahmen(); zeigeReiter(zurueck ? "konto" : "abrechnung"); });
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
      zurueck ? h("button", { type: "button", class: "mg-neben", text: "Zurück", onclick: function () { zeigeReiter("konto"); } }) : null
    ]);
    ziel.appendChild(h("div", { class: "melde karte" }, [form]));
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
    if (gesp && gesp.art === "route" && gesp.minuten) return Promise.resolve(gesp);
    if (!profil || profil.heimat_lat == null) return Promise.resolve(null);
    var ziel = ctx.daten.hallen && ctx.daten.hallen[halle];
    if (!ziel) return Promise.resolve(null);
    var url = OSRM + profil.heimat_lon + "," + profil.heimat_lat + ";" + ziel[1] + "," + ziel[0] + "?overview=false";
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (d.code !== "Ok" || !d.routes || !d.routes[0]) throw new Error(d.code || "keine Route");
      return { km: Math.round(d.routes[0].distance / 100) / 10, minuten: Math.round(d.routes[0].duration / 60),
               art: "route", am: new Date().toISOString() };
    }).catch(function () {
      var l = luftlinie(halle);
      return l == null ? null : { km: l, art: "luftlinie", am: new Date().toISOString() };
    });
  }

  function streckenFuer(hallen) {
    // Nacheinander, mit kleiner Pause - der Demoserver ist ein Gemeingut.
    var offen = hallen.filter(function (x) { var g = streckeGespeichert(x); return x && !(g && g.art === "route" && g.minuten); });
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

  function ladeArchiv() {
    return archivDaten ? Promise.resolve(archivDaten)
      : ctx.hole("archiv.json").catch(function () { return { personen: {}, saisons: [] }; })
        .then(function (a) { archivDaten = a; return a; });
  }

  function saisonen() {
    var liste = ((archivDaten && archivDaten.saisons) || []).slice();
    if (ctx.daten.saison && liste.indexOf(ctx.daten.saison) < 0) liste.push(ctx.daten.saison);
    return liste.sort().reverse();
  }

  // Alle Spiele der Person ueber alle Saisons, Archiv und aktuelle Daten
  // zusammengelegt; neueste zuerst.
  function alleSpiele() {
    var person = ctx.personMit(profil.slug);
    var karte = {};
    var archiv = (archivDaten && archivDaten.personen && archivDaten.personen[profil.slug]) || [];
    archiv.forEach(function (s) {
      karte[kennungVon(s)] = { beginn: s.beginn, liga: s.liga, paarung: s.paarung, halle: s.halle, rolle: s.rolle, system: s.system, saison: s.saison || ctx.daten.saison };
    });
    if (person) person.spiele.forEach(function (s) {
      var alt = karte[kennungVon(s)];
      karte[kennungVon(s)] = { beginn: s.beginn, liga: s.liga, paarung: s.paarung, halle: s.halle, rolle: s.rolle, system: s.system,
                               saison: (alt && alt.saison) || ctx.daten.saison };
    });
    return Object.keys(karte).map(function (k) { var s = karte[k]; s.kennung = k; return s; })
      .sort(function (a, b) { return a.beginn < b.beginn ? 1 : -1; });
  }
  function saisonSpiele(saison) {
    return alleSpiele().filter(function (s) { return !saison || s.saison === saison; });
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
    }, alt.id ? { id: alt.id } : {}, alt.belege !== undefined ? { belege: alt.belege } : {}, aenderung);
    einsaetze[spiel.kennung] = zeile;
    aktualisiereSummen();
    aktualisiereZeile(spiel);
    clearTimeout(speicherTimer[spiel.kennung]);
    speicherTimer[spiel.kennung] = setTimeout(function () {
      sb.from("einsaetze").upsert(zeile, { onConflict: "user_id,kennung" }).select().then(function (r) {
        if (r.error) { meldung("Speichern fehlgeschlagen: " + fehlerText(r.error), "warn"); return; }
        if (r.data && r.data[0] && r.data[0].id) einsaetze[spiel.kennung].id = r.data[0].id;
        kurzMeldung("Gespeichert ✓", "gut");
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
    var box = h("div", {}, [h("h3", { class: "abschnitt", text: titel })]);
    var z = h("div", { class: "zahlen mg-summen" });
    var einfach = (profil.km_modell || "einfach") === "einfach";
    [["Spiele erfasst", s.spiele],
     [einfach ? "km einfach" : "km gefahren", Math.round(einfach ? s.km : s.km * 2) + " km"],
     ["Fahrtkosten", euro(s.fahrt)], ["Vergütung", euro(s.verg)],
     ["Auslagen", euro(s.ausl)], ["noch offen", s.offen ? euro(s.offenBetrag) : "–"]
    ].forEach(function (p) {
      z.appendChild(h("div", { class: "zahl karte" }, [h("b", { text: String(p[1]) }), h("span", { text: p[0] })]));
    });
    box.appendChild(z);
    return box;
  }

  function aktualisiereSummen() {
    var alt = wurzel && wurzel.querySelector(".mg-summenblock");
    if (!alt) return;
    var spiele = saisonSpiele(gewaehlteSaison), alle = alleSpiele();
    var jahre = [];
    spiele.forEach(function (sp) { var j = new Date(sp.beginn).getFullYear(); if (jahre.indexOf(j) < 0) jahre.push(j); });
    if (!jahre.length) jahre.push(new Date().getFullYear());
    var neu = h("div", { class: "mg-summenblock" }, [summenBox("Saison " + (gewaehlteSaison || ""), summen(spiele))]);
    jahre.sort().reverse().forEach(function (jahr) {
      neu.appendChild(summenBox("Steuerjahr " + jahr, summen(alle, function (sp) { return new Date(sp.beginn).getFullYear() === jahr; })));
    });
    alt.parentNode.replaceChild(neu, alt);
  }

  function aktualisiereZeile(spiel) {
    var el = wurzel.querySelector('[data-kennung="' + spiel.kennung.replace(/"/g, "") + '"] .mg-betrag');
    if (!el) return;
    var e = einsaetze[spiel.kennung];
    el.textContent = betragText(spiel, e, betragFuer(spiel, e));
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
    var zeilen = [["Saison", "Datum", "Uhrzeit", "Liga", "Begegnung", "Halle", "Rolle", "System",
                   "km einfach", "km gefahren", "Kilometermodell", "Satz €/km", "Fahrtkosten",
                   "Grundgebühr", "Zuschlag Uhrzeit", "Zuschlag übergreifend", "Ausfall vor Ort", "Vergütung",
                   "Auslagen", "Belege", "bezahlt", "Notiz"]];
    var dez = function (n) { return n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","); };
    spiele.forEach(function (sp) {
      var e = einsaetze[sp.kennung] || {};
      var d = new Date(sp.beginn);
      var b = betragFuer(sp, e);
      zeilen.push([
        sp.saison || "", d.toLocaleDateString("de-DE"), uhr(d), sp.liga || "", sp.paarung || "", sp.halle || "", sp.rolle || "",
        sp.system || "", dez(e.km), dez(e.km != null ? e.km * 2 : null), einfach ? "einfache Strecke" : "hin und zurück",
        dez(einfach ? profil.satz_einfach : profil.satz_hinrueck), dez(e.km != null ? fahrtkosten(e) : null),
        dez(b.grund), dez(b.zeit || null), dez(b.ueber || null), e.ausgefallen ? "ja" : "", dez(b.betrag),
        dez(e.auslagen), (e.belege || []).length || "", e.bezahlt ? "ja" : "nein", e.notiz || ""
      ]);
    });
    var text = zeilen.map(function (z) {
      return z.map(function (f) { return '"' + String(f).replace(/"/g, '""') + '"'; }).join(";");
    }).join("\r\n");
    var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Abrechnung_" + (gewaehlteSaison || "alle").replace("/", "-") + "_" + profil.slug + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function zeigeAbrechnung() {
    leeren(inhalt);
    inhalt.appendChild(h("p", { class: "meta", text: "Lade Saison …" }));
    ladeArchiv().then(function () {
      if (!gewaehlteSaison || saisonen().indexOf(gewaehlteSaison) < 0) gewaehlteSaison = ctx.daten.saison || saisonen()[0] || null;
      rendereAbrechnung();
    });
  }

  function rendereAbrechnung() {
    leeren(inhalt);
    var spiele = saisonSpiele(gewaehlteSaison);

    var saisonWahl = h("select", { class: "mg-select", onchange: function (ev) { gewaehlteSaison = ev.target.value; rendereAbrechnung(); } },
      saisonen().map(function (s) { var o = h("option", { value: s, text: "Saison " + s }); if (s === gewaehlteSaison) o.selected = true; return o; }));
    var offenSchalter = h("input", { type: "checkbox", onchange: function (ev) { nurOffene = ev.target.checked; rendereAbrechnung(); } });
    offenSchalter.checked = nurOffene;
    inhalt.appendChild(h("div", { class: "mg-form" }, [saisonWahl,
      h("div", { class: "schalterzeile" }, [
        h("label", { class: "schalter" }, [offenSchalter, " nur unbezahlte / unvollständige"]),
        h("button", { type: "button", class: "textknopf", text: "Drucken", onclick: function () { window.print(); } })
      ])]));

    inhalt.appendChild(h("div", { class: "mg-summenblock" }));

    var hallen = []; spiele.forEach(function (sp) { if (sp.halle && hallen.indexOf(sp.halle) < 0) hallen.push(sp.halle); });
    var strecken = h("button", { type: "button", text: "Strecken berechnen", onclick: function () {
      if (!profil.heimat_lat) { meldung("Erst unter Konto → Einstellungen die Heimatadresse setzen und suchen lassen.", "warn"); return; }
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
    inhalt.appendChild(h("div", { class: "zweit" }, [strecken, gebuehr,
      h("button", { type: "button", text: "CSV", onclick: function () { csvExport(spiele); } })]));

    var liste = spiele;
    if (nurOffene) liste = spiele.filter(function (sp) {
      var e = einsaetze[sp.kennung];
      return !e || !e.bezahlt || e.verguetung == null || e.km == null;
    });
    if (!spiele.length) inhalt.appendChild(h("p", { class: "leer", text: "Keine Spiele in dieser Saison." }));
    else if (!liste.length) inhalt.appendChild(h("p", { class: "leer", text: "Alles abgerechnet und bezahlt ✓" }));

    // Nach Monat gruppiert, mit "alles bezahlt" je Monat
    var monat = null;
    liste.forEach(function (sp) {
      var d = new Date(sp.beginn), m = d.getFullYear() + "-" + d.getMonth();
      if (m !== monat) {
        monat = m;
        var imMonat = spiele.filter(function (x) { var y = new Date(x.beginn); return y.getFullYear() + "-" + y.getMonth() === m; });
        var offen = imMonat.filter(function (x) { var e = einsaetze[x.kennung]; return e && !e.bezahlt && (betragFuer(x, e).betrag || 0) > 0; });
        var kopf = h("div", { class: "mg-monat" }, [h("b", { text: MONATE[d.getMonth()] + " " + d.getFullYear() })]);
        if (offen.length) kopf.appendChild(h("button", { type: "button", class: "textknopf", text: "Monat als bezahlt ✓", onclick: function () {
          offen.forEach(function (x) { speichereEinsatz(x, { bezahlt: true }); });
          rendereAbrechnung();
        } }));
        inhalt.appendChild(kopf);
      }
      inhalt.appendChild(eintrag(sp));
    });

    inhalt.appendChild(h("p", { class: "meta mg-fuss", text:
      "km = einfache Strecke Wohnung → Halle (Straßenkilometer, wenn berechnet; sonst Luftlinie × 1,3). " +
      "Vergütung nach ESRW-Gebührenordnung (" + ((gebuehren && gebuehren.stand) || "?") + "): " +
      "+20 % bei Spielbeginn bis 09:14 oder ab 21:46 Uhr, Zuschlag für landesverbandsübergreifenden " +
      "Einsatz in RL West / Frauen 2. Liga nur auf Anforderung, 50 % bei Ausfall vor Ort. Das ist eine " +
      "Aufstellung für dich oder deinen Steuerberater; was davon steuerlich zählt, sagt sie nicht." }));

    aktualisiereSummen();
  }

  // ---- Belege (Storage-Bucket "belege", Ordner je Nutzer)

  function belegHochladen(sp, datei, zeile) {
    var pfad = session.user.id + "/" + sicher(sp.kennung) + "/" + Date.now() + "_" + sicher(datei.name);
    kurzMeldung("Lade " + datei.name + " hoch …", "");
    return sb.storage.from("belege").upload(pfad, datei, { upsert: false }).then(function (r) {
      if (r.error) { meldung("Beleg konnte nicht gespeichert werden: " + fehlerText(r.error), "warn"); return; }
      var alt = (einsaetze[sp.kennung] && einsaetze[sp.kennung].belege) || [];
      speichereEinsatz(sp, { belege: alt.concat([pfad]) });
      belegeRendern(sp, zeile);
    });
  }

  function belegOeffnen(pfad) {
    sb.storage.from("belege").createSignedUrl(pfad, 300).then(function (r) {
      if (r.error || !r.data || !r.data.signedUrl) { meldung("Beleg nicht abrufbar.", "warn"); return; }
      window.open(r.data.signedUrl, "_blank", "noopener");
    });
  }

  function belegLoeschen(sp, pfad, zeile) {
    if (!confirm("Beleg löschen?")) return;
    sb.storage.from("belege").remove([pfad]).then(function () {
      var alt = (einsaetze[sp.kennung] && einsaetze[sp.kennung].belege) || [];
      speichereEinsatz(sp, { belege: alt.filter(function (p) { return p !== pfad; }) });
      belegeRendern(sp, zeile);
    });
  }

  function belegeRendern(sp, zeile) {
    var box = zeile.querySelector(".mg-belege");
    if (!box) return;
    leeren(box);
    var e = einsaetze[sp.kennung] || {};
    (e.belege || []).forEach(function (pfad) {
      var name = pfad.split("/").pop().replace(/^\d+_/, "");
      box.appendChild(h("span", { class: "chip" }, [
        h("a", { href: "#", text: name, onclick: function (ev) { ev.preventDefault(); belegOeffnen(pfad); } }),
        h("button", { type: "button", class: "textknopf", text: "✕", title: "löschen", onclick: function () { belegLoeschen(sp, pfad, zeile); } })
      ]));
    });
    var datei = h("input", { type: "file", accept: "image/*,application/pdf", onchange: function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (f) belegHochladen(sp, f, zeile);
      ev.target.value = "";
    } });
    box.appendChild(h("label", { class: "mg-datei" }, ["+ Beleg (Foto/PDF)", datei]));
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
    var zeile = h("div", { class: "spiel karte mg-eintrag" + (vergangen ? "" : " war"), "data-kennung": sp.kennung.replace(/"/g, "") }, [
      h("div", { class: "kopfzeile" }, [
        h("span", { class: "datum", text: datum(d) + " · " + uhr(d) + " Uhr" + (zeitzuschlag(sp) ? " · +20 %" : "") }),
        rolleBadge((sp.rolle || "") + (sp.system >= 3 ? " · " + sp.system + "er" : ""))
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
      h("div", { class: "mg-belege" }),
      h("div", { class: "meta mg-betrag", text: betragText(sp, e, b) })
    ]);
    zeile.querySelector(".rolle").className = "rolle " + (sp.rolle || "");
    belegeRendern(sp, zeile);
    return zeile;
  }

  // Fuer den Hinweis auf der Startseite: vergangene Spiele der letzten
  // `tage` Tage ohne eingetragene Verguetung.
  function offeneAbrechnungen(slug, tage) {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) return [];
      return ladeProfil().then(function () {
        if (!profil || profil.slug !== slug) return [];
        return ladeEinsaetze().then(function () {
          var person = ctx.personMit(slug);
          if (!person) return [];
          var grenze = Date.now() - (tage || 21) * 86400000;
          return person.spiele.filter(function (s) {
            if (!s.vergangen || new Date(s.beginn).getTime() < grenze) return false;
            var e = einsaetze[kennungVon(s)];
            return !e || e.verguetung == null;
          }).map(function (s) { return datum(new Date(s.beginn)) + " " + s.paarung; });
        });
      });
    }).catch(function () { return []; });
  }

  // --------------------------------------------------------- Tauschboerse
  //
  // Gesuche sehen alle angemeldeten Mitglieder. Wer helfen kann, meldet
  // "Ich kann" - der Suchende sieht die Namen und regelt den Rest mit dem
  // Obmann, der die Einteilung aendern muss.

  function gesuchAnlegen(spiel, ich) {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) return false;
      return ladeProfil().then(function () {
        if (!profil || !profil.slug) return false;
        var zeile = { user_id: session.user.id, slug: profil.slug, name: profil.name || (ich && ich.name) || profil.slug,
                      kennung: kennungVon(spiel), beginn: spiel.beginn, liga: spiel.liga || null, paarung: spiel.paarung,
                      halle: spiel.halle || null, rolle: spiel.rolle || null, status: "offen" };
        return sb.from("gesuche").upsert(zeile, { onConflict: "user_id,kennung" }).then(function (r) { return !r.error; });
      });
    }).catch(function () { return false; });
  }

  function ladeGesuche() {
    var ab = new Date(Date.now() - 6 * 3600000).toISOString();
    return sb.from("gesuche").select("*").gte("beginn", ab).order("beginn").then(function (r) {
      if (r.error) throw r.error;
      var gesuche = r.data || [];
      if (!gesuche.length) return { gesuche: [], angebote: {} };
      return sb.from("angebote").select("*").in("gesuch_id", gesuche.map(function (g) { return g.id; })).then(function (a) {
        if (a.error) throw a.error;
        var je = {};
        (a.data || []).forEach(function (x) { (je[x.gesuch_id] = je[x.gesuch_id] || []).push(x); });
        return { gesuche: gesuche, angebote: je };
      });
    });
  }

  function zeigeTausch() {
    leeren(inhalt);
    inhalt.appendChild(h("p", { class: "meta", text: "Lade Tauschbörse …" }));
    ladeGesuche().then(function (d) {
      leeren(inhalt);
      var offen = d.gesuche.filter(function (g) { return g.status === "offen"; });
      var erledigt = d.gesuche.filter(function (g) { return g.status !== "offen"; });

      inhalt.appendChild(h("h3", { class: "abschnitt", text: "Offene Gesuche" }));
      if (!offen.length) inhalt.appendChild(h("p", { class: "leer", text: "Gerade sucht niemand Ersatz." }));
      offen.forEach(function (g) { inhalt.appendChild(gesuchKarte(g, d.angebote[g.id] || [])); });

      inhalt.appendChild(h("h3", { class: "abschnitt", text: "Eigenes Gesuch einstellen" }));
      var person = ctx.personMit(profil.slug);
      var kommend = person ? person.spiele.filter(function (s) { return !s.vergangen; }) : [];
      var schonOffen = {}; offen.forEach(function (g) { if (g.user_id === session.user.id) schonOffen[g.kennung] = 1; });
      kommend = kommend.filter(function (s) { return !schonOffen[kennungVon(s)]; });
      if (!kommend.length) {
        inhalt.appendChild(h("p", { class: "meta", text: "Du hast kein kommendes Spiel, das nicht schon drinsteht." }));
      } else {
        var wahl = h("select", { class: "mg-select" }, kommend.map(function (s, i) {
          var dd = new Date(s.beginn);
          return h("option", { value: String(i), text: datum(dd) + " " + uhr(dd) + " · " + (s.liga ? s.liga + " " : "") + s.paarung });
        }));
        var text = h("input", { type: "text", placeholder: "Hinweis (optional), z. B. „Tausch gegen Nachmittagsspiel gern“", maxlength: "200" });
        var knopf = h("button", { type: "button", class: "mg-haupt", text: "In die Tauschbörse stellen", onclick: function () {
          var s = kommend[parseInt(wahl.value, 10)];
          knopf.disabled = true;
          gesuchAnlegen(s, person).then(function (ok) {
            if (!ok) { knopf.disabled = false; meldung("Konnte nicht eingestellt werden.", "warn"); return; }
            if (text.value.trim()) return sb.from("gesuche").update({ text: text.value.trim() }).eq("user_id", session.user.id).eq("kennung", kennungVon(s)).then(function () {});
          }).then(function () { kurzMeldung("Eingestellt ✓", "gut"); zeigeTausch(); });
        } });
        inhalt.appendChild(h("div", { class: "melde karte" }, [h("div", { class: "mg-form" }, [wahl, text, knopf])]));
      }

      if (erledigt.length) {
        var box = h("details", { class: "karte" }, [h("summary", { text: "Erledigt (" + erledigt.length + ")" })]);
        erledigt.forEach(function (g) { box.appendChild(gesuchKarte(g, d.angebote[g.id] || [])); });
        inhalt.appendChild(box);
      }
      inhalt.appendChild(h("p", { class: "meta mg-fuss", text: "Die Tauschbörse ersetzt nicht die Absprache mit dem Obmann – " +
        "wer übernimmt, muss auf esrw.de eingeteilt werden. Sie zeigt nur, wer könnte." }));
    }).catch(function (e) { leeren(inhalt); inhalt.appendChild(h("p", { class: "achtung", text: "Tauschbörse nicht ladbar: " + fehlerText(e) })); });
  }

  function gesuchKarte(g, angebote) {
    var d = new Date(g.beginn), meins = g.user_id === session.user.id;
    var meinAngebot = angebote.filter(function (a) { return a.user_id === session.user.id; })[0];
    var karte = h("div", { class: "gesuch karte" + (g.status !== "offen" ? " war" : "") }, [
      h("div", { class: "kopfzeile" }, [
        h("span", { class: "datum", text: datum(d) + " · " + uhr(d) + " Uhr" }),
        rolleBadge(g.rolle)
      ]),
      h("div", { class: "paarung", text: (g.liga ? g.liga + ": " : "") + (g.paarung || "") }),
      h("div", { class: "meta", text: (g.halle || "Halle unbekannt") }),
      h("div", { class: "wer", text: (meins ? "Du suchst" : g.name + " sucht") + " Ersatz" + (g.text ? " – „" + g.text + "“" : "") })
    ]);
    var ang = h("div", { class: "angebote" });
    if (angebote.length) {
      ang.appendChild(document.createTextNode("Könnte: "));
      angebote.forEach(function (a) { ang.appendChild(h("span", { text: a.name + (a.text ? " (" + a.text + ")" : "") })); });
    } else if (g.status === "offen") ang.appendChild(document.createTextNode("Noch kein Angebot."));
    karte.appendChild(ang);

    if (g.status !== "offen") return karte;
    var knoepfe = h("div", { class: "zweit" });
    if (meins) {
      knoepfe.appendChild(h("button", { type: "button", text: "Erledigt", onclick: function () {
        sb.from("gesuche").update({ status: "erledigt" }).eq("id", g.id).then(function (r) { if (r.error) meldung(fehlerText(r.error), "warn"); zeigeTausch(); });
      } }));
      knoepfe.appendChild(h("button", { type: "button", text: "Zurückziehen", onclick: function () {
        sb.from("gesuche").delete().eq("id", g.id).then(function () { zeigeTausch(); });
      } }));
    } else if (meinAngebot) {
      knoepfe.appendChild(h("button", { type: "button", text: "Angebot zurückziehen", onclick: function () {
        sb.from("angebote").delete().eq("id", meinAngebot.id).then(function () { zeigeTausch(); });
      } }));
    } else {
      var hinweis = h("input", { type: "text", placeholder: "Kurz dazu (optional), z. B. Handynummer", maxlength: "120" });
      knoepfe.appendChild(h("button", { type: "button", text: "Ich kann übernehmen", onclick: function () {
        sb.from("angebote").insert({ gesuch_id: g.id, user_id: session.user.id, slug: profil.slug, name: profil.name || profil.slug,
                                     text: hinweis.value.trim() || null })
          .then(function (r) { if (r.error) { meldung(fehlerText(r.error), "warn"); return; } kurzMeldung("Gemeldet ✓", "gut"); zeigeTausch(); });
      } }));
      karte.appendChild(h("div", { class: "mg-form" }, [hinweis]));
    }
    karte.appendChild(knoepfe);
    return karte;
  }

  // ------------------------------------------------------ Verfuegbarkeit
  //
  // 'nein' = an dem Tag nicht verfuegbar, 'gern' = haette gern ein Spiel.
  // Fliesst in die Tauschoptionen ein (gesperrte Kollegen fallen raus,
  // freigemeldete rutschen nach oben).

  function sperrenAm(beginn) {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) return {};
      return sb.from("sperren").select("slug,status").eq("datum", isoTag(new Date(beginn))).then(function (r) {
        var m = {};
        (r.data || []).forEach(function (z) { m[z.slug] = z.status; });
        return m;
      });
    }).catch(function () { return {}; });
  }

  function zeigeVerfuegbarkeit() {
    leeren(inhalt);
    inhalt.appendChild(h("p", { class: "meta", text: "Lade Verfügbarkeiten …" }));
    var heute = isoTag(new Date());
    sb.from("sperren").select("*").eq("user_id", session.user.id).gte("datum", heute).order("datum").then(function (r) {
      if (r.error) throw r.error;
      var meine = {};
      (r.data || []).forEach(function (z) { meine[z.datum] = z; });
      leeren(inhalt);
      inhalt.appendChild(h("p", { class: "meta", text: "Trag ein, wann du nicht kannst oder gern ein Spiel hättest. " +
        "Kollegen sehen das in ihren Tauschoptionen; der Obmann sieht es nicht automatisch." }));

      // Meine Spiele je Tag, zur Orientierung
      var person = ctx.personMit(profil.slug), spieleAm = {};
      if (person) person.spiele.forEach(function (s) { if (!s.vergangen) spieleAm[isoTag(new Date(s.beginn))] = (spieleAm[isoTag(new Date(s.beginn))] || 0) + 1; });

      // Naechste 10 Wochenenden plus alles, was schon eingetragen ist
      var tage = [], d = new Date(); d.setHours(12, 0, 0, 0);
      for (var i = 0; i < 70; i++) {
        var t = new Date(d.getTime() + i * 86400000);
        if (t.getDay() === 0 || t.getDay() === 6) tage.push(isoTag(t));
      }
      Object.keys(meine).forEach(function (k) { if (tage.indexOf(k) < 0) tage.push(k); });
      tage.sort();

      var liste = h("div", { class: "karte", style: "padding:4px 14px" });
      tage.forEach(function (tag) { liste.appendChild(sperreZeile(tag, meine[tag] && meine[tag].status, spieleAm[tag] || 0)); });
      inhalt.appendChild(liste);

      var eingabe = h("input", { type: "date", min: heute });
      var art = h("select", { class: "mg-select" }, [h("option", { value: "nein", text: "kann nicht" }), h("option", { value: "gern", text: "hätte gern ein Spiel" })]);
      inhalt.appendChild(h("div", { class: "melde karte" }, [h("div", { class: "mg-form" }, [
        h("h4", { text: "Anderer Tag" }),
        h("div", { class: "mg-zeile" }, [eingabe, art]),
        h("button", { type: "button", class: "mg-haupt", text: "Eintragen", onclick: function () {
          if (!eingabe.value) return;
          sperreSetzen(eingabe.value, art.value).then(zeigeVerfuegbarkeit);
        } })
      ])]));
    }).catch(function (e) { leeren(inhalt); inhalt.appendChild(h("p", { class: "achtung", text: "Nicht ladbar: " + fehlerText(e) })); });
  }

  function sperreSetzen(tag, status) {
    var lauf = status
      ? sb.from("sperren").upsert({ user_id: session.user.id, slug: profil.slug, datum: tag, status: status }, { onConflict: "user_id,datum" })
      : sb.from("sperren").delete().eq("user_id", session.user.id).eq("datum", tag);
    return lauf.then(function (r) { if (r.error) meldung(fehlerText(r.error), "warn"); else kurzMeldung("Gespeichert ✓", "gut"); });
  }

  function sperreZeile(tag, status, spiele) {
    var d = new Date(tag + "T12:00:00");
    var knoepfe = h("div", { class: "mg-untertabs", style: "margin:0" });
    function knopf(wert, text) {
      return h("button", { type: "button", class: (status || "") === wert ? "aktiv" : "", text: text, onclick: function () {
        sperreSetzen(tag, wert).then(zeigeVerfuegbarkeit);
      } });
    }
    knoepfe.appendChild(knopf("", "frei")); knoepfe.appendChild(knopf("nein", "nicht")); knoepfe.appendChild(knopf("gern", "gern"));
    var konflikt = status === "nein" && spiele > 0;
    return h("div", { class: "sperre" }, [
      h("span", {}, [datumLang(d),
        spiele ? h("small", { class: "meta", text: " · " + spiele + (spiele === 1 ? " Spiel" : " Spiele") }) : null,
        konflikt ? h("small", { class: "achtung", style: "display:block;margin-top:4px", text: "Du bist an dem Tag eingeteilt – Abmeldung läuft über den Obmann, hier landet nur der Hinweis für Kollegen." }) : null]),
      knoepfe
    ]);
  }

  // ----------------------------------------------------------------- Konto

  function zeigeKonto() {
    leeren(inhalt);
    inhalt.appendChild(h("div", { class: "melde karte" }, [
      h("h4", { text: "Einstellungen" }),
      h("p", { text: "Name auf esrw.de, Heimatadresse, Kilometermodell und Sätze." }),
      h("button", { type: "button", class: "haupt", text: "Einstellungen öffnen", onclick: function () { zeigeEinrichtung(true); } })
    ]));
    var pushBox = h("div", { class: "melde karte" }, [h("h4", {}, [ikone("i-bell"), " Push-Benachrichtigungen ", h("span", { class: "status", text: "" })]), h("p", { text: "prüfe …" })]);
    inhalt.appendChild(pushBox);
    pushRendern(pushBox);
    var kontaktBox = h("div", { class: "melde karte" }, [h("h4", { text: "Handynummer für Gespannkollegen" }), h("p", { text: "lade …" })]);
    inhalt.appendChild(kontaktBox);
    kontaktRendern(kontaktBox);
    inhalt.appendChild(h("div", { class: "melde karte" }, [
      h("h4", { text: "Daten" }),
      h("p", { text: "Alles, was du hier einträgst, liegt in deinem Supabase-Konto und ist nur für dich lesbar – außer Gesuche, Angebote, Verfügbarkeiten, Hallen-Hinweise, Mitfahrten und eine freigegebene Handynummer, die alle Mitglieder sehen. " +
        "Export: Abrechnung → CSV. Konto löschen: E-Mail an den Betreiber." })
    ]));
  }

  // ---- Web Push: Abo im Browser anlegen und Endpoint in push_abos ablegen.

  function b64ZuBytes(s) {
    var p = "=".repeat((4 - s.length % 4) % 4);
    var roh = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
    var a = new Uint8Array(roh.length);
    for (var i = 0; i < roh.length; i++) a[i] = roh.charCodeAt(i);
    return a;
  }

  function pushRendern(box) {
    var status = box.querySelector(".status"), text = box.querySelector("p");
    function setze(lage, txt, knopfText, aktion) {
      status.className = "status " + (lage === "an" ? "an" : "aus");
      status.textContent = lage === "an" ? "an" : lage === "aus" ? "aus" : "nicht möglich";
      text.textContent = txt;
      var alt = box.querySelector("button"); if (alt) alt.remove();
      if (knopfText) box.appendChild(h("button", { type: "button", class: "haupt", text: knopfText, onclick: aktion }));
    }
    var alsApp = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (!pushCfg || !pushCfg.public_key) return setze("nein", "Push ist vom Betreiber noch nicht eingerichtet (Anleitung Schritt 11).");
    if (!("PushManager" in window) || !("serviceWorker" in navigator) || !("Notification" in window)) {
      return setze("nein", alsApp ? "Dieser Browser kann kein Web Push." : "Dafür muss die Seite auf dem Home-Bildschirm liegen: in Safari Teilen → Zum Home-Bildschirm, dann hier wieder öffnen.");
    }
    if (Notification.permission === "denied") return setze("aus", "Mitteilungen sind abgelehnt. Wieder erlauben in Einstellungen → Apps → Einteilungen → Mitteilungen.");
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (abo) {
        if (abo) {
          setze("an", "Dieses Gerät bekommt eine Nachricht, wenn für " + (profil.name || "dich") + " eine Einteilung dazukommt, sich ändert oder wegfällt – auch bei geschlossener App.",
                "Push ausschalten", function () { pushAus(abo).then(function () { pushRendern(box); }); });
          // Abo sicherheitshalber (wieder) eintragen, falls die Zeile fehlt
          pushEintragen(abo).catch(function () {});
        } else {
          setze("aus", "Echte Push-Nachricht bei neuen Einteilungen, auch wenn die App zu ist.",
                "Push einschalten", function () {
                  pushAn(reg).then(function () { pushRendern(box); })
                    .catch(function (e) { meldung("Push konnte nicht eingeschaltet werden: " + (e.message || e), "warn"); });
                });
        }
      });
    }).catch(function () { setze("nein", "Service Worker nicht bereit – Seite neu laden."); });
  }

  function pushEintragen(abo) {
    var j = abo.toJSON();
    var geraet = (navigator.userAgent.match(/iPhone|iPad|Android|Windows|Macintosh/) || ["?"])[0];
    return sb.from("push_abos").upsert({ user_id: session.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, geraet: geraet },
                                       { onConflict: "endpoint" })
      .then(function (r) { if (r.error) throw r.error; });
  }

  function pushAn(reg) {
    return Notification.requestPermission().then(function (erg) {
      if (erg !== "granted") throw new Error("Mitteilungen nicht erlaubt");
      return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ZuBytes(pushCfg.public_key) });
    }).then(function (abo) {
      return pushEintragen(abo).then(function () { kurzMeldung("Push ist an ✓", "gut"); });
    });
  }

  function pushAus(abo) {
    return sb.from("push_abos").delete().eq("endpoint", abo.endpoint).then(function () { return abo.unsubscribe(); })
      .then(function () { kurzMeldung("Push ist aus.", ""); }).catch(function () {});
  }

  // ---- Gespann-Kontakt: freiwillig freigegebene Nummer (Tabelle kontakte)

  function telefonLink(nr) {
    var ziffern = String(nr).replace(/[^\d+]/g, "");
    if (ziffern.indexOf("+") === 0) ziffern = ziffern.slice(1);
    else if (ziffern.indexOf("00") === 0) ziffern = ziffern.slice(2);
    else if (ziffern.indexOf("0") === 0) ziffern = "49" + ziffern.slice(1);
    return { tel: "tel:+" + ziffern, wa: "https://wa.me/" + ziffern };
  }

  function kontaktRendern(box) {
    sb.from("kontakte").select("*").eq("user_id", session.user.id).maybeSingle().then(function (r) {
      var k = r.data;
      leeren(box);
      var telefon = h("input", { type: "tel", placeholder: "z. B. 0171 2345678", value: k ? k.telefon : "", autocomplete: "tel" });
      var hinweis = h("input", { type: "text", placeholder: "Hinweis (optional), z. B. „lieber WhatsApp“", value: k && k.hinweis ? k.hinweis : "", maxlength: "80" });
      var speichern = h("button", { type: "button", class: "haupt", text: k ? "Aktualisieren" : "Freigeben", onclick: function () {
        var nr = telefon.value.trim();
        if (!nr) { meldung("Bitte eine Nummer eintragen.", "warn"); return; }
        sb.from("kontakte").upsert({ user_id: session.user.id, slug: profil.slug, name: profil.name || profil.slug, telefon: nr, hinweis: hinweis.value.trim() || null }, { onConflict: "user_id" })
          .then(function (r2) { if (r2.error) { meldung(fehlerText(r2.error), "warn"); return; } cache.kontakte = {}; kurzMeldung("Nummer freigegeben ✓", "gut"); kontaktRendern(box); });
      } });
      box.appendChild(h("h4", { text: "Handynummer für Gespannkollegen" }));
      box.appendChild(h("p", { text: (k ? "Freigegeben. " : "") + "Wer sie freigibt, bekommt auf der Spielkarte bei den Kollegen „Anrufen“ und „WhatsApp“ – und umgekehrt. " +
        "Sichtbar für alle angemeldeten Mitglieder, jederzeit zurückziehbar." }));
      box.appendChild(h("div", { class: "mg-form" }, [telefon, hinweis]));
      box.appendChild(speichern);
      if (k) box.appendChild(h("button", { type: "button", class: "mg-neben", style: "margin-top:8px;width:100%", text: "Nummer zurückziehen", onclick: function () {
        sb.from("kontakte").delete().eq("user_id", session.user.id).then(function () { cache.kontakte = {}; kurzMeldung("Zurückgezogen.", ""); kontaktRendern(box); });
      } }));
    }).catch(function (e) { leeren(box); box.appendChild(h("p", { class: "achtung", text: fehlerText(e) })); });
  }

  // ---- Extras je Spielkarte: Hallen-Wiki, Kontakte, Fahrgemeinschaft, Notiz
  //
  // Die Startseite ruft extrasLaden() einmal fuer alle sichtbaren Spiele
  // (vier Abfragen) und danach spielExtras() je Karte. Alles im Cache, bis
  // sich etwas aendert.

  var cache = { hallen: {}, kontakte: {}, mitfahrten: {}, notizen: {}, geladen: {} };

  function extrasLaden(spiele) {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) return false;
      return ladeProfil().then(function () {
        var hallen = [], slugs = [], kennungen = [];
        spiele.forEach(function (s) {
          if (s.halle && hallen.indexOf(s.halle) < 0 && !cache.geladen["h|" + s.halle]) hallen.push(s.halle);
          (s.gespann || []).forEach(function (g) { if (g.slug && slugs.indexOf(g.slug) < 0) slugs.push(g.slug); });
          var k = kennungVon(s);
          if (kennungen.indexOf(k) < 0 && !cache.geladen["k|" + k]) kennungen.push(k);
        });
        var laeufe = [];
        if (hallen.length) laeufe.push(sb.from("hallen_notizen").select("*").in("halle", hallen).order("angelegt").then(function (r) {
          hallen.forEach(function (x) { cache.hallen[x] = []; cache.geladen["h|" + x] = 1; });
          (r.data || []).forEach(function (z) { (cache.hallen[z.halle] = cache.hallen[z.halle] || []).push(z); });
        }));
        if (slugs.length && !cache.geladen.kontakte) laeufe.push(sb.from("kontakte").select("*").then(function (r) {
          cache.kontakte = {}; (r.data || []).forEach(function (z) { cache.kontakte[z.slug] = z; }); cache.geladen.kontakte = 1;
        }));
        if (kennungen.length) {
          laeufe.push(sb.from("mitfahrten").select("*").in("kennung", kennungen).then(function (r) {
            kennungen.forEach(function (k) { cache.mitfahrten[k] = []; });
            (r.data || []).forEach(function (z) { (cache.mitfahrten[z.kennung] = cache.mitfahrten[z.kennung] || []).push(z); });
          }));
          laeufe.push(sb.from("spielnotizen").select("*").eq("user_id", session.user.id).in("kennung", kennungen).then(function (r) {
            (r.data || []).forEach(function (z) { cache.notizen[z.kennung] = z; });
            kennungen.forEach(function (k) { cache.geladen["k|" + k] = 1; });
          }));
        }
        return Promise.all(laeufe).then(function () { return true; });
      });
    }).catch(function () { return false; });
  }

  function spielExtras(spiel, ziel, istIch) {
    if (!session || !profil) return;
    leeren(ziel);
    var kennung = kennungVon(spiel);
    var hinweise = cache.hallen[spiel.halle] || [];
    var mitfahrten = (cache.mitfahrten[kennung] || []).filter(function (m) { return m.user_id !== session.user.id; });
    var meineMitfahrt = (cache.mitfahrten[kennung] || []).filter(function (m) { return m.user_id === session.user.id; })[0];
    var notiz = cache.notizen[kennung];
    var kontakte = (spiel.gespann || []).map(function (g) { return g.slug && cache.kontakte[g.slug] ? { g: g, k: cache.kontakte[g.slug] } : null; }).filter(Boolean);

    var teile = [];
    if (spiel.halle) teile.push(hinweise.length ? hinweise.length + (hinweise.length === 1 ? " Hallen-Hinweis" : " Hallen-Hinweise") : "Halle");
    if (kontakte.length) teile.push(kontakte.length + " Kontakt" + (kontakte.length === 1 ? "" : "e"));
    if (mitfahrten.length) teile.push(mitfahrten.length + " Mitfahrt");
    if (istIch) teile.push(notiz ? "Notiz ✓" : "Notiz");
    if (!teile.length) return;

    var box = h("details", { class: "tausch extras" }, [h("summary", { text: teile.join(" · ") })]);
    var innen = h("div"); box.appendChild(innen);
    box.addEventListener("toggle", function () {
      if (!box.open || innen.childNodes.length) return;

      // Hallen-Wiki
      if (spiel.halle) {
        innen.appendChild(h("h4", { text: "Hallen-Hinweise · " + spiel.halle }));
        if (!hinweise.length) innen.appendChild(h("p", { class: "meta", text: "Noch nichts eingetragen. Parken, Kabineneingang, Schlüssel, Kantine – was Kollegen wissen sollten." }));
        hinweise.forEach(function (n) {
          var z = h("div", { class: "kandidat" }, [
            h("div", { text: n.text }),
            h("div", { class: "meta" }, [n.name + " · " + new Date(n.angelegt).toLocaleDateString("de-DE"),
              n.user_id === session.user.id ? h("button", { type: "button", class: "textknopf", style: "margin-left:8px", text: "löschen", onclick: function () {
                sb.from("hallen_notizen").delete().eq("id", n.id).then(function () { cache.hallen[spiel.halle] = hinweise.filter(function (x) { return x !== n; }); leeren(innen); box.open = false; spielExtras(spiel, ziel, istIch); ziel.querySelector("details").open = true; });
              } }) : null])
          ]);
          innen.appendChild(z);
        });
        var neu = h("textarea", { rows: "2", placeholder: "Hinweis zur Halle hinzufügen …", maxlength: "500" });
        innen.appendChild(h("div", { class: "mg-form" }, [neu, h("button", { type: "button", class: "anfrage", text: "Hinweis speichern", onclick: function () {
          var t = neu.value.trim(); if (!t) return;
          sb.from("hallen_notizen").insert({ user_id: session.user.id, slug: profil.slug, name: profil.name || profil.slug, halle: spiel.halle, text: t }).select()
            .then(function (r) { if (r.error) { meldung(fehlerText(r.error), "warn"); return; }
              (cache.hallen[spiel.halle] = cache.hallen[spiel.halle] || []).push((r.data && r.data[0]) || { user_id: session.user.id, name: profil.name, text: t, angelegt: new Date().toISOString() });
              kurzMeldung("Hinweis gespeichert ✓", "gut"); spielExtras(spiel, ziel, istIch); ziel.querySelector("details").open = true; });
        } })]));
      }

      // Kontakte im Gespann
      if (kontakte.length) {
        innen.appendChild(h("h4", { text: "Gespann" }));
        kontakte.forEach(function (x) {
          var l = telefonLink(x.k.telefon);
          innen.appendChild(h("div", { class: "kandidat" }, [
            h("div", { class: "kandidat-kopf" }, [h("b", { text: x.g.name }),
              h("span", {}, [h("a", { class: "anfrage", href: l.tel, text: "Anrufen" }), " ", h("a", { class: "anfrage", href: l.wa, target: "_blank", rel: "noopener", text: "WhatsApp" })])]),
            h("div", { class: "meta", text: x.k.telefon + (x.k.hinweis ? " · " + x.k.hinweis : "") })
          ]));
        });
      }

      // Fahrgemeinschaft
      if (!spiel.vergangen) {
        innen.appendChild(h("h4", { text: "Fahrgemeinschaft" }));
        mitfahrten.forEach(function (m) {
          innen.appendChild(h("div", { class: "kandidat" }, [h("div", { text: m.text }), h("div", { class: "meta", text: m.name })]));
        });
        if (istIch) {
          var mf = h("input", { type: "text", placeholder: "z. B. „Ich fahre ab Iserlohn, 2 Plätze frei“", value: meineMitfahrt ? meineMitfahrt.text : "", maxlength: "160" });
          innen.appendChild(h("div", { class: "mg-form" }, [mf, h("div", { class: "zweit" }, [
            h("button", { type: "button", text: meineMitfahrt ? "Aktualisieren" : "Anbieten", onclick: function () {
              var t = mf.value.trim(); if (!t) return;
              sb.from("mitfahrten").upsert({ user_id: session.user.id, slug: profil.slug, name: profil.name || profil.slug, kennung: kennung, beginn: spiel.beginn, text: t }, { onConflict: "user_id,kennung" })
                .then(function (r) { if (r.error) { meldung(fehlerText(r.error), "warn"); return; } delete cache.geladen["k|" + kennung]; kurzMeldung("Gespeichert ✓ – Gespannkollegen sehen es auf ihrer Karte.", "gut"); extrasLaden([spiel]).then(function () { spielExtras(spiel, ziel, istIch); }); });
            } }),
            meineMitfahrt ? h("button", { type: "button", text: "Zurückziehen", onclick: function () {
              sb.from("mitfahrten").delete().eq("id", meineMitfahrt.id).then(function () { delete cache.geladen["k|" + kennung]; extrasLaden([spiel]).then(function () { spielExtras(spiel, ziel, istIch); }); });
            } }) : null
          ])]));
        } else if (!mitfahrten.length) innen.appendChild(h("p", { class: "meta", text: "Niemand bietet eine Mitfahrt an." }));
      }

      // Private Notiz
      if (istIch) {
        innen.appendChild(h("h4", { text: "Meine Notiz (nur für mich)" }));
        var ta = h("textarea", { rows: "3", placeholder: "Vorkommnisse, Strafen, Lernpunkte …", maxlength: "4000" });
        ta.value = notiz ? notiz.text : "";
        var timer = null;
        ta.addEventListener("input", function () {
          clearTimeout(timer);
          timer = setTimeout(function () { notizSpeichern(spiel, ta.value.trim()); }, 800);
        });
        innen.appendChild(h("div", { class: "mg-form" }, [ta, h("p", { class: "meta", text: "Speichert von selbst. Alle Notizen: Mitglieder → Notizen." })]));
      }
    });
    ziel.appendChild(box);
  }

  function notizSpeichern(spiel, text) {
    var kennung = kennungVon(spiel);
    var lauf = text
      ? sb.from("spielnotizen").upsert({ user_id: session.user.id, kennung: kennung, beginn: spiel.beginn, liga: spiel.liga || null, paarung: spiel.paarung, halle: spiel.halle || null, text: text }, { onConflict: "user_id,kennung" }).select()
      : sb.from("spielnotizen").delete().eq("user_id", session.user.id).eq("kennung", kennung);
    return lauf.then(function (r) {
      if (r.error) { meldung(fehlerText(r.error), "warn"); return; }
      if (text) cache.notizen[kennung] = (r.data && r.data[0]) || { kennung: kennung, text: text, beginn: spiel.beginn, paarung: spiel.paarung };
      else delete cache.notizen[kennung];
      kurzMeldung("Notiz gespeichert ✓", "gut");
    });
  }

  function zeigeNotizen() {
    leeren(inhalt);
    inhalt.appendChild(h("p", { class: "meta", text: "Lade Notizen …" }));
    sb.from("spielnotizen").select("*").eq("user_id", session.user.id).order("beginn", { ascending: false }).then(function (r) {
      if (r.error) throw r.error;
      var alle = r.data || [];
      leeren(inhalt);
      var suche = h("input", { type: "search", placeholder: "Notizen durchsuchen …" });
      var liste = h("div");
      function rendern() {
        leeren(liste);
        var f = suche.value.trim().toLowerCase();
        var treffer = alle.filter(function (n) { return !f || (n.text + " " + n.paarung + " " + (n.liga || "") + " " + (n.halle || "")).toLowerCase().indexOf(f) >= 0; });
        if (!treffer.length) liste.appendChild(h("p", { class: "leer", text: alle.length ? "Nichts gefunden." : "Noch keine Notizen. Unter jedem eigenen Spiel gibt es „Notiz“." }));
        treffer.forEach(function (n) {
          var d = new Date(n.beginn);
          var ta = h("textarea", { rows: "3", maxlength: "4000" }); ta.value = n.text;
          var timer = null;
          ta.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () {
            notizSpeichern({ beginn: n.beginn, paarung: n.paarung, liga: n.liga, halle: n.halle }, ta.value.trim()).then(function () { n.text = ta.value.trim(); });
          }, 800); });
          liste.appendChild(h("div", { class: "spiel karte" }, [
            h("div", { class: "kopfzeile" }, [h("span", { class: "datum", text: datum(d) + " · " + uhr(d) + " Uhr" }),
              h("button", { type: "button", class: "textknopf", text: "löschen", onclick: function () {
                if (!confirm("Notiz löschen?")) return;
                notizSpeichern({ beginn: n.beginn, paarung: n.paarung }, "").then(function () { alle = alle.filter(function (x) { return x !== n; }); rendern(); });
              } })]),
            h("div", { class: "paarung", text: (n.liga ? n.liga + ": " : "") + n.paarung }),
            h("div", { class: "meta", text: n.halle || "" }),
            h("div", { class: "mg-form", style: "margin-top:8px" }, [ta])
          ]));
        });
      }
      suche.addEventListener("input", rendern);
      inhalt.appendChild(h("div", { class: "mg-form" }, [suche]));
      inhalt.appendChild(liste);
      rendern();
    }).catch(function (e) { leeren(inhalt); inhalt.appendChild(h("p", { class: "achtung", text: "Notizen nicht ladbar: " + fehlerText(e) })); });
  }

  // Fahrzeit zur Halle fuer die Karte oben - berechnet und merkt sie bei Bedarf
  function abfahrt(halle) {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session || !halle) return null;
      return ladeProfil().then(function () {
        if (!profil || profil.heimat_lat == null) return null;
        var g = streckeGespeichert(halle);
        if (g && g.minuten) return g;
        return streckeBerechnen(halle).then(function (s) {
          if (!s || !s.minuten) return null;
          profil.strecken = Object.assign({}, profil.strecken || {}); profil.strecken[halle] = s;
          return sb.from("profile").upsert({ id: session.user.id, strecken: profil.strecken }).then(function () { return s; });
        });
      });
    }).catch(function () { return null; });
  }

  return { oeffnen: oeffnen, bereit: bereit, angemeldet: angemeldet,
           sperrenAm: sperrenAm, gesuchAnlegen: gesuchAnlegen, offeneAbrechnungen: offeneAbrechnungen,
           extrasLaden: extrasLaden, spielExtras: spielExtras, abfahrt: abfahrt };
})();
