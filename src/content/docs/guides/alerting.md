---
title: Alerting
description: "Author an AlertPolicy: select agents, set threshold conditions (error rate, p95, budget, regression), and route fired alerts to notification channels."
---

**Goal:** get notified when an agent's error rate, latency, budget, or a proven regression crosses a
threshold — routed to the console feed, a signed webhook, or email.

**Prerequisites:** an agent deployed ([Deploy an agent](/guides/deploy-an-agent/)). For the metric
conditions (`errorRate`, `p95Latency`), Knative request metrics scraped by Prometheus must be wired — see
the note under [Failure modes](#failure-modes).

## What an AlertPolicy does

An [`AlertPolicy`](/reference/crd/alertpolicy/) is a namespaced CRD: a **selector** (which agents) + a list
of **conditions** (threshold rules) + a **route** (where fired alerts go). It is **detection and routing
only** — it observes agent metrics and fires notifications. It does **not** take action; auto-rollback is a
separate path configured on `AgentDeployment.spec.rollout.autoRollback`
([Canary & rollout](/guides/canary-and-rollout/)). The policy fires when **any** condition is breached.

## 1. Author the policy

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AlertPolicy
metadata:
  name: support-health
  namespace: my-team
spec:
  selector:                     # which AgentDeployments — empty selector matches all in the namespace
    names:
      - support-agent
    # matchLabels: { team: support }   # union with names
  conditions:                   # fires when ANY condition is breached
    - name: high-error-rate
      type: errorRate           # 5xx fraction at the Knative edge, per agent
      threshold: "0.05"         # 5 %
      window: 5m
    - name: slow-p95
      type: p95Latency          # p95 request latency in milliseconds
      threshold: "800"
      window: 5m
    - name: budget-soft
      type: budgetSoft          # fraction of the tenant budget consumed (0..1)
      threshold: "0.8"          # 80 %
    - name: regressed
      type: regressionDetected  # event-driven: fires on the agent's RegressionDetected condition
  route:
    channels:                   # at least one required
      - type: console           # the durable console alert feed
      - type: webhook
        webhook:
          url: https://alerts.example.com/ctxmesh
          secretRef: alert-signing-key   # Secret in this namespace, key "signingKey" (HMAC)
```

Apply it:

```bash
kubectl apply -f support-health.yaml
```

### Condition types

- `errorRate` / `runFailureRate` — a fraction `0..1` (e.g. `"0.05"` = 5%).
- `p95Latency` — milliseconds (e.g. `"800"`), p95 request latency at the Knative edge.
- `budgetSoft` — fraction-of-budget `0..1` (e.g. `"0.8"` = 80% of the tenant budget consumed).
- `forecastExceeded` — a USD cap (e.g. `"10.00"`).
- `regressionDetected` — **event-driven**; threshold and window are ignored (it fires on the agent's
  `RegressionDetected=True` status condition).
- `approvalWaiting` — **event-driven, per-run**; opts the selected agents into HITL approval-waiting
  notifications (a run pausing on approval fires a per-run alert that deep-links the authenticated console
  approval view). See [Share a run](/guides/share-a-run/) for the collaboration surface.

### Channel types

- `console` — the durable console alert feed.
- `webhook` — an external HTTPS `POST`, signed with the HMAC key read from `webhook.secretRef` (read by the
  trusted controller, never the BFF).
- `email` — SMTP delivery to `email.to` recipients via the platform relay (the SMTP transport is platform
  config on the controller; an unconfigured relay skips the dispatch rather than wedging alerting).

## 2. Watch it go Ready

```bash
kubectl get alertpolicy support-health -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
# → True   (the policy is admitted and evaluating)
```

## 3. See a condition fire

The reconciler evaluates on a periodic requeue and on AgentDeployment changes. Per-condition firing state
lands in `status.ruleStates`:

```bash
kubectl get alertpolicy support-health -n my-team \
  -o jsonpath='{range .status.ruleStates[*]}{.name}={.firing} ({.lastValue}){"\n"}{end}'
# high-error-rate=true (0.07)
# slow-p95=false (420)
# ...
```

When a condition transitions `false → true`, a durable alert is appended (surfaced in the console alert
feed for a `console` channel, POSTed for a `webhook`, emailed for `email`) and resolved on
`true → false`. Fired alerts are also written to the control-plane `alerts` table and an audit-log row.

## When to use / when not

- **Use** to be paged when an agent's error rate / latency / budget / regression crosses a line, or when a
  run is waiting on human approval.
- **Not** to *act* on the signal — auto-rollback lives on `AgentDeployment.spec.rollout.autoRollback`
  ([Canary & rollout](/guides/canary-and-rollout/)); detection, actuation, and notification stay separate.

## Defaults

- An **empty `selector`** matches **all** AgentDeployments in the policy's namespace.
- `regressionDetected` and `approvalWaiting` ignore `threshold` and `window` (both event-driven).
- `errorRate` is forever a plain 5xx fraction over `window`; 4xx responses (including typed
  guardrail / approval-required / tool-denial denials) are **not** availability errors and are excluded.

## Failure modes

- **Metric source not wired** → `errorRate` / `p95Latency` **abstain** (a clear status reason, never a
  false alert). They read Knative queue-proxy per-revision request metrics via Prometheus; enabling Knative
  request metrics + Prometheus + the queue-proxy scrape is an operator prerequisite. `runFailureRate`
  similarly abstains without a control-plane runs source.
- **`budgetSoft` / `forecastExceeded`** need a durable per-tenant cost rollup; without it the condition
  abstains rather than firing falsely.
- **Bad webhook / unconfigured SMTP relay** → the dispatch is skipped (logged), never wedging the rest of
  alerting — the same fail-safe posture across channels.

:::note
The live data feed for the SLO conditions (`errorRate`, `p95Latency`, `runFailureRate`) depends on
cluster-side metrics enablement that finalizes toward GA; until then those conditions abstain with a status
reason. Budget/forecast conditions read the durable cost rollup.
:::

## See also

- [AlertPolicy reference](/reference/crd/alertpolicy/) ·
  [Observability & tracing](/guides/observability-and-tracing/)
- [Canary & rollout](/guides/canary-and-rollout/) (auto-rollback on regression) ·
  [Multi-tenancy & quotas](/guides/multi-tenancy-and-quotas/) (the tenant budget `budgetSoft` reads)
- [Observability model](/concepts/observability-model/) · [Observability backends](/operations/observability-backends/)
