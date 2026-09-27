// Der erste Bildschirm, noch waehrend die Seite geparst wird.
//
// Beim Start stand einen Wimpernschlag lang die Namensliste aller Kollegen
// da, bis die Einteilungen entschluesselt waren. Wer schon ein Profil hat,
// sieht stattdessen sofort seine eigene Seite - Name und Zeichen kommen aus
// dem Speicher, der Rest ist Platzhalter.
//
// Eigene Datei und kein Skript in der Seite: die Sicherheitsregel in
// index.html (Content-Security-Policy) laesst nur Skripte aus Dateien zu.
// Inline geschrieben wird der Block stillschweigend nicht ausgefuehrt.
(function () {
  var auswahl = document.getElementById("auswahl");
  if (!auswahl) return;
  function zeigeAuswahl() { auswahl.classList.remove("versteckt"); }

  var sitzung = false;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (/^sb-.*-auth-token$/.test(k) || k === "mock_session") { sitzung = true; break; }
    }
  } catch (e) {}
  var p = null;
  try { p = JSON.parse(localStorage.getItem("profil") || "null"); } catch (e) {}

  // Ohne Konto kommt gleich der Anmeldeschirm - dann braucht es die Liste nicht
  if (!sitzung) return;
  if (!p || !p.slug || !p.name) { zeigeAuswahl(); return; }

  // Nur wenn die Adresse auch auf die eigene Seite zeigt - sonst wartet der
  // Bildschirm leer, statt kurz das Falsche zu zeigen.
  var ziel = location.hash.replace(/^#/, "");
  if (ziel && ziel !== "meine" && ziel !== p.slug) return;

  var t = p.name.split(",");
  var kurz = (((t[1] || "").trim()[0] || "") + ((t[0] || "").trim()[0] || "")).toUpperCase() || "?";
  var h = 0;
  for (var j = 0; j < p.slug.length; j++) h = (h * 31 + p.slug.charCodeAt(j)) % 360;
  var farbe = "hsl(" + h + ", 45%, 42%)";

  document.getElementById("person").textContent = p.name;
  var eigenesBild = null;
  try { eigenesBild = localStorage.getItem("mein-bild"); } catch (e) {}
  function zeichen(e) {
    e.textContent = kurz; e.style.background = farbe;
    if (!eigenesBild) return;
    e.style.backgroundImage = "url(" + eigenesBild + ")";
    e.classList.add("mit-bild");
  }
  var av = document.getElementById("person-avatar");
  zeichen(av);
  var kopf = document.getElementById("avatar");
  kopf.classList.remove("leer"); zeichen(kopf);

  var detail = document.getElementById("detail");
  detail.classList.add("start-laedt");
  detail.classList.remove("versteckt");
})();
