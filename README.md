# Tumpang Shop

React + TypeScript + Vite marketplace starter. Supabase is the data/auth provider. ArtoPay is intentionally not activated until its official server-side API/webhook contract and credentials are configured.

## Required Vercel environment variables

- `VITE_SUPABASE_URL`: `https://sjhujsvifjdfvzjtyetn.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: the project's publishable/anon key (public browser key only)

Never place Supabase `service_role` or any ArtoPay secret in a `VITE_` variable.

## Dashboard-only setup

1. Create/import a private GitHub repository and upload the contents of this folder (not the outer ZIP as a single file).
2. Import that repository in Vercel. Framework: Vite; Build command `npm run build`; Output directory `dist`.
3. Add the two environment variables above in Vercel project settings, then redeploy.
4. In the Supabase Dashboard for project ref `sjhujsvifjdfvzjtyetn`, open SQL Editor and review/run migrations 01–04 in order. These migrations are not automatically applied by Vercel.
5. Run `supabase/seed.sql` only after migration verification. Register your account through the website, then review and edit the email in `scripts/bootstrap_admin.sql` before running it in SQL Editor.

## Important status

- Catalog/auth/admin product CRUD are wired to Supabase, subject to successful schema deployment and correct RLS.
- Cart is stored locally in the visitor's browser.
- Checkout/payment stays in safe standby. No fake payment success is shown. A server-side ArtoPay Edge Function and verified webhook are still required before accepting payments.
- This source has not been tested against your live Supabase database. Build validation only proves source compilation, not live auth/RLS/payment behavior.
