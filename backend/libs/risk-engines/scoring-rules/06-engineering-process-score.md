# Engineering Process Score

**Changed from prior design:** Commit Message Quality (moved in from
Maintainability) and Stale Ticket Ratio (Jira, consolidated here with
the other staleness metrics) are confirmed present in the current lists.
Structure otherwise unchanged — two sub-scores combined 50/50.

**Implemented** in
`backend/libs/risk-engines/risks/engineering-process/engineering-process.strategy.ts`
— three implementation decisions/gap-fixes noted at the end of this file
(Review Comments Per 100 Lines' missing weight, the Issue Cycle Time/Lead
Time single-signal resolution, and how the Stale Combined slot is
computed).

## Metrics used

### Sub-group A: Review Quality

| Metric | Source |
|---|---|
| MR Merge Time | Version Control |
| Time to First Review | Version Control |
| Review Comments Per MR | Version Control |
| Review Comments Per 100 Lines | Version Control |
| Unresolved Discussion Threads at Merge | Version Control |
| Review Iteration Count | Version Control |
| PR/MR Review Coverage (%) | Version Control |
| Self-Merged MR Rate (%) | Version Control |
| Commit Message Quality | Version Control |
| Long-Lived Branch Count | Version Control |
| Average Pipeline Runs Per MR | CI/CD |

### Sub-group B: Flow / Bottleneck

| Metric | Source |
|---|---|
| Issue Cycle Time (Jira primary: "Issue Cycle Time (Days)" / VC fallback: "Issue Cycle Time") | Jira / Version Control |
| Average / Median / p95 Lead Time (Days) | Jira |
| Blocked Items Count | Jira |
| Blocked Ticket Ratio | Jira |
| Blocked Items Average Age | Jira |
| Blocked Re-entry Count | Jira |
| Overdue Items Count | Jira |
| Stale Issues Count | Version Control |
| Stale MRs Count | Version Control |
| Stale Ticket Ratio | Jira |

**Source preference rule:** where the same signal exists in both Jira
and Version Control (Issue Cycle Time), prefer Jira as system of record;
use the VC value only as fallback when a project has no Jira integration.

## Direction

Lower is better for every metric in both sub-groups except:
PR/MR Review Coverage (%) and Commit Message Quality (higher is better).
Review Comments Per MR/100 Lines is banded (see caveat).

## Normalization

**Lower is better:**
```
sub_score = max(0, 100 - ((value - good) / (bad - good)) * 100)
```

**Higher is better, already 0–100 (Review Coverage %, Commit Message
Quality if scored 0–100):** use directly.

**Review Comments Per MR / Per 100 Lines — banded, not linear:**
```
sub_score = 100 - (abs(value - ideal) / ideal) * 100, clamped [0,100]
```
Too few comments suggests rubber-stamping; too many suggests excessive
rework or nitpicking — score best near a defined healthy midpoint.

**Review Iteration Count, Average Pipeline Runs Per MR:** default to
simple "lower is better" capped-linear as a documented simplification;
some iteration/rerun activity is healthy and this doesn't currently
account for that nuance.

## Weights

### Sub-group A: Review Quality

| Metric | Weight |
|---|---|
| Self-Merged MR Rate | 20% |
| PR/MR Review Coverage | 20% |
| Time to First Review | 15% |
| Unresolved Discussion Threads | 12% |
| MR Merge Time | 10% |
| Review Comments Per MR + Per 100 Lines (banded, averaged) | 8% |
| Review Iteration Count | 5% |
| Long-Lived Branch Count | 5% |
| Commit Message Quality | 3% |
| Avg Pipeline Runs Per MR | 2% |

### Sub-group B: Flow / Bottleneck

| Metric | Weight |
|---|---|
| Blocked Ticket Ratio | 20% |
| Issue Cycle Time / Lead Time (primary source) | 20% |
| Blocked Items Average Age | 15% |
| Stale Issues/MRs/Tickets (combined) | 15% |
| Overdue Items Count | 12% |
| Blocked Re-entry Count | 10% |
| Blocked Items Count | 8% |

## Formula

```
ReviewQuality_score = Σ (sub_score_i * weight_i)      // Sub-group A
FlowBottleneck_score = Σ (sub_score_i * weight_i)     // Sub-group B

final_score = (ReviewQuality_score * 0.5) + (FlowBottleneck_score * 0.5)
```

Start with an even 50/50 split; adjust with real project data if one
sub-score proves more predictive of actual process health than the
other.

## Implementation notes (decisions this doc left ambiguous)

- **Review Comments Per 100 Lines had no assigned weight.** Sub-group A's
  "Metrics used" table lists it alongside Review Comments Per MR, but the
  Weights table only had one row for the pair. Rather than invent a new
  weight (which would need taking share from another metric), both are
  banded individually and **averaged together** into the single 8%
  "Review Comments Per MR + Per 100 Lines" slot — whichever of the two is
  available contributes; if only one is present, it alone fills the slot.
- **"Issue Cycle Time / Lead Time (primary source)" is one resolved value,
  not a blend.** `leadTimeAvgDays` is preferred when present, falling back
  to `issueCycleTimeDays` otherwise (`leadTimeAvgDays ?? issueCycleTimeDays`).
  `leadTimeMedianDays`/`leadTimeP95Days` are accepted as fields but are
  **not scored** — contextual only, matching the single 20% weight row this
  doc actually defines for this concept.
- **"Stale Issues/MRs/Tickets (combined)" averages independently-normalized
  sub-scores.** Stale Issues Count and Stale MRs Count (VCS, raw counts) and
  Stale Ticket Ratio (Jira, a percentage) are each normalized on their own
  lower-is-better scale first, then averaged across whichever are present
  to produce the single 15% "Stale Combined" signal.
