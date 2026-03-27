# Final Gate Review: `621616e`

## Scope

- Read `REVIEW_CODEX.md`, `REVIEW_SONNET.md`, `REVIEW_CODEX_POSTFIX.md`, and `REVIEW_SONNET_POSTFIX.md`
- Verified the current tree at `621616e` against the referenced fixes
- Validation run:
  - `./node_modules/.bin/tsc --noEmit` passed
  - `./node_modules/.bin/eslint .` reported 1 non-blocking warning in `app/(tabs)/settings/index.tsx` (`Pressable` unused)

## REG-1 Status

**REG-1 is fixed as originally written.**

The prior regression was "transient bootstrap/network failure sends the operator to `/connect` and behaves like logout." The current code no longer does that:

- `app/_layout.tsx:45-49` restores the stored session as `reconnecting`
- `app/_layout.tsx:56-69` validates the stored session before calling `setConnected(...)`
- `app/_layout.tsx:77-82` now calls `clearSession()` only for unauthorized failures; other failures go to `setOffline(...)`
- `stores/sessionStore.ts:60-78` preserves `session` and `gatewayUrl` for `offline` and `disconnected`
- `app/_layout.tsx:123-134` routes based on `session` presence, so offline/reconnecting state no longer forces `/connect`

## Prior Criticals

All previously reported **mobile-client criticals** are either fixed in the current tree or reduced out of blocker status for the shipped mobile path.

Confirmed fixed:

- Duplicate session-expiration alerts: `lib/openclaw/auth.ts:200-213`
- Stored-session validation before connected state: `app/_layout.tsx:45-69`
- Unhandled bootstrap rejection: `app/_layout.tsx:87-104`
- Expired-token use: `lib/openclaw/auth.ts:74-80`, `lib/openclaw/auth.ts:246-264`, `lib/openclaw/client.ts:254-262`
- Silent token deletion on parse failure: `lib/openclaw/auth.ts:60-71`
- Web `SecureStore` crash path: `lib/openclaw/auth.ts:281-326`
- Optimistic conversation race: `hooks/useConversation.ts:74-161`
- Unsafe event payload handling: `lib/openclaw/events.ts:141-145`, `lib/openclaw/events.ts:215-231`, `lib/openclaw/events.ts:323-339`
- SSE reconnect logic in the adapter: `lib/openclaw/events.ts:166-189`, `lib/openclaw/events.ts:235-255`
- Query invalidation swallowing failures: `lib/openclaw/queryUtils.ts:3-21`

Fixed/downgraded in the current mobile path:

- SSE token exposure is not active in the shipped app path because `app/agent/[id].tsx:178-183` does not provide an `eventSourceFactory`; chat is polling-only today
- Outgoing message validation now enforces trim + max length in the mutation path: `hooks/useConversation.ts:66-77`, `hooks/useConversation.ts:169-180`
- Client-side send throttling exists now: `app/agent/[id].tsx:385-389`

Still worth carrying as non-blocking caveats, but not launch-critical for a mobile-only beta:

- Web token storage still falls back to `localStorage`: `lib/openclaw/auth.ts:281-326`, `README.md:7`, `app.json:27-29`
- Session persistence is still non-atomic: `app/connect.tsx:96-97`, `lib/openclaw/auth.ts:122-134`
- Dashboard health/test-connection values are still placeholder/fabricated: `providers/OpenClawProvider.tsx:34-69`, `app/(tabs)/settings/index.tsx:25-39`

## New Regression

### REG-NEW-1: Offline bootstrap can strand the app in a permanently non-connected state

This is distinct from REG-1. The app now preserves the stored session during transient bootstrap failure, but it does not have a path to recover the connection state back to `connected` after that failure unless the user reconnects manually or relaunches into a healthy network.

Evidence:

- `app/_layout.tsx:82` sets `offline` on non-auth bootstrap failures
- The only `setConnected(...)` calls are `app/_layout.tsx:69` and `app/connect.tsx:99`
- Core data hooks all require `connectionState === 'connected'`:
  - `hooks/useOverview.ts:20`
  - `hooks/useAgents.ts:30`
  - `hooks/useAgentDetail.ts:21`
  - `hooks/useConversation.ts:41`
  - `hooks/useRuns.ts:24`
  - `hooks/useIncidents.ts:23`
- `providers/OpenClawProvider.tsx:72-88` refreshes queries, but it never promotes the store back to `connected`

Impact:

- Cold-start on flaky mobile data no longer ejects the user to `/connect`, which is good
- But after that same cold-start failure, most of the app stays logically offline because the query layer remains gated behind `connectionState === 'connected'`
- That leaves the operator with a preserved session but no reliable automatic recovery path for overview/agents/runs/incidents

For a mobile operator console, that is still a release blocker on the reconnect path.

## Verdict

**NO-SHIP for mobile-only v1 beta.**

Reason:

- REG-1 itself is fixed
- Previously identified criticals are closed for the current mobile client path
- A new reconnect-state regression remains on the same startup/offline path and still blocks dependable mobile recovery

If `REG-NEW-1` is fixed, I would re-evaluate this as likely **SHIP** for a mobile-only beta, with web explicitly out of scope and the remaining placeholder telemetry/non-atomic persistence issues carried as caveats.
