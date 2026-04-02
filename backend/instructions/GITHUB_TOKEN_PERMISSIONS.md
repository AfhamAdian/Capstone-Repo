# GitHub Token Permissions Required

This document outlines the GitHub Personal Access Token (PAT) permissions needed to calculate all 16 metrics via the GitHub metrics engine.

## Quick Reference: Required Scopes

When creating a GitHub PAT, you need **at minimum**:
- ✅ **`repo`** — Full control of private repositories (recommended for all metrics)
- 🔓 **OR `public_repo`** — Access to public repositories only (limited scope)

## Detailed Permission Mapping

### Permission Requirement by Metric

| Metric | Data Needed | Permission Required |
|--------|-----------|-------------------|
| **Issues Closed Per Week** | List closed issues | `repo` or `public_repo` |
| **Issue Cycle Time** | Issue details (opened/closed dates) | `repo` or `public_repo` |
| **Code Churn** | List commits, file changes | `repo` or `public_repo` |
| **PR Review Coverage** | List PRs with reviews | `repo` or `public_repo` |
| **Reviews Per PR** | PR review data | `repo` or `public_repo` |
| **Time to First Review** | PR review timestamps | `repo` or `public_repo` |
| **Commit Message Quality** | Commit message content | `repo` or `public_repo` |
| **Stale PR Count** | PR metadata, dates | `repo` or `public_repo` |
| **Long-Lived Branches** | Branch creation/update dates | `repo` or `public_repo` |
| **Bus Factor** | Commit authors across files | `repo` or `public_repo` |
| **Code Ownership Concentration** | File commit history | `repo` or `public_repo` |
| **Active Contributions Per Week** | Commit history | `repo` or `public_repo` |
| **Review Network Density** | PR reviewer data | `repo` or `public_repo` |
| **PR Revert Rate** | Commit history for reverts | `repo` or `public_repo` |
| **Self-Merged PR Rate** | PR author vs merger | `repo` or `public_repo` |
| **Dependency Update Lag** | `package.json` content | `repo` or `public_repo` |

## Creating a GitHub Personal Access Token

### Step 1: Navigate to Token Settings
1. Go to https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**

### Step 2: Configure Permissions

**Recommended for Full Access (All Metrics):**

✅ Check these permissions:
- `repo` (Full control of private repositories)
- `read:org` (Read organization data)

This grants:
- `repo` includes all read/write access to code, issues, PRs, commit statuses, hooks, etc.
- `read:org` allows accessing organization-level repository data if needed

**For Public Repositories Only:**

✅ Check these permissions:
- `public_repo` (Access to public repositories)
- `read:org` (optional, for public org data)

### Step 3: Set Expiration & Name
- **Token name**: e.g., "Capstone GitHub Metrics"
- **Expiration**: 30 days, 90 days, 1 year, or no expiration (not recommended)

### Step 4: Generate & Store
1. Click **"Generate token"**
2. **Copy immediately** — GitHub only shows it once
3. Store securely (environment variable, secrets manager, etc.)

## Using the Token in the Test Script

### Option 1: Direct Environment Variable
```bash
export GITHUB_TOKEN=ghp_your_token_here
export GITHUB_OWNER=microsoft
export GITHUB_REPO=vscode

npx tsx scripts/test-github-metrics.ts
```

### Option 2: Inline Command
```bash
GITHUB_TOKEN=ghp_xxx GITHUB_OWNER=torvalds GITHUB_REPO=linux npx tsx scripts/test-github-metrics.ts
```

### Option 3: .env File (if configured)
```bash
# .env
GITHUB_TOKEN=ghp_your_token_here
GITHUB_OWNER=facebook
GITHUB_REPO=react
```

Then run:
```bash
npx tsx scripts/test-github-metrics.ts
```

## Permissions Summary Table

| Scope | Description | Use Case |
|-------|-------------|----------|
| `repo` | Full control of all repos (read/write) | **Recommended** — Full metrics + private repos |
| `public_repo` | Access only to public repos | Public repos only, limited trust |
| `read:org` | Read organization data | Optional, for org-level repos |
| `read:user` | Read user profile | Optional, not needed for metrics |
| `gist` | Manage gists | **Not needed** |
| `delete_repo` | Delete repositories | **Not needed** — Don't grant! |
| `admin:repo_hook` | Manage repo webhooks | **Not needed** |

## Security Best Practices

⚠️ **DO:**
- ✅ Rotate tokens regularly (30-90 day expiration)
- ✅ Use minimal required scopes (`repo` is usually sufficient)
- ✅ Store in environment variables, not in code
- ✅ Never commit tokens to git

⚠️ **DON'T:**
- ❌ Use `repo` scope if only public repos are accessed
- ❌ Share tokens in chat, email, or documentation
- ❌ Use infinite expiration tokens (set 1 year max)
- ❌ Grant `delete_repo` or `admin:*` scopes

## Troubleshooting

### Error: "401 Unauthorized"
- Token is invalid or expired
- **Solution**: Generate a new token and verify it's correct

### Error: "403 Forbidden"
- Token lacks required permissions
- **Solution**: Add `repo` and `read:org` scopes

### Error: "404 Not Found"
- Repository doesn't exist or is inaccessible
- **Solution**: Verify `GITHUB_OWNER` and `GITHUB_REPO` values

### Error: "Rate Limit Exceeded"
- Too many API calls in short time (1000/hour with PAT)
- **Solution**: Wait 60 seconds or reduce API calls

## Testing Permission Scope

To verify your token has the right permissions:

```bash
# Test token validity
curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user

# Check rate limits
curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/rate_limit

# Check scopes granted to token
curl -i -H "Authorization: token YOUR_TOKEN" https://api.github.com/user
# Look for header: X-OAuth-Scopes: repo, read:org
```

## References

- [GitHub Docs: Creating Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [GitHub Docs: Token Scopes](https://docs.github.com/en/developers/apps/building-oauth-apps/scopes-for-oauth-apps)
- [GitHub REST API: Rate Limiting](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)
