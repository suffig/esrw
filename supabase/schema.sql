-- Datenmodell fuer den Mitgliederbereich.
--
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfuegen und ausfuehren
-- (siehe ANLEITUNG.md, Schritt 10). Kann gefahrlos mehrfach laufen.
--
-- Grundsatz: Jeder Nutzer sieht und aendert ausschliesslich seine eigenen
-- Zeilen. Das erzwingt die Datenbank selbst (Row Level Security), nicht
-- die Webseite - auch wer den anonymen Schluessel aus dem Quelltext kopiert,
-- kommt an fremde Daten nicht heran.

-- ------------------------------------------------------------- Profil

create table if not exists public.profile (
  id            uuid primary key references auth.users (id) on delete cascade,
  slug          text,                       -- Person aus daten.json ("garbsch-rene")
  name          text,
  heimat        text,                       -- Adresse, nur fuer die km-Schaetzung
  heimat_lat    double precision,
  heimat_lon    double precision,
  km_satz       numeric(5,2) not null default 0.30,
  angelegt      timestamptz not null default now(),
  geaendert     timestamptz not null default now()
);

alter table public.profile enable row level security;

drop policy if exists "eigenes Profil lesen"     on public.profile;
drop policy if exists "eigenes Profil anlegen"   on public.profile;
drop policy if exists "eigenes Profil aendern"   on public.profile;
drop policy if exists "eigenes Profil loeschen"  on public.profile;

create policy "eigenes Profil lesen"    on public.profile for select using (auth.uid() = id);
create policy "eigenes Profil anlegen"  on public.profile for insert with check (auth.uid() = id);
create policy "eigenes Profil aendern"  on public.profile for update using (auth.uid() = id);
create policy "eigenes Profil loeschen" on public.profile for delete using (auth.uid() = id);

-- ----------------------------------------------------------- Einsaetze
--
-- Eine Zeile je Spiel und Nutzer: was gefahren wurde, was es gab, was es
-- gekostet hat. Die Spieldaten selbst (Paarung, Halle, ...) werden mit
-- gespeichert, damit die Abrechnung auch dann stimmt, wenn das Spiel spaeter
-- aus daten.json verschwindet.

create table if not exists public.einsaetze (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kennung       text not null,              -- beginn|paarung, stabil je Spiel
  beginn        timestamptz not null,
  liga          text,
  paarung       text,
  halle         text,
  rolle         text,
  km            numeric(7,1),               -- gefahrene Kilometer, hin und zurueck
  km_satz       numeric(5,2),               -- Satz zum Zeitpunkt der Erfassung
  verguetung    numeric(8,2),               -- erhaltene Spielleitungsgebuehr
  auslagen      numeric(8,2),               -- Parken, Fahrkarte, Sonstiges
  bezahlt       boolean not null default false,
  notiz         text,
  geaendert     timestamptz not null default now(),
  unique (user_id, kennung)
);

create index if not exists einsaetze_user_beginn on public.einsaetze (user_id, beginn desc);

alter table public.einsaetze enable row level security;

drop policy if exists "eigene Einsaetze lesen"    on public.einsaetze;
drop policy if exists "eigene Einsaetze anlegen"  on public.einsaetze;
drop policy if exists "eigene Einsaetze aendern"  on public.einsaetze;
drop policy if exists "eigene Einsaetze loeschen" on public.einsaetze;

create policy "eigene Einsaetze lesen"    on public.einsaetze for select using (auth.uid() = user_id);
create policy "eigene Einsaetze anlegen"  on public.einsaetze for insert with check (auth.uid() = user_id);
create policy "eigene Einsaetze aendern"  on public.einsaetze for update using (auth.uid() = user_id);
create policy "eigene Einsaetze loeschen" on public.einsaetze for delete using (auth.uid() = user_id);

-- --------------------------------------------- Ergaenzungen (Version 2)
--
-- Gefahrlos mehrfach ausfuehrbar: 'add column if not exists'.

-- Kilometermodell je Nutzer und gespeicherte Strecken zu den Hallen
alter table public.profile add column if not exists km_modell   text not null default 'einfach';
alter table public.profile add column if not exists satz_einfach numeric(5,2) not null default 0.38;
alter table public.profile add column if not exists satz_hinrueck numeric(5,2) not null default 0.30;
alter table public.profile add column if not exists strecken    jsonb not null default '{}'::jsonb;

-- Je Spiel: vor Ort ausgefallen (50 %), landesverbandsuebergreifend (Zuschlag)
alter table public.einsaetze add column if not exists ausgefallen   boolean not null default false;
alter table public.einsaetze add column if not exists uebergreifend boolean not null default false;

comment on column public.einsaetze.km is 'einfache Strecke Wohnung -> Halle in km';
comment on column public.profile.strecken is 'Cache: Hallenname -> {km, art, am}';

-- "geaendert" automatisch mitfuehren
create or replace function public.setze_geaendert()
returns trigger language plpgsql as $$
begin
  new.geaendert := now();
  return new;
end $$;

drop trigger if exists profile_geaendert on public.profile;
create trigger profile_geaendert before update on public.profile
  for each row execute function public.setze_geaendert();

drop trigger if exists einsaetze_geaendert on public.einsaetze;
create trigger einsaetze_geaendert before update on public.einsaetze
  for each row execute function public.setze_geaendert();

-- --------------------------------------------- Ergaenzungen (Version 3)
--
-- Tauschboerse, Verfuegbarkeiten, Push-Abos, Belege. Wieder mehrfach
-- ausfuehrbar. Neu ist eine zweite Art von Regel: Zeilen, die ALLE
-- angemeldeten Mitglieder lesen duerfen (Gesuche, Angebote, Sperren) -
-- schreiben darf weiterhin nur, wem die Zeile gehoert.

-- Belege an Auslagen: Liste von Pfaden im Storage-Bucket 'belege'
alter table public.einsaetze add column if not exists belege jsonb not null default '[]'::jsonb;

