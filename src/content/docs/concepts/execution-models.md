---
title: Execution models
description: "serving / eventing / job — the backends (Knative, KEDA, Job), when to use each, and how rollout adapts per model."
---

An agent's **execution model** answers one question: *what triggers it, and how does it scale?* You
choose it with a single field — `AgentDeployment.spec.executionModel` — and the platform picks the
right Kubernetes machinery underneath. There are three models, and they exist because
request/response, event-driven, and batch work have genuinely different scaling shapes; forcing them
onto one backend is where platforms get brittle.

## The three models

| Model | Trigger | Backend it reconciles to | Scales on |
|-------|---------|--------------------------|-----------|
| `serving` (default) | synchronous request | Knative Service (ksvc) | request rate / concurrency (Knative KPA) |
| `eventing` | a message on the registry broker | a plain Deployment + Service + Trigger | queue depth (KEDA) |
| `job` | a schedule, or one-shot | Kubernetes `Job` / `CronJob` | not applicable (runs to completion) |

`serving` is the default, so a plain agent needs nothing extra. The other two are opt-in for
workloads that aren't request-shaped.

### `serving` — request/response

Use it for anything a caller waits on: a chat agent, an HTTP API, a tool another agent calls
synchronously. It reconciles to a **Knative Service**, which gives you request-driven autoscaling
including **scale-to-zero** — an idle agent costs nothing, and a cold request scales it back up.
Because the caller is waiting, request rate (not backlog) is the right scaling signal, and Knative's
KPA is the right autoscaler.

### `eventing` — event-driven / async

Use it for work that arrives as events rather than blocking calls: a consumer draining a topic, a
reaction to another agent's output, fan-out background processing. An `eventing` agent must be a
member of an [`AgentRegistry`](/concepts/multi-agent/); the registry owns a Knative Eventing
**broker**, and the agent gets a **Trigger** subscribing it to that broker.

Here the model deliberately *diverges* from `serving`: an `eventing` agent is a **plain Deployment**,
not a ksvc. The reason is a real, load-bearing trade-off discovered against a live cluster —
[KEDA](/guides/scaling-agents/) scales on queue depth by naming the target Deployment, but a Knative
ksvc hides its Deployment behind a generated revision name, so KEDA can't find it, and even if it
could, KEDA and Knative's autoscaler would fight over the replica count. Event consumers aren't
request-driven, so Knative Serving buys them nothing. A plain Deployment is cleanly KEDA-scalable —
so that's what an `eventing` agent gets.

:::note
Live queue-depth scale-up depends on a backend that exposes a backlog metric. The v1 in-memory
channel does not, so the KEDA scaler is wired and accepted but reads a placeholder metric; real
queue-depth scaling arrives with the phase-2 Kafka / NATS backends. The mechanism is proven; the
metric feed is the remaining piece.
:::

Async delivery has explicit semantics: **at-least-once** delivery, launcher-side **idempotency**
(the consumer dedupes on the envelope's `messageId`), best-effort ordering per `conversationId`, a
per-registry **dead-letter queue** after N retries, and automatic **blob offload** to the object
store for payloads over 256 KB (the envelope carries a reference; the launcher rehydrates it before
your agent sees it). See [Async & eventing](/guides/async-eventing/).

### `job` — batch / scheduled

Use it for offline or periodic work: a nightly summarizer, a batch scorer, a one-shot data pass. It
reconciles to a Kubernetes `Job` (one-shot) or a `CronJob` (when a `schedule`-triggered
[`AgentScalingPolicy`](/reference/crd/agentscalingpolicy/) targets it). The launcher still fronts the
container — same [runtime contract](/concepts/the-launcher-contract/) — and the pod exits when the
agent completes. Overlapping runs are forbidden by default so a slow run never stacks on itself.

## Scaling is a separate, declarative intent

You don't hand-wire an HPA or a ScaledObject. You declare *intent* with an
[`AgentScalingPolicy`](/reference/crd/agentscalingpolicy/) — a `trigger`
(`request-rate` / `custom-metric` / `queue-depth` / `schedule`) plus `min`/`max` bounds — and the
platform selects the backend: Knative autoscaling annotations for request-rate, a KEDA `ScaledObject`
for queue-depth, a `CronJob` for a schedule. `min: 0` means scale-to-zero. Crucially, provider rate
limits stay enforced at the [Model Gateway](/concepts/architecture/), independent of pod scaling —
the scaler bounds *pods*, the gateway bounds *calls*, so scaling out can never breach an
organization's provider limits.

## How rollout adapts per model

A new [`AgentVersion`](/reference/crd/agentversion/) rolls out differently depending on the model,
because "shift traffic gradually" means different things for each:

- **`serving`** — a **traffic-split canary**: the new revision takes a small percentage of live
  requests, both arms are scored per-version, and a human (or, opt-in, auto-progression) promotes to
  100% or aborts to 0%. See [Canary & rollout](/guides/canary-and-rollout/).
- **`eventing`** — a **shadow consumer group** approach rather than a traffic split (there's no
  request stream to split).
- **`job`** — **version-pinned** scoring of a sample before the new version becomes the one the
  schedule runs.

In every case the [eval gate](/guides/evals-and-the-deploy-gate/) can block a version that regresses,
and the model determines only *how* the shift is performed.

## Choosing

Reach for `serving` unless you have a reason not to — it's the default and covers most agents. Choose
`eventing` when work arrives as events and you want backlog-driven scaling and a DLQ. Choose `job`
for batch or scheduled runs that start, do finite work, and exit.

## See also

- [The launcher contract](/concepts/the-launcher-contract/) — the same runtime contract across all models
- [Runs & execution](/concepts/runs-and-execution/) — what one invocation is, durably
- [Custom resources](/concepts/custom-resources/) — `AgentDeployment`, `AgentScalingPolicy`
- [Scaling agents](/guides/scaling-agents/) · [Async & eventing](/guides/async-eventing/) · [Canary & rollout](/guides/canary-and-rollout/)
- [AgentDeployment reference](/reference/crd/agentdeployment/) · [AgentScalingPolicy reference](/reference/crd/agentscalingpolicy/)
