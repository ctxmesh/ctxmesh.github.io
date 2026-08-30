---
title: AgentScalingPolicy
description: The autoscaling intent for an agent (request-rate / custom-metric / queue-depth / schedule); the platform selects the backend.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `AgentScalingPolicy` · Scope: Namespaced · shortName: `asp`

## Overview

An `AgentScalingPolicy` declares an elastic scaling rule for an
[`AgentDeployment`](/reference/crd/agentdeployment/). The controller generates the appropriate backend
based on `spec.trigger`: Knative autoscaling annotations (`request-rate` / `custom-metric`), a KEDA
`ScaledObject` (`queue-depth`), or a CronJob (`schedule`, for `executionModel: job` agents).
Enforcement point: the **controller** (backend generation) plus the chosen backend (Knative / KEDA /
CronJob). The headline property is that you declare *intent* and bounds; the platform selects the
mechanism.

## When to use / when not

- **Use** to scale an agent on request rate, a custom metric, queue depth, or a cron schedule.
- **Not** for the basic min/max bounds of a plain serving agent — those are
  `AgentDeployment.spec.scaling`. Use this for event-driven / metric-driven / scheduled scaling.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.agentRef` | string | **Yes** | — | The AgentDeployment (same namespace) this policy targets. DNS label: 1–63 chars, pattern `^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$`. |
| `spec.trigger` | string (enum) | **Yes** | — | `request-rate` (Knative annotations), `custom-metric` (Knative class/metric annotations), `queue-depth` (KEDA ScaledObject on the registry broker), `schedule` (a CronJob; `schedule` field required). |
| `spec.min` | int32 | No | `0` | Minimum replicas. `0` enables scale-to-zero. Minimum 0. |
| `spec.max` | int32 | **Yes** | — | Maximum replicas. Minimum 1, and must be ≥ `min`. |
| `spec.cooldown` | string | No | `60s` | Cooldown after a scale event. Go duration, pattern `^[0-9]+(s\|m\|h)$`, max 32 chars. For `queue-depth`, maps to KEDA `cooldownPeriod`. |
| `spec.schedule` | string | Conditional | — | Standard 5-field cron expression (e.g. `*/5 * * * *`). **Required when `trigger: schedule`**, ignored otherwise. 1–128 chars. |
| `spec.queueRef` | object | No | registry broker | Broker for the `queue-depth` scaler source. Only meaningful when `trigger: queue-depth`. |
| `spec.queueRef.name` | string | **Yes** (if set) | — | Broker resource name. 1–253 chars. |
| `spec.queueRef.namespace` | string | No | policy's namespace | Broker namespace. Max 63 chars. |
| `spec.metric` | object | No | — | Custom metric for `trigger: custom-metric`, passed through as Knative annotations. |
| `spec.metric.class` | string | **Yes** (if set) | — | Knative autoscaling class (e.g. `kpa.autoscaling.knative.dev`). 1–253 chars. |
| `spec.metric.metric` | string | **Yes** (if set) | — | Metric name (e.g. `rps`, `concurrency`). 1–253 chars. |

### Validation rules (admission, CEL)

- `schedule` is required when `trigger: schedule`.
- `max >= min`.

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.backend` | string | Which backend the controller selected: `knative-annotations`, `keda-scaledobject`, or `cronjob`. Max 128 chars. |
| `status.observedGeneration` | int64 | `.metadata.generation` this status reflects. |
| `status.conditions` | []Condition | `Ready=True` means the target agent exists and the backend resource was created/updated. Failure reasons: `AgentNotFound`, `InvalidTrigger`, `BackendError`. |

## Examples

### Request-rate

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentScalingPolicy
metadata:
  name: triage-rate
  namespace: my-team
spec:
  agentRef: triage-agent
  trigger: request-rate
  min: 1
  max: 10
  cooldown: 60s
```

### Queue-depth (KEDA)

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentScalingPolicy
metadata:
  name: worker-queue
  namespace: my-team
spec:
  agentRef: worker-agent
  trigger: queue-depth
  min: 0
  max: 20
```

### Schedule (CronJob)

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentScalingPolicy
metadata:
  name: nightly-batch
  namespace: my-team
spec:
  agentRef: batch-agent      # executionModel: job
  trigger: schedule
  max: 1
  schedule: "0 2 * * *"
```

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [AgentDeployment](/reference/crd/agentdeployment/) · [AgentRegistry](/reference/crd/agentregistry/)
