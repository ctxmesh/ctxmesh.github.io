---
title: Scaling agents
description: "AgentScalingPolicy: scale on request-rate, queue-depth, or a schedule — with min/max bounds and scale-to-zero — and how it relates to inline scaling."
---

**Goal:** attach an elastic scaling rule to an agent — you declare the *intent* (a trigger and bounds) and
the platform selects the backend.

**Prerequisites:** the platform installed; an agent already [deployed](/guides/deploy-an-agent/) in the
same namespace. For `queue-depth`, the agent should be an [`eventing`](/guides/async-eventing/) consumer;
for `schedule`, an `executionModel: job` agent.

## Two scaling surfaces

There are two distinct ways to scale an agent — use the right one:

- **`AgentDeployment.spec.scaling`** (inline `min`/`max`) — the basic Knative autoscaler bounds of a plain
  `serving` agent (request-driven, defaults `min: 0`, `max: 3`). Use this for a simple request/response
  agent that just needs bounds. See [Deploy an agent](/guides/deploy-an-agent/).
- **`AgentScalingPolicy`** (this guide) — a *separate* resource that declares a **trigger** (request-rate /
  custom-metric / queue-depth / schedule) plus `min`/`max`, and lets the controller pick the backend
  (Knative autoscaling annotations, a KEDA `ScaledObject`, or a CronJob). Use this for event-driven,
  metric-driven, or scheduled scaling.

## How it works

An `AgentScalingPolicy` targets one `AgentDeployment` in the same namespace by name (`spec.agentRef`). The
controller reads `spec.trigger` and generates the matching backend:

| `spec.trigger` | Backend the controller generates |
|----------------|----------------------------------|
| `request-rate` | Knative autoscaling annotations (concurrency/rps) on the agent's ksvc |
| `custom-metric` | Knative custom autoscaling (class/metric annotations) on the ksvc |
| `queue-depth` | a **KEDA `ScaledObject`** targeting the agent's deployment, reading the registry broker depth |
| `schedule` | a **CronJob** (for an `executionModel: job` agent) on the cron expression |

You declare intent and bounds; the platform selects the mechanism and reports which one on
`status.backend`.

## 1. Author the policy

A queue-depth policy with scale-to-zero (`min: 0`):

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentScalingPolicy
metadata:
  name: worker-queue
  namespace: my-team
spec:
  agentRef: worker-agent           # the AgentDeployment (same namespace) to scale
  trigger: queue-depth             # request-rate | custom-metric | queue-depth | schedule
  min: 0                           # 0 = scale-to-zero when the queue is empty
  max: 20
  cooldown: 60s                    # cooldown after a scale event (Go duration)
  # queueRef: { name: support-broker }   # optional; defaults to the registry broker
```

Apply it:

```bash
kubectl apply -f worker-queue.yaml
```

## 2. Watch it attach

```bash
kubectl get agentscalingpolicy worker-queue -n my-team -w
kubectl get agentscalingpolicy worker-queue -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status} {.status.backend}{"\n"}'
# → True   keda-scaledobject
```

`Ready=True` means the target agent exists and the chosen backend resource was created/updated;
`status.backend` reports which one (`knative-annotations`, `keda-scaledobject`, or `cronjob`). Under load,
replicas scale toward `max`; when idle, back toward `min` (to `0` when `min: 0`).

## Other triggers

**Request-rate** — for an interactive `serving` agent that should keep warm capacity:

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentScalingPolicy
metadata:
  name: triage-rate
  namespace: my-team
spec:
  agentRef: triage-agent
  trigger: request-rate
  min: 1                           # keep one warm replica (no cold start)
  max: 10
```

**Schedule** — run an `executionModel: job` agent on a cron (the controller emits a CronJob):

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentScalingPolicy
metadata:
  name: nightly-batch
  namespace: my-team
spec:
  agentRef: batch-agent            # executionModel: job
  trigger: schedule
  max: 1
  schedule: "0 2 * * *"            # required when trigger: schedule (5-field cron)
```

## When to use / when not

- **Use** `AgentScalingPolicy` for queue-depth (event consumers), custom-metric, request-rate warm
  capacity, or a scheduled job.
- **Use** the inline `AgentDeployment.spec.scaling` for the plain min/max bounds of a request-driven agent —
  don't reach for a policy when you only need bounds.
- **Not** a way to exceed org limits: the scaler bounds pods; provider rate limits stay coordinated by the
  model gateway, so scaling out never breaches org quotas.

## Defaults

- `min` defaults to **0** (scale-to-zero); `max` is **required** (minimum 1, and must be ≥ `min`).
- `cooldown` defaults to **`60s`** (Go duration `^[0-9]+(s|m|h)$`).
- `schedule` is **required** when `trigger: schedule`, ignored otherwise.
- `queueRef` defaults to the agent's **registry broker**; only meaningful for `queue-depth`.
- Scaling **never drops below `min`** — `min: 1` guarantees a warm replica; `min: 0` allows idle-to-zero.

:::note[Queue-depth live scale-up]
The v1 backend (Knative Eventing in-memory channel) exposes no backlog metric KEDA can read, so live
queue-depth *scale-up* is gated on phase-2 queue backends (Kafka / NATS JetStream) or a metrics pipeline.
The mechanism is correct — the `ScaledObject` is created and KEDA accepts it — but the metric feed lands
toward GA. Specifics finalize then; see the [reference](/reference/crd/agentscalingpolicy/).
:::

## Failure modes

The `Ready` condition carries the reason on failure:

- **`AgentNotFound`** — `spec.agentRef` names an `AgentDeployment` that doesn't exist in the namespace.
  Deploy it, or fix the ref.
- **`InvalidTrigger`** — an unsupported trigger, or `trigger: schedule` without a `schedule` (rejected by
  the admission CEL rule). Set a valid trigger / add the cron.
- **`BackendError`** — the controller could not create/update the chosen backend (KEDA `ScaledObject`,
  Knative annotations, or CronJob). `kubectl describe` shows the underlying cause.

## See also

- [AgentScalingPolicy reference](/reference/crd/agentscalingpolicy/) ·
  [AgentDeployment reference](/reference/crd/agentdeployment/)
- [Async & eventing](/guides/async-eventing/) · [Execution models](/concepts/execution-models/) ·
  [Deploy an agent](/guides/deploy-an-agent/)
