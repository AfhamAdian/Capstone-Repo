# Capstone Project: Metrics & Risk Engines Documentation

This document outlines the data collected from all integrations (connectors) and details the internal mathematical equations used to calculate the 6 Risk Scores across the system.

## 1. Connectors & Data Collection

The platform integrates with four primary tools, normalizing their raw data into structured metric payloads.

### GitHub (Version Control)
* **Code Churn**: Number of files modified $\ge$ 10 times, and files modified by $\ge$ 3 people.
* **Pull Request Activity**: Issues closed per week, PR review coverage (%), self-merged PR rate (%), average reviews per PR.
* **Review Speed**: Average time to first review (hours).
* **Code Quality Hygiene**: Stale PR count, long-lived branch count, PR revert rate (%).
* **Commit Quality**: Percentage of commits with issue references, with bodies, and following conventional commits.
* **Team Distribution**: Bus factor, active contributions per week, review network density, code ownership concentration across directories.
* **Security/Maintenance**: Dependency update lag (average days).

### Jira (Project Management)
* **Sprint Velocity**: Sprint completion rate (%), throughput per week, carryover rate (%), scope creep rate (%), mid-sprint additions.
* **Lead/Cycle Time**: Issue cycle time (days), average/median/p95 lead time (days), blocked items average age.
* **Blockers & Impediments**: Blocked items count, overdue items count, blocked ticket ratio.
* **Spillover**: Spillover ratio (%), consecutive spillover count, stale ticket ratio.

### GitHub Actions (CI/CD)
* **Pipeline Health**: Pipeline success rate (%), average pipeline duration (minutes), average pipeline runs per PR.
* **Test Reliability**: Flaky test count, test coverage (%), test failure rate (%).
* **Deployment Activity**: Deployments per week, deployment failure rate (%), MTTR (hours), time to production (hours).

### SonarQube (Code Quality & Security)
* **Maintainability**: Technical debt ratio (%), technical debt minutes, maintainability rating, code smells, duplicated lines density (%).
* **Reliability**: Bugs count, reliability rating.
* **Security**: Vulnerabilities count, security rating, critical vulnerabilities, high vulnerabilities.
* **Coverage**: Code coverage (%).
* **Size**: Lines of code.
* **Quality Gates**: Pass/fail status and new code metrics (new bugs, new vulnerabilities, etc).

---

## 2. Risk Calculation Engines

The system calculates 6 distinct risk scores. 

Each risk engine computes a final score using a **Weighted Sum** formula:
`Final Score = MIN( ∑ (MetricScore × Weight), 100 )`

*(Note: Most engines use a `renormalizedWeightedScore` algorithm. If a metric is `undefined` (missing data), it is gracefully dropped, and the remaining weights are proportionally renormalized so the sum of the weights remains 1.0 (100%).)*

### 2.1 Code Quality Risk
*Metrics sourced primarily from SonarQube.*

**Weights & Equations:**
* **Code Coverage (25%)**: `Score = codeCoveragePercent`
* **Coverage Trend (10%)**: `Score = MAX(100 + trendDelta * 5, 0)`
* **Complexity Trend (15%)**: `Score = MAX(100 - MAX(complexityTrend, 0) * 5, 0)`
* **Duplication (15%)**: `Score = MAX(100 - codeDuplicationPercent, 0)`
* **Technical Debt (20%)**: `Score = MAX(100 - technicalDebtRatioPercent, 0)`
* **Todo/Fixme Trend (5%)**: `Score = MAX(100 - MAX(todoTrend, 0) * 5, 0)`
* **Code Churn (10%)**: `Score = MAX(100 - codeChurnRiskPercent, 0)`

**Penalties:**
* If `coverageTrendDelta30d` drops by $\le$ -10%, the final score is mathematically capped at a maximum of `40`.

### 2.2 Security Risk
*Metrics sourced from SonarQube, GitHub Actions, and GitHub.*

