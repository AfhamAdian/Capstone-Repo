# SonarQube Code Quality Connector — Reference Documentation

This documents what `backend/libs/connectors/quality/SonarQubeConnector/sonarqube.connector.ts`
actually does today: what it fetches, how each of the 21 metrics is calculated, what's
configurable, and known limitations.

---

## 1. Scope

One class, `SonarQubeConnector`, implements `ICodeQualityConnector` and `IConnector`. Given a
SonarQube/SonarCloud token + `{projectKey, organization?}` + optional `baseUrl` (for self-hosted
instances), `getData()` returns all 21 metrics from
`backend/libs/connectors/quality/sonar-metrics.md` in one call. It does not persist anything or
touch other tools — that's the sync layer's job.

---

## 2. Fetch architecture — tools used

| Tool | Used for |
|---|---|
| Native `fetch` (no SDK) | Every SonarQube API call — `fetchWithAuth()` sends `Authorization: Bearer <token>` and throws on a non-OK response |

**No GraphQL, no REST client library.** The SonarQube/SonarCloud Web API is plain REST, so this
connector just wraps `fetch`.

**Three API calls per `getData()`:**
1. `api/measures/component` — one batched call for 19 metric keys (everything that's a plain
   SonarQube measure).
2. `api/measures/search_history` — `alert_status` (quality gate status) history over a
   configurable lookback window, used to compute Quality Gate Pass Rate.
3. `api/hotspots/search` — unresolved (`TO_REVIEW`) security hotspots, used to compute Hotspot
   Files (Worst Offenders).

Calls 2 and 3 share a generic `fetchAllPages()` helper that walks SonarQube's
`paging: { pageIndex, pageSize, total }` response shape until everything is fetched (page size
fixed at 500 per page — see §6).

**No rate-limit handling.** Unlike the VCS/CI-CD GitHub connectors, this connector doesn't check
or pause for API rate limits before calling — SonarQube/SonarCloud's rate limits are generous
enough for a per-project, on-demand fetch pattern that this hasn't been needed.

---

## 3. Data collected from SonarQube

| Fetch | Source | Scope |
|---|---|---|
| Batched metric values | REST `api/measures/component` | 19 metric keys, one call, project-level |
| Quality gate status history | REST `api/measures/search_history` (`metrics=alert_status`) | Trailing `qualityGatePassRateLookbackDays` (default 90), paginated |
| Unresolved security hotspots | REST `api/hotspots/search` (`status=TO_REVIEW`) | All unresolved hotspots, paginated, grouped by file |

---

## 4. Metrics — how each is calculated

Most metrics here are **direct passthroughs** of a single SonarQube measure — SonarQube computes
the value itself during project analysis; the connector just requests the right metric key and
maps it to a typed field. Only two metrics are computed by the connector from raw data: Hotspot
Files (Worst Offenders) and Quality Gate Pass Rate.

### Maintainability Rating
Passthrough of `sqale_rating` (1=A .. 5=E).

### Code Smells (Total Count)
Passthrough of `code_smells`.

### Code Smells - New Code
Passthrough of `new_code_smells`'s new-code-period value. New-code metrics are reported by
SonarQube under a measure's `period`/`periods[0]` field rather than `value` — `fetchMeasures()`
checks both, since which one is populated depends on the metric.

### Cyclomatic Complexity
Passthrough of `complexity`.

### Cognitive Complexity
Passthrough of `cognitive_complexity`.

### Duplicated Code Percentage
Passthrough of `duplicated_lines_density` (%).

### Duplicated Lines in New Code
Passthrough of `new_duplicated_lines_density`'s new-code-period value (%).

### Hotspot Files (Worst Offenders)
**Connector-computed**, not a SonarQube measure. Fetches every unresolved (`status=TO_REVIEW`)
hotspot via `api/hotspots/search` (paginated through `fetchAllPages()`), groups them by file
(`component`, with the `{projectKey}:` prefix stripped for a clean relative path), counts
hotspots per file, sorts descending, and returns the top `hotspotWorstOffendersLimit` files
(default 5) as `Array<{ file: string; hotspotCount: number }>`.

### Security Rating
Passthrough of `security_rating` (1=A .. 5=E).

### Security Hotspots
Passthrough of `security_hotspots` — SonarQube's own count, which includes **both** reviewed and
unreviewed hotspots. This is a different (larger) number than the "worst offenders" breakdown
above, which only counts unresolved ones — see §7.

### Security Review Rating
Passthrough of `security_review_rating` (1=A .. 5=E) — SonarQube's rollup based on the percentage
of hotspots that have been reviewed.

### Security Remediation Effort
Passthrough of `security_remediation_effort` (minutes) — SonarQube's estimated effort to fix all
open vulnerabilities.

### Reliability Rating
Passthrough of `reliability_rating` (1=A .. 5=E).

### Reliability Remediation Effort
Passthrough of `reliability_remediation_effort` (minutes) — estimated effort to fix all bugs.

