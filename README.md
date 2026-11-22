# PharmacyCareers v2 (Supabase-connected static website)

## Files
- `index.html`: responsive public website, job search, job details/share, recruiter submission, administrator login and dashboard.
- `config.js`: public Supabase project URL and publishable key placeholders.
- `supabase-v2-migration.sql`: grants and RLS policy setup for the tables created in the current PharmacyCareers Supabase project.
- `supabase-schema.sql`: original starter schema reference. Do not rerun it on the already-created project.

## Configure before deploying
1. Open `config.js` in a text editor.
2. Replace `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE` with the base project URL, e.g. `https://<project-ref>.supabase.co` (do not include `/rest/v1/`).
3. Replace `PASTE_YOUR_SB_PUBLISHABLE_KEY_HERE` with the `sb_publishable_...` key from Supabase Settings > API Keys.
4. Save the file. The publishable key is intended for browser use when RLS is correctly configured. Never put a Supabase secret key, service-role key, database password, or user password in `config.js`.

## Database setup
The user already created `admin_users`, `jobs`, `job_submissions`, and `public.is_admin()` and registered their admin user. Run `supabase-v2-migration.sql` in the SQL Editor of that same Mumbai project. It grants the required Data API privileges and refreshes RLS policies. Do not run the original `supabase-schema.sql` again.

Expected table columns used by the website:
- `jobs`: `id`, `company_name`, `job_title`, `category`, `location`, `experience`, `qualification`, `employment_type`, `work_mode`, `description`, `application_deadline`, `application_url`, `status`, `employer_verified`, `posted_at`, `created_at`.
- `job_submissions`: same job fields plus `recruiter_email`, `status`, `submitted_at`.
- `admin_users`: `user_id`, `created_at`.

## Deploy to the existing Cloudflare Pages project
1. Configure `config.js` locally before uploading.
2. In the GitHub `pharmacycareers` repository, upload/replace `index.html`, `config.js`, `README.md`, and `supabase-v2-migration.sql` in the repository root.
3. Commit the changes. Cloudflare Pages should automatically build/deploy from the connected `main` branch. No build command is required; output directory is `/` (repository root).
4. Open the deployed site and test job loading and a recruiter submission.
5. Open `/#admin`, sign in using the Supabase Auth user created earlier, and confirm the account exists in `public.admin_users`.

## Current functionality
- Public job cards load only approved, unexpired rows from Supabase.
- Recruiter submissions are inserted into `job_submissions` with `pending` status. Recruiter email is not returned to public visitors.
- Admin login uses Supabase Auth password authentication and checks the signed-in user against `admin_users`.
- Admin can approve/reject submissions, add/edit/delete jobs, and toggle the employer-verified flag.
- Job detail modal and share action are included. Share uses the browser share sheet when available, otherwise LinkedIn's share page.

## Production hardening still required
This is a functional MVP, not a fully audited recruitment system. Before broad public promotion, add CAPTCHA/anti-spam and server-side rate limiting (prefer a Supabase Edge Function for public submissions), server-side URL/domain and employer validation, moderation audit logs, a proper password reset flow, reviewed privacy/terms pages, backups, and accessibility/security testing. An administrator should independently verify every employer and application destination before approving or marking a listing verified. No sample vacancies are seeded.
