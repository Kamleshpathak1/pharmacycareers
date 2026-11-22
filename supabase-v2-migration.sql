-- PharmacyCareers v2: grants and policy hardening for the tables already created.
-- Run in Supabase SQL Editor on the Mumbai project.
-- This script does not insert sample vacancies or expose recruiter email publicly.

-- Ensure the browser roles can reach the public schema and required tables.
grant usage on schema public to anon, authenticated;
grant select on public.jobs to anon, authenticated;
grant insert on public.job_submissions to anon, authenticated;
grant select, insert, update, delete on public.jobs to authenticated;
grant select, update on public.job_submissions to authenticated;
grant select on public.admin_users to authenticated;

-- Ensure RLS remains enabled.
alter table public.jobs enable row level security;
alter table public.job_submissions enable row level security;
alter table public.admin_users enable row level security;

-- Add basic data-quality constraints if they are not already present.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_application_url_https') then
    alter table public.jobs add constraint jobs_application_url_https check (application_url ~ '^https://');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'submissions_application_url_https') then
    alter table public.job_submissions add constraint submissions_application_url_https check (application_url ~ '^https://');
  end if;
end $$;

-- Recreate policies idempotently. Public reads approved, in-date jobs only.
drop policy if exists "Public view approved jobs" on public.jobs;
create policy "Public view approved jobs" on public.jobs
for select to anon, authenticated
using (status = 'approved' and application_deadline >= current_date);

drop policy if exists "Admins manage jobs" on public.jobs;
create policy "Admins manage jobs" on public.jobs
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Recruiters submit jobs" on public.job_submissions;
create policy "Recruiters submit jobs" on public.job_submissions
for insert to anon, authenticated
with check (status = 'pending' and application_url ~ '^https://');

drop policy if exists "Admins manage submissions" on public.job_submissions;
create policy "Admins manage submissions" on public.job_submissions
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins view admin records" on public.admin_users;
create policy "Admins view admin records" on public.admin_users
for select to authenticated using (public.is_admin());

-- Keep the administrator helper unavailable to anonymous callers.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
