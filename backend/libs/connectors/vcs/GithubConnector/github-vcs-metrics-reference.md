# GitHub VCS Connector — Reference Documentation

This documents what `backend/libs/connectors/vcs/GithubConnector/github.connector.ts` actually
does today: what it fetches, how each of the 25 metrics is calculated, what's configurable,
and known limitations.

---

## 1. Scope

One class, `GitHubConnector`, implements `IVcsConnector<GitHubMetricsResponse>`. Given a GitHub
token + `{owner, repo}`, `getData()` returns all 25 metrics from `backend/libs/connectors/vcs/vcs-metrics.md` in one call. It
does not persist anything or touch other tools — that's the sync layer's job.

---

## 2. Fetch architecture — tools used

| Tool | Used for |
|---|---|
| `@octokit/rest` (REST methods) | Closed issues, all pull requests (flat list), commits, `repos.get` (default branch), per-commit file stats (`repos.getCommit`), branch-merge check (`repos.compareCommitsWithBasehead`), repo tree listing (`git.getTree`), reading specific files (`repos.getContent`), Dependabot/secret-scanning alerts |
| `@octokit/rest`'s GraphQL client (`octokit.graphql()`) | Pull requests with nested reviews/comments/threads, issues with labels/reopen-events, branches with last-commit date |
| Native `fetch` (no extra HTTP library) | External registry lookups for Dependency Update Lag: `registry.npmjs.org` (npm), `pypi.org` (PyPI), `search.maven.org` (Maven Central) |

**Why both REST and GraphQL:** GraphQL is used wherever nested data (a PR with its reviews,
comments, and threads; an issue with its labels and timeline) would otherwise need multiple
REST round-trips per item — one GraphQL query fetches all of it per page. REST is kept where
it's already efficient as a flat list (all PRs, commits, closed issues) or where there's no
clean GraphQL equivalent (per-commit file-level diff stats, security alerts, reading raw file
content, listing the full repo tree).

**Rate limiting:** REST calls go through the shared throttled client in
`libs/utils/github-octokit.ts`, which uses `@octokit/plugin-throttling` and
`@octokit/plugin-retry` to read the `x-ratelimit-*` headers off responses already in flight and
back off on both primary and secondary limits. Clients are cached per token so this connector and
the github-actions connector — which run concurrently — share one budget rather than each keeping
its own view of it. GraphQL has a separate points budget the plugin doesn't track, but every
GraphQL query here requests `rateLimit { remaining, resetAt }` inline, so `checkGraphQLRateLimit()`
runs off data the query already returned, at no extra network cost.

This replaced a per-call `checkRateLimit()` preflight that spent a full `octokit.rateLimit.get()`
round trip before each REST call it guarded — roughly half of this connector's REST traffic — and
which didn't actually throttle, since concurrent callers each observed "remaining < 100"
independently and each slept in parallel.

**No local git clone.** Everything is fetched via the GitHub API or public package registries.

---

## 3. Data collected from GitHub

| Fetch | Source | Scope |
|---|---|---|
| Closed issues | REST `issues.listForRepo` | `state: closed`, last 7 days |
| Pull requests + reviews + threads | GraphQL (`PULL_REQUESTS_WITH_REVIEWS_QUERY`) | All PRs, unbounded, paginated — the single source for every PR-based metric |
| Issues + labels + reopen events | GraphQL (`ISSUES_GRAPHQL_QUERY`) | All issues, unbounded, paginated |
| Commits | REST `repos.listCommits` | Trailing N days (configurable, default 30) |
| Branches + last-commit date | GraphQL (`BRANCHES_GRAPHQL_QUERY`, `refs(refPrefix: "refs/heads/")`) | All branches, paginated |
| Default branch | REST `repos.get` | — |
| Per-commit file stats | REST `repos.getCommit` (once per commit in the commit window) | Used by Code Churn and Code Ownership Concentration |
| Branch merge status | REST `repos.compareCommitsWithBasehead` (once per *stale candidate* branch, not every branch) | Used by Long-Lived Branch Count |
| Dependabot alerts | REST `dependabot.listAlertsForRepo` | `state: open` |
| Secret-scanning alerts | REST `secretScanning.listAlertsForRepo` | `state: open` |
| Repo file tree | REST `git.getTree` (`recursive: true`) | Used to locate `package.json` / `requirements.txt` / `pom.xml` / `build.gradle(.kts)` anywhere in the repo |
| Specific file contents | REST `repos.getContent` | Reads whichever manifest files were found above |

