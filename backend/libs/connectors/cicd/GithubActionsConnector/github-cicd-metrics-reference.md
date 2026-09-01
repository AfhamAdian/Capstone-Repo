# GitHub Actions CI/CD Connector — Reference Documentation

This documents what `github-actions.connector.ts` actually does today: what it fetches, how each
of the 10 metrics is calculated, what's configurable, and known limitations. Written from the
current code, not from the original plan (`cicd-implementation-plan.md`), which may drift out of
sync as this evolves further.

---

## 1. Scope

One class, `GithubActionsConnector`, implements `IConnector` directly (no CI/CD-specific
sub-interface exists yet, unlike the VCS module's `IVcsConnector<T>`). Given a GitHub token +
`{owner, repo}`, `getData()` returns all 10 metrics from `cicd-metrics.md` in one call.

---

## 2. Fetch architecture — tools used

| Tool | Used for |
|---|---|
| `@octokit/rest` (REST methods) | Workflow runs, deployments, deployment statuses, merged pull requests, default branch, commit-ancestry checks, artifact listing/download |
| `adm-zip` | Reading the ZIP archive GitHub returns for a downloaded workflow artifact, in memory |
| `fast-xml-parser` | Parsing JUnit XML (test results) and Cobertura XML (coverage) |

**No GraphQL here**, unlike the VCS connector. GitHub's GraphQL API has no first-class objects
for Actions workflow runs (no `run_attempt`, no run-level duration, no `pull_requests` linkage),
so this connector is REST-only for GitHub data, plus two new local capabilities (zip reading, XML
parsing) that didn't exist anywhere else in this codebase before this connector needed them.

**Rate limiting**: same as the VCS connector — the shared throttled client in
`libs/utils/github-octokit.ts` (`@octokit/plugin-throttling` + `@octokit/plugin-retry`),
cached per token so both connectors stay inside one budget when they run concurrently. The old
per-call `octokit.rateLimit.get()` preflight is gone.

---

## 3. Data collected from GitHub

| Fetch | Source | Scope |
|---|---|---|
| Workflow runs | REST `actions.listWorkflowRunsForRepo` | All runs, unbounded, paginated — every branch/trigger, filtered per-metric afterward |
| Deployments | REST `repos.listDeployments` | Filtered to `deploymentEnvironment` (default `'production'`), unbounded fetch, windowed per-metric afterward |
| Deployment statuses | REST `repos.listDeploymentStatuses` | Per deployment, only for deployments inside the configured window |
| Default branch | REST `repos.get` | — |
| Merged pull requests | REST `pulls.list` | `state: closed`, `base: <default branch>`, filtered client-side to `merged_at != null` |
| Commit ancestry check | REST `repos.compareCommitsWithBasehead` | Per (merge commit, deployment SHA) candidate pair, capped at 5 candidates per deployment |
| Workflow run artifacts | REST `actions.listWorkflowRunArtifacts` | Per sampled run (see §4), filtered to non-expired artifacts matching a configurable name pattern |
| Artifact content | REST `actions.downloadArtifact` → unzipped with `adm-zip` | Per matching artifact, only for the most recent `TEST_ARTIFACT_SAMPLE_SIZE` (20) completed runs |

**Only one pull-request-related fetch exists** (`fetchMergedPullRequests`), used solely by Time to
Prod — pipeline metrics don't need PR data since GitHub's workflow-run objects already carry
`pull_requests` linkage directly.

---

## 4. Artifact parsing — the new capability this connector needed

Test Failure Rate and Test Coverage both require reading files a workflow *uploaded as an
artifact* — GitHub's API has no field that just reports "37 of 40 tests passed" or "82%
coverage." Unlike VCS's package registries (npm/PyPI/Maven Central — one schema each, works for
any project in that ecosystem), there's no universal report format or artifact-naming convention
across CI setups, so this is inherently best-effort.

**Shared foundation** (used by both metrics):
- `fetchWorkflowRunArtifacts(runId)` — lists a run's artifacts.
- `downloadArtifactZip(artifactId)` — downloads and returns the archive as a `Buffer`.
- `fetchArtifactEntries(runId, namePattern)` — lists artifacts matching `namePattern`
  (case-insensitive, configurable), downloads and unzips each non-expired match, and returns the
  text content of **every** file found across **all** matching artifacts — not just the first
  one. This matters for matrix builds (multiple OS/version jobs) or monorepos that produce several
  separate report files for the same run; all of them get combined rather than only the first
  found.
- **Sampling**: only the 20 most recent *completed* runs (`TEST_ARTIFACT_SAMPLE_SIZE`, any
  branch) are ever considered for artifact-based metrics — downloading/unzipping every run in a
  repo's history would be prohibitively expensive. `sampleRecentCompletedRuns()` is the shared
  helper.