-- ---- Tauschboerse: Gesuche ------------------------------------------
create table if not exists public.gesuche (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  slug      text not null,               -- wer sucht (Person aus daten.json)
  name      text not null,               -- Anzeigename, Kopie aus dem Profil
  kennung   text not null,               -- beginn|paarung des Spiels
  beginn    timestamptz not null,
  liga      text, paarung text, halle text, rolle text,
  text      text,                        -- freier Hinweis
  status    text not null default 'offen' check (status in ('offen','erledigt')),
  angelegt  timestamptz not null default now(),
  geaendert timestamptz not null default now(),
  unique (user_id, kennung)
);
create index if not exists gesuche_status_beginn on public.gesuche (status, beginn);
alter table public.gesuche enable row level security;
drop policy if exists "Gesuche lesen (alle Mitglieder)" on public.gesuche;
drop policy if exists "eigene Gesuche anlegen"  on public.gesuche;
drop policy if exists "eigene Gesuche aendern"  on public.gesuche;
drop policy if exists "eigene Gesuche loeschen" on public.gesuche;
create policy "Gesuche lesen (alle Mitglieder)" on public.gesuche for select to authenticated using (true);
create policy "eigene Gesuche anlegen"  on public.gesuche for insert with check (auth.uid() = user_id);
create policy "eigene Gesuche aendern"  on public.gesuche for update using (auth.uid() = user_id);
create policy "eigene Gesuche loeschen" on public.gesuche for delete using (auth.uid() = user_id);
drop trigger if exists gesuche_geaendert on public.gesuche;
create trigger gesuche_geaendert before update on public.gesuche
  for each row execute function public.setze_geaendert();

-- ---- Tauschboerse: Angebote ("ich kann") ------------------------------
create table if not exists public.angebote (
  id        uuid primary key default gen_random_uuid(),
  gesuch_id uuid not null references public.gesuche (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  slug      text not null,
  name      text not null,
  text      text,
  angelegt  timestamptz not null default now(),
  unique (gesuch_id, user_id)
);
alter table public.angebote enable row level security;
drop policy if exists "Angebote lesen (alle Mitglieder)" on public.angebote;
drop policy if exists "eigene Angebote anlegen"  on public.angebote;
drop policy if exists "eigene Angebote loeschen" on public.angebote;
create policy "Angebote lesen (alle Mitglieder)" on public.angebote for select to authenticated using (true);
create policy "eigene Angebote anlegen"  on public.angebote for insert with check (auth.uid() = user_id);
create policy "eigene Angebote loeschen" on public.angebote for delete using (auth.uid() = user_id);

-- ---- Verfuegbarkeiten -------------------------------------------------
-- 'nein' = nicht verfuegbar, 'gern' = haette gern ein Spiel
create table if not exists public.sperren (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  slug      text not null,
  datum     date not null,
  status    text not null default 'nein' check (status in ('nein','gern')),
  grund     text,
  angelegt  timestamptz not null default now(),
  unique (user_id, datum)
);
create index if not exists sperren_datum on public.sperren (datum);
alter table public.sperren enable row level security;
drop policy if exists "Sperren lesen (alle Mitglieder)" on public.sperren;
drop policy if exists "eigene Sperren anlegen"  on public.sperren;
drop policy if exists "eigene Sperren aendern"  on public.sperren;
drop policy if exists "eigene Sperren loeschen" on public.sperren;
create policy "Sperren lesen (alle Mitglieder)" on public.sperren for select to authenticated using (true);
create policy "eigene Sperren anlegen"  on public.sperren for insert with check (auth.uid() = user_id);
create policy "eigene Sperren aendern"  on public.sperren for update using (auth.uid() = user_id);
create policy "eigene Sperren loeschen" on public.sperren for delete using (auth.uid() = user_id);

-- ---- Push-Abos --------------------------------------------------------
-- Nur der Besitzer sieht seine Zeilen. Der Versand laeuft im GitHub-
-- Workflow mit dem service_role-Schluessel, der die Regeln umgeht - deshalb
-- liegt der ausschliesslich als GitHub-Secret, nie im Browser.
create table if not exists public.push_abos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  geraet    text,
  angelegt  timestamptz not null default now()
);
alter table public.push_abos enable row level security;
drop policy if exists "eigene Push-Abos lesen"    on public.push_abos;
drop policy if exists "eigene Push-Abos anlegen"  on public.push_abos;
drop policy if exists "eigene Push-Abos aendern"  on public.push_abos;
drop policy if exists "eigene Push-Abos loeschen" on public.push_abos;
create policy "eigene Push-Abos lesen"    on public.push_abos for select using (auth.uid() = user_id);
create policy "eigene Push-Abos anlegen"  on public.push_abos for insert with check (auth.uid() = user_id);
create policy "eigene Push-Abos aendern"  on public.push_abos for update using (auth.uid() = user_id);
create policy "eigene Push-Abos loeschen" on public.push_abos for delete using (auth.uid() = user_id);

-- ---- Belege (Storage) -------------------------------------------------
-- Privater Bucket; jeder darf nur in seinen eigenen Ordner (<user_id>/...)
insert into storage.buckets (id, name, public) values ('belege', 'belege', false)
  on conflict (id) do nothing;