**All PR-based metrics share one fetch.** Earlier in this connector's development, a separate
flat REST pull-request list existed alongside the GraphQL-enriched one, fetching PRs twice per
run. That's been consolidated — every PR-consuming metric (including Stale MRs Count, MR Revert
Rate, and Active Contributors Per Week, which only need flat fields like `state`/`title`/`createdAt`)
now reads from the single GraphQL-sourced list.

---

## 4. External registries used (Dependency Update Lag only)

| Ecosystem | Manifest(s) | Registry queried | What's fetched |
|---|---|---|---|
| npm | `package.json` (`dependencies` + `devDependencies`) | `registry.npmjs.org/{package}` | Full version→publish-date history + `dist-tags.latest` |
| Python | `requirements.txt` | `pypi.org/pypi/{package}/json` | `releases` (version→upload dates) + `info.version` (latest) |
| Java (Maven) | `pom.xml` | `search.maven.org/solrsearch/select?...core=gav` | GAV search results with per-version timestamps |
| Java (Gradle) | `build.gradle` / `build.gradle.kts` | Same Maven Central search as above | Same — Gradle dependencies are Maven coordinates too |

All manifest files are located by walking the **entire repo tree** (not just root), so a repo
shaped like `backend/package.json` + `frontend/package.json` has both picked up. Common
vendor/build directories (`node_modules`, `vendor`, `.venv`, `venv`, `dist`, `build`, `target`,
`.gradle`) are excluded from this search.

---

## 5. Metrics — how each is calculated

### Issues Closed Per Week
Count of issues closed in the trailing 7 days. A one-shot snapshot count, not a rolling weekly
series.

### Issue Cycle Time
Average of `closedAt − createdAt` (in days, one decimal) across the same 7-day closed-issues set.
`null` if there are no closed issues in that window.

### Issue Reopen Rate
`(issues with ≥1 ReopenedEvent) / (total issues fetched) × 100`, from the GraphQL issues query's
`timelineItems(itemTypes: REOPENED_EVENT)`. `null` if there are no issues at all.

### Bug vs Feature Ratio
Each issue's labels are pattern-matched (case-insensitive, substring, not exact) against
`BUG_LABEL_PATTERNS` (`bug`, `defect`, `error`, `type: bug`, `kind/bug`) and
`FEATURE_LABEL_PATTERNS` (`feature`, `enhancement`, `feat`, `improvement`, `type: feature`,
`story`). An issue matching both is counted as a bug (bug takes precedence). Alongside the
ratio, `classificationCoveragePercent = (bugCount + featureCount) / totalIssues × 100` is always
returned. The `ratio` field (`bugCount / featureCount`) is `null` unless coverage is ≥ 50% *and*
at least one feature was classified — below that, there isn't enough labeled data to trust a
ratio.

### MRs Merged Per Week
Count of PRs (from the GraphQL-enriched set) with `mergedAt` in the trailing 7 days.

### MR Merge Time
Average `mergedAt − createdAt` in hours across all merged PRs. `null` if none are merged.

### Time to First Review
For each PR, finds the earliest review from someone other than the author, averages
`submittedAt − createdAt` in hours across PRs that have one. `null` if no PR has a non-author
review.

### Review Comments Per MR
Average, per PR, of the sum of `comments.totalCount` across all its reviews (i.e. actual review
*comment* count, not review *submission* count — see Review Iteration Count below for that).
`null` if there are no PRs.

### MR Revert Rate
`(merged PRs whose title matches /revert/i) / (total merged PRs) × 100`. Title-based heuristic —
doesn't inspect commit content.

### Code Churn — High Frequency Files
For every commit in the commit window, fetches its full file list via REST (`repos.getCommit`,
once per commit) and tallies, per file: how many commits touched it and how many distinct
authors touched it. Reports counts of files touched ≥10 times and files touched by ≥3 different
people.

### Commit Message Quality
Over the same commit window: percent of commit messages matching an issue reference
(`#123`, `PROJ-123`, `fixes #123`), percent with a non-empty body beyond the subject line, and
percent whose subject line follows a Conventional-Commits-style prefix (`feat:`, `fix:`, `chore:`,
etc.).

### Unresolved Discussion Threads at Merge
For each merged PR, `reviewThreads` where `isResolved: false` are counted and summed across all
merged PRs. **Approximation**: this reflects unresolved threads *as of now*, not the thread state
at the exact moment of merge — GitHub's API doesn't expose historical thread-resolution state.
`null` if there are no merged PRs.

### Review Comments Per 100 Lines
For PRs with `additions + deletions > 0`, computes `reviewCommentsCount / (additions+deletions) × 100`
per PR and averages across those PRs. `null` if no PR has any lines changed.

