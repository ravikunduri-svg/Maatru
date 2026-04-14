-- ============================================================
--  Navya — feedback table
--  Run once in Supabase SQL editor.
--  Requires is_admin_user() security-definer function from admin-schema.sql.
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

-- Any authenticated user can insert their own feedback
create policy "users can insert feedback"
  on feedback for insert
  to authenticated
  with check (true);

-- Only admin users can read (inline check — no dependency on is_admin_user())
create policy "admins can read feedback"
  on feedback for select
  using (
    coalesce(
      (select is_admin from public.profiles where id = auth.uid()),
      false
    )
  );
