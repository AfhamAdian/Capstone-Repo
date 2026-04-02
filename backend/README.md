# Backend

Express + TypeScript backend scaffold.

## Structure

- `src/app.ts` — Express application setup
- `src/server.ts` — runtime entry point
- `src/routes` — route definitions
- `src/controllers` — request handlers
- `src/services` — business logic
- `src/middlewares` — reusable middleware
- `src/config` — environment and app configuration
- `src/utils` — shared helpers

## Scripts

- `npm run dev` — start in watch mode
- `npm run build` — compile TypeScript to `dist`
- `npm run start` — run the compiled app
- `npm run typecheck` — type-check without emitting

## Setup

1. Copy `.env.example` to `.env`
2. Install dependencies with `npm install`
3. Run `npm run dev`