### Bus Factor
Over the commit window, ranks contributors by commit count and finds the minimum number of
top contributors whose cumulative share reaches 50% of all commits. Returns that count (e.g. `2`
means the top 2 contributors account for at least half of recent commits).

### Code Ownership Concentration
Same per-commit file-fetch as Code Churn, but groups by top-level directory (the path segment
before the first `/`; files with no `/` fall into a single `root` bucket) instead of by
individual file. For each directory, reports the top contributor's share of commits to that
directory, flagging it if that share exceeds 60%.

### Review Network Density
Builds a directed graph: nodes are everyone who authored or reviewed a PR; an edge
`reviewer → author` exists if that reviewer reviewed that author's PR (self-reviews excluded).
Density = distinct edges ÷ all possible directed pairs among participants (`n × (n−1)`).

### Security Vulnerability Count
Sums open Dependabot alerts + open secret-scanning alerts. If **both** sources fail (feature
disabled, insufficient token scope, or any other error), returns `null`. If only one source is
available, the other's contribution is `0` and the metric still returns a real (partial) number
rather than `null` — a deliberate choice to not throw away a working signal just because the
other source isn't available.

### Stale Issues Count
Count of currently-`OPEN` issues whose `updatedAt` is older than a threshold (default 14 days,
not currently exposed via `VcsConnectorOptions`).

### Stale MRs Count
Count of currently-open PRs (from the flat REST list) whose `updated_at` is older than 14 days
(same threshold, also not yet configurable).

### Review Iteration Count
Average, per PR, of the number of *review submissions* from non-authors (this is what the
underlying code originally called `reviewPerPrAvg` — kept as this distinct metric so it doesn't
collide with Review Comments Per MR, which counts actual comments instead of review rounds).

### PR/MR Review Coverage (%)
`(PRs with ≥1 non-author review) / (total PRs) × 100`.

### Self-Merged MR Rate (%)
`(merged PRs where author == mergedBy) / (total merged PRs) × 100`.

