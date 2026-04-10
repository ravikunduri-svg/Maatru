-- ============================================================
-- guest-schema.sql
-- Run AFTER admin-schema.sql in Supabase SQL Editor.
-- Adds is_guest flag so anonymous / skipped-login users are
-- tracked and labelled in the admin dashboard.
-- ============================================================

-- ── Add is_guest column ────────────────────────────────────────
alter table public.profiles
  add column if not exists is_guest boolean not null default false;

-- ── Enable anonymous sign-ins ─────────────────────────────────
-- In Supabase Dashboard → Authentication → Providers → Anonymous
-- toggle "Enable anonymous sign-ins" ON.
-- This SQL file cannot do that — it must be set in the UI.

-- ── Allow guests to update their own is_guest flag ────────────
-- The existing "profiles_own" policy (for all using auth.uid() = id)
-- already covers this — no extra policy needed.

-- ── Index for admin queries ────────────────────────────────────
create index if not exists profiles_is_guest_idx on public.profiles (is_guest);
