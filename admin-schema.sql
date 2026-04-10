-- ============================================================
-- admin-schema.sql
-- Run AFTER schema.sql in Supabase SQL Editor.
-- ============================================================

-- ── Step 1: Add is_admin column ───────────────────────────────
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- ── Step 2: Security-definer helper (breaks RLS recursion) ───
-- Reads profiles WITHOUT triggering RLS policies on that table.
create or replace function public.is_admin_user()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ── Step 3: Admin RLS policies ────────────────────────────────

-- profiles: admin can read all rows
drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read" on public.profiles
  for select using (public.is_admin_user());

-- checkins: admin can read all rows
drop policy if exists "checkins_admin_read" on public.checkins;
create policy "checkins_admin_read" on public.checkins
  for select using (public.is_admin_user());

-- symptom_tracks: admin can read all rows
drop policy if exists "symptom_tracks_admin_read" on public.symptom_tracks;
create policy "symptom_tracks_admin_read" on public.symptom_tracks
  for select using (public.is_admin_user());

-- guide_views: admin can read all rows
drop policy if exists "guide_views_admin_read" on public.guide_views;
create policy "guide_views_admin_read" on public.guide_views
  for select using (public.is_admin_user());

-- ── Step 4: Also store email in profiles for admin display ────
alter table public.profiles
  add column if not exists email text;

-- Update trigger to capture email on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- ── Step 5: Grant admin access to set is_admin manually ──────
-- Run this manually to promote a user to admin:
--   update public.profiles set is_admin = true where email = 'your@email.com';
