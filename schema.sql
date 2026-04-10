-- ============================================================
-- Navya — Supabase Schema
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid        primary key references auth.users(id) on delete cascade,
  mom_name        text        not null default 'Mama',
  delivery_type   text        not null default 'vaginal'
                              check (delivery_type in ('vaginal','csection')),
  birth_date      date,
  partner_name    text        not null default 'Partner',
  partner_token   text        unique default gen_random_uuid()::text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── checkins ─────────────────────────────────────────────────
create table if not exists public.checkins (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  date            date        not null,
  day_number      int,
  mood            text,
  symptoms        text[]      default '{}',
  symptom_times   jsonb       default '{}',   -- {slug: iso_timestamp}
  note_text       text,
  voice_transcript text,
  saved_at        timestamptz default now(),
  unique (user_id, date)
);

-- ── symptom_tracks ────────────────────────────────────────────
create table if not exists public.symptom_tracks (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  slug            text        not null,
  title           text,
  first_seen_date date,
  first_seen_day  int,
  status          text        not null default 'ongoing'
                              check (status in ('ongoing','resolved')),
  resolved_date   date,
  resolved_day    int,
  days_to_resolve int,
  note            text,
  unique (user_id, slug)
);

-- ── guide_views (analytics) ───────────────────────────────────
create table if not exists public.guide_views (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  slug            text        not null,
  viewed_at       timestamptz default now()
);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.checkins       enable row level security;
alter table public.symptom_tracks enable row level security;
alter table public.guide_views    enable row level security;

-- profiles: own row
create policy "profiles_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- profiles: partner can read by token (anon select allowed; filter in app)
create policy "profiles_partner_read" on public.profiles
  for select using (true);

-- checkins: own rows
create policy "checkins_own" on public.checkins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- checkins: partner can read (filter by user_id in app)
create policy "checkins_partner_read" on public.checkins
  for select using (true);

-- symptom_tracks: own rows
create policy "symptom_tracks_own" on public.symptom_tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- symptom_tracks: partner read
create policy "symptom_tracks_partner_read" on public.symptom_tracks
  for select using (true);

-- guide_views: own rows
create policy "guide_views_own" on public.guide_views
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── trigger: updated_at ───────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- ── trigger: auto-create profile row on signup ────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
