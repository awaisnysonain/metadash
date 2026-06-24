# MetaDash

Internal dashboard for managing Facebook and Instagram ad comments, connected Meta ad accounts, pages, Instagram accounts, campaigns, ads, and comment sync jobs.

## Local Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, auth settings, and Meta credentials.
3. Start PostgreSQL if using Docker: `npm run db:up`
4. Start the app and API together: `npm run dev:all`

## Checks

- Typecheck frontend and server: `npm run lint`
- Build the production web bundle: `npm run build`

## Meta Sync

- Full sync runs pages, Instagram accounts, ads, and comments.
- Comment cron starts on the API server when PostgreSQL is connected and demo mode is disabled.
- Webhook endpoint: `/api/meta/webhook`
