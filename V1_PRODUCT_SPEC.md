# OpenClaw Mobile Operator Console V1 Product Spec

## Current Prototype Readout

The current prototype is strong in visual direction and weak in product focus.

- The dark "Mission Control" mobile UX is the right direction.
- The multi-agent overview is the strongest product idea in the repo.
- The current surface area is too broad for V1: agent CRUD, model editing, prompt editing, channel management, cron CRUD, and multi-profile settings all exist as fake/local flows.
- All operational data is mock data or AsyncStorage persistence. Nothing is a real OpenClaw client yet.

V1 should not turn this into a mobile admin panel. It should become a real operator console.

## Product Thesis

OpenClaw's core value is not "many bots on a phone." It is a coordinator supervising specialist agents across multiple models and providers. The mobile product should make that system legible and controllable when the operator is away from a desk.

V1 is for supervision and intervention, not authoring and deep configuration.

The product should answer four questions in under 30 seconds:

1. Is the OpenClaw gateway healthy?
2. Which agent or channel is failing or degraded?
3. What is the coordinator doing, and which specialist did it delegate to?
4. Can the operator intervene safely from mobile?

## V1 Scope

V1 targets one authenticated operator connected to one OpenClaw deployment at a time.

Keep the current mobile shell and visual language:

- Keep the dark Mission Control styling.
- Keep the multi-agent overview as the home screen's core concept.
- Keep agent-level chat as the main intervention surface.
- Keep four tabs to reduce churn, but repurpose `Scheduler` into `Runs`.

## V1 Must-Have Features

### 1. Single-server connection and authenticated session

- Connect to one OpenClaw gateway by URL plus operator token or issued session.
- Persist one active connection on device.
- Show clear connected, reconnecting, and disconnected states.

### 2. Coordinator-first Mission Control overview

- Gateway health banner.
- Coordinator card at the top.
- Specialist agent roster with status, last activity, and current run summary.
- Open incidents or degraded agents surfaced above general activity.
- Recent delegation or activity feed so the operator can see cross-agent behavior at a glance.

### 3. Real agent roster and read-only agent detail

- Searchable agent list.
- Agent detail showing status, assigned model/provider, recent run summary, and channel footprint.
- Read-only operational details only. No mobile editing of prompts, models, or files in V1.

### 4. Real chat with coordinator and specialists

- Send a message to the coordinator or a specialist.
- Stream replies in real time.
- Preserve message history per agent or conversation.
- Show delegation context when the coordinator hands work to a specialist.

### 5. Runs and incidents feed

- Replace cron management with a feed of active, failed, and recent runs.
- Show failed or degraded runs first.
- Let the operator drill from a run or incident into the affected agent.

### 6. Safe operator actions

- Ping or refresh agent health.
- Retry a failed run.
- Restart or reconnect an agent if the backend supports it.
- Every action must be explicit, confirmed, and auditable.

### 7. Freshness and resilience

- Foreground polling plus live event updates when available.
- Pull to refresh on core screens.
- Cached last-known-good snapshot for brief offline viewing.

## Explicitly Cut Or Defer

These are not V1 features and should not be rebuilt from the prototype:

- Creating, deleting, or cloning agents from mobile.
- Editing model selection, system prompts, SOUL files, or workspace paths from mobile.
- Channel binding CRUD, token entry, or phone-number setup.
- Cron job create, edit, delete, or expression management.
- Multiple saved server profiles.
- Local password storage.
- Media upload, file browser, or document management in chat.
- Full analytics, reporting, or historical dashboards.
- User management, RBAC admin UI, or audit log explorer.
- Push notifications and background jobs on device.
- Tablet or desktop admin workflows.

If a feature primarily changes configuration rather than helping the operator supervise and intervene, it is out of scope for V1.

## Primary User Flows

### 1. Connect and enter the console

1. Operator opens the app for the first time.
2. Operator enters gateway URL and token or completes login.
3. App validates connectivity and stores the session.
4. Operator lands on Mission Control overview.

### 2. Spot a problem from the overview

1. Operator opens the app.
2. Dashboard shows one degraded specialist and one failed run.
3. Operator taps the incident.
4. App opens the relevant agent or run detail.

### 3. Ask the coordinator what is happening

1. Operator opens the coordinator chat from the overview.
2. Operator asks for a system summary or for triage advice.
3. Response streams live.
4. Delegations to specialists are visible in the transcript or run timeline.

### 4. Inspect a specialist and intervene

1. Operator opens an agent detail screen.
2. Operator reviews status, recent run history, and channel footprint.
3. Operator chooses a safe action such as `retry` or `restart`.
4. App shows action progress and resulting state changes.

### 5. Review recent runs while away from desk

1. Operator opens the `Runs` tab.
2. Operator filters to active or failed runs.
3. Operator opens a failed run.
4. Operator drills into the owning agent or retries the run.

## Data Sources / OpenClaw Capabilities Needed

The mobile app should talk to one OpenClaw gateway API. It should not talk directly to model vendors, worker processes, or channel bridges.

### Required capabilities

- Auth/session
  - Login or token validation.
  - Session restore.
  - Logout or token revoke.

- Gateway overview
  - Overall health.
  - Coordinator identity.
  - Agent counts by status.
  - Open incident count.
  - Last sync timestamp.

- Agent inventory
  - Agent id, name, role, specialist type, status, model/provider, last activity.
  - Current or most recent run summary.
  - Channel summary for read-only display.

- Agent detail
  - Health details.
  - Recent runs.
  - Recent channel activity summary.
  - Allowed actions for that agent.

- Conversations
  - Conversation history by agent or thread.
  - Send message mutation.
  - Stream assistant output.
  - Structured events for delegation, tool use, completion, and failure.

- Runs/incidents
  - Active runs.
  - Failed runs.
  - Incident severity and affected resource.
  - Link from incident to run and agent.

- Safe actions
  - Ping health.
  - Retry run.
  - Restart or reconnect agent.
  - Action result payload plus audit/event id.

- Realtime updates
  - SSE or WebSocket event stream preferred.
  - Polling fallback if streaming is unavailable.

- Capability flags
  - The gateway should tell the app which features are enabled, such as `canRestartAgent` or `canRetryRun`.

### Non-goal backend capabilities for V1

These may exist in OpenClaw, but the mobile app should not depend on them for first release:

- Prompt editing APIs.
- Model catalog management APIs.
- Channel provisioning APIs.
- Cron management APIs.
- Workspace file editing APIs.

## V1 Ship Bar

V1 is ready when all of the following are true:

- A real operator can connect to a real OpenClaw deployment from mobile.
- The home screen reflects live gateway and agent state.
- The operator can open the coordinator or a specialist and send a real message.
- Failed or degraded runs are visible without digging through configuration screens.
- At least one safe recovery action works end-to-end against the backend.
