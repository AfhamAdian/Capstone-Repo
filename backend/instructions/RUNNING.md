# Running the Backend

This backend has been checked and the main API server builds and starts successfully.

## Prerequisites

- Node.js 18+ recommended
- npm
- A GitHub personal access token if you want to run the metrics script

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

## Example `.env`

```env
NODE_ENV=development
PORT=3000
GITHUB_TOKEN=ghp_xxx
GITHUB_OWNER=microsoft
GITHUB_REPO=vscode
```

## Verified status

The following currently work:

- `npm run typecheck`
- `npm run build`
- `npm start`
- `npm run dev`

## Notes

- Shared imports use the `@libs/*` alias.
- The GitHub metrics implementation is wired up.
- The GitLab strategy is still a scaffold and does not return real data yet.
- Run commands from the `backend/` folder, not the repository root.
