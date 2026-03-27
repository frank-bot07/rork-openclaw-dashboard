# OpenClaw Mobile Operator Console V1 Tech Plan

## Current Repo Assessment

The repo is a good UI prototype and a poor foundation for a real client.

- `providers/OpenClawProvider.tsx` is a monolith handling fake data, local persistence, fake chat behavior, and all app domain actions.
- `types/openclaw.ts` mixes UI assumptions with backend-shaped entities but does not model live runs, incidents, permissions, or session state.
- `mocks/*` define the real product story more clearly than the current code architecture.
- React Query is installed but mostly used as a wrapper around AsyncStorage, not as a server-state layer.
- `zustand` is installed and unused.
- Several components are unused or duplicated inlined patterns, including `CommandBar`, `QuickActions`, `ActivityFeed`, and `SkeletonLoader`.
- The prototype scope is too broad for mobile V1 and currently spends effort on fake configuration flows.

The correct move is not to bolt network calls into the existing provider. The correct move is to introduce a real gateway client boundary and shrink the product surface at the same time.

## Recommended Architecture

### App shape

Keep Expo Router and the current visual direction. Do not rewrite the shell.

The app should be split into four layers:

1. Transport layer
   - Typed OpenClaw gateway client.
   - Handles auth headers, base URL, retries, and streaming transport.

2. Adapter layer
   - Maps raw gateway payloads into UI-friendly view models.
   - Keeps backend contract changes out of screen components.

3. Server-state layer
   - TanStack Query for overview, agents, agent detail, conversations, runs, and incidents.
   - Mutations for send message and safe actions.

4. Local app-state layer
   - Zustand for session bootstrap state, active connection, UI filters, composer drafts, and transient stream state.

The mobile app should call one OpenClaw gateway API only. If OpenClaw currently exposes multiple internal services or a CLI-first interface, add a gateway adapter server-side rather than teaching the app those internals.

### Runtime data flow

- Use HTTP requests for snapshot data.
- Use a single realtime adapter for chat and event updates.
- Prefer SSE if the gateway already supports it cleanly for Expo clients; otherwise use WebSocket.
- Fall back to foreground polling when streaming is unavailable.
- Keep the Query cache as the source of truth for server data.
- Keep Zustand limited to ephemeral UI state and session control.

### Screen model for V1

- `Overview`
  - Gateway status.
  - Coordinator card.
  - Specialist roster.
  - Open incidents.
  - Recent delegation/activity feed.

- `Agents`
  - Search/filter list.
  - Read-only details.

- `Runs`
  - Active, failed, recent runs.
  - Incident-focused, not cron-focused.

- `Settings`
  - Single deployment connection.
  - Session info.
  - Notification and refresh preferences.

## State Management / API Adapter Plan

### Replace the current provider model

`providers/OpenClawProvider.tsx` should stop owning app business logic.

Recommended direction:

- Keep a lightweight provider only if it bootstraps app providers.
- Move session state to a Zustand store.
- Move server data to query hooks.
- Move transport to `lib/openclaw/*`.

### Query model

Recommended query keys:

- `session`
- `overview`
- `agents`
- `agent`, keyed by id
- `conversation`, keyed by agent or thread id
- `runs`
- `run`, keyed by id
- `incidents`

Recommended mutation hooks:

- `useConnectGateway`
- `useLogout`
- `useSendMessage`
- `useRetryRun`
- `useRestartAgent`
- `usePingAgent`

### Adapter model

Introduce mapper functions between gateway responses and UI types.

Examples:

- `mapGatewayOverview`
- `mapAgentSummary`
- `mapAgentDetail`
- `mapConversationMessage`
- `mapRunSummary`
- `mapIncident`

This avoids coupling the current screens to raw backend payloads and lets the gateway evolve without forcing screen rewrites.

### Cache and persistence rules