drop policy if exists "eigene Belege lesen"     on storage.objects;
drop policy if exists "eigene Belege hochladen" on storage.objects;
drop policy if exists "eigene Belege loeschen"  on storage.objects;
create policy "eigene Belege lesen" on storage.objects for select
  using (bucket_id = 'belege' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "eigene Belege hochladen" on storage.objects for insert
  with check (bucket_id = 'belege' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "eigene Belege loeschen" on storage.objects for delete
  using (bucket_id = 'belege' and (storage.foldername(name))[1] = auth.uid()::text);

-- ======================================================================
-- v4: Hallen-Wiki, Gespann-Kontakt, Fahrgemeinschaft, private Spielnotizen
-- ======================================================================

-- Hallen-Wiki: Hinweise je Halle (Parken, Kabine, Schluessel). Lesen alle
-- Mitglieder, aendern nur der Verfasser.
create table if not exists public.hallen_notizen (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  slug      text not null,
  name      text not null,
  halle     text not null,
  text      text not null,
  angelegt  timestamptz not null default now(),
  geaendert timestamptz not null default now()
);
create index if not exists hallen_notizen_halle on public.hallen_notizen (halle);
alter table public.hallen_notizen enable row level security;
drop policy if exists "Hallenhinweise lesen (alle Mitglieder)" on public.hallen_notizen;
drop policy if exists "eigene Hallenhinweise anlegen"  on public.hallen_notizen;
drop policy if exists "eigene Hallenhinweise aendern"  on public.hallen_notizen;
drop policy if exists "eigene Hallenhinweise loeschen" on public.hallen_notizen;
create policy "Hallenhinweise lesen (alle Mitglieder)" on public.hallen_notizen for select to authenticated using (true);
create policy "eigene Hallenhinweise anlegen"  on public.hallen_notizen for insert with check (auth.uid() = user_id);
create policy "eigene Hallenhinweise aendern"  on public.hallen_notizen for update using (auth.uid() = user_id);
create policy "eigene Hallenhinweise loeschen" on public.hallen_notizen for delete using (auth.uid() = user_id);
drop trigger if exists hallen_notizen_geaendert on public.hallen_notizen;
create trigger hallen_notizen_geaendert before update on public.hallen_notizen
  for each row execute function public.setze_geaendert();

-- Gespann-Kontakt: freiwillig freigegebene Telefonnummer. Eine Zeile = Opt-in;
-- loeschen = zurueckziehen. Sichtbar fuer alle angemeldeten Mitglieder.
create table if not exists public.kontakte (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  slug      text not null,
  name      text not null,
  telefon   text not null,
  hinweis   text,
  geaendert timestamptz not null default now()
);
alter table public.kontakte enable row level security;
drop policy if exists "Kontakte lesen (alle Mitglieder)" on public.kontakte;
drop policy if exists "eigenen Kontakt anlegen"  on public.kontakte;
drop policy if exists "eigenen Kontakt aendern"  on public.kontakte;
drop policy if exists "eigenen Kontakt loeschen" on public.kontakte;
create policy "Kontakte lesen (alle Mitglieder)" on public.kontakte for select to authenticated using (true);
create policy "eigenen Kontakt anlegen"  on public.kontakte for insert with check (auth.uid() = user_id);
create policy "eigenen Kontakt aendern"  on public.kontakte for update using (auth.uid() = user_id);
create policy "eigenen Kontakt loeschen" on public.kontakte for delete using (auth.uid() = user_id);

-- Fahrgemeinschaft je Spiel: "Ich fahre ab Iserlohn, 2 Plaetze"
create table if not exists public.mitfahrten (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  slug      text not null,
  name      text not null,
  kennung   text not null,
  beginn    timestamptz not null,
  text      text not null,
  angelegt  timestamptz not null default now(),
  unique (user_id, kennung)
);
create index if not exists mitfahrten_kennung on public.mitfahrten (kennung);
alter table public.mitfahrten enable row level security;
drop policy if exists "Mitfahrten lesen (alle Mitglieder)" on public.mitfahrten;
drop policy if exists "eigene Mitfahrten anlegen"  on public.mitfahrten;
drop policy if exists "eigene Mitfahrten aendern"  on public.mitfahrten;
drop policy if exists "eigene Mitfahrten loeschen" on public.mitfahrten;
create policy "Mitfahrten lesen (alle Mitglieder)" on public.mitfahrten for select to authenticated using (true);
create policy "eigene Mitfahrten anlegen"  on public.mitfahrten for insert with check (auth.uid() = user_id);
create policy "eigene Mitfahrten aendern"  on public.mitfahrten for update using (auth.uid() = user_id);
create policy "eigene Mitfahrten loeschen" on public.mitfahrten for delete using (auth.uid() = user_id);

-- Private Spielnotizen: nur der Besitzer
create table if not exists public.spielnotizen (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  kennung   text not null,
  beginn    timestamptz not null,
  liga      text, paarung text, halle text,
  text      text not null,
  geaendert timestamptz not null default now(),
  unique (user_id, kennung)
);
alter table public.spielnotizen enable row level security;
drop policy if exists "eigene Spielnotizen lesen"    on public.spielnotizen;
drop policy if exists "eigene Spielnotizen anlegen"  on public.spielnotizen;
drop policy if exists "eigene Spielnotizen aendern"  on public.spielnotizen;
drop policy if exists "eigene Spielnotizen loeschen" on public.spielnotizen;
create policy "eigene Spielnotizen lesen"    on public.spielnotizen for select using (auth.uid() = user_id);
create policy "eigene Spielnotizen anlegen"  on public.spielnotizen for insert with check (auth.uid() = user_id);
create policy "eigene Spielnotizen aendern"  on public.spielnotizen for update using (auth.uid() = user_id);
create policy "eigene Spielnotizen loeschen" on public.spielnotizen for delete using (auth.uid() = user_id);
drop trigger if exists spielnotizen_geaendert on public.spielnotizen;
create trigger spielnotizen_geaendert before update on public.spielnotizen
  for each row execute function public.setze_geaendert();

-- Erinnerungs-Push (Spieltag, Abfahrt): welche Nachrichten schon raus sind,
-- damit der halbstuendliche Lauf nichts doppelt schickt. Schreibt nur der
-- Workflow (service_role); Mitglieder sehen nur ihre eigenen Zeilen.
create table if not exists public.push_gesendet (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  schluessel text not null,           -- z.B. "spieltag|<kennung>" oder "abfahrt|<kennung>"
  gesendet  timestamptz not null default now(),
  unique (user_id, schluessel)
);
alter table public.push_gesendet enable row level security;
drop policy if exists "eigene Push-Historie lesen" on public.push_gesendet;
create policy "eigene Push-Historie lesen" on public.push_gesendet for select using (auth.uid() = user_id);

-- ======================================================================
-- v5: Freischaltung, Admin, Konto loeschen, Beleg-Limits
-- ======================================================================

-- Neue Konten sind gesperrt, bis der Admin (du) sie freischaltet. Gemeinsame
-- Tabellen (Tauschboerse, Verfuegbarkeit, Hallen-Wiki, Kontakte, Mitfahrten)
-- sehen nur Freigeschaltete. Eigene Daten (Abrechnung, Notizen, Belege)
-- gehen weiterhin sofort.
alter table public.profile add column if not exists freigeschaltet boolean not null default false;
alter table public.profile add column if not exists admin boolean not null default false;
alter table public.profile add column if not exists email text;

-- Hilfsfunktionen fuer die Zugriffsregeln. security definer, damit sie das
-- Profil lesen duerfen, ohne dass die Profil-Regeln selbst im Weg stehen.
create or replace function public.ist_freigeschaltet()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select freigeschaltet or admin from public.profile where id = auth.uid()), false);
$$;
create or replace function public.ist_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select admin from public.profile where id = auth.uid()), false);
$$;
revoke all on function public.ist_freigeschaltet() from public;
revoke all on function public.ist_admin() from public;
grant execute on function public.ist_freigeschaltet() to authenticated;
grant execute on function public.ist_admin() to authenticated;

