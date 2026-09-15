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
