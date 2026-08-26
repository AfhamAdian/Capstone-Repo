# CI/CD & Deployment Health Score

Status: unchanged from prior design. Of the 10 fetched CI/CD metrics,
only 6 belong to this dimension — the other 4 (Flaky Test Count, Test
Failure Rate, Test Coverage) feed Reliability, and Average Pipeline Runs
Per MR feeds Engineering Process. See those files for those metrics.

## Metrics used

| Metric | Source | Role |
|---|---|---|
| Deployment Frequency (DORA) | CI/CD | Scored |
| Deployment Failure Rate (DORA) | CI/CD | Scored |
| Mean Time to Recovery / MTTR (DORA) | CI/CD | Scored |
| Time from Merge to Production (Change Lead Time) | CI/CD | Scored |
| Pipeline Success Rate | CI/CD | Scored |
| Pipeline Duration | CI/CD | Scored — see caveat below |

Quality Gate Status/Pass Rate is intentionally **not** included here —
it lives in Reliability only, to avoid scoring the same signal in two
dimensions.

## Caveat: Pipeline Duration

Not a pure "lower is always better" metric — an unrealistically fast
pipeline may indicate skipped tests, not efficiency. Set `good` to a
realistic floor (e.g. 10 minutes), not 0, so the score doesn't reward
suspiciously instant pipelines.

## Direction

| Metric | Direction |
|---|---|
| Deployment Frequency | Higher is better |
| Pipeline Success Rate | Higher is better |
| Deployment Failure Rate | Lower is better |
| MTTR | Lower is better |
| Change Lead Time | Lower is better |
| Pipeline Duration | Lower is better, floored (see caveat) |

## Normalization

**Higher is better:**
```
sub_score = min(100, (value / target) * 100)
```

**Lower is better:**
```
sub_score = max(0, 100 - ((value - good) / (bad - good)) * 100)
```

Recommended threshold source: DORA's published Elite/High/Medium/Low
performer benchmarks (Google Cloud "Accelerate State of DevOps" report)
for Deployment Frequency, Deployment Failure Rate, MTTR, and Change Lead
Time — use Elite tier boundary as `good`, Low tier boundary as `bad`.

## Weights

| Metric | Weight |
|---|---|
| Deployment Failure Rate | 25% |
| MTTR | 20% |
| Change Lead Time | 20% |
| Deployment Frequency | 15% |
| Pipeline Success Rate | 15% |
| Pipeline Duration | 5% |

## Formula

```
final_score = clamp(
    (DeployFailureRate_score   * 0.25) +
    (MTTR_score                * 0.20) +
    (ChangeLeadTime_score      * 0.20) +
    (DeployFrequency_score     * 0.15) +
    (PipelineSuccessRate_score * 0.15) +
    (PipelineDuration_score    * 0.05),
    0, 100
)
```

No penalty layer — all six metrics are already real-time/operational
signals, not "current state vs. new-code" pairs.
