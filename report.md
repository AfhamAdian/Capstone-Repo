# CSE450 Capstone Project Report — Chapters 5 and 6

**Project:** Pulse — an engineering-health monitoring platform for multi-project software organisations
**Scope of this file:** Chapter 5 (Investigation and Evaluation) and Chapter 6 (Project Management, Teamwork, and Impact) only. Chapters 1–4 and 7 are written separately.

**How to read this file.** Section numbering and content follow the guidance in `BUET_CSE_Capstone_Project_Template.pdf`. Requirement identifiers (O-, FR-, NFR-, C-, G-, SH-, EC-) are those already established in Chapters 1–3, so every claim here is traceable back to a stated requirement.

**Evidence basis.** Repository-derived evidence was refreshed against commit `4639e0e` on **2026-09-21** by executing the project's own tooling and re-inspecting the implementation paths discussed below. Commands are listed in Appendix A so the figures can be reproduced or refreshed. Where evidence could not be obtained without infrastructure or partner access the team must supply, the text says so explicitly and is tagged **[TEAM INPUT]** rather than estimated. There are no invented numbers in this chapter; a marked gap is preferable to a plausible fabrication, and an examiner will treat it that way too.

---

# Chapter 5: Investigation and Evaluation

This chapter reports the investigative work carried out on the built system. Section 5.1 presents four investigations using analytical derivation, structured adversarial inspection, automated test execution and measured configuration evidence as appropriate to the question. Section 5.2 evaluates the delivered system against every objective and every functional and non-functional requirement of Chapter 3. Section 5.3 analyses each point at which the delivered system departs from its specification and states the revision made or the reason none was made.

Pulse is a development-focused project rather than a research contribution, so the investigations are validations of the design decisions that carried the most risk rather than controlled experiments testing scientific hypotheses. Each investigation states the form of evidence it can support; source inspection is not presented as runtime measurement, and an unmeasured quantity is left unresolved. One investigation (INV-2) identified a privacy-control gap that ordinary interface use had not exposed, which is analysed in full.

## 5.1 Experimental Investigation

### 5.1.1 Selection of investigations

Four decisions were judged to warrant investigation. A decision qualified if it met at least two of three tests: its failure would invalidate a stated project objective; its correctness is not observable from the user interface; and no established practice prescribed the answer, so the team had to derive one.

**Table 5.1 — Investigations and the design decisions they validate**

| ID | Decision under investigation | Objective / requirement at risk | Consequence if the decision is wrong |
|---|---|---|---|
| INV-1 | Treating an absent metric by excluding it and renormalising the remaining weights, rather than imputing a value for it | O-02, O-03, FR-22 | Projects with partial tool coverage are scored unfairly, making the cross-project comparison that is the product's central claim invalid |
| INV-2 | Enforcing respondent anonymity in the database schema rather than in application logic | O-04, NFR-07, NFR-08 | Respondents can be re-identified, candour collapses, and the stakeholder conflict recorded in Chapter 3 (leadership insight vs. developer privacy) is unresolved |
| INV-3 | Using AI-assisted reranking to recover semantically related actions that lexical matching can miss, while retaining lexical search as an independent retrieval path | O-05, FR-39, NFR-13 | Without reranking, relevant actions expressed with different vocabulary may be missed; when the provider is unavailable, ordinary lexical retrieval remains available but explicit deep search does not |
| INV-4 | Bounded connector concurrency plus time-staggered scheduling to stay inside free-tier API quotas | O-06, NFR-15, NFR-16 | A scheduled portfolio run exhausts a shared credential's quota and the trend history that gives the product its value develops gaps |

### 5.1.2 INV-1: Treatment of absent metrics in the scoring model

#### The decision under investigation

Chapter 3 records that most real projects have only a subset of the four tool categories configured, and FR-22 requires that a score be computed from whichever metrics are actually available. The scoring model must therefore define what a dimension score *means* when some of its input signals do not exist. Three treatments were considered:

- **Zero-imputation.** An absent signal scores 0 and retains its full weight.
- **Mean-imputation.** An absent signal takes the mean of the signals that are present, or of the portfolio.
- **Renormalisation.** An absent signal is excluded and the weights of the remaining signals are rescaled to sum to one. This is the treatment implemented by the shared scoring utility used across all risk dimensions.

The question is whether the choice is material, and if so which treatment is defensible.

#### Why zero-imputation was rejected

The objection is arithmetic rather than empirical, and it can be shown with a single worked example using the implemented weight vector of the security dimension:

| Signal | Weight | Source tool |
|---|---|---|
| `securityRating` | 0.25 | SonarQube |
| `vulnCountDensity` | 0.20 | SonarQube |
| `securityReviewRating` | 0.15 | SonarQube |
| `securityHotspotsDensity` | 0.15 | SonarQube |
| `dependencyUpdateLag` | 0.15 | version control |
| `securityRemediationEffort` | 0.10 | SonarQube |

Consider a project that has connected version control but not SonarQube — an ordinary situation, and exactly the case FR-22 exists to handle. Five of the six signals are absent, carrying 0.85 of the total weight. Suppose the one available signal, `dependencyUpdateLag`, scores 80.

- Under **renormalisation**, the single present signal's weight is rescaled from 0.15 to 1.0, and the dimension scores **80**. The score says: *on the evidence available, this project's security posture looks good.*
- Under **zero-imputation**, the absent signals contribute `0.85 × 0 = 0` and the score is `0.15 × 80 = 12`. The dimension scores **12**.

The same project, with identical underlying security practices, scores 80 or 12 depending only on whether an administrator has pasted in a SonarQube token. Zero-imputation makes an absent measurement arithmetically indistinguishable from a measurement of the worst possible value, so a project that has simply not connected a tool is scored as though its code quality were *known* to be the worst observable.

This is disqualifying on two grounds. It violates FR-22 directly. More seriously, it would defeat objective O-02: across a portfolio, the dominant signal in the scores would be how many tools each project had configured, so the cross-project comparison that the product exists to provide would be measuring the wrong thing entirely. The distortion is also systematically one-directional — every absent signal drags the score down, never up — so it would not average out across a portfolio.

#### Why mean-imputation was rejected

Mean-imputation avoids that bias and, on accuracy alone, is a reasonable alternative to renormalisation. It was rejected on a different ground.

Imputing the *portfolio* mean makes one project's score depend on the current state of every other project: a project's displayed score would change when an unrelated project synchronised, without anything about the first project having changed. That breaks O-03 and FR-26 outright, because a score breakdown could no longer be stated in terms of that project's own metrics — the honest breakdown would have to read "and 0.85 of this score is an assumption borrowed from other projects."

Imputing the project's *own* mean avoids that coupling, but substitutes a different problem: it fabricates evidence. It asserts that the project's unmeasured security posture resembles its measured dependency hygiene, which is an assumption the system has no basis for and cannot show the user.

Renormalisation makes the weaker and more honest claim — *this is the score on the evidence available* — and keeps every score a pure function of that project's own inputs, which is what makes the per-signal breakdown of FR-26 possible at all.

#### Verification

The implemented behaviour is asserted by the scoring unit-test suite, which runs in CI on every change:

- `renormalizedWeightedScore` *"excludes missing signals and renormalizes the remaining weights to sum to 1"* (line 68) — the direct assertion of FR-22.
- *"computes a plain weighted average when every signal is present"* (line 56) — confirms renormalisation is a no-op when nothing is missing, so the treatment does not perturb fully-configured projects.
- *"returns null when no signal is present"* (line 48) — a dimension with no evidence at all yields no score rather than a misleading zero, which is the same principle applied at the boundary.
- *"excludes a present signal whose weight is 0"* and *"clamps the result even if an individual signal score is out of 0..100"* (lines 80, 89).

Each of the eight risk strategies additionally has a dedicated automated test suite covering its signal set, satisfying NFR-22.

#### Limitation

Renormalisation removes the bias, but it cannot manufacture the information the absent signal would have carried. A dimension score computed from two signals is a weaker estimate than one computed from six, and the interface presents both identically — a manager comparing two projects cannot see that one score rests on materially less evidence. Team health is most exposed, having only four signals, so a single absent input removes a quarter of the evidence. This is recorded as an acknowledged limitation in §5.3.8 and carried to future work.

