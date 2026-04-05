# Jira API Token Permissions Required

This document outlines the Jira API token permissions needed to calculate all metrics via the Jira metrics engine.

## Quick Reference: Required Permissions

When creating a Jira API token, you need:
- ✅ **Read access** to projects, issues, and boards
- ✅ **Browse projects** permission
- ✅ **View development tools** (optional, for additional metrics)

## Creating a Jira API Token

### Step 1: Navigate to API Token Settings
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **"Create API token"**

### Step 2: Configure Token
- **Label**: e.g., "Capstone Jira Metrics"
- Click **"Create"**

### Step 3: Copy and Store
1. **Copy immediately** — Atlassian only shows it once
2. Store securely (environment variable, secrets manager, etc.)

## Required Jira Permissions

Your Jira user account needs these permissions:

| Permission | Purpose | Required |
|-----------|---------|----------|
| **Browse Projects** | View project and issue data | ✅ Yes |
| **View Development Tools** | Access sprint and board data | ✅ Yes (for sprint metrics) |
| **Administer Projects** | Full project access | ❌ No (read-only is sufficient) |

## Permission Requirement by Metric

| Metric | Data Needed | Permission Required |
|--------|-----------|-------------------|
| **Sprint Completion Rate** | Sprint data, issue status | Browse Projects, View Dev Tools |
| **Issue Cycle Time** | Issue created/resolved dates | Browse Projects |
| **Throughput** | Closed issues count | Browse Projects |
| **Carryover Rate** | Sprint assignments | Browse Projects, View Dev Tools |
| **Scope Creep Rate** | Issue creation during sprint | Browse Projects, View Dev Tools |
| **Estimation Accuracy** | Story points, time tracking | Browse Projects |
| **Blocked Items** | Issue status, changelog | Browse Projects |
| **Overdue Items** | Due dates, status | Browse Projects |
| **Lead Time Metrics** | Issue timestamps | Browse Projects |
| **Sprint Spillover** | Sprint completion data | Browse Projects, View Dev Tools |
| **Blocked Work** | Status history, changelog | Browse Projects |
| **Scope Churn** | Issue changes during sprint | Browse Projects, View Dev Tools |
| **Stale Tickets** | Status, last updated | Browse Projects |

## Using the Token in the Test Script

### Option 1: Direct Environment Variables
```bash
export JIRA_TOKEN=your_api_token_here
export JIRA_EMAIL=your_email@example.com
export JIRA_BASE_URL=https://your-domain.atlassian.net
export JIRA_PROJECT_KEY=PROJ
export JIRA_BOARD_ID=123

npx tsx scripts/test-jira-metrics.ts
```

### Option 2: Inline Command
```bash
JIRA_TOKEN=xxx JIRA_EMAIL=user@example.com JIRA_BASE_URL=https://mycompany.atlassian.net JIRA_PROJECT_KEY=PROJ JIRA_BOARD_ID=123 npx tsx scripts/test-jira-metrics.ts
```

### Option 3: .env File
```bash
# .env
JIRA_TOKEN=your_api_token_here
JIRA_EMAIL=your_email@example.com
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_PROJECT_KEY=PROJ
JIRA_BOARD_ID=123
```

Then run:
```bash
npx tsx scripts/test-jira-metrics.ts
```

## Finding Your Jira Information

### Base URL
- **Jira Cloud**: `https://your-domain.atlassian.net`
- **Jira Server/Data Center**: `https://jira.your-company.com`

### Project Key
1. Go to your Jira project
2. Look at the URL: `https://your-domain.atlassian.net/browse/PROJ-123`
3. The project key is `PROJ` (before the dash)

### Board ID
1. Go to your board
2. Look at the URL: `https://your-domain.atlassian.net/jira/software/projects/PROJ/boards/123`
3. The board ID is `123` (after `/boards/`)

## Security Best Practices

⚠️ **DO:**
- ✅ Rotate tokens regularly (every 90 days)
- ✅ Use minimal required permissions (read-only)
- ✅ Store in environment variables, not in code
- ✅ Never commit tokens to git
- ✅ Use separate tokens for different applications

⚠️ **DON'T:**
- ❌ Share tokens in chat, email, or documentation
- ❌ Use admin accounts for API access
- ❌ Grant write permissions unless absolutely necessary
- ❌ Use the same token across multiple services

## Troubleshooting

### Error: "401 Unauthorized"
- Token is invalid or expired
- Email doesn't match the token owner
- **Solution**: Generate a new token and verify email is correct

### Error: "403 Forbidden"
- User lacks required permissions
- **Solution**: Ask your Jira admin to grant "Browse Projects" permission

### Error: "404 Not Found"
- Project key doesn't exist or is inaccessible
- Board ID is incorrect
- **Solution**: Verify project key and board ID in Jira UI

### Error: "Rate Limit Exceeded"
- Too many API calls in short time
- **Solution**: Wait 60 seconds or reduce API calls

## Testing Token Permissions

To verify your token has the right permissions:

```bash
# Test token validity
curl -u your_email@example.com:your_api_token \
  https://your-domain.atlassian.net/rest/api/3/myself

# Test project access
curl -u your_email@example.com:your_api_token \
  https://your-domain.atlassian.net/rest/api/3/project/PROJ

# Test board access
curl -u your_email@example.com:your_api_token \
  https://your-domain.atlassian.net/rest/agile/1.0/board/123
```

## References

- [Atlassian: Manage API tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)
- [Jira REST API Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
- [Jira Agile REST API](https://developer.atlassian.com/cloud/jira/software/rest/intro/)
- [Jira Permissions Overview](https://support.atlassian.com/jira-cloud-administration/docs/manage-project-permissions/)