- Store only non-sensitive preferences in AsyncStorage.
- Store auth token or refresh token in SecureStore.
- Do not persist whole agent lists, jobs, or chats as first-party source of truth.
- Cache a last-known snapshot for fast boot and brief offline viewing, but always reconcile from server.
- On logout, clear query cache and local drafts.

### Streaming chat plan

- Message history loads via query.
- Message send uses mutation with optimistic local user message.
- Assistant output streams through the realtime adapter into a transient stream store.
- Final message is committed back into Query cache when complete.
- Delegation and tool events should be rendered as timeline rows, not buried in raw text.

### Dependencies to add

- `expo-secure-store` for token storage.
- One realtime client compatible with Expo for SSE or WebSocket, chosen after confirming gateway transport.

## Auth / Security Approach

### Session model

V1 should support one active OpenClaw deployment per install.

Preferred auth order:

1. Short-lived access token plus refresh token issued by the gateway.
2. If the backend is simpler, a scoped personal access token or pairing token.

Do not ship stored username/password as the primary model.

### Storage rules

- Gateway URL in AsyncStorage is acceptable.
- Access token and refresh token belong in SecureStore.
- Never store raw passwords in AsyncStorage.
- Wipe tokens and cached sensitive data on logout.

### Transport rules

- Require HTTPS for production deployments.
- Allow plain HTTP only for local development or explicit local-network installs.
- Send bearer tokens in headers, never in query strings.
- Add request timeouts and clear offline or degraded error states.

### Authorization model

The gateway should expose operator capability flags or scopes:

- `overview.read`
- `agent.read`
- `conversation.read`
- `conversation.write`
- `run.read`
- `action.retry`
- `action.restart`

The app should hide actions the current operator cannot perform.

### Safety rules

- Destructive or high-impact actions require confirmation.
- Every action response should include an audit or event id.
- Do not expose arbitrary shell or command execution from mobile.
- Do not expose prompt, file, or channel-secret editing in V1.

## Exact Implementation Phases

### Phase 1. Contract and app foundation

Goal: create a real client boundary without changing the visual shell yet.

- Define the gateway contract for auth, overview, agents, conversations, runs, incidents, and safe actions.
- Add `lib/openclaw` client and mapper files.
- Introduce Zustand session store.
- Stop adding logic to `OpenClawProvider`.
- Keep mock mode only as a temporary development adapter, not as the default architecture.

Exit criteria:

- The app can boot through a real client interface, even if some screens still use fixtures behind the adapter.

### Phase 2. Connection and session flow

Goal: replace fake profiles with one real connection flow.

- Add first-run connect or sign-in screen.
- Replace multi-profile settings with single deployment connection.
- Securely persist session and restore on app launch.
- Add `connected`, `reconnecting`, `unauthorized`, and `offline` states.

Exit criteria:

- A real OpenClaw deployment can be connected and restored after app relaunch.

### Phase 3. Real Overview and Agents

Goal: make the home screen and agent list trustworthy.

- Wire dashboard to real `overview`, `agents`, and `incidents` data.
- Put the coordinator at the top of the dashboard.
- Show specialists, degraded agents, and recent activity from the real backend.
- Remove agent creation from the mobile flow.
- Convert agent detail to read-only operational data plus chat entry.

Exit criteria:

- Operator can see live gateway and agent state without touching any fake local data.

### Phase 4. Real chat and delegation visibility

Goal: make the app useful for actual supervision and intervention.

- Load real conversation history.
- Send messages to coordinator and specialists.
- Stream replies.
- Render delegation, tool, and failure events as part of the conversation or run timeline.
- Replace fake quick actions with a small set of coordinator prompts backed by real messages.

Exit criteria:

- A real message can be sent from the phone and the resulting coordinator or specialist work is visible.

### Phase 5. Runs tab and safe actions

Goal: complete the operator loop.

- Replace the scheduler job UI with a runs or incidents feed.
- Surface active, failed, and recent runs.
- Add retry and restart actions where supported.
- Connect agent health refresh and action confirmations to backend mutations.

