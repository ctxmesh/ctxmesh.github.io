---
title: Runs & execution
description: "Runs as first-class durable objects: the state machine, streamed events, at-least-once delivery, resume, and cancel."
---

Invoking a ctxmesh agent doesn't just call an HTTP endpoint — it creates a **run**: a first-class,
durable object with a state machine and an event stream. This is the difference between "an agent is
a function you call" and "an agent invocation is a thing you can watch, pause, resume, cancel, and
survive a pod crash." Streaming, long-running, human-in-the-loop, and autonomous execution all fall
out of modeling the invocation as a run rather than a request.

A synchronous `POST /invoke` still exists as a **convenience** — a thin wrapper over the same
execution adapter for callers who just want an answer. The run model is the richer path underneath.

## Why a run is durable

An in-memory request dies with its process. That's fine for a stateless API and fatal for an agent
that might run for minutes, call tools, spend budget, and pause for a human. ctxmesh persists a run —
its status, its message history, its pending action (the *checkpoint*), and its full event log — in
Postgres, deliberately aligned with the credential state layer so an operator runs **one** datastore.
The payoff: a run **survives a pod restart or reschedule**, and a reconnecting client replays its
event log from where it left off.

The honest guarantee is **at-least-once, not exactly-once**. A worker claims a queued run under a row
lock (`FOR UPDATE SKIP LOCKED`, so no double-dispatch), holds a **lease** it renews by heartbeat, and
if it dies a live worker **reclaims** the run in place and finishes it. Resume re-mints the run's
capability pinned to its stable id, which flows downstream as an **idempotency key** — so duplicate
side effects are bounded by idempotent tooling. Exactly-once would require the tools themselves to be
idempotent; the platform gives you the key to make that so, and is honest that it can't promise more.

## The state machine

```
  queued ──► running ──► requires_action ──► running ──► ┌ succeeded ┐
                │              (pause)            │       │ failed    │
                └──────────────────────────────────┴────► │ cancelled │
                                                          └ expired   ┘
```

- **`requires_action`** is the *one* pause state — a run stops here for an on-behalf-of
  [consent](/guides/tools-and-mcp/) or a human [approval](/guides/approvals/), and resumes back to
  `running`. Terminal states (`succeeded` / `failed` / `cancelled` / `expired`) are frozen; the
  machine rejects any illegal transition, so a run can never skip execution or mutate a terminal
  state.
- An agent failure becomes an **honest `failed`**, never a swallowed success.
- The states are aligned with A2A task states and OpenAI Assistants run statuses, so the mesh and
  external clients interoperate.

There is a second, distinct pause: [workflows](/concepts/multi-agent/) introduce a **`waiting`**
state for a run suspended *between graph nodes*. `requires_action` is **human-woken**; `waiting` is
**machine-woken** (a child run's completion transactionally re-queues the parent). Keeping them
separate is what lets a multi-step workflow hold **no worker slot** while it waits.

## Streamed events

A run exposes a **resumable SSE stream**. Every status change auto-emits a `state` event from the one
place status changes, and each event carries a monotonic `seq` so a client can resume exactly where it
dropped.

| Event kind | Meaning |
|-----------|---------|
| `state` | a status transition |
| `message` | a completed assistant message |
| `token` | live model output, token by token (requires gateway streaming) |
| `step` | a step boundary — `{step, kind: model\|tool, tool, tokens}`; the console renders it as `Step N · kind · tool · ↑P ↓C` |

The `step` frame is what makes "what is my agent doing *right now*" observable without waiting for the
answer.

## The HTTP surface

Every route is [caller-scoped](/concepts/security-model/) — it acts with *your* identity, never a
privileged service account.

| Method + path | Purpose |
|---|---|
| `POST /api/runs` | create a run (agent + input [+ conversationId]) → `202 {id, status}`, executes async |
| `GET /api/runs/{id}` | the run's current status + result |
| `GET /api/runs/{id}/events` | the SSE stream, resumable via `Last-Event-ID` or `?fromSeq=`, closes on terminal |
| `POST /api/runs/{id}/resume` | resume from `requires_action` (e.g. approve/deny) |
| `POST /api/runs/{id}/cancel` | a **real** cancel — see below |

### Cancel is a real kill, not a status lie

`cancel` doesn't just flip a database flag and hope. It flips the durable status **and** writes a
short-TTL control marker to the state layer; the agent pod reads it and the launcher **refuses the
next model call** with a typed `409 run_cancelled`, cancelling the in-flight request. Cancellation
happens at model/tool-call granularity — a genuinely stopped run, not a soft-terminal fiction.

## Record & replay

Because a run's model and tool I/O flow through the two platform proxies, a run can be **recorded**
into a portable fixture and **replayed** deterministically — the foundation for testing agents in CI
with zero cluster and zero cloud.

- **Record-capable** is per-deployment (`AgentDeployment.spec.record: true`): the controller turns on
  the launcher gateway and fronts all tools through the egress sidecar, and refuses to start if there's
  no fixture sink (never a silent capture-nothing).
- **Capture** is per-run (`POST /api/runs {record: true}`); the BFF fails a record request *closed*
  against a non-record-capable agent.
- Capture rides **two seams**: the launcher gateway records model I/O (raw bytes, request body only),
  and the egress sidecar records tool I/O **before** on-behalf-of credential injection — so **no
  credential ever lands in a fixture**. The fixture is content-addressed, VCR-cassette-shaped, and
  **sensitive-by-default / not-for-git**.
- Replay (`agentry dev --replay`) mocks both channels: **lenient on request bytes** (a drifted
  prompt timestamp serves the recorded response with a warning) but **strict on shape** (an
  unrecorded tool call or model-index overflow is a hard fail).

See [Record & replay](/guides/record-and-replay/).

## See also

- [The launcher contract](/concepts/the-launcher-contract/) — where a run actually executes
- [Execution models](/concepts/execution-models/) — serving / eventing / job
- [Multi-agent](/concepts/multi-agent/) — the `waiting` state and spawn lineage
- [Security model](/concepts/security-model/) — caller-scoped runs, run capabilities
- [Record & replay](/guides/record-and-replay/) · [HTTP API reference](/reference/http-api/)
- [RunsClient](/sdk/python/) — driving runs from the SDK
