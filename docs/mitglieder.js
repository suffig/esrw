/* Mitgliederbereich: Konto, Profil, Abrechnung.
 *
 * Spricht direkt aus dem Browser mit Supabase (Datenbank + Login). Was ein
 * Nutzer sehen und aendern darf, erzwingt die Datenbank ueber Row Level
 * Security - siehe supabase/schema.sql. Der "anon"-Schluessel im Quelltext
 * ist dafuer vorgesehen und oeffnet nichts, was die Regeln nicht erlauben.
 *
 * Wird von index.html erst geladen, wenn der Reiter "Mitglieder" geoeffnet
 * wird. Zugriff auf die Spieldaten bekommt es ueber den uebergebenen Kontext.
 *
 * Mit "mock": true in supabase.json laeuft eine Attrappe im Browser, um die
 * Oberflaeche ohne Supabase auszuprobieren. Sie speichert in localStorage.
 */

window.Mitglieder = (function () {
  "use strict";

  var wurzel = null, ctx = null, cfg = null, sb = null;
  var session = null, profil = null, einsaetze = {}, archivDaten = null;
  var speicherTimer = {};
  var STRASSENFAKTOR = 1.3;   // Luftlinie -> Strasse, grobe Naeherung

  var SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

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

  function kmZwischen(a, b) {
    var r = 6371, p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180;
    var dp = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180;
    var x = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * r * Math.asin(Math.sqrt(x));
  }

  function meldung(text, art) {
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

  // --------------------------------------------------------- Attrappe
  //
  // Bildet genau die Handvoll Aufrufe nach, die dieses Modul benutzt.
  // Passwoerter liegen im Klartext im localStorage - das ist eine Attrappe
  // zum Ausprobieren der Oberflaeche, kein Login.

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
        maybeSingle: function () {
          return Promise.resolve({ data: api._treffer()[0] || null, error: null });
        },
        then: function (ok) { return Promise.resolve({ data: api._treffer(), error: null }).then(ok); },
        _treffer: function () {
          return zeilen.filter(function (z) { return filter.every(function (f) { return z[f[0]] === f[1]; }); });
        },
        upsert: function (obj, opt) {
          var s = sitzung();
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

  function oeffnen(container, kontext) {
    wurzel = container; ctx = kontext;
    leeren(wurzel);
    wurzel.appendChild(h("p", { class: "meta", text: "Mitgliederbereich wird geladen …" }));

    fetch("supabase.json?" + Date.now())
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (c) {
        cfg = c || {};
        if (cfg.mock) { sb = attrappe(); return; }
        if (!cfg.url || !cfg.anon_key) { sb = null; return; }
        return skriptLaden(SUPABASE_CDN).then(function () {
          sb = window.supabase.createClient(cfg.url, cfg.anon_key);
        });
      })
      .then(function () {
        if (!sb) { zeigeKeinBackend(); return; }
        sb.auth.onAuthStateChange(function (ereignis, s) {
          session = s;
          if (!s) { profil = null; einsaetze = {}; zeigeAnmeldung(); }
        });
        return sb.auth.getSession().then(function (r) {
          session = r.data.session;
          return session ? nachLogin() : zeigeAnmeldung();
        });
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
      h("p", { text: "Hier kommen Konto, Abrechnung und Fahrtenbuch hin. Dafür muss der " +
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
    var auswahl = h("select", { class: "mg-select" },
      [h("option", { value: "", text: "– bitte wählen –" })].concat(
        ctx.daten.personen.map(function (x) {
          var o = h("option", { value: x.slug, text: x.name });
          if ((p.slug || ctx.slug) === x.slug) o.selected = true;
          return o;
        })));
    var heimat = h("input", { type: "text", placeholder: "Straße, PLZ Ort", value: p.heimat || "", autocomplete: "street-address" });
    var koord = h("span", { class: "meta", text: p.heimat_lat ? "gefunden: " + p.heimat_lat.toFixed(4) + ", " + p.heimat_lon.toFixed(4) : "" });
    var lat = p.heimat_lat || null, lon = p.heimat_lon || null;
    var satz = h("input", { type: "number", step: "0.01", min: "0", value: (p.km_satz != null ? p.km_satz : 0.30) });

    var suchen = h("button", { type: "button", class: "mg-neben", text: "Adresse suchen", onclick: function () {
      var q = heimat.value.trim();
      if (!q) return;
      koord.textContent = "suche …";
      fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (t) {
          if (!t.length) { koord.textContent = "nicht gefunden – genauer eingeben"; lat = lon = null; return; }
          lat = parseFloat(t[0].lat); lon = parseFloat(t[0].lon);
          koord.textContent = "gefunden: " + t[0].display_name.split(",").slice(0, 3).join(",");
        })
        .catch(function () { koord.textContent = "Suche nicht erreichbar"; });
    } });

    var speichern = h("button", { type: "submit", class: "mg-haupt", text: "Speichern" });
    var form = h("form", { class: "mg-form", onsubmit: function (e) {
      e.preventDefault();
      if (!auswahl.value) { meldung("Bitte deinen Namen wählen.", "warn"); return; }
      speichern.disabled = true;
      var person = ctx.personMit(auswahl.value);
      var zeile = { id: session.user.id, slug: auswahl.value, name: person ? person.name : auswahl.value,
                    heimat: heimat.value.trim() || null, heimat_lat: lat, heimat_lon: lon,
                    km_satz: zahl(satz.value) != null ? zahl(satz.value) : 0.30 };
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
      h("label", { text: "Heimatadresse (für die km-Schätzung, freiwillig)" }),
      h("div", { class: "mg-zeile" }, [heimat, suchen]), koord,
      h("label", { text: "Kilometersatz in €" }), satz,
      h("p", { class: "meta", text: "Die Adresse wird nur gebraucht, um die Entfernung zu den Hallen zu schätzen. " +
        "Sie liegt in deinem Profil bei Supabase und ist für niemanden sonst lesbar." }),
      speichern,
      zurueck ? h("button", { type: "button", class: "mg-neben", text: "Zurück", onclick: function () { zeigeAbrechnung(); } }) : null
    ]);
    wurzel.appendChild(h("div", { class: "melde" }, [form]));
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
    // Spiele der Saison fuer meinen Slug: Archiv (ganze Saison) plus daten.json
    // (kommende), zusammengefuehrt ueber die Kennung
    var person = ctx.personMit(profil.slug);
    var karte = {};
    var archiv = (archivDaten && archivDaten.personen && archivDaten.personen[profil.slug]) || [];
    archiv.forEach(function (s) {
      karte[s.beginn + "|" + s.paarung] = { beginn: s.beginn, liga: s.liga, paarung: s.paarung, halle: s.halle, rolle: s.rolle };
    });
    if (person) person.spiele.forEach(function (s) {
      karte[s.beginn + "|" + s.paarung] = { beginn: s.beginn, liga: s.liga, paarung: s.paarung, halle: s.halle, rolle: s.rolle };
    });
    return Object.keys(karte).map(function (k) { var s = karte[k]; s.kennung = k; return s; })
      .sort(function (a, b) { return a.beginn < b.beginn ? 1 : -1; });
  }

  function kmVorschlag(spiel) {
    if (!profil || profil.heimat_lat == null || !spiel.halle) return null;
    var ziel = ctx.daten.hallen && ctx.daten.hallen[spiel.halle];
    if (!ziel) return null;
    return Math.round(kmZwischen([profil.heimat_lat, profil.heimat_lon], ziel) * STRASSENFAKTOR * 2);
  }

  function speichereEinsatz(spiel, aenderung) {
    var alt = einsaetze[spiel.kennung] || {};
    var zeile = Object.assign({
      user_id: session.user.id, kennung: spiel.kennung, beginn: spiel.beginn,
      liga: spiel.liga, paarung: spiel.paarung, halle: spiel.halle, rolle: spiel.rolle,
      km: alt.km != null ? alt.km : null, km_satz: alt.km_satz != null ? alt.km_satz : profil.km_satz,
      verguetung: alt.verguetung != null ? alt.verguetung : null,
      auslagen: alt.auslagen != null ? alt.auslagen : null,
      bezahlt: !!alt.bezahlt, notiz: alt.notiz || null
    }, alt.id ? { id: alt.id } : {}, aenderung);
    einsaetze[spiel.kennung] = zeile;
    aktualisiereSummen();
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

  function summen(spiele) {
    var s = { spiele: 0, km: 0, fahrt: 0, verg: 0, ausl: 0, offen: 0 };
    spiele.forEach(function (sp) {
      var e = einsaetze[sp.kennung];
      if (!e) return;
      s.spiele++;
      var km = e.km || 0, satz = e.km_satz != null ? e.km_satz : profil.km_satz;
      s.km += km; s.fahrt += km * satz; s.verg += e.verguetung || 0; s.ausl += e.auslagen || 0;
      if (!e.bezahlt && (e.verguetung || 0) > 0) s.offen++;
    });
    return s;
  }

  function aktualisiereSummen() {
    var box = wurzel.querySelector(".mg-summen");
    if (!box) return;
    var s = summen(saisonSpiele());
    leeren(box);
    [["Spiele erfasst", s.spiele], ["Kilometer", Math.round(s.km) + " km"],
     ["Fahrtkosten", euro(s.fahrt)], ["Vergütung", euro(s.verg)],
     ["Auslagen", euro(s.ausl)], ["noch unbezahlt", s.offen]
    ].forEach(function (p) {
      box.appendChild(h("div", { class: "zahl" }, [h("b", { text: String(p[1]) }), h("span", { text: p[0] })]));
    });
  }

  function csvExport(spiele) {
    var zeilen = [["Datum", "Uhrzeit", "Liga", "Begegnung", "Halle", "Rolle", "km", "km-Satz", "Fahrtkosten", "Vergütung", "Auslagen", "bezahlt", "Notiz"]];
    var dez = function (n) { return n == null ? "" : String(n).replace(".", ","); };
    spiele.forEach(function (sp) {
      var e = einsaetze[sp.kennung] || {};
      var d = new Date(sp.beginn);
      var satz = e.km_satz != null ? e.km_satz : profil.km_satz;
      zeilen.push([
        d.toLocaleDateString("de-DE"), d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        sp.liga || "", sp.paarung || "", sp.halle || "", sp.rolle || "",
        dez(e.km), dez(satz), dez(e.km != null ? Math.round(e.km * satz * 100) / 100 : null),
        dez(e.verguetung), dez(e.auslagen), e.bezahlt ? "ja" : "nein", e.notiz || ""
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
    var kopf = h("div", { class: "profilzeile" }, [
      h("span", {}, [h("b", { text: profil.name || profil.slug }), h("small", { text: session.user.email })]),
      h("span", {}, [
        h("button", { type: "button", class: "textknopf", text: "Einstellungen", onclick: function () { zeigeEinrichtung(true); } }),
        " · ",
        h("button", { type: "button", class: "textknopf", text: "Abmelden", onclick: abmelden })
      ])
    ]);
    wurzel.appendChild(kopf);

    wurzel.appendChild(h("h3", { text: "Abrechnung Saison " + (ctx.daten.saison || "") }));
    var summenBox = h("div", { class: "zahlen mg-summen" });
    wurzel.appendChild(summenBox);

    var werkzeuge = h("div", { class: "zweit" }, [
      h("button", { type: "button", text: "km-Vorschläge übernehmen", onclick: function () {
        var n = 0;
        spiele.forEach(function (sp) {
          var e = einsaetze[sp.kennung];
          if (e && e.km != null) return;
          var v = kmVorschlag(sp);
          if (v == null) return;
          speichereEinsatz(sp, { km: v }); n++;
        });
        meldung(n ? n + " Vorschläge übernommen." : "Nichts zu ergänzen – Heimatadresse gesetzt?", n ? "gut" : "warn");
        rendereAbrechnung();
      } }),
      h("button", { type: "button", text: "CSV exportieren", onclick: function () { csvExport(spiele); } })
    ]);
    wurzel.appendChild(werkzeuge);

    if (!spiele.length) {
      wurzel.appendChild(h("p", { class: "leer", text: "Noch keine Spiele in dieser Saison." }));
    }

    spiele.forEach(function (sp) {
      var e = einsaetze[sp.kennung] || {};
      var d = new Date(sp.beginn);
      var vorschlag = kmVorschlag(sp);
      var vergangen = d < new Date();

      var km = h("input", { type: "number", step: "1", min: "0", inputmode: "numeric",
        value: e.km != null ? e.km : "", placeholder: vorschlag != null ? "~" + vorschlag : "km",
        onchange: function (ev) { speichereEinsatz(sp, { km: zahl(ev.target.value) }); } });
      var verg = h("input", { type: "number", step: "0.5", min: "0", inputmode: "decimal",
        value: e.verguetung != null ? e.verguetung : "", placeholder: "Vergütung €",
        onchange: function (ev) { speichereEinsatz(sp, { verguetung: zahl(ev.target.value) }); } });
      var ausl = h("input", { type: "number", step: "0.5", min: "0", inputmode: "decimal",
        value: e.auslagen != null ? e.auslagen : "", placeholder: "Auslagen €",
        onchange: function (ev) { speichereEinsatz(sp, { auslagen: zahl(ev.target.value) }); } });
      var bez = h("input", { type: "checkbox", onchange: function (ev) { speichereEinsatz(sp, { bezahlt: ev.target.checked }); } });
      bez.checked = !!e.bezahlt;
      var notiz = h("input", { type: "text", value: e.notiz || "", placeholder: "Notiz",
        onchange: function (ev) { speichereEinsatz(sp, { notiz: ev.target.value.trim() || null }); } });

      wurzel.appendChild(h("div", { class: "spiel mg-eintrag" + (vergangen ? "" : " war") }, [
        h("div", { class: "kopf" }, [
          h("span", { class: "datum", text: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getDay()] + ". " +
            d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " · " +
            d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr" }),
          h("span", { class: "rolle", text: sp.rolle || "" })
        ]),
        h("div", { class: "paarung", text: (sp.liga ? sp.liga + ": " : "") + sp.paarung }),
        h("div", { class: "meta", text: sp.halle || "Halle unbekannt" }),
        h("div", { class: "mg-felder" }, [
          h("label", {}, ["km", km]), h("label", {}, ["Vergütung", verg]), h("label", {}, ["Auslagen", ausl])
        ]),
        h("div", { class: "mg-felder" }, [
          h("label", { class: "mg-check" }, [bez, " bezahlt"]), h("label", { class: "mg-notiz" }, ["Notiz", notiz])
        ])
      ]));
    });

    wurzel.appendChild(h("p", { class: "meta mg-fuss", text:
      "Fahrtkosten = km × Kilometersatz. Der km-Vorschlag ist Luftlinie mal " + STRASSENFAKTOR +
      ", hin und zurück – bitte mit der echten Strecke abgleichen. Das hier ist eine Aufstellung " +
      "für dich oder deinen Steuerberater; ob und wie die Beträge steuerlich zählen, sagt sie nicht." }));

    aktualisiereSummen();
  }

  return { oeffnen: oeffnen };
})();
