# Risk Engines — Scoring Architecture Reference

This documents **how** `backend/libs/risk-engines/` computes the 7 health scores — the shared
mechanism every score is built from. It does not repeat the specific weights/formulas for each
metric; those live in `backend/libs/risk-engines/scoring-rules/*.md`, one file per score.

---

## 1. Scope

7 health scores (higher is better): Security, Reliability, Maintainability, CI/CD & Deployment
Health, Team Health, Engineering Process, Planning & Execution. One score = one `RiskType` enum
member = one strategy class implementing `RiskCalculator<TMetrics>` = one `risks/<name>/` folder.
`RiskEngine.calculateRisk(type, metrics)` is the single entry point — it dispatches by `type` to
the matching strategy and returns a `RiskResult`.

(`RiskType.BLOCKERS` is an 8th, unrelated legacy member serving a separate survey feature — not
part of this scoring model, untouched by any of this.)

---

## 2. The core algorithm every score is built from

Every strategy follows the same three-step shape:

1. **Build a list of "signals."** Each signal is `{ key, weight, score }`, where `score` is
   either a 0–100 number (via one of the shared normalizers in §3) or `null` if the underlying
   metric wasn't available. Whether a metric is "available" is just `typeof value === "number"` —
   no per-metric special-casing.
2. **Pass the list to `renormalizedWeightedScore()`** (`scoring.ts`). It drops every signal whose
   `score` is `null`, sums the weights of what's left, and computes the weighted average using
   only those — which has the effect of proportionally redistributing a missing signal's weight
   across the rest, with no separate "redistribute" step needed. Returns `null` if nothing was
   present at all.
3. **Fall back to `0` at the top level if the whole score is null**, then return
   `{ score, level, weights }`, where `weights` is the *actual, rescaled* weight each present
   signal ended up with — an audit trail of what really drove the number, not just the
   originally-defined weights.

This one function is what makes every score null-safe: a project missing half its inputs still
gets a real score computed from whatever it does have, rather than crashing or silently producing
a misleading number.

---

## 3. Shared normalizers (`scoring.ts`)

Every score's `.md` rule file describes its formulas in terms of a handful of repeating shapes.
Rather than re-deriving each one per strategy, they're centralized once and imported wherever
needed:

- `clamp` — keeps a value inside 0–100.
- `ratingToScore` — SonarQube-style A–E rating to a score.
- `densityPerKloc` — normalizes a raw count by project size (per 1000 lines of code), so a large
  and a small project aren't compared on raw counts alone.
- `linearBetween` — the generic "a raw value maps linearly between a good and a bad reference
  point" shape, used by most time/percentage/count metrics.
- `higherIsBetterCapped` — a raw value capped at 100 once it reaches some target.
- `bandedAround` — the "closer to an ideal midpoint is better" shape, for metrics where both
  overshooting and undershooting are bad (e.g. review comment density, story point delivery).

Each strategy picks whichever of these its own metrics need. See the relevant
`scoring-rules/*.md` for which shape applies to which metric, and the strategy file itself for
the actual good/bad/target/ideal constants chosen (all commented there as calibration
placeholders, not validated values).

---

## 4. Sub-group scores (Engineering Process, Planning & Execution)

