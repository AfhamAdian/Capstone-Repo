## 1. Maintainability (Code Quality risk)

| Metric | Role | Short note |
|---|---|---|
| Technical debt ratio | **Score** | Primary maintainability signal. Built-in ratio of debt to total dev cost. |
| Technical debt (raw amount) | Context | Raw debt (minutes). Keep for trend derivation + normalization. |
| Maintainability rating (A–E) | Context | Roll-up of debt ratio. Good dashboard headline; redundant with the ratio for scoring. |
| Code smells (count) | Context | Underlying issues that generate the debt. Secondary detail. |
| Duplicated code % | **Score** | Correlated with debt but a distinct enough axis to keep as its own input. |

## 2. Reliability (Code Quality risk)

| Metric | Role | Short note |
|---|---|---|
| Bugs (count) | **Score** | Reliability defect load. |
| Reliability rating (A–E) | Context | Derived from bug count + severity — same signal as bugs; store for the headline. |

## 3. Security (Security risk)

| Metric | Role | Short note |
|---|---|---|
| Vulnerabilities (count) | **Score** | Known security weaknesses. |
| Security rating (A–E) | Context | Derived from vulnerabilities — same signal; store for the headline. |
| Security hotspots (count) | Context | Code needing manual security review. |
| Security hotspots reviewed % | **Score** | Genuinely separate axis — process/review discipline, not code state. |

## 4. Coverage (Code Quality risk)

| Metric | Role | Short note |
|---|---|---|
| Test coverage | **Score** | Overall test safety net. |

## 5. Size (normalizer)

| Metric | Role | Short note |
|---|---|---|
| Lines of code (NCLOC) | **Norm** | Not a quality signal — denominator for per-1k-lines normalization + growth tracking. |

## 6. Overall gate

| Metric | Role | Short note |
|---|---|---|
| Quality Gate status (pass/fail) | Context | Roll-up of everything above. Great dashboard headline; NOT a score input (it's derived from the same metrics). |

---

## 7. New-code metrics (store all — trajectory, not stock)

Distinct axis from the totals: they measure whether the team is *adding* problems right now. Best early-warning / LLM input.

| Metric | Role | Short note |
|---|---|---|
| New bugs | **Score** | Bugs introduced in recent changes. |
| New vulnerabilities | **Score** | Security issues introduced recently. |
| New code smells | Context | Smells added recently. |
| New coverage | **Score** | Coverage of new/changed code — more actionable than overall coverage. |
| New duplicated code % | Context | Duplication introduced recently. |
| New technical debt | **Score** | Debt added in new code — the "are we getting worse?" signal. |

---

## The ~6–7 score inputs (deduplicated)

Only these should drive the risk scores; the rest are context/normalizer:

1. Technical debt ratio
2. Bugs (reliability)
3. Vulnerabilities (security)
4. Test coverage
5. Duplicated code %
6. Security hotspots reviewed %
7. One new-code deterioration signal (e.g. new technical debt / new bugs)