### Test Coverage (Overall)
Passthrough of `coverage` (%) — `null` until a coverage report has been uploaded during analysis;
SonarCloud doesn't compute this on its own.

### Coverage on New Code
Passthrough of `new_coverage`'s new-code-period value (%) — same caveat as above.

### Quality Gate Pass Rate
**Connector-computed**, not a single SonarQube measure. Fetches the `alert_status` metric's
history via `api/measures/search_history` over the trailing `qualityGatePassRateLookbackDays`
(default 90 days), paginated, and computes
`(history entries with value === 'OK') / (total entries) × 100`, rounded. `null` if there are zero
history entries in the window (e.g. a brand-new project, or one analyzed less often than the
window implies).

### Vulnerabilities in New Code
Passthrough of `new_vulnerabilities`'s new-code-period value.

### Bugs in New Code
Passthrough of `new_bugs`'s new-code-period value.

### New Technical Debt Added
Passthrough of `new_technical_debt`'s new-code-period value (minutes).

### Lines of Code (Size Normalizer)
Passthrough of `ncloc`. Not a quality signal — used as a denominator for per-line-of-code
normalization elsewhere in scoring.

---

## 5. Configuration (`CodeQualityConnectorOptions`)

Passed via `CreateCodeQualityConnectorInput.options`. Both fields optional; defaults match the
connector's original behavior.

| Option | Default | Affects |
|---|---|---|
| `qualityGatePassRateLookbackDays` | 90 | How far back the `alert_status` history call looks for Quality Gate Pass Rate |
| `hotspotWorstOffendersLimit` | 5 | How many files are returned in Hotspot Files (Worst Offenders) |

**Not configurable** (hardcoded in the file): `PAGE_SIZE = 500`, the page size used by
`fetchAllPages()` for both the history call and the hotspot search. This mirrors the precedent in
the GitHub VCS/CI-CD connectors, where the base REST page size is a plain constant and only
result-shaping knobs (windows, limits) are exposed as options.

---

## 6. `null` vs `0` convention

Same discipline as the VCS and CI/CD connectors: `0` means "SonarQube measured it, and it's
genuinely zero" (e.g. 0 bugs in new code). `null` means "no real number could be established" —
most commonly because SonarQube hasn't computed that measure yet (coverage before a report
upload) or because there's no history to compute from (Quality Gate Pass Rate on a project with
no analyses in the lookback window).

**One exception**: Hotspot Files (Worst Offenders) returns `[]` (empty array), not `null`, when
there are no unresolved hotspots — an empty result is a real, computable answer here, not an
absence of data.

---

## 7. Known limitations

- **Security Hotspots vs. Hotspot Files (Worst Offenders) are not meant to reconcile.**
  `securityHotspots` is SonarQube's own count of all hotspots (reviewed + unreviewed); the
  worst-offenders list only considers unresolved (`TO_REVIEW`) ones, grouped by file. They answer
  different questions — overall hotspot volume vs. "where is the open work right now" — and will
  legitimately disagree in total count.
- **Quality Gate Pass Rate has no minimum-sample-size gate.** If a project has, say, only one
  analysis inside the lookback window, the rate is computed from that single data point (100% or
  0%) rather than returning `null` for being statistically thin.
- **Pagination page size is fixed, not configurable** (`PAGE_SIZE = 500`) — see §5.
- **No rate-limit handling** — see §2. Not an issue at current usage patterns (on-demand,
  per-project fetches), but worth revisiting if this connector is ever called at high frequency
  across many projects.
- **No automated tests** covering the calculation logic. Manual verification is via
  `backend/scripts/test-sonarqube-metrics.ts`, which calls `getData()` against a real
  SonarQube/SonarCloud project and prints the result.
- **Downstream persistence is stale.** `apps/api/database/metrics.ts`'s
  `insertCodeQualityMetrics_impl()` (and the underlying Supabase `codequalitymetrics` table) still
  reference the connector's *previous* field set — 7 fields that no longer exist
  (`technicalDebtRatio`, `technicalDebtMinutes`, `bugs`, `vulnerabilities`,
  `criticalVulnerabilities`, `highVulnerabilities`, `qualityGateStatus`) and none of the 8 new
  ones. This is a known, deliberate gap — fixing it requires a schema migration and is out of
  scope for the connector-only change this doc describes.

---

## 8. Output shape

`getData()` returns a `ConnectorOutput` (the sync layer's shared type):

```ts
{
  tool: 'sonarqube',
  provider: 'sonarqube',
  data: {
    generatedAt: string; // ISO timestamp of this fetch
    project: { projectKey: string; organization: string };
    metrics: { /* all 21 fields described in §4, each number | null except
                  hotspotFilesWorstOffenders (always an array) */ };
  },
  fetchedAt: Date;
}
```

See `backend/libs/connectors/quality/sonarqube-metrics.types.ts` for the exact
`SonarQubeMetricsResponse` type, and `backend/libs/connectors/quality/types.ts` for
`CodeQualityConnectorOptions`.