**Weights & Equations:**
* **Critical Vulnerabilities (30%)**: `Score = (count > 0) ? 0 : 100`
* **High Vulnerabilities (15%)**: `Score = MAX(100 - (count * 5), 0)`
* **PR Revert Rate (20%)**: `Score = MAX(100 - prRevertRatePercent, 0)`
* **Dependency Lag (15%)**: `Score = MAX(100 - (dependencyUpdateLagDays * 2), 0)`
* **Incident MTTR (10%)**: `Score = MAX(100 - (mttrHours * 4), 0)`
* **Branch Risk (10%)**: `Score = MAX(100 - (longLivedBranchesCount * 4), 0)`

**Penalties:**
* If there is $\ge 1$ open Critical Vulnerability, the final score is capped at `60`.

### 2.3 CI/CD Reliability Risk
*Metrics sourced primarily from GitHub Actions.*

**Weights & Equations:**
* **Pipeline Success (15%)**: `Score = MAX(100 - pipelineSuccessRatePercent, 0)`
* **Deployment Failure (15%)**: `Score = MIN(deploymentFailureRatePercent, 100)`
* **Deployment Frequency (15%)**: `Score = MAX(100 - (deploymentsPerWeek * 10), 0)`
* **Flaky Tests (10%)**: `Score = MIN(flakyTestCount * 10, 100)`
* **Test Coverage (10%)**: `Score = MAX(100 - testCoveragePercent, 0)`
* **Test Failure (10%)**: `Score = MIN(testFailureRatePercent * 10, 100)`
* **MTTR (10%)**: `Score = MIN(mttrHours * 5, 100)`
* **Pipeline Duration (5%)**: `Score = MIN((avgPipelineDurationMinutes / 30) * 100, 100)`
* **Pipeline Runs/PR (5%)**: `Score = MIN(avgPipelineRunsPerPr * 10, 100)`
* **Time to Prod (5%)**: `Score = MIN((timeToProdHours / 24) * 100, 100)`

### 2.4 Engineering Process Risk
*Metrics sourced primarily from GitHub.*

**Weights & Equations:**
* **PR Review Coverage (25%)**: `Score = prReviewCoveragePercent`
* **Self-Merge Process (20%)**: `Score = MAX(100 - selfMergedPrRatePercent, 0)`
* **First Review Speed (15%)**: `Score = MAX(100 - (timeToFirstReviewHours * 2), 0)`
* **Unresolved Threads (15%)**: `Score = MAX(100 - (unresolvedThreadsMergedCount * 10), 0)`
* **Commit Message Quality (15%)**: `Score = commitMessageQualityPercent`
* **Branch Hygiene (10%)**: `Score = MAX(100 - (longLivedBranchesCount * 4 + stalePrCount * 2), 0)`

**Penalties & Modifiers:**
* If `selfMergedPrRatePercent` > 20%, the score is capped at `30`.

### 2.5 Delivery Risk
*Metrics sourced primarily from Jira.*

**Weights & Equations:**
* **Sprint Completion Rate (30%)**: `Score = sprintCompletionRate`
* **Issue Cycle Time (20%)**: `Score = MAX(100 - (issueCycleTimeDays * 2), 0)`
* **Throughput (20%)**: `Score = MIN((throughputPerWeek / 20) * 100, 100)`
* **Carryover (15%)**: `Score = MAX(100 - carryoverRate, 0)`
* **Scope Creep (15%)**: `Score = MAX(100 - scopeCreepRate, 0)`

**Penalties & Modifiers:**
* If Sprint Completion Rate < 50% for $\ge 2$ consecutive sprints, the score is capped at `40`.

### 2.6 Team Health Risk
*Metrics sourced primarily from GitHub & Jira.*

**Weights & Equations:**
* **Bus Factor (25%)**: `Score = MIN((busFactor / 5) * 100, 100)`
* **Ownership Distribution (20%)**: `Score = MAX(100 - codeOwnershipConcentrationPercent, 0)`
* **Contribution Activity (20%)**: `Score = MIN((activeContributionsPerWeek / 20) * 100, 100)`
* **Review Network (15%)**: `Score = MIN(reviewNetworkDensityPercent, 100)`
* **Blocked Items (10%)**: `Score = MAX(100 - (blockedItemsCount * 2 + blockedItemsAvgAgeDays * 1.5), 0)`
* **Overdue Items (10%)**: `Score = MAX(100 - (overdueItemsCount * 3), 0)`

**Penalties:**
* If `hasBusFactorOneCriticalModule` is True, the score is strictly capped at `20`.

