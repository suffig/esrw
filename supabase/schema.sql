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
