# Jira PM Connector — Reference Documentation

This documents what `backend/libs/connectors/pm/JiraConnector/jira.connector.ts` actually does
today: what it fetches, how each of the 19 metrics is calculated, what's configurable, and known
limitations.

---

## 1. Scope

One class, `JiraConnector`, implements `IPmConnector` and `IConnector`. Given a Jira token +
email + `baseUrl` + `projectKey` (+ an optional `boardId`), `getData()` returns all 19 metrics
from `backend/libs/connectors/pm/pm-metrics.md` in one call. `LinearConnector` (the other PM
provider) is an unimplemented placeholder — this doc only covers Jira.

---

## 2. Fetch architecture — tools used

| Tool | Used for |
|---|---|
| Native `fetch` (no SDK) | Every Jira API call — `fetchWithAuth()` sends HTTP Basic auth (`base64(email:token)`), the scheme Jira Cloud's REST API expects for API tokens |

**No GraphQL, no REST client library.** Jira's REST API (`/rest/api/3/...`) and Agile API
(`/rest/agile/1.0/...`) are both plain REST, so this connector just wraps `fetch`.

**Four API calls per `getData()`, run in parallel via `Promise.all`:**
1. `fetchProjectInfo()` → `GET /rest/api/3/project/{projectKey}` — project key/id/name.
2. `fetchIssues()` → paginated `GET /rest/api/3/search/jql`, issues updated in the **last 90
   days**, with `expand=changelog` (needed for priority-change and blocked-re-entry detection).
3. `fetchEpics()` → paginated `GET /rest/api/3/search/jql`, `issuetype = Epic`, **no date
   filter** — see §4 for why this differs from `fetchIssues()`.
4. `fetchSprints()` → paginated `GET /rest/agile/1.0/board/{boardId}/sprint`, filtered to
   `state === 'closed'`, keeping only the **last 10**. Returns `[]` immediately if no `boardId`
   was given, or if the board doesn't support sprints at all (e.g. a Kanban board) — the fetch is
   wrapped in a `try/catch` for that case.

**Rate limiting**: a fixed `RATE_LIMIT_PAUSE_MS` (1 second) pause between pages of any paginated
fetch. Unlike the GitHub connectors, there's no proactive rate-limit-header check before calling —
just a flat pause baked into the pagination loop.

---

## 3. Data collected from Jira

| Fetch | Source | Scope |
|---|---|---|
| Project info | REST `api/3/project/{projectKey}` | — |
| Issues | REST `api/3/search/jql` (paginated) | Updated in the last 90 days, with changelog |
| Epics | REST `api/3/search/jql` (paginated) | All `issuetype = Epic`, unbounded |
| Sprints | REST `agile/1.0/board/{boardId}/sprint` (paginated) | Closed sprints only, last 10 kept |

---

## 4. Metrics — how each is calculated

Most sprint-based metrics use the **last 3 closed sprints** (`sprints.slice(-3)`); the
sprints-survived and lead-time-trend calculations reach further back into the retained history
(up to the last 10 and last 5 closed sprints respectively). All of them rely on
`getIssuesInSprint()` to decide which issues belong to a sprint — see the known limitation in §7,
this is a heuristic, not a ground-truth Jira field.

### Sprint Completion Rate
Over the last 3 closed sprints: `(completed issues) / (total issues in those sprints) × 100`.
`null` if there are no closed sprints at all.

### Throughput Per Week
Count of issues with a `resolutiondate` in the trailing 7 days, from the already-fetched 90-day
issue set. A one-shot snapshot count, not a true rolling weekly series.

### Carryover Rate
Over the last 3 closed sprints, for each adjacent pair: issues incomplete at the end of the
earlier sprint that **also appear in the next sprint** are "carried over". Returns
`(carried-over) / (total issues in the earlier sprints) × 100`. `null` if fewer than 2 sprints.

### Scope Creep Rate
Over the last 3 closed sprints: `(issues created after the sprint's start date) / (total issues
in that sprint) × 100`, averaged across sprints via a running total. `null` if there are no closed
sprints.

### Mid-Sprint Additions
The raw count version of the same "created after sprint start" check — summed (not averaged or
percentaged) across the last 3 closed sprints.

### Spillover Ratio
Over the first 2 of the last 3 closed sprints: `(incomplete issues) / (total issues) × 100`,
accumulated across those sprints. `null` if fewer than 2 sprints.

