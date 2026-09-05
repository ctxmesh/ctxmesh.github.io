---
title: Launcher endpoints
description: "The in-pod localhost plane the launcher provides — reserved ports for memory, gateway/budget, A2A, feedback, discovery, and the OTLP collector."
---

Every platform capability an agent uses is exposed as a **language-agnostic, launcher-traced localhost
endpoint** — no SDK required (the SDK is typed sugar over exactly these). Inside an agent pod, all
containers share the network namespace, so the agent process reaches each capability at `localhost:<port>`.
The launcher (PID 1) owns these listeners; it enforces guardrails, scoping, and OBO in-pod, and stamps a
span on each op. This page is the reserved-port reference.

:::note
These ports are a **platform-internal contract** between the agent process and its launcher/sidecars —
not an external API. Each new launcher-local listener must claim a **distinct** port (all can be live in
one pod). The table below is confirmed against the engine; request/response shapes for the memory and
A2A surfaces are documented where stable and finalize toward GA.
:::

## Reserved localhost ports

| Port | Owner | Injected env | Since | Purpose |
|------|-------|--------------|-------|---------|
| `:2994` | **delegate listener** | — | later | Launcher-local delegate hop — `POST /delegate` (spawn/handoff path), plus `GET /healthz`. |
| `:2995` | **feedback ingest hook** | `FEEDBACK_PORT` | M9 | Post-run feedback → trace scores. |
| `:2996` | **budget / guardrail proxy** | `MODEL_GATEWAY_URL` points here when budgeted | M8 | The model-call hop: budget check (fail-closed), guardrails, tenant quota, before forwarding to the gateway. |
| `:2997` | **A2A listener** | `A2A_PORT` | M6 | Agent-to-agent calls (`/a2a/{target}`) — envelope, access control, guards, tracing. |
| `:2998` | **memory / knowledge endpoint** | `MEMORY_PORT` | M5 | Session memory, long-term memory, and knowledge (RAG) proxies. |
| `:2999` | **MCP discovery sidecar** | `DISCOVERY_PORT` | M4 | Tool control/manifest (the discovery sidecar). |
| `:4317` / `:4318` | **OTLP collector sidecar** | (`localhost` OTLP) | M3 | Trace export — OTLP gRPC (`4317`) / HTTP (`4318`). |

The **model gateway** itself (the cluster service, LiteLLM) listens on `:4000`; agents reach it via
`MODEL_GATEWAY_URL` (which points at the in-pod budget proxy on `:2996` when the agent is budgeted, else
directly at the gateway service).

## The `:2998` memory endpoint

The language-agnostic session-memory contract (also serving long-term memory and knowledge/RAG):

| Path | Method | Semantics |
|------|--------|-----------|
| `/memory/{conversationId}` | GET | Full context: a JSON array (empty array if none). |
| `/memory/{conversationId}/append` | POST | Append one JSON entry. |
| `/memory/{conversationId}/search?q=` | GET | v1 = naive substring match over serialized entries (documented dev-grade; semantic search is phase-2). |
| `/healthz` | GET | `200` when the listener is up (the backend is not probed here). |
| `/memory/agent/remember` | POST | Long-term memory write — durable across conversations, unlike `/memory/{conversationId}`. |
| `/memory/agent/search` | POST | Long-term memory retrieval. |
| `/knowledge/search` | POST | KnowledgeBase retrieval (RAG). Served on the same `:2998` mux as the memory routes. |

- Entries are stored compacted (canonical JSON); a GET assembles them into an array and never sees
  half-built state. Session TTL is 24h, refreshed on every write.
- Oversize append → **413**. Backend down → **502** with a single JSON error code (best-effort — a
  memory failure never crashes the agent). Missing binding → the listener isn't started and the SDK's
  call gets connection-refused (by design).
- Env: `MEMORY_PORT` (default `2998`), plus `MEMORY_BACKEND_ADDR` / the key-namespace, injected by the
  controller. As of the state-layer-proxy cutover, the agent's memory path goes **through the proxy**
  (the agent holds no direct Valkey credential).

See [Memory & state](/concepts/memory-and-state/).

## The `:2997` A2A listener

An agent calls a peer by POSTing to its **own** launcher — never directly to the peer:

- `POST /a2a/{targetAgent}` — the launcher wraps the caller's JSON payload in the platform
  [message envelope](/reference/message-envelope/), resolves the target by DNS, forwards, and returns
  the peer's response.
- The envelope travels both in the body and as an `X-A2A-Envelope` header (so the callee's launcher
  reads access-control/role/depth without buffering the body); `X-Conversation-Id` seeds a
  conversation; W3C `traceparent` carries the trace.
- **Typed failures → HTTP status:** `unknown_target` → 404, `blocked` → 502, `upstream_failure` → 502,
  `caller_not_allowed` → 403, malformed → 400, oversize → 413. All best-effort — a failed A2A never
  crashes the caller. Guards (`depth_exceeded`, `cycle_detected`, `budget_exceeded`) are enforced by the
  caller's launcher before forwarding.
- Env: `A2A_PORT` (default `2997`), enabled only when the agent is a registry member
  (`AGENT_REGISTRY_ID` injected). See [Multi-agent](/concepts/multi-agent/).

## The `:2996` budget / guardrail proxy

When an agent is budgeted or governed, `MODEL_GATEWAY_URL` points at the in-pod proxy on `:2996` instead
of directly at the gateway. Each model call passes a **pre-call budget check** (fail-closed on money),
tenant quota (spend/RPM/concurrency), and guardrails, then is forwarded to the gateway. Over-budget →
**402 `budget_exceeded`**; over-rate → **429**. See
[Model routing & cost](/guides/model-routing-and-cost/) and
[Guardrails](/guides/guardrails/).

## The `:2995` feedback hook and `:2999` discovery sidecar

- **`:2995`** (`FEEDBACK_PORT`) — a launcher-local hook that ingests post-run feedback and correlates it
  to the trace as a score. Started only when feedback is wired.
- **`:2999`** (`DISCOVERY_PORT`) — the MCP discovery sidecar's control/manifest port; the launcher
  resolves tool manifests and brokers calls through it.

## The `:4317`/`:4318` collector

The controller-injected OTel Collector sidecar receives OTLP on `:4317` (gRPC) and `:4318` (HTTP),
applies redaction, and exports to your trace backend. Export is best-effort — a collector outage drops
spans, never the request. See [Observability backends](/operations/observability-backends/).

## See also

- [The launcher contract](/concepts/the-launcher-contract/)
- [Message envelope](/reference/message-envelope/)
- [Multi-agent](/concepts/multi-agent/) · [Memory & state](/concepts/memory-and-state/)
- [Observability backends](/operations/observability-backends/)
