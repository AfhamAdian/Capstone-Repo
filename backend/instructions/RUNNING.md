# Running the Backend

This backend has been checked and the main API server builds and starts successfully.

## Prerequisites

- Node.js 18+ recommended
- npm
- A GitHub personal access token if you want to run the GitHub metrics script
- A Jira API token if you want to run the Jira metrics script

## Install

From the backend folder:

1. `cd backend`
2. `npm install`

## Run the API in development

```bash
npm run dev
```

This starts the Express API from `apps/api/src/server.ts`.

## Build the project

```bash
npm run build
```

This compiles TypeScript to `dist/` and rewrites path aliases.

## Run the compiled API

```bash
npm start
```

## Run the GitHub metrics script

Set these environment variables first:

- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`

Then run:

```bash
npm run test:github-metrics
```

You can also set the values in `backend/.env`.

## Run the GitHub metrics script

Set these environment variables first:

- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`

Then run:

```bash
npm run test:github-metrics
```

## Run the Jira metrics script

Set these environment variables first:

- `JIRA_TOKEN`
- `JIRA_EMAIL`
- `JIRA_BASE_URL`
- `JIRA_PROJECT_KEY`
- `JIRA_BOARD_ID` (optional, for sprint metrics)

Then run:

```bash
npm run test:jira-metrics
```

You can also set the values in `backend/.env`.

## Example `.env`

```env
NODE_ENV=development
PORT=3000

# GitHub
GITHUB_TOKEN=ghp_xxx
GITHUB_OWNER=microsoft
GITHUB_REPO=vscode

# Jira
JIRA_TOKEN=xxx
JIRA_EMAIL=user@example.com
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_PROJECT_KEY=PROJ
JIRA_BOARD_ID=123
```

## Verified status

The following currently work:

- `npm run typecheck`
- `npm run build`
- `npm start`
- `npm run dev`

## Notes

- Shared imports use the `@libs/*` alias.
- The GitHub metrics implementation is fully functional.
- The Jira metrics implementation is fully functional.
- The GitLab and Linear strategies are scaffolds and do not return real data yet.
- Run commands from the `backend/` folder, not the repository root.
