// Webhook des Zahlungsanbieters - noch nicht im Einsatz.
//
// WAS EINE EDGE FUNCTION IST
//
// Die App ist eine statische Seite auf GitHub Pages: nur Dateien, kein
// Server. Sie kann niemandem zuhoeren. Ein Zahlungsanbieter muss aber
// irgendwo anrufen koennen, wenn jemand bezahlt hat ("Webhook") - und
// dieser Anruf darf nicht vom Browser kommen, sonst koennte sich jeder
// selbst freischalten.
//
// Eine Edge Function ist genau dieser kleine Zuhoerer: ein Stueck
// TypeScript, das bei Supabase liegt und unter einer eigenen Adresse
// erreichbar ist (https://<projekt>.supabase.co/functions/v1/abo-webhook).
// Sie laeuft nur, wenn jemand sie aufruft, und sie hat Zugriff auf den
// service_role-Schluessel - den Schluessel, der die Zugriffsregeln
// umgeht. Deshalb darf sie nie etwas tun, was der Anrufer bestimmt,
// ohne vorher zu pruefen, dass der Anruf wirklich vom Anbieter kommt.
//
// So laeuft es spaeter ab:
//
//   1. Der Kollege tippt in der App auf "Beitrag bezahlen".
//   2. Die App schickt ihn zur Bezahlseite des Anbieters (Stripe oder
//      Paddle). Dort gibt er seine Daten ein - nicht bei uns.
//   3. Nach der Zahlung ruft der Anbieter DIESE Funktion auf.
//   4. Sie prueft die Unterschrift des Anrufs, sucht das Konto und
//      traegt in der Tabelle "abo" ein, bis wann bezahlt ist.
//   5. Beim naechsten Laden sieht die App den neuen Stand.
//
// EINRICHTEN (wenn es so weit ist)
//
//   npm install -g supabase
//   supabase login
//   supabase link --project-ref <deine-projekt-id>
//   supabase secrets set ZAHLUNG_SIGNATUR=<Webhook-Secret des Anbieters>
//   supabase functions deploy abo-webhook --no-verify-jwt
//
// "--no-verify-jwt" muss sein: der Anbieter hat kein Supabase-Konto. Die
// Pruefung uebernimmt stattdessen die Unterschrift unten.
//
// Danach im Dashboard des Anbieters die Adresse eintragen und das
// Webhook-Secret kopieren. SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY
// stellt Supabase von selbst bereit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Wie lange ein Beitrag gilt. Eine Saison laeuft von Juli bis Juni.
function saisonEnde(heute: Date): string {
  const jahr = heute.getMonth() >= 6 ? heute.getFullYear() + 1 : heute.getFullYear();
  return `${jahr}-06-30`;
}
function saisonName(heute: Date): string {
  const start = heute.getMonth() >= 6 ? heute.getFullYear() : heute.getFullYear() - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

// Die Unterschrift des Anbieters pruefen. OHNE DIESE PRUEFUNG DARF DIE
// FUNKTION NICHTS SCHREIBEN - sonst schaltet sich jeder selbst frei, der
// die Adresse kennt. Wie sie aussieht, steht in der Doku des Anbieters;
// hier als Platzhalter ein einfacher Vergleich.
async function unterschriftStimmt(roh: string, kopf: string | null): Promise<boolean> {
  const geheim = Deno.env.get("ZAHLUNG_SIGNATUR") ?? "";
  if (!geheim || !kopf) return false;
  const schluessel = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(geheim),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", schluessel, new TextEncoder().encode(roh));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Zeitkonstanter Vergleich - sonst laesst sich die Unterschrift raten
  if (hex.length !== kopf.length) return false;
  let gleich = 0;
  for (let i = 0; i < hex.length; i++) gleich |= hex.charCodeAt(i) ^ kopf.charCodeAt(i);
  return gleich === 0;
}

Deno.serve(async (anfrage: Request) => {
  if (anfrage.method !== "POST") return new Response("nur POST", { status: 405 });

  const roh = await anfrage.text();
  const kopf = anfrage.headers.get("x-signature");
  if (!(await unterschriftStimmt(roh, kopf))) {
    // Nichts verraten, was die Suche erleichtert
    return new Response("nein", { status: 401 });
  }

  let ereignis: Record<string, unknown>;
  try { ereignis = JSON.parse(roh); } catch { return new Response("kaputt", { status: 400 }); }

  // Welches Konto? Der Anbieter bekommt beim Start der Zahlung die
  // Konto-ID mitgegeben und reicht sie hier zurueck. Niemals die
  // E-Mail-Adresse als Schluessel nehmen - die kann sich aendern.
  const nutzer = (ereignis as any)?.data?.metadata?.user_id;
  if (!nutzer) return new Response("ohne Konto", { status: 400 });

  const betrag = Number((ereignis as any)?.data?.amount ?? 0) / 100;
  const referenz = String((ereignis as any)?.data?.id ?? "");
  const heute = new Date();

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });

  const { error } = await db.from("abo").upsert({
    user_id: nutzer,
    saison: saisonName(heute),
    bezahlt_bis: saisonEnde(heute),
    betrag,
    quelle: "webhook",
    referenz,
    geaendert: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) {
    console.error("Abo nicht eingetragen:", error.message);
    // 500 heisst fuer den Anbieter: noch einmal versuchen
    return new Response("Fehler", { status: 500 });
  }
  return new Response("ok");
});
