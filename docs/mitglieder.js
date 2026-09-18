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
  var angezeigt = null;          // "anmeldung" | "bereich" | "passwort"
  var passwortNeu = false;       // kam ueber den Link aus "Passwort vergessen"
  var ankunft = ankunftLesen();  // was der Mail-Link in der Adresse mitbrachte

  // Rueckkehradresse fuer Mail-Links: ohne Suchteil und ohne Raute, sonst
  // passt sie nicht auf die Freigabeliste in Supabase.
  function rueckkehr() { return location.origin + location.pathname; }

  function ankunftLesen() {
    var werte = {};
    [location.hash.replace(/^#/, ""), location.search.replace(/^\?/, "")].forEach(function (teil) {
      teil.split("&").forEach(function (paar) {
        var i = paar.indexOf("=");
        if (i > 0) try { werte[decodeURIComponent(paar.slice(0, i))] = decodeURIComponent(paar.slice(i + 1).replace(/\+/g, " ")); } catch (e) {}
      });
    });
    if (!werte.access_token && !werte.code && !werte.error && !werte.error_description && !werte.type) return null;
    return werte;
  }
  function ankunftText(a) {
    var m = (a.error_description || a.error || "").toLowerCase();
    if (/expired|invalid/.test(m)) return "Der Link aus der E-Mail ist abgelaufen oder wurde schon benutzt. Melde dich einfach an – falls das nicht geht, unten „Bestätigungsmail erneut senden“.";
    if (m) return "Der Link hat nicht funktioniert: " + (a.error_description || a.error);
    return null;
  }

  // Feste Version mit Pruefsumme: der Browser laedt die Datei nur, wenn sie
  // exakt so aussieht wie beim Einbau. Neue Version = neue Zeile hier.
  var SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js";
  var SUPABASE_SRI = "sha384-iLddHTLokph6Omwoyid4XKxHaWa6w41BnoEj0q5oOrzmYPpHIKt1wyjReA7s//pP";
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
      s.src = url; s.integrity = SUPABASE_SRI; s.crossOrigin = "anonymous";
      s.onload = ok; s.onerror = function () { nein(new Error("Supabase-Bibliothek nicht ladbar (Netz oder Prüfsumme)")); };
      document.head.appendChild(s);
    });
  }

  function holeJson(name, standard) {
    return fetch(name + "?" + Date.now())
      .then(function (r) { return r.ok ? r.json() : standard; })
      .catch(function () { return standard; });
  }

  function rolleBadge(rolle) { return h("span", { class: "rolle " + (rolle || ""), text: rolle || "" }); }
  function skelett(n) {
    var box = h("div", { class: "skelett" });
    for (var i = 0; i < (n || 3); i++) box.appendChild(h("div", { class: "karte skelett-karte" }));
    return box;
  }
  function frei() { return !!(sb && sb._attrappe) || !!(profil && (profil.freigeschaltet || profil.admin)); }
  // Funktion vom Betreiber eingeschaltet? (Schalter kommen aus app.js)
  function fn(k) { return ctx && ctx.funktion ? ctx.funktion(k) : true; }
  var REITER_FUNKTION = { abrechnung: "abrechnung", info: "info", tausch: "tausch", frei: "frei", notizen: "notizen" };

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
        resetPasswordForEmail: function () { return Promise.resolve({ error: null }); },
        resend: function () { return Promise.resolve({ error: null }); },
        updateUser: function (p) {
          var s = sitzung(); if (!s) return Promise.resolve({ error: { message: "nicht angemeldet" } });
          var nutzer = lies("users", {}); if (nutzer[s.user.email] && p.password) nutzer[s.user.email].pw = p.password;
          schreib("users", nutzer); return Promise.resolve({ data: { user: s.user }, error: null });
        }
      },
      from: tabelle,
      storage: { from: ablage },
      rpc: function (name) {
        if (name !== "konto_loeschen") return Promise.resolve({ error: { message: "unbekannt" } });
        var s = sitzung(); if (!s) return Promise.resolve({ error: { message: "nicht angemeldet" } });
        ["profile", "einsaetze", "gesuche", "angebote", "sperren", "push_abos", "hallen_notizen", "kontakte", "mitfahrten", "spielnotizen"].forEach(function (t) {
          schreib(t, lies(t, []).filter(function (z) { return (z.user_id || z.id) !== s.user.id; }));
        });
        var nutzer = lies("users", {}); delete nutzer[s.user.email]; schreib("users", nutzer);
        localStorage.removeItem("mock_session"); melde();
        return Promise.resolve({ data: null, error: null });
      }
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
          var vorher = session;
          session = s;
          if (ereignis === "PASSWORD_RECOVERY") {
            // Link aus "Passwort vergessen": erst neues Passwort, dann der Rest
            passwortNeu = true;
            if (wurzel) zeigePasswortNeu();
            return;
          }
          if (!s) { profil = null; profilVersprechen = null; einsaetze = {}; if (wurzel) zeigeAnmeldung(); }
          else if (!vorher && wurzel && angezeigt === "anmeldung" && !passwortNeu) nachLogin();
          if (s && !vorher && ankunft && (ankunft.type === "signup" || ankunft.type === "email" || ankunft.code)) {
            kurzMeldung("E-Mail bestätigt – willkommen!", "gut"); ankunft = null;
          }
          document.dispatchEvent(new CustomEvent("mg-sitzung", { detail: { angemeldet: !!s } }));
        });
        return sb.auth.getSession().then(function (r) {
          session = r.data.session;
          // Token aus dem Mail-Link ist verarbeitet - raus aus der Adresszeile
          if (/access_token=|type=recovery|error=/.test(location.hash) || /[?&]code=/.test(location.search)) {
            try { history.replaceState(null, "", location.pathname + "#mitglieder"); } catch (e) {}
          }
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
      .then(function (r) { if (r.error) throw r.error; profil = r.data; return profil; })
      .catch(function (e) { profilVersprechen = null; throw e; });   // naechster Versuch darf neu laden
    return profilVersprechen;
  }

  function oeffnen(container, kontext, wunschReiter) {
    wurzel = container; ctx = kontext;
    if (wunschReiter) reiter = wunschReiter;
    leeren(wurzel);
    wurzel.appendChild(skelett(3));
    bereit(kontext)
      .then(function (st) {
        if (!st.eingerichtet) { zeigeKeinBackend(); return; }
        if (passwortNeu) return zeigePasswortNeu();
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

  function zeigePasswortNeu() {
    angezeigt = "passwort";
    leeren(wurzel);
    var pw = h("input", { type: "password", placeholder: "Neues Passwort (mind. 8 Zeichen)", autocomplete: "new-password", minlength: "8", required: "" });
    var pw2 = h("input", { type: "password", placeholder: "Noch einmal", autocomplete: "new-password", minlength: "8", required: "" });
    var knopf = h("button", { type: "submit", class: "mg-haupt", text: "Passwort setzen" });
    wurzel.appendChild(h("div", { class: "melde karte" }, [h("form", { class: "mg-form", onsubmit: function (e) {
      e.preventDefault();
      if (pw.value !== pw2.value) { meldung("Die Passwörter sind nicht gleich.", "warn"); return; }
      knopf.disabled = true;
      sb.auth.updateUser({ password: pw.value }).then(function (r) {
        knopf.disabled = false;
        if (r.error) { meldung(fehlerText(r.error), "warn"); return; }
        passwortNeu = false;
        kurzMeldung("Passwort gesetzt ✓", "gut");
        return sb.auth.getSession().then(function (r2) { session = r2.data.session; return session ? nachLogin() : zeigeAnmeldung(); });
      });
    } }, [h("h4", { text: "Neues Passwort" }), pw, pw2, knopf])]));
  }

  function zeigeAnmeldung(modus) {
    modus = modus || "anmelden";
    angezeigt = "anmeldung";
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
          options: { emailRedirectTo: rueckkehr() } });
      } else if (modus === "vergessen") {
        lauf = sb.auth.resetPasswordForEmail(p.email, { redirectTo: rueckkehr() });
      } else {
        lauf = sb.auth.signInWithPassword(p);
      }
      lauf.then(function (r) {
        knopf.disabled = false;
        if (r.error) {
          meldung(fehlerText(r.error), "warn");
          // Nicht bestaetigt oder Passwort falsch: Weg zur neuen Bestaetigungsmail anbieten
          if (modus === "anmelden" && /not confirmed|invalid login/i.test(r.error.message || "")) erneutSenden.classList.remove("versteckt");
          return;
        }
        if (modus === "vergessen") { zeigeMailHinweis("Passwort zurücksetzen", p.email, "Darin ist ein Link „Neues Passwort setzen“. Er bringt dich hierher zurück, du gibst ein neues Passwort ein – fertig."); return; }
        if (modus === "registrieren" && !(r.data && r.data.session)) {
          var schonDa = r.data && r.data.user && r.data.user.identities && r.data.user.identities.length === 0;
          if (schonDa) { meldung("Für diese E-Mail gibt es schon ein Konto – bitte anmelden oder „Passwort vergessen“.", "warn"); zeigeAnmeldung("anmelden"); return; }
          zeigeMailHinweis("Fast geschafft", p.email, "Darin ist ein Link „E-Mail bestätigen“. Nach dem Antippen bist du hier angemeldet und wählst deinen Namen. Der Betreiber schaltet dich danach für die gemeinsamen Funktionen frei.");
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

    var erneutSenden = h("p", { class: "hinweis warn versteckt" }, [
      h("span", {}, ["Konto noch nicht bestätigt? ",
        h("button", { type: "button", class: "textknopf", text: "Bestätigungsmail erneut senden", onclick: function () {
          var adresse = email.value.trim();
          if (!adresse) { meldung("Erst die E-Mail-Adresse oben eintragen.", "warn"); return; }
          sb.auth.resend({ type: "signup", email: adresse, options: { emailRedirectTo: rueckkehr() } }).then(function (r) {
            if (r.error) meldung(fehlerText(r.error), "warn");
            else zeigeMailHinweis("Neue Bestätigungsmail", adresse, "Der alte Link gilt nicht mehr, bitte den neuen antippen.");
          });
        } })])
    ]);
    if (ankunft && ankunftText(ankunft)) { meldung(ankunftText(ankunft), "warn"); erneutSenden.classList.remove("versteckt"); ankunft = null; }

    var wechsel = h("p", { class: "meta mg-wechsel" }, modus === "anmelden" ? [
      h("button", { type: "button", class: "textknopf", text: "Konto anlegen", onclick: function () { zeigeAnmeldung("registrieren"); } }),
      " · ",
      h("button", { type: "button", class: "textknopf", text: "Passwort vergessen", onclick: function () { zeigeAnmeldung("vergessen"); } })
    ] : [
      h("button", { type: "button", class: "textknopf", text: "Zurück zur Anmeldung", onclick: function () { zeigeAnmeldung("anmelden"); } })
    ]);

    wurzel.appendChild(h("div", { class: "anmelde-kopf" }, [
      h("div", { class: "avatar-gross" }, [ikone("i-lock")]),
      h("h2", { text: modus === "registrieren" ? "Konto anlegen" : "Mitgliederbereich" }),
      h("p", { text: "Tauschbörse, Abrechnung, Ankündigungen, Push – für Schiedsrichter des ESRW." })
    ]));
    wurzel.appendChild(h("div", { class: "melde karte" }, [
      form, erneutSenden, wechsel,
      h("p", { class: "meta", text: "Konto und Daten liegen bei Supabase" +
        (sb && sb._attrappe ? " – hier gerade als Attrappe im Browser, nichts geht raus." : ". Jeder sieht nur seine eigenen Einträge; Tauschbörse und Verfügbarkeiten sehen alle Mitglieder.") })
    ]));
    wurzel.appendChild(h("div", { class: "melde karte" }, [
      h("h4", { text: "Was gibt es hier?" }),
      h("p", { text: "Abrechnung mit Strecken und Gebührenordnung, Belege, CSV für die Steuer · " +
        "Tauschbörse für Spiele, die du abgeben musst · Tage, an denen du nicht kannst oder gern pfeifen würdest · " +
        "echte Push-Nachrichten bei neuen Einteilungen." })
    ]));
  }

  // Nach Registrierung / Passwort vergessen / erneut senden: eine Karte, die
  // sagt, was jetzt passiert - statt einer Zeile, die gleich wieder weg ist.
  function zeigeMailHinweis(titel, adresse, text) {
    angezeigt = "anmeldung";
    leeren(wurzel);
    wurzel.appendChild(h("div", { class: "melde karte" }, [
      h("h4", {}, [ikone("i-bell"), " " + titel]),
      h("p", {}, ["Wir haben eine E-Mail an ", h("b", { text: adresse }), " geschickt. " + text]),
      h("p", { class: "meta", text: "Nichts da? Ein, zwei Minuten warten und den Spam-Ordner prüfen. Absender ist Supabase (noreply@mail.app.supabase.io), Betreff je nach Einstellung „Confirm your signup“ oder „E-Mail bestätigen“." }),
      h("button", { type: "button", class: "haupt", text: "Zur Anmeldung", onclick: function () { zeigeAnmeldung("anmelden"); } })
    ]));
  }

  function fehlerText(err) {
    var m = (err && err.message) || "";
    if (/invalid login/i.test(m)) return "E-Mail oder Passwort stimmt nicht. Falls du das Konto gerade erst angelegt hast: erst den Link in der Bestätigungsmail antippen.";
    if (/already registered|gibt es schon/i.test(m)) return "Für diese E-Mail gibt es schon ein Konto – anmelden oder „Passwort vergessen“.";
    if (/email not confirmed/i.test(m)) return "Das Konto ist noch nicht bestätigt – bitte den Link in der E-Mail antippen (unten kannst du sie erneut anfordern).";
    if (/signup.*disabled|signups not allowed/i.test(m)) return "Registrierung ist beim Betreiber abgeschaltet.";
    if (/over_email_send_rate_limit|rate limit exceeded/i.test(m)) return "Zu viele E-Mails in kurzer Zeit – bitte ein paar Minuten warten.";
    if (/same password|different from the old/i.test(m)) return "Das neue Passwort muss sich vom alten unterscheiden.";
    if (/weak|pwned|leaked|easy to guess/i.test(m)) return "Das Passwort ist zu unsicher oder aus einem bekannten Datenleck – bitte ein anderes wählen.";
    if (/password/i.test(m) && /short|least/i.test(m)) return "Das Passwort ist zu kurz.";
    if (/rate limit/i.test(m)) return "Zu viele Versuche – kurz warten.";
    if (/does not exist|schema cache/i.test(m)) return "Die Datenbank kennt eine Tabelle noch nicht – bitte supabase/schema.sql erneut ausführen (Anleitung Schritt 10).";
    return m || "Unbekannter Fehler.";
  }

  // --------------------------------------------------------- Nach Login

  function nachLogin() {
    angezeigt = "bereich";
    leeren(wurzel);
    wurzel.appendChild(skelett(3));
    return ladeProfil()
      .then(function () {
        if (!profil || !profil.slug) return zeigeEinrichtung();
        document.dispatchEvent(new CustomEvent("mg-profil", { detail: { slug: profil.slug, name: profil.name, einstellungen: profil.einstellungen || null } }));
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
    var initialen = (function (n) { var t = (n || "?").split(","); return (((t[1] || "").trim()[0] || "") + ((t[0] || "").trim()[0] || "")).toUpperCase() || "?"; })(profil.name);
    wurzel.appendChild(h("div", { class: "profilzeile karte" }, [
      h("span", {}, [h("span", { class: "avatar-gross", text: initialen }), h("span", {}, [h("b", { text: profil.name || profil.slug }), h("small", { text: session.user.email })])]),
      h("button", { type: "button", class: "textknopf", text: "Abmelden", onclick: abmelden })
    ]));
    if (!frei()) {
      var sofort = [fn("abrechnung") ? "Abrechnung" : "", fn("notizen") ? "Notizen" : "", fn("push") ? "Push" : ""].filter(Boolean);
      var spaeter = [fn("tausch") ? "Tauschbörse" : "", fn("frei") ? "Verfügbarkeit" : "", fn("hallen") ? "Hallen-Hinweise" : "", fn("gespann") ? "Kontakte" : "", fn("info") ? "Ankündigungen" : ""].filter(Boolean);
      wurzel.appendChild(h("div", { class: "hinweis warn" }, [ikone("i-lock"),
        h("span", { text: "Dein Konto wartet auf die Freischaltung durch den Betreiber." + (sofort.length ? " " + sofort.join(", ") + (sofort.length === 1 ? " geht" : " gehen") + " schon" : "") + (spaeter.length ? "; " + spaeter.join(", ") + (spaeter.length === 1 ? " kommt" : " kommen") + " nach der Freischaltung." : ".") })]));
    }
    var leiste = h("div", { class: "mg-untertabs" });
    var reiterListe = [["abrechnung", "Abrechnung", "i-euro"], ["info", "Info", "i-bell"], ["tausch", "Tausch", "i-swap"], ["frei", "Verfügbar", "i-cal"], ["notizen", "Notizen", "i-note"], ["konto", "Konto", "i-key"]]
      .filter(function (t) { return !REITER_FUNKTION[t[0]] || fn(REITER_FUNKTION[t[0]]); });
    if (profil.admin) reiterListe.push(["admin", "Admin", "i-shield"]);
    reiterListe.forEach(function (t) {
      leiste.appendChild(h("button", { type: "button", "data-reiter": t[0], onclick: function () { zeigeReiter(t[0]); } }, [ikone(t[2]), t[1], h("span", { class: "zaehler versteckt" })]));
    });
    wurzel.appendChild(leiste);
    inhalt = h("div", { class: "mg-inhalt" });
    wurzel.appendChild(inhalt);
    zaehler().then(zaehlerAnzeigen);
  }

  function zeigeReiter(name) {
    reiter = name;
    if (!inhalt) rahmen();
    // Adresse mitfuehren, damit Zurueck und die Leiste unten stimmen
    try { if (location.hash.indexOf("#mitglieder") === 0 && location.hash !== "#mitglieder/" + name) history.replaceState(null, "", "#mitglieder/" + name); } catch (e) {}
    document.dispatchEvent(new CustomEvent("mg-reiter", { detail: { reiter: name } }));
    Array.prototype.forEach.call(wurzel.querySelectorAll(".mg-untertabs button"), function (b) {
      var aktiv = b.getAttribute("data-reiter") === name;
      b.classList.toggle("aktiv", aktiv);
      if (aktiv && b.scrollIntoView) try { b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); } catch (e) {}
    });
    leeren(inhalt);
    if (REITER_FUNKTION[name] && !fn(REITER_FUNKTION[name])) {
      inhalt.appendChild(h("p", { class: "leer", text: "Diese Funktion ist zurzeit abgeschaltet." + (profil.admin ? " Einschalten: Admin → Funktionen." : "") }));
      return;
    }
    if ((name === "tausch" || name === "frei" || name === "info") && !frei()) {
      inhalt.appendChild(h("p", { class: "leer", text: "Erst nach der Freischaltung durch den Betreiber." }));
      return;
    }
    if (name === "abrechnung") zeigeAbrechnung();
    else if (name === "tausch") zeigeTausch();
    else if (name === "frei") zeigeVerfuegbarkeit();
    else if (name === "notizen") zeigeNotizen();
    else if (name === "info") zeigeInfo();
    else if (name === "admin" && profil.admin) zeigeAdmin();
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
    var obmann = h("input", { type: "email", placeholder: "obmann@…", value: p.obmann_email || "", autocomplete: "off" });
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
                    email: session.user.email || null,
                    heimat: heimat.value.trim() || null, heimat_lat: lat, heimat_lon: lon,
                    km_modell: modell.value,
                    satz_einfach: zahl(satzEinfach.value) != null ? zahl(satzEinfach.value) : 0.38,
                    satz_hinrueck: zahl(satzHinrueck.value) != null ? zahl(satzHinrueck.value) : 0.30,
                    km_satz: modell.value === "einfach" ? zahl(satzEinfach.value) : zahl(satzHinrueck.value),
                    obmann_email: obmann.value.trim() || null,
                    // Neue Adresse -> alte Strecken sind wertlos
                    strecken: adresseGeaendert ? {} : (p.strecken || {}) };
      sb.from("profile").upsert(zeile).then(function (r) {
        speichern.disabled = false;
        if (r.error) { meldung("Speichern fehlgeschlagen: " + fehlerText(r.error), "warn"); return; }
        profil = Object.assign({}, profil || {}, zeile);
        document.dispatchEvent(new CustomEvent("mg-profil", { detail: { slug: profil.slug, name: profil.name } }));
        meldung("Gespeichert.", "gut");
        ladeEinsaetze().then(function () { rahmen(); zeigeReiter(zurueck ? "konto" : "abrechnung"); });
      });
    } }, [
      h("h4", { text: zurueck ? "Einstellungen" : "Wer bist du?" }),
      h("label", { text: "Dein Name auf esrw.de" }), auswahl,
      h("label", { text: "Heimatadresse – Startpunkt für die Strecke zur Halle" }),
      h("div", { class: "mg-zeile" }, [heimat, suchen]), koord,
      h("label", { text: "E-Mail des Obmanns (für „Monat per E-Mail“ in der Abrechnung, optional)" }), obmann,
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

  function summenBox(titel, s, monate) {
    var box = h("div", {}, [h("h3", { class: "abschnitt", text: titel })]);
    var z = h("div", { class: "zahlen mg-summen" });
    var einfach = (profil.km_modell || "einfach") === "einfach";
    [["Spiele erfasst", s.spiele, function () { nurOffene = false; rendereAbrechnung(); }],
     [einfach ? "km einfach" : "km gefahren", Math.round(einfach ? s.km : s.km * 2) + " km"],
     ["Fahrtkosten", euro(s.fahrt)], ["Vergütung", euro(s.verg)],
     ["Auslagen", euro(s.ausl)], ["noch offen", s.offen ? euro(s.offenBetrag) : "–", function () { nurOffene = true; rendereAbrechnung(); }]
    ].forEach(function (p) {
      var k = h("div", { class: "zahl karte" + (p[2] ? " tippbar" : "") }, [h("b", { text: String(p[1]) }), h("span", { text: p[0] })]);
      if (p[2]) { k.style.cursor = "pointer"; k.title = "Antippen: Filter"; k.addEventListener("click", p[2]); }
      z.appendChild(k);
    });
    box.appendChild(z);
    if (monate) box.appendChild(monatsBalken(monate));
    return box;
  }

  // Balken je Monat: Verguetung und km
  function monatsBalken(monate) {
    var max = Math.max.apply(null, monate.map(function (m) { return m.verg; }).concat([1]));
    var box = h("details", { class: "tausch", style: "margin-top:8px" }, [h("summary", { text: "Monate im Überblick" })]);
    var innen = h("div", { class: "balken", style: "padding:6px 0 4px" });
    monate.forEach(function (m) {
      if (!m.spiele) return;
      var reihe = h("div", { class: "reihe" });
      var links = h("div", { text: MONATE[m.monat].slice(0, 3) + " · " + m.spiele + (m.spiele === 1 ? " Spiel" : " Spiele") + " · " + Math.round(m.km) + " km" });
      var strich = h("i"); strich.style.width = Math.max(4, Math.round(m.verg / max * 100)) + "%"; links.appendChild(strich);
      reihe.appendChild(links); reihe.appendChild(h("em", { text: euro(m.verg) }));
      innen.appendChild(reihe);
    });
    box.appendChild(innen);
    return box;
  }

  function aktualisiereSummen() {
    var alt = wurzel && wurzel.querySelector(".mg-summenblock");
    if (!alt) return;
    var spiele = saisonSpiele(gewaehlteSaison), alle = alleSpiele();
    var jahre = [];
    spiele.forEach(function (sp) { var j = new Date(sp.beginn).getFullYear(); if (jahre.indexOf(j) < 0) jahre.push(j); });
    if (!jahre.length) jahre.push(new Date().getFullYear());
    // Oben nur das Wesentliche: Vergütung, Fahrtkosten, offen. Der Rest klappt auf.
    var sS = summen(spiele);
    var saldo = h("div", { class: "mg-saldo" });
    [["Vergütung", euro(sS.verg), null, ""], ["Fahrtkosten", euro(sS.fahrt), null, ""],
     ["noch offen", euro(sS.offen ? sS.offenBetrag : 0), function () { nurOffene = !nurOffene; rendereAbrechnung(); }, "offen" + (sS.offen ? "" : " fertig")]
    ].forEach(function (p) {
      var k = h("div", { class: "zahl karte " + p[3] + (p[2] ? " tippbar" : "") }, [h("b", { text: p[1] }), h("span", { text: p[0] + (p[0] === "noch offen" && sS.offen ? " (" + sS.offen + ")" : "") })]);
      if (p[2]) { k.style.cursor = "pointer"; k.title = "Antippen: nur offene"; k.addEventListener("click", p[2]); }
      saldo.appendChild(k);
    });
    var neu = h("div", { class: "mg-summenblock" }, [saldo]);
    var det = h("details", { class: "mg-klapp" }, [h("summary", { text: "Saison " + (gewaehlteSaison || "") + " im Detail und Steuerjahre" })]);
    det.appendChild(summenBox("Saison " + (gewaehlteSaison || ""), sS));
    jahre.sort().reverse().forEach(function (jahr) {
      var monate = [];
      for (var m = 0; m < 12; m++) {
        var s = summen(alle, function (sp) { var d = new Date(sp.beginn); return d.getFullYear() === jahr && d.getMonth() === m; });
        monate.push({ monat: m, spiele: s.spiele, verg: s.verg, km: s.km });
      }
      det.appendChild(summenBox("Steuerjahr " + jahr, summen(alle, function (sp) { return new Date(sp.beginn).getFullYear() === jahr; }), monate));
    });
    neu.appendChild(det);
    alt.parentNode.replaceChild(neu, alt);
  }

  function aktualisiereZeile(spiel) {
    var el = wurzel.querySelector('[data-kennung="' + spiel.kennung.replace(/"/g, "") + '"] .mg-betrag');
    if (!el) return;
    var e = einsaetze[spiel.kennung], b = betragFuer(spiel, e);
    el.textContent = betragText(spiel, e, b);
    var kurz = wurzel.querySelector('[data-kennung="' + spiel.kennung.replace(/"/g, "") + '"] .mg-betrag-kurz');
    if (kurz) kurz.textContent = b.betrag != null ? euro(b.betrag) + (e.km != null ? " · " + e.km + " km" : "") : "Betrag fehlt";
    var karte = wurzel.querySelector('[data-kennung="' + spiel.kennung.replace(/"/g, "") + '"]');
    if (karte) karte.classList.toggle("bezahlt", !!e.bezahlt);
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
    inhalt.appendChild(skelett(3));
    ladeArchiv().then(function () {
      if (!gewaehlteSaison || saisonen().indexOf(gewaehlteSaison) < 0) gewaehlteSaison = ctx.daten.saison || saisonen()[0] || null;
      rendereAbrechnung();
    });
  }

  // Vergangene Spiele ohne Zeile bekommen von selbst eine: km aus der
  // gemerkten Strecke, Verguetung nach Ordnung. Uebrig bleibt "bezahlt".
  function automatischVorbelegen(spiele) {
    var n = 0, jetzt = new Date();
    spiele.forEach(function (sp) {
      if (einsaetze[sp.kennung] || new Date(sp.beginn) > jetzt) return;
      var v = kmVorschlag(sp), g = grundgebuehr(sp);
      if (v == null && g == null) return;
      speichereEinsatz(sp, { km: v && v.art === "route" ? v.km : null, verguetung: g });
      n++;
    });
    if (n) kurzMeldung(n + (n === 1 ? " Spiel" : " Spiele") + " automatisch vorbelegt – nur noch „bezahlt“ abhaken.", "gut");
  }

  function rendereAbrechnung() {
    leeren(inhalt);
    var spiele = saisonSpiele(gewaehlteSaison);
    automatischVorbelegen(spiele);

    var saisonWahl = h("select", { class: "mg-select", onchange: function (ev) { gewaehlteSaison = ev.target.value; rendereAbrechnung(); } },
      saisonen().map(function (s) { var o = h("option", { value: s, text: "Saison " + s }); if (s === gewaehlteSaison) o.selected = true; return o; }));
    var offenSchalter = h("input", { type: "checkbox", onchange: function (ev) { nurOffene = ev.target.checked; rendereAbrechnung(); } });
    offenSchalter.checked = nurOffene;
    inhalt.appendChild(h("div", { class: "mg-form" }, [saisonWahl,
      h("div", { class: "schalterzeile" }, [
        h("label", { class: "schalter" }, [offenSchalter, " nur unbezahlte / unvollständige"])
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
    inhalt.appendChild(h("details", { class: "mg-klapp" }, [h("summary", { text: "Werkzeuge: Strecken, Vergütung, CSV, Fahrtenbuch, Drucken" }),
      h("p", { class: "meta", style: "margin:0 0 6px", text: "Vergangene Spiele bekommen km und Vergütung von selbst – die Knöpfe füllen nur, was noch fehlt." }),
      h("div", { class: "zweit" }, [strecken, gebuehr,
        h("button", { type: "button", text: "CSV", onclick: function () { csvExport(spiele); } }),
        h("button", { type: "button", text: "Fahrtenbuch", onclick: function () { zeigeFahrtenbuch(); } }),
        h("button", { type: "button", text: "Drucken", onclick: function () { window.print(); } })])]));

    var liste = spiele;
    if (nurOffene) liste = spiele.filter(function (sp) {
      var e = einsaetze[sp.kennung];
      // km zaehlt nur als "fehlt", wenn eine Heimatadresse da ist - sonst waere jedes Spiel unvollstaendig
      return !e || !e.bezahlt || e.verguetung == null || (e.km == null && profil.heimat_lat != null);
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
        var rechts = h("span", {});
        rechts.appendChild(h("button", { type: "button", class: "textknopf", text: "per E-Mail", title: "Monatsabrechnung als E-Mail", onclick: function () { monatsMail(imMonat, d); } }));
        if (offen.length) {
          rechts.appendChild(document.createTextNode(" · "));
          rechts.appendChild(h("button", { type: "button", class: "textknopf", text: "Monat als bezahlt ✓", onclick: function () {
            offen.forEach(function (x) { speichereEinsatz(x, { bezahlt: true }); });
            rendereAbrechnung();
          } }));
        }
        kopf.appendChild(rechts);
        inhalt.appendChild(kopf);
      }
      inhalt.appendChild(eintrag(sp));
    });

    inhalt.appendChild(h("details", { class: "mg-klapp" }, [h("summary", { text: "Wie wird gerechnet?" }), h("p", { class: "meta mg-fuss", text:
      "km = einfache Strecke Wohnung → Halle (Straßenkilometer, wenn berechnet; sonst Luftlinie × 1,3). " +
      "Vergütung nach ESRW-Gebührenordnung (" + ((gebuehren && gebuehren.stand) || "?") + "): " +
      "+20 % bei Spielbeginn bis 09:14 oder ab 21:46 Uhr, Zuschlag für landesverbandsübergreifenden " +
      "Einsatz in RL West / Frauen 2. Liga nur auf Anforderung, 50 % bei Ausfall vor Ort. Das ist eine " +
      "Aufstellung für dich oder deinen Steuerberater; was davon steuerlich zählt, sagt sie nicht." })]));

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
    var kopfBezahlt = h("input", { type: "checkbox", title: "bezahlt", onchange: function (ev) { bez.checked = ev.target.checked; speichereEinsatz(sp, { bezahlt: ev.target.checked }); } });
    kopfBezahlt.checked = !!e.bezahlt;
    var details = h("div", { class: "mg-details versteckt" });
    var zeile = h("div", { class: "spiel karte mg-eintrag" + (vergangen ? "" : " war") + (e.bezahlt ? " bezahlt" : ""), "data-kennung": sp.kennung.replace(/"/g, "") }, [
      h("div", { class: "mg-kopf", onclick: function (ev) { if (ev.target.closest("input, button, a, label")) return; details.classList.toggle("versteckt"); zeile.classList.toggle("offen", !details.classList.contains("versteckt")); } }, [
        h("div", { class: "kopfzeile" }, [
          h("span", { class: "datum", text: datum(d) + " · " + uhr(d) + " Uhr" + (zeitzuschlag(sp) ? " · +20 %" : "") }),
          rolleBadge((sp.rolle || "") + (sp.system >= 3 ? " · " + sp.system + "er" : ""))
        ]),
        h("div", { class: "paarung", text: (sp.liga ? sp.liga + ": " : "") + sp.paarung }),
        h("div", { class: "mg-summe" }, [
          h("span", { class: "meta mg-betrag-kurz", text: b.betrag != null ? euro(b.betrag) + (e.km != null ? " · " + e.km + " km" : "") : "Betrag fehlt" }),
          h("label", { class: "mg-check" }, [kopfBezahlt, " bezahlt"]),
          h("span", { class: "meta mg-auf", text: "Details ›" })
        ])
      ]),
      details
    ]);
    details.appendChild(h("div", { class: "meta", text: (sp.halle || "Halle unbekannt") +
        (vorschlag && vorschlag.art === "route" ? " · " + vorschlag.km + " km Straße" : "") }));
    [
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
    ].forEach(function (x) { details.appendChild(x); });
    bez.addEventListener("change", function () { kopfBezahlt.checked = bez.checked; });
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
        if (!profil || !profil.slug || !frei()) return false;
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
    inhalt.appendChild(skelett(3));
    ladeGesuche().then(function (d) {
      // Eigene Gesuche, bei denen esrw.de inzwischen jemand anderen fuehrt
      var spieleVon = {};
      (ctx.daten.spiele || []).forEach(function (sp) { spieleVon[kennungVon(sp)] = sp; });
      var erledigen = d.gesuche.filter(function (g) {
        if (g.status !== "offen" || g.user_id !== session.user.id) return false;
        var sp = spieleVon[g.kennung];
        return !!(sp && sp.besetzung && sp.besetzung.length && sp.besetzung.every(function (b) { return b.slug !== g.slug; }));
      });
      if (erledigen.length) {
        return Promise.all(erledigen.map(function (g) {
          g.status = "erledigt";
          return sb.from("gesuche").update({ status: "erledigt", erledigt_am: new Date().toISOString() }).eq("id", g.id);
        })).then(function () { kurzMeldung("Auf esrw.de steht schon jemand anderes – " + erledigen.length + " Gesuch(e) als erledigt markiert.", "gut"); return d; });
      }
      return d;
    }).then(function (d) {
      leeren(inhalt);
      var offen = d.gesuche.filter(function (g) { return g.status !== "erledigt"; });
      var erledigt = d.gesuche.filter(function (g) { return g.status === "erledigt"; });

      inhalt.appendChild(h("h3", { class: "abschnitt", text: "Offene und vereinbarte Gesuche" }));
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
      h("div", { class: "paarung" }, [h("a", { href: "#spiel/" + encodeURIComponent(g.kennung), style: "color:inherit;text-decoration:none", text: (g.liga ? g.liga + ": " : "") + (g.paarung || "") })]),
      h("div", { class: "meta", text: (g.halle || "Halle unbekannt") + " · Tipp auf den Namen öffnet das Spiel" }),
      h("div", { class: "wer", text: (meins ? "Du suchst" : g.name + " sucht") + " Ersatz" + (g.text ? " – „" + g.text + "“" : "") })
    ]);
    var ang = h("div", { class: "angebote" });
    if (g.status === "vereinbart") {
      ang.appendChild(h("div", { class: "hinweis gut", style: "margin:8px 0 0" }, [ikone("i-check"),
        h("span", { text: "Vereinbart mit " + (g.vereinbart_name || "?") + " – der Obmann muss noch umteilen. Sobald esrw.de den neuen Namen zeigt, wird das Gesuch von selbst erledigt." })]));
    } else if (angebote.length) {
      ang.appendChild(document.createTextNode(meins ? "Angebote – eins annehmen: " : "Könnte: "));
      angebote.forEach(function (a) {
        var chip = h("span", { text: a.name + (a.text ? " (" + a.text + ")" : "") });
        if (meins && g.status === "offen") {
          chip.style.cursor = "pointer"; chip.title = "Dieses Angebot annehmen";
          chip.appendChild(h("b", { text: " · annehmen", style: "font-weight:800" }));
          chip.addEventListener("click", function () { angebotAnnehmen(g, a); });
        }
        ang.appendChild(chip);
      });
    } else if (g.status === "offen") ang.appendChild(document.createTextNode("Noch kein Angebot."));
    karte.appendChild(ang);

    if (g.status === "erledigt") return karte;
    var knoepfe = h("div", { class: "zweit" });
    if (meins) {
      knoepfe.appendChild(h("button", { type: "button", text: "Erledigt", onclick: function () {
        sb.from("gesuche").update({ status: "erledigt" }).eq("id", g.id).then(function (r) { if (r.error) meldung(fehlerText(r.error), "warn"); zeigeTausch(); });
      } }));
      if (g.status === "vereinbart") {
        knoepfe.appendChild(h("button", { type: "button", text: "Mail an Obmann erneut", onclick: function () { obmannMail(g, g.vereinbart_name); } }));
        knoepfe.appendChild(h("button", { type: "button", text: "Doch nicht (wieder offen)", onclick: function () {
          sb.from("gesuche").update({ status: "offen", vereinbart_mit: null, vereinbart_name: null, vereinbart_gemeldet: false }).eq("id", g.id).then(function () { zeigeTausch(); });
        } }));
      } else knoepfe.appendChild(h("button", { type: "button", text: "Zurückziehen", onclick: function () {
        sb.from("gesuche").delete().eq("id", g.id).then(function () { zeigeTausch(); });
      } }));
    } else if (g.status === "vereinbart") {
      // Fremdes, vereinbartes Gesuch: nichts mehr zu tun
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

  function angebotAnnehmen(g, a) {
    if (!confirm(a.name + " übernimmt " + g.paarung + "? Danach geht eine Mail an den Obmann.")) return;
    sb.from("gesuche").update({ status: "vereinbart", vereinbart_mit: a.user_id, vereinbart_name: a.name, vereinbart_gemeldet: false }).eq("id", g.id)
      .then(function (r) {
        if (r.error) { meldung(fehlerText(r.error), "warn"); return; }
        kurzMeldung("Vereinbart ✓ – " + a.name + " bekommt Bescheid.", "gut");
        obmannMail(g, a.name);
        zeigeTausch();
      });
  }

  function obmannMail(g, neuerName) {
    var d = new Date(g.beginn);
    var text = "Hallo,\n\nbitte das folgende Spiel umteilen:\n\n" + datum(d) + " " + uhr(d) + " Uhr – " + (g.liga ? g.liga + ": " : "") + g.paarung +
      (g.halle ? "\n" + g.halle : "") + "\nRolle: " + (g.rolle || "SR") +
      "\n\nBisher: " + (profil.name || profil.slug) + "\nNeu: " + neuerName + "\n\nWir haben das untereinander abgesprochen.\n\nViele Grüße\n" +
      (profil.name ? profil.name.split(",").reverse().join(" ").trim() : "");
    var an = profil.obmann_email || "";
    location.href = "mailto:" + encodeURIComponent(an) + "?subject=" + encodeURIComponent("Umteilung " + datum(d) + " " + g.paarung) + "&body=" + encodeURIComponent(text);
    if (!an) kurzMeldung("Obmann-Adresse fehlt – unter Konto → Einstellungen eintragen.", "");
  }

  // ------------------------------------------------------ Verfuegbarkeit
  //
  // 'nein' = an dem Tag nicht verfuegbar, 'gern' = haette gern ein Spiel.
  // Fliesst in die Tauschoptionen ein (gesperrte Kollegen fallen raus,
  // freigemeldete rutschen nach oben).

  function sperrenAm(beginn) {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) return {};
      return ladeProfil().then(function () { if (!frei()) return {}; return sb.from("sperren").select("slug,status").eq("datum", isoTag(new Date(beginn))).then(function (r) {
        var m = {};
        (r.data || []).forEach(function (z) { m[z.slug] = z.status; });
        return m;
      }); });
    }).catch(function () { return {}; });
  }

  function zeigeVerfuegbarkeit() {
    leeren(inhalt);
    inhalt.appendChild(skelett(2));
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

      // Naechste 4 Wochenenden als Schnellzeile; der Rest im Mini-Kalender
      var tage = [], d = new Date(); d.setHours(12, 0, 0, 0);
      for (var i = 0; i < 28; i++) {
        var t = new Date(d.getTime() + i * 86400000);
        if (t.getDay() === 0 || t.getDay() === 6) tage.push(isoTag(t));
      }
      Object.keys(meine).forEach(function (k) { if (tage.indexOf(k) < 0) tage.push(k); });
      tage.sort();

      var liste = h("div", { class: "karte", style: "padding:4px 14px" });
      tage.forEach(function (tag) { liste.appendChild(sperreZeile(tag, meine[tag] && meine[tag].status, spieleAm[tag] || 0)); });
      inhalt.appendChild(liste);

      var von = h("input", { type: "date", min: heute }), bis = h("input", { type: "date", min: heute });
      var art = h("select", { class: "mg-select" }, [h("option", { value: "nein", text: "kann nicht" }), h("option", { value: "gern", text: "hätte gern ein Spiel" }), h("option", { value: "", text: "wieder frei" })]);
      inhalt.appendChild(h("div", { class: "melde karte" }, [h("div", { class: "mg-form" }, [
        h("h4", { text: "Zeitraum eintragen" }),
        h("p", { class: "meta", style: "margin:0", text: "Urlaub, Prüfungen, Dienstreise: von – bis, alle Tage dazwischen. Ein einzelner Tag: nur „von“ ausfüllen." }),
        h("div", { class: "mg-felder" }, [h("label", {}, ["von", von]), h("label", {}, ["bis (optional)", bis])]),
        art,
        h("button", { type: "button", class: "mg-haupt", text: "Eintragen", onclick: function () {
          if (!von.value) return;
          var a = new Date(von.value + "T12:00:00"), b = new Date((bis.value || von.value) + "T12:00:00");
          if (b < a) { meldung("„bis“ liegt vor „von“.", "warn"); return; }
          var tage = [];
          for (var t = new Date(a); t <= b && tage.length < 120; t = new Date(t.getTime() + 86400000)) tage.push(isoTag(t));
          var kette = Promise.resolve();
          tage.forEach(function (tag) { kette = kette.then(function () { return sperreSetzen(tag, art.value, true); }); });
          kette.then(function () { kurzMeldung(tage.length + (tage.length === 1 ? " Tag" : " Tage") + " eingetragen ✓", "gut"); zeigeVerfuegbarkeit(); });
        } })
      ])]));
      inhalt.appendChild(miniKalender(meine, spieleAm));
    }).catch(function (e) { leeren(inhalt); inhalt.appendChild(h("p", { class: "achtung", text: "Nicht ladbar: " + fehlerText(e) })); });
  }

  function sperreSetzen(tag, status, leise) {
    var lauf = status
      ? sb.from("sperren").upsert({ user_id: session.user.id, slug: profil.slug, datum: tag, status: status }, { onConflict: "user_id,datum" })
      : sb.from("sperren").delete().eq("user_id", session.user.id).eq("datum", tag);
    return lauf.then(function (r) { if (r.error) meldung(fehlerText(r.error), "warn"); else if (!leise) kurzMeldung("Gespeichert ✓", "gut"); });
  }

  // Zwei Monate als Raster: eigene Sperrtage farbig, Tipp wechselt frei -> nicht -> gern -> frei
  function miniKalender(meine, spieleAm) {
    var box = h("div", { class: "melde karte" }, [h("h4", { text: "Überblick" }), h("p", { class: "meta", style: "margin:0 0 8px", text: "Tipp auf einen Tag: frei → nicht → gern → frei. Punkt = eigenes Spiel." })]);
    var heute = new Date(); heute.setHours(0, 0, 0, 0);
    for (var m = 0; m < 2; m++) {
      var start = new Date(heute.getFullYear(), heute.getMonth() + m, 1), ende = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      box.appendChild(h("div", { class: "monat-kopf", style: "margin:8px 0 4px" }, [h("b", { text: start.toLocaleDateString("de-DE", { month: "long", year: "numeric" }) })]));
      var raster = h("div", { class: "monat mini" });
      ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach(function (w) { raster.appendChild(h("div", { class: "wt", text: w })); });
      for (var i = 0; i < (start.getDay() + 6) % 7; i++) raster.appendChild(h("div", { class: "zelle leer" }));
      for (var tag = 1; tag <= ende.getDate(); tag++) {
        (function (tag) {
          var d = new Date(start.getFullYear(), start.getMonth(), tag), key = isoTag(d);
          var st = meine[key] && meine[key].status;
          var z = h("div", { class: "zelle" + (d < heute ? " war" : "") + (key === isoTag(heute) ? " heute" : "") + (st === "nein" ? " nein" : st === "gern" ? " gern" : "") }, [h("span", { text: String(tag) })]);
          if (spieleAm[key]) z.appendChild(h("div", { class: "punkte" }, [h("i", { class: "ich" })]));
          if (d >= heute) z.addEventListener("click", function () {
            var neu = !st ? "nein" : st === "nein" ? "gern" : "";
            sperreSetzen(key, neu, true).then(zeigeVerfuegbarkeit);
          });
          raster.appendChild(z);
        })(tag);
      }
      box.appendChild(raster);
    }
    return box;
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
    var ueber = h("div", { class: "melde karte" }, [h("h4", { text: "Dein Konto" }), skelett(1)]);
    inhalt.appendChild(ueber);
    kontoUebersicht(ueber);
    inhalt.appendChild(h("div", { class: "melde karte" }, [
      h("h4", { text: "Einstellungen" }),
      h("p", {}, ["Name auf esrw.de, Heimatadresse, Kilometermodell und Sätze. Was auf der Startseite steht, Schrift und Farbe: ", h("a", { href: "#einstellungen", text: "App-Einstellungen" }), "."]),
      h("button", { type: "button", class: "haupt", text: "Einstellungen öffnen", onclick: function () { zeigeEinrichtung(true); } })
    ]));
    if (fn("push")) {
      var pushBox = h("div", { class: "melde karte" }, [h("h4", {}, [ikone("i-bell"), " Push-Benachrichtigungen ", h("span", { class: "status", text: "" })]), h("p", { text: "prüfe …" })]);
      inhalt.appendChild(pushBox);
      pushRendern(pushBox);
    }
    if (fn("gespann")) {
      var kontaktBox = h("div", { class: "melde karte" }, [h("h4", { text: "Handynummer für Gespannkollegen" }), h("p", { text: "lade …" })]);
      inhalt.appendChild(kontaktBox);
      kontaktRendern(kontaktBox);
    }

    var neueMail = h("input", { type: "email", placeholder: "neue@adresse.de", autocomplete: "email" });
    inhalt.appendChild(h("div", { class: "melde karte" }, [
      h("h4", { text: "E-Mail-Adresse ändern" }),
      h("p", { text: "Aktuell: " + session.user.email + ". Nach dem Ändern kommt an beide Adressen eine Bestätigungsmail; erst wenn beide Links angetippt sind, gilt die neue." }),
      h("div", { class: "mg-form" }, [neueMail]),
      h("button", { type: "button", class: "haupt", text: "Adresse ändern", onclick: function () {
        var m = neueMail.value.trim(); if (!m || m.indexOf("@") < 1) { meldung("Bitte eine gültige Adresse.", "warn"); return; }
        sb.auth.updateUser({ email: m }).then(function (r) { if (r.error) meldung(fehlerText(r.error), "warn"); else { neueMail.value = ""; meldung("Bestätigungsmails sind unterwegs – bitte beide Links antippen.", "gut"); } });
      } })
    ]));
    var pw = h("input", { type: "password", placeholder: "Neues Passwort (mind. 8 Zeichen)", autocomplete: "new-password", minlength: "8" });
    inhalt.appendChild(h("div", { class: "melde karte" }, [
      h("h4", { text: "Passwort ändern" }),
      h("div", { class: "mg-form" }, [pw]),
      h("button", { type: "button", class: "haupt", text: "Passwort ändern", onclick: function () {
        if (pw.value.length < 8) { meldung("Mindestens 8 Zeichen.", "warn"); return; }
        sb.auth.updateUser({ password: pw.value }).then(function (r) { if (r.error) meldung(fehlerText(r.error), "warn"); else { pw.value = ""; kurzMeldung("Passwort geändert ✓", "gut"); } });
      } })
    ]));

    inhalt.appendChild(h("div", { class: "melde karte" }, [
      h("h4", { text: "Daten" }),
      h("p", { text: "Alles, was du hier einträgst, liegt in deinem Supabase-Konto und ist nur für dich lesbar – außer Gesuche, Angebote, Verfügbarkeiten, Hallen-Hinweise, Mitfahrten und eine freigegebene Handynummer, die alle Mitglieder sehen. " +
        "Abrechnung als CSV gibt es im Reiter Abrechnung." }),
      h("div", { class: "zweit" }, [
        h("button", { type: "button", text: "Alle meine Daten (JSON)", onclick: datenExport }),
        h("button", { type: "button", style: "color:var(--warn)", text: "Konto löschen", onclick: kontoLoeschen })
      ])
    ]));
  }

  function kontoUebersicht(box) {
    var zeilen = [["Name", profil.name || profil.slug || "–"], ["E-Mail", session.user.email || "–"],
                  ["Freischaltung", profil.admin ? "Admin" : profil.freigeschaltet ? "freigeschaltet ✓" : "wartet auf den Betreiber"],
                  ["Heimatadresse", profil.heimat ? "hinterlegt ✓" : "fehlt (für Strecken und Abfahrt)"],
                  ["Obmann-E-Mail", profil.obmann_email || "fehlt (für Mails aus der App)"]];
    function rendern() {
      leeren(box); box.appendChild(h("h4", { text: "Dein Konto" }));
      var liste = h("div", { class: "status-liste", style: "padding:0" });
      zeilen.forEach(function (z) { liste.appendChild(h("div", {}, [h("span", { text: z[0] }), h("span", { text: z[1] })])); });
      box.appendChild(liste);
    }
    rendern();
    sb.from("push_abos").select("id,geraet,angelegt,endpoint").eq("user_id", session.user.id).then(function (r) {
      var abos = r.data || [];
      zeilen.push(["Push-Geräte", abos.length ? String(abos.length) : "keins"]);
      rendern();
      if (!abos.length) return;
      var liste = h("div", { style: "margin-top:8px" });
      var eigener = null;
      var weiter = function () {
        abos.forEach(function (a) {
          liste.appendChild(h("div", { class: "sperre" }, [
            h("span", {}, [h("b", { text: (a.geraet || "Gerät") + (eigener && eigener === a.endpoint ? " (dieses)" : "") }), h("small", { class: "meta", style: "display:block", text: "seit " + new Date(a.angelegt).toLocaleDateString("de-DE") })]),
            h("span", {}, [
              h("button", { type: "button", class: "textknopf", text: "Test", title: "Test-Push vom Server (beim nächsten Lauf, bis 30 Min.)", onclick: function () {
                sb.from("push_test").insert({ user_id: session.user.id, abo_id: a.id }).then(function (r2) { if (r2.error) meldung(fehlerText(r2.error), "warn"); else kurzMeldung("Test angefordert – kommt beim nächsten Lauf (bis 30 Min.).", "gut"); });
              } }), " · ",
              h("button", { type: "button", class: "textknopf", text: "abmelden", onclick: function () {
                sb.from("push_abos").delete().eq("id", a.id).then(function () {
                  if (eigener && eigener === a.endpoint && navigator.serviceWorker) navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (abo) { if (abo) abo.unsubscribe(); }).catch(function () {});
                  kurzMeldung("Gerät abgemeldet.", ""); zeigeReiter("konto");
                });
              } })
            ])
          ]));
        });
        box.appendChild(liste);
      };
      if (navigator.serviceWorker && "PushManager" in window) navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); })
        .then(function (abo) { eigener = abo ? abo.endpoint : null; weiter(); }).catch(weiter);
      else weiter();
    }).catch(function () {});
  }

  // ---- Einstellungen (Schrift, Farbe, Karten-App, kompakt) im Konto
  function einstellungenSpeichern(obj) {
    if (!session || !profil) return Promise.resolve(false);
    profil.einstellungen = obj;
    return sb.from("profile").upsert({ id: session.user.id, einstellungen: obj }).then(function (r) { return !r.error; }).catch(function () { return false; });
  }

  // ---- Vertretungs-Radar: fremde offene Gesuche + eigene Sperrtage
  function radar() {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) return null;
      return ladeProfil().then(function () {
        if (!frei()) return null;
        var ab = new Date().toISOString();
        return Promise.all([
          sb.from("gesuche").select("*").eq("status", "offen").gte("beginn", ab).order("beginn").limit(20),
          sb.from("sperren").select("datum,status").eq("user_id", session.user.id).gte("datum", isoTag(new Date())),
          sb.from("angebote").select("gesuch_id").eq("user_id", session.user.id)
        ]).then(function (r) {
          var meineAngebote = {}; (r[2].data || []).forEach(function (a) { meineAngebote[a.gesuch_id] = 1; });
          var sperren = {}; (r[1].data || []).forEach(function (x) { sperren[x.datum] = x.status; });
          return { gesuche: (r[0].data || []).filter(function (g) { return g.user_id !== session.user.id; }), sperren: sperren, meineAngebote: meineAngebote,
                   heimat: profil.heimat_lat != null ? [profil.heimat_lat, profil.heimat_lon] : null };
        });
      });
    }).catch(function () { return null; });
  }
  function angebotMachen(gesuchId) {
    return sb.from("angebote").insert({ gesuch_id: gesuchId, user_id: session.user.id, slug: profil.slug, name: profil.name || profil.slug, text: null })
      .then(function (r) { if (r.error) { meldung(fehlerText(r.error), "warn"); return false; } kurzMeldung("Gemeldet ✓", "gut"); return true; });
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
      Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) { b.remove(); });
      if (knopfText) box.appendChild(h("button", { type: "button", class: "haupt", text: knopfText, onclick: aktion }));
      if (lage === "an") box.appendChild(h("button", { type: "button", class: "mg-neben", style: "margin-top:8px;width:100%", text: "Testnachricht auf diesem Gerät", onclick: function () {
        navigator.serviceWorker.ready.then(function (reg) {
          return reg.showNotification("Einteilungen: Test", { body: "Wenn du das siehst, kommen Mitteilungen an. Echte Push-Nachrichten schickt der Server bei Änderungen.", icon: "icon-192.png", badge: "icon-192.png", tag: "test" });
        }).then(function () { kurzMeldung("Testnachricht geschickt – sie erscheint oben oder in der Mitteilungszentrale.", "gut"); })
          .catch(function (e) { meldung("Konnte nicht anzeigen: " + (e.message || e), "warn"); });
      } }));
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

  var cache = { hallen: {}, kontakte: {}, mitfahrten: {}, notizen: {}, kommentare: {}, geladen: {} };

  function extrasLaden(spiele) {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) return false;
      return ladeProfil().then(function () {
        if (!frei()) return false;
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
          laeufe.push(sb.from("spielkommentare").select("*").in("kennung", kennungen).order("angelegt").then(function (r) {
            kennungen.forEach(function (k) { cache.kommentare[k] = []; });
            (r.data || []).forEach(function (z) { (cache.kommentare[z.kennung] = cache.kommentare[z.kennung] || []).push(z); });
          }).catch(function () {}));
        }
        return Promise.all(laeufe).then(function () { return true; });
      });
    }).catch(function () { return false; });
  }

  function kontakteFuer(spiel) {
    return (spiel.gespann || []).map(function (g) {
      var k = g.slug && cache.kontakte[g.slug]; if (!k) return null;
      var l = telefonLink(k.telefon); return { name: g.name, vorname: (g.name.split(",")[1] || g.name).trim().split(" ")[0], tel: l.tel, wa: l.wa };
    }).filter(Boolean);
  }
  function hinweisAnzahl(halle) { return (cache.hallen[halle] || []).length; }

  function spielExtras(spiel, ziel, istIch, ohneHalle) {
    if (!session || !profil) return;
    leeren(ziel);
    var kennung = kennungVon(spiel);
    var hinweise = cache.hallen[spiel.halle] || [];
    var mitfahrten = (cache.mitfahrten[kennung] || []).filter(function (m) { return m.user_id !== session.user.id; });
    var meineMitfahrt = (cache.mitfahrten[kennung] || []).filter(function (m) { return m.user_id === session.user.id; })[0];
    var notiz = cache.notizen[kennung];
    var kommentare = cache.kommentare[kennung] || [];
    var kontakte = fn("gespann") ? (spiel.gespann || []).map(function (g) { return g.slug && cache.kontakte[g.slug] ? { g: g, k: cache.kontakte[g.slug] } : null; }).filter(Boolean) : [];
    var mitHallen = !!spiel.halle && !ohneHalle && fn("hallen"), mitGespann = fn("gespann"), mitNotiz = istIch && fn("notizen");
    if (!mitGespann) mitfahrten = [];

    var teile = [];
    if (istIch && mitGespann) teile.push(kommentare.length ? kommentare.length + (kommentare.length === 1 ? " Gespann-Notiz" : " Gespann-Notizen") : "Gespann-Notiz");
    if (mitHallen) teile.push(hinweise.length ? hinweise.length + (hinweise.length === 1 ? " Hallen-Hinweis" : " Hallen-Hinweise") : "Halle");
    if (kontakte.length) teile.push(kontakte.length + " Kontakt" + (kontakte.length === 1 ? "" : "e"));
    if (mitfahrten.length) teile.push(mitfahrten.length + " Mitfahrt");
    if (mitNotiz) teile.push(notiz ? "Notiz ✓" : "Notiz");
    if (!teile.length) return;

    var box = h("details", { class: "tausch extras" }, [h("summary", { text: teile.join(" · ") })]);
    var innen = h("div"); box.appendChild(innen);
    box.addEventListener("toggle", function () {
      if (!box.open || innen.childNodes.length) return;

      // Hallen-Wiki (auf der Spielseite steht der Link oben in der Hallen-Karte)
      if (mitHallen) {
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

      // Kontakte im Gespann (auf der Spielseite oben in der Kopfkarte)
      if (kontakte.length && !ohneHalle) {
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
      if (!spiel.vergangen && mitGespann) {
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

      // Gespann-Notizen: nur fuer die, die im Spiel stehen
      if (istIch && mitGespann) {
        innen.appendChild(h("h4", { text: "Gespann-Notizen (sehen nur die Kollegen im Spiel)" }));
        if (!kommentare.length) innen.appendChild(h("p", { class: "meta", text: "Noch nichts – „Ich bringe die Pucks“, „Parke hinten“, „Bin 10 Min. später“. Die Kollegen bekommen Push." }));
        kommentare.forEach(function (k) {
          innen.appendChild(h("div", { class: "kandidat" }, [h("div", { text: k.text }),
            h("div", { class: "meta" }, [k.name + " · " + new Date(k.angelegt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
              k.user_id === session.user.id ? h("button", { type: "button", class: "textknopf", style: "margin-left:8px", text: "löschen", onclick: function () {
                sb.from("spielkommentare").delete().eq("id", k.id).then(function () { delete cache.geladen["k|" + kennung]; extrasLaden([spiel]).then(function () { spielExtras(spiel, ziel, istIch); var d = ziel.querySelector("details"); if (d) d.open = true; }); });
              } }) : null])]));
        });
        var ki = h("input", { type: "text", placeholder: "Nachricht ans Gespann …", maxlength: "300" });
        innen.appendChild(h("div", { class: "mg-form" }, [ki, h("button", { type: "button", class: "anfrage", text: "Ans Gespann schicken", onclick: function () {
          var t = ki.value.trim(); if (!t) return;
          var slugs = (spiel.gespann || []).map(function (g) { return g.slug; }).filter(Boolean).concat([profil.slug]);
          sb.from("spielkommentare").insert({ user_id: session.user.id, slug: profil.slug, name: profil.name || profil.slug, kennung: kennung, beginn: spiel.beginn, paarung: spiel.paarung, gespann: slugs, text: t })
            .then(function (r) { if (r.error) { meldung(fehlerText(r.error), "warn"); return; }
              kurzMeldung("Geschickt ✓ – Push geht beim nächsten Lauf raus.", "gut"); delete cache.geladen["k|" + kennung];
              extrasLaden([spiel]).then(function () { spielExtras(spiel, ziel, istIch); var d = ziel.querySelector("details"); if (d) d.open = true; }); });
        } })]));
      }

      // Private Notiz
      if (mitNotiz) {
        innen.appendChild(h("h4", { text: "Meine Notiz (nur für mich)" }));
        var ta = h("textarea", { rows: "3", placeholder: "Vorkommnisse, Strafen, Lernpunkte …", maxlength: "4000" });
        ta.value = notiz ? notiz.text : "";
        var timer = null;
        ta.addEventListener("input", function () {
          clearTimeout(timer);
          timer = setTimeout(function () { notizSpeichern(spiel, ta.value.trim()); }, 800);
        });
        innen.appendChild(h("div", { class: "mg-form" }, [ta, h("p", { class: "meta", text: "Speichert von selbst. Alle Notizen: Mehr → Notizen." })]));
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
    inhalt.appendChild(skelett(2));
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
        if (!treffer.length) liste.appendChild(h("p", { class: "leer", text: alle.length ? "Nichts gefunden." : "Noch keine Notizen. Auf jeder Spielseite gibt es „Meine Notiz“." }));
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

  // ---- Admin: neue Konten freischalten

  function zeigeAdmin() {
    var fbox = h("div", { class: "melde karte" }, [h("h4", {}, [ikone("i-check"), " Funktionen"]), skelett(1)]);
    inhalt.appendChild(fbox);
    funktionenRendern(fbox);
    var box = h("div", { class: "melde karte" }, [h("h4", { text: "Freischaltung" }), skelett(1)]);
    inhalt.appendChild(box);
    adminRendern(box);
    inhalt.appendChild(h("p", { class: "meta mg-fuss", text: "Freigeschaltete sehen Tauschbörse, Verfügbarkeiten, Hallen-Hinweise, Kontakte und Mitfahrten. " +
      "Admins können außerdem freischalten und weitere Admins ernennen. Das eigene Admin-Recht lässt sich hier nicht entfernen – dafür SQL im Supabase-Dashboard." }));
  }

  // Admin -> Funktionen: Schalter je Funktion, Tabelle "funktionen"
  function funktionenRendern(box) {
    var liste = (ctx && ctx.funktionen) || [];
    sb.from("funktionen").select("schluessel,aktiv").then(function (r) {
      if (r.error) throw r.error;
      var stand = {}; (r.data || []).forEach(function (z) { stand[z.schluessel] = !!z.aktiv; });
      function aktiv(k) { var d = liste.filter(function (f) { return f[0] === k; })[0]; return stand[k] !== undefined ? stand[k] : (d ? d[3] : true); }
      leeren(box);
      box.appendChild(h("h4", {}, [ikone("i-check"), " Funktionen"]));
      box.appendChild(h("p", { class: "meta", text: "Gilt für alle Mitglieder, sofort nach dem Umschalten. Abgeschaltete Bereiche verschwinden aus Leiste, „Mehr“ und den Spielseiten; eingetragene Daten bleiben erhalten." }));
      liste.forEach(function (f) {
        var c = h("input", { type: "checkbox" }); c.checked = aktiv(f[0]);
        c.addEventListener("change", function () {
          c.disabled = true;
          sb.from("funktionen").upsert({ schluessel: f[0], aktiv: c.checked, geaendert: new Date().toISOString() }, { onConflict: "schluessel" }).then(function (r2) {
            c.disabled = false;
            if (r2.error) { c.checked = !c.checked; meldung(fehlerText(r2.error), "warn"); return; }
            stand[f[0]] = c.checked;
            var alle = {}; liste.forEach(function (g) { alle[g[0]] = aktiv(g[0]); });
            kurzMeldung(f[1] + (c.checked ? " eingeschaltet ✓" : " abgeschaltet"), "gut");
            document.dispatchEvent(new CustomEvent("mg-funktionen", { detail: alle }));
          });
        });
        box.appendChild(h("label", { class: "mg-funktion" }, [h("span", {}, [h("b", { text: f[1] }), h("small", { text: f[2] })]), c]));
      });
    }).catch(function (e) {
      leeren(box);
      box.appendChild(h("h4", {}, [ikone("i-check"), " Funktionen"]));
      box.appendChild(h("p", { class: "achtung", text: "Tabelle „funktionen“ fehlt – bitte supabase/schema.sql (v10) einmal ausführen. " + fehlerText(e) }));
    });
  }

  // Zaehler fuer Reiter und die Leiste unten: offene Gesuche, wartende Konten
  function zaehler() {
    if (!session) return Promise.resolve({ angemeldet: false });
    return ladeProfil().then(function () {
      var z = { angemeldet: true, gesuche: 0, wartend: 0, info: 0, admin: !!(profil && profil.admin) };
      var laeufe = [];
      if (frei() && fn("tausch")) laeufe.push(sb.from("gesuche").select("id,user_id").eq("status", "offen").gte("beginn", new Date(Date.now() - 6 * 3600000).toISOString())
        .then(function (r) { z.gesuche = (r.data || []).filter(function (g) { return g.user_id !== session.user.id; }).length; }));
      if (frei() && fn("info")) laeufe.push(sb.from("ankuendigungen").select("id").then(function (r) {
        var gelesen = gelesenLesen(); z.info = (r.data || []).filter(function (a) { return !gelesen[a.id]; }).length;
      }).catch(function () {}));
      if (profil && profil.admin) laeufe.push(sb.from("profile").select("id,freigeschaltet,admin").eq("freigeschaltet", false)
        .then(function (r) { z.wartend = (r.data || []).filter(function (p) { return !p.admin; }).length; }));
      return Promise.all(laeufe).then(function () { document.dispatchEvent(new CustomEvent("mg-zaehler", { detail: z })); return z; });
    }).catch(function () { return { angemeldet: true }; });
  }
  function zaehlerAnzeigen(z) {
    if (!wurzel) return;
    [["tausch", z.gesuche], ["admin", z.wartend], ["info", z.info]].forEach(function (p) {
      var b = wurzel.querySelector('.mg-untertabs button[data-reiter="' + p[0] + '"] .zaehler');
      if (!b) return;
      b.textContent = p[1] || ""; b.classList.toggle("versteckt", !p[1]);
    });
  }

  function adminRendern(box) {
    sb.from("profile").select("id,name,slug,email,freigeschaltet,admin").order("name").then(function (r) {
      if (r.error) throw r.error;
      var alle = r.data || [];
      var offen = alle.filter(function (p) { return !p.freigeschaltet && !p.admin; });
      leeren(box);
      box.appendChild(h("h4", { text: "Freischaltung" }));
      box.appendChild(h("p", { text: alle.length + " Konten, " + offen.length + " warten. „(ohne Namen)“ heißt: registriert, aber in der App noch keinen Namen gewählt – freischalten geht trotzdem." }));
      if (!offen.length) box.appendChild(h("p", { class: "meta", text: "Niemand wartet." }));
      offen.forEach(function (p) {
        box.appendChild(h("div", { class: "sperre" }, [
          h("span", {}, [h("b", { text: p.name || p.slug || "(ohne Namen)" }), h("small", { class: "meta", style: "display:block", text: p.email || "" })]),
          h("button", { type: "button", class: "anfrage", text: "Freischalten", onclick: function () {
            sb.from("profile").update({ freigeschaltet: true }).eq("id", p.id).then(function (r2) {
              if (r2.error) { meldung(fehlerText(r2.error), "warn"); return; }
              kurzMeldung((p.name || "Konto") + " freigeschaltet ✓", "gut"); adminRendern(box);
            });
          } })
        ]));
      });
      var freie = alle.filter(function (p) { return p.freigeschaltet && !p.admin; });
      if (freie.length) {
        var det = h("details", { class: "tausch" }, [h("summary", { text: freie.length + " freigeschaltet" })]);
        freie.forEach(function (p) {
          det.appendChild(h("div", { class: "sperre" }, [
            h("span", {}, [h("b", { text: p.name || p.slug || "(ohne Namen)" }), h("small", { class: "meta", style: "display:block", text: p.email || "" })]),
            h("span", {}, [
              h("button", { type: "button", class: "textknopf", text: "Admin", title: "Zum Admin machen", onclick: function () {
                if (!confirm((p.name || p.email) + " zum Admin machen? Kann dann freischalten und Admins ernennen.")) return;
                sb.from("profile").update({ admin: true }).eq("id", p.id).then(function (r2) { if (r2.error) meldung(fehlerText(r2.error), "warn"); adminRendern(box); });
              } }), " · ",
              h("button", { type: "button", class: "textknopf", text: "sperren", onclick: function () {
                sb.from("profile").update({ freigeschaltet: false }).eq("id", p.id).then(function () { adminRendern(box); });
              } })
            ])
          ]));
        });
        box.appendChild(det);
      }
      var admins = alle.filter(function (p) { return p.admin; });
      var adet = h("details", { class: "tausch" }, [h("summary", { text: admins.length + (admins.length === 1 ? " Admin" : " Admins") })]);
      admins.forEach(function (p) {
        adet.appendChild(h("div", { class: "sperre" }, [
          h("span", {}, [h("b", { text: (p.name || p.slug || "(ohne Namen)") + (p.id === session.user.id ? " (du)" : "") }), h("small", { class: "meta", style: "display:block", text: p.email || "" })]),
          p.id === session.user.id ? null : h("button", { type: "button", class: "textknopf", text: "Admin entfernen", onclick: function () {
            if (!confirm((p.name || p.email) + " das Admin-Recht nehmen?")) return;
            sb.from("profile").update({ admin: false, freigeschaltet: true }).eq("id", p.id).then(function () { adminRendern(box); });
          } })
        ]));
      });
      box.appendChild(adet);
      zaehler().then(zaehlerAnzeigen);
    }).catch(function (e) { leeren(box); box.appendChild(h("p", { class: "achtung", text: fehlerText(e) })); });
  }

  // ---- Datenexport und Konto loeschen

  function datenExport() {
    var uid = session.user.id;
    var tabellen = [["einsaetze", "user_id"], ["spielnotizen", "user_id"], ["gesuche", "user_id"], ["angebote", "user_id"],
                    ["sperren", "user_id"], ["hallen_notizen", "user_id"], ["kontakte", "user_id"], ["mitfahrten", "user_id"], ["push_abos", "user_id"]];
    var aus = { exportiert: new Date().toISOString(), email: session.user.email, profil: profil };
    Promise.all(tabellen.map(function (t) {
      return sb.from(t[0]).select("*").eq(t[1], uid).then(function (r) { aus[t[0]] = r.error ? { fehler: r.error.message } : r.data; });
    })).then(function () {
      var blob = new Blob([JSON.stringify(aus, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "einteilungen_daten_" + (profil.slug || "konto") + ".json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
  }

  function kontoLoeschen() {
    var eingabe = prompt("Das löscht dein Konto mit Abrechnung, Belegen, Notizen und Push-Abos – endgültig. Zum Bestätigen LÖSCHEN eingeben:");
    if (eingabe !== "LÖSCHEN") return;
    sb.rpc("konto_loeschen").then(function (r) {
      if (r.error) { meldung("Löschen fehlgeschlagen: " + fehlerText(r.error), "warn"); return; }
      session = null; profil = null; profilVersprechen = null; einsaetze = {};
      try { sb.auth.signOut(); } catch (e) {}
      meldung("Konto gelöscht.", "gut");
      zeigeAnmeldung();
    });
  }

  // ---- Ankuendigungen (Admin schreibt, alle lesen; "gelesen" bleibt im Geraet)

  function gelesenLesen() { try { return JSON.parse(localStorage.getItem("mg_gelesen") || "{}"); } catch (e) { return {}; } }
  function gelesenMerken(ids) {
    var g = gelesenLesen(); ids.forEach(function (id) { g[id] = 1; });
    try { localStorage.setItem("mg_gelesen", JSON.stringify(g)); } catch (e) {}
  }

  function zeigeInfo() {
    leeren(inhalt);
    inhalt.appendChild(skelett(2));
    var heute = isoTag(new Date());
    sb.from("ankuendigungen").select("*").order("angelegt", { ascending: false }).then(function (r) {
      if (r.error) throw r.error;
      var alle = (r.data || []).filter(function (a) { return (!a.bis || a.bis >= heute) && (!a.termin || a.termin >= heute || (a.bis && a.bis >= heute)); });
      var gelesen = gelesenLesen();
      leeren(inhalt);
      if (profil.admin) inhalt.appendChild(ankuendigungFormular());
      if (!alle.length) inhalt.appendChild(h("p", { class: "leer", text: "Keine Ankündigungen." }));
      alle.forEach(function (a) {
        var d = new Date(a.angelegt);
        var karte = h("div", { class: "spiel karte" + (a.wichtig ? " neu" : "") }, [
          h("div", { class: "kopfzeile" }, [
            h("span", { class: "datum" }, [datum(d) + " · " + a.name, gelesen[a.id] ? null : h("span", { class: "status aus", style: "margin-left:6px", text: "neu" })]),
            a.wichtig ? h("span", { class: "rolle HSR", text: "wichtig" }) : null
          ]),
          h("div", { class: "paarung", text: (a.termin ? a.termin.split("-").reverse().join(".") + " · " : "") + a.titel }),
          h("div", { style: "white-space:pre-wrap; margin-top:4px", text: a.text }),
          a.bis ? h("div", { class: "meta", text: "gilt bis " + a.bis.split("-").reverse().join(".") }) : null,
          profil.admin ? h("div", { class: "zweit" }, [
            h("button", { type: "button", text: "Löschen", onclick: function () {
              if (!confirm("Ankündigung löschen?")) return;
              sb.from("ankuendigungen").delete().eq("id", a.id).then(function () { zeigeInfo(); });
            } }),
            a.push && !a.push_gesendet ? h("span", { class: "meta", style: "align-self:center", text: "Push geht beim nächsten Lauf raus (bis 30 Min.)" }) : null
          ]) : null
        ]);
        inhalt.appendChild(karte);
      });
      gelesenMerken(alle.map(function (a) { return a.id; }));
      zaehler().then(zaehlerAnzeigen);
    }).catch(function (e) { leeren(inhalt); inhalt.appendChild(h("p", { class: "achtung", text: "Ankündigungen nicht ladbar: " + fehlerText(e) })); });
  }

  function ankuendigungFormular() {
    var titel = h("input", { type: "text", placeholder: "Überschrift", maxlength: "120" });
    var text = h("textarea", { rows: "4", placeholder: "Text – Lehrgang, Regeltest, Sitzung, Hinweise …", maxlength: "4000" });
    var bis = h("input", { type: "date" });
    var termin = h("input", { type: "date" });
    var wichtig = h("input", { type: "checkbox" });
    var push = h("input", { type: "checkbox" });
    var knopf = h("button", { type: "button", class: "mg-haupt", text: "Veröffentlichen", onclick: function () {
      if (!titel.value.trim() || !text.value.trim()) { meldung("Überschrift und Text bitte ausfüllen.", "warn"); return; }
      knopf.disabled = true;
      sb.from("ankuendigungen").insert({ user_id: session.user.id, name: profil.name || profil.slug, titel: titel.value.trim(), text: text.value.trim(),
                                          wichtig: wichtig.checked, push: push.checked, bis: bis.value || null, termin: termin.value || null })
        .then(function (r) {
          knopf.disabled = false;
          if (r.error) { meldung(fehlerText(r.error), "warn"); return; }
          kurzMeldung("Veröffentlicht ✓" + (push.checked ? " – Push folgt beim nächsten Lauf." : ""), "gut"); zeigeInfo();
        });
    } });
    return h("details", { class: "karte", style: "padding:0 14px; margin-bottom:12px" }, [
      h("summary", { style: "padding:12px 0; font-weight:800; cursor:pointer", text: "Neue Ankündigung" }),
      h("div", { class: "mg-form", style: "padding-bottom:12px" }, [
        titel, text,
        h("div", { class: "mg-felder" }, [h("label", {}, ["Termin (optional)", termin]), h("label", {}, ["gilt bis (optional)", bis])]),
        h("p", { class: "meta", style: "margin:0", text: "Mit Termin erscheint die Ankündigung auf der Startseite unter „Nächste Termine“, und alle mit Push bekommen am Vortag eine Erinnerung." }),
        h("div", { class: "mg-schalter" }, [
          h("label", { class: "mg-check" }, [wichtig, " wichtig (hervorgehoben)"]),
          h("label", { class: "mg-check" }, [push, " auch als Push an alle mit Push"])
        ]),
        knopf
      ])
    ]);
  }

  // ---- Monatsabrechnung als E-Mail (mailto, Text mit Tabelle)

  function monatsMail(spiele, d) {
    var zeilen = [], summe = 0, km = 0, fahrt = 0;
    spiele.slice().reverse().forEach(function (sp) {
      var e = einsaetze[sp.kennung] || {}, b = betragFuer(sp, e), dd = new Date(sp.beginn);
      summe += b.betrag || 0; km += e.km || 0; fahrt += fahrtkosten(e);
      zeilen.push(dd.toLocaleDateString("de-DE") + " " + uhr(dd) + "  " + (sp.liga ? sp.liga + " " : "") + sp.paarung + " (" + (sp.rolle || "SR") + (sp.system >= 3 ? ", " + sp.system + "er" : "") + ")" +
        (sp.halle ? "\n    " + sp.halle : "") +
        "\n    Vergütung " + euro(b.betrag || 0) + (b.zeit ? " inkl. +20 % Uhrzeit" : "") + (b.ueber ? " inkl. übergreifend" : "") + (e.ausgefallen ? " (50 %, vor Ort ausgefallen)" : "") +
        (e.km != null ? " · " + e.km + " km einfach, Fahrt " + euro(fahrtkosten(e)) : "") + (e.auslagen ? " · Auslagen " + euro(e.auslagen) : ""));
    });
    var monat = MONATE[d.getMonth()] + " " + d.getFullYear();
    var text = "Hallo,\n\nanbei meine Abrechnung für " + monat + ":\n\n" + zeilen.join("\n\n") +
      "\n\nSumme Vergütung: " + euro(summe) + "\nKilometer (einfach): " + Math.round(km) + " km · Fahrtkosten: " + euro(fahrt) +
      "\n\nViele Grüße\n" + (profil.name ? profil.name.split(",").reverse().join(" ").trim() : "");
    var an = profil.obmann_email || "";
    var mailto = "mailto:" + encodeURIComponent(an) + "?subject=" + encodeURIComponent("Abrechnung " + monat + " – " + (profil.name || "")) + "&body=" + encodeURIComponent(text);
    if (mailto.length > 1800 && navigator.share) {
      navigator.share({ title: "Abrechnung " + monat, text: text }).catch(function () {});
    } else {
      location.href = mailto;
    }
    if (!an) kurzMeldung("Empfänger fehlt – Obmann-Adresse unter Konto → Einstellungen eintragen, dann steht sie gleich drin.", "");
  }

  // ---- Fahrtenbuch (Druckansicht fuer das Finanzamt)

  function zeigeFahrtenbuch() {
    leeren(inhalt);
    var alle = alleSpiele().filter(function (sp) { var e = einsaetze[sp.kennung]; return e && e.km != null; });
    var jahre = [];
    alle.forEach(function (sp) { var j = new Date(sp.beginn).getFullYear(); if (jahre.indexOf(j) < 0) jahre.push(j); });
    jahre.sort().reverse();
    if (!jahre.length) jahre.push(new Date().getFullYear());
    var jahr = jahre[0];
    var wahl = h("select", { class: "mg-select", onchange: function (ev) { jahr = parseInt(ev.target.value, 10); rendern(); } },
      jahre.map(function (j) { return h("option", { value: String(j), text: "Steuerjahr " + j }); }));
    var box = h("div", { class: "fahrtenbuch" });
    var einfach = (profil.km_modell || "einfach") === "einfach";
    function rendern() {
      leeren(box);
      var liste = alle.filter(function (sp) { return new Date(sp.beginn).getFullYear() === jahr; }).sort(function (a, b) { return a.beginn < b.beginn ? -1 : 1; });
      var summeKm = 0, summeGeld = 0;
      var tabelle = h("table", {}, [h("thead", {}, [h("tr", {}, [
        h("th", { text: "Datum" }), h("th", { text: "Von" }), h("th", { text: "Nach" }), h("th", { text: "Zweck" }),
        h("th", { class: "zahl", text: einfach ? "km einfach" : "km gefahren" }), h("th", { class: "zahl", text: "Betrag" })])])]);
      var tb = h("tbody");
      liste.forEach(function (sp) {
        var e = einsaetze[sp.kennung], dd = new Date(sp.beginn), kmWert = einfach ? Math.floor(e.km) : e.km * 2, geld = fahrtkosten(e);
        summeKm += kmWert; summeGeld += geld;
        var adresse = (ctx.daten.adressen && ctx.daten.adressen[sp.halle]) || "";
        tb.appendChild(h("tr", {}, [
          h("td", { text: dd.toLocaleDateString("de-DE") }),
          h("td", { text: profil.heimat || "Wohnung" }),
          h("td", { text: (sp.halle || "Halle") + (adresse ? ", " + adresse : "") }),
          h("td", { text: "Schiedsrichtereinsatz " + (sp.liga ? sp.liga + " " : "") + sp.paarung + " (" + (sp.rolle || "SR") + ")" }),
          h("td", { class: "zahl", text: String(Math.round(kmWert * 10) / 10).replace(".", ",") }),
          h("td", { class: "zahl", text: euro(geld) })
        ]));
      });
      tb.appendChild(h("tr", {}, [h("td", {}), h("td", {}), h("td", {}), h("td", {}, [h("b", { text: liste.length + " Fahrten" })]),
        h("td", { class: "zahl" }, [h("b", { text: String(Math.round(summeKm)) })]), h("td", { class: "zahl" }, [h("b", { text: euro(summeGeld) })])]));
      tabelle.appendChild(tb);
      box.appendChild(h("h3", { class: "abschnitt", text: "Fahrtenbuch " + jahr + " · " + (profil.name || "") }));
      box.appendChild(h("p", { class: "meta", text: (einfach ? "Entfernungspauschale: einfache Strecke, volle Kilometer, " + euro(profil.satz_einfach != null ? profil.satz_einfach : 0.38) + "/km."
        : "Reisekosten: gefahrene Kilometer (hin und zurück), " + euro(profil.satz_hinrueck != null ? profil.satz_hinrueck : 0.30) + "/km.") +
        " Strecken laut Routendienst (OSRM) bzw. eigener Eintrag. Erstellt " + new Date().toLocaleDateString("de-DE") + "." }));
      if (!liste.length) box.appendChild(h("p", { class: "leer", text: "Keine Fahrten mit km-Angabe in diesem Jahr." }));
      else box.appendChild(h("div", { style: "overflow-x:auto" }, [tabelle]));
    }
    rendern();
    inhalt.appendChild(h("div", { class: "mg-form" }, [wahl]));
    inhalt.appendChild(h("div", { class: "zweit fahrtenbuch" }, [
      h("button", { type: "button", text: "Drucken / PDF", onclick: function () {
        document.body.classList.add("druck-fahrtenbuch");
        var weg = function () { document.body.classList.remove("druck-fahrtenbuch"); window.removeEventListener("afterprint", weg); };
        window.addEventListener("afterprint", weg);
        window.print();
      } }),
      h("button", { type: "button", text: "Zurück zur Abrechnung", onclick: function () { zeigeReiter("abrechnung"); } })
    ]));
    inhalt.appendChild(h("div", { class: "karte fahrtenbuch", style: "padding:4px 14px 12px" }, [box]));
  }

  // ---- Hallen-Hinweise fuer die Hallen-Seite (index.html)

  function hallenHinweise(halle, ziel) {
    leeren(ziel);
    if (!fn("hallen")) return;
    if (!session || !frei()) { ziel.appendChild(h("p", { class: "meta", text: "Hallen-Hinweise gibt es nach der Freischaltung." })); return; }
    extrasLaden([{ halle: halle, beginn: "", paarung: "", gespann: [] }]).then(function () {
      var liste = cache.hallen[halle] || [];
      var box = h("div", { class: "karte", style: "padding:12px 14px; margin-bottom:12px" });
      box.appendChild(h("h4", { style: "margin:0 0 6px; font-size:.95rem", text: "Hallen-Hinweise (" + liste.length + ")" }));
      if (!liste.length) box.appendChild(h("p", { class: "meta", text: "Noch nichts eingetragen – Parken, Kabineneingang, Schlüssel, Kantine." }));
      liste.forEach(function (n) {
        box.appendChild(h("div", { class: "kandidat" }, [h("div", { text: n.text }), h("div", { class: "meta", text: n.name + " · " + new Date(n.angelegt).toLocaleDateString("de-DE") })]));
      });
      var neu = h("textarea", { rows: "2", placeholder: "Hinweis hinzufügen …", maxlength: "500" });
      box.appendChild(h("div", { class: "mg-form", style: "margin-top:8px" }, [neu, h("button", { type: "button", class: "anfrage", text: "Hinweis speichern", onclick: function () {
        var t = neu.value.trim(); if (!t) return;
        sb.from("hallen_notizen").insert({ user_id: session.user.id, slug: profil.slug, name: profil.name || profil.slug, halle: halle, text: t }).select()
          .then(function (r) { if (r.error) { meldung(fehlerText(r.error), "warn"); return; }
            delete cache.geladen["h|" + halle]; kurzMeldung("Hinweis gespeichert ✓", "gut"); hallenHinweise(halle, ziel); });
      } })]));
      ziel.appendChild(box);
    });
  }

  // Naechste Termine (Ankuendigungen mit Datum) fuer die Startseite
  function termine() {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) return [];
      return ladeProfil().then(function () {
        if (!frei()) return [];
        var heute = isoTag(new Date());
        return sb.from("ankuendigungen").select("id,titel,termin,wichtig").gte("termin", heute).order("termin").limit(5)
          .then(function (r) { return r.data || []; });
      });
    }).catch(function () { return []; });
  }

  // Obmann-Adresse aus dem Profil (fuer Mails von der Spielseite)
  function obmann() {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) return null;
      return ladeProfil().then(function () { return (profil && profil.obmann_email) || null; });
    }).catch(function () { return null; });
  }

  // Heimatkoordinaten fuer Hallenkarte und Abfahrtsdatei
  function heimat() {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) return null;
      return ladeProfil().then(function () { return profil && profil.heimat_lat != null ? { lat: profil.heimat_lat, lon: profil.heimat_lon } : null; });
    }).catch(function () { return null; });
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
           extrasLaden: extrasLaden, spielExtras: spielExtras, abfahrt: abfahrt, zaehler: zaehler, hallenHinweise: hallenHinweise, heimat: heimat, obmann: obmann, termine: termine,
           einstellungenSpeichern: einstellungenSpeichern, radar: radar, angebotMachen: angebotMachen,
           kontakteFuer: kontakteFuer, hinweisAnzahl: hinweisAnzahl };
})();
