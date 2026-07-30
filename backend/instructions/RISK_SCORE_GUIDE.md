# Risk Score Guide

This document explains the current risk pillars we use in the product, what each risk means, which data signals indicate that risk, and how the existing metrics feed the score.

## How to read the score

- Each pillar is scored on a $0$–$100$ scale.
- In the current implementation, a **higher score means healthier / lower risk**.
- A **lower score means more risk** in that pillar.
- The engine also maps scores to levels:
  - $70$–$100$: `HIGH`
  - $40$–$69$: `MEDIUM`
  - $0$–$39$: `LOW`

## Current pillars in scope

For now, the active pillars are:

1. Delivery
2. Code Quality
3. CI/CD Reliability
4. Engineering Process
5. Team Health

## 1) Delivery

### What this risk means
Delivery risk measures how likely the team is to miss sprint goals, deliver slowly, or constantly carry work forward.

### What data indicates risk
- Low sprint completion
- Slow issue cycle time
- Low throughput
- High carryover / spillover
- High scope creep
- Weak estimation accuracy

### Existing metrics used
From Jira / project management data:
- `sprintCompletionRate`
- `issueCycleTimeAvgDays`
- `throughputPerWeek`
- `carryoverRate`
- `scopeCreepRate`
- `estimationAccuracy`

### How the score is calculated
The delivery score is a weighted average of:
- Sprint completion rate
- A normalized issue cycle time score
- Throughput score
- Carryover score
- Scope creep score
- Estimation accuracy

There is also a hard penalty when sprint completion stays below 50% for multiple sprints.

## 2) Code Quality

### What this risk means
Code quality risk measures how likely the codebase is to become hard to maintain, harder to test, and more defect-prone over time.

### What data indicates risk
- Falling test coverage
- Rising cyclomatic complexity
- High duplication
- High technical debt
- Too many TODO / FIXME / hack changes
- High code churn

### Existing metrics used
The risk model expects these signals:
- `codeCoveragePercent`
- `codeCoverageTrendDelta30d`
- `cyclomaticComplexityTrendDelta30d`
- `codeDuplicationPercent`
- `technicalDebtRatioPercent`
- `todoFixmeHackTrendDelta30d`
- `codeChurnRiskPercent`

### Current data status
In the current sync pipeline, code-quality-specific analysis is still limited. We already collect some GitHub signals that can support this pillar later, especially:
- code churn indicators
- commit quality indicators
- branch / review activity as supporting context

At the moment, the dedicated code-quality inputs are mostly not fully populated from a code analysis tool yet.

### How the score is calculated
The score is a weighted mix of coverage, trend, complexity, duplication, debt, TODO churn, and overall churn risk.

## 3) CI/CD Reliability

### What this risk means
CI/CD reliability risk measures how stable the delivery pipeline is and how quickly the team can deploy and recover from failures.

### What data indicates risk
- Frequent pipeline failures
- Slow or worsening pipeline duration
- Low deployment frequency
- High deployment failure rate
- Slow incident recovery
- Flaky tests

### Existing metrics used
The risk engine expects:
- `pipelineSuccessRatePercent`
- `pipelineDurationTrendDelta30d`
- `deploymentFrequencyPerWeek`
- `deploymentFailureRatePercent`
- `mttrHours`
- `flakyTestCount`

### Current data status
This pillar is defined in the risk engine, but the current connector flow does not yet populate these metrics from a CI/CD system such as GitHub Actions, Jenkins, GitLab CI, or another pipeline source.

### How the score is calculated
The score combines pipeline success, pipeline speed trend, deployment frequency, deployment failure rate, MTTR, and flaky test count.

## 4) Engineering Process

### What this risk means
Engineering process risk measures how disciplined the team is around review, merges, branch hygiene, and commit quality.

### What data indicates risk
- Low PR review coverage
- Too many self-merged PRs
- Slow time to first review
- Unresolved review threads merged into main
- Poor commit message quality
- Too many long-lived branches
- Too many stale PRs

### Existing metrics used
From GitHub / version control data:
- `prReviewCoveragePercent`
- `selfMergedPrRatePercent`
- `timeToFirstReviewAvgHours`
- `commitMessageQuality.followingConventionPercent`
- `longLivedBranchesCount`
- `stalePrCount`

### How the score is calculated
The score is a weighted mix of review coverage, self-merge rate, first review speed, unresolved threads, commit message quality, and branch hygiene.

There is also a hard penalty when self-merged PRs exceed 20%.

## 5) Team Health

### What this risk means
Team health risk measures how concentrated knowledge is, how collaborative the team is, and whether work is getting blocked.

### What data indicates risk
- Low bus factor
- Heavy ownership concentration in a few people or directories
- Weak review network
- Low active contribution rate
- Many blocked items
- Old blocked items
- Many overdue items
- A critical module depending on one person only

### Existing metrics used
From GitHub and Jira / project management data:
- `busFactor`
- `codeOwnershipConcentrationPercent`
- `reviewNetworkDensityPercent`
- `activeContributionsPerWeek`
- `blockedItemsCount`
- `blockedItemsAvgAgeDays`
- `overdueItemsCount`
- `hasBusFactorOneCriticalModule`

### How the score is calculated
The score combines bus factor, ownership concentration, contribution rate, review network density, blocked work, and overdue work.

There is a hard penalty when a critical module has a bus factor of one.

## Existing metric sources in the repo

### GitHub / version control
- PR review coverage
- Self-merged PR rate
- Time to first review
- Commit message quality
- Stale PR count
- Long-lived branch count
- Bus factor
- Active contributions per week
- Review network density
- PR revert rate
- Dependency update lag

### Jira / project management
- Sprint completion rate
- Issue cycle time
- Throughput per week
- Carryover rate
- Scope creep rate
- Estimation accuracy
- Blocked item count
- Blocked item age
- Overdue item count
- Lead time trends
- Spillover signals
- Scope churn signals
- Stale ticket signals

## Practical interpretation

- **Delivery risk** tells us whether the team can deliver predictably.
- **Code quality risk** tells us whether the codebase is getting harder to maintain.
- **CI/CD reliability risk** tells us whether delivery automation is stable enough for fast shipping.
- **Engineering process risk** tells us whether PR and merge behavior is healthy.
- **Team health risk** tells us whether knowledge and work are spread across the team or concentrated too narrowly.

## Important note

The current engine uses weighted metrics and some pillars are only partially backed by live data today. That means the score is best treated as a directional signal, not an absolute truth.
