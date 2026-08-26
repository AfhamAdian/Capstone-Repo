# Planning and Execution Score

**Changed from prior design:** Sprint Velocity Consistency (VC),
Estimation Accuracy (VC), and the VC versions of Scope Creep Rate /
Milestone Completion Rate are no longer in vcs-metrics.md and have been
removed. Stale Ticket Ratio has moved to Engineering Process (staleness
consolidation). As a result, Sub-group B (Delivery Throughput & Focus)
is now thin — only 2 metrics, down from 4 — and the overall sub-score
split has been adjusted from 60/40 to 65/35 to reflect this. Flag this
as a known limitation, same as Team Health's thinness.

## Metrics used

### Sub-group A: Sprint Planning Accuracy

| Metric | Source |
|---|---|
| Sprint Completion Rate (%) (Jira primary; VC "Milestone/Sprint Completion Rate" no longer available as fallback) | Jira |
| Scope Creep Rate (%) (Jira primary; VC version no longer available as fallback) | Jira |
| Mid-Sprint Additions (Count) | Jira |
| Carryover Rate (%) | Jira |
| Carryover Age of Tickets (Sprints Survived) | Jira |
| Spillover Ratio (%) | Jira |
| Consecutive Spillover Count | Jira |
| Story Point Spillover (Say/Do Ratio) | Jira |
| Priority Change Count | Jira |
| Epic Completion Rate | Jira |

### Sub-group B: Delivery Throughput & Focus

| Metric | Source |
|---|---|
| Throughput Per Week (Issue Count) (Jira primary; VC "Issues Closed Per Week" as fallback) | Jira / Version Control |
| Bug vs Feature Ratio | Version Control |

## Direction

| Metric | Direction |
|---|---|
| Sprint Completion Rate, Epic Completion Rate, Throughput Per Week | Higher is better |
| Scope Creep Rate, Mid-Sprint Additions, Carryover Rate, Carryover Age, Spillover Ratio, Consecutive Spillover Count, Priority Change Count | Lower is better |
| Story Point Spillover (Say/Do Ratio) | Banded around 1.0 |
| Bug vs Feature Ratio | Banded around a target ratio — see caveat |

## Caveats

- **Story Point Spillover** is a ratio around 1.0 (committed = delivered).
  Both over- and under-delivery are suboptimal:
  ```
  sub_score = 100 - (abs(ratio - 1.0) / tolerance) * 100, clamped [0,100]
  ```
- **Bug vs Feature Ratio** measures capacity allocation, not code
  quality. Don't drive this toward 0 — some bug-fixing capacity is
  healthy. Band around a defined target ratio, same formula shape as
  Story Point Spillover.
- **Carryover Age of Tickets** — confirm this is actually measured in
  sprints-survived, not calendar days, before applying thresholds. If
  the underlying implementation returns calendar days, recalibrate
  `good`/`bad` to that unit instead of silently mismatching name and
  scale.

## Normalization

**Higher is better, already 0–100 (Sprint/Epic Completion Rate,
Throughput):**
```
sub_score = value   // or min(100, (value/target)*100) if uncapped
```

**Lower is better:**
```
sub_score = max(0, 100 - ((value - good) / (bad - good)) * 100)
```

## Weights

### Sub-group A: Sprint Planning Accuracy

| Metric | Weight |
|---|---|
| Sprint Completion Rate | 22% |
| Scope Creep Rate | 16% |
| Story Point Spillover (banded) | 16% |
| Carryover Rate | 13% |
| Spillover Ratio | 11% |
| Mid-Sprint Additions | 7% |
| Consecutive Spillover Count | 6% |
| Carryover Age of Tickets | 5% |
| Priority Change Count | 3% |
| Epic Completion Rate | 1% |

### Sub-group B: Delivery Throughput & Focus

| Metric | Weight |
|---|---|
| Throughput Per Week | 65% |
| Bug vs Feature Ratio (banded) | 35% |

## Formula

```
PlanningAccuracy_score = Σ (sub_score_i * weight_i)   // Sub-group A
DeliveryFocus_score = Σ (sub_score_i * weight_i)      // Sub-group B

final_score = (PlanningAccuracy_score * 0.65) + (DeliveryFocus_score * 0.35)
```

Planning Accuracy carries more overall weight (65/35, up from the
previous 60/40) both because it has far more granular signal (10 metrics
vs. 2) and because Sub-group B lost half its metrics in this revision —
revisit this split if Sprint Velocity Consistency or an equivalent
throughput-stability metric is reintroduced later.
