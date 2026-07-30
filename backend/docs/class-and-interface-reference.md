# Class and Interface Reference

## Scope

This document covers the current TypeScript backend only:
- API app under [apps/api/src](../apps/api/src)
- Worker app under [apps/worker/src](../apps/worker/src)
- Shared libraries under [libs](../libs)

Legacy JavaScript files under [src](../src) are not part of the main architecture, but they are noted at the end for completeness.

## Relationship legend

- **implements**: a class fulfills an interface contract
- **extends**: a type inherits from another type
- **depends on**: a module or class uses another module/class
- **calls**: a function invokes another function
- **emits**: a module publishes events or messages

---

## 1) API layer

### [apps/api/src/server.ts](../apps/api/src/server.ts)

**Role**
- Express application bootstrap.
- Mounts middleware and routes.

**Depends on**
- [apps/api/src/routes/index.ts](../apps/api/src/routes/index.ts)
- [apps/api/src/middlewares/not-found.middleware.ts](../apps/api/src/middlewares/not-found.middleware.ts)
- [apps/api/src/middlewares/error.middleware.ts](../apps/api/src/middlewares/error.middleware.ts)
- [apps/api/src/config/env.ts](../apps/api/src/config/env.ts)

**Main behavior**
- Creates the Express app.
- Registers Helmet, CORS, JSON parsing, URL encoding, and Morgan logging.
- Exposes a health-like root endpoint at `/api/v1`.
- Starts the HTTP server.

---

### [apps/api/src/routes/index.ts](../apps/api/src/routes/index.ts)

**Role**
- Route aggregator.

**Depends on**
- [apps/api/src/routes/health.route.ts](../apps/api/src/routes/health.route.ts)
- [apps/api/src/routes/sync.route.ts](../apps/api/src/routes/sync.route.ts)
- [apps/api/src/routes/progress.route.ts](../apps/api/src/routes/progress.route.ts)

**Main behavior**
- Mounts `/health`, `/sync`, and `/progress`.
- Keeps routing thin and modular.

---

### [apps/api/src/controllers/health.controller.ts](../apps/api/src/controllers/health.controller.ts)

**Exports**
- `healthCheck`

**Depends on**
- [apps/api/src/services/health.service.ts](../apps/api/src/services/health.service.ts)
- [apps/api/src/utils/async-handler.ts](../apps/api/src/utils/async-handler.ts)

**Behavior**
- Handles health requests.
- Returns the current status from `getHealthStatus()`.

**Overrides / inheritance**
- None. This is a function export, not a class.

---

### [apps/api/src/controllers/sync.controller.ts](../apps/api/src/controllers/sync.controller.ts)

**Exports**
- `enqueueSyncJob`
- `getSyncStatus`

**Depends on**
- [libs/queue/queue-manager.ts](../libs/queue/queue-manager.ts)
- [apps/api/src/services/sync.service.ts](../apps/api/src/services/sync.service.ts)
- [apps/api/src/config/env.ts](../apps/api/src/config/env.ts)
- [libs/sync/types.ts](../libs/sync/types.ts)

**Behavior**
- Validates sync requests.
- Enqueues sync jobs.
- Exposes job status lookup.

**Notes**
- The controller creates a `QueueManager` instance and a `SyncService` instance at module scope.
- This is module-level composition, not class inheritance.

---

### [apps/api/src/controllers/progress.controller.ts](../apps/api/src/controllers/progress.controller.ts)

**Exports**
- `streamSyncProgress`

**Depends on**
- [libs/queue/event-store.ts](../libs/queue/event-store.ts)
- [libs/sync/types.ts](../libs/sync/types.ts)

**Behavior**
- Opens an SSE stream for a given session.
- Replays the last completion event if available.
- Subscribes to Redis Pub/Sub updates.
- Closes the stream on terminal status.

**Important interaction**
- This is the UI-facing stream endpoint that receives events emitted by the worker through `eventStore`.