-- Admin darf alle Profile sehen (Name, E-Mail, Status) und freischalten.
-- Die Spalten admin/freigeschaltet kann ein Nutzer fuer sich selbst nicht
-- setzen: der Trigger unten stellt sie zurueck.
drop policy if exists "Admin liest alle Profile" on public.profile;
drop policy if exists "Admin schaltet frei"     on public.profile;
create policy "Admin liest alle Profile" on public.profile for select using (public.ist_admin());
create policy "Admin schaltet frei"     on public.profile for update using (public.ist_admin());

create or replace function public.profil_schutz()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() ist null im SQL Editor, fuer service_role und in Triggern
  -- aus dem Auth-System - die duerfen alles. Nur echte Nutzer werden gebremst.
  if auth.uid() is not null and not public.ist_admin() then
    -- Normale Nutzer behalten, was der Admin gesetzt hat
    if tg_op = 'UPDATE' then
      new.freigeschaltet := old.freigeschaltet;
      new.admin := old.admin;
    else
      new.freigeschaltet := false;
      new.admin := false;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profil_schutz on public.profile;
create trigger profil_schutz before insert or update on public.profile
  for each row execute function public.profil_schutz();

-- Gemeinsame Tabellen: lesen und schreiben nur freigeschaltet
drop policy if exists "Gesuche lesen (alle Mitglieder)" on public.gesuche;
create policy "Gesuche lesen (alle Mitglieder)" on public.gesuche for select to authenticated using (public.ist_freigeschaltet());
drop policy if exists "eigene Gesuche anlegen" on public.gesuche;
create policy "eigene Gesuche anlegen" on public.gesuche for insert with check (auth.uid() = user_id and public.ist_freigeschaltet());

drop policy if exists "Angebote lesen (alle Mitglieder)" on public.angebote;
create policy "Angebote lesen (alle Mitglieder)" on public.angebote for select to authenticated using (public.ist_freigeschaltet());
drop policy if exists "eigene Angebote anlegen" on public.angebote;
create policy "eigene Angebote anlegen" on public.angebote for insert with check (auth.uid() = user_id and public.ist_freigeschaltet());

drop policy if exists "Sperren lesen (alle Mitglieder)" on public.sperren;
create policy "Sperren lesen (alle Mitglieder)" on public.sperren for select to authenticated using (public.ist_freigeschaltet());
drop policy if exists "eigene Sperren anlegen" on public.sperren;
create policy "eigene Sperren anlegen" on public.sperren for insert with check (auth.uid() = user_id and public.ist_freigeschaltet());

drop policy if exists "Hallenhinweise lesen (alle Mitglieder)" on public.hallen_notizen;
create policy "Hallenhinweise lesen (alle Mitglieder)" on public.hallen_notizen for select to authenticated using (public.ist_freigeschaltet());
drop policy if exists "eigene Hallenhinweise anlegen" on public.hallen_notizen;
create policy "eigene Hallenhinweise anlegen" on public.hallen_notizen for insert with check (auth.uid() = user_id and public.ist_freigeschaltet());

drop policy if exists "Kontakte lesen (alle Mitglieder)" on public.kontakte;
create policy "Kontakte lesen (alle Mitglieder)" on public.kontakte for select to authenticated using (public.ist_freigeschaltet());
drop policy if exists "eigenen Kontakt anlegen" on public.kontakte;
create policy "eigenen Kontakt anlegen" on public.kontakte for insert with check (auth.uid() = user_id and public.ist_freigeschaltet());

drop policy if exists "Mitfahrten lesen (alle Mitglieder)" on public.mitfahrten;
create policy "Mitfahrten lesen (alle Mitglieder)" on public.mitfahrten for select to authenticated using (public.ist_freigeschaltet());
drop policy if exists "eigene Mitfahrten anlegen" on public.mitfahrten;
create policy "eigene Mitfahrten anlegen" on public.mitfahrten for insert with check (auth.uid() = user_id and public.ist_freigeschaltet());

-- Konto selbst loeschen: entfernt Belege und den Auth-Nutzer; alle Tabellen
-- haengen per "on delete cascade" daran.
create or replace function public.konto_loeschen()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'nicht angemeldet';
  end if;
  delete from storage.objects where bucket_id = 'belege' and (storage.foldername(name))[1] = auth.uid()::text;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.konto_loeschen() from public;
grant execute on function public.konto_loeschen() to authenticated;

-- Belege: nur Bilder und PDF, hoechstens 10 MB - serverseitig erzwungen
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
 where id = 'belege';

-- Einmalig: dich selbst zum Admin machen - siehe v6 unten (die Profilzeile
-- entsteht dort automatisch mit dem Konto).

-- ======================================================================
-- v6: Profilzeile entsteht mit dem Konto
-- ======================================================================
-- Bisher gab es die Profilzeile erst, wenn jemand in der App seinen Namen
-- gespeichert hatte - vorher lief das Admin-SQL ins Leere und die Person
-- fehlte in der Freischaltungsliste. Jetzt legt das Auth-System sie an.
create or replace function public.neues_konto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profile (id, email) values (new.id, new.email)
    on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists konto_angelegt on auth.users;
create trigger konto_angelegt after insert or update of email on auth.users
  for each row execute function public.neues_konto();

-- Bestehende Konten nachtragen (E-Mail mitnehmen)
insert into public.profile (id, email)
  select id, email from auth.users
  on conflict (id) do update set email = excluded.email;

-- ----------------------------------------------------------------------
-- Einmalig: dich selbst zum Admin machen. E-Mail anpassen, ausfuehren.
-- Geht sofort nach der Registrierung, auch ohne Namen in der App.
-- ----------------------------------------------------------------------
-- update public.profile set admin = true, freigeschaltet = true
--  where email = 'deine@adresse.de';
--
-- Pruefen:
-- select email, slug, admin, freigeschaltet from public.profile;

-- ======================================================================
-- v7: Ankuendigungen, Obmann-Adresse, Gesuche automatisch erledigt
-- ======================================================================

