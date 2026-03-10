# OpenClaw Gateway WebSocket Protocol

Reverse-engineered from the Control UI JS bundle.

## Connection

1. Open WebSocket to `ws://<host>:<port>` (same port as HTTP)
2. Wait for `connect.challenge` event containing `{ nonce: string }`
3. Send `connect` request with auth and client identity

## Message Format

### Request (client → server)
```json
{
  "type": "req",
  "id": "<uuid>",
  "method": "<rpc-method>",
  "params": { ... }
}
```

### Response (server → client)
```json
{
  "type": "res",
  "id": "<matches-request-id>",
  "ok": true,
  "payload": { ... }
}
```

Error response:
```json
{
  "type": "res",
  "id": "<id>",
  "ok": false,
  "error": { "code": "AUTH_TOKEN_MISMATCH", "message": "..." }
}
```

### Event (server → client, push)
```json
{
  "type": "event",
  "event": "<event-name>",
  "payload": { ... },
  "seq": 42
}
```

## Auth Flow

1. WS open → server sends event `connect.challenge` with `{ nonce }`
2. Client sends request:
```json
{
  "type": "req",
  "id": "<uuid>",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "openclaw-mobile",
      "version": "1.0.0",
      "platform": "ios",
      "mode": "ui",
      "instanceId": "<uuid>"
    },
    "role": "operator",
    "scopes": ["operator.admin", "operator.approvals", "operator.pairing"],
    "auth": {
      "token": "<gateway-token>"
    },
    "caps": ["tool-events"]
  }
}
```
3. Server responds with hello payload containing snapshot data

## RPC Methods

| Method | Params | Returns |
|--------|--------|---------|
| `connect` | auth, client info, scopes | hello with snapshot |
| `chat.history` | `{ sessionKey, limit }` | `{ messages[], thinkingLevel }` |
| `chat.send` | `{ sessionKey, message, deliver, idempotencyKey, attachments? }` | run ID |
| `chat.abort` | `{ sessionKey, runId? }` | success |
| `agent.identity.get` | `{ sessionKey? }` | `{ agentId, name, avatar }` |
| `sessions.usage` | `{ startDate, endDate, limit }` | usage data |
| `usage.cost` | `{ startDate, endDate }` | cost summary |
| `exec.approvals.get` | | pending approvals |
| `exec.approvals.set` | approval decision | result |

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connect.challenge` | `{ nonce }` | Auth challenge on WS open |
| `agent` | agent data | Agent status updates |
| `chat` | `{ sessionKey, runId, state, message }` | Chat streaming (delta/final/aborted/error) |
| `presence` | `{ presence[] }` | Agent presence updates |
| `cron` | cron data | Cron job updates |
| `exec.approval.requested` | approval request | Exec approval needed |
| `exec.approval.resolved` | resolution | Exec approval resolved |
| `update.available` | update info | Gateway update available |

## Chat Event States

- `delta` — streaming token update (message contains partial text)
- `final` — complete response
- `aborted` — run was cancelled
- `error` — run failed

## Auth Error Codes

- `AUTH_TOKEN_MISMATCH` — wrong token
- `AUTH_RATE_LIMITED` — too many failed attempts
- `AUTH_UNAUTHORIZED` — general auth failure
- `AUTH_TOKEN_MISSING` — no token provided