**Overrides / inheritance**
- None. This is a function export, not a class.

---

### [apps/api/src/services/health.service.ts](../apps/api/src/services/health.service.ts)

**Exports**
- `getHealthStatus`

**Depends on**
- [apps/api/src/config/env.ts](../apps/api/src/config/env.ts)
- [apps/api/src/config/supabase.ts](../apps/api/src/config/supabase.ts)

**Behavior**
- Reports application and Supabase connectivity health.
- Returns a structured status object.

---

### [apps/api/src/services/sync.service.ts](../apps/api/src/services/sync.service.ts)

**Class**
- `SyncService`

**Depends on**
- [libs/queue/queue-manager.ts](../libs/queue/queue-manager.ts)
- [apps/api/src/database/project.ts](../apps/api/src/database/project.ts)
- [libs/sync/types.ts](../libs/sync/types.ts)

**Public methods**
- `enqueueSyncJob(payload)`
- `getSyncJobStatus(jobId)`

**Main behavior**
- Resolves project integrations.
- Generates a job ID.
- Enqueues the sync job via `QueueManager`.
- Returns the `jobId` and SSE stream key.

**Relationships**
- **depends on** `QueueManager`
- **calls** `getProjectIntegrationsForTools()`

**Overrides / inheritance**
- None. This is a concrete service class.

---

## 2) Queue and event transport

### [libs/queue/queue-manager.ts](../libs/queue/queue-manager.ts)

**Class**
- `QueueManager`

**Depends on**
- BullMQ `Queue`
- BullMQ `Worker`
- [libs/sync/types.ts](../libs/sync/types.ts)

**Constructor input**
- `QueueConfig`

**Public methods**
- `enqueue(jobData)`
- `createWorker(processor)`
- `getJobStatus(jobId)`
- `close()`

**Behavior**
- Wraps BullMQ queue creation and job enqueueing.
- Creates the worker instance used by the worker process.
- Exposes job status lookup.

**Relationships**
- **depends on** BullMQ as infrastructure.
- **calls** the supplied processor when creating a worker.

**Overrides / inheritance**
- None.

---

### [libs/queue/event-store.ts](../libs/queue/event-store.ts)

**Class**
- `EventStore`

**Exported instance**
- `eventStore`

**Depends on**
- `ioredis`
- [libs/sync/types.ts](../libs/sync/types.ts)

**Public methods**
- `subscribe(sessionId, callback)`
- `emitProgress(event)`
- `emitCompletion(event)`
- `getLastCompletion(sessionId)`

**Behavior**
- Publishes sync progress and completion events to Redis Pub/Sub.
- Stores the last completion event for replay.
- Maintains in-process subscriber callbacks per session channel.

**Relationships**
- **emits** progress and completion events.
- **depends on** Redis for transport.
- **serves** the SSE controller on the API side.

**Overrides / inheritance**
- None.

---

### [libs/sync/types.ts](../libs/sync/types.ts)

**Key types**
- `ToolCategory`
- `VcsProvider`
- `ProjectManagementProvider`
- `CicdProvider`
- `CodeQualityProvider`
- `SupportedTool`
- `SyncRequestPayload`
- `SyncJob`
- `SyncProgressEvent`
- `SyncCompletionEvent`
- `ConnectorOutput`
- `SyncJobItem`

**Role**
- Shared DTO and event contract definitions.

**Relationships**
- Used by controllers, queueing, worker processing, connectors, and SSE.

---

## 3) Sync connector contracts and implementations

### [libs/sync/connector.interface.ts](../libs/sync/connector.interface.ts)

**Interfaces**
- `ConnectorCredentials`
- `ConnectorProject`
- `CreateConnectorInput`
- `IConnector`

**Important contract**
- `IConnector` requires `getData(): Promise<ConnectorOutput>`.

**Role**
- General connector abstraction across tool families.

**Relationships**
- Implemented by all concrete tool connectors in the current runtime path.

---

### [libs/sync/connector-registry.ts](../libs/sync/connector-registry.ts)

