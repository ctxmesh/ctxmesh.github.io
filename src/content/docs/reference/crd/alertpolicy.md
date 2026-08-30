---
title: AlertPolicy
description: Threshold rules over agent metrics (error rate, p95 latency, budget, forecast, regression, run-failure, approval-waiting) routed to console / webhook / email. Detection + routing only.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `AlertPolicy` · Scope: Namespaced · shortName: `ap`

## Overview

An `AlertPolicy` selects a set of [`AgentDeployment`](/reference/crd/agentdeployment/)s and fires
notifications when any of its threshold conditions is breached. The alerting plane observes agent
metrics and delivers to console, webhook, or email channels. Enforcement point: the **controller /
alerting plane** (evaluation + routing). This is **detection and routing only** — actuation
(auto-rollback) is a separate controller path, and lives on the AgentDeployment rollout, not here. The
policy fires when **any** condition is breached.

## When to use / when not

- **Use** to be notified when an agent's error rate, latency, budget, forecast, regression, or
  run-failure rate crosses a threshold (or a run waits on approval).
- **Not** for taking action — auto-rollback is configured on `AgentDeployment.spec.rollout.autoRollback`.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.selector` | object | No | (matches all in ns) | Picks the AgentDeployments this policy watches. An empty selector matches all in the same namespace. |
| `spec.selector.matchLabels` | map[string]string | No | — | Match AgentDeployments whose labels match all pairs. |
| `spec.selector.names` | []string | No | — | Explicit AgentDeployment names to watch (union with `matchLabels`). |
| `spec.conditions` | []object | **Yes** | — | Threshold rules; the policy fires when ANY is breached. MinItems 1. |
| `spec.conditions[].name` | string | **Yes** (per item) | — | Stable id for this condition (keys its per-condition status). |
| `spec.conditions[].type` | string (enum) | **Yes** (per item) | — | `errorRate` / `p95Latency` / `budgetSoft` / `forecastExceeded` / `regressionDetected` / `runFailureRate` / `approvalWaiting`. |
| `spec.conditions[].threshold` | string | No | — | Numeric firing threshold (semantics per type — see below). Stored as a string to carry rates/ms/USD uniformly. |
| `spec.conditions[].window` | string | No | — | Evaluation look-back window (e.g. `5m`, `1h`). Ignored by `regressionDetected` and `approvalWaiting` (both event-driven). |
| `spec.route` | object | **Yes** | — | Where fired alerts are delivered. |
| `spec.route.channels` | []object | **Yes** | — | Notification destinations. MinItems 1. |
| `spec.route.channels[].type` | string (enum) | **Yes** (per item) | — | `webhook` (signed external POST), `console` (durable console alert feed), or `email` (SMTP via the platform relay). |
| `spec.route.channels[].webhook.url` | string | **Yes** (if webhook) | — | HTTPS endpoint receiving the signed alert POST. |
| `spec.route.channels[].webhook.secretRef` | string | No | — | Secret (same namespace) holding the HMAC signing key under `signingKey`. Read by the controller, never the BFF. |
| `spec.route.channels[].email.to` | []string | **Yes** (if email) | — | Recipient email addresses. MinItems 1. |
| `spec.route.channels[].email.subject` | string | No | — | Override the default alert subject line. |

### Threshold semantics by condition type

- `errorRate` / `runFailureRate` — fraction 0..1 (e.g. `0.05` = 5%). `errorRate` is the 5xx fraction at
  the Knative edge, per agent, over `window` (4xx guardrail/approval denials are excluded).
- `p95Latency` — milliseconds (e.g. `500`), p95 request latency at the Knative edge.
- `budgetSoft` — fraction-of-budget 0..1 (e.g. `0.8` = 80% consumed).
- `forecastExceeded` — USD (e.g. `10.00`).
- `regressionDetected` — threshold ignored (event-driven; the `RegressionDetected` condition on the
  AgentDeployment triggers it).
- `approvalWaiting` — threshold ignored (event-driven, per-run; opts the selected agents into
  approval-waiting notifications).

> `errorRate` and `p95Latency` read Knative queue-proxy metrics via Prometheus; when Prometheus is not
> wired they **abstain** (a clear status reason, never a false alert).

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.ruleStates` | []object | Per-condition firing state, keyed by `AlertCondition.name`. |
| `status.ruleStates[].name` | string | Matches the condition name. |
| `status.ruleStates[].firing` | bool | True when currently breached. |
| `status.ruleStates[].lastValue` | string | Most recent evaluated metric value (same encoding as threshold). |
| `status.ruleStates[].lastTransitionTime` | time | When `firing` last changed. |
| `status.ruleStates[].lastNotifiedTime` | time | When the most recent notification was sent. |
| `status.conditions` | []Condition | Standard status conditions (`Ready` = admitted + evaluating). |
| `status.observedGeneration` | int64 | `.metadata.generation` most recently reconciled. |

## Examples

### Minimal — error rate to console

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AlertPolicy
metadata:
  name: support-health
  namespace: my-team
spec:
  conditions:
    - name: high-error-rate
      type: errorRate
      threshold: "0.05"
      window: 5m
  route:
    channels:
      - type: console
```

### Fuller — multi-condition + webhook + email

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AlertPolicy
metadata:
  name: support-health
  namespace: my-team
spec:
  selector:
    names:
      - support-agent
  conditions:
    - name: high-error-rate
      type: errorRate
      threshold: "0.05"
      window: 5m
    - name: slow-p95
      type: p95Latency
      threshold: "800"
      window: 5m
    - name: budget-soft
      type: budgetSoft
      threshold: "0.8"
    - name: regressed
      type: regressionDetected
  route:
    channels:
      - type: webhook
        webhook:
          url: https://alerts.example.com/ctxmesh
          secretRef: alert-signing-key
      - type: email
        email:
          to: [oncall@example.com]
          subject: "[ctxmesh] support-agent alert"
```

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [AgentDeployment](/reference/crd/agentdeployment/) (rollout / auto-rollback) ·
  [EvalSuite](/reference/crd/evalsuite/) (regression source)