**[TEAM INPUT: the argument above is analytical — it establishes that zero-imputation is wrong by construction, which is sufficient to justify the design decision and is what the template asks for in a development-focused project. If you want to strengthen it into a measured result, the study to run is an ablation on real snapshots: take projects for which all four tool categories are configured, remove one category's metrics at a time, recompute the dimension scores, and report how far each falls and whether the portfolio ordering changes. That requires a set of fully-configured projects with real synced data, which the team can produce only against live instances. Do not substitute randomly generated inputs for this — a study on synthetic data measures the arithmetic, which the worked example above already establishes more clearly and more briefly.]**

### 5.1.3 INV-2: Adversarial investigation of respondent anonymity

#### Research question

NFR-07 requires that a survey response not be attributable to the individual who submitted it. The absence of an identity column establishes that no *direct* attribution exists; it does not establish that no attribution is *possible*. The question is what an adversary with realistic access could actually infer.

#### Threat model

The adversary is the **company administrator**: an insider with full read access to the tenant's data, including direct database access, who wishes to learn how a named developer answered. This is the correct adversary to model, because it is precisely the party whose access developers (SH-03) are being asked to trust, and it is the strongest adversary the system can meaningfully defend against. Defending against a database-level insider is what distinguishes a structural guarantee from a policy promise.

#### Method

Each plausible linkage route was enumerated and traced through the applied response and recipient schemas, token representation, dispatch path and insight-generation path. A route was classed as **closed** only where the inspected representation contained no join key or identity-bearing value; otherwise it was classed as **open** or **statistically possible**. The result therefore establishes properties of the implementation at the evaluated commit, not the probability of successful re-identification in a real organisation.

#### Results

**Table 5.2 — Re-identification routes attempted and outcomes**

| # | Linkage route | Outcome |
|---|---|---|
| A1 | **Direct.** A respondent column, foreign key or nullable author field on `survey_response` | **Closed by schema.** The table holds `id`, `survey_id`, `submission_key` (a client-generated UUID), `submitted_at` and `answers` (jsonb). There is no identity column and no foreign key to `User` |
| A2 | **Token.** Recovering an individual from the access token embedded in the survey link | **Closed by design.** `SurveyTokenPayload` is `{ surveyId, cycleId, deadline }` only. One token is minted per *cycle*, not per recipient, so the token is byte-identical for every developer on the project and carries no per-person information |
| A3 | **Recipient join.** Correlating `survey_recipient` rows against `survey_response` rows | **Closed.** `survey_recipient` records that a send was attempted and its outcome (`sent`/`skipped`/`failed`). The only column it shares with `survey_response` is `survey_id`, which is common to every respondent, so the join is one-to-many in both directions and yields no pairing |
| A4 | **Timing.** Ordering responses by `submitted_at` and correlating against delivery times or individual working patterns | **Open, statistical.** `submitted_at` is stored at full precision and is not coarsened. Because the link is broadcast once per cycle rather than staggered per person, delivery time carries no per-person signal; but an administrator could still correlate submission time against a developer's own commit or CI activity, which the platform itself records. Narrowing rather than identification, and harder as cohort size grows |
| A5 | **Small cohort.** Inferring authorship on a project with very few eligible respondents | **Open — and the intended mitigation is not enforced.** See the evaluation gap below |
| A6 | **Content.** A respondent identifying themselves within a free-text answer, or writing in a recognisable style | **Open, irreducible.** No technical control can prevent this. Compounding it, the respondent-facing page carries no anonymity notice (see below) |

#### Evaluation gap: the k-anonymity threshold is configured but not enforced (NFR-08)

The investigation identified a material gap between the configured privacy threshold and the behaviour currently enforced.

NFR-08 requires that aggregate survey insight be reported only where the number of responses meets a configured minimum. The environment configuration defines this minimum with a default of 5, a lower bound of 3 and an upper bound of 100. The sample deployment configuration also documents that the threshold applies before AI analysis and raw-text result visibility.

However, tracing the configured minimum across the backend and frontend finds exactly **three** uses: its definition, its export and its inclusion in a diagnostic string. It is never used by the comparison that controls insight generation. The implemented gate checks only whether the response count is below 1 and whether any answer exists. Consequently, the configured minimum is reported diagnostically but does not govern the decision.

**Consequence.** A survey that receives between 1 and 4 responses is analysed and its aggregate insight published, despite a configured minimum of 5. On a small team this is materially privacy-affecting: where a project has three eligible developers and one responds, the "aggregate" insight is that single person's opinion, rendered as a project-level finding and shown to their manager. The AI analysis prompt compounds the exposure by instructing the model to cite respondent counts in its output bullets (for example "1 of 1 responses cite…"), and by passing the free-text answers through verbatim. Route A5 in Table 5.2 is therefore not merely unmitigated; the mitigation was designed, configured and documented, and then not wired to the check.

**Status.** NFR-08 is recorded as **Not met** in Section 5.2.4, and the gap is carried into Section 5.3.6 with its remediation. The central code change is small — replacing `< 1` with `< env.surveyMinAnonymousResponses` — but the privacy consequence is material. The configuration and diagnostic message made the surrounding implementation appear consistent even though the configured value did not govern the check. This is precisely the class of gap that an adversarial investigation is intended to surface, and it is the reason INV-2 was worth running.

#### Secondary finding: no anonymity notice on the respondent-facing page

The survey invitation email states "Your response is anonymous", but the public survey answering page contains no such assurance: a search for "anonym", "confidential", "private" and "identity" returns nothing. Because the link is *also* broadcast to Slack, Telegram and Discord channels, a respondent who arrives from a channel message rather than from the email is never told that their answer is unattributable. This both depresses candour and weakens the only available mitigation for route A6. It is a text-only change and is recommended in Section 5.3.6.

#### Analysis and conclusion

Route A1 is **closed structurally**: direct attribution cannot be added without changing the response schema. Routes A2 and A3 are closed by the current application and data design, but not by the response schema alone. A future code change could mint a different token per recipient, and a future schema or dispatch change could introduce a joinable identifier. The defensible claim is therefore narrower: the stored response has no direct identity field, while the shared-token and non-joinable-recipient properties were verified by inspection at the evaluated commit.

Routes A4–A6 are **statistical rather than structural** and are reduced but not eliminated — and A5's designed mitigation is currently inert. The honest claim is that **the stored response contains no direct respondent identity, while resistance to indirect attribution depends on the current shared-link design, cohort size and answer content.** Anonymity is not absolute, and it is weakest on exactly the small teams where team health is most fragile.

### 5.1.4 INV-3: Availability of AI-assisted action search

#### Research question

The action-search subsystem contains an ordinary PostgreSQL lexical path and an explicitly requested `mode=deep` path that reranks candidates through Pinecone. Lexical matching is fast and provider-independent, but can miss conceptually related actions and problems when they use different words; AI-assisted reranking exists to recover that semantic similarity. A separate asynchronous pipeline generates Gemini embeddings for actions. NFR-13 requires optional external-service unavailability to produce graceful degradation. Does a deep-search request fall back to lexical search when the reranker is unavailable, and what evidence supports that behaviour?

#### Method

The action-search endpoint was traced through its request-handling and search-service layers. The acceptance criterion for full conformance with NFR-13 was fixed before judging the result: when deep mode is requested and Pinecone is unavailable, the endpoint must return lexical results successfully and identify the serving path as lexical in its response metadata. The three action-search test suites were then executed to determine whether that failover is asserted automatically. Their test cases were reviewed as well as counted, because a passing suite is evidence only for the behaviours it actually asserts.

#### Results

All 11 tests in the three suites pass (11/11, 836 ms in the 2026-09-21 refresh run). They assert query sanitisation and action scoping, Gemini request construction and provider-response classification, and Pinecone result mapping and malformed-score rejection. They do **not** invoke `searchActions()` while the provider is unavailable, and therefore do not test lexical failover.

Inspection shows that the two paths currently remain separate rather than switching automatically. With deep mode absent, the service calls PostgreSQL lexical search and reports lexical mode. With deep mode requested, an unavailable reranker produces an availability exception that the request layer maps to HTTP **503** rather than initiating lexical retrieval. The search-mode response metadata is set only after the service returns successfully. Exposing that metadata cross-origin makes successful path selection observable, but does not create automatic failover.

One availability property does hold independently: the embedding write path is asynchronous, so logging an action does not block on Gemini. The embedding record moves through pending, processing, ready and failed states, while a content hash prevents unchanged actions from being embedded repeatedly. These properties protect action creation, but they do not change the HTTP 503 behaviour of a requested deep search.

#### Analysis and conclusion

NFR-13 is **partially satisfied**. Ordinary lexical search remains usable without either AI provider, so the action log remains searchable during an outage. A user who explicitly requests deep search, however, receives a 503 when Pinecone is unavailable, so the experience does not yet meet the stated graceful-degradation criterion. Full conformance requires catching `ActionRerankingUnavailableError`, executing the lexical query, returning HTTP 200 with `x-action-search-mode: lexical`, and adding integration tests for both unconfigured and temporarily unavailable provider cases.

The honest limitation is that this establishes path availability, not retrieval quality. The investigation does **not** show that Pinecone reranking returns more relevant results than lexical search. Establishing that would require a labelled query corpus with relevance judgements fixed in advance, measured by recall@5 and mean reciprocal rank against the lexical baseline. That corpus does not exist: the action log accumulates from first use (C-06) and there is no partner action history to draw on. **[TEAM INPUT: if you can assemble even 20–30 logged actions and write one paraphrased query per action — describing the same problem without reusing its distinctive words — running both paths over that corpus would convert this into a measured result. Report recall@5, MRR, and median/p95 latency per path. With a corpus that size the result establishes direction, not magnitude, and should be stated that way.]**

A second exposure is that survey question generation and survey insight generation also have no non-AI substitute: an extended Gemini outage postpones a survey cycle rather than serving a reduced version of it. This is recorded as residual risk R2 in Section 6.1.1.

### 5.1.5 INV-4: Rate-limit headroom of portfolio synchronisation

#### Research question

Constraint C-03 confines the system to free service tiers, and Chapter 3 records the resulting conflict between the client's expectation of current data and the providers' published rate limits. Scheduled synchronisation (FR-18) fans out across every configured project, and all projects imported from one workspace share a single access credential. How many projects can one credential carry before a scheduled run exhausts its quota?

#### Method and measured parameters

The governing parameters were read from the shipped configuration and code rather than assumed:

**Table 5.3 — Measured throttling and scheduling parameters**

| Parameter | Value | Source |
|---|---|---|
| Per-project tool fetch concurrency | 4 | Worker configuration, confirmed by inspection |
| Concurrency primitive | bounded worker pool, rejects non-positive integers | Shared synchronisation utility, unit-tested |
| Spacing between projects sharing one credential | 10 min default (bounded 0–240) | Scheduling configuration, confirmed by inspection |
| Maximum scheduling spread | 180 min default (bounded 0–1440) | Scheduling configuration, confirmed by inspection |
| Schedule time zone | configurable, default UTC | Scheduling configuration, confirmed by inspection |
| Schedule times | comma-separated HH:MM, validated and range-checked | Configuration parser and validation tests |
| Idempotency of a retried tick | deterministic job ID per project and slot | Synchronisation service and scheduled-worker tests |
| GitHub GraphQL rate-limit guard | pre-flight check of remaining quota against a threshold | Version-control connector inspection |

The scheduler assigns project index *i* the delay `min(iS, W)`. Where *S* is positive, this provides `floor(W/S) + 1` distinct launch positions, including time zero and the maximum-delay position. With the defaults (*S* = 10 minutes, *W* = 180 minutes), there are therefore **19 distinct positions**: 0, 10, ..., 180 minutes. Projects 1–19 can occupy distinct scheduled positions; project 20 and every subsequent project in the same credential bucket are also assigned minute 180 and begin to overlap at the scheduling level.

This calculation bounds launch spacing, not the number of simultaneously running syncs. Actual overlap also depends on each sync's wall-clock duration, BullMQ worker concurrency and queue backlog. Likewise, `TOOL_FETCH_CONCURRENCY = 4` caps connector work *inside one project sync*; it is not a bound of four concurrent project syncs and cannot by itself establish compliance with a provider quota.

#### Results and limitation

The derivation above is sound but **incomplete in one input**: the number of API calls issued per connector per project sync was not instrumented, so the ceiling cannot be expressed in projects-per-credential against a provider's published quota. Reading it off the source is unreliable because the GitHub connector paginates and issues both REST and GraphQL calls whose count depends on repository size.

**[TEAM INPUT: this is the one investigation that needs a measurement run before submission, and it is cheap — a single sync of one real project with request logging enabled gives the missing number. Record: calls issued per connector per sync; the provider limits assumed (GitHub REST is 5,000 requests/hour for an authenticated user, GraphQL is 5,000 points/hour; Jira Cloud and SonarCloud publish their own); the derived ceiling on projects per credential; and the observed wall-clock duration and peak request rate of one full scheduled portfolio run. State which provider binds first — it is most likely the issue tracker or the code-analysis service rather than version control, since the GitHub connector already has its own throttling plugins and a pre-flight guard.]**

#### Analysis and conclusion

Two narrower conclusions are supported. First, staggering reduces the initial request burst for the first 19 projects in a credential bucket, while the per-project worker pool bounds simultaneous connector fetches within each sync. Neither fact proves that rate-limit failure becomes merely a longer run; that claim requires the missing call-count, duration and worker-concurrency measurements. Second, the deterministic job identifier makes a retried scheduled tick a no-op (NFR-12), so retrying the same slot does not duplicate that slot's request volume. The projects-per-credential ceiling remains unknown and is recorded as residual risk R1 in Section 6.1.1.

### 5.1.6 Synthesis

The four investigations support four bounded conclusions about the built system. The scoring model's treatment of missing data is **sound by construction** — the rejected alternative would have scored an otherwise identical project 12 instead of 80 on the worked example of §5.1.2, purely for having one tool unconfigured — which is the basis for the cross-project comparability claimed by O-02. Survey responses contain **no direct identity field**, but protection against inference depends partly on application behaviour, and the investigation identified a gap between the configured k-anonymity threshold and the enforced check. AI-assisted reranking addresses semantic relationships that lexical matching can miss; ordinary lexical search remains available without AI, while explicit deep search currently returns 503 when Pinecone is unavailable, so NFR-13 is partially met. Scheduled synchronisation has verified staggering and idempotency controls, but its projects-per-credential capacity remains unquantified until runtime request counts and durations are measured.

Collectively, the investigations also validate the decision recorded in Chapter 3 to prefer a rule-based scoring model over a learned or LLM-judged one: INV-1 was possible *at all* only because the model is deterministic and decomposable, and neither of the rejected alternatives could have been audited this way.

## 5.2 Performance Evaluation

### 5.2.1 Setup, tooling and acceptance criteria

Every change reaching the main branch is validated by an automated pipeline that is a required status check under branch protection. The evaluation below therefore describes a branch state that is, by construction, the state of every merged change rather than a specially prepared build.

The pipeline applies a path filter (`dorny/paths-filter`) so that a backend-only change does not run frontend jobs and vice versa, with a `concurrency` group that cancels superseded runs, `permissions: contents: read`, and a single aggregate `ci-ok` job that treats a skipped one-sided job as a pass and any failure or cancellation as a failure.

For the backend the pipeline runs, in order: strict TypeScript type checking, ESLint, a production build, `test:coverage` (Vitest with V8 coverage), and `test:actions` (three `node:test` suites). For the frontend it runs type checking, linting and a production build with `VITE_API_BASE_URL=/api/v1` baked in.

**A note on the coverage figure.** The test runner is configured to instrument **every backend application and library source unit**, rather than only units imported by a test. This is a deliberate methodological choice and it makes the headline number look far worse than a default configuration would. Default instrumentation reports the percentage of *the code the tests already reach*, which flatters a codebase by silently excluding exactly the modules nobody has tested. Instrumenting every source unit means an untested module appears as 0 % rather than as an absence. The figure below is therefore a percentage **of the system**, not a percentage of the tested part of it, and **it is not comparable with a default-configured figure from another project.**

Four verification methods are used in the tables that follow, each requirement being assigned the weakest method sufficient to establish it:

- **T — Test.** An automated test asserts the behaviour and runs in CI on every change.
- **D — Demonstration.** The behaviour was exercised end-to-end against the running system and observed.
- **I — Inspection.** The property is established by reading the schema, configuration or source, and is not observable at run time.
- **A — Analysis.** The property is established by derivation or by one of the investigations in Section 5.1.

Statuses are **Met**, **Partial** (met in part, or met by a weaker mechanism than specified), **Not met**, and **Unverified** (not established by any of the four methods; no claim is made).

### 5.2.2 Measured results

All figures were refreshed on 2026-09-21 at commit `4639e0e`.

**Table 5.4 — Quantitative results**

| Measure | Result |
|---|---|
| TypeScript strict type check (backend) | **Pass** (exit 0) |
| ESLint (backend) | **Pass** (exit 0) — no blocking findings and 131 warnings, predominantly `@typescript-eslint/no-explicit-any` |
| Vitest suites | **20 files, 131 tests, 131 passed, 0 failed**, 3.15 s |
| `node:test` action-search suites | **11 tests, 11 passed, 0 failed**, 836 ms |
| Total automated tests | **142 across 23 test files** |
| Statement coverage (all-files instrumented) | 12.37 % (722 / 5,835) |
| Branch coverage | 12.34 % (489 / 3,961) |
| Function coverage | 9.75 % (99 / 1,015) |
| Line coverage | 12.93 % (685 / 5,295) |
| Frontend automated tests | **None** |

**Table 5.5 — Statement coverage by area, showing where testing effort was concentrated**

| Area | Statement coverage | Interpretation |
|---|---|---|
| Security and token utilities | **91.66 %** | The cryptographic core is the most heavily tested code in the system, appropriately |
| Version-control throttling and retry utility | 69.56 % | Provider throttling and retry behaviour |
| Risk-engine subsystem | 52.38 % | The eight strategies and scoring arithmetic are covered; the dispatcher and descriptive signal catalogue are untested |
| Synchronisation utilities | 52.17 % | Bounded-concurrency behaviour is covered; connector registration is untested |
| `GithubActions` / `Github` connectors | 14.67 % / 12.79 % | Exercised only incidentally |
| `Jira`, `SonarQube`, `GitLab`, `Linear` connectors | 0 % | Not unit-tested; validated by demonstration against live APIs instead |
| Queueing, notifications, embeddings, authentication and reranking | 0 % | I/O-boundary modules, exercised through doubles or by demonstration |

**Interpretation.** The distribution is more informative than the headline. Testing effort went where correctness is both critical and cheaply assertable — cryptography, scoring arithmetic, concurrency bounds — and the near-zero areas are overwhelmingly I/O boundaries against third-party services, which unit tests can only assert against a double anyway. That is a defensible allocation under constraint C-02 (no dedicated QA member). It is nonetheless a real limitation, and it should be stated plainly rather than explained away: **NFR-22 requires scoring rules to be documented and covered by automated tests and that is satisfied, but the system as a whole rests on 142 tests and has no frontend test at all.** A regression in the React application would be caught only by type checking, linting and manual use.

**Security review. [TEAM INPUT: Chapter 3 commits the project to OWASP-aligned practice, and this is the section where that commitment must be evidenced. If the repository's `/security-review` tooling was run, report its findings and their disposition here. If it was not run, state that the OWASP Top 10 response in Chapter 3 is a design-level self-assessment that has not been independently verified, and cross-reference gap G-07.]**

**Partner acceptance. [TEAM INPUT: state plainly whether any part of the system was exercised against SSCL's real GitHub, Jira or SonarCloud data — what was onboarded, by whom, over what period, and what was observed. Chapter 3 constraint C-08 records that the system is hosted and operational but not yet handed over, so if no pilot took place, say so directly. An absent pilot honestly reported is a far stronger position than an implied one, and an examiner will ask.]**

### 5.2.3 Evaluation against functional requirements

**Table 5.6 — Verification of functional requirements**

| ID | M. | Evidence | Status |
|---|---|---|---|
| FR-01 | I, D | Registration creates a company and administrator account; a one-time verification code is retained transiently and the account is created only after verification | Met |
| FR-02 | T, I | Login service and persisted server-side session store | Met |
| FR-03 | I | Single-use reset token; the reset flow explicitly invalidates every existing session belonging to the user | Met |
| FR-04 | I, D | Single-use invitation accepted during registration or by an authenticated account | Met |
| FR-05 | T, I | Central authorisation service and requester-role resolution; member access gated on project-membership records | Met |
| FR-06 | D | Administrator removes a `projectmember` row | Met |
| FR-07 | D | Workspace endpoint binds a workspace to its provider, organisation identifier and access token | Met |
| FR-08 | D | Workspace interface lists reachable repositories through the provider adapter before any persistence | Met |
| FR-09 | D | Selected repositories imported as `project` rows | Met |
| FR-10 | D | Subsequent import excludes already-imported repositories | Met |
| FR-11 | D | Per-project `projecttoolintegration` rows for PM, quality and CI/CD; VCS credential inherited from workspace | Met |
| FR-12 | I, D | Credentials masked by default; reveal is a separate administrator-restricted action | Met |
| FR-13 | D | `POST /sync` enqueues a job and returns job ID + stream key immediately | Met |
| FR-14 | T, D | Implemented connectors cover VCS, issue tracking, code analysis and CI/CD | Met |
| FR-15 | I | One `projectsnapshot` row per run; raw metrics as JSONB in four per-domain tables keyed by `snapshot_id`; no update path | Met |
| FR-16 | D | SSE over `/progress`; per-tool status rendered by `SyncProgressBanner` | Met |
| FR-17 | I, D | Persistent event store replays missed progress events to a reconnecting client | Met |
| FR-18 | T, I | Schedule queue is reconciled from configured times when the worker starts; covered by scheduled-worker tests | Met |
| FR-19 | I | Synchronisation processing tracks unsuccessful tools, marks each tool's outcome, persists successful results and reports the run as partial | Met |
| FR-20 | T | Eight strategy classes, each with its own automated test suite | Met |
| FR-21 | T | Overall score composed from dimension scores per snapshot; `riskscore.overall_score` | Met |
| FR-22 | T, A | Scoring tests assert that missing signals are excluded and remaining weights are renormalised to sum to one; design rationale in §5.1.2 | Met |
| FR-23 | I | `riskscore` rows keyed to `project_snapshot_id` (unique) | Met |
| FR-24 | D | Portfolio dashboard lists accessible projects with overall score, dimension scores and trend | Met |
| FR-25 | D | Per-project view with current score, trend and dimension history (Recharts) | Met |
| FR-26 | D, I | Score-breakdown interface renders contributing signals, values, weights and contributions from the signal catalogue | Met |
| FR-27 | I, D | Survey-question service generates from health scores, trend and notable metric conditions | Met |
| FR-28 | T | Deterministic deduplication followed by a scoring prompt with a configurable minimum score of 60 | Met |
| FR-29 | I, D | Questions editable while `draft`; editing rejected once `sent_at` is set | Met |
| FR-30 | T, I | Distribution processor assigns a randomised monthly send moment per project within a configurable window, fixed once assigned | Met |
| FR-31 | D | On-demand dispatch available to an authorised user. **[TEAM INPUT: confirm the configurable monthly limit is enforced by the backend survey service and not only hidden in the UI; if UI-only, downgrade to Partial]** | Met (pending confirmation) |
| FR-32 | I, D | One anonymous link per cycle, broadcast to configured channels and emailed individually to eligible developers | Met |
| FR-33 | I | Cooldown enforced from `survey_recipient` history against `SURVEY_MIN_DAYS_BETWEEN_SURVEYS` (default 15, bounded 1–60); skipped sends recorded with `skip_reason: 'cooldown_active'`. **Fair rotation between a developer's projects: [TEAM INPUT: confirm implemented and tested, or record as Partial]** | Partial |
| FR-34 | T | Automated token tests cover decoding, cycle validation and deadline expiry | Met |
| FR-35 | I, D | Survey-insight service produces category scores, themes, narrative summary and per-question summaries on close | Met |
| FR-36 | I, D | `project_survey_status.pending_survey` raised when configured thresholds are breached | Met |
| FR-37 | D | `actions` row carrying problem, reason, action taken, date and affected `project_ids` | Met |
| FR-38 | D | Per-project and company-wide listings, scoped by role | Met |
| FR-39 | T, A | Lexical search and optional Pinecone reranking are implemented. Ordinary lexical retrieval remains available without AI, but a requested deep search returns 503 rather than falling back when Pinecone is unavailable; investigation INV-3 (§5.1.4) | Partial |
| FR-40 | I, D | `next_review_at` with deferral presets; non-modal `WeeklyReviewBanner` and `InlineRating` | Met |
| FR-41 | I | Author may modify or delete own actions; administrator may do so for any action in the company (`logged_by_user_id`, `company_id` on `actions`) | Met |

### 5.2.4 Evaluation against non-functional requirements

**Table 5.7 — Verification of non-functional requirements**

| ID | M. | Evidence | Status |
|---|---|---|---|
| NFR-01 | T, I | Credential-security subsystem encrypts connector secrets at rest with AES-256-GCM, a 12-byte random IV per record and a 16-byte authentication tag; 92.59 % statement coverage. Encryption was disabled and re-enabled during development (§5.3.4) | Met |
| NFR-02 | I | `bcryptjs` at 10 rounds, 8-character minimum enforced at registration; no recovery path exists | Met |
| NFR-03 | I | Session ID in a cookie with `httpOnly: true`, `secure: env.nodeEnv === 'production'`, `sameSite: 'lax'`; revocable via `sessionStore.destroy` / `destroyAllForUser` | Met |
| NFR-04 | I | Credentials masked except through the FR-12 reveal action; credential used as a scheduling grouping key is reduced to a one-way hash first. **[TEAM INPUT: confirm by inspection of the `pino` configuration that no credential is written in connector exception paths, which is where such values usually leak]** | Met (pending confirmation) |
| NFR-05 | I | Request-rate limiting is applied to the public survey endpoint with distinct limits for form retrieval and submission; this is the only unauthenticated endpoint family | Met |
| NFR-06 | T | AES-256-GCM authentication tag makes modification of the embedded `surveyId`, `cycleId` or `deadline` fail decode rather than succeed with altered values; `decodeToken` returns `null` rather than throwing | Met |
| NFR-07 | I, A | No identity column or user foreign key on `survey_response` (structural); the shared-token and non-joinable-recipient properties were verified by inspection at the evaluated commit (§5.1.3) | Met |
| NFR-08 | I, A | **The anonymity threshold is configured with a default of 5 and a floor of 3, but is not used in the controlling comparison. The implemented gate checks for fewer than one response, so insight is generated and published for 1–4 responses.** See §5.1.3 and §5.3.6 | **Not met** |
| NFR-09 | I | No personal identifiers found in the AI payload construction: inspection for author, assignee, login, email, issue-key and branch fields found only aggregate scores, depersonalised conditions, the project name and respondent count. **However, free-text survey answers are transmitted verbatim and may contain names the system cannot strip** (gap G-03) | Partial |
| NFR-10 | I | A failing connector does not abort the remaining connectors; the run is recorded as partial (`failedTools[]`) | Met |
| NFR-11 | I | BullMQ retry with increasing backoff on every queue | Met |
| NFR-12 | T | Deterministic job identifier per project and time slot makes a repeated or retried tick a no-op | Met |
| NFR-13 | I, A | Lexical search remains available as the ordinary mode, but it is not used as failover: an unconfigured or failed Pinecone deep search returns HTTP 503. The current tests do not assert failover. Survey question and insight generation also have no non-AI substitute (§5.1.4) | Partial |
| NFR-14 | I | Compensating logic on multi-table operations, required because the Supabase REST client exposes no cross-table transaction (C-04). **[TEAM INPUT: name the specific operations that carry compensation — workspace creation with repository import is the obvious one — and confirm each]** | Unverified |
| NFR-15 | T | The bounded worker pool limits parallel connector calls to four; automated concurrency tests verify the bound | Met |
| NFR-16 | A | Projects sharing a credential staggered by `SCHEDULED_SYNC_PAT_SPACING_MINUTES` (default 10) within `SCHEDULED_SYNC_MAX_SPREAD_MINUTES` (default 180); GitHub connector performs a pre-flight `rateLimit.remaining` check. Investigation INV-4 derives the headroom but lacks the per-connector call count | Partial |
| NFR-17 | I | Dashboard reads are served from stored snapshots; no dashboard route calls an external tool | Met |
| NFR-18 | — | A usability claim about the client's workflow that cannot be established by inspection. **[TEAM INPUT: either report a walkthrough in which an SSCL manager assessed a project using only Pulse, or state the status as unverified]** | Unverified |
| NFR-19 | D | Per-tool progress visible during a running synchronisation via SSE | Met |
| NFR-20 | D, I | Any dimension score expands into its contributing signals with values, weights and contributions | Met |
| NFR-21 | A | A connector registry maps each tool name to a factory behind a shared interface; the risk engine consumes a typed metrics bundle rather than provider-specific data. Six connectors coexist without changing the scoring subsystem | Met |
| NFR-22 | T | Per-strategy and scoring-arithmetic unit tests; scoring rules maintained in dedicated internal documentation | Met |
| NFR-23 | T | Type check, lint, build and tests are a required `ci-ok` check before merge; the type check, lint and test commands were refreshed successfully at `4639e0e` | Met |
| NFR-24 | I | All configuration supplied through environment variables; no credential or endpoint literal in source | Met |
| NFR-25 | I | Container configuration uses a Node 20 Alpine image and defines Redis, API and worker services; the worker runs from the same application image with an overridden command | Met |
| NFR-26 | I | Scheduling configured by named time zone (`SCHEDULED_SYNC_TZ`, default UTC), independent of the host clock; a migration converted naive timestamps to `timestamptz` | Met |

### 5.2.5 Evaluation against project objectives

**Table 5.8 — Achievement of project objectives**

| ID | Basis of assessment | Outcome |
|---|---|---|
| O-01 | FR-13, FR-14, FR-24, FR-25 met: all four tool categories ingested and presented in one view | **Achieved** |
| O-02 | FR-20–FR-22 met; §5.1.2 establishes that the comparability claim survives partial tool coverage, and that the rejected alternative would have made tool coverage the dominant term in the score | **Achieved** |
| O-03 | FR-26 and NFR-20 met: every score decomposes into named signals with measured values, applied weights and individual contributions. §5.1.2 records that this explainability is what ruled out the imputation alternatives, since neither can state a breakdown in terms of the project's own metrics | **Achieved** |
| O-04 | The response schema prevents direct identity storage (INV-2 route A1), and the current shared-token and recipient-table design close the inspected direct linkage routes — **but NFR-08 is not enforced, so aggregate insight can be published from as few as one response.** The objective's mechanism is delivered; its privacy guarantee is incomplete until §5.3.6 is applied | **Partially achieved** |
| O-05 | FR-37–FR-38 and FR-40–FR-41 are met, while FR-39 is partial: actions are recorded, retrievable lexically and optionally reranked through Pinecone, but deep retrieval fails with 503 during provider unavailability. Whether interventions *demonstrably worked* cannot be assessed — that requires a deployment period longer than the project had, since effectiveness ratings only become meaningful weeks after an action | **Partially achieved as a mechanism** |
| O-06 | FR-18 and NFR-12 met: scheduled synchronisation accumulates history without user action, idempotently | **Achieved** |
| O-07 | NFR-21 met: six connectors across four categories coexist without modification to the scoring logic — two more than the four in scope | **Achieved, exceeded** |

### 5.2.6 Summary of conformance

Of 41 functional requirements, **38 are met**, one is met pending a confirmation the team must make (FR-31), and two are partial (FR-33, rotation fairness unconfirmed; and FR-39, no deep-search failover). Of 26 non-functional requirements, **20 are met**, three are partial (NFR-09, NFR-13, NFR-16), two are unverified by any admissible method (NFR-14, NFR-18) and **one is not met (NFR-08)**. Of seven objectives, four are achieved, one is achieved and exceeded, and two (O-04 and O-05) are partially achieved.

The single not-met requirement is a privacy control, which is why it is given disproportionate weight in this chapter relative to its one-line remediation.

## 5.3 Deviations and Design Revisions

Each deviation is given with its symptom, the technical analysis of its cause, and the design revision made — or the reason none was made.

### 5.3.1 Transactional email: Gmail SMTP replaced by the Brevo HTTP API

**Symptom.** Transactional email — verification codes, password resets, invitations and survey links — was initially delivered through Nodemailer over Gmail SMTP and proved unreliable at the volume a multi-project portfolio produces. A single survey dispatch sends one message per eligible developer per project, and the scheduled distribution concentrates those sends into a short window. **[TEAM INPUT: state the observed symptom — throttling responses, authentication rejection, delayed delivery or spam classification. A named provider response is worth considerably more here than a general statement.]**

**Cause.** A consumer mail account applies per-account sending limits and reputation-based filtering that are not designed for machine-generated transactional mail. Compounding this, SMTP introduces a stateful connection and authentication handshake onto a path that must be stateless and cheaply retryable from a background worker.

**Revision.** Delivery was moved to Brevo's HTTP API (commit `fe4e8cb`). The email service now uses a single idempotent HTTPS request instead of an SMTP connection, allowing the existing queue retry policy (NFR-11) to handle transient provider unavailability consistently. When no Brevo credential is configured, the service records the intended message without sending it, so local development needs no mail credential. No requirement changed; the mechanism satisfying it did.

### 5.3.2 Removal of manual guidance from survey question generation

**Symptom.** An earlier design allowed an administrator to inject free-text guidance to steer AI question generation. In use, guidance text propagated into the wording of the generated questions.

**Cause.** This is a leading-question problem rather than a prompt-engineering limitation, and could not have been addressed by better prompting. A survey whose questions are shaped by a manager's stated concern measures that concern rather than the team's state, and the resulting insight is then presented to the same manager as an independent reading of team health. The mechanism therefore undermined the objectivity that the risk-engine-driven design exists to provide, and indirectly the candour on which the whole survey subsystem depends.

**Revision.** The override path was removed entirely (commit `cc6b7dc`). Questions now derive strictly from computed risk scores, their trend and raw connector metrics, as FR-27 specifies. Removing rather than constraining the feature was deliberate: a constrained override would have had to be policed by judgement on every use, whereas an absent one cannot be misused. The `custom_guidance` column survives on the `survey` table as dormant schema and should be dropped in a future migration.

### 5.3.3 Project tracking state moved to persisted storage

**Symptom.** The portfolio "tracked"/bookmark state, initially held in browser-local storage, did not survive a change of device or browser, so a manager's curated portfolio view was silently lost.

**Cause.** The state is a property of the user's relationship to a project, not of the browser session, and had been placed at the wrong architectural layer.

**Revision.** `is_tracked` was added as a persisted column, exposed through the health feed and an administrator toggle endpoint, and the portfolio filter and bookmark control were wired to read and write it (commits `bd355c5`, `a2d6f15`).

### 5.3.4 Credential encryption disabled and re-enabled

**Symptom.** Encryption of per-project connector credentials was temporarily disabled during development (commit `c54d984`, "encryption commented") and subsequently re-enabled (commit `aa77376`).

**Cause. [TEAM INPUT: state the actual cause. The characteristic one is a mixed-state migration problem: rows written before encryption was enabled hold plaintext while the read path expects ciphertext, so decryption fails on legacy rows and the affected connector cannot authenticate. If that was it, say so — it is a normal, well-understood migration hazard and describing it is far more credible than leaving a commit pair that disables a security control unexplained. An examiner who finds `encryption commented` in the history and no explanation in the report will draw the less charitable conclusion.]**

**Revision. [TEAM INPUT: state how it was resolved — a migration that re-encrypted existing values, or a read path that tolerates both forms during transition. Critically, confirm that no plaintext credential remains in the deployed database, because NFR-01 is otherwise satisfied only for rows written after the re-enable.]**

### 5.3.5 Scope exceeded: connectors and notification channels beyond specification

Chapter 1 scopes the work to one connector per category — GitHub, Jira, SonarCloud and GitHub Actions — and scopes survey broadcast to Slack and Discord. The delivered system contains **six** connectors (adding GitLab under VCS and Linear under project management) and **three** notification channels (adding Telegram), all behind the same interfaces.

This is an extension beyond scope rather than a shortfall, and it is positive evidence for NFR-21 and objective O-07: additional providers were absorbed without any change to the scoring logic. It must nevertheless be declared, because Chapter 1 currently states that providers other than GitHub and GitHub Actions "were not implemented", and that statement is now inaccurate.

**[TEAM INPUT: resolve this before submission. Either correct Chapter 1's scope statement, or state here that the GitLab and Linear connectors are implemented but unvalidated against a live instance. An implemented-but-unvalidated connector is a perfectly legitimate partial deliverable; an undeclared one reads as a documentation failure. Note the coverage evidence supports the second reading — both sit at 0 % statement coverage.]**

### 5.3.6 Deviation found during evaluation: the k-anonymity threshold is not enforced

**Symptom.** NFR-08 requires aggregate survey insight to be withheld below a configured minimum response count. Investigation INV-2 (§5.1.3) found that insight is generated and published whenever at least one response exists.

**Cause.** The threshold was designed, implemented as configuration and documented, but never connected to the check that was supposed to consume it. The configured value, with a default of 5 and a floor of 3, is included in a diagnostic message, while the controlling guard checks only whether the response count is below 1. Because the configuration existed and the diagnostic message named it, the omission was not apparent during review: no test covered the threshold, and the surrounding implementation reads as though the control were active.

**Revision required.** The controlling guard must compare the response count with the configured anonymity threshold, while retaining its existing check that at least one substantive answer exists.

Two accompanying changes are needed for the revision to be complete. First, the survey must reach a terminal state that the results page renders as *withheld for anonymity* rather than as an unsuccessful analysis, so that a low-response survey is not displayed to an administrator as a condition inviting a retry. Second, a unit test must assert that a survey with `responseCount` below the threshold produces no `insight` row; the present absence of that test left the configured threshold unverified.

**Status. [TEAM INPUT: decide and state whether this was fixed before submission. If fixed, cite the commit, change NFR-08 to Met in Table 5.7 and O-04 to Achieved in Table 5.8, and say here that it was found by the evaluation in §5.1.3 and corrected — which is a considerably stronger story than never having found it. If not fixed, leave the tables as they stand and record it as required work. Do not leave the tables and this section inconsistent.]**

### 5.3.7 Deviation found during evaluation: no anonymity notice on the respondent-facing page

**Symptom.** The survey invitation email states that responses are anonymous; the public survey page itself makes no such statement.

**Cause.** The assurance was written into the email template, which was the original delivery channel, and was not carried across when chat-channel broadcast was added. A respondent who opens the link from Slack, Telegram or Discord therefore never sees it.

**Revision.** Add a short plain-language notice to the public survey page stating that responses are not linked to the respondent and that the team sees only aggregated results. This is the cheapest available improvement to response candour and is the only practical mitigation for re-identification route A6 (a respondent volunteering identifying detail in free text), since it lets the respondent make an informed choice about what to write. **[TEAM INPUT: implement if time permits and record it here; if not, carry it to Chapter 7 future work.]**

### 5.3.8 Acknowledged limitation: score confidence is not expressed

Section 5.1.2 establishes that renormalisation removes the bias zero-imputation would introduce, but it cannot recover the information an absent signal would have carried: a score computed from two signals is a weaker estimate than one computed from six, and the interface presents both identically. Team health is most exposed, having only four signals, so one absent input removes a quarter of the evidence behind the score.

No requirement demands otherwise, so this was recorded as a limitation rather than non-conformance: a manager comparing two projects in the portfolio view cannot see that one score rests on materially less evidence than the other, which is precisely the comparison O-02 exists to support. The natural revision is to surface the count or weight-fraction of present signals alongside each score — the `weights` array returned by `renormalizedWeightedScore()` and the signal catalogue already carry all the data required, so this is a presentation change rather than a model change. It is recorded as future work in Chapter 7.

### 5.3.9 Deployment topology

Chapter 2's feasibility study records that free hosting tiers covered the API and frontend but not the always-on worker, which holds long-lived BullMQ connections and therefore cannot run as a serverless function; it concluded that the worker "remains unhosted". Constraint C-08 states that the system is hosted and operational. **These two statements are inconsistent and must be reconciled.**

The deployed routing configuration resolves it: requests under the API path are forwarded from the Vercel-hosted client to the Render-hosted backend, while the worker also runs on Render's always-on tier. The container build produces one application image for both backend processes, with the worker selected through a command override.

**[TEAM INPUT: confirm this is the live arrangement, then correct Chapter 2's "remains unhosted" sentence. Also note for Section 6.1.4 that `server-try1.onrender.com` is a personal free-tier hosting account, not an SSCL-owned one, which is a handover obligation.]**

---

# Chapter 6: Project Management, Teamwork, and Impact

## 6.1 Project Management and Finance

### 6.1.1 Planning and risk management

#### Process

The project was delivered incrementally, as constraint C-01 required: development ran across two academic semesters alongside concurrent coursework, so no phase could assume a block of uninterrupted time. Work proceeded on short feature branches merged into `main` through pull requests, with the automated pipeline described in §5.2.1 as a required check before merge.

The repository evidences this directly. As of commit `4639e0e`:

**Table 6.1 — Repository activity**

| Measure | Value |
|---|---|
| Total commits | 282 |
| First commit | 2026-04-02 |
| Most recent commit | 2026-09-20 |
| Merge commits | 48 |
| Merges attributable to GitHub pull requests | 31 |
| Named feature branches visible in history | `survey-is-surveying`, `graph`, `snapshot`, `encryption-enable`, `encryption-bypass`, `diverged-main` and others |

Roughly one commit in six is a merge, which indicates that integration happened through reviewed pull requests rather than by direct commits to the trunk. This served two purposes simultaneously: it satisfied NFR-23, and it kept `main` deployable at every point, so that a break for examinations did not leave the system in a half-finished state that the next working session had to reconstruct.

**[TEAM INPUT: the repository history begins 2026-04-02, whereas C-01 describes a twelve-month, two-semester effort. If requirements elicitation and design preceded the first commit — which the phase ordering below implies — say so explicitly here, otherwise the dates appear to contradict Chapter 3.]**

#### Phases

Five phases were planned, ordered by dependency rather than preference, since each supplies the input to the next:

1. **Requirements and connector feasibility.** Elicitation with SSCL and study of the candidate tools' public APIs to establish which metrics were obtainable in practice. This had to precede any scoring design, because the constraint recorded as C-05 — that several intended metrics are simply not exposed — determines which dimensions the model can support at all.
2. **Ingestion.** The connector abstraction, the snapshot data model, the job queue and SSE progress streaming.
3. **Scoring.** The eight risk strategies, the shared null-aware weighted-scoring math, and the score-breakdown presentation.
4. **Surveys.** Question generation and quality gating, anonymous dispatch and collection, insight generation, and the scheduled monthly distribution cycle.
5. **Action logging and consolidation.** The action log, lexical search with optional AI-assisted reranking, effectiveness review, and the portfolio and tracking refinements visible in the most recent commits. INV-3 found that the intended reranking-to-lexical failover is not implemented.

**[TEAM INPUT: replace the template's Figure 6.1 with a real Gantt chart showing planned against actual for each phase. Chapter 5 tells you where actual diverged from plan — the email provider migration (§5.3.1), the encryption disable/re-enable cycle (§5.3.4) and the removal of manual survey guidance (§5.3.2) were all unplanned work absorbed mid-phase. A chart showing only the plan is worth very little; one showing a phase overrunning, with the reason, is exactly what this section is assessed on.]**

#### Risk management

Risks were identified at the start of the ingestion phase and reviewed at each phase boundary. Table 6.2 records each with the mitigation adopted and the exposure that remains after it — the residual column being the one that matters, since a risk register listing only mitigations claims a completeness no project has.

**Table 6.2 — Project risks, mitigations and residual exposure**

| ID | Risk | Mitigation adopted | Residual exposure |
|---|---|---|---|
| R1 | Third-party rate limits exhausted by portfolio-wide scheduled synchronisation (C-03, NFR-16) | Bounded connector concurrency (4 per project), staggering of projects sharing a credential (10 min default within a 180 min spread), pre-flight rate-limit checks in the GitHub connector, and product positioning as a trend indicator rather than a real-time monitor | A ceiling on projects per credential that INV-4 could not quantify for want of a per-connector call count; a portfolio beyond that size needs additional credentials |
| R2 | Dependence on external AI providers for embeddings, reranking and text generation | Ordinary lexical action search remains independent of AI, and action embedding is asynchronous | A requested deep search returns HTTP 503 rather than falling back when Pinecone is unavailable; survey question generation and insight have **no** non-AI substitute, so an extended Gemini outage postpones a survey cycle outright (NFR-13, INV-3) |
| R3 | Metrics assumed available but not obtainable in practice (C-05) | API feasibility study before scoring design; null-aware renormalised scoring so an absent metric is excluded rather than penalised (FR-22), rationale in §5.1.2 | Scores computed from fewer signals are weaker estimates and the interface does not communicate this (§5.3.8) |
| R4 | Free-tier services withdrawn, throttled or altered mid-project | All environment-specific configuration externalised (NFR-24) so a provider can be substituted without code change — which is precisely what made the Gmail-to-Brevo migration cheap | A provider change still requires a person to perform it; no fallback provider is pre-configured for any service |
| R5 | Loss of team capacity to coursework and examination periods (C-01, C-02) | Small, independently mergeable units of work; trunk kept deployable; CI as the check that a returning member had not broken something they had forgotten the details of | Phases dependent on one member's knowledge resumed more slowly; no dedicated QA or operations capacity existed to absorb the gap |
| R6 | Partner data unavailable for validation under the NDA (C-09) | Investigations designed to be answerable without partner data — INV-1 argues from the scoring arithmetic and INV-2 from the schema, neither of which requires a dataset | Absent-metric behaviour (INV-1) is argued analytically rather than measured on real snapshots; retrieval *quality* (INV-3) and rate-limit headroom (INV-4) remain unquantified; no partner acceptance evidence exists |
| R7 | Anonymity guarantee eroded by later development | Direct identity storage is prevented by the response schema; shared-token and non-joinable-recipient behaviour is explicit in the current application design (INV-2) | The application-level properties can be weakened by later code changes without changing `survey_response`; statistical inference routes A4–A6 remain; **and the k-anonymity threshold intended to close A5 was found unenforced (§5.3.6)** |

R7's residual column deserves emphasis: the response schema successfully prevented direct identity storage, while the application-level cohort threshold did not run. This supports the narrower design principle that guarantees should be placed in the schema wherever the schema can express them; it does not make the token and dispatch behaviour immutable, because those properties remain application-level choices.

### 6.1.2 Budgeting and resource identification

Constraint C-03 permitted no monetary budget, so every external service had to operate within a free tier. Table 6.3 therefore gives two figures per line: the cost actually incurred, and the cost the same capability would carry if procured commercially. The second column is the one that matters for §6.1.3, because the free tiers the project depends on do not extend to production use at an organisation's scale.

**Table 6.3 — Resources consumed and their cost**

| Resource | Purpose | Cost incurred | Notional commercial cost |
|---|---|---|---|
| Development effort | 4 active contributors, 282 commits over 5.5 months of repository activity | Nil (team time) | **[TEAM INPUT: hours × a stated local graduate engineer rate; state the rate and its source]** |
| Supabase (managed PostgreSQL) | Primary datastore: snapshots, scores, surveys, actions, embeddings | Free tier | **[TEAM INPUT: paid tier price]** |
| Managed Redis | BullMQ backing store, sessions, and short-lived reset/invite/verification tokens | Free tier | **[TEAM INPUT]** |
| Render | API and always-on worker hosting | Free tier | **[TEAM INPUT — note this is the component least likely to remain free at production scale, since it must run continuously]** |
| Vercel | Static frontend hosting | Free tier | **[TEAM INPUT]** |
| Google Gemini API | Embeddings (`gemini-embedding-001`, 768 dims) for action search; question generation and survey insight (`gemini-2.5-flash`) | Free quota | **[TEAM INPUT: price per million tokens × estimated monthly volume; derive the volume in §6.1.3]** |
| Pinecone | Reranking of action-search candidates in explicit deep mode | Free tier | **[TEAM INPUT]** |
| Brevo | Transactional email (verification, reset, invitation, survey) | Free tier | **[TEAM INPUT: state the daily send limit, since it bounds survey dispatch]** |
| GitHub, Jira, SonarCloud | Metric sources | Existing partner licences | Borne by the adopting organisation, not by Pulse |
| Slack, Telegram, Discord | Survey link broadcast | Free | Nil |

### 6.1.3 Economic analysis and financial prospecting

**Development cost.** Development cost is entirely labour — there was no capital outlay and no licence purchase. Stated at a commercial rate, it is the figure an organisation would have paid to have the system built. **[TEAM INPUT: supply the figure from Table 6.3.]**

**Operating cost and how it scales.** Operating cost decomposes into three usage-proportional components and one fixed component, and the shape of that decomposition is the economically interesting finding.

Per tracked project per month the system consumes: one scheduled synchronisation per configured slot per day, each producing one snapshot and one scoring pass — both of which are compute and storage against the database rather than calls against a paid API; one survey cycle, costing exactly two Gemini generation calls (one to generate questions, one to analyse responses); and one embedding call per logged action, cached by `content_hash` so that an unedited action is never re-embedded. The fixed component is the always-on worker, which must run continuously regardless of portfolio size.

**The qualitative conclusion follows without needing the exact numbers: per-project marginal cost is very low — two AI generation calls per month plus database storage — while the fixed worker cost dominates at small portfolio sizes.** That cost shape argues strongly for a single multi-tenant hosted offering over a per-organisation deployment, since the dominant cost is amortised across all tenants in the first case and replicated per customer in the second.

**[TEAM INPUT: work this into numbers — tokens per generation call × price, plus storage growth per project per year (one snapshot per day × four JSONB metric rows), to give a cost per project per month. This is the single number this section exists to produce.]**

**Value proposition.** The benefit to an organisation of SSCL's kind is the recurring manual effort removed: a manager reconciling four to five tool dashboards per project on a fixed cadence, which Chapter 1 identifies as the originating problem. **[TEAM INPUT: quantify with whatever SSCL will confirm — minutes per project per assessment × projects × assessments per month × a manager's hourly cost. Even an order-of-magnitude figure with its assumptions stated is worth more than a qualitative claim.]** A second benefit, earlier detection of a deteriorating project, is deliberately not claimed in monetary terms: the system has not run long enough to observe an instance, and claiming it would be unsupported.

**Revenue model.** The comparable commercial products identified in Chapter 2 — LinearB, Swarmia, Faros AI and Jellyfish — are priced per seat. Per-seat pricing sits poorly with Pulse's cost structure for two reasons. First, cost scales with tracked projects and survey cycles rather than with logins, so per-seat pricing would systematically misprice the product against its own cost base. Second, and more seriously, charging per developer creates a direct financial incentive to exclude developers from the surveys, and the representativeness of that survey signal is the product's principal differentiator. A **per-tracked-project subscription** aligns price with cost and leaves survey coverage free at the margin, and is therefore the model proposed.

### 6.1.4 Sustainability in business and commercialisation

This section requires decisions rather than description, and each unanswered item below is itself a finding an examiner will notice.

- **Handover state.** C-08 records that the system is hosted and operational but not yet handed to SSCL. **[TEAM INPUT: state whether handover will occur and in what state.]**
- **Custody of infrastructure.** §5.3.9 establishes that the API and worker currently run on a personal free-tier Render account (`server-try1.onrender.com`), with Supabase, Redis, Vercel, Gemini, Pinecone and Brevo accounts similarly held by students. **Every one of these must be transferred or recreated under SSCL ownership, and every credential rotated at handover** — including the AES key protecting per-project connector credentials, since re-keying requires re-encrypting the stored values rather than simply changing an environment variable. The encrypted connector credentials in the database are SSCL's property, not the team's.
- **Maintenance.** **[TEAM INPUT: who maintains the system afterwards — named members continuing, SSCL's own engineers, or nobody with the repository archived? "Nobody" is an acceptable answer if stated.]**
- **NDA obligations at project end.** **[TEAM INPUT: state what C-09 requires regarding the partner's data held in the team's database — deletion, return, or retention for a stated period — and confirm it has been or will be done.]**
- **What production would require beyond the current deployment.** A paid database tier with backups; a redundant or restart-supervised worker, since a single worker instance is a single point of failure for all synchronisation, survey dispatch and embedding; centralised log aggregation and alerting (gap G-04); the NFR-08 fix (§5.3.6); and a named on-call owner. The free-tier deployment is adequate to demonstrate the system and inadequate to run it for a customer, and the report should say so.

## 6.2 Individual and Teamwork

### 6.2.1 Participation and contribution

**Table 6.4 — Commits by contributor (`4639e0e`, `git log --format='%an'`, aliases merged)**

| Contributor | Commits |
|---|---|
| Abdullah Al Mahmud (also commits as "mahmud1628") | 92 |
| Tahmidul Islam Omi | 81 |
| Afham Adian (also commits as "Mohammed Afham Adian") | 66 |
| Arafat Rahman (also commits as "arafat219") | 41 |
| `copilot-swe-agent[bot]` | 2 |

Two observations must be made about this table before it is used.

**First, a declared team size discrepancy.** Chapter 3 states the team comprised five students (C-02, SH-07) and the title page provides five slots, but only **four** human contributors appear in the repository history. **[TEAM INPUT: resolve this before submission — either name the fifth member and describe their contribution (report writing, requirements elicitation, design, testing and partner liaison are all real contributions that leave no commits), or correct Chapter 3 and the candidates' declaration. An unexplained mismatch between declared team size and contributor list is the first thing a reader will check in this section, and the declaration is a signed statement of individual accountability.]**

**Second, commit counts are evidence but not a measure of contribution**, and this report should not let them stand as one. They do not capture design discussion, code review, testing, debugging, partner liaison or report authorship, and they systematically favour whoever wrote the most boilerplate. A member who reviewed the majority of pull requests contributed materially to every one of them while accruing no commits.

**[TEAM INPUT: complete Table 6.5. For each member give role, the modules owned, specific contributions, participation in design decisions, and whether responsibilities were completed on time. The visible concentrations in the history, which you should verify rather than assume, are: the survey lifecycle and health-score graphing; credential encryption; the connector and scoring work; and the action log with its search pipeline. Attribute review work explicitly — `git log --format='%an' --grep='Merge pull request'` shows who merged, which is a reasonable proxy for who reviewed.]**

**Table 6.5 — Team roles and principal contributions**

| Member (ID) | Role | Modules owned | Principal contributions | Responsibilities completed on time |
|---|---|---|---|---|
| *[Name (ID)]* | | | | |
| *[Name (ID)]* | | | | |
| *[Name (ID)]* | | | | |
| *[Name (ID)]* | | | | |
| *[Name (ID)]* | | | | |

### 6.2.2 Collaboration and conflict resolution

Collaboration was structured around the pull request. Because C-02 left the team without dedicated quality-assurance or operations members, review was the only point at which a second person saw a change before it reached `main`, and the automated gate of NFR-23 existed partly so that review effort could be spent on design and intent rather than on correctness a machine can establish. Thirty-one pull-request merges across 282 commits indicate this was sustained rather than abandoned under deadline pressure.

**[TEAM INPUT: fill in the concrete practice — meeting cadence, how work was assigned and tracked, review expectations (how many approvals, expected turnaround), and how a member signalled being blocked.]**

**A worked example of disagreement.** The removal of manual survey guidance (§5.3.2) is the clearest instance of a technical disagreement settled on its merits rather than by seniority or fatigue. The feature had been built, worked as specified, and had been asked for; the argument for removing it was that a survey shaped by a manager's stated concern cannot measure the team's state independently of that concern. The team chose to delete working, requested functionality on a reasoned objection to what it would do to the data. **[TEAM INPUT: describe how it actually played out — who raised it, what the counter-argument was, and what settled it. The outcome is already in the commit history; what this section is assessed on is the process.]**

**[TEAM INPUT: describe one further disagreement briefly. The encryption disable/re-enable cycle (§5.3.4) and the choice of email provider (§5.3.1) are both candidates. A section claiming that a team of five had no disagreements across twelve months is less credible, not more, than one describing two and how they were resolved.]**

### 6.2.3 Leadership and direction

**[TEAM INPUT: answer four things concretely — who set technical direction and how that was decided; how members' views were sought on decisions affecting the modules they owned; how the team re-planned after a setback; and how momentum was maintained through examination periods.]**

Chapter 5 supplies two ready examples of setbacks converted into revised plans, and they are stronger evidence of direction than any general statement about leadership. When transactional email proved unreliable, the response was to migrate the provider and eliminate the failure mode (§5.3.1) rather than to add retries around a mechanism that was structurally unsuited to the job. When credential encryption caused problems, it was disabled *temporarily* and then re-enabled once the underlying cause was addressed (§5.3.4), rather than being quietly left off — a decision that cost time and preserved a security requirement that nobody outside the team would have checked.

### 6.2.4 Multidisciplinary engagement

The project required the team to work outside software engineering proper in three distinct directions.

**With the industry partner.** Requirements came from SSCL's Chief Technical Officer and from an intern with operational exposure, which meant translating a managerial complaint about dashboard reconciliation into a specification with verifiable acceptance criteria — a requirements-engineering and client-management activity rather than a programming one.

**Into the measurement of work itself.** Deciding what constitutes "engineering health", and how team morale and blockers can be measured without measuring individuals, draws on organisational behaviour and survey methodology rather than on computing. Several of the project's most consequential decisions are of this kind and not technical at all: collecting qualitative signal anonymously; withholding aggregate insight below a minimum cohort size; declining to let a manager steer question wording (§5.3.2); and designing the effectiveness review so that an owner may defer judgement rather than being forced to rate an outcome before evidence exists. Each trades data quality or convenience for measurement validity or respondent welfare.

**Into research ethics and data protection.** Deciding what may legitimately be inferred about identifiable people from data they did not volunteer, and what may be transmitted to a third-party model, is a governance question. The GDPR-derived principles treated as design constraints in Chapter 3, and the adversarial anonymity analysis in §5.1.3, are the output of that work.

**[TEAM INPUT: state the extent of the engagement precisely — how many meetings with SSCL, over what period, with whom, and what changed as a result. The survey system's design (deferred review states, non-alarming styling for overdue items, a persistent banner rather than a modal or a disappearing toast) reads as informed by real feedback about notification fatigue. If that feedback came from SSCL or from developers, say so and cite it; if it was the team's own reasoning, say that instead. Do not let an inference stand as evidence.]**

## 6.3 Impact on Society

The system's users are engineering managers, but the people it measures are developers, and the two groups experience it very differently. This section considers both, and covers health, safety, cultural and legal issues explicitly.

**Benefit: earlier detection.** The primary benefit is that a deteriorating project is identified from accumulated trend data rather than from its first visible failure — a missed deadline or a broken release. Those affected are the client's leadership and managers (SH-01, SH-02) and, indirectly, the developers, for whom an intervention arriving before a crisis is less disruptive than one arriving after.

**Benefit: a feedback channel that did not previously exist.** Developers (SH-03) gain a route by which low morale, persistent blockers or loss of confidence in a plan reach management without any individual having to raise it personally. Chapter 1 identifies the absence of this channel as one of the two gaps the project addresses, and the anonymity of the channel is precisely what makes using it safe. This benefit is therefore **contingent on the anonymity guarantee being real** — which makes the unenforced threshold found in §5.1.3 a social concern rather than merely a technical gap, since it is exactly the small teams with the fewest respondents whose members are most exposed by it.

**Health and safety.** The system carries no physical safety implication: it controls no equipment and operates strictly read-only against the partner's tools (C-07). Its health dimension is occupational and psychological. Here the design has one genuine risk to answer for, addressed below, and one deliberate protection: the effectiveness review (FR-40) permits an action owner to defer judgement rather than forcing a rating before evidence exists, and presents overdue items in deliberately non-alarming styling — amber rather than red — with a persistent inline banner rather than a modal that interrupts or a toast that vanishes on a timer. Both choices accept a weaker dataset in exchange for not manufacturing pressure, which is the correct trade when the pressure would fall on a person and the data is only diagnostic.

**Principal risk: repurposing as individual surveillance.** A system that scores team health and reports on engineering practice can be turned against the people it measures. Three misuses are foreseeable:

1. *Reading a low team-health score as an indictment of named individuals.* This cannot be prevented technically — a manager determined to read a project score as a verdict on a person will do so. The available mitigation is presentational: because every score expands into the metrics that produced it (FR-26), a manager who inspects a declining score sees bus factor, ownership concentration or review network density, not a name.
2. *Using survey findings to identify and pressure dissenters.* Reduced structurally by omitting respondent identity from `survey_response`, but not eliminated: timing, small-cohort and content inference remain possible, and the minimum-cohort control is currently unenforced (§5.1.3, §5.3.6).
3. *Treating connector metrics such as commit or review counts as individual productivity measures.* Answered by scoring only at project level and by excluding per-individual measurement from scope explicitly in Chapter 1. Note that the raw data to do this nonetheless passes through the system, so the protection is a design commitment rather than an impossibility; a future maintainer could add per-developer views without fighting the architecture.

**Cultural considerations.** Survey candour depends on trust that anonymity is real, and that trust is cultural at least as much as technical. In a hierarchical workplace, or a small team where any response narrows authorship, developers may reasonably decline to answer candidly whatever the schema guarantees. This bounds the system's usefulness in exactly the situations where team health is most at risk. Two concrete aggravating factors were found by this evaluation and both are cheap to fix: the threshold meant to protect small cohorts is not enforced (§5.3.6), and the respondent-facing page carries no anonymity assurance at all (§5.3.7). Until both are addressed, the report should not claim that the cultural precondition for candour has been met.

**Legal considerations.** Survey responses relate to identifiable individuals' working conditions even where the responses themselves are unattributable, and connector metrics include developer identities in their raw form. The design response is documented in Chapter 3: GDPR principles treated as design constraints, prompts constructed to exclude personal names and work-item identifiers, and credentials encrypted at rest. This evaluation verified the prompt claim by inspection — no author, assignee, login, email, issue-key or branch fields appear in the AI payload construction (§5.2.4, NFR-09). The residual legal exposures are the free-text answers transmitted verbatim (gap G-03) and the absence of any data-subject access, rectification or erasure mechanism (gap G-01). **[TEAM INPUT: state the legal basis on which the partner's employee data is processed; whether data leaves the jurisdiction (the Supabase, Gemini and Pinecone service regions matter here and should be checked); and whether a developer can presently request what the system holds about them — the honest answer to the last is no, per G-01.]**

## 6.4 Environmental Impact and Life Cycle Sustainability

The system owns no hardware, so its footprint is entirely the third-party cloud capacity it consumes, and it scales with usage rather than being fixed. Impact is considered across three life-cycle stages, with mitigation proposed for each negative impact.

**Development.** Consumption comprised developer workstations and the CI pipeline. CI is the non-obvious contributor: it runs type checking, linting, a build and two test suites on every push, and with 282 commits and 31 pull-request merges that accumulates. Two design decisions already reduce it. The path filter means a backend-only change never builds the frontend, and the `concurrency` group with `cancel-in-progress` means that pushing twice in quick succession cancels the superseded run rather than letting both complete. Both were adopted for speed and reduce compute proportionally as a side effect.

**Operation.** Three components dominate. Scheduled synchronisation runs per project per configured slot and issues bounded-concurrency API calls; AI inference is the most energy-intensive operation per unit, covering embeddings for action search and two generation calls per survey cycle; and the always-on worker consumes continuously regardless of load, which at small portfolio sizes makes it the largest single share of an otherwise small total.

Several existing design decisions reduce operational impact, and each is worth naming because each was taken for a different reason and has this as a side effect:

- Embeddings are computed once per action and keyed by `content_hash`, so an unedited action is never re-embedded and a repeated search never recomputes an embedding the system already holds.
- Ordinary lexical search removes AI inference from the request path when the user selects that mode. It remains available during an AI outage, although a deep-search request currently returns 503 instead of switching to it automatically (§5.1.4).
- Dashboard reads are served from stored snapshots and never trigger live connector calls (NFR-17), so viewing a dashboard, the most frequent user action, costs nothing externally.
- Synchronisation is scheduled rather than continuous, which follows directly from the product's positioning as a trend indicator and is the single largest avoided cost relative to a real-time design.

Two further reductions are available and are proposed here even though they are not implemented: **synchronising only projects whose upstream state has changed** since the last snapshot, detectable cheaply from a repository's latest commit SHA before issuing the full metric fetch; and **pruning or aggregating snapshot detail beyond a retention horizon**, since a two-year-old daily snapshot serves no analytical purpose that a weekly aggregate would not, and storage grows unboundedly at one snapshot per project per day.

**Retirement.** Two distinct retirements must be handled and neither currently has an implemented path.

When a *customer offboards*, their connector credentials, snapshots, scores, surveys, responses and action log should be deleted on a stated timetable, and their access tokens revoked at the provider so that they cannot be used even if a copy of the ciphertext survives. When the *system itself* is retired, the same applies across all tenants, together with deletion of embeddings held in the external Pinecone index — which lives outside the primary database and is easily overlooked precisely because deleting the Postgres rows feels like completing the job.

**Neither path exists today.** Gap G-02 records that no retention schedule is defined, and G-01 that no erasure mechanism is exposed. This is simultaneously a sustainability gap and a data-protection exposure, and it is required work before any handover to SSCL.

## 6.5 Ethics

### 6.5.1 Equity and inclusivity

**Accessibility.** The frontend is built on Radix UI primitives, which supply keyboard interaction and ARIA semantics for dialogs, menus, tabs and similar components by default, so a baseline is inherited rather than earned. Beyond that baseline, this evaluation found deliberate accessibility work in the codebase: 46 `aria-label` attributes, 23 explicit `role` assignments, and uses of `aria-hidden`, `aria-expanded`, `aria-modal`, `aria-labelledby`, `aria-haspopup`, `aria-checked` and `aria-valuenow`, plus one visually-hidden (`sr-only`) heading. That is more than an untouched component library provides and indicates the concern was actively considered.

What has **not** been established is conformance. No automated audit or assistive-technology testing was performed; colour contrast ratios have not been measured against the WCAG Level AA threshold; and the Recharts trend visualisations offer limited screen-reader semantics. A specific risk worth checking is that risk level is bucketed into LOW/MEDIUM/HIGH at the 40/70 thresholds and rendered with colour coding — a red/amber/green scale is the classic failure mode for colour-vision deficiency unless the numeric value is always rendered alongside it. Conformance is therefore claimed as **partial and unverified**, consistent with gap G-06, and attributable to C-02: the team had no dedicated design or accessibility specialist.

**Fairness across teams of different shapes.** The system must not advantage teams that happen to use the tools it integrates best. Two provisions address this. Weight renormalisation (FR-22) means a team without SonarQube or without Jira is scored on what it does have rather than penalised for what it lacks — and §5.1.2 shows what the alternative would have cost such a team: on the worked example, a security score of 12 rather than 80, decided entirely by which tools were connected rather than by how the team works. The connector abstraction (NFR-21) means a team on a different toolchain is excluded by implementation effort rather than by design, as the six shipped connectors demonstrate.

**Who is excluded.** Three groups, stated plainly. Teams whose tools have no connector cannot be scored at all. Very small teams cannot use the survey system safely: the minimum-response threshold either suppresses their insight or, if lowered, weakens their anonymity — and at present it does neither, because it is not enforced (§5.3.6), which resolves the tension in the least protective direction. And newly adopted projects have no trend data at all, since C-06 records that historical backfill is impossible, so the system is least useful precisely when a team first tries it and must be persuaded of its value.

### 6.5.2 Accountability and personal responsibility

**For the system's output.** Pulse produces diagnostic signals about projects, not judgements about people, and that distinction is load-bearing rather than rhetorical. A score identifies where to look; accountability for what is done with that information rests with the manager who acts on it, not with the tool. The design supports this rather than merely asserting it: every score is decomposable into the metrics that produced it (FR-26, NFR-20), so a manager cannot honestly treat a number as an unexaminable verdict, and the deliberate separation of the connector-derived risk score from the AI-derived survey insight means neither silently contaminates the other's meaning.

**For the system's failures.** **[TEAM INPUT: state who is accountable for operational failure both now and after handover — a missed scheduled synchronisation, a survey dispatched to the wrong recipients, an exposed credential. This follows directly from the custody decisions in §6.1.4, and "the student who owns the Render account" is the honest answer today.]**

**Within the team.** Every change reached `main` through a reviewed pull request, so each change carries both an identified author and an identified reviewer, and the automated gate of NFR-23 meant neither could merge work that failed to build or to pass its tests. **[TEAM INPUT: add how module ownership was assigned, and what a member was expected to do when a post-merge limitation surfaced in their module.]**

**A note on this evaluation.** The gap reported in §5.3.6 was identified by the team's own adversarial investigation of its privacy guarantee. Accountability for a system's behaviour includes disclosing where implementation and specification do not yet align, particularly where the specification is a promise made to third parties — in this case SSCL's developers, whose responses are intended to be protected by a minimum cohort threshold.

### 6.5.3 Proper use of intellectual property

**Third-party software.** The system is built on open-source dependencies consumed through npm. On the backend: Express, `@supabase/supabase-js`, BullMQ, ioredis, Octokit (with the retry and throttling plugins), `@slack/web-api`, `@google/genai`, bcryptjs, helmet, cors, cookie-parser, morgan, pino, express-rate-limit, fast-xml-parser, adm-zip, nodemailer and resend. On the frontend: React, Vite, React Router, Tailwind CSS, Radix UI, MUI (`@mui/material`, `@mui/icons-material`), Recharts, Emotion, `react-hook-form`, `date-fns`, `lucide-react`, `next-themes`, `motion`, `cmdk`, `sonner`, `react-dnd`, `canvas-confetti` and others, with ESLint, TypeScript and Vitest in the toolchain.

`frontend/ATTRIBUTIONS.md` exists and should be the canonical attribution list. **[TEAM INPUT: confirm it is complete and current, extend it to cover the backend dependencies if it presently covers only the frontend, and cite it explicitly here. Verify licences rather than assuming them — most of the above are MIT or Apache-2.0, but MUI's and Recharts' terms and any copyleft transitive dependency should be checked individually. A licence obligation discovered at handover is considerably worse than one handled now; `npx license-checker --summary` will produce the inventory in a few seconds.]**

**Third-party services.** GitHub, GitLab, Jira, Linear, SonarCloud, Gemini, Pinecone, Brevo, Slack, Telegram and Discord are used through their public APIs under their respective terms of service, read-only against the partner's instances using tokens the partner supplies (C-07). SH-06 records adherence to those terms as a stakeholder expectation, and the rate-limit provisions verified in §5.1.5 are part of honouring it rather than merely of staying within a budget.

**Partner material.** Work is conducted under a non-disclosure agreement with SSCL (C-09) governing both the handling of their data and what this report may disclose. **[TEAM INPUT: state explicitly what has been withheld or generalised in this report for that reason, so that an examiner reading a deliberately vague passage understands why it is vague rather than reading it as imprecision.]**

**Generative AI.** The candidates' declaration requires disclosure of generative-AI use, and it should be stated specifically and completely, separating the *product* from the *process*.

- **In the product:** Google Gemini is a runtime component of the delivered system. It generates survey questions, analyses survey responses to produce insight, and asynchronously produces stored action embeddings (`gemini-embedding-001`). The current deep-search request path reranks action candidates directly through Pinecone; INV-3 found that it does not fall back when Pinecone is unavailable. This is disclosed as an architectural dependency, not as authoring assistance, and is described throughout Chapters 4 and 5.
- **In the process:** the repository history records **2 commits authored by `copilot-swe-agent[bot]`**, so AI coding assistance was used and must be disclosed. **[TEAM INPUT: state which parts of the codebase and of this report involved AI assistance and in what role — scaffolding, review, drafting or editing — and confirm that the team verified the output and takes responsibility for it. Under-disclosure here is an academic-integrity finding; over-disclosure costs nothing. Note that this report's Chapters 5 and 6 were drafted with AI assistance against measurements taken from the repository, and that the team verified the figures; say so if that is accurate.]**

### 6.5.4 Professionalism and ethical codes

Three principles of the **ACM Code of Ethics and Professional Conduct** bore directly on decisions recorded elsewhere in this report. They are given here with the decision each governed and the cheaper alternative that was rejected, because that is what distinguishes engagement with a code from citation of one.

**Respect privacy (ACM 1.6).** The Code requires that systems collecting personal information collect only what is necessary and not repurpose it beyond what the subject understood. Pulse collects opinions about a project's condition from people whose employer will read the result. The decision this principle governed was *where* to enforce anonymity. Omitting identity from `survey_response` means direct attribution would require a deliberate schema change rather than an accidental application join. Investigation INV-2 also showed the limit of that protection: shared-token and recipient-linkage properties still depend on current application behaviour, statistical inference remains possible, and the application-level k-anonymity threshold was found never to have run. The same principle obliges the disclosure in §5.3.6; ACM 1.3 (honesty about limitations) forbids reporting the guarantee without the gap.

**Avoid harm (ACM 1.2) and evaluate the risks of systems (ACM 2.5).** The foreseeable harm from this system is not technical failure but correct operation misapplied: scores read as verdicts on individuals, survey findings used to identify dissenters. ACM 2.5 requires comprehensive risk evaluation rather than a favourable one, which is why §6.3 records the misuse the design *cannot* prevent alongside the two it can, and why §5.1.3 was conducted as an adversarial exercise against the team's own system rather than as a confirmation of it.

**Hold the public good as the central concern (ACM 3.1; IEEE Code of Ethics clause 1).** This principle settled the two decisions where user welfare and engineering convenience pulled in opposite directions. Removing the manual-guidance override (§5.3.2) discarded working, client-requested functionality because it would have quietly biased what the survey measured, and therefore what developers were understood to have said. The deferrable effectiveness review (FR-40) accepts a weaker dataset rather than pressing an owner to certify an outcome before the evidence exists. In both cases the convenient option was available, defensible on delivery grounds, and not taken.

**[TEAM INPUT: if your department expects the IEB code of ethics specifically, add a paragraph mapping one decision to a named clause of it, following the same pattern used above — principle, the decision it governed, and the cheaper option rejected.]**

---

# Appendix A: Reproducing the measurements

Every repository-derived quantitative figure in Chapter 5 can be regenerated using the commands below. The figures were refreshed at commit `4639e0e` on 2026-09-21.

| Figure | Command |
|---|---|
| Type check (Table 5.4) | `cd backend && npm run typecheck` |
| Lint findings and warning counts | `cd backend && npm run lint` |
| Vitest file/test counts and pass state | `cd backend && npx vitest run` |
| Coverage, overall and per-area (Tables 5.8, 5.9) | `cd backend && npm run test:coverage` |
| Action-search suite (INV-3) | `cd backend && npm run test:actions` |
| Test file and case counts | `find backend/apps backend/libs backend/tests -name "*.test.ts" \| wc -l` |
| Repository activity (Table 6.1) | `git rev-list --count HEAD` ; `git log --merges --oneline \| wc -l` ; `git log --oneline --grep="Merge pull request" \| wc -l` |
| Contributors (Table 6.4) | `git log --format='%an' \| sort \| uniq -c \| sort -rn` |
| NFR-08 threshold verification (§5.1.3) | `grep -rn "surveyMinAnonymousResponses" backend/apps backend/libs frontend/src` — returns three occurrences, none of them a comparison; then read `backend/apps/api/services/survey-insight.service.ts:40` |

**Section 5.1.2** cites `backend/libs/risk-engines/scoring.test.ts` (assertions at lines 48, 56, 68, 80 and 89) and the weight vector in `backend/libs/risk-engines/risks/security/security.strategy.ts`. The worked example is arithmetic and can be checked by hand against those weights.

---

# Appendix B: Checklist of items requiring team input

Ordered by how much they affect the report's credibility if left unresolved.

**Must resolve before submission**

1. **Team size discrepancy** (§6.2.1) — five students declared in Chapter 3 and on the signed declaration, four contributors in the repository.
2. **NFR-08 threshold disposition** (§5.3.6) — apply the revision and update Tables 5.11 and 5.12, or record it as outstanding. Do not leave the narrative and the tables inconsistent.
3. **Encryption disable/re-enable cause and resolution** (§5.3.4) — an unexplained commit pair that switches off a security control is the worst kind of silence.
4. **Chapter 1 scope vs. six connectors and three notification channels** (§5.3.5).
5. **Chapter 2 "worker remains unhosted" vs. C-08 and the live Render deployment** (§5.3.9).
6. **Table 6.5** — per-member roles and contributions.
7. **Generative AI disclosure** (§6.5.3) — including the two `copilot-swe-agent[bot]` commits and this report's own drafting.

**Measurements worth taking (each is under an hour)**

8. **Per-connector API call counts** for INV-4 (§5.1.5) — one instrumented sync of one real project completes the rate-limit derivation.
9. **Security review** (§5.2.2) — run the repository's `/security-review` tooling and report findings, or state that the OWASP response is an unverified self-assessment.
10. **Partner acceptance** (§5.2.2) — state plainly whether any pilot occurred against SSCL data.
11. **Action-search retrieval quality** for INV-3 (§5.1.4) — 20–30 actions with paraphrased queries converts an availability claim into a quality measurement.
12. **Accessibility audit** (§6.5.1) — an automated contrast and ARIA check takes minutes and would upgrade G-06 from unverified.

**Figures and costs**

13. **Gantt chart** of planned vs. actual (§6.1.1).
14. **Budget figures** (Table 6.3) and the derived per-project monthly operating cost (§6.1.3).
15. **Value quantification** for SSCL (§6.1.3).
16. **Handover and custody decisions** (§6.1.4), including the personal Render account and AES key rotation.
17. **Confirmations flagged inline** in Tables 5.10 and 5.11: FR-31 server-side monthly limit, FR-33 rotation fairness, NFR-04 credential leakage in connector exception paths, NFR-14 compensating operations.