**Exports**
- `createConnector(input)`
- `getSupportedTools()`

**Depends on**
- [libs/connectors/vcs/GithubConnector/github.connector.ts](../libs/connectors/vcs/GithubConnector/github.connector.ts)
- [libs/connectors/vcs/GitlabConnector/gitlab.connector.ts](../libs/connectors/vcs/GitlabConnector/gitlab.connector.ts)
- [libs/connectors/pm/JiraConnector/jira.connector.ts](../libs/connectors/pm/JiraConnector/jira.connector.ts)
- [libs/sync/connector.interface.ts](../libs/sync/connector.interface.ts)

**Behavior**
- Maps tool names to concrete connector factories.
- Creates the correct connector based on the requested tool.

**Relationships**
- **depends on** connector implementations.
- **calls** constructors of concrete connectors.

**Overrides / inheritance**
- None.

---

### [libs/connectors/vcs/connector.interface.ts](../libs/connectors/vcs/connector.interface.ts)

**Interface**
- `IVcsConnector`

**Required method**
- `getData(): Promise<unknown>`

**Role**
- Older VCS-specific abstraction.

**Relationships**
- Implemented by GitHub and GitLab connectors.

---

### [libs/connectors/pm/connector.interface.ts](../libs/connectors/pm/connector.interface.ts)

**Interface**
- `IPmConnector`

**Required method**
- `getData(): Promise<unknown>`

**Role**
- Project-management-specific abstraction.

**Relationships**
- Implemented by Jira and Linear connectors.

---

### [libs/connectors/vcs/GithubConnector/github.connector.ts](../libs/connectors/vcs/GithubConnector/github.connector.ts)

**Class**
- `GitHubConnector`

**Implements**
- `IVcsConnector`
- `IConnector`

**Depends on**
- `@octokit/rest`
- [libs/connectors/vcs/connector.interface.ts](../libs/connectors/vcs/connector.interface.ts)
- [libs/connectors/vcs/types.ts](../libs/connectors/vcs/types.ts)
- [libs/connectors/vcs/github-metrics.types.ts](../libs/connectors/vcs/github-metrics.types.ts)
- [libs/sync/connector.interface.ts](../libs/sync/connector.interface.ts)

**Constructor**
- `constructor(input: CreateVcsConnectorInput)`

**Required methods**
- `getData()`

**Other important internal methods**
- `checkRateLimit()`
- `getTimeframe(days)`
- many private metric helpers

**Behavior**
- Fetches GitHub repo activity and calculates normalized metrics.
- Returns `ConnectorOutput` with GitHub metrics payload.

**Contract notes**
- Must implement `getData()` from both interfaces.
- No class inheritance is involved.

---

### [libs/connectors/vcs/GitlabConnector/gitlab.connector.ts](../libs/connectors/vcs/GitlabConnector/gitlab.connector.ts)

**Class**
- `GitLabConnector`

**Implements**
- `IVcsConnector`
- `IConnector`

**Depends on**
- [libs/connectors/vcs/connector.interface.ts](../libs/connectors/vcs/connector.interface.ts)
- [libs/connectors/vcs/types.ts](../libs/connectors/vcs/types.ts)
- [libs/sync/connector.interface.ts](../libs/sync/connector.interface.ts)

**Constructor**
- `constructor(input: CreateVcsConnectorInput)`

**Required methods**
- `getData()`

**Behavior**
- Currently a placeholder implementation.
- Throws an error because full GitLab metrics fetching is not finished.

---

### [libs/connectors/pm/JiraConnector/jira.connector.ts](../libs/connectors/pm/JiraConnector/jira.connector.ts)

**Class**
- `JiraConnector`

**Implements**
- `IPmConnector`
- `IConnector`

