/* Service Worker: macht die Seite offline benutzbar.
 *
 * Grundregel: Inhalte immer zuerst aus dem Netz holen, damit niemand alte
 * Einteilungen sieht. Nur wenn das Netz nicht antwortet - Hallenkeller,
 * Parkhaus, Zug - kommt die zuletzt gespeicherte Fassung zum Zug.
 */

const VERSION = "v25";
const CACHE = "einteilungen-" + VERSION;

// Wird beim ersten Besuch gespeichert, damit die App auch dann startet,
// wenn sie offline geoeffnet wird.
const GRUNDGERUEST = [
  "./",
  "./index.html",
  "./daten.json",
  "./stand.json",
  "./archiv.json",
  "./app.js",
  "./mitglieder.js",
  "./supabase.json",
  "./gebuehren.json",
  "./push.json",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // Einzeln, damit eine fehlende Datei nicht die ganze Installation kippt
      .then((c) => Promise.all(GRUNDGERUEST.map(
        (p) => c.add(p).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(
        namen.filter((n) => n.startsWith("einteilungen-") && n !== CACHE)
             .map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Echtes Push vom Workflow (push_senden.py): Nutzlast ist JSON mit
// titel, text, url. Ohne Nutzlast (Test aus den Browser-Werkzeugen) kommt
// eine allgemeine Meldung.
self.addEventListener("push", (e) => {
  let daten = { titel: "Einteilungen", text: "Es gibt Neues.", url: "./" };
  try { if (e.data) daten = Object.assign(daten, e.data.json()); } catch (err) {
    try { daten.text = e.data.text(); } catch (err2) {}
  }
  // Mit Adresse gibt es einen Route-Knopf (Android zeigt ihn, iOS nicht)
  const aktionen = daten.ort ? [{ action: "route", title: "Route" }, { action: "oeffnen", title: "Öffnen" }] : [];
  e.waitUntil(self.registration.showNotification(daten.titel, {
    body: daten.text, icon: "icon-192.png", badge: "icon-192.png",
    tag: daten.tag || "einteilung", renotify: true, actions: aktionen,
    data: { url: daten.url, ort: daten.ort || null }
  }));
});

// Tippt jemand auf die Mitteilung, soll die App nach vorn kommen statt
// ein zweites Fenster zu oeffnen.
function kartenLink(ort) {
  const android = /Android/i.test(self.navigator.userAgent || "");
  return android ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(ort)
                 : "https://maps.apple.com/?daddr=" + encodeURIComponent(ort);
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (e.action === "route" && e.notification.data && e.notification.data.ort) {
    e.waitUntil(self.clients.openWindow(kartenLink(e.notification.data.ort)));
    return;
  }
  const zielPfad = (e.notification.data && e.notification.data.url) || "./";
  const ziel = new URL(zielPfad, self.location).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((fenster) => {
        for (const f of fenster) {
          if (f.url.split("#")[0] === ziel.split("#")[0] && "focus" in f) { f.navigate && f.navigate(ziel); return f.focus(); }
        }
        return self.clients.openWindow(ziel);
      })
  );
});

self.addEventListener("fetch", (e) => {
  const anfrage = e.request;
  if (anfrage.method !== "GET") return;

  const url = new URL(anfrage.url);
  if (url.origin !== self.location.origin) return;

  // Kalenderdateien nie aus dem Zwischenspeicher beantworten - die holt sich
  // das Betriebssystem selbst, und veraltete Termine waeren schlimmer als gar
  // keine Antwort.
  if (url.pathname.endsWith(".ics")) return;

  e.respondWith(
    fetch(anfrage)
      .then((antwort) => {
        if (antwort && antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((c) => c.put(anfrage, kopie)).catch(() => {});
        }
        return antwort;
      })
      // ?v=... in der Adresse ignorieren, sonst findet der Cache app.js nicht
      .catch(() => caches.match(anfrage, { ignoreSearch: true }).then(
        (treffer) => treffer || caches.match("./index.html")))
  );
});
