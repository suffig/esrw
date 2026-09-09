/* Service Worker: macht die Seite offline benutzbar.
 *
 * Grundregel: Inhalte immer zuerst aus dem Netz holen, damit niemand alte
 * Einteilungen sieht. Nur wenn das Netz nicht antwortet - Hallenkeller,
 * Parkhaus, Zug - kommt die zuletzt gespeicherte Fassung zum Zug.
 */

const VERSION = "v3";
const CACHE = "einteilungen-" + VERSION;

// Wird beim ersten Besuch gespeichert, damit die App auch dann startet,
// wenn sie offline geoeffnet wird.
const GRUNDGERUEST = [
  "./",
  "./index.html",
  "./daten.json",
  "./stand.json",
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
      .catch(() => caches.match(anfrage).then(
        (treffer) => treffer || caches.match("./index.html")))
  );
});