### Consecutive Spillover Count
A streak counter over that same sprint walk: increments for each sprint (oldest→newest, within
the last-3 window) that had any incomplete issues, resets to 0 the moment a sprint has none.

### Stale Ticket Ratio
Among currently in-progress issues (`statusCategory.key === 'indeterminate'`): percentage whose
"days since last updated" exceeds `STALE_DAYS_THRESHOLD` (14, not currently configurable).

### Carryover Age of Tickets (Sprints Survived)
**Connector-computed, not a simple ratio.** Takes the issues still incomplete as of the *most
recent* closed sprint in the retained history (up to the last 10), then for each, walks backward
through that history counting how many consecutive sprints it continuously appears in (via
`getIssuesInSprint()`) before one doesn't contain it. Averages that streak count across the
population. `null` if fewer than 2 sprints, or nothing is currently carried over.

### Story Point Spillover (Say/Do Ratio)
Same shape as Sprint Completion Rate, but weighted by story points instead of issue count: over
the last 3 closed sprints, `(completed story points) / (committed story points) × 100`. Story
points are read via the configurable `storyPointsFieldKey` option (see §5). `null` if there are
no closed sprints, or the committed-points sum is 0 (nothing to divide by — including the case
where no issue in scope has story points set at all).

### Priority Change Count
Count of changelog entries with `field === 'priority'` whose timestamp falls within a sprint's
window, summed across the last 3 closed sprints' issues.

### Epic Completion Rate
**Connector-computed.** For each fetched epic (see §2/§4), finds its children among the
already-fetched issues via `getEpicKey()` — which checks the team-managed `parent` field first,
falling back to the configurable `epicLinkFieldKey` custom field for company-managed projects.
Epics with zero matched children are skipped. For the rest:
`(done children) / (total children) × 100` per epic, then averaged across all epics that had at
least one child. `null` if there are no epics, or none of them have any children in the fetched
issue set.

### Issue Cycle Time
Average `resolutiondate − created` in days across every resolved issue in the 90-day issue
window (not just the trailing week). `null` if none are resolved.

### Average / Median / p95 Lead Time
Same closed-issue population as Issue Cycle Time. Median and p95 are index-based
(`sortedArray[Math.floor(...)]`), not interpolated. `variance` is also returned (population
variance of lead times) — an extra beyond what `pm-metrics.md` asks for, kept because Lead Time is
returned as one bundled object rather than separate metric fields.

### Lead Time Trend Across Sprints
Also part of the bundled Lead Time object: for the last 5 closed sprints, the average lead time of
that sprint's closed issues.

### Blocked Items Count / Blocked Items Average Age
Issues whose **current** status name contains one of `BLOCKED_STATUS_KEYWORDS`
(`'blocked'`, `'impediment'`, `'waiting'`, case-insensitive substring match — see the known
limitation in §7). Age is days since `updated`.

### Overdue Items Count
Issues with a past `duedate` that aren't `statusCategory: done`, from the 90-day issue window —
an issue overdue but not touched in over 90 days wouldn't be fetched at all, so this can
undercount long-neglected overdue work.

### Blocked Ticket Ratio
`(blocked issues) / (total issues in the 90-day window) × 100`.

### Blocked Re-entry Count
Count of issues whose changelog shows the `status` field transitioning to a blocked-keyword match
**more than once** — i.e. blocked, unblocked, then blocked again.

---

## 5. Configuration (`PmConnectorOptions`)

Passed via `CreatePmConnectorInput.options`. Both fields optional; defaults match Jira's most
common out-of-the-box custom field IDs — but these IDs are **instance-specific**, so a
misconfigured value doesn't error, it silently produces `0`/`null` for the affected metrics (see
§7).

| Option | Default | Affects |
|---|---|---|
| `storyPointsFieldKey` | `'customfield_10016'` | Story Point Spillover (Say/Do Ratio) |
| `epicLinkFieldKey` | `'customfield_10014'` | Epic Completion Rate, for company-managed projects only — team-managed projects use the built-in `parent` field and don't need this |

**Not configurable** (hardcoded module constants): `STALE_DAYS_THRESHOLD` (14),
`BLOCKED_STATUS_KEYWORDS` (the keyword list itself), the sprint-window sizes used throughout
(`.slice(-3)`, `.slice(-5)`, `.slice(-10)`), `PAGE_SIZE` (100), and `RATE_LIMIT_PAUSE_MS` (1000).

