-- Suggested Supabase schema (review and adapt before production use)
create type public.job_status as enum ('pending','approved','rejected','expired');
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  job_title text not null,
  category text not null,
  location text not null,
  experience text not null,
  qualification text not null,
  employment_type text not null,
  work_mode text not null,
  description text not null,
  application_deadline date not null,
  application_url text not null,
  recruiter_email text not null,
  status public.job_status not null default 'pending',
  employer_verified boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.jobs enable row level security;
alter table public.admin_users enable row level security;

-- Helper: authenticated user is in the administrator allow-list.
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()); $$;

-- Public may view approved, in-date jobs only.
create policy "Public reads approved active jobs" on public.jobs
for select to anon, authenticated
using (status = 'approved' and application_deadline >= current_date);

-- Public recruiter submissions are pending only.
create policy "Public submits pending jobs" on public.jobs
for insert to anon, authenticated
with check (status = 'pending' and employer_verified = false);

-- Only allow-listed admins can manage records.
create policy "Admins manage jobs" on public.jobs
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins read admin allow-list" on public.admin_users
for select to authenticated using (public.is_admin());

-- IMPORTANT: This schema is a starting point, not a complete abuse/security review.
-- Add server-side URL validation, rate limiting, CAPTCHA and moderation audit logs.
-- Consider moving recruiter_email into a private submissions table so it is never public.