**Depends on**
- [libs/connectors/pm/connector.interface.ts](../libs/connectors/pm/connector.interface.ts)
- [libs/connectors/pm/types.ts](../libs/connectors/pm/types.ts)
- [libs/connectors/pm/jira-metrics.types.ts](../libs/connectors/pm/jira-metrics.types.ts)
- [libs/sync/connector.interface.ts](../libs/sync/connector.interface.ts)

**Constructor**
- `constructor(input: CreatePmConnectorInput)`

**Required methods**
- `getData()`

**Important internal methods**
- `fetchWithAuth()`
- `fetchProjectInfo()`
- `fetchIssues()`
- `fetchSprints()`
- many metric calculation helpers

**Behavior**
- Fetches Jira issues, sprint data, and project metadata.
- Calculates delivery and engineering-process-related metrics.
- Returns `ConnectorOutput` with Jira metrics payload.

---

### [libs/connectors/pm/LinearConnector/linear.connector.ts](../libs/connectors/pm/LinearConnector/linear.connector.ts)

**Class**
- `LinearConnector`

**Implements**
- `IPmConnector`

**Depends on**
- [libs/connectors/pm/connector.interface.ts](../libs/connectors/pm/connector.interface.ts)
- [libs/connectors/pm/types.ts](../libs/connectors/pm/types.ts)

**Constructor**
- `constructor(input: CreatePmConnectorInput)`

**Required methods**
- `getData()`

**Behavior**
- Placeholder implementation.
- Throws an error because Linear ingestion is not yet implemented.

---

### [libs/connectors/vcs/types.ts](../libs/connectors/vcs/types.ts)

**Types**
- `VcsProvider`
- `VcsCredentials`
- `VcsProject`
- `CreateVcsConnectorInput`

**Role**
- Specialized VCS connector creation contract.

---

### [libs/connectors/pm/types.ts](../libs/connectors/pm/types.ts)

**Types**
- `PmProvider`
- `PmCredentials`
- `PmProject`
- `CreatePmConnectorInput`

**Role**
- Specialized PM connector creation contract.

---

## 4) Worker pipeline

### [apps/worker/src/worker.ts](../apps/worker/src/worker.ts)

**Role**
- Worker process bootstrap.

**Depends on**
- [libs/queue/queue-manager.ts](../libs/queue/queue-manager.ts)
- [apps/worker/src/processors/sync-processor.ts](../apps/worker/src/processors/sync-processor.ts)

**Behavior**
- Starts the BullMQ worker that consumes sync jobs.

**Relationships**
- **depends on** QueueManager for worker creation.

---

### [apps/worker/src/processors/sync-processor.ts](../apps/worker/src/processors/sync-processor.ts)

**Exported function**
- `processSyncJob(jobData)`

**Depends on**
- [libs/sync/connector-registry.ts](../libs/sync/connector-registry.ts)
- [libs/queue/event-store.ts](../libs/queue/event-store.ts)
- [apps/api/src/database/metrics.ts](../apps/api/src/database/metrics.ts)
- [apps/api/src/services/risk-calculation.service.ts](../apps/api/src/services/risk-calculation.service.ts)
- [libs/sync/types.ts](../libs/sync/types.ts)

**Behavior**
- Processes each requested tool.
- Emits progress events.
- Creates the connector.
- Fetches connector data.
- Persists metrics.
- Calculates risk scores.
- Emits completion events.

**Important runtime note**
- Tools are currently processed sequentially within a job.
- The overall architecture is asynchronous, but the per-job tool loop is not parallelized.

**Overrides / inheritance**
- None. This is a function, not a class method override.

---

## 5) Risk engine

### [libs/risk-engines/risk-calculator.interface.ts](../libs/risk-engines/risk-calculator.interface.ts)

**Interface**
- `RiskCalculator<TMetrics>`

**Required methods**
- `getType(): RiskType`
- `calculate(metrics: TMetrics): RiskResult`

**Role**
- Shared contract for all risk strategies.

**Relationships**
- Extended by all pillar-specific calculator interfaces.

---

### [libs/risk-engines/risks/delivery/delivery-risk-calculator.interface.ts](../libs/risk-engines/risks/delivery/delivery-risk-calculator.interface.ts)