### Long-Lived Branch Count
Two-stage: (1) filter non-default branches whose last commit is older than a threshold (default
30 days, configurable) — this uses the GraphQL branch fetch's `target.committedDate`, not the
REST `listBranches` endpoint (which doesn't expose a commit date at all); (2) for each stale
candidate, check whether it's already merged into the default branch via
`compareCommitsWithBasehead` (`ahead_by === 0` = fully merged, just not deleted) and exclude those.
So the final count is: **stale AND not merged** — a genuinely unintegrated long-running branch,
not just an old branch someone forgot to delete after merging. On a failed merge-check, a branch
is *not* assumed merged (still counts) — absence of confirmation isn't confirmation of safety.

### Active Contributors Per Week
Count of distinct people (by commit author name/login, PR author, or issue author) with activity
in the trailing 7 days, across commits, PRs, and issues combined.

### Dependency Update Lag
See §4 above for sourcing. For every dependency resolved to a literal, pinned version, computes
`latestPublishedAt − currentPublishedAt` in days (0 if already on latest, never negative), then
averages across every resolved dependency from every manifest found, across all ecosystems —
one blended number, not broken out per ecosystem. `null` if no manifest was found, or if none of
the dependencies found could be resolved to a concrete, registry-verifiable version.

---

## 6. Configuration (`VcsConnectorOptions`)

Passed via `CreateVcsConnectorInput.options` when constructing the connector. All fields are
optional; defaults match the connector's original hardcoded behavior.

| Option | Default | Affects |
|---|---|---|
| `commitWindowDays` | 30 | How far back commits are fetched — affects Code Churn, Code Ownership Concentration, Bus Factor, Active Contributors Per Week |
| `graphqlPageSize` | 50 | Page size (per network round-trip) for the outer `pullRequests`/`issues`/`refs` GraphQL connections. **Not a cap on total count** — pagination continues via `hasNextPage`/`endCursor` until everything is fetched, regardless of this value. Only affects request batching. |
| `reviewsPageSize` | 50 | Max reviews fetched **per PR** — this one *is* a hard cap, no further pagination within a single PR's reviews |
| `threadsPageSize` | 100 | Max review threads fetched **per PR** — also a hard cap |
| `labelsPageSize` | 20 | Max labels fetched **per issue** — also a hard cap |
| `longLivedBranchThresholdDays` | 30 | Staleness cutoff for Long-Lived Branch Count |

Not yet configurable (still hardcoded constants in the file): the 14-day stale threshold shared
by Stale Issues Count and Stale MRs Count, the Bug vs Feature coverage threshold (50%), and the
various label-matching / commit-message-convention regex patterns.

---

## 7. `null` vs `0` convention

Followed consistently across the connector: `0` means "we measured it, and it's genuinely zero."
`null` means "we couldn't establish a real number" — no data in scope, or the underlying feature
isn't available/enabled. Concretely, `null` shows up when:
- There's no data to compute from (e.g. no closed issues, no merged PRs).
- A feature is disabled or inaccessible (Security Vulnerability Count when both Dependabot and
  secret-scanning are unavailable).
- Nothing was resolvable (Dependency Update Lag when no manifest exists, or none of its
  dependencies pin a concrete version the registry recognizes).

Never conflate the two: a `null` should never be read as "zero risk," and a `0` should never be
read as "not measured."

---

## 8. Known limitations

- **Commit-window metrics** (Code Churn, Code Ownership Concentration, Bus Factor, Active
  Contributors Per Week) only see activity within `commitWindowDays` (default 30). A repo with
  low recent activity in a given area — even if that area has a long real history — will
  under-report here. This is why a repo with `backend/`/`frontend/` directories that haven't been
  touched in the last 30 days can show an empty `codeOwnershipConcentration.directories` list.
- **Nested GraphQL connections are hard-capped, not paginated further**: a PR with more than
  `reviewsPageSize` reviews, more than `threadsPageSize` review threads, or an issue with more
  than `labelsPageSize` labels will silently undercount beyond that cap. (The *outer* pagination —
  how many PRs/issues/branches total — is not capped; see §6.)
- **Bug vs Feature Ratio** depends on the repo actually using recognizable label naming
  conventions. The coverage gate (`null` below 50% classified) prevents a misleadingly confident
  number, but doesn't fix repos that don't label bugs/features at all — coverage will just stay
  low and the ratio stays `null`.
- **Unresolved Discussion Threads at Merge** is a current-state snapshot, not the true state at
  the historical moment of merge (GitHub's API doesn't expose the latter).
- **Dependency Update Lag — Maven parent-POM-managed versions are not resolved.** Any Maven
  project that inherits dependency versions from a parent POM (the standard pattern for e.g. any
  `spring-boot-starter-parent` project) declares no literal `<version>` on most dependencies — the
  version lives in the parent's `<dependencyManagement>`, external to the repo. This connector
  requires a literal `<version>` tag and does not resolve inherited/BOM-managed versions. A
  bounded parent-chain resolver (walk `<parent>` up a capped depth, fetch each ancestor POM from
  Maven Central, merge managed versions) was prototyped and deliberately reverted: even a scoped
  version left BOM imports (`scope=import`) and cross-ancestor `${property}` references
  unresolved, and the complexity didn't clear the bar for the remaining coverage gap. Practical
  effect: a Maven project relying heavily on parent-managed versions may see `null` or a
  low-sample-size result for this metric. Gradle, npm, and Python dependencies are unaffected.
- **Gradle dependency parsing is regex-based, not exhaustive.** It matches the common
  `implementation("group:artifact:version")` / `implementation 'group:artifact:version'` shapes
  across the usual configs. Map-style declarations (`group: 'x', name: 'y', version: 'z'`) and
  version-catalog references (`libs.someLib`) aren't matched.
- **npm/Python version resolution is spec-based, not lockfile-based.** A dependency pinned via a
  range (`^1.2.3`) is treated as if the current version *is* the range's literal number, even if
  the lockfile actually resolved to something newer — there's no `package-lock.json`/`poetry.lock`
  parsing.
- **Repo tree walk (`git.getTree`) can be truncated** for very large repos — GitHub caps the
  response size, and a deeply nested manifest could be missed if the tree exceeds that cap. Not a
  concern at typical repo scale.
- **Silent error handling.** Most per-item fetches (`repos.getCommit` in a loop, manifest fetches,
  registry lookups) catch and swallow failures without logging — a partial failure produces a
  quietly-partial result rather than a visible warning. No retry/backoff beyond the rate-limit
  pause is implemented.
- **No automated tests** covering the calculation logic.

---

## 9. Output shape

`getData()` returns `VcsConnectorOutput<GitHubMetricsResponse>`:

```ts
{
  tool: 'github',
  provider: 'github',
  data: {
    generatedAt: string; // ISO timestamp of this fetch
    repo: { owner: string; repo: string; fullName: string };
    metrics: { /* all 25 fields described in §5 */ };
  },
  fetchedAt: Date;
}
```

See `backend/libs/connectors/vcs/github-metrics.types.ts` for the exact `GitHubMetricsResponse`
type, and `backend/libs/connectors/vcs/types.ts` for `VcsConnectorOptions`.
