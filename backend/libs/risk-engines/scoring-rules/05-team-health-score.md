# Team Health Score

Status: unchanged from prior design — no metrics in this dimension were
added/removed in the latest fetch lists. Still the thinnest dimension
(4 metrics, all git-derived).

**Implemented** in
`backend/libs/risk-engines/risks/team-health/team-health.strategy.ts`,
matching this doc exactly — no rule deviations. (The prior implementation's
`blockedItemsCount`/`blockedItemsAvgAgeDays`/`overdueItemsCount`/
`hasBusFactorOneCriticalModule` fields, which predated this doc, were
removed — the first three now live in Engineering Process's Flow/Bottleneck
sub-group, and the kill-switch had no real data source and isn't part of
this design.)

## Metrics used

| Metric | Source | Role |
|---|---|---|
| Bus Factor | Version Control | Scored |
| Code Ownership Concentration | Version Control | Scored |
| Review Network Density | Version Control | Scored |
| Active Contributors Per Week | Version Control | Scored |

## Direction

| Metric | Direction |
|---|---|
| Bus Factor | Higher is better |
| Code Ownership Concentration | Lower is better |
| Review Network Density | Higher is better |
| Active Contributors Per Week | Higher is better (weak standalone signal — see note) |

## Normalization

**Bus Factor (scale relative to team size):**
```
sub_score = min(100, (value / target) * 100)
```

**Code Ownership Concentration:**
```
sub_score = max(0, 100 - ((value - good) / (bad - good)) * 100)
```

**Review Network Density (already 0–1 or 0–100):**
```
sub_score = value          // scale to 0-100 if needed
```

**Active Contributors Per Week (relative to expected team size):**
```
sub_score = min(100, (value / expected_team_size) * 100)
```

## Weights

| Metric | Weight |
|---|---|
| Bus Factor | 35% |
| Code Ownership Concentration | 30% |
| Review Network Density | 25% |
| Active Contributors Per Week | 10% |

## Formula

```
final_score = clamp(
    (BusFactor_score              * 0.35) +
    (OwnershipConcentration_score * 0.30) +
    (ReviewNetworkDensity_score   * 0.25) +
    (ActiveContributors_score     * 0.10),
    0, 100
)
```

## Known limitation

Bus Factor and Ownership Concentration are conceptually close and will
often move together — combined they carry 65% of this score. With only
4 inputs, this dimension is less statistically robust than the others;
a single noisy data point can swing it more than in a dimension with
8+ inputs. Document as a limitation. Active Contributors Per Week on its
own can't distinguish healthy growth from high churn — read it alongside
Bus Factor when interpreting the dashboard, not as an independent
positive signal.
