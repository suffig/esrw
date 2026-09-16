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
