# Maintainability Score

Status: unchanged from prior design — no metrics in this dimension were
added/removed in the latest fetch lists.

## Metrics used

| Metric | Source | Role |
|---|---|---|
| Maintainability Rating | SonarQube | Scored |
| Code Smells (Total Count) | SonarQube | Scored |
| Cyclomatic Complexity | SonarQube | Scored |
| Cognitive Complexity | SonarQube | Scored |
| Duplicated Code Percentage | SonarQube | Scored |
| Duplicated Lines in New Code | SonarQube | Scored |
| Hotspot Files (Worst Offenders) | SonarQube | Scored |
| Code Churn - High Frequency Files | Version Control | Scored |
| Dependency Update Lag | Version Control | Scored (shared with Security) |
| New Technical Debt Added | SonarQube | Penalty (subtracted) |
| Code Smells - New Code | SonarQube | Penalty (subtracted) |
| Lines of Code | SonarQube | Size normalizer only, not scored |

Note: **Commit Message Quality** has been moved out of this dimension
into Engineering Process (it measures communication discipline, not code
maintainability) — see the Engineering Process file.

## Direction

Every scored metric here is "lower is better" — there is no natural
ceiling reference in this dimension (unlike Reliability's coverage
metrics), so threshold accuracy matters more here than elsewhere.

## Normalization

**Rating:**
```
sub_score = 100 - (rating_numeric - 1) * 25
```

**Counts, normalized by size (Code Smells, Hotspot Files, Code Churn):**
```
density = raw_count / (lines_of_code / 1000)
sub_score = max(0, 100 - (density / threshold) * 100)
```

**Percentages / continuous values (Complexity, Duplication, Dependency
Update Lag):**
```
sub_score = max(0, 100 - ((value - good) / (bad - good)) * 100)
```

## Weights

| Sub-group | Metric | Weight |
|---|---|---|
| Composite debt | Maintainability Rating | 30% |
| Code smells | Code Smells (Total, per KLOC) | 15% |
| Complexity | Cyclomatic Complexity | 10% |
| Complexity | Cognitive Complexity | 10% |
| Duplication | Duplicated Code % | 10% |
| Duplication | Duplicated Lines New Code | 5% |
| Change-risk | Code Churn (high-freq files, per KLOC) | 8% |
| Change-risk | Hotspot Files (per KLOC) | 7% |
| Change-risk | Dependency Update Lag | 5% |

## Penalty

```
penalty = min(
    (new_debt_penalty_weight * new_debt_amount) +
    (new_smells_penalty_weight * new_smells_count),
    max_penalty
)
```
Calibrate `new_debt_penalty_weight`, `new_smells_penalty_weight`, and
`max_penalty` (e.g. 15) against real project data.

## Formula

```
base_score =
    (MaintainabilityRating_score * 0.30) +
    (CodeSmells_score            * 0.15) +
    (CyclomaticComplexity_score  * 0.10) +
    (CognitiveComplexity_score   * 0.10) +
    (DuplicatedCode_score        * 0.10) +
    (DuplicatedLinesNewCode_score* 0.05) +
    (CodeChurn_score             * 0.08) +
    (HotspotFiles_score          * 0.07) +
    (DepUpdateLag_score          * 0.05)

final_score = clamp(base_score - new_debt_penalty, 0, 100)
```

## Data availability notes

- **Dependency Update Lag** feeds both Security and Maintainability —
  compute once, reuse the sub-score in both formulas, don't fetch/compute
  twice.
- **Lines of Code** is required by this formula for the per-KLOC
  normalization steps — it is not itself scored.
