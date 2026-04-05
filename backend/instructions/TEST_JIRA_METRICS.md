# Testing Jira Metrics

This guide explains how to run and test the Jira metrics calculation engine.

## Quick Start

### 1. Generate a Jira API Token

Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens) and create a new token:
- Label: **"Capstone Jira Metrics"**
- Copy the token immediately (shown only once)

**For detailed permissions guide**, see [JIRA_TOKEN_PERMISSIONS.md](./JIRA_TOKEN_PERMISSIONS.md)

### 2. Find Your Jira Information

**Base URL**: 
- Jira Cloud: `https://your-domain.atlassian.net`
- Look at your Jira URL when logged in

**Project Key**:
- Go to your project
- URL looks like: `https://your-domain.atlassian.net/browse/PROJ-123`
- Project key is `PROJ`

**Board ID** (optional, for sprint metrics):
- Go to your board
- URL looks like: `https://your-domain.atlassian.net/jira/software/projects/PROJ/boards/123`
- Board ID is `123`

### 3. Run the Test Script

```bash
# Set environment variables
export JIRA_TOKEN=your_api_token
export JIRA_EMAIL=your_email@example.com
export JIRA_BASE_URL=https://your-domain.atlassian.net
export JIRA_PROJECT_KEY=PROJ
export JIRA_BOARD_ID=123

# Run the test
npm run test:jira-metrics

# OR with tsx directly
npx tsx scripts/test-jira-metrics.ts

# OR inline (one command)
JIRA_TOKEN=xxx JIRA_EMAIL=user@example.com JIRA_BASE_URL=https://mycompany.atlassian.net JIRA_PROJECT_KEY=PROJ JIRA_BOARD_ID=123 npx tsx scripts/test-jira-metrics.ts
```

### 4. View Results

The script outputs:
- ✅ Metrics calculation time
- 📊 All 15 metrics formatted nicely
- 📁 Complete JSON object for programmatic use

## Example Output

```
🔧 Testing Jira Metrics Calculation
📦 Project: PROJ
🌐 Base URL: https://mycompany.atlassian.net
📊 Board ID: 123
⏱️  Starting metrics calculation...

✅ Metrics calculated successfully!

⏱️  Total time: 12.34s

📊 JIRA METRICS RESULTS:
============================================================

📦 PROJECT INFO:
  • Key: PROJ
  • ID: 10001
  • Name: My Project

🚀 DELIVERY VELOCITY:
  • Sprint completion rate: 85.50%
  • Issue cycle time: 7.20 days
  • Throughput per week: 12 issues
  • Carryover rate: 15.30%
  • Scope creep rate: 8.50%
  • Estimation accuracy: N/A
  • Blocked items: 3 (avg age: 2.50 days)
  • Overdue items: 5

⏱️  LEAD TIME METRICS:
  • Average: 9.80 days
  • Median: 8.50 days
  • 95th percentile: 18.20 days
  • Variance: 12.40
  • Trend across sprints:
    - Sprint 45: 9.20 days
    - Sprint 46: 10.10 days
    - Sprint 47: 9.50 days

🔄 SPRINT SPILLOVER:
  • Spillover ratio: 18.50%
  • Story point spillover: N/A
  • Consecutive spillover count: 2
  • Carryover avg age: 12.30 days

🚧 BLOCKED WORK:
  • Blocked ticket %: 5.20%
  • Avg blocked duration: 3.40 days
  • Max blocked duration: 8.70 days
  • Blocked re-entry count: 1

📈 SCOPE CHURN:
  • Mid-sprint additions: 4
  • Scope churn ratio: 12.50%
  • Priority change count: 7
  • Removed scope ratio: 2.30%

⏳ STALE TICKETS:
  • In-progress avg age: 6.80 days
  • Stale ticket ratio: 22.50%
  • State movement count: 45

============================================================

📁 Full metrics object (JSON):
{
  "generatedAt": "2026-04-03T10:30:45.123Z",
  "project": {
    "key": "PROJ",
    "id": "10001",
    "name": "My Project"
  },
  "metrics": {
    ...
  }
}
```

## Metrics Explained

| Metric | What It Measures | Good Value |
|--------|-----------------|-----------|
| **Sprint Completion Rate** | % of committed work completed | >80% |
| **Issue Cycle Time** | Time from created to closed | 3-10 days |
| **Throughput** | Issues completed per week | Project-dependent |
| **Carryover Rate** | % of work moved to next sprint | <20% |
| **Scope Creep Rate** | % of work added mid-sprint | <15% |
| **Estimation Accuracy** | Estimated vs actual effort | >80% |
| **Blocked Items** | Count and age of blocked work | <5 items, <3 days |
| **Overdue Items** | Past due date count | <5 |
| **Lead Time (Avg)** | Total time to complete | 5-15 days |
| **Lead Time (P95)** | 95th percentile completion time | <30 days |
| **Spillover Ratio** | % of incomplete work | <20% |
| **Blocked Ticket %** | % of tickets blocked | <10% |
| **Scope Churn Ratio** | % of scope changes | <15% |
| **Stale Ticket Ratio** | % of tickets >14 days old | <25% |
| **State Movement Count** | Status changes | Lower is better |

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `❌ Error: JIRA_TOKEN environment variable is required` | Missing token | Set `JIRA_TOKEN=xxx` |
| `❌ Error: JIRA_EMAIL environment variable is required` | Missing email | Set `JIRA_EMAIL=user@example.com` |
| `❌ Error: JIRA_BASE_URL environment variable is required` | Missing URL | Set `JIRA_BASE_URL=https://your-domain.atlassian.net` |
| `❌ Error: JIRA_PROJECT_KEY environment variable is required` | Missing project | Set `JIRA_PROJECT_KEY=PROJ` |
| `401 Unauthorized` | Invalid token or email | Generate new token, verify email |
| `403 Forbidden` | Insufficient permissions | Ask admin for "Browse Projects" permission |
| `404 Not Found` | Bad project key or board ID | Verify project key and board ID in Jira |
| `Rate limit exceeded` | Too many API calls | Wait 60s, or reduce frequency |

## Configuration Options

### Minimum Configuration (No Sprint Metrics)
```bash
JIRA_TOKEN=xxx
JIRA_EMAIL=user@example.com
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_PROJECT_KEY=PROJ
```

This will calculate:
- Issue cycle time
- Throughput
- Blocked items
- Overdue items
- Lead time metrics
- Stale tickets

### Full Configuration (With Sprint Metrics)
```bash
JIRA_TOKEN=xxx
JIRA_EMAIL=user@example.com
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_PROJECT_KEY=PROJ
JIRA_BOARD_ID=123
```

This adds:
- Sprint completion rate
- Carryover rate
- Scope creep rate
- Sprint spillover
- Scope churn

## Next Steps

After testing:
1. **API Integration** — Wire metrics into `/api/projects/:id/metrics` endpoint
2. **Database Storage** — Persist metrics in PostgreSQL
3. **Scheduling** — Calculate metrics periodically via background jobs
4. **Dashboard** — Visualize metrics over time
5. **Alerts** — Notify team when metrics exceed thresholds

## Files

- 📜 [test-jira-metrics.ts](../scripts/test-jira-metrics.ts) — Test script
- 📋 [JIRA_TOKEN_PERMISSIONS.md](./JIRA_TOKEN_PERMISSIONS.md) — Permissions guide
- 🛠️ [libs/connectors/pm/jira.strategy.ts](../libs/connectors/pm/jira.strategy.ts) — Metrics engine
