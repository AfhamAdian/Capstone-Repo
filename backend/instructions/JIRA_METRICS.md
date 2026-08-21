## 1. Delivery Velocity

| Metric | DB column | Short note |
|---|---|---|
| `sprintCompletionRate` | `sprint_completion_rate` | % of committed issues that reached a `done` status category, across the last 3 sprints. Needs a board. |
| `issueCycleTimeAvgDays` | `issue_cycle_time_avg_days` | Avg days from `created` → `resolutiondate` for resolved issues. Proxy for how fast work gets finished. |
| `throughputPerWeek` | `throughput_per_week` | Count of issues resolved in the **last 7 days**. Raw delivery volume. |
| `carryoverRate` | `carryover_rate` | % of a sprint's incomplete issues that reappear in the next sprint. Needs ≥2 sprints. |
| `scopeCreepRate` | `scope_creep_rate` | % of sprint issues **created after** the sprint start date (added mid-sprint). Needs a board + `startDate`. |
| `blockedItemsCount` | `blocked_items_count` | Count of issues whose status name contains `blocked` / `impediment` / `waiting`. |
| `blockedItemsAvgAgeDays` | `blocked_items_avg_age_days` | Avg days since last `updated` for those blocked issues. Approximates how long they've been stuck. |
| `overdueItemsCount` | `overdue_items_count` | Count of not-`done` issues whose `duedate` is in the past. |

---

## 2. Lead Time (→ `leadtimetrend` table for the trend)

Lead time = `created` → `resolutiondate` in days, over resolved issues (last 90d).

| Metric | DB column | Short note |
|---|---|---|
| `leadTime.avgDays` | `lead_time_avg_days` | Mean lead time. |
| `leadTime.medianDays` | `lead_time_median_days` | Median (middle value of sorted lead times) — less skewed by outliers than avg. |
| `leadTime.p95Days` | `lead_time_p95_days` | 95th percentile — the "worst-case" tail; long-pole issues. |
| `leadTime.variance` | `lead_time_variance` | Spread of lead times. High variance = unpredictable delivery. |
| `leadTime.trendAcrossSprints[]` | `leadtimetrend` rows | Avg lead time **per sprint** for the last 5 sprints (`sprint_name`, `avg_lead_time_days`). Shows if delivery is speeding up or slowing down. |

---

## 3. Sprint Spillover

Spillover = issues committed in a sprint that were **not** `done` by sprint end. Needs ≥2 sprints; uses last 3.

| Metric | DB column | Short note |
|---|---|---|
| `spillover.spilloverRatio` | `spillover_ratio` | % of committed issues that spilled over. Chronic over-commitment signal. |
| `spillover.consecutiveSpilloverCount` | `consecutive_spillover_count` | Streak of consecutive sprints with any spillover. Sustained delivery pressure. |
| `spillover.carryoverAvgAgeDays` | `carryover_avg_age_days` | Avg age (since `created`) of the spilled-over issues. Older = more stale backlog debt. |

---

## 4. Blocked Work

Blocked = status name contains `blocked` / `impediment` / `waiting`.

| Metric | DB column | Short note |
|---|---|---|
| `blockedWork.blockedTicketPercent` | `blocked_ticket_percent` | Blocked issues as % of all issues. Overall friction level. |
| `blockedWork.avgBlockedDurationDays` | `avg_blocked_duration_days` | Avg days since last update on blocked issues (approx. block duration). |
| `blockedWork.maxBlockedDurationDays` | `max_blocked_duration_days` | Longest-blocked issue — worst impediment. |
| `blockedWork.blockedReentryCount` | `blocked_reentry_count` | Issues that entered a blocked status **more than once** (from changelog). Signals recurring/unresolved blockers. |

---

## 5. Scope Churn

How much sprint scope shifts after it starts. Needs a board; uses last 3 sprints.

| Metric | DB column | Short note |
|---|---|---|
| `scopeChurn.midSprintAdditions` | `mid_sprint_additions` | Total issues added after sprint start across the sprints. |
| `scopeChurn.scopeChurnRatio` | `scope_churn_ratio` | Mid-sprint additions as % of committed scope. Planning instability. |
| `scopeChurn.priorityChangeCount` | `priority_change_count` | Count of `priority` field changes (from changelog) after sprint start. Re-prioritization thrash. |

---

## 6. Stale Tickets

In-progress = `statusCategory.key === 'indeterminate'`.

| Metric | DB column | Short note |
|---|---|---|
| `staleTickets.inProgressAvgAgeDays` | `in_progress_avg_age_days` | Avg days since last update on in-progress issues. |
| `staleTickets.staleTicketRatio` | `stale_ticket_ratio` | % of in-progress issues untouched for > **14 days** (`STALE_DAYS_THRESHOLD`). WIP that's stalling. |
| `staleTickets.stateMovementCount` | `state_movement_count` | Count of `status` transitions (from changelog) on in-progress issues. High = ticket bouncing between states. |

---

## Metrics that feed risk scoring

Only a subset is currently read by the risk engine ([`risk-calculation.service.ts`](../apps/api/src/services/risk-calculation.service.ts)):

- **Delivery risk:** `sprint_completion_rate`, `issue_cycle_time_avg_days`, `throughput_per_week`, `carryover_rate`, `scope_creep_rate`
- **Team Health risk:** `blocked_items_count`, `blocked_items_avg_age_days`, `overdue_items_count`

The Lead Time, Spillover, Blocked Work, Scope Churn, and Stale Ticket detail metrics are **collected and stored but not yet wired into any risk score** — available for dashboards/trends or future scoring.

## Notes

- The 3 placeholder metrics (`estimationAccuracy`, `storyPointSpillover`, `removedScopeRatio`) were **removed** on 2026-07-06 — they always returned `null`/`0`. The delivery-risk weights were renormalized to sum to 1.0 after dropping `estimationAccuracy`.
- Everything under sections 1–6 marked "needs a board" returns `null` when no `boardId` is set.
