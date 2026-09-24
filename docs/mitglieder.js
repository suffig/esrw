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
  var reiter = "abrechnung", gewaehlteSaison = null, nurOffene = false, verfuegbareReiter = [], kontoZiel = null;
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
  function kennungVon(s) { return s.id || (s.beginn + "|" + s.paarung); }
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
  // Admin-Modus: wer Admin ist, kann die Zusatzfunktionen oben abschalten und
  // die App wie ein normaler Schiedsrichter benutzen. Rechte bleiben, nur die
  // Oberflaeche ist ruhiger.
  function adminModus() { return !(ctx && ctx.lesen && ctx.lesen("adminaus") === "1"); }
  function istAdminAn() { return !!(profil && profil.admin && adminModus()); }
  // Funktion vom Betreiber eingeschaltet? (Schalter kommen aus app.js)
  function fn(k) { return ctx && ctx.funktion ? ctx.funktion(k) : true; }
  // Einfache Ansicht (Schalter in den Einstellungen, siehe app.js)
  function einfach() { return !!(ctx && ctx.lesen && ctx.lesen("einfach") === "1"); }
  var REITER_FUNKTION = { abrechnung: "abrechnung", info: "info", tausch: "tausch", frei: "frei", notizen: "notizen", kollegen: "telefon" };

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
            case "cs": return Array.isArray(v) && (Array.isArray(f[2]) ? f[2] : [f[2]]).every(function (x) { return v.indexOf(x) >= 0; });
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
        contains: function (f, w) { filter.push([f, "cs", w]); return api; },
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

  // ---- Offline: Profil und Einsaetze zwischenspeichern, Aenderungen in
  // eine Warteschlange legen und beim naechsten Kontakt nachreichen
  function lokalLesen(k, std) { try { return JSON.parse(localStorage.getItem(k)) || std; } catch (e) { return std; } }
  function lokalSchreiben(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function netzFehler(e) { var m = String((e && e.message) || e || ""); return !navigator.onLine || /fetch|network|netzwerk|load failed|abort/i.test(m); }
  function warteschlange() { return lokalLesen("mg_queue", {}); }
  function inWarteschlange(zeile) {
    var q = warteschlange(); q[zeile.kennung] = zeile; lokalSchreiben("mg_queue", q);
    kurzMeldung("Offline gespeichert – wird nachgereicht, sobald Netz da ist.", "");
  }
  var nachreichenLaeuft = false;
  function nachreichen() {
    var q = warteschlange(), keys = Object.keys(q);
    if (!keys.length || !sb || !session || nachreichenLaeuft || sb._attrappe) return Promise.resolve(0);
    nachreichenLaeuft = true;
    var n = 0;
    return keys.reduce(function (p, k) {
      return p.then(function () {
        var zeile = Object.assign({}, q[k]); delete zeile.id;
        return sb.from("einsaetze").upsert(zeile, { onConflict: "user_id,kennung" }).select().then(function (r) {
          if (r.error) { if (!netzFehler(r.error)) { delete q[k]; lokalSchreiben("mg_queue", q); } return; }
          delete q[k]; lokalSchreiben("mg_queue", q); n++;
          if (r.data && r.data[0] && einsaetze[k]) einsaetze[k].id = r.data[0].id;
        }).catch(function () {});
      });
    }, Promise.resolve()).then(function () { nachreichenLaeuft = false; if (n) kurzMeldung(n + (n === 1 ? " Änderung" : " Änderungen") + " nachgereicht ✓", "gut"); return n; });
  }
  window.addEventListener("online", function () { setTimeout(function () { nachreichen(); }, 1500); });

  function ladeProfil() {
    if (!session) return Promise.resolve(null);
    if (profil && profil.id === session.user.id) return Promise.resolve(profil);
    if (profilVersprechen) return profilVersprechen;
    profilVersprechen = sb.from("profile").select("*").eq("id", session.user.id).maybeSingle()
      .then(function (r) { if (r.error) throw r.error; profil = r.data; if (profil && !sb._attrappe) lokalSchreiben("mg_profil_cache", profil); return profil; })
      .catch(function (e) {
        profilVersprechen = null;   // naechster Versuch darf neu laden
        var alt = lokalLesen("mg_profil_cache", null);
        if (netzFehler(e) && alt && alt.id === session.user.id) { profil = alt; kurzMeldung("Offline – Stand vom letzten Mal.", ""); return profil; }
        throw e;
      });
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
      h("h2", { text: modus === "registrieren" ? "Konto anlegen" : "Einteilungen ESRW" }),
      h("p", { text: "Die Einteilungen, deine Abrechnung und Push – für Schiedsrichter des ESRW." })
    ]));
    wurzel.appendChild(h("div", { class: "melde karte" }, [form, erneutSenden, wechsel]));
    // Drei Schritte, mehr muss hier nicht stehen.
    wurzel.appendChild(h("div", { class: "melde karte" }, [
      h("h4", { text: "In drei Schritten dabei" }),
      h("ol", { class: "schritte" }, [
        h("li", {}, [h("span", {}, [h("b", { text: "Konto anlegen" }),
          h("small", { text: "E-Mail und ein Passwort – dauert eine Minute." })])]),
        h("li", {}, [h("span", {}, [h("b", { text: "E-Mail bestätigen" }),
          h("small", { text: "Wir schicken dir einen Link. Antippen genügt, danach bist du angemeldet." })])]),
        h("li", {}, [h("span", {}, [h("b", { text: "Freischaltung abwarten" }),
          h("small", { text: "Der Betreiber gibt dich frei – dann siehst du Einteilungen, Abrechnung und alles Weitere." })])])
      ]),
      h("p", { class: "meta", style: "margin:10px 0 0", text: sb && sb._attrappe
        ? "Gerade als Attrappe im Browser – nichts geht raus."
        : "Konto und Daten liegen bei Supabase. Jeder sieht nur seine eigenen Einträge." })
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
    sb.auth.signOut().then(function () {
      session = null; profil = null; profilVersprechen = null; einsaetze = {};
      // Den gemerkten Schluessel mitnehmen - sonst liesse sich der Tresor auf
      // diesem Geraet auch ohne Anmeldung weiter oeffnen.
      try { localStorage.removeItem("tresor"); } catch (e) {}
      zeigeAnmeldung();
    });
  }

  // Schluessel fuer die verschluesselten Dateien in docs/. Die Tabelle
  // "tresor" liest nur, wer freigeschaltet ist - die Regeln stehen in
  // supabase/schema.sql, nicht hier.
  function tresorSchluessel() {
    return bereit().then(function () {
      if (!sb || !session) return null;
      return sb.from("tresor").select("schluessel").eq("id", 1).limit(1)
        .then(function (r) { return (r.data && r.data[0] && r.data[0].schluessel) || null; })
        .catch(function () { return null; });
    }).catch(function () { return null; });
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
    var reiterListe = [["abrechnung", "Abrechnung", "i-euro"], ["info", "Info", "i-bell"], ["tausch", "Tausch", "i-swap"], ["frei", "Verfügbar", "i-cal"], ["notizen", "Notizen", "i-note"], ["kollegen", "Kollegen", "i-users"]]
      .filter(function (t) { return !REITER_FUNKTION[t[0]] || fn(REITER_FUNKTION[t[0]]); });
    verfuegbareReiter = reiterListe.map(function (t) { return t[0]; });
    if (istAdminAn()) reiterListe.push(["admin", "Admin", "i-shield"]);
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
    // Nach dem Wechsel oben anfangen - sonst landet man mitten im neuen Reiter
    if (window.scrollY > 260) window.scrollTo({ top: 0, behavior: "smooth" });
    if (REITER_FUNKTION[name] && !fn(REITER_FUNKTION[name])) {
      inhalt.appendChild(h("p", { class: "leer", text: "Diese Funktion ist zurzeit abgeschaltet." + (istAdminAn() ? " Einschalten: Admin → Funktionen." : "") }));
      return;
    }
    if ((name === "tausch" || name === "frei" || name === "info" || name === "kollegen") && !frei()) {
      inhalt.appendChild(h("p", { class: "leer", text: "Erst nach der Freischaltung durch den Betreiber." }));
      return;
    }
    if (name !== "abrechnung") { auswahlModus = false; auswahl = {}; var al = document.querySelector(".mg-auswahlleiste"); if (al) al.remove(); }
    if (name === "abrechnung") zeigeAbrechnung();
    else if (name === "tausch") zeigeTausch();
    else if (name === "frei") zeigeVerfuegbarkeit();
    else if (name === "notizen") zeigeNotizen();
    else if (name === "info") zeigeInfo();
    else if (name === "kollegen") zeigeTelefonbuch();
    else if (name === "admin" && istAdminAn()) zeigeAdmin();
    else if (name === "konto") zeigeKonto();
    else if (verfuegbareReiter.length && verfuegbareReiter[0] !== name) zeigeReiter(verfuegbareReiter[0]);
    else zeigeKonto();
  }

  // --------------------------------------------------------- Einrichtung

  function zeigeEinrichtung(zurueck) {
    var seite = zurueck === "seite";
    var ziel = seite ? kontoZiel : zurueck && inhalt ? inhalt : wurzel;
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
    var teilen = h("input", { type: "checkbox" });
    sb.from("wohnorte").select("user_id").eq("user_id", session.user.id).maybeSingle().then(function (r) { teilen.checked = !!(r.data); }).catch(function () {});
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
        // Wohnort fuer Fahrgemeinschaften: nur Ort und Lage auf ~1 km gerundet
        if (teilen.checked && lat != null && lon != null) {
          var ort = (heimat.value.split(",").pop() || "").replace(/\d{5}/, "").trim() || null;
          sb.from("wohnorte").upsert({ user_id: session.user.id, slug: zeile.slug, ort: ort, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, geaendert: new Date().toISOString() }, { onConflict: "user_id" })
            .then(function (r2) { if (r2.error) meldung(fehlerText(r2.error) + (/wohnorte/.test(r2.error.message || "") ? " – schema.sql (v15) ausführen." : ""), "warn"); });
        } else sb.from("wohnorte").delete().eq("user_id", session.user.id).then(function () {}).catch(function () {});
        document.dispatchEvent(new CustomEvent("mg-profil", { detail: { slug: profil.slug, name: profil.name } }));
        meldung("Gespeichert.", "gut");
        if (!zurueck) document.dispatchEvent(new CustomEvent("mg-neu-konto", { detail: { slug: profil.slug } }));
        if (seite) { ladeEinsaetze().catch(function () {}); kontoNeu(); return; }
        ladeEinsaetze().then(function () { rahmen(); zeigeReiter(zurueck ? "konto" : "abrechnung"); });
      });
    } }, [
      h("h4", { text: zurueck ? "Profil" : "Wer bist du?" }),
      h("label", { text: "Dein Name auf esrw.de" }), auswahl,
      h("label", { text: "Heimatadresse – Startpunkt für die Strecke zur Halle" }),
      h("div", { class: "mg-zeile" }, [heimat, suchen]), koord,
      h("label", { class: "mg-check", style: "margin-top:8px" }, [teilen, " Wohnort für Fahrgemeinschaften teilen – Kollegen sehen nur den Ort und die Lage auf etwa einen Kilometer, keine Adresse. Dann schlägt „Zusammen fahren“ vor, wer auf dem Weg liegt."]),
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
      zurueck ? h("button", { type: "button", class: "mg-neben", text: "Zurück", onclick: function () { if (seite) kontoNeu(); else zeigeReiter("konto"); } }) : null
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

  // Verpflegungsmehraufwand: 14 EUR ab 8 Stunden Abwesenheit (Abfahrt bis
  // Rueckkehr, Fahrzeit aus der gemerkten Strecke, sonst grob 1 km/min)
  function verpflegungVorschlag(spiel) {
    var modus = (profil && profil.verpflegung_modus) || "aus";
    if (modus === "aus") return null;
    if (modus === "immer") return 14;
    var st = streckeGespeichert(spiel.halle), e = einsaetze[spiel.kennung];
    var fahrt = st && st.minuten ? st.minuten : (e && e.km ? e.km : 0);
    var ende = new Date(spiel.beginn).getTime() + ((ctx.daten.spieldauer_minuten || 150) + 30) * 60000;
    var treff = new Date(spiel.beginn).getTime() - (ctx.daten.vorlauf_minuten || 60) * 60000;
    var stunden = (ende + fahrt * 60000 - (treff - fahrt * 60000)) / 3600000;
    return stunden > 8 ? 14 : null;
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
        // Offline-Aenderungen liegen ueber dem Serverstand, bis sie nachgereicht sind
        var q = warteschlange(); Object.keys(q).forEach(function (k) { einsaetze[k] = Object.assign({}, einsaetze[k] || {}, q[k]); });
        if (!sb._attrappe) lokalSchreiben("mg_einsaetze_cache", r.data || []);
        nachreichen();
      })
      .catch(function (e) {
        if (!netzFehler(e)) throw e;
        einsaetze = {};
        lokalLesen("mg_einsaetze_cache", []).forEach(function (z) { einsaetze[z.kennung] = z; });
        var q = warteschlange(); Object.keys(q).forEach(function (k) { einsaetze[k] = Object.assign({}, einsaetze[k] || {}, q[k]); });
      });
  }

  var dbArchiv = null;
  function ladeArchiv() {
    var web = archivDaten ? Promise.resolve(archivDaten)
      : ctx.hole("archiv.json").catch(function () { return { personen: {}, saisons: [] }; })
        .then(function (a) { archivDaten = a; return a; });
    // Dazu das Archiv aus der Datenbank (spiele_archiv, vom Workflow gefuellt)
    var db = dbArchiv || !profil || !profil.slug ? Promise.resolve(dbArchiv || []) :
      sb.from("spiele_archiv").select("kennung,beginn,liga,paarung,halle,system,besetzung,saison").contains("slugs", [profil.slug])
        .then(function (r) { dbArchiv = r.data || []; return dbArchiv; }).catch(function () { dbArchiv = []; return dbArchiv; });
    return Promise.all([web, db]).then(function (r) { return r[0]; });
  }
  // Eingefrorene Saison-Dateien (docs/archiv/<saison>.json), je Saison einmal
  var saisonDateien = {};
  function saisonLaden(saison) {
    var datei = archivDaten && archivDaten.dateien && archivDaten.dateien[saison];
    if (!datei || saisonDateien[saison]) return Promise.resolve(saisonDateien[saison] || null);
    return ctx.hole(datei).then(function (d) {
      var meine = (d.spiele || []).filter(function (z) { return (z[4] || []).some(function (b) { return b[1] === profil.slug; }); })
        .map(function (z) { var ich = z[4].filter(function (b) { return b[1] === profil.slug; })[0]; return { beginn: z[0], liga: z[1], paarung: z[2], halle: z[3], rolle: ich ? ich[2] : "SR", system: z[4].length, saison: saison }; });
      saisonDateien[saison] = meine; return meine;
    }).catch(function () { saisonDateien[saison] = []; return []; });
  }
  function saisonAus(beginn) { var d = new Date(beginn), j = d.getFullYear(); return d.getMonth() >= 6 ? j + "/" + String(j + 1).slice(2) : (j - 1) + "/" + String(j).slice(2); }

  function saisonen() {
    var liste = ((archivDaten && archivDaten.saisons) || []).slice();
    if (ctx.daten.saison && liste.indexOf(ctx.daten.saison) < 0) liste.push(ctx.daten.saison);
    Object.keys((archivDaten && archivDaten.dateien) || {}).forEach(function (sn) { if (liste.indexOf(sn) < 0) liste.push(sn); });
    (dbArchiv || []).forEach(function (s) { var sn = s.saison || saisonAus(s.beginn); if (liste.indexOf(sn) < 0) liste.push(sn); });
    Object.keys(einsaetze).forEach(function (k) { var e = einsaetze[k]; if (e.privat && e.beginn) { var sn = saisonAus(e.beginn); if (liste.indexOf(sn) < 0) liste.push(sn); } });
    return liste.sort().reverse();
  }

  // Alle Spiele der Person ueber alle Saisons, Archiv und aktuelle Daten
  // zusammengelegt; neueste zuerst.
  function alleSpiele() {
    var person = ctx.personMit(profil.slug);
    var karte = {};
    // 1) Datenbank-Archiv (alle Spiele aller Personen, vom Workflow gepflegt)
    (dbArchiv || []).forEach(function (s) {
      var ich = (s.besetzung || []).filter(function (b) { return b.slug === profil.slug; })[0];
      karte[s.kennung] = { beginn: s.beginn, liga: s.liga, paarung: s.paarung, halle: s.halle, rolle: ich ? ich.rolle : "SR", system: s.system, saison: s.saison || saisonAus(s.beginn) };
    });
    // 2) Archiv der Webseite (laufende Saison) und eingefrorene Saison-Dateien
    var archiv = ((archivDaten && archivDaten.personen && archivDaten.personen[profil.slug]) || []);
    Object.keys(saisonDateien).forEach(function (sn) { archiv = archiv.concat(saisonDateien[sn] || []); });
    archiv.forEach(function (s) {
      karte[kennungVon(s)] = { beginn: s.beginn, liga: s.liga, paarung: s.paarung, halle: s.halle, rolle: s.rolle, system: s.system, saison: s.saison || ctx.daten.saison };
    });
    // 3) Selbst eingetragene Spiele (nur fuer die Abrechnung)
    Object.keys(einsaetze).forEach(function (k) {
      var e = einsaetze[k]; if (!e.privat) return;
      karte[k] = { beginn: e.beginn, liga: e.liga, paarung: e.paarung, halle: e.halle, rolle: e.rolle, system: e.rolle === "SR" ? 2 : 3, saison: saisonAus(e.beginn), privat: true };
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
      ausgefallen: !!alt.ausgefallen, uebergreifend: !!alt.uebergreifend,
      notiz: alt.notiz || null
    }, alt.id ? { id: alt.id } : {}, alt.belege !== undefined ? { belege: alt.belege } : {},
       // Neue Spalten (v14) nur mitschicken, wenn sie gebraucht werden - sonst
       // scheitert jedes Speichern, solange das Schema nicht nachgezogen ist
       alt.verpflegung != null ? { verpflegung: alt.verpflegung } : {}, alt.privat ? { privat: true } : {}, aenderung);
    einsaetze[spiel.kennung] = zeile;
    aktualisiereSummen();
    aktualisiereZeile(spiel);
    clearTimeout(speicherTimer[spiel.kennung]);
    speicherTimer[spiel.kennung] = setTimeout(function () {
      sb.from("einsaetze").upsert(zeile, { onConflict: "user_id,kennung" }).select().then(function (r) {
        if (r.error) { if (netzFehler(r.error)) { inWarteschlange(zeile); return; } meldung("Speichern fehlgeschlagen: " + fehlerText(r.error), "warn"); return; }
        if (r.data && r.data[0] && r.data[0].id) einsaetze[spiel.kennung].id = r.data[0].id;
        kurzMeldung("Gespeichert ✓", "gut");
      }).catch(function (e) { if (netzFehler(e)) inWarteschlange(zeile); else meldung("Speichern fehlgeschlagen: " + fehlerText(e), "warn"); });
    }, 600);
  }

  // Die Abrechnung ist eine private Aufstellung - es gibt keinen Status
  // "offen/abgerechnet" mehr; zaehlt nur, ob Vergütung und km erfasst sind.
  function summen(spiele, filter) {
    var s = { spiele: 0, km: 0, fahrt: 0, verg: 0, ausl: 0, verpf: 0 };
    spiele.forEach(function (sp) {
      if (filter && !filter(sp)) return;
      var e = einsaetze[sp.kennung];
      if (!e) return;
      s.spiele++;
      s.km += e.km || 0;
      s.fahrt += fahrtkosten(e);
      var b = betragFuer(sp, e).betrag || 0;
      s.verg += b; s.ausl += e.auslagen || 0; s.verpf += e.verpflegung || 0;

    });
    return s;
  }

  // Summen als Zeilen: auf dem Handy passt "Fahrtkosten" neben den Betrag,
  // im Kachelraster brach die Beschriftung um und lief ineinander.
  function summenBox(titel, s, monate) {
    var box = h("div", {}, [h("h3", { class: "abschnitt", text: titel })]);
    var einfach = (profil.km_modell || "einfach") === "einfach";
    var karte = h("div", { class: "karte summenliste" });
    karte.appendChild(h("div", { class: "kopfzahl" }, [
      h("b", { text: euro(s.verg - s.fahrt - s.verpf - s.ausl) }),
      h("span", { text: "Saldo · " + s.spiele + (s.spiele === 1 ? " Spiel" : " Spiele") })
    ]));
    [["Vergütung", euro(s.verg)],
     ["Fahrtkosten", euro(s.fahrt)],
     [einfach ? "Strecke (einfach)" : "Strecke (hin und zurück)", Math.round(einfach ? s.km : s.km * 2) + " km"],
     ["Verpflegungsmehraufwand", euro(s.verpf)],
     ["Auslagen", euro(s.ausl)]
    ].forEach(function (p) {
      karte.appendChild(h("div", { class: "reihe-zahl" }, [h("span", { text: p[0] }), h("b", { text: String(p[1]) })]));
    });
    var z = h("div", { class: "reihe-zahl tippbar" }, [h("span", { text: "Spiele mit Betrag" }), h("b", { text: String(s.spiele) })]);
    z.title = "Antippen: alle Spiele zeigen";
    z.addEventListener("click", function () { nurOffene = false; rendereAbrechnung(); });
    karte.appendChild(z);
    box.appendChild(karte);
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
    var kosten = sS.fahrt + sS.verpf + sS.ausl;
    [["Vergütung", euro(sS.verg), null, ""], ["Kosten", euro(kosten), null, ""],
     ["Saldo", euro(sS.verg - kosten), function () { abrechnungPanel = "detail"; rendereAbrechnung(); }, sS.verg - kosten < 0 ? "offen" : "offen fertig"]
    ].forEach(function (p) {
      var k = h("div", { class: "zahl karte " + p[3] + (p[2] ? " tippbar" : "") }, [h("b", { text: p[1] }), h("span", { text: p[0] })]);
      if (p[2]) { k.style.cursor = "pointer"; k.title = "Antippen: Steuerjahre"; k.addEventListener("click", p[2]); }
      saldo.appendChild(k);
    });
    var neu = h("div", { class: "mg-summenblock" }, [saldo]);
    alt.parentNode.replaceChild(neu, alt);
    // Offenes Detail-Panel mitziehen
    var panel = wurzel.querySelector(".mg-panel");
    if (panel && abrechnungPanel === "detail") { leeren(panel); panel.appendChild(summenDetails()); }
  }
  function summenDetails() {
    var spiele = saisonSpiele(gewaehlteSaison), alle = alleSpiele(), sS = summen(spiele);
    var jahre = [];
    spiele.forEach(function (sp) { var j = new Date(sp.beginn).getFullYear(); if (jahre.indexOf(j) < 0) jahre.push(j); });
    if (!jahre.length) jahre.push(new Date().getFullYear());
    var det = h("div", {});
    det.appendChild(summenBox("Saison " + (gewaehlteSaison || ""), sS));
    jahre.sort().reverse().forEach(function (jahr) {
      var monate = [];
      for (var m = 0; m < 12; m++) {
        var s = summen(alle, function (sp) { var d = new Date(sp.beginn); return d.getFullYear() === jahr && d.getMonth() === m; });
        monate.push({ monat: m, spiele: s.spiele, verg: s.verg, km: s.km });
      }
      var jahrBox = summenBox("Steuerjahr " + jahr, summen(alle, function (sp) { return new Date(sp.beginn).getFullYear() === jahr; }), monate);
      var imJahr = alle.filter(function (sp) { return new Date(sp.beginn).getFullYear() === jahr; });
      jahrBox.appendChild(h("div", { class: "zweit", style: "margin-top:8px" }, [
        h("button", { type: "button", text: "Jahr " + jahr + " als CSV", onclick: function () { csvExport(imJahr.slice().sort(function (a, b) { return a.beginn < b.beginn ? -1 : 1; }), "Steuerjahr_" + jahr); } }),
        h("button", { type: "button", text: "Jahresblatt drucken", onclick: function () { zeigeJahresblatt(jahr); } })
      ]));
      det.appendChild(jahrBox);
    });
    return det;
  }


  // ================================================================
  // Gebuehrenabrechnung: das Formular des EHV NRW als fertiges PDF
  // ================================================================
  // Die eigenen Daten stehen im Konto (profile.einstellungen.rechnung),
  // die Vereinsadressen teilen sich alle Freigeschalteten, und die
  // geschriebenen Rechnungen liegen in "rechnungen" - damit die Nummern
  // fortlaufen und man spaeter nachsehen kann.
  var rechnungGeladen = null, rechnungWahl = {}, vereinAdressen = null, rechnungListe = null, rechnungFertig = null, rechnungForm = null;
  function rechnungenLaden() {
    if (rechnungListe) return Promise.resolve(rechnungListe);
    return sb.from("rechnungen").select("nummer,datum,verein,betrag,kennungen,felder").order("datum", { ascending: false }).limit(40)
      .then(function (r) { rechnungListe = r.data || []; return rechnungListe; })
      .catch(function () { rechnungListe = []; return rechnungListe; });
  }
  function ladeRechnung() {
    if (!rechnungGeladen) {
      rechnungGeladen = new Promise(function (ok, nein) {
        if (window.Rechnung) return ok(window.Rechnung);
        var s = document.createElement("script"); s.src = "rechnung.js?v=1";
        s.onload = function () { ok(window.Rechnung); };
        s.onerror = function () { rechnungGeladen = null; nein(new Error("rechnung.js nicht ladbar")); };
        document.head.appendChild(s);
      });
    }
    return rechnungGeladen;
  }
  function rechnungDaten() {
    var e = (profil && profil.einstellungen) || {};
    return e.rechnung || {};
  }
  function rechnungDatenSpeichern(obj) {
    var e = {}; var alt = (profil && profil.einstellungen) || {};
    Object.keys(alt).forEach(function (k) { e[k] = alt[k]; });
    e.rechnung = obj;
    return einstellungenSpeichern(e);
  }
  function vereinAdressenLaden() {
    if (vereinAdressen) return Promise.resolve(vereinAdressen);
    return sb.from("vereine_adressen").select("verein,name,strasse,plz_ort").then(function (r) {
      vereinAdressen = {};
      (r.data || []).forEach(function (v) { vereinAdressen[v.verein] = v; });
      return vereinAdressen;
    }).catch(function () { vereinAdressen = {}; return vereinAdressen; });
  }
  // Heimverein eines Spiels: alles vor dem Gedankenstrich
  function heimVereinVon(spiel) {
    var p = String(spiel.paarung || "");
    var t = p.split(/\s+[-\u2013]\s+/);
    return (t[0] || p).trim();
  }
  function gastVereinVon(spiel) {
    var p = String(spiel.paarung || "");
    var t = p.split(/\s+[-\u2013]\s+/);
    return (t[1] || "").trim();
  }
  function euroZahl(n) { return (Math.round(n * 100) / 100).toFixed(2).replace(".", ","); }

  // Betrag fuer die Rechnung: aus der eigenen Abrechnung, sonst nach der
  // Gebuehrenordnung geschaetzt - damit sich auch kommende Spiele abrechnen
  // lassen, bevor man sie erfasst hat.
  function rechnungBetrag(sp) {
    var e = einsaetze[sp.kennung];
    if (e) {
      var b = betragFuer(sp, e);
      if (b.betrag != null) { b.geschaetzt = false; return b; }
    }
    var g = grundgebuehr(sp);
    if (g == null) return null;
    var zeit = zeitzuschlag(sp) && gebuehren && gebuehren.zuschlag_zeit
      ? g * ((gebuehren.zuschlag_zeit.prozent || 0) / 100) : 0;
    return { grund: g, zeit: zeit, ueber: 0, ausfall: 0, betrag: g + zeit, geschaetzt: true };
  }

  function rechnungSpiele() {
    return alleSpiele().filter(function (sp) { return rechnungBetrag(sp) != null; })
      .sort(function (a, b) { return a.beginn < b.beginn ? 1 : -1; }).slice(0, 80);
  }

  // Alles, was auf dem Formular steht, liegt hier - damit ein Neuzeichnen
  // (Haken gesetzt, Spiel dazu) nichts von Hand Eingetragenem wegwirft.
  function rechnungFormLeer() {
    return { verein: "", name: "", strasse: "", plz_ort: "",
             zeilen: [["", ""], ["", ""], ["", ""]],
             datum: new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
             ort: "", klasse: "", pauschale: "", zuschlag: "", klein: null, kennungen: [],
             nummer: "", nummerManuell: false };
  }
  // Aus der Auswahl ableiten, was ableitbar ist - von Hand Geaendertes am
  // Empfaenger bleibt stehen, solange der Verein derselbe ist.
  function rechnungFormAusWahl() {
    var f = rechnungForm || rechnungFormLeer();
    var gewaehlt = Object.keys(rechnungWahl).map(function (k) { return rechnungWahl[k]; })
      .sort(function (a, b) { return a.beginn < b.beginn ? -1 : 1; });
    if (!gewaehlt.length) { f.kennungen = []; if (!f.nummerManuell) f.nummer = nummerVorschlag(f); return f; }
    var verein = heimVereinVon(gewaehlt[0]);
    if (f.verein !== verein) { f.verein = verein; f.name = verein; f.strasse = ""; f.plz_ort = ""; f._adresseHolen = true; }
    f.zeilen = [0, 1, 2].map(function (i) {
      var sp = gewaehlt[i];
      return sp ? [heimVereinVon(sp), gastVereinVon(sp)] : (f.zeilen[i] && !f.kennungen.length ? f.zeilen[i] : ["", ""]);
    });
    var d0 = new Date(gewaehlt[0].beginn);
    f.datum = d0.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    f.ort = gewaehlt[0].halle || "";
    f.klasse = gewaehlt[0].liga || "";
    var p = 0, z = 0;
    gewaehlt.forEach(function (sp) { var b = rechnungBetrag(sp); p += (b.betrag || 0) - (b.zeit || 0); z += b.zeit || 0; });
    f.pauschale = (Math.round(p * 100) / 100).toFixed(2);
    f.zuschlag = z ? (Math.round(z * 100) / 100).toFixed(2) : "";
    f.kennungen = gewaehlt.map(function (sp) { return sp.kennung; });
    if (!f.nummerManuell) f.nummer = nummerVorschlag(f);
    return f;
  }

  // Vorschlag fuer die laufende Nummer. Das Jahr kommt aus dem Spiel (eine
  // Rechnung fuer ein Spiel im Dezember gehoert in dessen Jahr), die Zahl
  // dahinter aus dem, was in diesem Jahr schon geschrieben wurde. Wer eine
  // andere Nummer braucht, schreibt sie einfach ins Feld.
  function nummerVorschlag(f) {
    var stamm = rechnungDaten();
    var k = ((f && f.kennungen) || [])[0], sp = k && rechnungWahl[k];
    var jahr = (sp ? new Date(sp.beginn) : new Date()).getFullYear();
    var praefix = stamm.praefix != null && stamm.praefix !== "" ? String(stamm.praefix) : jahr + "-";
    if (/\d{4}/.test(praefix)) praefix = praefix.replace(/\d{4}/, String(jahr));
    var hoechste = 0;
    (rechnungListe || []).forEach(function (rg) {
      var s = String(rg.nummer || "");
      if (s.indexOf(praefix) !== 0) return;
      var n = parseInt(s.slice(praefix.length).replace(/\D/g, ""), 10);
      if (n > hoechste) hoechste = n;
    });
    var zahl = Math.max(hoechste + 1, parseInt(stamm.nummer, 10) || 1);
    return praefix + String(zahl).padStart(3, "0");
  }

  // Von aussen (Spielseite, Abrechnungsliste): dieses Spiel vormerken und das
  // Rechnungsblatt oeffnen.
  function rechnungSprung(kennung) {
    return ladeArchiv().then(function () {
      var sp = alleSpiele().filter(function (x) { return x.kennung === kennung; })[0];
      if (!sp) { meldung("Spiel nicht gefunden.", "warn"); return false; }
      rechnungWahl = {}; rechnungWahl[kennung] = sp;
      rechnungForm = rechnungFormAusWahl();
      abrechnungPanel = "rechnung";
      rendereAbrechnung();
      setTimeout(function () {
        var p = wurzel.querySelector(".mg-panel");
        if (p) p.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 250);
      return true;
    });
  }

  function rechnungPanel() {
    var box = h("div", { class: "rechnungsblatt" });
    var stamm = rechnungDaten();
    if (!rechnungForm) rechnungForm = rechnungFormAusWahl();
    var f = rechnungForm;
    if (f.klein === null) f.klein = stamm.klein !== false;
    if (!f.nummer) f.nummer = nummerVorschlag(f);
    function nochmal() { abrechnungPanel = "rechnung"; rendereAbrechnung(); }

    // ---- gerade fertig --------------------------------------------------
    if (rechnungFertig) {
      var fertig = rechnungFertig;
      box.appendChild(h("div", { class: "hinweis gut" }, [
        h("span", {}, [h("b", { text: "Rechnung " + fertig.nummer + " ist fertig." }),
          h("small", { style: "display:block", text: fertig.name })]),
        h("button", { type: "button", class: "anfrage", text: "Nochmal laden", onclick: function () { pdfHerunterladen(fertig.blob, fertig.name); } })
      ]));
    }

    // ---- Was fehlt noch? ------------------------------------------------
    function betraege() {
      var p = parseFloat(String(f.pauschale).replace(",", ".")) || 0;
      var z = parseFloat(String(f.zuschlag).replace(",", ".")) || 0;
      var ust = f.klein ? 0 : (p + z) * 0.19;
      return { pauschale: p, zuschlag: z, ust: ust, gesamt: p + z + ust, klein: f.klein };
    }
    var stammOk = !!(stamm.name && stamm.strasse && stamm.plz_ort);
    var hatSpiele = !!f.zeilen.filter(function (z) { return z[0] || z[1]; }).length;
    var hatEmpf = !!(f.name && f.strasse && f.plz_ort);
    var hatAngaben = !!(f.nummer && f.datum);
    var hatBetrag = betraege().gesamt > 0;
    // Aufgeklappt ist immer der erste Schritt, der noch offen ist - steht
    // alles, bleibt die Karte zu und man sieht die Rechnung auf einen Blick.
    var offen = !hatSpiele ? 1 : !hatEmpf ? 2 : !hatAngaben ? 3 : !hatBetrag ? 4 : 0;

    // ---- Deine Daten (stehen im Konto) ----------------------------------
    var stammZeile = h("details", { class: "tausch rechnung-steller" }, [
      h("summary", {}, [h("span", { class: "schritt-nr" + (stammOk ? " fertig" : " fehlt"), text: stammOk ? "✓" : "!" }),
        h("span", {}, [h("b", { text: "Deine Daten" }),
          h("small", { text: stammOk ? stamm.name + (stamm.sr_nummer ? " (" + stamm.sr_nummer + ")" : "") + " · " + stamm.plz_ort
                                     : "fehlen noch – hier eintragen" })])])
    ]);
    stammZeile.open = !stammOk;
    stammZeile.appendChild(stammdatenFormular(function () { nochmal(); }));
    box.appendChild(stammZeile);

    var karte = h("div", { class: "karte rechnung-karte" });
    // Vier Schritte, jeder zum Aufklappen: zu sieht man, was drinsteht,
    // offen aendert man es. Der Haken zeigt, was schon vollstaendig ist.
    function gruppe(nr, titel, zusammenfassung, fertigJa) {
      var d = h("details", { class: "tausch rechnung-gruppe" }, [
        h("summary", {}, [
          h("span", { class: "schritt-nr" + (fertigJa ? " fertig" : ""), text: fertigJa ? "✓" : String(nr) }),
          h("span", {}, [h("b", { text: titel }), h("small", { text: zusammenfassung || "noch offen" })])])
      ]);
      d.open = offen === nr;
      karte.appendChild(d);
      return d;
    }
    function feld(schluessel, beschriftung, art) {
      var i = h("input", { type: art || "text", value: f[schluessel] || "" });
      if (art === "number") { i.step = "0.01"; i.min = "0"; }
      i.addEventListener("input", function () { f[schluessel] = i.value; if (art === "number") rechne(); });
      return h("label", { class: "rechnung-feld" }, [h("span", { text: beschriftung }), i]);
    }

    // ---- Schritt 1: Spiele ----------------------------------------------
    // Bei Turnieren und Lehrgaengen gibt es keinen Gast - dann nur den Heimverein.
    var paarungen = f.zeilen.filter(function (z) { return z[0] || z[1]; })
      .map(function (z) { return z[1] ? (z[0] || "?") + " – " + z[1] : (z[0] || "?"); });
    var g1 = gruppe(1, "Spiele", paarungen.length ? paarungen.join(" · ") : "noch keins gewählt", hatSpiele);
    g1.appendChild(h("p", { class: "meta", style: "margin:0 0 6px", text: "Bis zu drei Spiele, ein Verein, ein Tag. Kommende Spiele gehen auch – der Betrag kommt dann aus der Gebührenordnung." }));
    var liste = rechnungSpiele();
    var wahlBox = h("div", { class: "rechnung-wahl" });
    if (!liste.length) wahlBox.appendChild(h("p", { class: "meta", text: "Kein Spiel gefunden, zu dem sich ein Betrag ermitteln lässt." }));
    var jetzt = Date.now();
    liste.slice(0, 25).forEach(function (sp) {
      var b = rechnungBetrag(sp), d = new Date(sp.beginn);
      var c = h("input", { type: "checkbox" });
      c.checked = !!rechnungWahl[sp.kennung];
      c.addEventListener("change", function () {
        if (c.checked) {
          if (Object.keys(rechnungWahl).length >= 3) { c.checked = false; kurzMeldung("Mehr als drei Spiele passen nicht auf das Formular.", "warn"); return; }
          rechnungWahl[sp.kennung] = sp;
        } else delete rechnungWahl[sp.kennung];
        rechnungForm = rechnungFormAusWahl();
        nochmal();
      });
      var zusatz = euro(b.betrag) + (b.geschaetzt ? " · nach Ordnung" : "") + (d.getTime() > jetzt ? " · kommt noch" : "");
      var l = h("label", { class: "rechnung-zeile" }, [
        h("span", {}, [h("b", { text: datumLang(d) + " · " + (sp.liga ? sp.liga + ": " : "") + sp.paarung }),
                       h("small", { text: (sp.halle || "") + " · " + zusatz })]),
        c]);
      l._kennung = sp.kennung;
      wahlBox.appendChild(l);
    });
    g1.appendChild(wahlBox);

    // Doppelansetzung: die uebrigen Spiele desselben Tages beim selben Verein
    if (f.kennungen.length && f.kennungen.length < 3) {
      var erstes = rechnungWahl[f.kennungen[0]];
      var tag = new Date(erstes.beginn).toDateString();
      var dazu = liste.filter(function (sp) {
        return !rechnungWahl[sp.kennung] && new Date(sp.beginn).toDateString() === tag && heimVereinVon(sp) === f.verein;
      }).slice(0, 3 - f.kennungen.length);
      if (dazu.length) g1.appendChild(h("p", { class: "meta", style: "margin:6px 0 0" }, [
        h("button", { type: "button", class: "textknopf",
          text: "+ " + dazu.length + (dazu.length === 1 ? " weiteres Spiel" : " weitere Spiele") + " an dem Tag dazunehmen",
          onclick: function () { dazu.forEach(function (sp) { rechnungWahl[sp.kennung] = sp; }); rechnungForm = rechnungFormAusWahl(); nochmal(); } })]));
      var vereine = {}, tage = {};
      f.kennungen.forEach(function (k) { var sp = rechnungWahl[k]; vereine[heimVereinVon(sp)] = 1; tage[new Date(sp.beginn).toDateString()] = 1; });
      if (Object.keys(vereine).length > 1 || Object.keys(tage).length > 1) {
        g1.appendChild(h("div", { class: "hinweis warn", style: "margin-top:8px" }, [
          h("span", { text: Object.keys(vereine).length > 1
            ? "Die Spiele gehen an verschiedene Vereine – dafür braucht es je Verein eine eigene Rechnung."
            : "Die Spiele sind an verschiedenen Tagen – das Formular hat nur ein Datumsfeld." })]));
      }
    }
    g1.appendChild(h("p", { class: "meta", style: "margin:12px 0 4px", text: "So stehen sie auf dem Formular:" }));
    f.zeilen.forEach(function (zeile, i) {
      var heim = h("input", { type: "text", value: zeile[0], placeholder: "Heim" });
      var gast = h("input", { type: "text", value: zeile[1], placeholder: "Gast" });
      heim.addEventListener("input", function () { f.zeilen[i][0] = heim.value; });
      gast.addEventListener("input", function () { f.zeilen[i][1] = gast.value; });
      g1.appendChild(h("div", { class: "rechnung-paarung" }, [heim, h("span", { text: "–" }), gast]));
    });

    // ---- Schritt 2: Empfaenger ------------------------------------------
    var g2 = gruppe(2, "Empfänger", [f.name, f.strasse, f.plz_ort].filter(Boolean).join(" · "), hatEmpf);
    ["name", "strasse", "plz_ort"].forEach(function (k, i) {
      g2.appendChild(feld(k, ["Verein", "Straße und Nr.", "PLZ und Ort"][i]));
    });
    if (f._adresseHolen) {
      f._adresseHolen = false;
      vereinAdressenLaden().then(function (map) {
        // "Iserlohner EC 1b" ist derselbe Verein wie "Iserlohner EC" - die
        // Anschrift steht nur einmal da.
        var a = map[f.verein] || map[vereinHaupt(f.verein)];
        if (!a) return;
        if (a.name) f.name = a.name;
        f.strasse = a.strasse || ""; f.plz_ort = a.plz_ort || "";
        if (box.isConnected) nochmal();
      });
    }
    g2.appendChild(h("p", { class: "meta", style: "margin:2px 0 6px" }, [
      h("button", { type: "button", class: "textknopf", text: "Adresse für alle Kollegen merken", onclick: function () {
        if (!f.verein) { meldung("Erst ein Spiel übernehmen – daraus kommt der Verein.", "warn"); return; }
        speichern(sb.from("vereine_adressen").upsert({ verein: f.verein, name: f.name, strasse: f.strasse, plz_ort: f.plz_ort,
                                                       angelegt_von: session.user.id, geaendert: new Date().toISOString() }))
          .then(function (r) {
            if (r && r.error) { meldung(fehlerText(r.error), "warn"); return; }
            vereinAdressen = null; kurzMeldung("Gemerkt ✓ – Kollegen sehen die Adresse auch.", "gut");
          });
      } })]));

    // ---- Schritt 3: Angaben ---------------------------------------------
    var g3 = gruppe(3, "Angaben", [f.nummer, f.datum, f.ort, f.klasse].filter(Boolean).join(" · "), hatAngaben);
    var nummerFeld = h("input", { type: "text", value: f.nummer || "" });
    var nummerHinweis = h("p", { class: "meta", style: "margin:-4px 0 8px", text: "" });
    function nummerPruefen() {
      var doppelt = (rechnungListe || []).filter(function (rg) { return String(rg.nummer) === String(f.nummer); }).length;
      nummerHinweis.className = doppelt ? "achtung" : "meta";
      nummerHinweis.style.margin = "-4px 0 8px";
      nummerHinweis.textContent = doppelt
        ? "Diese Nummer hast du schon einmal vergeben."
        : (f.nummerManuell ? "Von Hand gesetzt." : "Vorgeschlagen aus dem Spiel und deinen bisherigen Rechnungen.");
    }
    nummerFeld.addEventListener("input", function () {
      f.nummer = nummerFeld.value.trim(); f.nummerManuell = true;
      pdfKnopf.textContent = "Rechnung " + (f.nummer || "?") + " als PDF";
      nummerPruefen();
    });
    g3.appendChild(h("label", { class: "rechnung-feld" }, [h("span", { text: "Rechnungsnummer" }), nummerFeld]));
    g3.appendChild(nummerHinweis);
    g3.appendChild(h("p", { class: "meta", style: "margin:-4px 0 10px" }, [
      h("button", { type: "button", class: "textknopf", text: "Vorschlag wieder übernehmen", onclick: function () {
        f.nummerManuell = false; f.nummer = nummerVorschlag(f); nochmal();
      } })]));
    g3.appendChild(feld("datum", "Datum"));
    g3.appendChild(feld("ort", "Spielort"));
    g3.appendChild(feld("klasse", "Spielklasse"));

    // ---- Schritt 4: Betraege --------------------------------------------
    var summe = h("div", { class: "kopfzahl" }, [h("b", { text: "–" }), h("span", { text: "Gesamtbetrag" })]);
    var ustZeile = h("div", { class: "reihe-zahl" }, [h("span", { text: "" }), h("b", { text: "" })]);
    function rechne() {
      var b = betraege();
      summe.firstChild.textContent = euro(b.gesamt);
      ustZeile.firstChild.textContent = b.klein ? "Umsatzsteuer (Kleinunternehmer § 19)" : "+ 19 % Umsatzsteuer";
      ustZeile.lastChild.textContent = b.klein ? "—" : euro(b.ust);
    }
    var g4 = gruppe(4, "Beträge", hatBetrag ? euro(betraege().gesamt) + (f.klein ? " · ohne USt." : " · mit 19 % USt.") : "noch kein Betrag", hatBetrag);
    g4.appendChild(feld("pauschale", "Pauschale (€)", "number"));
    g4.appendChild(feld("zuschlag", "Zuschuss 20 % (€)", "number"));
    g4.appendChild(h("p", { class: "meta", style: "margin:-4px 0 8px",
      text: gebuehren && gebuehren.zuschlag_zeit
        ? "Wird von allein gesetzt, wenn das Spiel um " + gebuehren.zuschlag_zeit.ab_einschliesslich
          + " Uhr oder später bzw. bis " + gebuehren.zuschlag_zeit.bis_einschliesslich + " Uhr beginnt."
        : "" }));
    var kleinSchalter = h("input", { type: "checkbox" }); kleinSchalter.checked = !!f.klein;
    kleinSchalter.addEventListener("change", function () { f.klein = kleinSchalter.checked; rechne(); });
    g4.appendChild(h("label", { class: "schalter", style: "margin-top:6px" }, [kleinSchalter, " Kleinunternehmer nach § 19 UStG (keine Umsatzsteuer)"]));

    karte.appendChild(h("div", { class: "karte summenliste", style: "margin-top:12px" }, [summe, ustZeile]));
    rechne();

    // ---- Der Knopf ------------------------------------------------------
    var mangel = [];
    if (!stammOk) mangel.push("deine eigenen Daten");
    if (!f.name) mangel.push("den Empfänger");
    if (!f.nummer) mangel.push("die Rechnungsnummer");
    if (!hatBetrag) mangel.push("den Betrag");
    if (mangel.length) karte.appendChild(h("div", { class: "hinweis warn", style: "margin-top:12px" }, [
      h("span", { text: "Es fehlt noch: " + mangel.join(", ") + "." })]));
    var pdfKnopf = h("button", { type: "button", class: "haupt", text: "Rechnung " + (f.nummer || "?") + " als PDF", onclick: function () {
      if (!stamm.name || !stamm.strasse || !stamm.plz_ort) { meldung("Bitte oben erst deine eigenen Daten eintragen.", "warn"); stammZeile.open = true; stammZeile.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      if (!f.name) { meldung("Der Rechnungsempfänger fehlt.", "warn"); g2.open = true; g2.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      if (!f.nummer) { meldung("Die Rechnungsnummer fehlt.", "warn"); g3.open = true; return; }
      rechnungErzeugen(stamm, f, betraege(), f.nummer);
    } });
    // Der Knopf traegt eine lange Beschriftung ("Rechnung 2026-004 als PDF") -
    // nebeneinander bricht sie auf drei Zeilen um, also untereinander.
    pdfKnopf.style.width = "100%";
    pdfKnopf.style.marginTop = "12px";
    karte.appendChild(pdfKnopf);
    karte.appendChild(h("p", { class: "meta", style: "margin:8px 0 0; text-align:center" }, [
      h("button", { type: "button", class: "textknopf", text: "Formular leeren", onclick: function () {
        rechnungWahl = {}; rechnungForm = rechnungFormLeer(); rechnungFertig = null;
        nochmal();
      } })]));
    box.appendChild(karte);
    nummerPruefen();

    // ---- Zuletzt geschrieben --------------------------------------------
    rechnungenLaden().then(function (liste2) {
      if (!box.isConnected) return;
      // Erst jetzt stehen die alten Nummern fest - der Vorschlag wird
      // nachgezogen, solange niemand von Hand etwas anderes eingetragen hat.
      if (!f.nummerManuell) {
        var v = nummerVorschlag(f);
        if (v !== f.nummer) { f.nummer = v; nummerFeld.value = v; pdfKnopf.textContent = "Rechnung " + v + " als PDF"; }
      }
      nummerPruefen();
      if (!liste2.length || box.querySelector(".rechnung-verlauf")) return;
      var drin = {};
      liste2.forEach(function (rg) { (rg.kennungen || []).forEach(function (k) { drin[k] = rg.nummer; }); });
      Array.prototype.forEach.call(wahlBox.querySelectorAll(".rechnung-zeile"), function (z) {
        var k = z._kennung; if (!k || !drin[k]) return;
        var sm = z.querySelector("small"); if (sm) sm.textContent += " · Rechnung " + drin[k] + " ✓";
      });
      var vb = h("details", { class: "tausch rechnung-verlauf" }, [h("summary", { text: "Geschriebene Rechnungen (" + liste2.length + ")" })]);
      var k2 = h("div", { class: "karte" });
      liste2.slice(0, 12).forEach(function (rg) {
        k2.appendChild(h("div", { class: "telefon-zeile" }, [
          h("span", {}, [h("b", { text: rg.nummer + " · " + (rg.verein || "") }),
            h("small", { text: new Date(rg.datum).toLocaleDateString("de-DE") + " · " + euro(rg.betrag || 0) })]),
          h("span", { class: "telefon-wege" }, [
            h("button", { type: "button", text: "PDF laden", onclick: function () { rechnungNochmal(rg); } })])]));
      });
      vb.appendChild(k2); box.appendChild(vb);
    });
    return box;
  }

  // Die eigenen Daten stehen an zwei Stellen (Rechnungsblatt und Konto) -
  // deshalb einmal gebaut.
  function stammdatenFormular(fertig) {
    var d = rechnungDaten();
    var fName = h("input", { type: "text", value: d.name || (profil && profil.name) || "", placeholder: "Nachname, Vorname" });
    var fStr = h("input", { type: "text", value: d.strasse || "", placeholder: "Straße und Nr." });
    var fOrt = h("input", { type: "text", value: d.plz_ort || "", placeholder: "PLZ und Ort" });
    var fVer = h("input", { type: "text", value: d.verein || "ESRW", placeholder: "Verein" });
    var fNr = h("input", { type: "text", value: d.sr_nummer || "", placeholder: "z. B. 12345 – steht in Klammern hinter deinem Namen" });
    var fSt = h("input", { type: "text", value: d.steuernummer || "", placeholder: "Steuernummer" });
    var fKlein = h("input", { type: "checkbox" }); fKlein.checked = d.klein !== false;
    var fPraefix = h("input", { type: "text", value: d.praefix || (new Date().getFullYear() + "-"), style: "width:7em" });
    var fNummer = h("input", { type: "number", min: "1", value: String(d.nummer || 1), style: "width:6em" });
    return h("div", { class: "mg-form" }, [
      h("p", { class: "meta", style: "margin:0", text: "Steht als Rechnungssteller auf jeder Rechnung. Liegt im Konto, gilt auf allen Geräten." }),
      h("label", { text: "Name" }), fName,
      h("label", { text: "Straße und Nr." }), fStr,
      h("label", { text: "PLZ und Ort" }), fOrt,
      h("label", { text: "Verein" }), fVer,
      h("label", { text: "Schiedsrichternummer" }), fNr,
      h("label", { text: "Steuernummer" }), fSt,
      h("label", { class: "schalter", style: "margin-top:8px" }, [fKlein, " Kleinunternehmer nach § 19 UStG"]),
      h("label", { text: "Nächste Rechnungsnummer" }),
      h("div", { class: "zweit" }, [fPraefix, fNummer]),
      h("button", { type: "button", class: "haupt", text: "Daten merken", onclick: function () {
        rechnungDatenSpeichern({ name: fName.value.trim(), strasse: fStr.value.trim(), plz_ort: fOrt.value.trim(),
                                 verein: fVer.value.trim(), sr_nummer: fNr.value.trim(), steuernummer: fSt.value.trim(),
                                 klein: fKlein.checked, praefix: fPraefix.value.trim(), nummer: parseInt(fNummer.value, 10) || 1 })
          .then(function (ok) {
            kurzMeldung(ok ? "Gemerkt ✓ – gilt auf allen Geräten." : "Konnte nicht gespeichert werden.", ok ? "gut" : "warn");
            if (ok && fertig) fertig();
          });
      } })
    ]);
  }

  // Ein Supabase-Aufruf ist kein echtes Promise (kein .catch) - das hier
  // macht eines daraus, damit ein Fehler beim Notieren nicht die fertige
  // Rechnung kaputtmacht.
  function speichern(aufruf) {
    return Promise.resolve().then(function () { return aufruf; }).catch(function (e) { return { error: e }; });
  }

  function rechnungErzeugen(stamm, f, betraege, nummer) {
    kurzMeldung("Rechnung wird gebaut …", "");
    ladeRechnung().then(function (R) {
      var werte = {
        "undefined": nummer,
        "Rechnungssteller Schiedsrichter": stamm.name + (stamm.sr_nummer ? " (" + stamm.sr_nummer + ")" : ""),
        "Straße und Nr": stamm.strasse,
        "PLZ und Ort 1": stamm.plz_ort,
        "PLZ und Ort 2": stamm.verein,
        "Steuernummer": stamm.steuernummer,
        "Rechnungsempfänger Verein": f.name,
        "Straße und Nr_2": f.strasse,
        "PLZ und Ort": f.plz_ort,
        "4": f.datum,
        "Spielort": f.ort,
        "Dropdown3": f.klasse,
        "€": { text: euroZahl(betraege.pauschale), ausrichtung: "rechts" },
        "€_4": { text: euroZahl(betraege.gesamt), ausrichtung: "rechts" }
      };
      if (betraege.zuschlag) werte["€_2"] = { text: euroZahl(betraege.zuschlag), ausrichtung: "rechts" };
      if (betraege.klein) werte._kreuz = "Kleinunternehmer nach  19 UStG";
      else werte["€_3"] = { text: euroZahl(betraege.ust), ausrichtung: "rechts" };
      var reihen = [["1", "undefined_2"], ["2", "undefined_3"], ["3", "undefined_4"]];
      (f.zeilen || []).slice(0, 3).forEach(function (z, i) {
        if (z[0]) werte[reihen[i][0]] = z[0];
        if (z[1]) werte[reihen[i][1]] = z[1];
      });
      return R.bauen(werte).then(function (blob) {
        var name = "Abrechnung_" + nummer.replace(/[^\w-]+/g, "_") + "_" + (f.verein || f.name || "Verein").replace(/[^\w]+/g, "") + ".pdf";
        pdfHerunterladen(blob, name);
        // Ab hier ist die Rechnung fertig - was jetzt schiefgeht, darf sie
        // nicht mehr in Frage stellen.
        var neu = {}; Object.keys(stamm).forEach(function (k) { neu[k] = stamm[k]; });
        // Die benutzte Nummer zaehlt weiter - auch wenn sie von Hand kam.
        var hinten = String(nummer).match(/(\d+)\s*$/);
        neu.nummer = Math.max((parseInt(stamm.nummer, 10) || 1) + 1, (hinten ? parseInt(hinten[1], 10) : 0) + 1);
        var wann = new Date();
        if (f.kennungen && f.kennungen.length && rechnungWahl[f.kennungen[0]]) wann = new Date(rechnungWahl[f.kennungen[0]].beginn);
        rechnungWahl = {}; rechnungListe = null; rechnungForm = rechnungFormLeer();
        return speichern(sb.from("rechnungen").insert({
          user_id: session.user.id, nummer: nummer, datum: wann.toISOString().slice(0, 10),
          verein: f.verein || f.name, betrag: Math.round(betraege.gesamt * 100) / 100,
          kennungen: f.kennungen || [],
          // Nur die ausgefuellten Felder - daraus laesst sich dasselbe PDF
          // jederzeit neu bauen, ohne es irgendwo abzulegen.
          felder: { name: f.name, strasse: f.strasse, plz_ort: f.plz_ort, verein: f.verein,
                    zeilen: f.zeilen, datum: f.datum, ort: f.ort, klasse: f.klasse,
                    pauschale: betraege.pauschale, zuschlag: betraege.zuschlag, klein: betraege.klein }
        })).then(function () { return rechnungDatenSpeichern(neu); })
          .then(function () {
            rechnungFertig = { blob: blob, name: name, nummer: nummer };
            kurzMeldung("Rechnung " + nummer + " fertig ✓", "gut");
            abrechnungPanel = "rechnung"; rendereAbrechnung();
          });
      });
    }).catch(function (e) { meldung("Rechnung fehlgeschlagen: " + (e && e.message ? e.message : e), "warn"); });
  }

  // Die Zeile unter einem Spiel in der Abrechnung: vormerken oder die
  // dazugehoerige Rechnung noch einmal laden.
  function rechnungZeile(sp) {
    var box = h("div", { class: "zweit" }, [
      h("button", { type: "button", text: "Auf die Rechnung", onclick: function () {
        rechnungWahl[sp.kennung] = sp; rechnungForm = rechnungFormAusWahl();
        abrechnungPanel = "rechnung"; rendereAbrechnung();
        kurzMeldung("Vorgemerkt – unten unter „Rechnung“.", "gut");
      } })
    ]);
    rechnungenLaden().then(function (liste) {
      if (!box.isConnected) return;
      var rg = liste.filter(function (x) { return (x.kennungen || []).indexOf(sp.kennung) >= 0; })[0];
      if (!rg) return;
      box.insertBefore(h("button", { type: "button", class: "anfrage", text: "Rechnung " + rg.nummer + " laden",
        onclick: function () { rechnungNochmal(rg); } }), box.firstChild);
    });
    return box;
  }

  // Aus einer notierten Rechnung dasselbe PDF noch einmal bauen.
  function rechnungNochmal(rg) {
    var f = rg.felder;
    if (!f) { meldung("Diese Rechnung stammt aus einer alten Fassung – bitte neu ausfüllen.", "warn"); return; }
    var stamm = rechnungDaten();
    var b = { pauschale: Number(f.pauschale) || 0, zuschlag: Number(f.zuschlag) || 0, klein: !!f.klein };
    b.ust = b.klein ? 0 : (b.pauschale + b.zuschlag) * 0.19;
    b.gesamt = b.pauschale + b.zuschlag + b.ust;
    kurzMeldung("Rechnung " + rg.nummer + " wird gebaut …", "");
    ladeRechnung().then(function (R) {
      var werte = {
        "undefined": rg.nummer,
        "Rechnungssteller Schiedsrichter": stamm.name + (stamm.sr_nummer ? " (" + stamm.sr_nummer + ")" : ""),
        "Straße und Nr": stamm.strasse, "PLZ und Ort 1": stamm.plz_ort, "PLZ und Ort 2": stamm.verein,
        "Steuernummer": stamm.steuernummer,
        "Rechnungsempfänger Verein": f.name, "Straße und Nr_2": f.strasse, "PLZ und Ort": f.plz_ort,
        "4": f.datum, "Spielort": f.ort, "Dropdown3": f.klasse,
        "€": { text: euroZahl(b.pauschale), ausrichtung: "rechts" },
        "€_4": { text: euroZahl(b.gesamt), ausrichtung: "rechts" }
      };
      if (b.zuschlag) werte["€_2"] = { text: euroZahl(b.zuschlag), ausrichtung: "rechts" };
      if (b.klein) werte._kreuz = "Kleinunternehmer nach  19 UStG";
      else werte["€_3"] = { text: euroZahl(b.ust), ausrichtung: "rechts" };
      var reihen = [["1", "undefined_2"], ["2", "undefined_3"], ["3", "undefined_4"]];
      (f.zeilen || []).slice(0, 3).forEach(function (z, i) {
        if (z[0]) werte[reihen[i][0]] = z[0];
        if (z[1]) werte[reihen[i][1]] = z[1];
      });
      return R.bauen(werte).then(function (blob) {
        pdfHerunterladen(blob, "Abrechnung_" + String(rg.nummer).replace(/[^\w-]+/g, "_") + ".pdf");
        kurzMeldung("Rechnung " + rg.nummer + " noch einmal geladen ✓", "gut");
      });
    }).catch(function (e) { meldung("Ging nicht: " + (e && e.message ? e.message : e), "warn"); });
  }

  function pdfHerunterladen(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function aktualisiereZeile(spiel) {
    var el = wurzel.querySelector('[data-kennung="' + spiel.kennung.replace(/"/g, "") + '"] .mg-betrag');
    if (!el) return;
    var e = einsaetze[spiel.kennung], b = betragFuer(spiel, e);
    el.textContent = betragText(spiel, e, b);
    var kurz = wurzel.querySelector('[data-kennung="' + spiel.kennung.replace(/"/g, "") + '"] .mg-betrag-kurz');
    if (kurz) kurz.textContent = b.betrag != null ? euro(b.betrag) + (e.km != null ? " · " + e.km + " km" : "") : "Betrag fehlt";
    var karte = wurzel.querySelector('[data-kennung="' + spiel.kennung.replace(/"/g, "") + '"]');
    if (karte) karte.classList.toggle("erfasst", b.betrag != null);
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

  // Jahresblatt fuers Finanzamt: alle Spiele eines Kalenderjahres ueber alle Saisons
  function zeigeJahresblatt(jahr) {
    leeren(inhalt);
    var liste = alleSpiele().filter(function (sp) { return new Date(sp.beginn).getFullYear() === jahr && einsaetze[sp.kennung]; }).sort(function (a, b) { return a.beginn < b.beginn ? -1 : 1; });
    var einfach = (profil.km_modell || "einfach") === "einfach";
    var s = { km: 0, fahrt: 0, verg: 0, ausl: 0, verpf: 0 };
    var tabelle = h("table", {}, [h("thead", {}, [h("tr", {}, [h("th", { text: "Datum" }), h("th", { text: "Spiel" }), h("th", { class: "zahl", text: einfach ? "km" : "km h+z" }), h("th", { class: "zahl", text: "Fahrt" }), h("th", { class: "zahl", text: "Verpfl." }), h("th", { class: "zahl", text: "Auslagen" }), h("th", { class: "zahl", text: "Vergütung" })])])]);
    var tb = h("tbody");
    liste.forEach(function (sp) {
      var e = einsaetze[sp.kennung], b = betragFuer(sp, e), d = new Date(sp.beginn), kmW = e.km != null ? (einfach ? Math.floor(e.km) : e.km * 2) : null, f = fahrtkosten(e);
      s.km += kmW || 0; s.fahrt += f; s.verg += b.betrag || 0; s.ausl += e.auslagen || 0; s.verpf += e.verpflegung || 0;
      tb.appendChild(h("tr", {}, [h("td", { text: d.toLocaleDateString("de-DE") }), h("td", { text: (sp.liga ? sp.liga + " " : "") + sp.paarung + (sp.halle ? " · " + sp.halle : "") + " (" + (sp.rolle || "SR") + ")" + (e.ausgefallen ? " · ausgefallen" : "") }),
        h("td", { class: "zahl", text: kmW != null ? String(Math.round(kmW * 10) / 10).replace(".", ",") : "–" }), h("td", { class: "zahl", text: euro(f) }), h("td", { class: "zahl", text: e.verpflegung ? euro(e.verpflegung) : "–" }), h("td", { class: "zahl", text: e.auslagen ? euro(e.auslagen) : "–" }), h("td", { class: "zahl", text: b.betrag != null ? euro(b.betrag) : "–" })]));
    });
    tb.appendChild(h("tr", {}, [h("td", {}, [h("b", { text: liste.length + " Spiele" })]), h("td", {}), h("td", { class: "zahl" }, [h("b", { text: String(Math.round(s.km)) })]), h("td", { class: "zahl" }, [h("b", { text: euro(s.fahrt) })]), h("td", { class: "zahl" }, [h("b", { text: euro(s.verpf) })]), h("td", { class: "zahl" }, [h("b", { text: euro(s.ausl) })]), h("td", { class: "zahl" }, [h("b", { text: euro(s.verg) })])]));
    tabelle.appendChild(tb);
    var box = h("div", { class: "fahrtenbuch jahresblatt" }, [
      h("h3", { class: "abschnitt", text: "Schiedsrichter-Einnahmen und -Kosten " + jahr + " · " + (profil.name || "") }),
      h("p", { class: "meta", text: "Einnahmen: Vergütung nach ESRW-Gebührenordnung. Kosten: " + (einfach ? "Entfernungspauschale (einfache Strecke, " + euro(profil.satz_einfach != null ? profil.satz_einfach : 0.38) + "/km)" : "Reisekosten (gefahrene km, " + euro(profil.satz_hinrueck != null ? profil.satz_hinrueck : 0.30) + "/km)") + ", Verpflegungsmehraufwand (14 € ab 8 Std.), Auslagen laut Beleg. Saldo: " + euro(s.verg - s.fahrt - s.verpf - s.ausl) + ". Erstellt " + new Date().toLocaleDateString("de-DE") + " – Aufstellung, keine Steuerberatung." }),
      liste.length ? h("div", { style: "overflow-x:auto" }, [tabelle]) : h("p", { class: "leer", text: "Keine erfassten Spiele in " + jahr + "." })
    ]);
    inhalt.appendChild(h("div", { class: "zweit fahrtenbuch" }, [
      h("button", { type: "button", text: "Drucken / PDF", onclick: function () {
        document.body.classList.add("druck-fahrtenbuch");
        var weg = function () { document.body.classList.remove("druck-fahrtenbuch"); window.removeEventListener("afterprint", weg); };
        window.addEventListener("afterprint", weg); window.print();
      } }),
      h("button", { type: "button", text: "CSV", onclick: function () { csvExport(liste, "Steuerjahr_" + jahr); } }),
      h("button", { type: "button", text: "Zurück zur Abrechnung", onclick: function () { zeigeReiter("abrechnung"); } })
    ]));
    inhalt.appendChild(h("div", { class: "karte fahrtenbuch", style: "padding:4px 14px 12px" }, [box]));
    window.scrollTo(0, 0);
  }

  function csvExport(spiele, dateiname) {
    var einfach = (profil.km_modell || "einfach") === "einfach";
    var zeilen = [["Saison", "Datum", "Uhrzeit", "Liga", "Begegnung", "Halle", "Rolle", "System",
                   "km einfach", "km gefahren", "Kilometermodell", "Satz €/km", "Fahrtkosten",
                   "Grundgebühr", "Zuschlag Uhrzeit", "Zuschlag übergreifend", "Ausfall vor Ort", "Vergütung",
                   "Auslagen", "Verpflegung", "Belege", "Notiz"]];
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
        dez(e.auslagen), dez(e.verpflegung), (e.belege || []).length || "", e.notiz || ""
      ]);
    });
    var text = zeilen.map(function (z) {
      return z.map(function (f) { return '"' + String(f).replace(/"/g, '""') + '"'; }).join(";");
    }).join("\r\n");
    var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (dateiname || "Abrechnung_" + (gewaehlteSaison || "alle").replace("/", "-")) + "_" + profil.slug + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function zeigeAbrechnung() {
    leeren(inhalt);
    inhalt.appendChild(skelett(3));
    ladeArchiv().then(function () {
      if (!gewaehlteSaison || saisonen().indexOf(gewaehlteSaison) < 0) gewaehlteSaison = ctx.daten.saison || saisonen()[0] || null;
      return saisonLaden(gewaehlteSaison);
    }).then(rendereAbrechnung);
  }

  // Vergangene Spiele ohne Zeile bekommen von selbst eine: km aus der
  // gemerkten Strecke, Verguetung nach Ordnung. Uebrig bleibt "bezahlt".
  function automatischVorbelegen(spiele) {
    var n = 0, jetzt = new Date();
    spiele.forEach(function (sp) {
      if (einsaetze[sp.kennung] || new Date(sp.beginn) > jetzt) return;
      var v = kmVorschlag(sp), g = grundgebuehr(sp);
      if (v == null && g == null) return;
      var vp = verpflegungVorschlag(sp);
      speichereEinsatz(sp, Object.assign({ km: v && v.art === "route" ? v.km : null, verguetung: g }, vp != null ? { verpflegung: vp } : {}));
      n++;
    });
    if (n) kurzMeldung(n + (n === 1 ? " Spiel" : " Spiele") + " automatisch vorbelegt – prüfen, ggf. Auslagen und Belege ergänzen.", "gut");
  }

  // Monatsraster mit Betraegen je Tag; Tipp oeffnet die Zeile
  var kalMonat = null;
  function abrechnungKalender(spiele) {
    var box = h("div", { class: "mg-kal" });
    if (!kalMonat) { var jetzt = new Date(); kalMonat = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1); }
    function rendern() {
      leeren(box);
      var start = kalMonat, ende = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      var kopf = h("div", { class: "kopf2" }, [
        h("button", { type: "button", class: "rund", text: "‹", onclick: function () { kalMonat = new Date(start.getFullYear(), start.getMonth() - 1, 1); rendern(); } }),
        h("b", { text: MONATE[start.getMonth()] + " " + start.getFullYear() }),
        h("button", { type: "button", class: "rund", text: "›", onclick: function () { kalMonat = new Date(start.getFullYear(), start.getMonth() + 1, 1); rendern(); } })]);
      box.appendChild(kopf);
      var raster = h("div", { class: "raster" });
      ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach(function (w) { raster.appendChild(h("div", { class: "wt", text: w })); });
      var vor = (start.getDay() + 6) % 7;
      for (var i = 0; i < vor; i++) raster.appendChild(h("div", { class: "tag leer" }));
      var heute = new Date().toDateString(), summe = 0;
      for (var t = 1; t <= ende.getDate(); t++) {
        var d = new Date(start.getFullYear(), start.getMonth(), t), key = d.toDateString();
        var amTag = spiele.filter(function (sp) { return new Date(sp.beginn).toDateString() === key; });
        var betrag = 0, alleFertig = amTag.length > 0, offenDa = false;
        amTag.forEach(function (sp) { var e = einsaetze[sp.kennung]; var b = e ? (betragFuer(sp, e).betrag || 0) : 0; betrag += b; if (new Date(sp.beginn) < new Date() && (!e || e.verguetung == null)) { offenDa = true; alleFertig = false; } if (!e) alleFertig = false; });
        summe += betrag;
        var zelle = h("div", { class: "tag" + (amTag.length ? " hat" : "") + (offenDa ? " offen" : alleFertig ? " fertig" : "") + (key === heute ? " heute" : "") }, [h("b", { text: String(t) }), amTag.length ? h("em", { text: betrag ? euro(betrag).replace(",00", "") : (amTag.length + "×") }) : null]);
        if (amTag.length) (function (sp) { zelle.addEventListener("click", function () { abrechnungSprung(sp.kennung); rendereAbrechnung(); }); })(amTag[0]);
        raster.appendChild(zelle);
      }
      box.appendChild(raster);
      box.appendChild(h("p", { class: "meta", style: "margin:8px 0 0", text: MONATE[start.getMonth()] + ": " + euro(summe) + " · rot = Betrag fehlt, grün = erfasst · Tipp auf einen Tag öffnet das Spiel" }));
    }
    rendern();
    return box;
  }

  // Kilometermodell und Verpflegung direkt in der Abrechnung umschalten
  function abrechnungEinstellungen(spiele) {
    var einfach = (profil.km_modell || "einfach") === "einfach";
    var modus = profil.verpflegung_modus || "aus";
    var kmWahl = h("select", { class: "mg-select" }, [
      h("option", { value: "einfach", text: "Einfache Strecke – Entfernungspauschale " + (profil.satz_einfach != null ? profil.satz_einfach : 0.38).toFixed(2).replace(".", ",") + " €/km (Arbeitnehmer)" }),
      h("option", { value: "hinrueck", text: "Hin und zurück – " + (profil.satz_hinrueck != null ? profil.satz_hinrueck : 0.30).toFixed(2).replace(".", ",") + " €/km gefahren (Selbstständige)" })]);
    kmWahl.value = einfach ? "einfach" : "hinrueck";
    var vWahl = h("select", { class: "mg-select" }, [
      h("option", { value: "aus", text: "Verpflegungsmehraufwand: aus" }),
      h("option", { value: "auto", text: "Verpflegung automatisch: 14 € ab 8 Std. Abwesenheit" }),
      h("option", { value: "immer", text: "Verpflegung immer: 14 € je Spiel" })]);
    vWahl.value = modus;
    function speichern(aenderung, nachher) {
      sb.from("profile").upsert(Object.assign({ id: session.user.id }, aenderung)).then(function (r) {
        if (r.error) { meldung(fehlerText(r.error) + (/verpflegung_modus/.test(r.error.message || "") ? " – schema.sql (v14) ausführen." : ""), "warn"); return; }
        profil = Object.assign({}, profil, aenderung); if (nachher) nachher(); rendereAbrechnung();
      });
    }
    kmWahl.addEventListener("change", function () { speichern({ km_modell: kmWahl.value, km_satz: kmWahl.value === "einfach" ? (profil.satz_einfach != null ? profil.satz_einfach : 0.38) : (profil.satz_hinrueck != null ? profil.satz_hinrueck : 0.30) }, function () { kurzMeldung(kmWahl.value === "einfach" ? "Einfache Strecke ✓" : "Hin und zurück ✓ – km werden doppelt gerechnet.", "gut"); }); });
    vWahl.addEventListener("change", function () {
      speichern({ verpflegung_modus: vWahl.value }, function () {
        // Alle Spiele der Saison nach dem neuen Modus setzen (nur vergangene)
        var n = 0; spiele.forEach(function (sp) { if (!einsaetze[sp.kennung] || new Date(sp.beginn) > new Date()) return; speichereEinsatz(sp, { verpflegung: verpflegungVorschlag(sp) }); n++; });
        kurzMeldung(vWahl.value === "aus" ? "Verpflegung aus – Beträge entfernt." : n + " Spiele neu berechnet.", "gut");
      });
    });
    return h("div", { class: "mg-form" }, [
      h("p", { class: "meta", style: "margin:0 0 4px", text: "Zurzeit: " + (einfach ? "einfache Strecke" : "hin und zurück") + (modus !== "aus" ? " · Verpflegung " + (modus === "immer" ? "immer 14 €" : "ab 8 Std.") : " · keine Verpflegung") }),
      h("label", { text: "Kilometer" }), kmWahl,
      h("label", { text: "Verpflegungsmehraufwand (steuerlich: 14 € bei mehr als 8 Std. Abwesenheit, Fahrzeit zählt mit)" }), vWahl,
      h("p", { class: "meta", text: "Sätze ändern: Einstellungen → Profil. Ob das für dich passt, sagt dir dein Steuerberater." })]);
  }

  // Spiel selbst eintragen: nur fuer dich und die Abrechnung (privat)
  function spielEintragenFormular(zurueck) {
    function lokal(d) { function z(n) { return ("0" + n).slice(-2); } return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + "T" + z(d.getHours()) + ":" + z(d.getMinutes()); }
    var beginn = h("input", { type: "datetime-local" }); beginn.value = lokal(new Date());
    var liga = h("input", { type: "text", placeholder: "Liga (optional)", maxlength: "40" });
    var paarung = h("input", { type: "text", placeholder: "Begegnung, z. B. „EHC Essen – Herne“ oder „Lehrgang“", maxlength: "120" });
    var halle = h("select", { class: "mg-select" }, [h("option", { value: "", text: "– Halle (optional) –" })].concat(Object.keys(ctx.daten.adressen || {}).sort(function (a, b) { return a.localeCompare(b, "de"); }).map(function (n) { return h("option", { value: n, text: n }); })));
    var rolle = h("select", { class: "mg-select" }, [["SR", "SR (2er-System)"], ["HSR", "HSR"], ["LSR", "LSR"]].map(function (x) { return h("option", { value: x[0], text: x[1] }); }));
    var speichern = h("button", { type: "button", class: "anfrage", text: "Eintragen", onclick: function () {
      var p = paarung.value.trim(); if (!p || !beginn.value) { meldung("Begegnung und Datum sind Pflicht.", "warn"); return; }
      var d = new Date(beginn.value), kennung = "p:" + d.getTime().toString(36) + Math.random().toString(36).slice(2, 7);
      var sp = { kennung: kennung, beginn: d.toISOString(), liga: liga.value.trim() || null, paarung: p, halle: halle.value || null, rolle: rolle.value, system: rolle.value === "SR" ? 2 : 3 };
      var g = grundgebuehr(sp), v = kmVorschlag(sp);
      einsaetze[kennung] = { privat: true };
      speichereEinsatz(sp, { privat: true, km: v && v.art === "route" ? v.km : null, verguetung: g, verpflegung: verpflegungVorschlag(sp) });
      kurzMeldung("Eingetragen ✓ – nur für dich und deine Abrechnung.", "gut");
      abrechnungPanel = null; setTimeout(rendereAbrechnung, 700);
    } });
    return h("div", { class: "melde karte", style: "margin:8px 0" }, [h("h4", { text: "Spiel selbst eintragen" }),
      h("p", { class: "meta", text: "Für Spiele, die nicht auf esrw.de stehen (andere Verbände, Turniere, Freundschaftsspiele). Nur du siehst es – in deiner Abrechnung, mit km, Vergütung und Verpflegung." }),
      h("div", { class: "mg-form" }, [h("div", { class: "mg-felder mg-zwei" }, [h("label", {}, ["Datum und Anstoß", beginn]), h("label", {}, ["Liga", liga])]), paarung, halle, rolle, h("div", { class: "zweit" }, [speichern, h("button", { type: "button", class: "mg-neben", text: "Abbrechen", onclick: zurueck })])])]);
  }

  var abrechnungZiel = null, abrechnungPanel = null;
  // Mehrfachauswahl in der Abrechnung
  var auswahl = {}, auswahlModus = false;
  function auswahlStarten(sp) {
    if (!auswahlModus) { auswahlModus = true; if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} } }
    if (sp) auswahl[sp.kennung] = sp;
    rendereAbrechnung();
  }
  function auswahlEnde() { auswahlModus = false; auswahl = {}; var l = document.querySelector(".mg-auswahlleiste"); if (l) l.remove(); rendereAbrechnung(); }
  function auswahlLeiste() {
    var alt = document.querySelector(".mg-auswahlleiste"); if (alt) alt.remove();
    if (!auswahlModus) return;
    var liste = Object.keys(auswahl).map(function (k) { return auswahl[k]; }), n = liste.length;
    var leiste = h("div", { class: "mg-auswahlleiste" }, [
      h("span", { text: n + (n === 1 ? " Spiel" : " Spiele") }),
      h("button", { type: "button", class: "anfrage", text: "Verpflegung 14 €", disabled: n ? null : "disabled", onclick: function () { liste.forEach(function (sp) { speichereEinsatz(sp, { verpflegung: 14 }); }); auswahlEnde(); } }),
      h("button", { type: "button", text: "ohne Verpfl.", disabled: n ? null : "disabled", onclick: function () { liste.forEach(function (sp) { speichereEinsatz(sp, { verpflegung: null }); }); auswahlEnde(); } }),
      h("button", { type: "button", text: "CSV", disabled: n ? null : "disabled", onclick: function () { csvExport(liste.slice().sort(function (a, b) { return a.beginn < b.beginn ? -1 : 1; }), "Auswahl"); } }),
      h("button", { type: "button", text: "Alle", onclick: function () { saisonSpiele(gewaehlteSaison).forEach(function (sp) { if (new Date(sp.beginn) < new Date()) auswahl[sp.kennung] = sp; }); rendereAbrechnung(); } }),
      h("button", { type: "button", class: "textknopf", text: "Fertig", onclick: auswahlEnde })
    ]);
    document.body.appendChild(leiste);
  }
  function abrechnungSprung(kennung) { abrechnungZiel = kennung; nurOffene = false; }
  function rendereAbrechnung() {
    leeren(inhalt);
    var spiele = saisonSpiele(gewaehlteSaison);
    automatischVorbelegen(spiele);

    var saisonWahl = h("select", { class: "mg-select", onchange: function (ev) { gewaehlteSaison = ev.target.value; saisonLaden(gewaehlteSaison).then(rendereAbrechnung); } },
      saisonen().map(function (s) { var o = h("option", { value: s, text: "Saison " + s }); if (s === gewaehlteSaison) o.selected = true; return o; }));
    var offenN = spiele.filter(function (sp) { var e = einsaetze[sp.kennung]; return new Date(sp.beginn) < new Date() && (!e || e.verguetung == null || (e.km == null && profil.heimat_lat != null)); }).length;
    var chips = h("div", { class: "schnell mg-chips" }, [
      h("button", { type: "button", class: "filterknopf" + (nurOffene ? " aktiv" : ""), text: "Unvollständig" + (offenN ? " (" + offenN + ")" : ""), onclick: function () { nurOffene = true; rendereAbrechnung(); } }),
      h("button", { type: "button", class: "filterknopf" + (!nurOffene ? " aktiv" : ""), text: "Alle", onclick: function () { nurOffene = false; rendereAbrechnung(); } })
    ]);
    inhalt.appendChild(h("div", { class: "mg-abrechnung-kopf" }, [saisonWahl, chips]));

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
    // Eine Leiste, ein Panel: Steuerjahre, Abrechnungsart, Werkzeuge, Spiel eintragen, Regeln
    var panelInhalt = {
      detail: function () { return summenDetails(); },
      art: function () { return abrechnungEinstellungen(spiele); },
      werkzeuge: function () {
        return h("div", {}, [
          h("p", { class: "meta", style: "margin:0 0 8px", text: "Vergangene Spiele bekommen km und Vergütung von selbst – die Knöpfe füllen nur, was noch fehlt." }),
          h("div", { class: "zweit" }, [strecken, gebuehr,
            h("button", { type: "button", text: "CSV der Saison", onclick: function () { csvExport(spiele); } }),
            h("button", { type: "button", text: "Fahrtenbuch", onclick: function () { zeigeFahrtenbuch(); } }),
            h("button", { type: "button", text: "Drucken", onclick: function () { window.print(); } })])]);
      },
      eintragen: function () { return spielEintragenFormular(function () { abrechnungPanel = null; rendereAbrechnung(); }); },
      regeln: function () {
        return h("p", { class: "meta mg-fuss", style: "margin:0", text:
          "km = einfache Strecke Wohnung → Halle (Straßenkilometer, wenn berechnet; sonst Luftlinie × 1,3). " +
          "Vergütung nach ESRW-Gebührenordnung (" + ((gebuehren && gebuehren.stand) || "?") + "): " +
          "+20 % bei Spielbeginn bis 09:14 oder ab 21:46 Uhr, Zuschlag für landesverbandsübergreifenden " +
          "Einsatz in RL West / Frauen 2. Liga nur auf Anforderung, 50 % bei Ausfall vor Ort. Verpflegung 14 € ab 8 Std. Abwesenheit. Das ist eine " +
          "Aufstellung für dich oder deinen Steuerberater; was davon steuerlich zählt, sagt sie nicht." });
      }
    };
    var leiste = h("div", { class: "mg-leiste" });
    panelInhalt.kalender = function () { return abrechnungKalender(spiele); };
    panelInhalt.rechnung = rechnungPanel;
    // Sieben Knoepfe nebeneinander hat niemand gelesen: vorne steht, was
    // staendig gebraucht wird, der Rest liegt unter "Weitere".
    var WEITERE = [["art", "Abrechnungsart"], ["werkzeuge", "Werkzeuge"], ["eintragen", "+ Spiel eintragen"], ["regeln", "Wie gerechnet wird"]];
    if (!einfach()) WEITERE.unshift(["detail", "Steuerjahre"]);
    panelInhalt.weiteres = function () {
      return h("div", { class: "mg-form" }, [
        h("p", { class: "meta", style: "margin:0 0 8px", text: "Seltener gebraucht \u2013 einmal antippen:" })
      ].concat(WEITERE.map(function (p) {
        return h("button", { type: "button", class: "mg-neben", style: "width:100%;text-align:left",
          text: p[1], onclick: function () { abrechnungPanel = p[0]; rendereAbrechnung(); } });
      })));
    };
    var KNOEPFE = [["kalender", "Kalender"], ["rechnung", "Rechnung"]];
    if (!einfach()) KNOEPFE.push(["detail", "Steuerjahre"]);
    KNOEPFE.push(["weiteres", "Weitere \u2026"]);
    KNOEPFE.forEach(function (p) {
      var offen = abrechnungPanel === p[0]
        || (p[0] === "weiteres" && WEITERE.filter(function (w) { return w[0] === abrechnungPanel; }).length);
      leiste.appendChild(h("button", { type: "button", class: "filterknopf" + (offen ? " aktiv" : ""), text: p[1], onclick: function () { abrechnungPanel = abrechnungPanel === p[0] ? null : p[0]; rendereAbrechnung(); } }));
    });
    inhalt.appendChild(leiste);
    if (abrechnungPanel && panelInhalt[abrechnungPanel]) {
      var panel = h("div", { class: "melde karte mg-panel" }, [panelInhalt[abrechnungPanel]()]);
      inhalt.appendChild(panel);
    }

    var liste = spiele;
    if (nurOffene) liste = spiele.filter(function (sp) {
      var e = einsaetze[sp.kennung];
      // km zaehlt nur als "fehlt", wenn eine Heimatadresse da ist - sonst waere jedes Spiel unvollstaendig
      return new Date(sp.beginn) < new Date() && (!e || e.verguetung == null || (e.km == null && profil.heimat_lat != null));
    });
    // Nach dem Speichern eines privaten Spiels die Liste neu laden
    if (!spiele.length) inhalt.appendChild(h("p", { class: "leer" }, ["Keine Spiele in dieser Saison. ", h("button", { type: "button", class: "anfrage", style: "margin-top:10px", text: "+ Spiel selbst eintragen", onclick: function () { abrechnungPanel = "eintragen"; rendereAbrechnung(); } })]));
    else if (!liste.length) inhalt.appendChild(h("p", { class: "leer", text: "Alle Spiele vollständig erfasst ✓" }));

    // Nach Monat gruppiert: Anzahl, Summe, fehlende Betraege
    var monat = null;
    liste.forEach(function (sp) {
      var d = new Date(sp.beginn), m = d.getFullYear() + "-" + d.getMonth();
      if (m !== monat) {
        monat = m;
        var imMonat = spiele.filter(function (x) { var y = new Date(x.beginn); return y.getFullYear() + "-" + y.getMonth() === m; });
        var summeMonat = 0, fehlt = 0; imMonat.forEach(function (x) { var e = einsaetze[x.kennung]; summeMonat += e ? (betragFuer(x, e).betrag || 0) : 0; if (new Date(x.beginn) < new Date() && (!e || e.verguetung == null)) fehlt++; });
        var kopf = h("div", { class: "mg-monat" }, [h("span", {}, [h("b", { text: MONATE[d.getMonth()] + " " + d.getFullYear() }),
          h("small", { text: imMonat.length + (imMonat.length === 1 ? " Spiel" : " Spiele") + " · " + euro(summeMonat) + (fehlt ? " · " + fehlt + " ohne Betrag" : "") })])]);
        var rechts = h("span", { class: "mg-monat-aktion" });
        kopf.appendChild(rechts);
        inhalt.appendChild(kopf);
      }
      inhalt.appendChild(eintrag(sp));
    });

    aktualisiereSummen();
    auswahlLeiste();
    if (abrechnungZiel) {
      var zielZeile = inhalt.querySelector('[data-kennung="' + abrechnungZiel.replace(/"/g, "") + '"]');
      abrechnungZiel = null;
      if (zielZeile) { zielZeile.classList.add("offen"); zielZeile.querySelector(".mg-details").classList.remove("versteckt"); setTimeout(function () { zielZeile.scrollIntoView({ block: "center", behavior: "smooth" }); }, 150); }
    }
  }

  // ---- Belege (Storage-Bucket "belege", Ordner je Nutzer)

  // Fotos vor dem Upload verkleinern (max. 1600 px, JPEG) - spart Speicher und Zeit
  function bildVerkleinern(datei) {
    if (!/^image\//.test(datei.type) || datei.size < 400000) return Promise.resolve(datei);
    return new Promise(function (ok) {
      var url = URL.createObjectURL(datei), img = new Image();
      img.onload = function () {
        var max = 1600, f = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement("canvas"); c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) { ok(blob ? new File([blob], datei.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : datei); }, "image/jpeg", 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok(datei); };
      img.src = url;
    });
  }
  function belegHochladen(sp, dateiRoh, zeile) {
    return bildVerkleinern(dateiRoh).then(function (datei) {
    var pfad = session.user.id + "/" + sicher(sp.kennung) + "/" + Date.now() + "_" + sicher(datei.name);
    kurzMeldung("Lade " + datei.name + " hoch …", "");
    return sb.storage.from("belege").upload(pfad, datei, { upsert: false }).then(function (r) {
      if (r.error) { meldung("Beleg konnte nicht gespeichert werden: " + fehlerText(r.error), "warn"); return; }
      var alt = (einsaetze[sp.kennung] && einsaetze[sp.kennung].belege) || [];
      speichereEinsatz(sp, { belege: alt.concat([pfad]) });
      belegeRendern(sp, zeile);
      var n = alt.length + 1, kz = zeile.querySelector(".mg-beleg-zahl"); if (kz) { kz.textContent = String(n); kz.classList.remove("versteckt"); }
      kurzMeldung("Beleg gespeichert ✓", "gut");
    });
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
    var ausf = h("input", { type: "checkbox", onchange: function (ev) { speichereEinsatz(sp, { ausgefallen: ev.target.checked }); } });
    ausf.checked = !!e.ausgefallen;
    var ueb = h("input", { type: "checkbox", onchange: function (ev) { speichereEinsatz(sp, { uebergreifend: ev.target.checked }); } });
    ueb.checked = !!e.uebergreifend;
    var notiz = h("input", { type: "text", value: e.notiz || "", placeholder: "Notiz",
      onchange: function (ev) { speichereEinsatz(sp, { notiz: ev.target.value.trim() || null }); } });
    var verpf = h("input", { type: "number", step: "0.5", min: "0", inputmode: "decimal", value: e.verpflegung != null ? e.verpflegung : "", placeholder: (profil.verpflegung_modus || "aus") === "aus" ? "–" : "14",
      onchange: function (ev) { speichereEinsatz(sp, { verpflegung: zahl(ev.target.value) }); } });

    var b = betragFuer(sp, e);
    // Beleg-Foto direkt aus der Zeile: Kamera oeffnet sich, Bild wird verkleinert hochgeladen
    var foto = h("input", { type: "file", accept: "image/*", capture: "environment", style: "display:none", onchange: function (ev) { var f = ev.target.files && ev.target.files[0]; if (f) belegHochladen(sp, f, zeile); ev.target.value = ""; } });
    var fotoKnopf = h("button", { type: "button", class: "mg-foto", title: "Beleg fotografieren", onclick: function () { foto.click(); } }, [ikone("i-kamera"), h("span", { class: "mg-beleg-zahl" + ((e.belege || []).length ? "" : " versteckt"), text: String((e.belege || []).length || "") })]);
    var details = h("div", { class: "mg-details versteckt" });
    var wahl = h("input", { type: "checkbox", class: "check mg-wahl" }); wahl.checked = !!auswahl[sp.kennung];
    wahl.addEventListener("change", function () { if (wahl.checked) auswahl[sp.kennung] = sp; else delete auswahl[sp.kennung]; zeile.classList.toggle("gewaehlt", wahl.checked); auswahlLeiste(); });
    var zeile = h("div", { class: "spiel karte mg-eintrag" + (vergangen ? "" : " war") + (b.betrag != null ? " erfasst" : "") + (auswahl[sp.kennung] ? " gewaehlt" : ""), "data-kennung": sp.kennung.replace(/"/g, "") }, [
      h("div", { class: "mg-kopf", onclick: function (ev) { if (ev.target.closest("input, button, a, label")) return; if (auswahlModus) { wahl.checked = !wahl.checked; wahl.dispatchEvent(new Event("change")); return; } details.classList.toggle("versteckt"); zeile.classList.toggle("offen", !details.classList.contains("versteckt")); } }, [
        h("div", { class: "mg-wahlfeld" + (auswahlModus ? "" : " versteckt") }, [wahl]),
        h("div", { class: "kopfzeile" }, [
          h("span", { class: "datum", text: datum(d) + " · " + uhr(d) + " Uhr" + (zeitzuschlag(sp) ? " · +20 %" : "") + (sp.privat ? " · selbst eingetragen" : "") }),
          rolleBadge((sp.rolle || "") + (sp.system >= 3 ? " · " + sp.system + "er" : ""))
        ]),
        h("div", { class: "paarung", text: (sp.liga ? sp.liga + ": " : "") + sp.paarung }),
        h("div", { class: "mg-summe" }, [
          h("span", { class: "meta mg-betrag-kurz", text: b.betrag != null ? euro(b.betrag) + (e.km != null ? " · " + e.km + " km" : "") : "Betrag fehlt" }),
          vergangen ? null : h("span", { class: "mg-status kommt", text: "kommt" }),
          vergangen ? fotoKnopf : null, foto,
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
        h("label", { class: "mg-check" }, [ausf, " vor Ort ausgefallen"]),
        uebergreifendMoeglich(sp) ? h("label", { class: "mg-check" }, [ueb, " übergreifend"]) : null
      ]),
      h("div", { class: "mg-felder" }, [h("label", { class: "mg-notiz" }, ["Notiz", notiz]), (profil.verpflegung_modus || "aus") !== "aus" || e.verpflegung != null ? h("label", { title: "Verpflegungsmehraufwand, 14 € ab 8 Std. Abwesenheit" }, ["Verpflegung €", verpf]) : null]),
      h("div", { class: "mg-belege" }),
      h("div", { class: "meta mg-betrag", text: betragText(sp, e, b) }),
      // Direkt von hier auf die Gebuehrenabrechnung - und, wenn es schon
      // eine gibt, dieselbe Rechnung noch einmal als PDF.
      rechnungZeile(sp),
      sp.privat ? h("div", { class: "zweit" }, [h("button", { type: "button", style: "color:var(--rot)", text: "Eintrag löschen", onclick: function () {
        if (!confirm("Dieses selbst eingetragene Spiel samt Abrechnung und Belegen löschen?")) return;
        var belege = (einsaetze[sp.kennung] || {}).belege || [];
        (belege.length ? sb.storage.from("belege").remove(belege) : Promise.resolve()).catch(function () {})
          .then(function () { return sb.from("einsaetze").delete().eq("user_id", session.user.id).eq("kennung", sp.kennung); })
          .then(function () { delete einsaetze[sp.kennung]; rendereAbrechnung(); });
      } })]) : null
    ].forEach(function (x) { if (x) details.appendChild(x); });

    zeile.querySelector(".rolle").className = "rolle " + (sp.rolle || "");
    belegeRendern(sp, zeile);
    // Langes Druecken (oder Rechtsklick) startet die Mehrfachauswahl
    var timer = null;
    zeile.addEventListener("touchstart", function () { timer = setTimeout(function () { auswahlStarten(sp); }, 550); }, { passive: true });
    ["touchend", "touchmove", "touchcancel"].forEach(function (ev) { zeile.addEventListener(ev, function () { clearTimeout(timer); }, { passive: true }); });
    zeile.addEventListener("contextmenu", function (ev) { ev.preventDefault(); auswahlStarten(sp); });
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

  function zeigeKonto() { leeren(inhalt); kontoInhalt(inhalt, false); }
  // Konto-Teil der Einstellungen-Seite (index.html #einstellungen)
  function kontoRendern(container) {
    kontoZiel = container; leeren(container); container.appendChild(skelett(2));
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) { leeren(container); return; }
      return ladeProfil().then(function () { leeren(container); if (profil && profil.slug) kontoInhalt(container, true); else zeigeEinrichtung("seite"); });
    }).catch(function (e) { leeren(container); container.appendChild(h("p", { class: "achtung", text: fehlerText(e) })); });
  }
  function kontoNeu() { if (kontoZiel && kontoZiel.isConnected) kontoRendern(kontoZiel); else zeigeReiter("konto"); }
  function kontoInhalt(inhalt, seite) {
    var ueber = h("div", { class: "melde karte" }, [h("h4", { text: "Dein Konto" }), skelett(1)]);
    inhalt.appendChild(ueber);
    kontoUebersicht(ueber);
    inhalt.appendChild(h("div", { class: "melde karte" }, [
      h("h4", { text: "Profil" }),
      h("p", { text: "Name auf esrw.de, Heimatadresse (für Strecken und Abfahrt), Obmann-Adresse, Kilometermodell und Sätze." }),
      h("button", { type: "button", class: "haupt", text: "Profil bearbeiten", onclick: function () { zeigeEinrichtung(seite ? "seite" : true); } })
    ]));
    // Anschrift, Verein, Schiedsrichternummer: stehen auf jeder Rechnung und
    // gehoeren deshalb ins Konto, nicht nur ins Rechnungsblatt.
    if (fn("abrechnung")) {
      var rd = rechnungDaten();
      var rdBox = h("details", { class: "melde karte tausch" }, [
        h("summary", {}, [rd.name ? "Rechnungsdaten ✓ · " + rd.name + (rd.sr_nummer ? " (" + rd.sr_nummer + ")" : "") : "Rechnungsdaten – für die Gebührenabrechnung"])
      ]);
      rdBox.appendChild(stammdatenFormular(function () { kontoNeu(); }));
      inhalt.appendChild(rdBox);
    }
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
        h("button", { type: "button", text: "Alles als ZIP (mit Belegen)", onclick: datenExportZip }),
        h("button", { type: "button", text: "Nur JSON", onclick: datenExport }),
        h("button", { type: "button", text: "Abmelden", onclick: function () { abmelden(); if (seite) kontoNeu(); } }),
        h("button", { type: "button", style: "color:var(--warn)", text: "Konto löschen", onclick: kontoLoeschen })
      ])
    ]));
  }

  function kontoUebersicht(box) {
    var zeilen = [["Name", profil.name || profil.slug || "–"], ["E-Mail", session.user.email || "–"],
                  ["Freischaltung", profil.admin ? (adminModus() ? "Admin" : "Admin (Modus aus)") : profil.freigeschaltet ? "freigeschaltet ✓" : "wartet auf den Betreiber"],
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
                  kurzMeldung("Gerät abgemeldet.", ""); kontoNeu();
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
      if (lage === "an") {
        var alt = box.querySelector(".mg-woche"); if (alt) alt.remove();
        var w = h("input", { type: "checkbox" }); w.checked = !(ctx && ctx.lesen && ctx.lesen("pushwoche") === "0");
        w.addEventListener("change", function () { if (ctx && ctx.schreiben) ctx.schreiben("pushwoche", w.checked ? null : "0"); if (ctx && ctx.einstellungenSync) ctx.einstellungenSync(); kurzMeldung(w.checked ? "Wochenvorschau an – kommt sonntags ab 18 Uhr." : "Wochenvorschau aus.", ""); });
        box.appendChild(h("label", { class: "mg-check mg-woche", style: "display:flex;gap:8px;align-items:center;margin-top:10px" }, [w, " Sonntags die Vorschau auf deine Woche"]));
        var ab = h("input", { type: "checkbox" }); ab.checked = !(ctx && ctx.lesen && ctx.lesen("pushabrechnung") === "0");
        ab.addEventListener("change", function () { if (ctx && ctx.schreiben) ctx.schreiben("pushabrechnung", ab.checked ? null : "0"); if (ctx && ctx.einstellungenSync) ctx.einstellungenSync(); });
        box.appendChild(h("label", { class: "mg-check mg-woche", style: "display:flex;gap:8px;align-items:center;margin-top:6px" }, [ab, " Nach dem Spiel „Spiel abrechnen?“ (abends, mit Vorbelegung)"]));
      }
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

  // ---- Telefonbuch: eine Liste, zwei Quellen
  //
  // Der Betreiber pflegt die Tabelle "telefonliste", Kollegen geben ihre
  // eigene Nummer ueber "kontakte" frei. Lesen duerfen beides alle
  // Freigeschalteten (RLS), aendern darf die Betreiberliste nur der Admin -
  // deshalb steht die Pflege im Adminbereich und hier nur die Ansicht.
  function telefonbuchLaden() {
    return Promise.all([
      speichern(sb.from("telefonliste").select("slug,name,telefon").order("name")),
      speichern(sb.from("kontakte").select("slug,name,telefon,hinweis"))
    ]).then(function (rr) {
      var a = rr[0] || {}, b = rr[1] || {};
      return { liste: (a.data || []), selbst: (b.data || []).filter(function (k) { return k.telefon; }),
               fehler: a.error || null };
    });
  }
  // Selbst freigegebene Nummer geht vor der Betreiberliste.
  function telefonbuchZeilen(d) {
    var aus = {}, personen = (ctx.daten && ctx.daten.personen) || [];
    function name(slug, ersatz) {
      var p = personen.filter(function (x) { return x.slug === slug; })[0];
      return (p && p.name) || ersatz || slug;
    }
    d.liste.forEach(function (z) {
      aus[z.slug] = { slug: z.slug, name: name(z.slug, z.name), telefon: z.telefon, eigen: false, inListe: true };
    });
    d.selbst.forEach(function (k) {
      var alt = aus[k.slug];
      aus[k.slug] = { slug: k.slug, name: name(k.slug, k.name), telefon: k.telefon, hinweis: k.hinweis || "",
                      eigen: true, inListe: !!(alt && alt.inListe), betreiber: alt ? alt.telefon : null };
    });
    return Object.keys(aus).map(function (k) { return aus[k]; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "de"); });
  }
  function telefonWege(nr) {
    var l = telefonLink(nr);
    return [
      h("a", { href: l.tel, text: "Anrufen" }),
      h("a", { href: l.wa, target: "_blank", rel: "noopener", text: "WhatsApp" }),
      h("button", { type: "button", text: "Kopieren", onclick: function () {
        if (navigator.clipboard) navigator.clipboard.writeText(nr).then(function () { kurzMeldung("Nummer kopiert ✓", "gut"); });
        else prompt("Nummer:", nr);
      } })
    ];
  }
  function telefonZeile(z, zusatz) {
    var wege = h("span", { class: "telefon-wege" }, telefonWege(z.telefon));
    (zusatz || []).forEach(function (k) { wege.appendChild(k); });
    var unten = z.telefon + (z.eigen ? " · selbst freigegeben" : "") + (z.hinweis ? " · " + z.hinweis : "");
    return h("div", { class: "telefon-zeile" }, [
      h("span", {}, [h("b", { text: z.name }), h("small", { text: unten })]),
      wege]);
  }

  // Reiter "Kollegen": die Liste, wie jeder Freigeschaltete sie sieht.
  function zeigeTelefonbuch() {
    var karte = h("div", { class: "melde karte" });
    var kopf = h("p", { class: "meta", style: "margin:0 0 8px", text: "lade …" });
    var suche = h("input", { type: "search", class: "mg-suche", placeholder: "Name suchen …" });
    var liste = h("div", { class: "telefon-liste" }, [skelett(2)]);
    karte.appendChild(h("h4", {}, [ikone("i-users"), " Telefonliste"]));
    karte.appendChild(kopf);
    karte.appendChild(suche);
    karte.appendChild(liste);
    inhalt.appendChild(karte);

    if (fn("gespann")) {
      var eigenBox = h("div", {}, [h("p", { class: "meta", text: "lade …" })]);
      var eigen = h("details", { class: "melde karte tausch" }, [
        h("summary", { text: "Meine eigene Nummer" }), eigenBox]);
      eigen.addEventListener("toggle", function () {
        if (eigen.open && !eigen._geladen) { eigen._geladen = true; kontaktRendern(eigenBox); }
      });
      inhalt.appendChild(eigen);
    }
    if (istAdminAn()) inhalt.appendChild(h("p", { class: "meta mg-fuss" }, [
      "Ändern kann die Liste nur der Betreiber. ",
      h("button", { type: "button", class: "textknopf", text: "Liste pflegen",
        onclick: function () { adminBereich = "telefon"; zeigeReiter("admin"); } })]));
    else inhalt.appendChild(h("p", { class: "meta mg-fuss",
      text: "Die Liste pflegt der Betreiber. Deine eigene Nummer gibst du selbst frei – sie geht dann vor." }));

    telefonbuchLaden().then(function (d) {
      if (!karte.isConnected) return;
      leeren(liste);
      if (d.fehler) {
        kopf.textContent = "";
        liste.appendChild(h("p", { class: "achtung", text: "Telefonliste nicht ladbar: " + fehlerText(d.fehler) }));
        return;
      }
      var alle = telefonbuchZeilen(d);
      var gesamt = ((ctx.daten && ctx.daten.personen) || []).length;
      kopf.textContent = alle.length + (alle.length === 1 ? " Nummer" : " Nummern")
        + (gesamt ? " von " + gesamt + " Kollegen" : "") + ". Antippen: anrufen, WhatsApp oder kopieren.";
      function zeichne() {
        var q = suche.value.trim().toLowerCase();
        var treffer = alle.filter(function (z) { return !q || String(z.name).toLowerCase().indexOf(q) >= 0; });
        leeren(liste);
        if (!treffer.length) {
          liste.appendChild(h("p", { class: "leer", text: alle.length ? "Niemand gefunden." : "Noch keine Nummern eingetragen." }));
          return;
        }
        treffer.forEach(function (z) { liste.appendChild(telefonZeile(z)); });
      }
      suche.addEventListener("input", zeichne);
      zeichne();
    });
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

  var cache = { hallen: {}, kontakte: {}, telefon: {}, wohnorte: {}, mitfahrten: {}, notizen: {}, kommentare: {}, geladen: {} };
  // Umweg, wenn ich den Kollegen mitnehme (oder er mich): Luftlinie x 1,3
  function umwegFuer(vonA, ueberB, nachHalle) {
    var direkt = kmZwischen(vonA, nachHalle), via = kmZwischen(vonA, ueberB) + kmZwischen(ueberB, nachHalle);
    return { direkt: Math.round(direkt * 1.3), umweg: Math.round((via - direkt) * 1.3) };
  }
  // Wer liegt auf dem Weg? Liefert je Kollege (slug) den Umweg in km oder null
  function wegVorschlaege(spiel, slugs) {
    var halle = ctx.daten.hallen && ctx.daten.hallen[spiel.halle];
    if (!halle || !profil || profil.heimat_lat == null) return {};
    var ich = [profil.heimat_lat, profil.heimat_lon], aus = {};
    (slugs || []).forEach(function (s) {
      var w = cache.wohnorte[s]; if (!w || s === profil.slug) return;
      var dort = [w.lat, w.lon];
      var a = umwegFuer(ich, dort, halle), b = umwegFuer(dort, ich, halle);
      var grenzeA = Math.max(8, a.direkt * 0.3), grenzeB = Math.max(8, b.direkt * 0.3);
      if (a.umweg <= grenzeA) aus[s] = { umweg: a.umweg, ort: w.ort, richtung: "ich" };
      else if (b.umweg <= grenzeB) aus[s] = { umweg: b.umweg, ort: w.ort, richtung: "er" };
    });
    return aus;
  }
  // Nummer eines Kollegen: selbst freigegeben (kontakte) vor Telefonliste des Betreibers
  function nummerVon(slug) { return (slug && (cache.kontakte[slug] || cache.telefon[slug])) || null; }

  function extrasLaden(spiele) {
    return bereit().then(function (st) {
      if (!st.eingerichtet || !session) return false;
      return ladeProfil().then(function () {
        if (!frei()) return false;
        var hallen = [], slugs = [], kennungen = [];
        spiele.forEach(function (s) {
          if (s.halle && hallen.indexOf(s.halle) < 0 && !cache.geladen["h|" + s.halle]) hallen.push(s.halle);
          (s.gespann || s.besetzung || []).forEach(function (g) { if (g.slug && slugs.indexOf(g.slug) < 0) slugs.push(g.slug); });
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
        if (slugs.length && !cache.geladen.wohnorte) laeufe.push(sb.from("wohnorte").select("slug,ort,lat,lon").then(function (r) {
          cache.wohnorte = {}; (r.data || []).forEach(function (z) { cache.wohnorte[z.slug] = z; }); cache.geladen.wohnorte = 1;
        }).catch(function () {}));
        if (slugs.length && !cache.geladen.telefon) laeufe.push(sb.from("telefonliste").select("slug,name,telefon").then(function (r) {
          cache.telefon = {}; (r.data || []).forEach(function (z) { cache.telefon[z.slug] = { slug: z.slug, telefon: z.telefon, hinweis: "Telefonliste" }; }); cache.geladen.telefon = 1;
        }).catch(function () {}));
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
      var k = nummerVon(g.slug); if (!k) return null;
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
    var kontakte = fn("gespann") ? (spiel.gespann || []).map(function (g) { return nummerVon(g.slug) ? { g: g, k: nummerVon(g.slug) } : null; }).filter(Boolean) : [];
    var mitHallen = !!spiel.halle && !ohneHalle && fn("hallen"), mitGespann = fn("gespann"), mitNotiz = istIch && fn("notizen");
    if (!mitGespann) mitfahrten = [];

    var teile = [];
    if (istIch && mitGespann) {
      var bis = 0; try { bis = parseInt(localStorage.getItem("gespann-gelesen:" + kennung) || "0", 10) || 0; } catch (e) {}
      var ungelesen = kommentare.filter(function (k) { return k.user_id !== session.user.id && new Date(k.angelegt).getTime() > bis; }).length;
      teile.push(kommentare.length ? kommentare.length + (kommentare.length === 1 ? " Gespann-Notiz" : " Gespann-Notizen") + (ungelesen ? " (" + ungelesen + " neu)" : "") : "Gespann-Notiz");
    }
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
        hinweise.slice().sort(function (a, b) { return (b.offiziell ? 1 : 0) - (a.offiziell ? 1 : 0); }).forEach(function (n) {
          function neuZeichnen() { leeren(innen); box.open = false; spielExtras(spiel, ziel, istIch); var d2 = ziel.querySelector("details"); if (d2) d2.open = true; }
          var z = h("div", { class: "kandidat" + (n.offiziell ? " offiziell" : "") }, [
            h("div", {}, [n.offiziell ? h("span", { class: "offiziell-badge", text: "Offiziell" }) : null, n.text]),
            h("div", { class: "meta" }, [n.name + " · " + new Date(n.angelegt).toLocaleDateString("de-DE"),
              (n.user_id === session.user.id || istAdminAn()) ? h("button", { type: "button", class: "textknopf", style: "margin-left:8px", text: "löschen", onclick: function () {
                sb.from("hallen_notizen").delete().eq("id", n.id).then(function () { cache.hallen[spiel.halle] = hinweise.filter(function (x) { return x !== n; }); neuZeichnen(); });
              } }) : null,
              istAdminAn() ? h("button", { type: "button", class: "textknopf", style: "margin-left:8px", text: n.offiziell ? "nicht mehr offiziell" : "als offiziell markieren", title: "Offizielle Hinweise stehen oben, auf der Spielseite für alle und im Kalender", onclick: function () {
                sb.from("hallen_notizen").update({ offiziell: !n.offiziell }).eq("id", n.id).then(function (r) { if (r.error) { meldung(fehlerText(r.error), "warn"); return; } n.offiziell = !n.offiziell; document.dispatchEvent(new CustomEvent("mg-betreiber")); neuZeichnen(); });
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
        var vorschlaege = wegVorschlaege(spiel, (spiel.gespann || []).map(function (g) { return g.slug; }));
        Object.keys(vorschlaege).forEach(function (s) {
          var g = (spiel.gespann || []).filter(function (x) { return x.slug === s; })[0], v = vorschlaege[s]; if (!g) return;
          innen.appendChild(h("p", { class: "meta", style: "margin:0 0 6px" }, [h("span", { class: "offiziell-badge", text: "auf dem Weg" }),
            (v.richtung === "ich" ? g.name + " (" + (v.ort || "Wohnort geteilt") + ") liegt auf deinem Weg – Umweg ca. " + v.umweg + " km." : "Du liegst auf dem Weg von " + g.name + " (" + (v.ort || "Wohnort geteilt") + ") – Umweg für ihn ca. " + v.umweg + " km.")]));
        });
        mitfahrten.forEach(function (m) {
          var nr = nummerVon(m.slug), l = nr ? telefonLink(nr.telefon) : null;
          innen.appendChild(h("div", { class: "kandidat" }, [h("div", {}, [h("span", { class: "offiziell-badge", style: m.art === "suche" ? "background:var(--rot)" : "", text: m.art === "suche" ? "sucht" : "bietet" }), m.text]),
            h("div", { class: "meta" }, [m.name, l ? h("a", { class: "textknopf", style: "margin-left:8px", href: l.tel, text: "anrufen" }) : null, l ? h("a", { class: "textknopf", style: "margin-left:6px", href: l.wa, target: "_blank", rel: "noopener", text: "WhatsApp" }) : null])]));
        });
        if (istIch) {
          var mf = h("input", { type: "text", placeholder: "z. B. „Ich fahre ab Iserlohn, 2 Plätze frei“ oder „Suche Mitfahrt ab Essen“", value: meineMitfahrt ? meineMitfahrt.text : "", maxlength: "160" });
          function mitfahrtSpeichern(art) {
            var t = mf.value.trim() || (art === "suche" ? "Suche Mitfahrt" : "Biete Mitfahrt");
            mitfahrtSetzen(spiel, art, t).then(function (ok) { if (!ok) return; kurzMeldung(art === "suche" ? "Gesucht ✓ – Kollegen sehen es auf ihrer Karte und unter „Zusammen fahren“." : "Angeboten ✓ – Kollegen sehen es auf ihrer Karte und unter „Zusammen fahren“.", "gut"); extrasLaden([spiel]).then(function () { spielExtras(spiel, ziel, istIch); }); });
          }
          innen.appendChild(h("div", { class: "mg-form" }, [mf, h("div", { class: "zweit" }, [
            h("button", { type: "button", text: meineMitfahrt && meineMitfahrt.art !== "suche" ? "Angebot aktualisieren" : "Ich biete", onclick: function () { mitfahrtSpeichern("biete"); } }),
            h("button", { type: "button", text: meineMitfahrt && meineMitfahrt.art === "suche" ? "Gesuch aktualisieren" : "Ich suche", onclick: function () { mitfahrtSpeichern("suche"); } }),
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
        // Verlauf wie ein kleiner Chat: eigene Nachrichten rechts, neue markiert
        var gelesenBis = 0; try { gelesenBis = parseInt(localStorage.getItem("gespann-gelesen:" + kennung) || "0", 10) || 0; } catch (e) {}
        var verlauf = h("div", { class: "gespann-verlauf" });
        kommentare.forEach(function (k) {
          var meins = k.user_id === session.user.id, zeit = new Date(k.angelegt);
          var neu = !meins && zeit.getTime() > gelesenBis;
          var b = h("div", { class: "blase" + (meins ? " ich" : "") + (neu ? " neu" : "") }, [
            meins ? null : h("b", { text: (k.name || "").split(",")[0] }),
            h("div", { text: k.text }),
            h("div", { class: "zeit" }, [zeit.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
              meins ? h("button", { type: "button", class: "textknopf", style: "margin-left:8px", text: "löschen", onclick: function () {
                sb.from("spielkommentare").delete().eq("id", k.id).then(function () { delete cache.geladen["k|" + kennung]; extrasLaden([spiel]).then(function () { spielExtras(spiel, ziel, istIch); var d = ziel.querySelector("details"); if (d) d.open = true; }); });
              } }) : null])]);
          verlauf.appendChild(b);
        });
        innen.appendChild(verlauf);
        try { if (kommentare.length) localStorage.setItem("gespann-gelesen:" + kennung, String(Date.now())); } catch (e) {}
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
        if (!treffer.length) liste.appendChild(h("p", { class: "leer" }, [alle.length ? "Nichts gefunden." : "Noch keine Notizen. Auf jeder Spielseite gibt es „Meine Notiz“.", alle.length ? null : h("a", { class: "anfrage leer-aktion", href: "#plan", text: "Zum Spielplan" })]));
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

  // Adminseite: eine Leiste oben, darunter genau ein Bereich. Vorher standen
  // fuenf Karten untereinander - auf dem Handy eine endlose Rolle.
  var adminBereich = "freischaltung";
  function zeigeAdmin() {
    var BEREICHE = [
      ["freischaltung", "Freischaltung", "i-check", adminRendern],
      ["funktionen", "Funktionen", "i-shield", funktionenRendern],
      ["spiel", "Spiel anlegen", "i-cal", spielAnlegenRendern],
      ["hallen", "Hallen & Vereine", "i-pin", hallenPflegeRendern],
      ["adressen", "Vereine", "i-note", vereinsAdressenRendern],
      ["telefon", "Telefonliste", "i-users", telefonlisteRendern]
    ];
    if (!BEREICHE.filter(function (b) { return b[0] === adminBereich; }).length) adminBereich = BEREICHE[0][0];

    inhalt.appendChild(h("p", { class: "meta admin-kopf", text: "Betreiber-Werkzeuge. Was du hier änderst, sehen alle." }));
    var leiste = h("div", { class: "admin-leiste" });
    var zaehlKnopf = null;
    BEREICHE.forEach(function (b) {
      var k = h("button", { type: "button", class: "filterknopf" + (adminBereich === b[0] ? " aktiv" : ""), onclick: function () {
        adminBereich = b[0]; zeigeReiter("admin");
      } }, [ikone(b[2]), " " + b[1]]);
      if (b[0] === "freischaltung") zaehlKnopf = k;
      leiste.appendChild(k);
    });
    inhalt.appendChild(leiste);

    // Wartende Konten stehen als Zahl am Knopf - dafuer muss man nicht
    // erst hineinschauen.
    sb.from("profile").select("id,freigeschaltet,admin").eq("freigeschaltet", false).then(function (r) {
      var n = (r.data || []).filter(function (p) { return !p.admin; }).length;
      if (!n || !zaehlKnopf || !zaehlKnopf.isConnected) return;
      zaehlKnopf.appendChild(h("i", { text: String(n) }));
    }).catch(function () {});

    var box = h("div", { class: "melde karte" }, [skelett(1)]);
    inhalt.appendChild(box);
    var gewaehlt = BEREICHE.filter(function (b) { return b[0] === adminBereich; })[0];
    gewaehlt[3](box);

    inhalt.appendChild(h("p", { class: "meta mg-fuss", text: "Freigeschaltete sehen Tauschbörse, Verfügbarkeiten, Hallen-Hinweise, Kontakte und Mitfahrten. " +
      "Admins können außerdem freischalten und weitere Admins ernennen. Das eigene Admin-Recht lässt sich hier nicht entfernen – dafür SQL im Supabase-Dashboard." }));
  }

  // Admin -> Spiel anlegen: Spiele, die auf esrw.de fehlen
  function spielManuellLoeschen(id) {
    if (!session || !profil || !profil.admin) return Promise.resolve(false);
    return sb.from("spiele_manuell").delete().eq("id", id).then(function (r) { if (r.error) { meldung(fehlerText(r.error), "warn"); return false; } document.dispatchEvent(new CustomEvent("mg-betreiber")); return true; });
  }
  function spielAnlegenRendern(box) {
    function lokal(d) { function z(n) { return ("0" + n).slice(-2); } return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + "T" + z(d.getHours()) + ":" + z(d.getMinutes()); }
    var liga = h("input", { type: "text", placeholder: "Liga, z. B. „U15 FS“ (optional)", maxlength: "40" });
    var heim = h("input", { type: "text", placeholder: "Heim, z. B. „EHC Essen Ruhr“", maxlength: "80" });
    var gast = h("input", { type: "text", placeholder: "Gast (leer bei Turnier/Lehrgang)", maxlength: "80" });
    var beginn = h("input", { type: "datetime-local" }); beginn.value = lokal(new Date(Date.now() + 7 * 86400000));
    var treff = h("input", { type: "datetime-local" });
    var halle = h("select", { class: "mg-select" }, [h("option", { value: "", text: "– Halle wählen –" })].concat(Object.keys(ctx.daten.adressen || {}).sort(function (a, b) { return a.localeCompare(b, "de"); }).map(function (n) { return h("option", { value: n, text: n }); })));
    var hinweis = h("input", { type: "text", placeholder: "Hinweis für alle (optional)", maxlength: "200" });
    var namen = ctx.daten.personen.map(function (p) { return p.name; });
    var zeilen = [];
    var besetzungBox = h("div");
    function personZeile() {
      var p = h("select", { class: "mg-select" }, [h("option", { value: "", text: "– Schiedsrichter –" })].concat(namen.map(function (n) { return h("option", { value: n, text: n }); })));
      var r = h("select", { class: "mg-select" }, [["SR", "SR"], ["HSR", "HSR"], ["LSR", "LSR"]].map(function (x) { return h("option", { value: x[0], text: x[1] }); }));
      zeilen.push([p, r]); besetzungBox.appendChild(h("div", { class: "mg-besetzung" }, [p, r]));
    }
    personZeile(); personZeile();
    var mehr = h("button", { type: "button", class: "textknopf", text: "+ weitere Person", onclick: function () { if (zeilen.length < 4) personZeile(); } });
    var speichern = h("button", { type: "button", class: "anfrage", text: "Spiel anlegen", onclick: function () {
      var hm = heim.value.trim(), g = gast.value.trim();
      if (!hm || !beginn.value) { meldung("Heim und Anstoß sind Pflicht.", "warn"); return; }
      var bes = zeilen.map(function (z) { return z[0].value ? { name: z[0].value, rolle: z[1].value } : null; }).filter(Boolean);
      speichern.disabled = true;
      sb.from("spiele_manuell").insert({ beginn: new Date(beginn.value).toISOString(), treffpunkt: treff.value ? new Date(treff.value).toISOString() : null, liga: liga.value.trim() || null, paarung: g ? hm + " – " + g : hm, halle: halle.value || null, hinweis: hinweis.value.trim() || null, besetzung: bes, von: profil.name || profil.slug }).select()
        .then(function (r) {
          speichern.disabled = false;
          if (r.error) { meldung(fehlerText(r.error) + (/spiele_manuell/.test(r.error.message || "") ? " – schema.sql (v13) ausführen." : ""), "warn"); return; }
          kurzMeldung("Spiel angelegt ✓ – in der App sofort, Kalender und Push beim nächsten Lauf.", "gut");
          document.dispatchEvent(new CustomEvent("mg-betreiber"));
          leeren(box); box.appendChild(h("h4", {}, [ikone("i-cal"), " Spiel anlegen"])); spielAnlegenRendern(box);
        });
    } });
    var form = h("div", { class: "mg-form" }, [
      h("p", { class: "meta", style: "margin:0 0 6px", text: "Für Spiele, die auf esrw.de fehlen – Freundschaftsspiele, Turniere, Lehrgänge. Die Schiedsrichter sehen es wie jedes andere Spiel (Kalender, Push, Abrechnung)." }),
      h("div", { class: "mg-felder mg-zwei" }, [h("label", {}, ["Liga", liga]), h("label", {}, ["Anstoß", beginn])]),
      h("div", { class: "mg-felder mg-zwei" }, [h("label", {}, ["Heim", heim]), h("label", {}, ["Gast", gast])]),
      h("label", { text: "Halle" }), halle,
      h("div", { class: "mg-felder mg-zwei" }, [h("label", {}, ["Treffpunkt (leer = Vorlauf)", treff]), h("label", {}, ["Hinweis", hinweis])]),
      h("label", { text: "Besetzung" }), besetzungBox, mehr,
      h("div", { class: "zweit", style: "margin-top:8px" }, [speichern])
    ]);
    sb.from("spiele_manuell").select("id,beginn,liga,paarung,halle,besetzung").order("beginn").then(function (r) {
      leeren(box); box.appendChild(h("h4", {}, [ikone("i-cal"), " Spiel anlegen"]));
      box.appendChild(form);
      var liste = (r.data || []).filter(function (z) { return new Date(z.beginn) > new Date(Date.now() - 86400000); });
      if (liste.length) {
        var det = h("details", { class: "tausch", style: "margin-top:10px" }, [h("summary", { text: liste.length + (liste.length === 1 ? " angelegtes Spiel" : " angelegte Spiele") })]);
        liste.forEach(function (z) {
          var d = new Date(z.beginn);
          det.appendChild(h("div", { class: "sperre" }, [
            h("span", {}, [h("b", { text: datum(d) + " " + uhr(d) + " · " + (z.liga ? z.liga + ": " : "") + z.paarung }), h("small", { class: "meta", style: "display:block", text: (z.halle || "Halle offen") + ((z.besetzung || []).length ? " · " + z.besetzung.map(function (b) { return b.name; }).join(", ") : "") })]),
            h("button", { type: "button", class: "textknopf", text: "löschen", onclick: function () { if (!confirm("Spiel löschen?")) return; spielManuellLoeschen(z.id).then(function (ok) { if (ok) { leeren(box); box.appendChild(h("h4", {}, [ikone("i-cal"), " Spiel anlegen"])); spielAnlegenRendern(box); } }); } })
          ]));
        });
        box.appendChild(det);
      }
    }).catch(function (e) { leeren(box); box.appendChild(h("h4", {}, [ikone("i-cal"), " Spiel anlegen"])); box.appendChild(form); box.appendChild(h("p", { class: "achtung", text: "Tabelle spiele_manuell fehlt – schema.sql (v13) ausführen. " + fehlerText(e) })); });
  }

  // Admin -> Hallen und Vereine: fehlende Zuordnungen ohne Commit nachtragen
  function hallenPflegeRendern(box) {
    var hallenNamen = Object.keys(ctx.daten.adressen || {}).sort(function (a, b) { return a.localeCompare(b, "de"); });
    function hallenWahl() { return h("select", { class: "mg-select" }, [h("option", { value: "", text: "– Halle –" })].concat(hallenNamen.map(function (n) { return h("option", { value: n, text: n }); }))); }
    function neu() { leeren(box); box.appendChild(h("h4", {}, [ikone("i-pin"), " Hallen und Vereine"])); hallenPflegeRendern(box); }
    leeren(box); box.appendChild(h("h4", {}, [ikone("i-pin"), " Hallen und Vereine"]));
    box.appendChild(h("p", { class: "meta", style: "margin:0 0 6px", text: "Wenn eine Halle nicht erkannt wird: Verein einer Halle zuordnen oder eine neue Halle anlegen. Wirkt in der App sofort, in Kalendern und der Hallen-Erkennung beim nächsten Lauf." }));
    // Unerkannte Spiele: Heimverein -> Halle
    var offen = {};
    (ctx.daten.spiele || []).forEach(function (s) { if (s.halle_erkannt || s.vergangen) return; var heim = (s.paarung || "").split(/\s[–-]\s/)[0].trim(); if (heim) offen[heim] = (offen[heim] || 0) + 1; });
    var offenListe = Object.keys(offen);
    if (offenListe.length) {
      box.appendChild(h("p", { text: "Nicht erkannt (" + offenListe.length + "):" }));
      offenListe.forEach(function (heim) {
        var wahl = hallenWahl();
        box.appendChild(h("div", { class: "sperre" }, [
          h("span", {}, [h("b", { text: heim }), h("small", { class: "meta", style: "display:block", text: offen[heim] + (offen[heim] === 1 ? " Spiel" : " Spiele") })]),
          h("span", { style: "display:flex;gap:6px;align-items:center" }, [wahl, h("button", { type: "button", class: "anfrage", text: "Zuordnen", onclick: function () {
            if (!wahl.value) return;
            sb.from("vereine_extra").upsert({ verein: heim, halle: wahl.value, von: profil.name || profil.slug }, { onConflict: "verein" }).then(function (r) {
              if (r.error) { meldung(fehlerText(r.error) + (/vereine_extra/.test(r.error.message || "") ? " – schema.sql (v13) ausführen." : ""), "warn"); return; }
              kurzMeldung(heim + " → " + wahl.value + " ✓ (Kalender beim nächsten Lauf)", "gut"); neu();
            });
          } })])
        ]));
      });
    } else box.appendChild(h("p", { class: "meta", text: "Alle Hallen im Spielplan erkannt ✓" }));
    // Verein/Ort frei zuordnen
    var verein = h("input", { type: "text", placeholder: "Verein oder Ort, wie auf esrw.de", maxlength: "80" });
    var vwahl = hallenWahl();
    box.appendChild(h("details", { class: "tausch", style: "margin-top:8px" }, [h("summary", { text: "Verein oder Ort einer Halle zuordnen" }),
      h("div", { class: "mg-form" }, [verein, vwahl, h("button", { type: "button", class: "anfrage", text: "Speichern", onclick: function () {
        var v = verein.value.trim(); if (!v || !vwahl.value) return;
        sb.from("vereine_extra").upsert({ verein: v, halle: vwahl.value, von: profil.name || profil.slug }, { onConflict: "verein" }).then(function (r) { if (r.error) { meldung(fehlerText(r.error), "warn"); return; } kurzMeldung("Zugeordnet ✓", "gut"); neu(); });
      } })])]));
    // Neue Halle
    var hname = h("input", { type: "text", placeholder: "Hallenname", maxlength: "80" });
    var hadresse = h("input", { type: "text", placeholder: "Straße Hausnummer, PLZ Ort", autocomplete: "off" });
    var koord = h("p", { class: "meta", text: "" }); var lat = null, lon = null;
    var suchen = h("button", { type: "button", class: "mg-neben", text: "Adresse suchen", onclick: function () {
      var q = hadresse.value.trim(); if (!q) return; koord.textContent = "suche …";
      fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de,nl,be&q=" + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (t) {
        if (!t.length) { koord.textContent = "nicht gefunden – genauer eingeben"; lat = lon = null; return; }
        lat = parseFloat(t[0].lat); lon = parseFloat(t[0].lon); koord.textContent = "gefunden: " + t[0].display_name.split(",").slice(0, 3).join(",");
      }).catch(function () { koord.textContent = "Suche nicht erreichbar"; });
    } });
    box.appendChild(h("details", { class: "tausch", style: "margin-top:8px" }, [h("summary", { text: "Neue Halle anlegen" }),
      h("div", { class: "mg-form" }, [hname, h("div", { class: "mg-zeile" }, [hadresse, suchen]), koord, h("button", { type: "button", class: "anfrage", text: "Halle speichern", onclick: function () {
        var n = hname.value.trim(); if (!n) { meldung("Name fehlt.", "warn"); return; }
        if (lat == null) { meldung("Erst die Adresse suchen lassen – ohne Koordinaten keine Karte, kein Wetter, keine Strecke.", "warn"); return; }
        sb.from("hallen_extra").upsert({ name: n, adresse: hadresse.value.trim(), lat: lat, lon: lon, von: profil.name || profil.slug }, { onConflict: "name" }).then(function (r) {
          if (r.error) { meldung(fehlerText(r.error) + (/hallen_extra/.test(r.error.message || "") ? " – schema.sql (v13) ausführen." : ""), "warn"); return; }
          kurzMeldung("Halle angelegt ✓", "gut"); document.dispatchEvent(new CustomEvent("mg-betreiber")); setTimeout(neu, 800);
        });
      } })])]));
    // Bestehende Zuordnungen
    Promise.all([sb.from("vereine_extra").select("verein,halle").order("verein"), sb.from("hallen_extra").select("name,adresse").order("name")]).then(function (r) {
      var v = r[0].data || [], hl = r[1].data || [];
      if (!v.length && !hl.length) return;
      var det = h("details", { class: "tausch", style: "margin-top:8px" }, [h("summary", { text: "Eingetragen: " + hl.length + " Hallen, " + v.length + " Zuordnungen" })]);
      hl.forEach(function (x) { det.appendChild(h("div", { class: "sperre" }, [h("span", {}, [h("b", { text: x.name }), h("small", { class: "meta", style: "display:block", text: x.adresse || "" })]), h("button", { type: "button", class: "textknopf", text: "löschen", onclick: function () { sb.from("hallen_extra").delete().eq("name", x.name).then(function () { document.dispatchEvent(new CustomEvent("mg-betreiber")); neu(); }); } })])); });
      v.forEach(function (x) { det.appendChild(h("div", { class: "sperre" }, [h("span", {}, [h("b", { text: x.verein }), h("small", { class: "meta", style: "display:block", text: "→ " + x.halle })]), h("button", { type: "button", class: "textknopf", text: "löschen", onclick: function () { sb.from("vereine_extra").delete().eq("verein", x.verein).then(function () { neu(); }); } })])); });
      box.appendChild(det);
    }).catch(function () {});
  }

  // Admin -> Telefonliste: Nummern aller Kollegen (Verbandsliste). Gelesen
  // wird sie im Reiter "Kollegen", geaendert nur hier.
  function telefonlisteRendern(box) {
    function neu() { cache.geladen.telefon = 0; leeren(box); telefonlisteRendern(box); }
    function kopf() { box.appendChild(h("h4", {}, [ikone("i-users"), " Telefonliste"])); }
    var personen = ctx.daten.personen;
    function slugZu(name) {
      var n = name.trim().toLowerCase();
      var p = personen.filter(function (x) { return x.name.toLowerCase() === n || (x.varianten || []).some(function (v) { return v.toLowerCase() === n; }); })[0];
      if (p) return p.slug;
      // "Vorname Nachname" -> "Nachname, Vorname"
      var t = n.split(/\s+/); if (t.length >= 2) { var um = t.slice(-1)[0] + ", " + t.slice(0, -1).join(" "); p = personen.filter(function (x) { return x.name.toLowerCase() === um; })[0]; if (p) return p.slug; }
      p = personen.filter(function (x) { return x.name.toLowerCase().split(",")[0].trim() === n.split(",")[0].trim(); });
      return p.length === 1 ? p[0].slug : null;
    }
    var ta = h("textarea", { rows: "4", placeholder: "Je Zeile: Nachname, Vorname; 0171 1234567\noder: Vorname Nachname; +49 …" });
    var einzelName = h("select", { class: "mg-select" }, [h("option", { value: "", text: "– Kollege –" })].concat(personen.map(function (p) { return h("option", { value: p.slug, text: p.name }); })));
    var einzelNr = h("input", { type: "tel", placeholder: "Nummer" });
    var formBox = h("div", { class: "mg-form" }, [
      h("div", { class: "mg-zeile" }, [einzelName, einzelNr]),
      h("button", { type: "button", class: "anfrage", text: "Nummer speichern", onclick: function () {
        if (!einzelName.value || !einzelNr.value.trim()) { meldung("Kollege und Nummer wählen.", "warn"); return; }
        var p = personen.filter(function (x) { return x.slug === einzelName.value; })[0];
        speichern(sb.from("telefonliste").upsert({ slug: einzelName.value, name: p ? p.name : einzelName.value,
                                                   telefon: einzelNr.value.trim(), von: profil.name || profil.slug }, { onConflict: "slug" }))
          .then(function (r2) {
            if (r2 && r2.error) { meldung(fehlerText(r2.error) + (/telefonliste/.test(r2.error.message || "") ? " – schema.sql (v14) ausführen." : ""), "warn"); return; }
            kurzMeldung("Gespeichert ✓", "gut"); neu();
          });
      } })]);

    leeren(box); kopf(); box.appendChild(skelett(1));
    telefonbuchLaden().then(function (d) {
      if (!box.isConnected) return;
      leeren(box); kopf();
      if (d.fehler) {
        box.appendChild(h("p", { class: "achtung", text: "Tabelle telefonliste fehlt – schema.sql (v14) ausführen. " + fehlerText(d.fehler) }));
        return;
      }
      var alle = telefonbuchZeilen(d);
      box.appendChild(h("p", { class: "meta", style: "margin:0 0 6px",
        text: d.liste.length + (d.liste.length === 1 ? " Nummer" : " Nummern") + " vom Betreiber"
          + (d.selbst.length ? ", dazu " + d.selbst.length + " selbst freigegeben" : "")
          + ". Alle angemeldeten Kollegen sehen die Liste im Reiter „Kollegen“; ändern kannst nur du. "
          + "Eine selbst freigegebene Nummer geht vor." }));
      box.appendChild(formBox);
      box.appendChild(h("details", { class: "tausch", style: "margin-top:8px" }, [h("summary", { text: "Liste einfügen (mehrere auf einmal)" }), h("div", { class: "mg-form" }, [ta, h("button", { type: "button", class: "anfrage", text: "Einlesen", onclick: function () {
        var zeilen = ta.value.split(/\n/).map(function (z) { return z.trim(); }).filter(Boolean), ok = [], unklar = [];
        zeilen.forEach(function (z) { var t = z.split(/[;\t]/); if (t.length < 2) { unklar.push(z); return; } var nr = t.slice(1).join(" ").trim(), slug = slugZu(t[0]); if (!slug || !nr) { unklar.push(z); return; } var p = personen.filter(function (x) { return x.slug === slug; })[0]; ok.push({ slug: slug, name: p ? p.name : t[0].trim(), telefon: nr, von: profil.name || profil.slug }); });
        if (!ok.length) { meldung("Nichts erkannt – Format: Name; Nummer", "warn"); return; }
        speichern(sb.from("telefonliste").upsert(ok, { onConflict: "slug" })).then(function (r2) { if (r2 && r2.error) { meldung(fehlerText(r2.error), "warn"); return; } kurzMeldung(ok.length + " Nummern gespeichert" + (unklar.length ? ", " + unklar.length + " nicht zugeordnet: " + unklar.slice(0, 3).join(" | ") : ""), unklar.length ? "warn" : "gut"); neu(); });
      } })])]));

      var suche = h("input", { type: "search", class: "mg-suche", style: "margin-top:10px", placeholder: "Name suchen …" });
      box.appendChild(suche);
      var innen = h("div", { class: "telefon-liste" });
      box.appendChild(innen);
      function zeichne() {
        var q = suche.value.trim().toLowerCase();
        leeren(innen);
        var treffer = alle.filter(function (z) { return !q || String(z.name).toLowerCase().indexOf(q) >= 0; });
        if (!treffer.length) { innen.appendChild(h("p", { class: "leer", text: alle.length ? "Niemand gefunden." : "Noch keine Nummer eingetragen." })); return; }
        treffer.forEach(function (z) {
          var extra = [];
          extra.push(h("button", { type: "button", text: "Ändern", onclick: function () {
            einzelName.value = z.slug; einzelNr.value = z.inListe ? (z.betreiber || z.telefon) : z.telefon;
            formBox.scrollIntoView({ block: "center", behavior: "smooth" });
            einzelNr.focus();
          } }));
          if (z.inListe) extra.push(h("button", { type: "button", style: "color:var(--rot)", text: "Löschen", onclick: function () {
            if (!confirm("Nummer von " + z.name + " aus der Betreiberliste löschen?")) return;
            speichern(sb.from("telefonliste").delete().eq("slug", z.slug)).then(function () { neu(); });
          } }));
          innen.appendChild(telefonZeile(z, extra));
        });
      }
      suche.addEventListener("input", zeichne);
      zeichne();
    });
  }

  // Admin -> Vereinsadressen: sie stehen auf jeder Rechnung, und einmal
  // eingetragen sparen sie allen Kollegen die Sucherei.
  function vereinHaupt(name) {
    // "Krefelder EV 1b" und "Krefelder EV 1c" sind derselbe Verein
    return String(name || "").replace(/\s+1[a-z]$/i, "").trim();
  }
  function vereineAusDaten() {
    var gesehen = {};
    // Nur Heimvereine: an die geht die Rechnung.
    (ctx.daten.spiele || []).forEach(function (s) {
      var v = vereinHaupt(String(s.paarung || "").split(/\s+[-–]\s+/)[0]);
      if (v && v.length > 2) gesehen[v] = (gesehen[v] || 0) + 1;
    });
    return Object.keys(gesehen).sort(function (a, b) { return a.localeCompare(b, "de"); });
  }
  // Ein Verein: anlegen, umbenennen, Anschrift aendern, loeschen. Der
  // Schluessel ist der Name aus dem Spielplan - daran haengt die Zuordnung.
  function vereinSpeichern(verein, werte, alt) {
    var zeile = { verein: verein, name: werte.name || verein, strasse: werte.strasse || "", plz_ort: werte.plz_ort || "",
                  angelegt_von: session.user.id, geaendert: new Date().toISOString() };
    return speichern(sb.from("vereine_adressen").upsert(zeile, { onConflict: "verein" })).then(function (r) {
      if (r && r.error) { meldung(fehlerText(r.error), "warn"); return false; }
      if (!alt || alt === verein) return true;
      return speichern(sb.from("vereine_adressen").delete().eq("verein", alt)).then(function () { return true; });
    });
  }
  function vereinsAdressenRendern(box) {
    function neu() { vereinAdressen = null; leeren(box); vereinsAdressenRendern(box); }
    leeren(box); box.appendChild(h("h4", {}, [ikone("i-pin"), " Vereine"]));
    box.appendChild(h("p", { class: "meta", style: "margin:0 0 8px", text:
      "Name und Anschrift stehen auf der Gebührenabrechnung. Alle freigeschalteten Kollegen sehen und nutzen sie. "
      + "Welche Halle zu einem Verein gehört, steht unter „Hallen & Vereine“." }));

    // Verein von Hand anlegen - fuer alles, was nicht im Spielplan steht
    var nVerein = h("input", { type: "text", placeholder: "Verein, wie er im Spielplan steht" });
    var nName = h("input", { type: "text", placeholder: "Name auf der Rechnung (optional)" });
    var nStr = h("input", { type: "text", placeholder: "Straße und Nr." });
    var nOrt = h("input", { type: "text", placeholder: "PLZ und Ort" });
    box.appendChild(h("details", { class: "tausch" }, [
      h("summary", { text: "+ Verein anlegen" }),
      h("div", { class: "mg-form" }, [nVerein, nName, nStr, nOrt,
        h("button", { type: "button", class: "anfrage", text: "Anlegen", onclick: function () {
          var v = nVerein.value.trim();
          if (!v) { meldung("Bitte den Vereinsnamen eintragen.", "warn"); return; }
          vereinSpeichern(v, { name: nName.value.trim() || v, strasse: nStr.value.trim(), plz_ort: nOrt.value.trim() })
            .then(function (ok) { if (ok) { kurzMeldung("Angelegt ✓", "gut"); neu(); } });
        } })])]));

    var ta = h("textarea", { rows: "4", placeholder: "Je Zeile: Verein; Straße und Nr.; PLZ Ort" });
    box.appendChild(h("details", { class: "tausch" }, [
      h("summary", { text: "Liste einfügen (mehrere auf einmal)" }),
      h("div", { class: "mg-form" }, [ta, h("button", { type: "button", class: "anfrage", text: "Einlesen", onclick: function () {
        var zeilen = ta.value.split(/\n/).map(function (z) { return z.trim(); }).filter(Boolean);
        var sammlung = [], unklar = [];
        zeilen.forEach(function (z) {
          var t = z.split(";");
          if (t.length < 3) { unklar.push(z); return; }
          sammlung.push({ verein: t[0].trim(), name: t[0].trim(), strasse: t[1].trim(), plz_ort: t.slice(2).join(";").trim(),
                          angelegt_von: session.user.id, geaendert: new Date().toISOString() });
        });
        if (!sammlung.length) { meldung("Nichts erkannt – Format: Verein; Straße; PLZ Ort", "warn"); return; }
        speichern(sb.from("vereine_adressen").upsert(sammlung, { onConflict: "verein" })).then(function (r) {
          if (r && r.error) { meldung(fehlerText(r.error), "warn"); return; }
          kurzMeldung(sammlung.length + " Adressen gespeichert" + (unklar.length ? ", " + unklar.length + " unklar" : "") + " ✓", "gut");
          ta.value = ""; neu();
        });
      } })])
    ]));
    // Vorschlagsliste aus dem Verzeichnis des EHV NRW - schreibt nur dorthin,
    // wo noch keine Adresse steht, und ruehrt Geaendertes nicht an.
    box.appendChild(h("p", { class: "meta", style: "margin:6px 0 8px" }, [
      h("button", { type: "button", class: "textknopf", text: "Vorschläge aus dem EHV-Verzeichnis einlesen", onclick: function () {
        holeJson("vereine-vorschlag.json", null).then(function (v) {
          if (!v || !v.vereine) { meldung("Vorschlagsliste nicht gefunden.", "warn"); return; }
          return vereinAdressenLaden().then(function (map) {
            var offen = v.vereine.filter(function (x) { return !map[x.verein]; });
            if (!offen.length) { kurzMeldung("Alle Vereine haben schon eine Adresse.", ""); return; }
            if (!confirm(offen.length + " Adressen aus dem EHV-Verzeichnis übernehmen? Vorhandene bleiben unberührt.")) return;
            var zeilen = offen.map(function (x) {
              return { verein: x.verein, name: x.name, strasse: x.strasse, plz_ort: x.plz_ort,
                       angelegt_von: session.user.id, geaendert: new Date().toISOString() };
            });
            return speichern(sb.from("vereine_adressen").upsert(zeilen, { onConflict: "verein" })).then(function (r) {
              if (r && r.error) { meldung(fehlerText(r.error), "warn"); return; }
              kurzMeldung(zeilen.length + " Adressen übernommen ✓ – bitte einmal prüfen.", "gut");
              neu();
            });
          });
        });
      } })]));

    var suche = h("input", { type: "search", class: "mg-suche", placeholder: "Verein suchen …" });
    box.appendChild(suche);
    var zaehlZeile = h("p", { class: "meta", style: "margin:8px 0 6px", text: "" });
    box.appendChild(zaehlZeile);
    var innen = h("div", { class: "verein-liste" }, [skelett(1)]);
    box.appendChild(innen);

    vereinAdressenLaden().then(function (map) {
      if (!box.isConnected) return;
      var ausSpielen = vereineAusDaten(), imPlan = {}, liste = [];
      ausSpielen.forEach(function (v) { imPlan[v] = true; liste.push(v); });
      Object.keys(map).forEach(function (v) { if (!imPlan[v]) liste.push(v); });
      liste.sort(function (a, b) { return a.localeCompare(b, "de"); });
      var ohne = liste.filter(function (v) { return !map[v]; }).length;
      zaehlZeile.textContent = "Anschrift hinterlegt bei " + (liste.length - ohne) + " von " + liste.length + " Vereinen"
        + (ohne ? " – " + ohne + (ohne === 1 ? " fehlt" : " fehlen") + " noch" : "") + ".";

      function eintrag(v) {
        var a = map[v] || {};
        var det = h("details", { class: "tausch" }, [h("summary", {}, [h("span", {}, [
          h("b", { text: a.name || v }),
          h("small", { style: "display:block;color:" + (a.strasse ? "var(--dim)" : "var(--warn)"),
                       text: a.strasse ? a.strasse + ", " + (a.plz_ort || "") : "keine Adresse" })])])]);
        var fSchl = h("input", { type: "text", value: v, placeholder: "Verein im Spielplan" });
        var fName = h("input", { type: "text", value: a.name || v, placeholder: "Name auf der Rechnung" });
        var fStr = h("input", { type: "text", value: a.strasse || "", placeholder: "Straße und Nr." });
        var fOrt = h("input", { type: "text", value: a.plz_ort || "", placeholder: "PLZ und Ort" });
        det.appendChild(h("div", { class: "mg-form" }, [
          h("label", { text: "Name im Spielplan" }), fSchl,
          h("p", { class: "meta", style: "margin:-2px 0 6px", text: imPlan[v]
            ? "Steht so im Spielplan – daran wird die Adresse erkannt. Ändern nur, wenn der Spielplan anders schreibt."
            : "Kommt im Spielplan nicht vor – selbst angelegt." }),
          h("label", { text: "Name auf der Rechnung" }), fName,
          h("label", { text: "Anschrift" }), fStr, fOrt,
          h("div", { class: "zweit", style: "margin-top:8px" }, [
            h("button", { type: "button", class: "haupt", text: "Speichern", onclick: function () {
              var schl = fSchl.value.trim();
              if (!schl) { meldung("Der Name im Spielplan darf nicht leer sein.", "warn"); return; }
              vereinSpeichern(schl, { name: fName.value.trim() || schl, strasse: fStr.value.trim(), plz_ort: fOrt.value.trim() }, v)
                .then(function (ok) { if (ok) { kurzMeldung("Gespeichert ✓", "gut"); neu(); } });
            } }),
            h("button", { type: "button", style: "color:var(--rot)", text: "Löschen", onclick: function () {
              if (!map[v]) { meldung("Zu diesem Verein ist nichts gespeichert.", "warn"); return; }
              if (!confirm("Adresse von " + (a.name || v) + " löschen? Der Verein bleibt im Spielplan.")) return;
              speichern(sb.from("vereine_adressen").delete().eq("verein", v)).then(function (r) {
                if (r && r.error) { meldung(fehlerText(r.error), "warn"); return; }
                kurzMeldung("Gelöscht.", ""); neu();
              });
            } })])
        ]));
        return det;
      }
      function zeichne() {
        var q = suche.value.trim().toLowerCase();
        var treffer = liste.filter(function (v) {
          if (!q) return true;
          var a = map[v] || {};
          return (v + " " + (a.name || "") + " " + (a.plz_ort || "")).toLowerCase().indexOf(q) >= 0;
        });
        leeren(innen);
        if (!treffer.length) { innen.appendChild(h("p", { class: "leer", text: "Kein Verein gefunden." })); return; }
        treffer.forEach(function (v) { innen.appendChild(eintrag(v)); });
      }
      suche.addEventListener("input", zeichne);
      zeichne();
    });
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
      var z = { angemeldet: true, gesuche: 0, wartend: 0, info: 0, admin: istAdminAn(), adminRecht: !!(profil && profil.admin) };
      var laeufe = [];
      if (frei() && fn("tausch")) laeufe.push(sb.from("gesuche").select("id,user_id").eq("status", "offen").gte("beginn", new Date(Date.now() - 6 * 3600000).toISOString())
        .then(function (r) { z.gesuche = (r.data || []).filter(function (g) { return g.user_id !== session.user.id; }).length; }));
      if (frei() && fn("info")) laeufe.push(sb.from("ankuendigungen").select("id").then(function (r) {
        var gelesen = gelesenLesen(); z.info = (r.data || []).filter(function (a) { return !gelesen[a.id]; }).length;
      }).catch(function () {}));
      if (istAdminAn()) laeufe.push(sb.from("profile").select("id,freigeschaltet,admin").eq("freigeschaltet", false)
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

  // Kleiner ZIP-Schreiber (ohne Komprimierung) - reicht fuer den Datenexport
  function crc32(bytes) {
    var c, tabelle = crc32._t;
    if (!tabelle) {
      tabelle = crc32._t = [];
      for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tabelle[n] = c >>> 0; }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ tabelle[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipBauen(dateien) {
    // dateien: [{ name, bytes }]
    var teile = [], zentral = [], versatz = 0;
    function u16(n) { return [n & 255, (n >> 8) & 255]; }
    function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]; }
    dateien.forEach(function (d) {
      var name = new TextEncoder().encode(d.name), crc = crc32(d.bytes), len = d.bytes.length;
      var kopf = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(len), u32(len), u16(name.length), u16(0));
      teile.push(new Uint8Array(kopf), name, d.bytes);
      zentral.push({ name: name, crc: crc, len: len, versatz: versatz });
      versatz += kopf.length + name.length + len;
    });
    var zStart = versatz, zBytes = [];
    zentral.forEach(function (z) {
      var kopf = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(z.crc), u32(z.len), u32(z.len),
                          u16(z.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(z.versatz));
      zBytes.push(new Uint8Array(kopf), z.name);
      versatz += kopf.length + z.name.length;
    });
    var ende = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(zentral.length), u16(zentral.length), u32(versatz - zStart), u32(zStart), u16(0)));
    return new Blob(teile.concat(zBytes, [ende]), { type: "application/zip" });
  }
  function datenExportZip() {
    var uid = session.user.id;
    kurzMeldung("Sammle deine Daten …", "");
    var tabellen = [["einsaetze", "user_id"], ["spielnotizen", "user_id"], ["gesuche", "user_id"], ["angebote", "user_id"],
                    ["sperren", "user_id"], ["hallen_notizen", "user_id"], ["kontakte", "user_id"], ["mitfahrten", "user_id"], ["push_abos", "user_id"], ["spielkommentare", "user_id"]];
    var aus = { exportiert: new Date().toISOString(), email: session.user.email, profil: profil };
    var dateien = [];
    function text(name, inhalt) { dateien.push({ name: name, bytes: new TextEncoder().encode(inhalt) }); }
    return Promise.all(tabellen.map(function (t) {
      return sb.from(t[0]).select("*").eq(t[1], uid).then(function (r) { aus[t[0]] = r.error ? { fehler: r.error.message } : r.data; }).catch(function () {});
    })).then(function () {
      text("daten.json", JSON.stringify(aus, null, 2));
      // Abrechnung als CSV (alle Saisons)
      var alle = alleSpiele();
      var zeilen = [["Datum", "Uhrzeit", "Saison", "Liga", "Begegnung", "Halle", "Rolle", "km", "Fahrtkosten", "Verpflegung", "Auslagen", "Vergütung", "Notiz"]];
      alle.slice().reverse().forEach(function (sp) {
        var e = einsaetze[sp.kennung]; if (!e) return;
        var d = new Date(sp.beginn), b = betragFuer(sp, e);
        var dez = function (n) { return n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","); };
        zeilen.push([d.toLocaleDateString("de-DE"), uhr(d), sp.saison || "", sp.liga || "", sp.paarung || "", sp.halle || "", sp.rolle || "",
                     dez(e.km), dez(fahrtkosten(e)), dez(e.verpflegung), dez(e.auslagen), dez(b.betrag), e.notiz || ""]);
      });
      text("abrechnung.csv", "\ufeff" + zeilen.map(function (z) { return z.map(function (f) { return '"' + String(f).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n"));
      // Notizen als lesbare Textdatei
      var notizen = (aus.spielnotizen || []).map(function (n) { return (n.kennung || "").split("|")[0].slice(0, 16).replace("T", " ") + " – " + (n.kennung || "").split("|")[1] + "\n" + (n.text || "") + "\n"; }).join("\n");
      if (notizen) text("notizen.txt", notizen);
      // Belege herunterladen (signierte Links, nacheinander)
      var belege = [];
      (aus.einsaetze || []).forEach(function (e) { (e.belege || []).forEach(function (pfad) { belege.push(pfad); }); });
      if (!belege.length) return;
      kurzMeldung("Lade " + belege.length + (belege.length === 1 ? " Beleg" : " Belege") + " …", "");
      return belege.reduce(function (p, pfad) {
        return p.then(function () {
          return sb.storage.from("belege").createSignedUrl(pfad, 300).then(function (r) {
            if (!r.data || !r.data.signedUrl) return;
            return fetch(r.data.signedUrl).then(function (a) { return a.arrayBuffer(); }).then(function (buf) {
              // Ordner mit in den Namen, sonst ueberschreiben sich gleichnamige Belege
              dateien.push({ name: "belege/" + pfad.split("/").slice(-2).join("_"), bytes: new Uint8Array(buf) });
            });
          }).catch(function () {});
        });
      }, Promise.resolve());
    }).then(function () {
      var blob = zipBauen(dateien);
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "einteilungen_" + (profil.slug || "konto") + "_" + new Date().toISOString().slice(0, 10) + ".zip";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      kurzMeldung("Export fertig ✓ (" + dateien.length + " Dateien)", "gut");
    }).catch(function (e) { meldung("Export fehlgeschlagen: " + fehlerText(e), "warn"); });
  }

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
      if (istAdminAn()) inhalt.appendChild(ankuendigungFormular());
      if (!alle.length) inhalt.appendChild(h("p", { class: "leer", text: "Keine Ankündigungen." }));
      var terminIds = alle.filter(function (a) { return a.termin && a.termin >= heute; }).map(function (a) { return a.id; });
      var antwortenVersprechen = terminIds.length && frei() ? sb.from("termin_antworten").select("ankuendigung_id,user_id,name,antwort").in("ankuendigung_id", terminIds).then(function (r2) { return r2.data || []; }).catch(function () { return []; }) : Promise.resolve([]);
      function antwortZeile(a, antworten) {
        var meine = antworten.filter(function (x) { return x.ankuendigung_id === a.id && x.user_id === session.user.id; })[0];
        var ja = antworten.filter(function (x) { return x.ankuendigung_id === a.id && x.antwort === "ja"; }), nein = antworten.filter(function (x) { return x.ankuendigung_id === a.id && x.antwort === "nein"; });
        var zeile = h("div", { class: "termin-antwort" });
        function setze(antwort) {
          sb.from("termin_antworten").upsert({ ankuendigung_id: a.id, user_id: session.user.id, slug: profil.slug, name: profil.name || profil.slug, antwort: antwort, geaendert: new Date().toISOString() }, { onConflict: "ankuendigung_id,user_id" })
            .then(function (r3) { if (r3.error) { meldung(fehlerText(r3.error) + (/termin_antworten/.test(r3.error.message || "") ? " – schema.sql (v13) ausführen." : ""), "warn"); return; } kurzMeldung(antwort === "ja" ? "Zugesagt ✓" : "Abgesagt.", "gut"); zeigeInfo(); });
        }
        zeile.appendChild(h("button", { type: "button", class: "anfrage" + (meine && meine.antwort === "ja" ? " aktiv" : ""), text: "Ich komme", onclick: function () { setze("ja"); } }));
        zeile.appendChild(h("button", { type: "button", class: "anfrage" + (meine && meine.antwort === "nein" ? " aktiv" : ""), text: "Komme nicht", onclick: function () { setze("nein"); } }));
        zeile.appendChild(h("span", { class: "meta", text: ja.length + (ja.length === 1 ? " kommt" : " kommen") + (nein.length ? " · " + nein.length + " nicht" : "") }));
        if (istAdminAn() && (ja.length || nein.length)) {
          var det = h("details", { class: "tausch", style: "width:100%;margin-top:4px" }, [h("summary", { text: "Wer hat geantwortet?" })]);
          if (ja.length) det.appendChild(h("div", { class: "meta", text: "Kommen: " + ja.map(function (x) { return x.name; }).sort().join(", ") }));
          if (nein.length) det.appendChild(h("div", { class: "meta", text: "Kommen nicht: " + nein.map(function (x) { return x.name; }).sort().join(", ") }));
          zeile.appendChild(det);
        }
        return zeile;
      }
      antwortenVersprechen.then(function (antworten) {
      alle.forEach(function (a) {
        var d = new Date(a.angelegt);
        var karte = h("div", { class: "spiel karte" + (a.wichtig ? " neu" : "") }, [
          h("div", { class: "kopfzeile" }, [
            h("span", { class: "datum" }, [datum(d) + " · " + a.name, gelesen[a.id] ? null : h("span", { class: "status aus", style: "margin-left:6px", text: "neu" })]),
            a.wichtig ? h("span", { class: "rolle HSR", text: "wichtig" }) : null
          ]),
          h("div", { class: "paarung", text: (a.termin ? a.termin.split("-").reverse().join(".") + " · " : "") + a.titel }),
          a.an_slugs && a.an_slugs.length ? h("div", { class: "meta", text: "Nur an: " + (a.an_slugs.length > 3 ? a.an_slugs.length + " Kollegen" : a.an_slugs.map(function (sl) { var p = ctx.personMit(sl); return p ? p.name : sl; }).join(", ")) }) : null,
          h("div", { style: "white-space:pre-wrap; margin-top:4px", text: a.text }),
          a.bis ? h("div", { class: "meta", text: "gilt bis " + a.bis.split("-").reverse().join(".") }) : null,
          a.termin && a.termin >= heute && frei() ? antwortZeile(a, antworten) : null,
          istAdminAn() ? h("div", { class: "zweit" }, [
            h("button", { type: "button", text: "Löschen", onclick: function () {
              if (!confirm("Ankündigung löschen?")) return;
              sb.from("ankuendigungen").delete().eq("id", a.id).then(function () { zeigeInfo(); });
            } }),
            a.push && !a.push_gesendet ? h("span", { class: "meta", style: "align-self:center", text: "Push geht beim nächsten Lauf raus (bis 30 Min.)" }) : null
          ]) : null
        ]);
        inhalt.appendChild(karte);
      });
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
    // Empfaenger: alle, ein Kollege oder eine Liga-Gruppe (alle, die dort eingeteilt sind)
    var gruppen = {}; (ctx.daten.spiele || []).forEach(function (s) { var g = (s.liga || "").toUpperCase().match(/^U\s?(\d+)/) ? "U" + (s.liga || "").toUpperCase().match(/^U\s?(\d+)/)[1] : (s.liga || "").split(/[\s:]+/)[0]; if (!g) return; (s.besetzung || []).forEach(function (b) { if (b.slug) (gruppen[g] = gruppen[g] || {})[b.slug] = 1; }); });
    var anWahl = h("select", { class: "mg-select" }, [h("option", { value: "", text: "An: alle Mitglieder" })]
      .concat(Object.keys(gruppen).sort().map(function (g) { return h("option", { value: "liga:" + g, text: "Liga-Gruppe " + g + " (" + Object.keys(gruppen[g]).length + ")" }); }))
      .concat(ctx.daten.personen.map(function (p) { return h("option", { value: "slug:" + p.slug, text: p.name }); })));
    function empfaenger() {
      var v = anWahl.value; if (!v) return null;
      if (v.indexOf("liga:") === 0) return Object.keys(gruppen[v.slice(5)] || {});
      return [v.slice(5)];
    }
    var knopf = h("button", { type: "button", class: "mg-haupt", text: "Veröffentlichen", onclick: function () {
      if (!titel.value.trim() || !text.value.trim()) { meldung("Überschrift und Text bitte ausfüllen.", "warn"); return; }
      knopf.disabled = true;
      var an = empfaenger();
      sb.from("ankuendigungen").insert(Object.assign({ user_id: session.user.id, name: profil.name || profil.slug, titel: titel.value.trim(), text: text.value.trim(),
                                          wichtig: wichtig.checked, push: push.checked, bis: bis.value || null, termin: termin.value || null }, an ? { an_slugs: an } : {}))
        .then(function (r) {
          knopf.disabled = false;
          if (r.error) { meldung(fehlerText(r.error) + (/an_slugs/.test(r.error.message || "") ? " – schema.sql (v17) ausführen." : ""), "warn"); return; }
          kurzMeldung("Veröffentlicht ✓" + (push.checked ? " – Push folgt beim nächsten Lauf." : ""), "gut"); zeigeInfo();
        });
    } });
    return h("details", { class: "karte", style: "padding:0 14px; margin-bottom:12px" }, [
      h("summary", { style: "padding:12px 0; font-weight:800; cursor:pointer", text: "Neue Ankündigung" }),
      h("div", { class: "mg-form", style: "padding-bottom:12px" }, [
        anWahl, titel, text,
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
        (e.km != null ? " · " + e.km + " km " + ((profil.km_modell || "einfach") === "einfach" ? "einfach" : "einfach (hin und zurück gerechnet)") + ", Fahrt " + euro(fahrtkosten(e)) : "") + (e.auslagen ? " · Auslagen " + euro(e.auslagen) : "") + (e.verpflegung ? " · Verpflegung " + euro(e.verpflegung) : ""));
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
  function istAdmin() { return ladeProfil().then(function () { return istAdminAn(); }).catch(function () { return false; }); }
  // Hat das Konto ueberhaupt Adminrechte (unabhaengig vom Modus)? Fuer den Schalter oben.
  function adminRecht() { return ladeProfil().then(function () { return !!(profil && profil.admin); }).catch(function () { return false; }); }
  function korrekturSpeichern(kennung, obj) {
    if (!session || !profil || !profil.admin) return Promise.resolve(false);
    var lauf = obj ? sb.from("spiel_korrekturen").upsert(Object.assign({ kennung: kennung, von: profil.name || profil.slug, geaendert: new Date().toISOString() }, obj), { onConflict: "kennung" })
                   : sb.from("spiel_korrekturen").delete().eq("kennung", kennung);
    return lauf.then(function (r) { if (r.error) { meldung(fehlerText(r.error) + (/spiel_korrekturen/.test(r.error.message || "") ? " – schema.sql (v12) ausführen." : ""), "warn"); return false; } return true; })
      .catch(function (e) { meldung(fehlerText(e), "warn"); return false; });
  }
  function kontaktVon(slug) {
    if (!session || !frei() || !slug) return Promise.resolve(null);
    return sb.from("kontakte").select("slug,telefon,hinweis").eq("slug", slug).maybeSingle().then(function (r) {
      if (r.data && r.data.telefon) return r.data;
      return sb.from("telefonliste").select("slug,telefon").eq("slug", slug).maybeSingle().then(function (r2) { return r2.data && r2.data.telefon ? { telefon: r2.data.telefon, hinweis: "aus der Telefonliste" } : null; }).catch(function () { return null; });
    }).then(function (k) {
      if (!k) return null;
      var l = telefonLink(k.telefon);
      return { telefon: k.telefon, hinweis: k.hinweis || "", tel: l.tel, wa: l.wa };
    }).catch(function () { return null; });
  }
  // Fuer die Seite "Zusammen fahren": Nummern und Mitfahrten mehrerer Spiele
  function mitfahrtenFuer(spiele) {
    return extrasLaden(spiele).then(function (ok) {
      if (!ok) return null;
      var aus = {};
      spiele.forEach(function (s) { aus[kennungVon(s)] = (cache.mitfahrten[kennungVon(s)] || []).slice(); });
      return aus;
    });
  }
  function wohnortVon(slug) { return cache.wohnorte[slug] || null; }
  function vorschlaegeFuer(spiel, slugs) { return wegVorschlaege(spiel, slugs); }
  // Archiv aus der Datenbank: eigene Spiele oder (Admin) alle
  function archivAusDb(alle) {
    if (!session) return Promise.resolve(null);
    return ladeProfil().then(function () {
      var q = sb.from("spiele_archiv").select("kennung,beginn,liga,paarung,halle,system,besetzung,saison,manuell");
      if (!(alle && istAdminAn())) q = q.contains("slugs", [profil.slug]);
      return q.then(function (r) { return r.data || []; });
    }).catch(function () { return null; });
  }
  function wohnortEigen() {
    return bereit().then(function (st) { if (!st.eingerichtet || !session) return null; return sb.from("wohnorte").select("user_id").eq("user_id", session.user.id).maybeSingle().then(function (r) { return !!r.data; }); }).catch(function () { return null; });
  }
  function telefonVon(slug) { var k = nummerVon(slug); if (!k) return null; var l = telefonLink(k.telefon); return { telefon: k.telefon, tel: l.tel, wa: l.wa }; }
  function mitfahrtSetzen(spiel, art, text) {
    if (!session || !profil) return Promise.resolve(false);
    var kennung = kennungVon(spiel);
    var lauf = art ? sb.from("mitfahrten").upsert({ user_id: session.user.id, slug: profil.slug, name: profil.name || profil.slug, kennung: kennung, beginn: spiel.beginn, text: text || (art === "suche" ? "Suche Mitfahrt" : "Biete Mitfahrt"), art: art }, { onConflict: "user_id,kennung" })
                   : sb.from("mitfahrten").delete().eq("user_id", session.user.id).eq("kennung", kennung);
    return lauf.then(function (r) { if (r.error) { meldung(fehlerText(r.error) + (/art/.test(r.error.message || "") ? " – schema.sql (v14) ausführen." : ""), "warn"); return false; } delete cache.geladen["k|" + kennung]; return true; });
  }
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
           kontakteFuer: kontakteFuer, hinweisAnzahl: hinweisAnzahl, kontoRendern: kontoRendern, kontaktVon: kontaktVon, istAdmin: istAdmin, adminRecht: adminRecht, tresorSchluessel: tresorSchluessel, rechnungSprung: rechnungSprung, korrekturSpeichern: korrekturSpeichern, spielManuellLoeschen: spielManuellLoeschen,
           mitfahrtenFuer: mitfahrtenFuer, mitfahrtSetzen: mitfahrtSetzen, telefonVon: telefonVon, wohnortVon: wohnortVon, vorschlaegeFuer: vorschlaegeFuer, abrechnungSprung: abrechnungSprung, archivAusDb: archivAusDb, wohnortEigen: wohnortEigen };
})();
