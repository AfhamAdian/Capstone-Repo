# Security Score

Status: unchanged from prior design — no metrics in this dimension were
added/removed in the latest fetch lists.

## Metrics used

| Metric | Source | Role |
|---|---|---|
| Security Vulnerability Count (non-SAST slice: dependency + secrets) | GitHub/GitLab | Scored |
| Dependency Update Lag | Version Control | Scored (also feeds Maintainability) |
| Security Rating | SonarQube | Scored |
| Security Hotspots | SonarQube | Scored |
| Security Review Rating | SonarQube | Scored |
| Security Remediation Effort (normalized per vuln) | SonarQube | Scored |
| Vulnerabilities in New Code | SonarQube | Penalty (subtracted) |

## Direction

All metrics are "lower is better" except the two SonarQube ratings, which
are graded A–E (A = best).

## Normalization

**Ratings (Security Rating, Security Review Rating):**
```
sub_score = 100 - (rating_numeric - 1) * 25   // A=100 ... E=0
```

**Counts, normalized by size (Vulnerability Count, Security Hotspots):**
```
density = raw_count / (lines_of_code / 1000)   // per KLOC
sub_score = max(0, 100 - (density / threshold) * 100)
```

**Time-based (Dependency Update Lag, Remediation Effort per vuln):**
```
sub_score = max(0, 100 - ((value - good) / (bad - good)) * 100)
```

## Weights

| Metric | Weight |
|---|---|
| Security Rating | 25% |
| Security Vulnerability Count (non-SAST, per KLOC) | 20% |
| Security Review Rating | 15% |
| Security Hotspots (per KLOC) | 15% |
| Dependency Update Lag | 15% |
| Security Remediation Effort (per vuln) | 10% |

## Penalty

```
penalty = min(new_code_vuln_count * penalty_per_vuln, max_penalty)
```
Default: `penalty_per_vuln = 2`, `max_penalty = 15`.
Optional refinement: weight the penalty by severity using SonarQube's
`criticalVulnerabilities` / `highVulnerabilities` breakdown, so a new
Critical vulnerability penalizes more than a new Minor one.

## Formula

```
base_score =
    (SecurityRating_score      * 0.25) +
    (VulnCountNonSAST_score    * 0.20) +
    (SecurityReviewRating_score* 0.15) +
    (SecurityHotspots_score    * 0.15) +
    (DepUpdateLag_score        * 0.15) +
    (RemediationEffort_score   * 0.10)

final_score = clamp(base_score - new_code_vuln_penalty, 0, 100)
```

## Data availability notes

- **Security Vulnerability Count** returns 404 (not empty) if Dependabot
  isn't enabled on the target repo — catch this explicitly, mark
  "unavailable," don't treat as zero. Redistribute its 20% weight across
  the remaining available metrics proportionally when missing.
- **Dependency Update Lag** feeds both Security and Maintainability —
  compute once, reuse the sub-score in both formulas.
