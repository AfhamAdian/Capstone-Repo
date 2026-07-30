# Risk Engine

This document defines the current six-pillar risk model, metric contracts, strategy behavior, and hard-penalty triggers.

## Engine Design

Pattern used:

- Strategy Pattern with generic metric contracts per risk type.

Implementation shape:

- Each pillar has a separate strategy under `libs/risk-engines/risks/`.
- `RiskEngine.calculateRisk(...)` dispatches by `RiskType`.
- `RiskMetricsByType` enforces compile-time metric correctness per pillar.

Core files:

- `libs/risk-engines/types.ts`
- `libs/risk-engines/risk-calculator.interface.ts`
- `libs/risk-engines/risk-engine.ts`
- `libs/risk-engines/risks/*.risk.ts`

## Public Result Contract

`RiskResult`:

- `type: RiskType`
- `score: number`
- `level: "LOW" | "MEDIUM" | "HIGH"`
- `weights: RiskWeight[]`

`weights` stores each weighted component used for `score` calculation.
Each item includes only `key` and `w`.
The strategy computes score at runtime using `(metricScores[key] * w)`.

## Pillars and Metrics

### 1. Delivery Velocity (`RiskType.DELIVERY`)

Metrics (`DeliveryMetrics`):

- `sprintCompletionRate`
- `issueCycleTimeDays`
- `throughputPerWeek`
- `carryoverRate`
- `scopeCreepRate`
- `estimationAccuracy`
- `consecutiveLowSprintCompletionCount`

Hard penalty:

- If `sprintCompletionRate < 50` and `consecutiveLowSprintCompletionCount >= 2`, score is capped at `40`.

Current scoring implementation (`delivery.risk.ts`):

- `issueCycleTimeScore = max(100 - issueCycleTimeDays * 2, 0)`
- `throughputScore = min((throughputPerWeek / 20) * 100, 100)`
- `carryoverScore = max(100 - carryoverRate, 0)`
- `scopeCreepScore = max(100 - scopeCreepRate, 0)`
- Weighted contributions:
- `sprintCompletionRate * 0.25`
- `issueCycleTimeScore * 0.2`
- `throughputScore * 0.2`
- `carryoverScore * 0.15`
- `scopeCreepScore * 0.1`
- `estimationAccuracy * 0.1`
- Raw score: `min(sum(weighted contributions), 100)`

### 2. Code Quality (`RiskType.CODE_QUALITY`)

Metrics (`CodeQualityMetrics`):

- `codeCoveragePercent`
- `codeCoverageTrendDelta30d`
- `cyclomaticComplexityTrendDelta30d`
- `codeDuplicationPercent`
- `technicalDebtRatioPercent`
- `todoFixmeHackTrendDelta30d`
- `codeChurnRiskPercent`

Hard penalty:

- If `codeCoverageTrendDelta30d <= -10`, score is capped at `40`.

Current scoring implementation (`code-quality.risk.ts`):

- `coverageTrendScore = clamp(100 + codeCoverageTrendDelta30d * 5, 0, 100)`
- `complexityTrendScore = max(100 - max(cyclomaticComplexityTrendDelta30d, 0) * 5, 0)`
- `duplicationScore = max(100 - codeDuplicationPercent, 0)`
- `technicalDebtScore = max(100 - technicalDebtRatioPercent, 0)`
- `todoTrendScore = max(100 - max(todoFixmeHackTrendDelta30d, 0) * 5, 0)`
- `churnScore = max(100 - codeChurnRiskPercent, 0)`
- Weighted contributions:
- `codeCoveragePercent * 0.25`
- `coverageTrendScore * 0.1`
- `complexityTrendScore * 0.15`
- `duplicationScore * 0.15`
- `technicalDebtScore * 0.2`
- `todoTrendScore * 0.05`
- `churnScore * 0.1`
- Raw score: `min(sum(weighted contributions), 100)`

### 3. Engineering Process (`RiskType.ENGINEERING_PROCESS`)

Metrics (`EngineeringProcessMetrics`):

- `prReviewCoveragePercent`
- `selfMergedPrRatePercent`
- `timeToFirstReviewHours`
- `unresolvedThreadsMergedCount`
- `commitMessageQualityPercent`
- `longLivedBranchesCount`
- `stalePrCount`

Hard penalty:

- If `selfMergedPrRatePercent > 20`, score is capped at `30`.

Current scoring implementation (`engineering-process.risk.ts`):

- `selfMergeProcessScore = max(100 - selfMergedPrRatePercent, 0)`
- `firstReviewSpeedScore = max(100 - timeToFirstReviewHours * 2, 0)`
- `unresolvedThreadsScore = max(100 - unresolvedThreadsMergedCount * 10, 0)`
- `branchHygieneScore = max(100 - (longLivedBranchesCount * 4 + stalePrCount * 2), 0)`
- Weighted contributions:
- `prReviewCoveragePercent * 0.25`
- `selfMergeProcessScore * 0.2`
- `firstReviewSpeedScore * 0.15`
- `unresolvedThreadsScore * 0.15`
- `commitMessageQualityPercent * 0.15`
- `branchHygieneScore * 0.1`
- Raw score: `min(sum(weighted contributions), 100)`