-- Ankuendigungen vom Admin an alle Mitglieder (Lehrgang, Regeltest, Sitzung)
create table if not exists public.ankuendigungen (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  name      text not null,
  titel     text not null,
  text      text not null,
  wichtig   boolean not null default false,
  bis       date,                              -- danach ausgeblendet (optional)
  push      boolean not null default false,    -- auch als Push an alle
  push_gesendet timestamptz,                   -- vom Workflow gesetzt
  angelegt  timestamptz not null default now(),
  geaendert timestamptz not null default now()
);
alter table public.ankuendigungen enable row level security;
drop policy if exists "Ankuendigungen lesen"    on public.ankuendigungen;
drop policy if exists "Admin schreibt Ankuendigungen"  on public.ankuendigungen;
drop policy if exists "Admin aendert Ankuendigungen"   on public.ankuendigungen;
drop policy if exists "Admin loescht Ankuendigungen"   on public.ankuendigungen;
create policy "Ankuendigungen lesen" on public.ankuendigungen for select to authenticated using (public.ist_freigeschaltet());
create policy "Admin schreibt Ankuendigungen" on public.ankuendigungen for insert with check (public.ist_admin() and auth.uid() = user_id);
create policy "Admin aendert Ankuendigungen"  on public.ankuendigungen for update using (public.ist_admin());
create policy "Admin loescht Ankuendigungen"  on public.ankuendigungen for delete using (public.ist_admin());
drop trigger if exists ankuendigungen_geaendert on public.ankuendigungen;
create trigger ankuendigungen_geaendert before update on public.ankuendigungen
  for each row execute function public.setze_geaendert();

-- E-Mail des Obmanns fuer die Monatsabrechnung per Mail (je Nutzer, frei)
alter table public.profile add column if not exists obmann_email text;

-- Gesuche: wann erledigt, und ob die Helfer schon benachrichtigt wurden
alter table public.gesuche add column if not exists erledigt_am timestamptz;
alter table public.gesuche add column if not exists gemeldet boolean not null default false;

-- ======================================================================
-- v8: Termine, Tausch vereinbaren
-- ======================================================================

-- Ankuendigungen mit Datum (Lehrgang, Regeltest, Sitzung) - erscheinen auf
-- der Startseite als "Naechste Termine", Push am Vortag
alter table public.ankuendigungen add column if not exists termin date;
alter table public.ankuendigungen add column if not exists erinnert timestamptz;

-- Tauschboerse: ein Angebot annehmen -> "vereinbart", Obmann bekommt Mail
alter table public.gesuche drop constraint if exists gesuche_status_check;
alter table public.gesuche add constraint gesuche_status_check check (status in ('offen','vereinbart','erledigt'));
alter table public.gesuche add column if not exists vereinbart_mit uuid;
alter table public.gesuche add column if not exists vereinbart_name text;
alter table public.gesuche add column if not exists vereinbart_gemeldet boolean not null default false;

-- ======================================================================
-- v9: Gespann-Notizen, Einstellungen im Konto, Test-Push je Geraet
-- ======================================================================

-- Kurze Nachrichten am Spiel, nur fuer das Gespann. Wer dazugehoert, steht
-- in gespann (Slugs aus daten.json, inkl. Verfasser) - die Regel prueft den
-- eigenen Slug aus dem Profil dagegen.
create table if not exists public.spielkommentare (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  slug      text not null,
  name      text not null,
  kennung   text not null,
  beginn    timestamptz not null,
  paarung   text,
  gespann   text[] not null default '{}',
  text      text not null,
  gemeldet  boolean not null default false,
  angelegt  timestamptz not null default now()
);
create index if not exists spielkommentare_kennung on public.spielkommentare (kennung);
alter table public.spielkommentare enable row level security;
create or replace function public.mein_slug()
returns text language sql stable security definer set search_path = public as $$
  select slug from public.profile where id = auth.uid();
$$;
revoke all on function public.mein_slug() from public;
grant execute on function public.mein_slug() to authenticated;
drop policy if exists "Gespann liest Kommentare"  on public.spielkommentare;
drop policy if exists "eigene Kommentare anlegen"  on public.spielkommentare;
drop policy if exists "eigene Kommentare loeschen" on public.spielkommentare;
create policy "Gespann liest Kommentare" on public.spielkommentare for select to authenticated
  using (public.ist_freigeschaltet() and (user_id = auth.uid() or public.mein_slug() = any (gespann)));
create policy "eigene Kommentare anlegen" on public.spielkommentare for insert
  with check (auth.uid() = user_id and public.ist_freigeschaltet());
create policy "eigene Kommentare loeschen" on public.spielkommentare for delete using (auth.uid() = user_id);

-- Einstellungen (Schrift, Farbe, Karten-App, kompakt) im Konto, damit sie
-- auf allen Geraeten gleich sind
alter table public.profile add column if not exists einstellungen jsonb;

-- Test-Push an ein bestimmtes Geraet: die App legt eine Zeile an, der
-- Workflow schickt und loescht sie wieder
create table if not exists public.push_test (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  abo_id    uuid not null references public.push_abos (id) on delete cascade,
  angelegt  timestamptz not null default now()
);
alter table public.push_test enable row level security;
drop policy if exists "eigene Tests anlegen" on public.push_test;
drop policy if exists "eigene Tests lesen"   on public.push_test;
create policy "eigene Tests anlegen" on public.push_test for insert with check (auth.uid() = user_id);
create policy "eigene Tests lesen"   on public.push_test for select using (auth.uid() = user_id);

-- ======================================================================
-- v10: Funktionen an- und abschaltbar (Admin -> Funktionen)
-- ======================================================================
-- Eine Zeile je Funktion; fehlt die Zeile, gilt der Standard aus der App.
-- Lesen darf jeder (auch ohne Login, damit die Leiste unten stimmt),
-- schreiben nur Admins.
create table if not exists public.funktionen (
  schluessel text primary key,
  aktiv      boolean not null default true,
  geaendert  timestamptz not null default now()
);
alter table public.funktionen enable row level security;
drop policy if exists "Funktionen lesen"    on public.funktionen;
drop policy if exists "Admin schaltet"      on public.funktionen;
drop policy if exists "Admin legt an"       on public.funktionen;
create policy "Funktionen lesen" on public.funktionen for select to anon, authenticated using (true);
create policy "Admin schaltet"   on public.funktionen for update to authenticated using (public.ist_admin()) with check (public.ist_admin());
create policy "Admin legt an"    on public.funktionen for insert to authenticated with check (public.ist_admin());
grant select on public.funktionen to anon, authenticated;
grant insert, update on public.funktionen to authenticated;
-- Tauschboerse und Verfuegbarkeit starten abgeschaltet
insert into public.funktionen (schluessel, aktiv) values ('tausch', false), ('frei', false)
  on conflict (schluessel) do nothing;