**Interface**
- `DeliveryRiskCalculator`

**Extends**
- `RiskCalculator<DeliveryMetrics>`

**Required methods**
- `getType()`
- `calculate(metrics)`

---

### [libs/risk-engines/risks/code-quality/code-quality-risk-calculator.interface.ts](../libs/risk-engines/risks/code-quality/code-quality-risk-calculator.interface.ts)

**Interface**
- `CodeQualityRiskCalculator`

**Extends**
- `RiskCalculator<CodeQualityMetrics>`

**Required methods**
- `getType()`
- `calculate(metrics)`

---

### [libs/risk-engines/risks/engineering-process/engineering-process-risk-calculator.interface.ts](../libs/risk-engines/risks/engineering-process/engineering-process-risk-calculator.interface.ts)

**Interface**
- `EngineeringProcessRiskCalculator`

**Extends**
- `RiskCalculator<EngineeringProcessMetrics>`

**Required methods**
- `getType()`
- `calculate(metrics)`

---

### [libs/risk-engines/risks/cicd-reliability/cicd-reliability-risk-calculator.interface.ts](../libs/risk-engines/risks/cicd-reliability/cicd-reliability-risk-calculator.interface.ts)

**Interface**
- `CicdReliabilityRiskCalculator`

**Extends**
- `RiskCalculator<CicdReliabilityMetrics>`

**Required methods**
- `getType()`
- `calculate(metrics)`

---

### [libs/risk-engines/risks/team-health/team-health-risk-calculator.interface.ts](../libs/risk-engines/risks/team-health/team-health-risk-calculator.interface.ts)

**Interface**
- `TeamHealthRiskCalculator`

**Extends**
- `RiskCalculator<TeamHealthMetrics>`

**Required methods**
- `getType()`
- `calculate(metrics)`

---

### [libs/risk-engines/risks/security-risk/security-risk-risk-calculator.interface.ts](../libs/risk-engines/risks/security-risk/security-risk-risk-calculator.interface.ts)

**Interface**
- `SecurityRiskRiskCalculator`

**Extends**
- `RiskCalculator<SecurityRiskMetrics>`

**Required methods**
- `getType()`
- `calculate(metrics)`

---

### [libs/risk-engines/risk-engine.ts](../libs/risk-engines/risk-engine.ts)

**Class**
- `RiskEngine`