### 4. CI/CD Reliability (`RiskType.CICD_RELIABILITY`)

Metrics (`CicdReliabilityMetrics`):

- `pipelineSuccessRatePercent`
- `pipelineDurationTrendDelta30d`
- `deploymentFrequencyPerWeek`
- `deploymentFailureRatePercent`
- `mttrHours`
- `flakyTestCount`

Notes:

- This pillar is based on CI/CD + DORA style signals.
- No hard cap is currently enforced in code for this pillar.

Current scoring implementation (`cicd-reliability.risk.ts`):

- `pipelineDurationScore = max(100 - max(pipelineDurationTrendDelta30d, 0) * 4, 0)`
- `deploymentFrequencyScore = min((deploymentFrequencyPerWeek / 14) * 100, 100)`
- `deploymentFailureScore = max(100 - deploymentFailureRatePercent, 0)`
- `mttrScore = max(100 - mttrHours * 4, 0)`
- `flakyTestScore = max(100 - flakyTestCount * 5, 0)`
- Weighted contributions:
- `pipelineSuccessRatePercent * 0.3`
- `pipelineDurationScore * 0.15`
- `deploymentFrequencyScore * 0.2`
- `deploymentFailureScore * 0.2`
- `mttrScore * 0.1`
- `flakyTestScore * 0.05`
- Raw score: `min(sum(weighted contributions), 100)`

### 5. Team Health (`RiskType.TEAM_HEALTH`)

Metrics (`TeamHealthMetrics`):

- `busFactor`
- `codeOwnershipConcentrationPercent`
- `activeContributionsPerWeek`
- `reviewNetworkDensityPercent`
- `blockedItemsCount`
- `blockedItemsAvgAgeDays`
- `overdueItemsCount`
- `hasBusFactorOneCriticalModule`

Hard penalty:

- If `hasBusFactorOneCriticalModule` is `true`, score is capped at `20`.

Current scoring implementation (`team-health.risk.ts`):

- `busFactorScore = min((busFactor / 5) * 100, 100)`
- `ownershipDistributionScore = max(100 - codeOwnershipConcentrationPercent, 0)`
- `reviewNetworkScore = min(reviewNetworkDensityPercent, 100)`
- `contributionScore = min((activeContributionsPerWeek / 20) * 100, 100)`
- `blockedItemsScore = max(100 - (blockedItemsCount * 2 + blockedItemsAvgAgeDays * 1.5), 0)`
- `overdueItemsScore = max(100 - overdueItemsCount * 3, 0)`
- Weighted contributions:
- `busFactorScore * 0.25`
- `ownershipDistributionScore * 0.2`
- `contributionScore * 0.2`
- `reviewNetworkScore * 0.15`
- `blockedItemsScore * 0.1`
- `overdueItemsScore * 0.1`
- Raw score: `min(sum(weighted contributions), 100)`

### 6. Security & Risk (`RiskType.SECURITY_RISK`)

Metrics (`SecurityRiskMetrics`):

- `openCriticalVulnerabilities`
- `openHighVulnerabilities`
- `dependencyUpdateLagDays`
- `prRevertRatePercent`
- `incidentMttrHours`
- `longLivedUnmergedBranchesCount`

Hard penalty:

- If `openCriticalVulnerabilities > 0`, score is capped at `60`.

Current scoring implementation (`security-risk.risk.ts`):

- `criticalVulnScore = openCriticalVulnerabilities > 0 ? 0 : 100`
- `highVulnScore = max(100 - openHighVulnerabilities * 5, 0)`
- `dependencyLagScore = max(100 - dependencyUpdateLagDays * 2, 0)`
- `revertRateScore = max(100 - prRevertRatePercent, 0)`
- `incidentMttrScore = max(100 - incidentMttrHours * 4, 0)`
- `branchRiskScore = max(100 - longLivedUnmergedBranchesCount * 4, 0)`
- Weighted contributions:
- `criticalVulnScore * 0.3`
- `highVulnScore * 0.15`
- `revertRateScore * 0.2`
- `dependencyLagScore * 0.15`
- `incidentMttrScore * 0.1`
- `branchRiskScore * 0.1`
- Raw score: `min(sum(weighted contributions), 100)`

## Engine Functions

In `libs/risk-engines/risk-engine.ts`:

- `calculateRisk<TType extends RiskType>(type: TType, metrics: RiskMetricsByType[TType]): RiskResult`
- `getLevel(score: number): "LOW" | "MEDIUM" | "HIGH"`
- `saveToDB(result: RiskResult): Promise<void>`

Level thresholds:

- `score >= 70` => `HIGH`
- `score >= 40` => `MEDIUM`
- otherwise => `LOW`

## Persistence

Risk results are saved via:

1. `RiskEngine.saveToDB(result)`
2. `apps/api/src/database/risk-score.ts` (`saveRiskScore`)
3. Supabase insert