-- ======================================================================
-- v11: Monatsabschluss in der Abrechnung
-- ======================================================================
-- "abgerechnet" = Monatsabrechnung ist raus (E-Mail), "bezahlt" = Geld da.
-- Der Workflow erinnert am Monatsende an nicht abgeschlossene Spiele.
alter table public.einsaetze add column if not exists abgerechnet boolean not null default false;

-- ======================================================================
-- v12: Spiele vom Admin korrigieren (Halle, Zeit, Hinweis, Absage)
-- ======================================================================
-- Eine Zeile je Spiel (Kennung = Original-Beginn|Paarung wie in der App).
-- Der Workflow liest sie beim Bauen der Kalender, die App sofort.
create table if not exists public.spiel_korrekturen (
  kennung     text primary key,
  halle       text,                       -- Hallenname aus venues.json, null = unveraendert
  beginn      timestamptz,                -- neuer Anstoss, null = unveraendert
  treffpunkt  timestamptz,                -- null = Vorlauf vor dem (neuen) Anstoss
  hinweis     text,
  abgesagt    boolean not null default false,
  von         text,
  geaendert   timestamptz not null default now()
);
alter table public.spiel_korrekturen enable row level security;
drop policy if exists "Korrekturen lesen"   on public.spiel_korrekturen;
drop policy if exists "Admin korrigiert"    on public.spiel_korrekturen;
drop policy if exists "Admin legt an"       on public.spiel_korrekturen;
drop policy if exists "Admin loescht"       on public.spiel_korrekturen;
create policy "Korrekturen lesen" on public.spiel_korrekturen for select to anon, authenticated using (true);
create policy "Admin korrigiert"  on public.spiel_korrekturen for update to authenticated using (public.ist_admin()) with check (public.ist_admin());
create policy "Admin legt an"     on public.spiel_korrekturen for insert to authenticated with check (public.ist_admin());
create policy "Admin loescht"     on public.spiel_korrekturen for delete to authenticated using (public.ist_admin());
grant select on public.spiel_korrekturen to anon, authenticated;
grant insert, update, delete on public.spiel_korrekturen to authenticated;

-- ======================================================================
-- v13: Spiele anlegen, Hallen/Vereine pflegen, Termin-Antworten,
--      offizielle Hallen-Hinweise
-- ======================================================================
-- Spiele, die auf esrw.de fehlen (Freundschaftsspiele, Turniere, Lehrgaenge)
create table if not exists public.spiele_manuell (
  id          uuid primary key default gen_random_uuid(),
  beginn      timestamptz not null,
  treffpunkt  timestamptz,
  liga        text,
  paarung     text not null,
  halle       text,
  hinweis     text,
  besetzung   jsonb not null default '[]',   -- [{"name": "Nachname, Vorname", "rolle": "SR|HSR|LSR"}]
  von         text,
  angelegt    timestamptz not null default now()
);
alter table public.spiele_manuell enable row level security;
drop policy if exists "manuelle Spiele lesen" on public.spiele_manuell;
drop policy if exists "Admin legt Spiele an"  on public.spiele_manuell;
drop policy if exists "Admin aendert Spiele"  on public.spiele_manuell;
drop policy if exists "Admin loescht Spiele"  on public.spiele_manuell;
create policy "manuelle Spiele lesen" on public.spiele_manuell for select to anon, authenticated using (true);
create policy "Admin legt Spiele an"  on public.spiele_manuell for insert to authenticated with check (public.ist_admin());
create policy "Admin aendert Spiele"  on public.spiele_manuell for update to authenticated using (public.ist_admin()) with check (public.ist_admin());
create policy "Admin loescht Spiele"  on public.spiele_manuell for delete to authenticated using (public.ist_admin());

-- Hallen und Vereine, die in venues.json fehlen
create table if not exists public.hallen_extra (
  name      text primary key,
  adresse   text,
  lat       double precision,
  lon       double precision,
  von       text,
  angelegt  timestamptz not null default now()
);
create table if not exists public.vereine_extra (
  verein    text primary key,               -- Vereins- oder Ortsname, wie er auf esrw.de steht
  halle     text not null,                  -- Hallenname (venues.json oder hallen_extra)
  von       text,
  angelegt  timestamptz not null default now()
);
alter table public.hallen_extra  enable row level security;
alter table public.vereine_extra enable row level security;
drop policy if exists "Hallen lesen"        on public.hallen_extra;
drop policy if exists "Admin pflegt Hallen" on public.hallen_extra;
drop policy if exists "Vereine lesen"        on public.vereine_extra;
drop policy if exists "Admin pflegt Vereine" on public.vereine_extra;
create policy "Hallen lesen"        on public.hallen_extra  for select to anon, authenticated using (true);
create policy "Admin pflegt Hallen" on public.hallen_extra  for all to authenticated using (public.ist_admin()) with check (public.ist_admin());
create policy "Vereine lesen"        on public.vereine_extra for select to anon, authenticated using (true);
create policy "Admin pflegt Vereine" on public.vereine_extra for all to authenticated using (public.ist_admin()) with check (public.ist_admin());

-- Zu-/Absagen zu Terminen (Ankuendigungen mit Datum)
create table if not exists public.termin_antworten (
  id               uuid primary key default gen_random_uuid(),
  ankuendigung_id  uuid not null references public.ankuendigungen (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  slug             text,
  name             text,
  antwort          text not null check (antwort in ('ja', 'nein')),
  geaendert        timestamptz not null default now(),
  unique (ankuendigung_id, user_id)
);
alter table public.termin_antworten enable row level security;
drop policy if exists "Antworten lesen"    on public.termin_antworten;
drop policy if exists "eigene Antwort"     on public.termin_antworten;
create policy "Antworten lesen" on public.termin_antworten for select to authenticated using (public.ist_freigeschaltet());
create policy "eigene Antwort"  on public.termin_antworten for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and public.ist_freigeschaltet());

