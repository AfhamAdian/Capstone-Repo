# Reliability Score

**Changed from prior design:** Defect Escape Rate is removed. It is not
present in the current pm-metrics.md (the Jira metric list no longer has
a "QA Effectiveness" category). Weights below have been rebuilt without
it. If a prod/QA bug-source field is defined later and this metric is
reintroduced, re-open this file to rebalance.

## Metrics used

| Metric | Source | Role |
|---|---|---|
| Issue Reopen Rate | Version Control | Scored |
| MR Revert Rate | Version Control | Scored |
| Flaky Test Count | CI/CD | Scored |
| Test Failure Rate (%) | CI/CD | Scored |
| Test Coverage (%) | CI/CD | Scored — see caveat below |
| Test Coverage (Overall) | SonarQube | Scored |
| Coverage on New Code | SonarQube | Scored |
| Reliability Rating | SonarQube | Scored |
| Quality Gate Pass Rate | SonarQube | Scored |
| Reliability Remediation Effort (normalized per bug) | SonarQube | Scored |
| Bugs in New Code | SonarQube | Penalty (subtracted) |

## Caveat: CI/CD Test Coverage (%) vs. SonarQube Coverage (Overall)

These are likely the same coverage report ingested by two tools. Before
scoring both, confirm per-project whether they share a source:
- **Same source** → drop CI/CD Test Coverage (%) from the formula, use
  only the two SonarQube coverage metrics.
- **Genuinely different test suites** (e.g., CI/CD covers integration
  tests, SonarQube covers unit tests) → keep both; the weights below
  already budget a small separate slot for it.

## Direction

All "lower is better" except: Test Coverage (%), Test Coverage (Overall),
Coverage on New Code, Quality Gate Pass Rate (higher is better, used
directly if already 0–100). Reliability Rating is graded A–E.

## Normalization

**Rating:**
```
sub_score = 100 - (rating_numeric - 1) * 25
```

**Percentages already 0–100 (both Coverage metrics, Quality Gate Pass
Rate):** use directly, no inversion.

**Lower-is-better (Reopen Rate, Revert Rate, Test Failure Rate, Flaky
Test Count, Remediation Effort per bug):**
```
sub_score = max(0, 100 - ((value - good) / (bad - good)) * 100)
```

## Weights

| Metric | Weight |
|---|---|
| Reliability Rating | 30% |
| Test Failure Rate | 15% |
| Coverage (Overall) | 14% |
| Flaky Test Count | 10% |
| Coverage on New Code | 9% |
| Issue Reopen Rate | 8% |
| MR Revert Rate | 8% |
| Quality Gate Pass Rate | 4% |
| Reliability Remediation Effort (per bug) | 2% |

*(CI/CD Test Coverage (%) intentionally excluded from default weights —
add at ~8–10% only if confirmed as a genuinely separate signal from
SonarQube coverage, taking the difference proportionally from the two
SonarQube coverage weights.)*

## Penalty

```
penalty = min(new_code_bugs * penalty_per_bug, max_penalty)
```
Default: `penalty_per_bug = 2`, `max_penalty = 15`.

## Formula

```
base_score =
    (ReliabilityRating_score * 0.30) +
    (TestFailureRate_score   * 0.15) +
    (CoverageOverall_score   * 0.14) +
    (FlakyTestCount_score    * 0.10) +
    (CoverageNewCode_score   * 0.09) +
    (IssueReopenRate_score   * 0.08) +
    (MRRevertRate_score      * 0.08) +
    (QualityGatePassRate_score * 0.04) +
    (RemediationEffort_score * 0.02)

final_score = clamp(base_score - new_code_bugs_penalty, 0, 100)
```
