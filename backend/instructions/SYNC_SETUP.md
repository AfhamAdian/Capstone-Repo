# Sync Pipeline MVP - Setup & Testing Guide

This guide walks through setting up and testing the end-to-end sync pipeline with the dummy frontend.

## Prerequisites

- Node.js 18+
- Docker (for Redis)
- PostgreSQL (or Supabase)
- GitHub token with repo access
- (Optional) Jira API token

## Quick Start

### 1. Set up environment variables

Create a `.env` file in the `backend/` directory:

```bash
# Server configuration
PORT=3000
NODE_ENV=development

# Database (for persistence)
DATABASE_URL=postgresql://user:password@localhost:5432/project_health

# Redis (for BullMQ queue)
REDIS_URL=redis://localhost:6379

# GitHub credentials (for testing)
GITHUB_TOKEN=ghp_your_github_token_here
GITHUB_OWNER=torvalds
GITHUB_REPO=linux

# Jira credentials (optional, for MVP testing)
JIRA_BASE_URL=https://your-instance.atlassian.net
JIRA_TOKEN=your_jira_api_token
```

### 2. Start Redis

```bash
# Using Docker
docker run --name redis -d -p 6379:6379 redis:7-alpine

# Or if you have Redis installed locally
redis-server
```

### 3. Install dependencies

```bash
cd backend
npm install
```

### 4. Start the API server

```bash
cd backend
npm run dev
```

The API will be available at `http://localhost:3000/api/v1`

### 5. Start the worker (in a separate terminal)

```bash
cd backend
npx tsx apps/worker/src/worker.ts
```

You should see:
```
Starting sync job worker...
Sync job worker is running
```

### 6. Open the frontend

Open `frontend/index.html` in your browser, or serve it with a simple server:

```bash
# Using Python 3
python -m http.server 8000

# Or using Node
npx http-server frontend
```

Then navigate to `http://localhost:8000` (or whatever port your server uses)

### 7. Test the sync flow

1. Click the **"Start Sync"** button on the dashboard
2. Watch as each tool is synced:
   - `github` - Fetches GitHub metrics from the configured repo
   - `jira` - Fetches Jira metrics (placeholder for now)
3. See real-time progress updates via SSE
4. Once complete, the risk score will be displayed

## API Endpoints

### POST `/api/v1/sync`
Enqueue a new sync job. Returns job ID and SSE stream key.

**Request:**
```json
{
  "projectId": "project-123",
  "tools": ["github", "jira"],
  "sessionId": "user-session-id"
}
```

**Response (202 Accepted):**
```json
{
  "message": "Sync job queued",
  "jobId": "sync_1234567890_abc123",
  "streamKey": "user-session-id",
  "tools": ["github", "jira"]
}
```

### GET `/api/v1/sync/:jobId`
Get the status of a sync job.

**Response:**
```json
{
  "id": "sync_1234567890_abc123",
  "projectId": "project-123",
  "tools": ["github", "jira"],
  "status": "completed",
  "createdAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:35:00Z"
}
```

### GET `/api/v1/progress/:sessionId` (Server-Sent Events)
Open an SSE stream to receive real-time progress updates.

**Progress Event:**
```json
{
  "jobId": "sync_1234567890_abc123",
  "tool": "github",
  "status": "completed",
  "timestamp": "2024-01-15T10:32:15Z"
}
```

**Completion Event:**
```json
{
  "jobId": "sync_1234567890_abc123",
  "status": "success",
  "timestamp": "2024-01-15T10:35:00Z",
  "toolsCompleted": ["github", "jira"],
  "toolsFailed": [],
  "riskScore": 42
}
```

## Architecture Overview

```
┌─ Frontend (HTML/JS)
│  └─ POST /api/v1/sync (enqueue job)
│  └─ GET /api/v1/progress/:sessionId (SSE stream)
│
├─ API Server (Express)
│  ├─ POST /sync endpoint
│  ├─ Progress SSE endpoint
│  └─ Enqueues jobs to BullMQ
│
├─ Redis/BullMQ
│  └─ Job queue coordination
│
├─ Worker Process
│  ├─ Consumes jobs from queue
│  ├─ Executes connectors (GitHub, Jira)
│  ├─ Stores normalized data in DB
│  ├─ Calculates risk scores
│  └─ Emits progress events via event store
│
└─ PostgreSQL Database
   ├─ Projects & integrations
   ├─ Sync history
   ├─ Connector outputs
   └─ Risk scores
```

## Testing the Worker

To test the worker directly without the frontend:

```bash
# 1. Start Redis and the worker
docker run --name redis -d -p 6379:6379 redis:7-alpine
npx tsx apps/worker/src/worker.ts

# 2. In another terminal, enqueue a job
curl -X POST http://localhost:3000/api/v1/sync \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "project-123",
    "tools": ["github"],
    "sessionId": "test-session"
  }'

# 3. Watch the worker logs for progress
```

## Debugging

### Check if Redis is running
```bash
redis-cli ping
# Should respond with PONG
```

### Check job status in Redis
```bash
redis-cli
> KEYS sync:*  # List all sync jobs
> HGETALL sync:job-id  # Inspect a specific job
```

### Enable debug logging
Set environment variable in your terminal:
```bash
DEBUG=sync:* npm run dev
```

### Check API is responding
```bash
curl http://localhost:3000/api/v1/health
```

## Next Steps

1. **Implement database persistence** - Handle the TODO markers in sync service and worker
2. **Implement risk scoring** - Create the risk calculation engine
3. **Add authentication** - Secure the endpoints with proper auth
4. **Implement project integrations** - Store and manage GitHub/Jira credentials per project
5. **Add more connectors** - GitLab, Jenkins, SonarQube, etc.
6. **Build the dashboard** - Create a proper React/Vue frontend with data visualization
7. **Add scheduled syncs** - Use node-cron or similar to sync every 6 hours

## Troubleshooting

**Issue: "REDIS_URL is required"**
- Make sure Redis is running and `REDIS_URL` is set in `.env`

**Issue: Worker not processing jobs**
- Check that both the API and worker are running
- Verify Redis is accessible from both processes
- Check the worker logs for errors

**Issue: SSE events not received**
- Verify the `sessionId` matches between the POST request and SSE subscription
- Check browser console for connection errors
- Ensure CORS is properly configured if frontend is on different domain

**Issue: Connector fails with authentication error**
- Verify your GitHub token has `repo` scope
- Check that credentials are properly set in the integration
- Review connector logs for detailed error messages

## Common Git Workflows

After making changes to the backend code:

```bash
# Build the TypeScript
npm run build

# Test the build
node dist/apps/api/src/server.js

# Format and lint
npm run typecheck
```