---

## 6. `null` vs `0` convention

Same discipline as the other connectors: `0` means "measured, and it's genuinely zero" (e.g. 0
blocked items). `null` means "no real number could be established" — most commonly no closed
sprints yet, no resolved issues in the window, or (for the two custom-field-dependent metrics) no
committed story points / no epic with matched children. Note that several metrics —
`throughputPerWeek`, `blockedItemsCount`, `overdueItemsCount`, `scopeChurn.midSprintAdditions`,
`scopeChurn.priorityChangeCount`, `blockedWork.blockedReentryCount`,
`staleTickets.stateMovementCount` — are plain counts, typed as `number` (never `null`) since a
count of zero is always a valid, measured answer for those.

---

## 7. Known limitations

- **Sprint membership is a date-heuristic, not Jira's actual Sprint field.**
  `getIssuesInSprint()` checks `issue.created <= sprintEnd && issue.updated >= sprintStart` — an
  overlap approximation, not a query against Jira's real Sprint field (itself yet another
  per-instance custom field, commonly `customfield_10020`). Every sprint-based metric in this
  connector inherits this imprecision; logged as a dedicated future-work item.
- **Blocked-status detection is a substring match on the status *name*.** A custom workflow
  status containing one of the keywords for an unrelated reason (e.g. a status literally named
  "Awaiting Deployment", which contains "waiting") would be misclassified as blocked. There's no
  allowlist/exact-match mode.
- **A wrong `storyPointsFieldKey`/`epicLinkFieldKey` fails silently, not loudly.**
  `getStoryPoints()` returns `0` and `getEpicKey()` returns `null` when the configured field isn't
  present or isn't the expected type — so a misconfigured field ID looks identical to "this
  project genuinely has no story points / no epic children," rather than surfacing as an error.
  Worth checking these values directly against the target Jira instance's actual custom field IDs
  before trusting a `null`/`0` result on these two metrics.
- **Epics are fetched without the 90-day bound that issues use, which can undercount an epic's
  children.** `fetchEpics()` intentionally has no recency filter, but its children are matched
  against `fetchIssues()`'s 90-day-windowed result — a child issue that hasn't been touched in
  over 90 days won't be in that set at all, so it won't count toward its epic's completion
  percentage either way (as a "done" or a "total").
- **Sprint-based metrics only ever see closed sprints, never the active/future one.**
  `fetchSprints()` filters to `state === 'closed'` before anything else, so nothing here reflects
  what's happening in the sprint currently in progress.
- **No automated tests** covering the calculation logic. Manual verification is via
  `backend/scripts/test-jira.ts`, which calls `getData()` against a real Jira project and prints
  the result.
- **Downstream persistence is stale.** The Jira insert path in `apps/api/database/metrics.ts`
  still references three fields that no longer exist on this connector's output
  (`carryoverAvgAgeDays`, `avgBlockedDurationDays`, `scopeChurnRatio` — renamed/removed during the
  metrics-completeness update this doc describes) and doesn't insert the 2 new fields
  (`storyPointSayDoRatio`, `epicCompletionRatePercent`). This is a known, deliberate gap — fixing
  it requires a schema/mapping update and is out of scope for the connector-only change.
- **Defect Escape Rate is not implemented** — no consistent prod-vs-QA data source exists in this
  Jira setup yet. Tracked in `future-work.md`, and already removed from `pm-metrics.md`'s target
  list rather than left as a silent gap.

---

## 8. Output shape

`getData()` returns a `ConnectorOutput` (the sync layer's shared type):

```ts
{
  tool: 'jira',
  provider: 'jira',
  data: {
    generatedAt: string; // ISO timestamp of this fetch
    project: { key: string; id: string; name: string };
    metrics: { /* all 19 fields described in §4 — see jira-metrics.types.ts for the exact shape,
                  including the nested leadTime/spillover/blockedWork/scopeChurn/staleTickets objects */ };
  },
  fetchedAt: Date;
}
```

See `backend/libs/connectors/pm/jira-metrics.types.ts` for the exact `JiraMetricsResponse` type,
and `backend/libs/connectors/pm/types.ts` for `PmConnectorOptions`.
