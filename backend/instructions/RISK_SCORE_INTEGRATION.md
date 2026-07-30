# Risk Score Integration - Implementation Summary

## Overview
Successfully integrated risk score calculation into the sync workflow. When a sync is triggered for a project, it now:
1. Fetches metrics from GitHub (VCS) and Jira (PM) connectors
2. Creates a project snapshot
3. Persists the metrics to the database
4. **Calculates all 6 risk scores** using the RiskEngine
5. Saves risk scores linked with the project snapshot

## Changes Made

### 1. **Updated Risk Score Database Module** 
   **File**: [apps/api/src/database/risk-score.ts](apps/api/src/database/risk-score.ts)
   
   - Updated to use the correct table name: `riskscore`
   - Links risk scores with `project_snapshot_id` (not a separate type field)
   - Stores individual scores for all 6 risk types:
     - `cicd_reliability_score`
     - `code_qaulity_score` 
     - `delivery_score`
     - `engineering_process_score`
     - `security_risk_score`
     - `team_health_score`
   - Added `saveAllRiskScores()` function to upsert all scores at once

### 2. **Created Risk Calculation Service**
   **File**: [apps/api/src/services/risk-calculation.service.ts](apps/api/src/services/risk-calculation.service.ts)
   
   - New service that orchestrates risk calculation for a project snapshot
   - Fetches all metrics from the database (VCS, PM, code ownership)
   - Maps database metrics to expected risk engine metric types
   - Calculates all 6 risk types:
     1. **Delivery Risk** - Sprint completion, lead time, throughput, scope
     2. **Code Quality Risk** - Coverage, duplication, technical debt (extensible)
     3. **Engineering Process Risk** - PR review, merge practices, commit quality
     4. **CI/CD Reliability Risk** - Pipeline success, deployment frequency (extensible)
     5. **Team Health Risk** - Bus factor, code ownership, active contributors
     6. **Security Risk** - Dependency lag, revert rate (extensible)
   - Saves all scores to the database linked with the snapshot

### 3. **Updated Metrics Persistence**
   **File**: [apps/api/src/database/metrics.ts](apps/api/src/database/metrics.ts)
   
   - Modified `persistConnectorMetrics()` to return the `snapshotId`
   - Previously returned `void`, now returns `number` (snapshot ID)
   - Allows sync processor to know which snapshot was created for risk calculation

### 4. **Updated Sync Processor**
   **File**: [apps/worker/src/processors/sync-processor.ts](apps/worker/src/processors/sync-processor.ts)
   
   - Added import for `calculateAndSaveRiskScores`
   - Captures snapshot ID when persisting metrics
   - After all tools complete successfully, calculates risk scores
   - Risk calculation errors don't fail the sync job (graceful degradation)
   - Logs timing information for performance monitoring

## Data Flow

```
POST /sync {projectId, tools}
    ↓
[SyncService.enqueueSyncJob]
    ↓
[Worker: processSyncJob]
    ├─ For each tool (GitHub, Jira):
    │  ├─ Fetch metrics from connector
    │  ├─ persistConnectorMetrics() → creates projectsnapshot
    │  ├─ Insert versioncontrolmetrics / projectmanagementmetrics
    │  └─ Returns snapshotId
    │
    └─ After all tools complete:
       ├─ calculateAndSaveRiskScores(snapshotId)
       │  ├─ Fetch all metrics for snapshot
       │  ├─ Initialize RiskEngine
       │  ├─ Calculate 6 risk scores
       │  └─ saveAllRiskScores(snapshotId, scores)
       │     └─ INSERT into riskscore table
       │
       └─ Emit completion event
```

## Database Schema Integration

The `riskscore` table structure matches the new integration:
- `id` - Primary key (auto-generated)
- `created_at` - Timestamp (auto-populated)
- `project_snapshot_id` - Foreign key linking to projectsnapshot
- `cicd_reliability_score` - DOUBLE PRECISION
- `code_qaulity_score` - DOUBLE PRECISION
- `delivery_score` - DOUBLE PRECISION
- `engineering_process_score` - DOUBLE PRECISION
- `security_risk_score` - DOUBLE PRECISION
- `team_health_score` - DOUBLE PRECISION

## Risk Metrics Mapping

### From Database → Risk Engine
The service maps database column names to expected metric names:

**Version Control Metrics** (versioncontrolmetrics table):
- `pr_review_coverage_percent` → prReviewCoveragePercent
- `self_merged_pr_rate_percent` → selfMergedPrRatePercent
- `time_to_first_review_avg_hours` → timeToFirstReviewHours
- `commit_following_convention_percent` → commitMessageQualityPercent
- `bus_factor` → busFactor
- `review_network_density` → reviewNetworkDensityPercent
- `dependency_update_lag_avg_days` → dependencyUpdateLagDays
- And more...

**Project Management Metrics** (projectmanagementmetrics table):
- `sprint_completion_rate` → sprintCompletionRate
- `issue_cycle_time_avg_days` → issueCycleTimeDays
- `blocked_items_count` → blockedItemsCount
- And more...

**Code Ownership** (codeownershipconcentration table):
- Aggregated `top_contributor_percent` → codeOwnershipConcentrationPercent

## Error Handling

- If metric fetching fails: Error is logged and caught
- If risk calculation fails: Error is logged but doesn't fail the sync job
- All errors are properly typed and logged with context

## Next Steps (Optional Enhancements)

1. **Add weight configurations** - Allow users to customize risk weights per project
2. **Add security metrics** - Integrate with SAST/DAST tools for actual vulnerability counts
3. **Add CI/CD metrics** - Connect to Jenkins/GitLab CI for pipeline data
4. **Add historical tracking** - Calculate trends across snapshots
5. **Add risk alerts** - Notify when scores exceed thresholds

## Testing

To test the functionality:
1. Create a project with GitHub and/or Jira integrations configured
2. Trigger a sync by calling POST `/api/sync` with the project ID
3. Monitor worker logs for risk calculation messages
4. Check the `riskscore` table for entries linked to the project snapshot

All six risk scores should be calculated and stored for each snapshot created.
