# Render Docker Deployment (API + Worker + Key Value)

This project runs two processes in production:
- API server (`node --import tsx apps/api/src/server.ts`)
- Worker (`node --import tsx apps/worker/src/worker.ts`)

Deploy them as **two Render services** using the **same Docker image** from `backend/Dockerfile`.

## 1) Create Render Key Value
1. In Render dashboard, create a **Key Value** instance.
2. Copy its **internal connection string**.
3. Use this value as `REDIS_URL` in both API and Worker services.

## 2) Create API service (Web Service)
- Runtime: **Docker**
- Root Directory: `backend`
- Dockerfile Path: `./Dockerfile`
- Start Command override: `node --import tsx apps/api/src/server.ts`

Environment variables:
- `NODE_ENV=production`
- `REDIS_URL=<render-key-value-internal-url>`
- `SUPABASE_URL=<your-supabase-url>`
- `SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>`
- `DATABASE_URL=<your-postgres-url>`
- `GITHUB_TOKEN=<optional-default-github-token>`
- `JIRA_BASE_URL=<optional-default-jira-base-url>`
- `JIRA_TOKEN=<optional-default-jira-token>`

Health check path:
- `/api/v1/health`

## 3) Create Worker service (Background Worker)
- Runtime: **Docker**
- Root Directory: `backend`
- Dockerfile Path: `./Dockerfile`
- Start Command override: `node --import tsx apps/worker/src/worker.ts`

Environment variables:
- Use the same vars as API, especially `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.

## 4) Verify deployment
1. API: call `GET /api/v1` and `GET /api/v1/health`.
2. Worker logs: confirm worker started and connected to Redis.
3. Trigger a sync from API and confirm worker processes the job.

## Notes
- Current repository TypeScript build has existing type errors, so this Docker path runs TS directly with `tsx`.
- Once build errors are fixed, you can switch back to build-based startup (`npm run build` + `npm run start` / `npm run start:worker`).
- Do not run Redis in the API/worker container on Render for production.
- Keep API and worker as separate Render services so they can restart/scale independently.
- Rotate any leaked secrets before deployment.