Two of the seven scores are actually two independently-weighted sub-scores combined afterward
(Engineering Process: Review Quality + Flow/Bottleneck, 50/50; Planning & Execution: Sprint
Planning Accuracy + Delivery Throughput & Focus, 65/35). Both sub-scores are computed via the
same `renormalizedWeightedScore()` mechanism from §2, independently. The two results are then
combined using *that same helper again*, one level up — so if an entire sub-group is missing
(e.g. no Jira data at all for a project), the score falls back to just the other sub-group
instead of being artificially halved. The reported `weights` array merges both sub-groups'
individual weights (each rescaled by its sub-group's overall share) with a prefix
(`reviewQuality.*` / `flowBottleneck.*`, or `planningAccuracy.*` / `deliveryFocus.*`), so you can
see exactly which signal, in which sub-group, contributed how much.

---

## 5. Penalty layer (Security, Reliability, Maintainability)

These three scores compute a "base score" via the mechanism in §2, then subtract a capped
penalty for new-code regressions (new vulnerabilities, new bugs, new technical debt/smells),
clamping the result back into 0–100. The other four scores (CI/CD & Deployment Health, Team
Health, Engineering Process, Planning & Execution) have no penalty layer — their `.md` rule
files don't call for one; those metrics already speak to current, ongoing state rather than a
"stock vs. new" pair.

---

## 6. Where each score's inputs come from

None of the connector-to-metric mapping lives inside `risk-engines/` itself — every strategy
just receives an already-assembled `*Metrics` object and doesn't know or care where the values
came from. That assembly step (currently only implemented in
`backend/scripts/test-risk-scores.ts`, for testing — the real DB-backed path,
`apps/api/services/risk-calculation.service.ts`, still targets the old score shapes and is a
separate follow-up; see `future-work.md` item #6) is responsible for:

- **Straight field renames** — most inputs are a 1:1 copy from a connector's output field to a
  `*Metrics` field.
- **Source-preference resolution** — a couple of metrics exist in two places (Issue Cycle Time
  and Throughput Per Week: Jira primary, VCS fallback). Each strategy only ever sees one resolved
  value per field; picking which source wins happens before the strategy is called.
- **Small derivations** — e.g. averaging VCS's per-directory code-ownership list into one
  concentration percentage, or falling back from a missing "commit following convention %" to an
  average of two other commit-quality sub-metrics. These live in the assembly step, not in a
  strategy — the strategy layer only does 0–100 normalization and weighting, not data reshaping.
- **One derivation is done inside a strategy instead, as a deliberate exception:**
  Maintainability's Hotspot Files (Worst Offenders) arrives as an array
  (`{file, hotspotCount}[]`) rather than a scalar, and `MaintainabilityStrategy` sums it
  internally — kept there because collapsing it is genuinely part of "how to score this metric,"
  not "how to source it."

---

## 7. The 7 scores, in one line each

| Score | Shape | Rule file |
|---|---|---|
| Security | Single signal list + penalty | `scoring-rules/01-security-score.md` |
| Reliability | Single signal list + penalty | `scoring-rules/02-reliability-score.md` |
| Maintainability | Single signal list + penalty | `scoring-rules/03-maintainability-score.md` |
| CI/CD & Deployment Health | Single signal list, no penalty | `scoring-rules/04-cicd-deployment-health-score.md` |
| Team Health | Single signal list, no penalty | `scoring-rules/05-team-health-score.md` |
| Engineering Process | Two sub-groups (§4), no penalty | `scoring-rules/06-engineering-process-score.md` |
| Planning & Execution | Two sub-groups (§4), no penalty | `scoring-rules/07-planning-execution-score.md` |

Each `.md` file also documents any deviation between its originally-written rule and what the
strategy actually implements — e.g. two "per-unit" normalizations (Security/Reliability
Remediation Effort) that lost their divisor once SonarQube's total vulnerability/bug counts were
removed from that connector. See each file's "Implementation notes" section for its specific
deviations.

---

## 8. Output shape and the `level` label

```ts
interface RiskResult {
  type: RiskType;
  score: number;                // 0..100, higher is better
  level: "LOW" | "MEDIUM" | "HIGH";
  weights: RiskWeight[];         // the rescaled weights actually applied, see §2
}
```

`level` is a leftover label from the old risk-scoring model (`riskLevel()` in `scoring.ts`:
`>=70 → HIGH`, `>=40 → MEDIUM`, else `LOW`). Since every score is health-oriented now, `HIGH`
means high health/good, not high risk — the thresholds didn't need to change, only their
meaning did, because every new strategy already produces higher-is-better numbers.

---

## 9. Known limitations

- **Most new inputs aren't persisted yet.** Many fields these 7 scores need (new SonarQube/Jira
  fields, several VCS metrics) have no database column in the current schema — see
  `future-work.md` item #6. The scoring math handles this gracefully (§2), so scores still
  compute, just from a reduced signal set until that catches up.
- **Calibration constants are placeholders.** Every `good`/`bad`/`target`/`ideal`/density
  threshold in every strategy file is commented as a starting value, not a validated one — they
  need tuning against real project data.
- **No automated tests.** Verification is manual, via `backend/scripts/test-risk-scores.ts`,
  which runs all 4 connectors against a real project and prints all 7 scores end-to-end.
- **3 files outside `risk-engines/` are currently broken** (`apps/api/database/risk-score.ts`,
  `apps/api/services/risk-calculation.service.ts`, `apps/api/services/survey-trigger.service.ts`)
  — deliberately left that way per the phased rewrite; see `future-work.md` item #6.
