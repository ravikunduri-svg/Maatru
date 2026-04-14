-- ============================================================
--  Navya — feedback table
--  Safe to re-run (drop if exists + create).
-- ============================================================

create table if not exists feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id) on delete set null,
  mom_name     text,
  type         text check (type in ('bug', 'idea', 'love', 'other')) default 'other',
  message      text not null,
  submitted_at timestamptz default now()
);

alter table feedback enable row level security;

-- Insert: allow both authenticated users AND anon (local-only / not signed in)
drop policy if exists "users can insert feedback" on feedback;
create policy "users can insert feedback"
  on feedback for insert
  to authenticated, anon
  with check (true);

-- Read: admins only (inline — no dependency on is_admin_user())
drop policy if exists "admins can read feedback" on feedback;
create policy "admins can read feedback"
  on feedback for select
  using (
    coalesce(
      (select is_admin from public.profiles where id = auth.uid()),
      false
    )
  );