Exit criteria:

- Operator can identify a failed run and take at least one real recovery action from mobile.

### Phase 6. Hardening and release prep

Goal: make the client shippable.

- Wire skeleton loaders and error states.
- Add token expiry handling and forced re-auth flow.
- Add reconnect logic for SSE and polling fallback.
- Remove default mock data path from production builds.
- Smoke test critical flows on iOS and Android.

Exit criteria:

- The app behaves correctly with slow network, expired auth, and partial backend outages.

## File-Level Change Plan

### Existing files to change

| File | Planned change |
| --- | --- |
| `app/_layout.tsx` | Add session bootstrap and auth gating. Keep QueryClientProvider, but move app boot logic out of the current provider. |
| `app/(tabs)/_layout.tsx` | Keep the tab shell. Change the `Scheduler` tab label and icon semantics to `Runs` while preserving the visual style. |
| `app/(tabs)/(dashboard)/index.tsx` | Rebuild as real `Overview` screen backed by `overview`, `agents`, and `incidents` queries. Keep the coordinator hero and multi-agent status concept. |
| `app/(tabs)/agents/index.tsx` | Remove `CreateAgentModal`. Keep search/filter list, but back it with real server data. |
| `app/agent/[id].tsx` | Remove mobile config editing and delete-agent flows. Keep chat and read-only details. Add safe actions and recent run context. |
| `app/(tabs)/scheduler/index.tsx` | Repurpose from cron management to `Runs` or `Incidents`. Delete job CRUD UI. |
| `app/(tabs)/settings/index.tsx` | Replace profile manager with single deployment connection, session state, and a minimal preferences screen. |
| `providers/OpenClawProvider.tsx` | Shrink drastically or retire. It should no longer own domain data, chat simulation, or persistence. |
| `types/openclaw.ts` | Split or extend to cover session state, run summaries, incidents, permissions, and event payloads. |
| `components/ActivityFeed.tsx` | Use it on the real overview instead of duplicating inline activity markup. |
| `components/FloatingChatButton.tsx` | Keep, but source availability from real agent state. |
| `components/SkeletonLoader.tsx` | Wire into real loading states. |
| `components/QuickActions.tsx` | Repurpose into safe operator prompts or remove if redundant. |
| `components/CommandBar.tsx` | Remove from the main plan. It encourages broad command sending before the core operator loop is solid. |
| `mocks/*` | Keep only as dev fixtures or story data. Do not keep them as production defaults. |

### New files to add

Recommended additions:

- `lib/openclaw/client.ts`
- `lib/openclaw/auth.ts`
- `lib/openclaw/events.ts`
- `lib/openclaw/mappers.ts`
- `lib/openclaw/queryKeys.ts`
- `stores/sessionStore.ts`
- `stores/uiStore.ts`
- `hooks/useOverview.ts`
- `hooks/useAgents.ts`
- `hooks/useAgentDetail.ts`
- `hooks/useConversation.ts`
- `hooks/useRuns.ts`
- `hooks/useIncidents.ts`
- `app/connect.tsx` or `app/sign-in.tsx`

### Files likely to lose scope in V1

These should be reduced or removed instead of kept alive with fake implementations:

- Agent creation modal in `app/(tabs)/agents/index.tsx`
- Config tab in `app/agent/[id].tsx`
- Channel-management posture in `app/agent/[id].tsx`
- Add/edit job modal in `app/(tabs)/scheduler/index.tsx`
- Multi-profile password handling in `app/(tabs)/settings/index.tsx`

## Practical Notes

- Do not start by wiring every existing fake feature to the backend. Most of those features should disappear.
- Do not let the mobile client talk directly to internal worker processes or channel bridges.
- Do not keep shipping local persistence as if it were server state.
- Preserve the visual identity, but tighten the product around operator supervision.

If the backend cannot provide a unified overview, conversation, and runs surface, fix that at the gateway first. The app should stay simple.
