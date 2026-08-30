---
title: Message envelope
description: "The agent-to-agent envelope schema (traceId, registryId, depth, path, budgetRemaining) and its delivery contract."
---

Every agent-to-agent (A2A) call carries a **platform-owned envelope**, stamped by the caller's launcher.
The agent's payload is opaque to the platform; the envelope is the control-plane metadata the launcher
uses for isolation, access control, conversation guards, and trace continuity. This page is the schema
and delivery contract.

The agent never constructs or forges the envelope — it POSTs its payload to its own launcher's
[A2A endpoint](/reference/launcher-endpoints/), and the launcher builds and stamps the envelope. It is
immutable downstream **except** `depth` and `path`, which each hop extends.

## Schema

```json
{
  "traceId": "...",
  "registryId": "research-team",
  "conversationId": "...",
  "messageId": "...",
  "senderAgentId": "orchestrator",
  "receiverAgentId": "research",
  "role": "orchestrator",
  "depth": 3,
  "path": ["orchestrator", "research"],
  "budgetRemaining": 29,
  "payload": { }
}
```

| Field | Meaning |
|-------|---------|
| `traceId` | The conversation's trace correlation key. Inherited across hops so logical continuity survives even if the user layer drops the W3C `traceparent` header. |
| `registryId` | The caller's registry (mesh) id. The callee's launcher **rejects** an envelope whose `registryId` differs from its own (`cross_registry_denied`, 403) — the primary cross-registry boundary. |
| `conversationId` | Groups all hops of one conversation. Seeded from `X-Conversation-Id` on a first hop, else a fresh UUID. |
| `messageId` | Unique per hop — the idempotency key (used for async dedupe). |
| `senderAgentId` · `receiverAgentId` | The two ends of this hop. |
| `role` | The sender's registry role (`orchestrator` / `worker` / `reviewer` / custom), checked against the registry's role policy. |
| `depth` | Hop depth; extended each hop. The guard rejects when `depth+1 > maxDepth` (`depth_exceeded`). |
| `path` | The chain of agents so far; extended each hop. A revisit of an agent already in `path` trips `cycle_detected` (a self-call is the degenerate 1-cycle, blocked). |
| `budgetRemaining` | The per-branch hop budget: seeded from the registry's `hopBudget` on the first hop, decremented each hop; the guard rejects the hop that would take it below zero (`budget_exceeded`), so `hopBudget=N` permits exactly N hops. Per-branch in sync v1 (a fan-out gives each branch its own copy). |
| `payload` | The agent's opaque JSON — the platform never inspects it. |

## Delivery contract

The launcher sends the envelope with the outbound A2A POST:

- **In the body** (with the agent payload nested) **and** as an **`X-A2A-Envelope` header**, so the
  callee's launcher can read access-control/role/depth without buffering the body.
- **`X-Conversation-Id`** on a first-hop request seeds `conversationId`.
- **W3C `traceparent`** is injected/extracted for trace continuity — the caller's launcher owns the
  launcher↔launcher hop (an `a2a.call` span); the callee's launcher extracts it so its `agent.invoke`
  nests underneath. For a *chained* hop, the user/SDK layer should forward `traceparent` from its
  inbound `/invoke` into its outbound `/a2a`; even if it doesn't, the envelope's inherited `traceId`
  keeps the conversation correlated.

## Typed failures

Every A2A failure is a typed error mapped to an HTTP status, and best-effort (a failed hop never crashes
the caller):

| Signal | Status | Cause |
|--------|--------|-------|
| `unknown_target` | 404 | DNS NXDOMAIN — no such agent in the registry. |
| `blocked` | 502 | Connection refused/reset/timeout (the NetworkPolicy shape). |
| `upstream_failure` | 502 | Other transport failure. |
| `caller_not_allowed` | 403 | Caller not on the callee's `allowedCallers`. |
| `cross_registry_denied` | 403 | Envelope `registryId` ≠ the callee's registry. |
| `depth_exceeded` / `cycle_detected` / `budget_exceeded` | (guard) | A conversation guard tripped; emitted as a span event with the partial `path` preserved. |
| malformed target / envelope / payload | 400 | — |
| oversize body | 413 | — |

## Scope (honest status)

The envelope above is the **synchronous** A2A contract (shipped). Async A2A (eventing, DLQ, idempotent
dedupe via `messageId`, large-payload blob offload) builds on the same envelope. A cross-branch /
cross-conversation **token + wall-clock** budget (vs. the per-branch hop budget here) unifies under the
cost-budget layer. Multi-registry membership and capability/semantic discovery are phase-2 (v1 discovery
is DNS-named).

## See also

- [Launcher endpoints](/reference/launcher-endpoints/)
- [Multi-agent](/concepts/multi-agent/)
- [Multi-agent teams](/guides/multi-agent-teams/)
- [Async eventing](/guides/async-eventing/)
