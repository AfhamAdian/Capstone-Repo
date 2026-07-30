# High-Level Architecture Diagram Notes

This document is a very high-level guide for drawing the backend architecture in Eraser.
It focuses on the main runtime flow, Redis Pub/Sub, SSE, worker processing, queueing, connectors, and persistence.

## 1) Main blocks to draw

### Frontend
- Sends sync requests to the API
- Opens an SSE stream to receive progress updates

### API
- Express app
- Sync controller
- Progress SSE controller
- Health controller
- Sync service

### Queue layer
- QueueManager
- BullMQ queue

### Worker
- Worker entrypoint
- Sync processor

### Connector layer
- Connector registry / factory
- GitHub connector
- Jira connector
- GitLab connector
- Linear connector placeholder

### Data + risk layer
- Metrics persistence
- Risk calculation service
- RiskEngine
- Risk strategy classes

### Infrastructure
- Redis
- Supabase / database

---

## 2) Main sync flow

Draw the main flow like this:

1. Frontend sends a sync request
2. API validates the request
3. SyncService loads project integrations
4. QueueManager pushes the job to BullMQ
5. Worker consumes the job
6. Worker processes each selected tool
7. Connector fetches data from the external tool
8. Metrics are saved to the database
9. Risk scores are calculated
10. Completion event is emitted
11. Frontend receives the final status

---

## 3) Redis Pub/Sub + SSE flow

This is the most important part of the architecture.

### Redis side
- Worker publishes progress events to Redis
- Each sync session uses its own Redis channel
- Redis also stores the last completion event for replay

### API side
- Progress controller opens an SSE connection
- It first checks Redis for the last completion event
- If found, it sends that event immediately
- If not found, it subscribes to the session channel
- It forwards Redis messages to the browser as SSE events
- The stream closes when the sync reaches a terminal state

### Visual relationship
- Worker → Redis Pub/Sub → Progress controller → Frontend SSE

---

## 4) Worker flow

Show the worker as a separate process box.

Inside the worker:
- Receive BullMQ job
- Loop through requested tools
- Create the correct connector
- Fetch external data
- Save metrics
- Calculate risk
- Emit progress and completion events

### Important note
- The overall system is asynchronous
- But tool processing inside one job is currently sequential

---

## 5) Connector layer

Show one connector factory feeding multiple connectors.

### Shared abstraction
- General connector interface

### Implementations
- GitHub connector
- Jira connector
- GitLab connector
- Linear connector placeholder

### Diagram tip
- Group future tools as placeholders
- Do not expand every future provider into separate detailed boxes

---

## 6) Risk engine layer

Show the risk engine as a dispatcher.

### Main node
- RiskEngine

### Strategy nodes
- Delivery
- Code Quality
- Engineering Process
- CI/CD Reliability
- Team Health
- Security Risk

### Relationship
- RiskEngine selects the right strategy
- Each strategy calculates a score from its metrics
- Risk results are saved to the database

---

## 7) Persistence layer

### Metrics persistence
- Connector output is normalized
- Project snapshot is created
- Metrics are written to the database

### Risk persistence
- Risk scores are stored separately after calculation

### Infrastructure
- Supabase acts as the database backend

---

## 8) Recommended arrows

### Solid arrows for runtime calls
- Frontend → API
- API → QueueManager
- Worker → Connector factory
- Worker → Metrics persistence
- Worker → Risk calculation service
- Risk calculation service → RiskEngine
- RiskEngine → strategies
- Worker → eventStore
- Progress controller → eventStore / Redis

### Dashed arrows for dependencies
- Services depend on queue and data helpers
- Connectors implement shared interfaces
- Strategies implement risk calculator interfaces

---

## 9) Suggested layout for Eraser

### Left to right
1. Frontend
2. API
3. Queue / Redis
4. Worker
5. Connectors
6. Database / Risk engine
7. SSE back to Frontend

### Or top to bottom
- Top: Frontend + API
- Middle: Queue + Redis + Worker
- Bottom: Connectors + DB + Risk Engine
- Return line: SSE back to Frontend

---

## 10) Minimal node list

If you want the cleanest possible diagram, use only these nodes:

- Frontend
- API
- QueueManager / BullMQ
- Worker
- Connector Factory
- External Tools
- Metrics DB
- Risk Engine
- Redis Pub/Sub
- SSE Progress Stream

---

## 11) Short labels to use in the diagram

- sync request
- enqueue job
- process job
- fetch tool data
- persist metrics
- calculate risk
- emit progress
- SSE stream
- Redis pub/sub
- DB save

---

## 12) Best high-level summary

The backend is a decoupled sync pipeline:

Frontend → API → BullMQ Queue → Worker → Connectors → Database → Risk Engine → Redis Pub/Sub → SSE → Frontend

This is the main architecture to show in Eraser.