-- Offizielle Hallen-Hinweise: vom Admin markiert, stehen oben und im Kalender
alter table public.hallen_notizen add column if not exists offiziell boolean not null default false;
drop policy if exists "offizielle Hinweise lesen"  on public.hallen_notizen;
drop policy if exists "Admin markiert Hinweise"    on public.hallen_notizen;
drop policy if exists "Admin loescht Hinweise"     on public.hallen_notizen;
create policy "offizielle Hinweise lesen" on public.hallen_notizen for select to anon using (offiziell);
create policy "Admin markiert Hinweise"   on public.hallen_notizen for update to authenticated using (public.ist_admin()) with check (public.ist_admin());
create policy "Admin loescht Hinweise"    on public.hallen_notizen for delete to authenticated using (public.ist_admin());

-- ======================================================================
-- v14: Kilometermodell/Verpflegung in der Abrechnung, private Spiele,
--      Telefonliste, Mitfahrt suchen/bieten, Spiele-Archiv in der DB
-- ======================================================================
alter table public.einsaetze add column if not exists verpflegung numeric(6,2);      -- Verpflegungsmehraufwand je Spiel
alter table public.einsaetze add column if not exists privat boolean not null default false;  -- selbst eingetragen, nur fuer die Abrechnung
alter table public.profile  add column if not exists verpflegung_modus text not null default 'aus';  -- aus | auto | immer
alter table public.mitfahrten add column if not exists art text not null default 'biete';    -- biete | suche

-- Telefonliste des Betreibers (Verbandsliste) - sichtbar fuer freigeschaltete Mitglieder
create table if not exists public.telefonliste (
  slug      text primary key,
  name      text,
  telefon   text not null,
  von       text,
  geaendert timestamptz not null default now()
);
alter table public.telefonliste enable row level security;
drop policy if exists "Telefonliste lesen"  on public.telefonliste;
drop policy if exists "Admin pflegt Liste"  on public.telefonliste;
create policy "Telefonliste lesen" on public.telefonliste for select to authenticated using (public.ist_freigeschaltet());
create policy "Admin pflegt Liste" on public.telefonliste for all to authenticated using (public.ist_admin()) with check (public.ist_admin());

-- Alle Spiele aller Personen, dauerhaft. Der Workflow schreibt sie mit dem
-- Service-Schluessel bei jedem Lauf (Archiv + aktuelles Datenfenster);
-- die App liest je Person daraus, wenn das Archiv der Webseite nicht reicht.
create table if not exists public.spiele_archiv (
  kennung    text primary key,             -- Beginn|Paarung wie in der App
  beginn     timestamptz not null,
  liga       text,
  paarung    text,
  halle      text,
  system     integer,
  besetzung  jsonb not null default '[]',  -- [{"name","slug","rolle"}]
  slugs      text[] not null default '{}',
  saison     text,
  manuell    boolean not null default false,
  stand      timestamptz not null default now()
);
create index if not exists spiele_archiv_slugs on public.spiele_archiv using gin (slugs);
create index if not exists spiele_archiv_beginn on public.spiele_archiv (beginn);
alter table public.spiele_archiv enable row level security;
drop policy if exists "Archiv lesen" on public.spiele_archiv;
create policy "Archiv lesen" on public.spiele_archiv for select to authenticated using (true);

-- ======================================================================
-- v15: Wohnort fuer Fahrgemeinschaften (freiwillig, grob)
-- ======================================================================
-- Nur Ortsname und Lage auf etwa einen Kilometer gerundet - keine Adresse.
-- Jeder traegt sich selbst ein (Einstellungen -> Profil) und kann es
-- jederzeit zuruecknehmen; sichtbar fuer freigeschaltete Mitglieder.
create table if not exists public.wohnorte (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  slug      text not null,
  ort       text,
  lat       double precision not null,
  lon       double precision not null,
  geaendert timestamptz not null default now()
);
alter table public.wohnorte enable row level security;
drop policy if exists "Wohnorte lesen"   on public.wohnorte;
drop policy if exists "eigener Wohnort"  on public.wohnorte;
create policy "Wohnorte lesen"  on public.wohnorte for select to authenticated using (public.ist_freigeschaltet());
create policy "eigener Wohnort" on public.wohnorte for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ======================================================================
-- v16: Mitfahrt-Push
-- ======================================================================
alter table public.mitfahrten add column if not exists gemeldet boolean not null default false;

-- ======================================================================
-- v17: Ankuendigungen an Einzelne oder Gruppen
-- ======================================================================
-- an_slugs leer = alle; sonst sehen nur die genannten (und Admins) die Ankuendigung
alter table public.ankuendigungen add column if not exists an_slugs text[];
drop policy if exists "Ankuendigungen lesen" on public.ankuendigungen;
create policy "Ankuendigungen lesen" on public.ankuendigungen for select to authenticated
  using (public.ist_freigeschaltet() and (an_slugs is null or public.mein_slug() = any (an_slugs) or public.ist_admin()));

-- ======================================================================
-- v18: Aufraeumen - Abrechnung kennt keinen Status mehr
-- ======================================================================
-- "bezahlt"/"abgerechnet" waren dasselbe und werden nicht mehr geschrieben.
-- Wer die alten Werte noch braucht, exportiert vorher die Tabelle.
alter table public.einsaetze drop column if exists bezahlt;
alter table public.einsaetze drop column if exists abgerechnet;
-- Alte Push-Schluessel der Monatsende-Erinnerung (heisst jetzt "steuer|<Jahr>")
delete from public.push_gesendet where schluessel like 'abrechnung|%';

-- ======================================================================
-- v19: Rechnungen (Gebuehrenabrechnung als PDF)
-- ======================================================================
-- Vereinsadressen teilen sich alle Freigeschalteten: wer eine Adresse
-- eintraegt, erspart sie allen anderen. Geaendert wird selten, darum reicht
-- ein Eintrag je Verein.
create table if not exists public.vereine_adressen (
  verein      text primary key,
  name        text,
  strasse     text,
  plz_ort     text,
  angelegt_von uuid references auth.users(id) on delete set null,
  geaendert   timestamptz not null default now()
);
alter table public.vereine_adressen enable row level security;
drop policy if exists "Vereinsadressen lesen"  on public.vereine_adressen;
drop policy if exists "Vereinsadressen pflegen" on public.vereine_adressen;
create policy "Vereinsadressen lesen"   on public.vereine_adressen for select to authenticated using (public.ist_freigeschaltet());
create policy "Vereinsadressen pflegen" on public.vereine_adressen for all    to authenticated using (public.ist_freigeschaltet()) with check (public.ist_freigeschaltet());

