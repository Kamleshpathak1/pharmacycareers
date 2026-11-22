# PharmacyCareers starter website

This is a responsive, front-end MVP for PharmacyCareers.

## Run locally
Open `index.html` in a modern browser. No build step or paid API is required.

## Important limitation
This package is a browser-only prototype, not a production recruitment system. Job submissions are stored in the current browser's localStorage. They are not sent to a central database. The site intentionally has no fake vacancies and shows an empty state until approved jobs exist. There is no secure admin authentication in this version. Do not treat browser-side storage or hidden UI as access control.

## Free deployment
You can publish the static front end using a free static hosting tier such as GitHub Pages or Cloudflare Pages. Connect a repository containing `index.html` and publish the root directory. Add your own domain later if desired.

## Production upgrade required before accepting real recruiter submissions
Use a managed backend such as Supabase (free tier subject to provider limits):
1. Create `jobs`, `categories`, `companies`, `profiles` tables.
2. Enable Supabase Auth. Create administrator accounts manually; never hard-code credentials.
3. Configure Row Level Security (RLS): anonymous users can insert pending submissions only; public users can read approved, non-expired jobs; only authenticated admin-role users can approve, reject, edit, verify or delete.
4. Validate application URLs server-side, rate-limit submissions, add CAPTCHA/abuse protection, and log moderation actions.
5. Store recruiter contact details privately; do not expose recruiter email in public job JSON.
6. Add server-side expiry handling and audit trail. Verify employer identity and the official application URL before marking a job verified.
7. Replace the demo form's localStorage handler with a Supabase Edge Function or secured API endpoint. Never put a service-role key in browser code.

## Before launch
- Replace `hello@pharmacycareers.in` with a monitored address you control.
- Publish reviewed Privacy Policy, Terms and Conditions, and Disclaimer content.
- Add a real logo, favicon, canonical URL, sitemap.xml and robots.txt.
- Test all flows on mobile and desktop.
- Add real jobs only after checking the employer and application link.
- Configure Open Graph image metadata with a hosted preview image.
