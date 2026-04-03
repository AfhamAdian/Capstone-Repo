# Capstone
# Backend




READ INSTRUCTIONS DIR's THINGS BEFORE DOING ANYTHING














Express + TypeScript backend scaffold.

## Structure

- `apps/api/src/app.ts` — Express application setup
- `apps/api/src/server.ts` — runtime entry point
- `apps/api/src/routes` — route definitions
- `apps/api/src/controllers` — request handlers
- `apps/api/src/services` — business logic
- `apps/api/src/middlewares` — reusable middleware
- `apps/api/src/config` — environment and app configuration
- `apps/api/src/utils` — shared helpers
- `libs/connectors/vcs` — shared VCS strategies and types
- `scripts` — maintenance and verification scripts

## TypeScript aliases

- `@libs/*` maps to `libs/*`

## Scripts

- `npm run dev` — start the API in watch mode
- `npm run build` — compile TypeScript to `dist`
- `npm run start` — run the compiled API
- `npm run typecheck` — type-check without emitting
- `npm run test:github-metrics` — build and run the GitHub metrics script

## Setup

1. Copy `.env.example` to `.env`
2. Install dependencies with `npm install`
3. Run `npm run dev`

### Supabase configuration

Set the following variables in `backend/.env` to enable Supabase database connectivity:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

After configuring them, hit `GET /api/v1/health` to verify status under `services.supabase`.

The backend now supports shared imports from `@libs/...` instead of long relative paths.