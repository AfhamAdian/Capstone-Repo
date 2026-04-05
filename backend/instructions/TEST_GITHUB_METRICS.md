# Testing GitHub Metrics

This guide explains how to run and test the GitHub metrics calculation engine.

## Quick Start

### 1. Generate a GitHub Token

Go to [GitHub Settings → Tokens](https://github.com/settings/tokens) and create a new token with:
- Scope: **`repo`** (full control of private/public repos)
- Optional: **`read:org`** (for organization repos)

**For detailed permissions guide**, see [GITHUB_TOKEN_PERMISSIONS.md](./GITHUB_TOKEN_PERMISSIONS.md)

### 2. Run the Test Script

```bash
# Set environment variables
export GITHUB_TOKEN=ghp_your_token_here
export GITHUB_OWNER=microsoft
export GITHUB_REPO=vscode

# Run the test
npm run test:github-metrics

# OR with tsx directly
npx tsx scripts/test-github-metrics.ts

# OR inline (one command)
GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=torvalds GITHUB_REPO=linux npx tsx scripts/test-github-metrics.ts
```

### 3. View Results

The script outputs:
- ✅ Metrics calculation time
- 📊 All 16 metrics formatted nicely
- 📁 Complete JSON object for programmatic use

## Example Output

```
🔧 Testing GitHub Metrics Calculation
📦 Repository: microsoft/vscode
⏱️  Starting metrics calculation...

✅ Metrics calculated successfully!

⏱️  Total time: 8.45s

📊 METRICS RESULTS:
============================================================

📋 ISSUES:
  • Closed per week: 12
  • Avg cycle time: 5.32 days

💻 CODE QUALITY:
  • Code churn score: 42.15
  • Commit message quality:
    - Issue references: 68.50%
    - Has body: 72.30%
    - Conventional format: 45.20%

🔍 PULL REQUESTS:
  • Review coverage: 95.50%
  • Reviews per PR: 2.10
  • Time to first review: 4.32 hours
  • Stale PRs (>14 days): 3
  • Revert rate: 2.10%
  • Self-merged rate: 15.30%

👥 TEAM & CONTRIBUTORS:
  • Active contributions per week: 87
  • Bus factor: 3.50 contributors to 50%
  • Code ownership concentration: 35.20%
  • Top directories breakdown:
    - src/: 8 authors
    - tests/: 5 authors
    - docs/: 3 authors

🌳 BRANCHES & REPOSITORY:
  • Long-lived branches (>30 days): 2
  • Review network density: 0.65
  • Dependency update lag: N/A (requires external package registry)

============================================================

📁 Full metrics object (JSON):
{
  "provider": "github",
  "owner": "microsoft",
  "repo": "vscode",
  "calculatedAt": "2026-04-02T10:30:45.123Z",
  "metrics": {
    "issuesClosedPerWeek": 12,
    "issueCycleTimeAvgDays": 5.32,
    ...
  }
}
```

## Metrics Explained

| Metric | What It Measures | Good Value |
|--------|-----------------|-----------|
| **Issues Closed Per Week** | Team velocity on issues | 5-20+ per week |
| **Issue Cycle Time** | Time from open to close | 3-7 days |
| **Code Churn** | Files modified frequently by many authors | 30-70 |
| **PR Review Coverage** | % of PRs with reviews | >90% |
| **Reviews Per PR** | Avg reviewers per PR | 1.5-3 |
| **Time to First Review** | Speed of feedback | 2-8 hours |
| **Commit Message Quality** | Code documentation | >80% with references/body |
| **Stale PR Count** | Old unmerged PRs | <5 |
| **Long-Lived Branches** | Aged feature branches | <3 |
| **Bus Factor** | Key person dependency | >3 contributors |
| **Code Ownership Concentration** | Code knowledge distribution | <50% |
| **Active Contributions** | Weekly commit count | Project-dependent |
| **Review Network Density** | Reviewer diversity | 0.4-0.8 |
| **PR Revert Rate** | Buggy PRs | <5% |
| **Self-Merged Rate** | PRs merged by authors | <30% |
| **Dependency Lag** | Outdated dependencies | <30 days |

## Adding NPM Script

To make running easier, add to `package.json`:

```json
{
  "scripts": {
    "test:github-metrics": "tsx scripts/test-github-metrics.ts"
  }
}
```

Then run:
```bash
GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=microsoft GITHUB_REPO=vscode npm run test:github-metrics
```

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `❌ Error: GITHUB_TOKEN environment variable is required` | Missing token | Set `GITHUB_TOKEN=ghp_xxx` |
| `❌ Error: GITHUB_OWNER environment variable is required` | Missing owner | Set `GITHUB_OWNER=microsoft` |
| `❌ Error: GITHUB_REPO environment variable is required` | Missing repo | Set `GITHUB_REPO=vscode` |
| `401 Unauthorized` | Invalid/expired token | Generate new token |
| `404 Not Found` | Bad repo/owner | Verify owner and repo exist |
| `403 Forbidden` | Token lacks permissions | Add `repo` scope to token |
| `Rate limit exceeded` | Too many API calls | Wait 60s, or upgrade account |

## Next Steps

After testing:
1. **GitLab Support** — Implement equivalent metrics for GitLab
2. **API Integration** — Wire metrics into `/api/repos/:id/metrics` endpoint
3. **Database Storage** — Persist metrics in PostgreSQL
4. **Scheduling** — Calculate metrics periodically via background jobs
5. **Dashboard** — Visualize metrics over time

## Files

- 📜 [test-github-metrics.ts](./scripts/test-github-metrics.ts) — Test script
- 📋 [GITHUB_TOKEN_PERMISSIONS.md](./GITHUB_TOKEN_PERMISSIONS.md) — Permissions guide
- 🛠️ [src/utils/vcs/github.strategy.ts](./src/utils/vcs/github.strategy.ts) — Metrics engine
