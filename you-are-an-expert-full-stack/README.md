# RouteShare Carpooling

Full-stack carpooling platform for one-way driver trips, efficient rider matching, dual-party check-in validation, Stripe escrow-style rider payments, and weekly driver compensation.

## Run locally

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set secrets. A Stripe publishable key may start with `pk_`; the backend secret must start with `sk_`.
3. Initialize the database: `npm run db:migrate && npm run db:seed`
4. Start both services: `npm run dev`

Frontend: `http://localhost:5173`  
API: `http://localhost:4000/api/health`

## Architecture

- React + Vite frontend with Driver and Rider dashboards.
- Express API with JWT auth, RBAC, Zod validation, Helmet, rate limiting, and parameterized SQLite queries.
- Google Maps Distance Matrix and Directions service wrapper, with deterministic fallback estimates for local development without a key.
- Stripe Checkout Sessions for rider fees and webhook validation for booking payment confirmation.
- Weekly payout job that aggregates verified fares and creates driver payout ledger rows.

## Vercel deployment note

This repository includes `api/[...path].ts` and `vercel.json` so the Express API can run as a Vercel serverless function and the Vite frontend can be served from `dist`. For a real production release, move persistence from local SQLite to a managed database such as Vercel Postgres, Neon, Supabase Postgres, or another durable hosted database. SQLite works for local development and preview smoke tests, but serverless filesystems are not durable record storage.

## Netlify deployment note

This repository also includes `netlify.toml` and `netlify/functions/api.ts`. Netlify should use:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

Set the same environment variables from `.env` in Netlify Site settings before using live Stripe payments.

Keep `NODE_ENV=production` in Netlify. The included `netlify.toml` sets `NPM_FLAGS=--include=dev` so Netlify still installs the TypeScript/Vite build tools.

For preview-only testing without a hosted database, the serverless API uses `/tmp/routeshare.sqlite`. Do not rely on that for real rider records, check-ins, or payouts because serverless temp storage can reset.

## Security notes

- Passwords are hashed with bcrypt before storage.
- JWT is used for authenticated API access.
- All API inputs are validated with Zod and database access uses prepared statements.
- Payment card data never touches this app; Stripe-hosted Checkout handles collection.
- Production deployments must run behind HTTPS and use managed secrets.

## Stripe keys

The frontend publishable key is stored as `VITE_STRIPE_PUBLISHABLE_KEY`. The API uses Stripe Checkout, so payments will not go live until `STRIPE_SECRET_KEY` is set to a server-side `sk_live_...` or `sk_test_...` key and `STRIPE_WEBHOOK_SECRET` is set from the Stripe webhook endpoint.
