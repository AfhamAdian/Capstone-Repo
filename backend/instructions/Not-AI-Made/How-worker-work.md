┌─────────────────────────────────────────────────────────────┐
│                    DATA FLOW                                │
└─────────────────────────────────────────────────────────────┘

1. FRONTEND
   POST /api/v1/sync
   {
     projectId: "p-1",
     tools: ["github", "jira"],
     sessionId: "s-xyz"
   }

2. API (/@libs/sync/types)
   Uses SyncRequestPayload to validate

3. API (/@libs/queue/queue-manager)
   queueManager.enqueue({ jobId, projectId, tools, ... })
   → Stores in Redis via BullMQ

4. WORKER (/@libs/queue/queue-manager)
   Watches Redis queue for new jobs
   worker = queueManager.createWorker(async (job) => {...})

5. WORKER (/@libs/sync/connector-registry)
   For each tool:
   const connector = createConnector({
     tool: "github",
     credentials: integrations.github.credentials,
     project: integrations.github.project
   })

6. CONNECTOR (/@libs/sync/connector.interface)
   await connector.getData()
   Returns ConnectorOutput { tool, data, fetchedAt }

7. WORKER (/@libs/queue/event-store)
   eventStore.emitProgress({ jobId, tool, status })
   → Sends via SSE to frontend

8. FRONTEND
   SSE receives event
   Shows "✓ github synced"

9. WORKER
   After all tools or failures:
   eventStore.emitCompletion({ status, riskScore, ... })
   → Frontend sees final result