-- Geschriebene Rechnungen: nur fuer einen selbst, damit die Nummern
-- fortlaufen und man spaeter nachsehen kann, was wann abgerechnet wurde.
create table if not exists public.rechnungen (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  nummer     text not null,
  datum      date not null default current_date,
  verein     text,
  betrag     numeric(8,2),
  kennungen  text[],
  angelegt   timestamptz not null default now()
);
create index if not exists rechnungen_user_idx on public.rechnungen (user_id, datum desc);
alter table public.rechnungen enable row level security;
drop policy if exists "eigene Rechnungen" on public.rechnungen;
create policy "eigene Rechnungen" on public.rechnungen for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ======================================================================
-- v20: Zugang - was ohne Konto sichtbar ist, und was nicht
-- ======================================================================
-- In der App sind ohne Anmeldung nur noch der Spielplan und die Startseite
-- einer Person zu sehen. Die Anzeige allein schuetzt nichts, darum hier die
-- Regeln dazu. Grundsatz:
--
--   * Ohne Anmeldung (Rolle anon) darf nur gelesen werden, was ohnehin auf
--     esrw.de steht: Schalter der Funktionen, Korrekturen und selbst
--     angelegte Spiele, Hallen und Vereine, offizielle Hallenhinweise.
--   * Angemeldet, aber noch nicht freigeschaltet: nur die eigenen Sachen.
--   * Freigeschaltet: dazu das, was die Gruppe teilt (Tausch, Hallenwiki,
--     Kontakte, Mitfahrten, Wohnorte, Telefonliste, Vereinsadressen).
--
-- Das Spielearchiv war bisher fuer jedes angemeldete Konto vollstaendig
-- lesbar. Jetzt gilt: freigeschaltet sieht alles, wer noch wartet, sieht
-- nur die eigenen Spiele.
drop policy if exists "Archiv lesen" on public.spiele_archiv;
create policy "Archiv lesen" on public.spiele_archiv for select to authenticated
  using (public.ist_freigeschaltet() or public.mein_slug() = any (slugs));

-- Zur Kontrolle: diese Abfrage zeigt, wer was lesen darf. Sollte hier eine
-- Tabelle mit persoenlichen Daten und Rolle "anon" auftauchen, ist etwas
-- falsch.
--
--   select schemaname, tablename, policyname, roles, cmd
--     from pg_policies
--    where schemaname = 'public' and cmd in ('SELECT', 'ALL')
--    order by tablename, policyname;
--
-- Erwartet mit anon: funktionen, spiel_korrekturen, spiele_manuell,
-- hallen_extra, vereine_extra, hallen_notizen (nur offiziell).

-- ======================================================================
-- v21: Tresor - Schluessel fuer die verschluesselten Daten
-- ======================================================================
-- Die Dateien in docs/ (daten.json, archiv.json, protokoll.json, die
-- Saison-Dateien) liegen nur noch als .bin dort: AES-256-GCM. Den
-- Schluessel bekommt die App hier - und diese Tabelle liest nur, wer
-- freigeschaltet ist. Ohne Anmeldung ist an den Daten nichts zu holen,
-- auch nicht ueber die Adresse der Datei.
--
-- Einen Schluessel erzeugen:   python tresor.py --neu
-- Denselben Wert eintragen als GitHub-Secret DATEN_SCHLUESSEL und hier:
create table if not exists public.tresor (
  id         integer primary key default 1,
  schluessel text not null,
  geaendert  timestamptz not null default now(),
  constraint tresor_nur_eine_zeile check (id = 1)
);
alter table public.tresor enable row level security;
drop policy if exists "Tresor lesen"  on public.tresor;
drop policy if exists "Admin pflegt Tresor" on public.tresor;
create policy "Tresor lesen"        on public.tresor for select to authenticated using (public.ist_freigeschaltet());
create policy "Admin pflegt Tresor" on public.tresor for all    to authenticated using (public.ist_admin()) with check (public.ist_admin());

-- insert into public.tresor (id, schluessel) values (1, 'HIER_DER_WERT')
--   on conflict (id) do update set schluessel = excluded.schluessel, geaendert = now();
--
-- Schluessel wechseln: neuen Wert erzeugen, hier eintragen, als Secret
-- hinterlegen - beim naechsten Lauf werden die Dateien damit geschrieben.
-- Die App merkt am fehlgeschlagenen Entschluesseln, dass sie den neuen
-- Schluessel holen muss.

-- ======================================================================
-- v22: Rechnungen merken sich ihre Felder
-- ======================================================================
-- Damit sich dasselbe PDF jederzeit neu bauen laesst, ohne es irgendwo
-- abzulegen: ein paar hundert Zeichen je Rechnung statt einer Datei.
alter table public.rechnungen add column if not exists felder jsonb;

-- ======================================================================
-- v23: "offiziell" bei Hallen-Hinweisen bleibt beim Betreiber
-- ======================================================================
-- Die Aenderungsregel aus v4 ("eigene Hallenhinweise aendern") deckt die
-- ganze Zeile ab - auch die Spalte "offiziell", die erst v13 dazugebracht
-- hat. Mehrere Regeln fuer denselben Befehl gelten mit ODER, die Regel
-- "Admin markiert Hinweise" bremst also niemanden. Damit konnte jedes
-- freigeschaltete Mitglied seinen eigenen Hinweis als offiziell markieren -
-- und offizielle Hinweise darf jeder lesen, auch ohne Anmeldung. Ein
-- Trigger nach dem Muster von profil_schutz haelt die Spalte fest,
-- solange kein Admin schreibt; den Text darf der Verfasser weiter aendern.
create or replace function public.hallennotiz_schutz()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() ist null im SQL Editor und fuer service_role - die duerfen alles
  if auth.uid() is not null and not public.ist_admin() then
    if tg_op = 'UPDATE' then
      new.offiziell := old.offiziell;
    else
      new.offiziell := false;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists hallennotiz_schutz on public.hallen_notizen;
create trigger hallennotiz_schutz before insert or update on public.hallen_notizen
  for each row execute function public.hallennotiz_schutz();