- **Memoization**: `fetchJUnitTestCasesForRun()` caches its parsed result per run ID
  (`junitCasesCache`) for the lifetime of the connector instance, since Test Failure Rate and
  Flaky Test Count both examine the same sampled runs and would otherwise download and parse the
  same JUnit artifact twice.

**Format support:**
- Test results: **JUnit XML** only. Parsed into individual `{name, status}` test cases (not just
  aggregate counts), handling both a bare `<testsuite>` root and a `<testsuites>` wrapper with
  several suites, and combining multiple JUnit files per run (matrix builds) into one flat list.
- Coverage: **lcov** (`LF:`/`LH:` line totals, matched by `.info` extension or a filename
  containing `lcov`), **Cobertura XML** (`lines-valid`/`lines-covered` attributes, falling back to
  `line-rate` if a generator omits the counts), and **Istanbul/nyc JSON summary**
  (`total.lines.{total,covered}`). Format is inferred per-file from its filename/extension, not
  from the artifact's name — one matching artifact can contain any of these.

**A repo using an unrecognized format, a custom report name, or not uploading a report artifact
at all gets `null`** for the corresponding metric — not a wrong number, genuinely no answer.

---

## 5. Metrics — how each is calculated

### Deployment Frequency (DORA)
Deployments to `deploymentEnvironment` within the trailing `deploymentWindowDays` (default 30),
converted to a per-week rate. `null` if there's no deployment history at all for that environment
(can't tell "genuinely no deploys" from "this repo doesn't use this feature"); a real `0` is
still reported if there *is* history but none fall in the current window.

### Deployment Failure Rate (DORA)
For every deployment in the window, fetches its statuses and takes the one with the latest
`created_at` (not assumed list order) as that deployment's outcome; `failure`/`error` counts as a
failed deployment. `null` if there's no deployment history, or if none of the in-window
deployments could actually be evaluated (no status data returned).

### MTTR (DORA)
Restricted to **default-branch** runs within `mttrLookbackDays` (default 90). Groups completed
runs by `workflow_id`, sorts each group chronologically, and walks each group tracking the start
of a failure streak (first `failure`/`timed_out`, ignoring repeats) through to the next `success`
— the gap between those two is one recovery event, averaged in hours across all such events found
across all workflows. Grouping by workflow (not adjacency in the overall timeline) avoids missing
a same-workflow recovery pair when a different workflow's run happens to land between them.
`null` if no recovery event was observed (whether that means zero incidents or zero data).

### Pipeline Success Rate
Restricted to **default-branch**, completed runs: `(success) / (success + failure + timed_out) × 100`.
`null` if there's no evaluable default-branch run data — not `100`, since "no data" isn't the
same claim as "always succeeded."

### Pipeline Duration
Restricted to **default-branch**, completed runs with both `run_started_at` and `updated_at`
present: average of `updated_at − run_started_at` in minutes. `null` if there's nothing to
average (this is a proxy for duration — GitHub has a more precise timing endpoint that isn't used
here).

### Flaky Test Count
Real per-test detection: groups the 20 most recently sampled completed runs by `head_sha`
(identical commit). Within any commit that has 2+ runs, extracts per-test outcomes from JUnit
artifacts and flags a test as flaky if it shows **both** a pass and a fail across those runs of
the same code — the literal definition (inconsistent result, no code change). Falls back to the
old proxy (count of runs where `run_attempt > 1` and the run ultimately succeeded) only when no
same-commit comparison was possible anywhere in the sample (no JUnit data found, or every sampled
commit only ran once). `null` only when there's no run history at all; a real `0` is kept when
there is run data but nothing flaky was found (via either path).

### Time from Merge to Production (Change Lead Time)
For each deployment in the window, finds the most recently-merged PR (into the default branch)
merged before that deployment, then **verifies** — via `compareCommitsWithBasehead`'s ancestry
check, not just timestamp proximity — that the merge commit is actually reachable from the
deployment's SHA. Checks at most 5 merge candidates per deployment before giving up on that one
(the most-recent-eligible merge is almost always correct, so this is rarely more than one check in
practice). Averages the verified lead times in hours. `null` if there are no deployments in the
window, no merged PRs at all, or no deployment could be matched to a verified merge.

### Average Pipeline Runs Per MR
Groups all workflow runs by PR number (via each run's own `pull_requests` linkage — no separate
PR-triggered-runs fetch needed), and averages run count per PR. `null` if no run has any PR
linkage at all (e.g. a repo that pushes directly to branches without using PRs) — an average over
zero PRs isn't a measured zero.

### Test Failure Rate (%)
Across the 20 most recently sampled completed runs: for each run, fetches and parses **all**
matching JUnit XML files (aggregated across matrix jobs), derives per-test pass/fail/skip,
excludes skipped tests from both sides of the ratio, and sums `(failed) / (executed)` across all
sampled runs that yielded any test data. `null` if no sampled run produced any parseable JUnit
data.

### Test Coverage (%)
Unlike Test Failure Rate, this does **not** aggregate across the sampled runs — coverage
describes the codebase at one commit, and averaging across several different commits/runs isn't
meaningful the way summing test outcomes is. Returns the coverage from the **most recent** sampled
run whose coverage report(s) could be parsed (summing multiple coverage files *within* that one
run, e.g. per-package reports, into a single percentage). `null` if none of the sampled runs
yielded a parseable coverage report.

---

## 6. Configuration (`GithubActionsConnectorOptions`)

Passed via `CreateGithubActionsConnectorInput.options`. All fields optional; defaults match the
connector's original behavior where applicable.

| Option | Default | Affects |
|---|---|---|
| `deploymentEnvironment` | `'production'` | Which GitHub Environment counts as a production deployment |
| `deploymentWindowDays` | 30 | Deployment Frequency, Deployment Failure Rate, and Time to Prod's lookback window |
| `mttrLookbackDays` | 90 | How far back MTTR looks for failure→success recovery pairs |
| `testReportArtifactPattern` | `'junit\|test-results\|test-report'` | Artifact-name regex tried for Test Failure Rate / Flaky Test Count's JUnit lookup |
| `coverageArtifactPattern` | `'coverage'` | Artifact-name regex tried for Test Coverage's lookup |

**Not configurable** (still hardcoded): default-branch scoping for Pipeline Success Rate/Duration/
MTTR (a settled correctness decision, not a preference), the 20-run artifact-sampling size
(`TEST_ARTIFACT_SAMPLE_SIZE`), and the 5-candidate cap per deployment for Time to Prod
(`MAX_MERGE_CANDIDATES_PER_DEPLOYMENT`).

---

## 7. `null` vs `0` convention

Same discipline as the VCS connector: `0` means "measured, and it's genuinely zero." `null` means
"couldn't establish a real number" — no underlying data, or the relevant feature/artifact isn't
present. Every metric in this connector follows this; see §5 for the specific null conditions per
metric. The two cases worth calling out specifically:
- **Deployment Frequency** distinguishes "no deployment history at all" (`null`) from "history
  exists, none recently" (`0`) — these are different facts and the connector no longer conflates
  them.
- **Flaky Test Count** distinguishes "no run history" (`null`) from "runs exist, none flaky by
  either detection method" (`0`).

---

## 8. Known limitations

- **Artifact-dependent metrics only work if the repo's CI uploads a recognized report.** Test
  Failure Rate and Flaky Test Count's real detection need a parseable JUnit XML artifact; Test
  Coverage needs lcov, Cobertura XML, or an Istanbul/nyc JSON summary. A different test
  runner/format, a custom artifact name outside the configured pattern, or no uploaded report at
  all all result in `null`, not a wrong number.
- **Flaky Test Count's real detection needs same-commit reruns in the sample.** If no commit in
  the 20-run sample was run more than once, there's nothing to compare and the metric falls back
  to the old run-level "retried then succeeded" proxy — which conflates a genuinely flaky test
  with any other reason a run got retried (infra blip, manual re-run).
- **Artifact-based metrics only sample the 20 most recent completed runs**, not full history —
  a deliberate cost/completeness tradeoff (downloading/unzipping every historical run would be
  prohibitively expensive).
- **Pipeline Duration is a proxy** (`updated_at − run_started_at`), not GitHub's dedicated timing
  endpoint — simpler, but can be thrown off by any late metadata update to a run.
- **Time to Prod's candidate cap** (5 merges checked per deployment) means a deployment could
  rarely go unmatched if more than 5 eligible merges land between it and the true included merge
  — an accepted bound on API-call cost, not expected to matter in practice since deploys and
  merges are usually close to in-order.
- **No GitLab/other CI/CD equivalent** exists yet — this connector is GitHub Actions-specific, and
  there's no shared `ICicdConnector<T>` interface layer the way VCS has `IVcsConnector<T>`.
- **Persistence layer not verified for full nullability.** `apps/api/database/metrics.ts`'s
  `insertCicdMetrics()` already maps all 10 metric fields by name, but whether the corresponding
  `cicdmetrics` database columns are nullable (7 of the 10 fields can now be `null` where they
  previously were always a number) hasn't been checked — worth confirming before relying on this
  in production.

---

## 9. Output shape

`getData()` returns a `ConnectorOutput` (the sync layer's shared type — this connector doesn't
have its own typed variant the way `GitHubConnector` has `VcsConnectorOutput<T>`):

```ts
{
  tool: 'github-actions',
  provider: 'github',
  data: {
    generatedAt: string; // ISO timestamp of this fetch
    repo: { owner: string; repo: string; fullName: string };
    metrics: { /* all 10 fields described in §5, each number | null */ };
  },
  fetchedAt: Date;
}
```

See `github-actions.types.ts` for the exact `GithubActionsMetricsResponse` and
`GithubActionsConnectorOptions` types.