**Depends on**
- [libs/risk-engines/types.ts](../libs/risk-engines/types.ts)
- [libs/risk-engines/risks/*](../libs/risk-engines/risks)
- [apps/api/src/database/risk-score.ts](../apps/api/src/database/risk-score.ts)

**Public methods**
- `calculateRisk(type, metrics)`
- `getLevel(score)`
- `saveToDB(result)`

**Behavior**
- Dispatches to the appropriate risk strategy.
- Converts a numeric score into LOW / MEDIUM / HIGH.
- Saves a risk result to the database.

**Relationships**
- **depends on** the strategy classes.
- **calls** the corresponding strategy based on `RiskType`.
- **does not extend** the strategies; it composes them.

**Overrides / inheritance**
- None.

---

### Risk strategy classes

#### [libs/risk-engines/risks/delivery/delivery.strategy.ts](../libs/risk-engines/risks/delivery/delivery.strategy.ts)
- **Class**: `DeliveryStrategy`
- **Implements**: `DeliveryRiskCalculator`
- **Required methods**: `getType()`, `calculate(metrics)`
- **Behavior**: Calculates delivery velocity risk.

#### [libs/risk-engines/risks/code-quality/code-quality.strategy.ts](../libs/risk-engines/risks/code-quality/code-quality.strategy.ts)
- **Class**: `CodeQualityStrategy`
- **Implements**: `CodeQualityRiskCalculator`
- **Required methods**: `getType()`, `calculate(metrics)`
- **Behavior**: Calculates code quality risk.

#### [libs/risk-engines/risks/engineering-process/engineering-process.strategy.ts](../libs/risk-engines/risks/engineering-process/engineering-process.strategy.ts)
- **Class**: `EngineeringProcessStrategy`
- **Implements**: `EngineeringProcessRiskCalculator`
- **Required methods**: `getType()`, `calculate(metrics)`
- **Behavior**: Calculates engineering-process risk.

#### [libs/risk-engines/risks/cicd-reliability/cicd-reliability.strategy.ts](../libs/risk-engines/risks/cicd-reliability/cicd-reliability.strategy.ts)
- **Class**: `CicdReliabilityStrategy`
- **Implements**: `CicdReliabilityRiskCalculator`
- **Required methods**: `getType()`, `calculate(metrics)`
- **Behavior**: Calculates CI/CD reliability risk.

#### [libs/risk-engines/risks/team-health/team-health.strategy.ts](../libs/risk-engines/risks/team-health/team-health.strategy.ts)
- **Class**: `TeamHealthStrategy`
- **Implements**: `TeamHealthRiskCalculator`
- **Required methods**: `getType()`, `calculate(metrics)`
- **Behavior**: Calculates team health risk.

#### [libs/risk-engines/risks/security-risk/security-risk.strategy.ts](../libs/risk-engines/risks/security-risk/security-risk.strategy.ts)
- **Class**: `SecurityRiskStrategy`
- **Implements**: `SecurityRiskRiskCalculator`
- **Required methods**: `getType()`, `calculate(metrics)`
- **Behavior**: Calculates security risk.

**Common note for all strategies**
- They are concrete strategy classes.
- They do not override a shared base class method.
- Their contract is defined by the interface they implement.

---

### [libs/risk-engines/types.ts](../libs/risk-engines/types.ts)

**Key types**
- `RiskType`
- `RiskResult`
- `RiskMetricsByType`
- `DeliveryMetrics`
- `CodeQualityMetrics`
- `EngineeringProcessMetrics`
- `CicdReliabilityMetrics`
- `TeamHealthMetrics`
- `SecurityRiskMetrics`

**Role**
- Shared pillar metric contracts and result definitions.

---

## 6) Persistence and orchestration

### [apps/api/src/database/metrics.ts](../apps/api/src/database/metrics.ts)

**Exports**
- `persistConnectorMetrics(input)`

**Depends on**
- [apps/api/src/config/supabase.ts](../apps/api/src/config/supabase.ts)
- [libs/connectors/vcs/github-metrics.types.ts](../libs/connectors/vcs/github-metrics.types.ts)
- [libs/connectors/pm/jira-metrics.types.ts](../libs/connectors/pm/jira-metrics.types.ts)

**Behavior**
- Creates a project snapshot row.
- Persists GitHub metrics into version-control tables.
- Persists Jira metrics into project-management tables.
- Returns the created snapshot ID.

**Important note**
- The worker stores the first snapshot ID for later risk calculation.
- This means the snapshot acts as the bridge between ingestion and scoring.

---

### [apps/api/src/services/risk-calculation.service.ts](../apps/api/src/services/risk-calculation.service.ts)

**Exports**
- `calculateAndSaveRiskScores(projectSnapshotId)`

**Depends on**
- [libs/risk-engines/risk-engine.ts](../libs/risk-engines/risk-engine.ts)
- [libs/risk-engines/types.ts](../libs/risk-engines/types.ts)
- [apps/api/src/database/risk-score.ts](../apps/api/src/database/risk-score.ts)
- [apps/api/src/config/supabase.ts](../apps/api/src/config/supabase.ts)

**Behavior**
- Loads metrics for a project snapshot.
- Builds risk metric objects.
- Uses `RiskEngine` to calculate each pillar score.
- Saves all scores to the database.

**Relationships**
- **depends on** `RiskEngine`
- **calls** `saveAllRiskScores()`

---

### [apps/api/src/database/risk-score.ts](../apps/api/src/database/risk-score.ts)

**Exports**
- `saveRiskScore(...)`
- `saveAllRiskScores(...)`

**Role**
- Writes risk results to Supabase.

**Relationships**
- Used by `RiskEngine.saveToDB()` and `calculateAndSaveRiskScores()`.

---

## 7) Legacy code note

### [src](../src)

**Status**
- Legacy JavaScript path.

**Files**
- [src/server.js](../src/server.js)
- [src/config/db.js](../src/config/db.js)
- [src/controllers/homeController.js](../src/controllers/homeController.js)
- [src/routes/homeRoutes.js](../src/routes/homeRoutes.js)

**Role**
- Older app structure.
- Not part of the main TypeScript diagram or the main reference model.

---

## 8) Main interaction flow summary

1. The client sends `POST /api/v1/sync`.
2. `enqueueSyncJob()` validates the payload and calls `SyncService.enqueueSyncJob()`.
3. `SyncService` loads integrations and sends job data to `QueueManager`.
4. `QueueManager` pushes the job to BullMQ.
5. The worker runs `processSyncJob()`.
6. `processSyncJob()` creates the right connector through `createConnector()`.
7. The connector fetches external tool data.
8. `persistConnectorMetrics()` stores the metrics and returns a snapshot ID.
9. `calculateAndSaveRiskScores()` loads the snapshot data and calls `RiskEngine`.
10. `RiskEngine` dispatches to one of the risk strategies.
11. The worker emits progress and completion through `eventStore`.
12. `streamSyncProgress()` forwards those events to the UI via SSE.

---

## 9) Quick implementation matrix

| Symbol | Type | Implements | Extends | Must provide |
|---|---|---|---|---|
| `SyncService` | class | — | — | `enqueueSyncJob()`, `getSyncJobStatus()` |
| `QueueManager` | class | — | — | `enqueue()`, `createWorker()`, `getJobStatus()`, `close()` |
| `EventStore` | class | — | — | `subscribe()`, `emitProgress()`, `emitCompletion()`, `getLastCompletion()` |
| `GitHubConnector` | class | `IVcsConnector`, `IConnector` | — | `getData()` |
| `GitLabConnector` | class | `IVcsConnector`, `IConnector` | — | `getData()` |
| `JiraConnector` | class | `IPmConnector`, `IConnector` | — | `getData()` |
| `LinearConnector` | class | `IPmConnector` | — | `getData()` |
| `RiskEngine` | class | — | — | `calculateRisk()`, `getLevel()`, `saveToDB()` |
| `DeliveryStrategy` | class | `DeliveryRiskCalculator` | — | `getType()`, `calculate()` |
| `CodeQualityStrategy` | class | `CodeQualityRiskCalculator` | — | `getType()`, `calculate()` |
| `EngineeringProcessStrategy` | class | `EngineeringProcessRiskCalculator` | — | `getType()`, `calculate()` |
| `CicdReliabilityStrategy` | class | `CicdReliabilityRiskCalculator` | — | `getType()`, `calculate()` |
| `TeamHealthStrategy` | class | `TeamHealthRiskCalculator` | — | `getType()`, `calculate()` |
| `SecurityRiskStrategy` | class | `SecurityRiskRiskCalculator` | — | `getType()`, `calculate()` |

---

## 10) Diagramming notes

For the class diagram, the most important relationships are:
- `SyncService` → `QueueManager`
- `processSyncJob()` → `createConnector()`
- `createConnector()` → `GitHubConnector` / `GitLabConnector` / `JiraConnector`
- `processSyncJob()` → `persistConnectorMetrics()`
- `processSyncJob()` → `calculateAndSaveRiskScores()`
- `calculateAndSaveRiskScores()` → `RiskEngine`
- `RiskEngine` → strategy classes
- `eventStore` → `streamSyncProgress()`
- `processSyncJob()` → `eventStore`

If a simplified version is needed, model only the classes and interfaces in sections 1–6 and keep the legacy section as a note.
