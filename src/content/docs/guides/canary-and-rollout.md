---
title: Canary & rollout
description: "Traffic-split canary, auto-progression on a passing score, human-gated and automatic rollback, per-execution-model strategies."
sidebar:
  order: 7
---

**Goal:** roll a new agent revision out to a slice of live traffic, let both arms accumulate online
scores, and promote (or roll back) on the result — instead of a hard swap.

**Prerequisites:** an agent deployed on `executionModel: serving`; an [`EvalSuite`](/reference/crd/evalsuite/)
referenced via `spec.evalSuiteRef` (canary requires a gated agent) — see
[Evals & the deploy gate](/guides/evals-and-the-deploy-gate/); an `online` scoring policy on that suite so
the canary has a signal to judge — see [Feedback & improvement](/guides/feedback-and-improvement/).

## Two different gates — don't confuse them

- **The eval deploy-gate (pre-serve):** scores a *candidate* against a dataset **before** it serves any
  traffic, and blocks or promotes on a threshold. This is the offline gate from
  [Evals & the deploy gate](/guides/evals-and-the-deploy-gate/).
- **The online canary (post-serve):** splits live traffic between the current and candidate revisions so
  **both arms accumulate online scores** on real traffic, then promotes or rolls back. That is this guide.

An agent can use both: pass the offline gate first, then canary on live traffic.

## 1. Turn on a canary

Add `spec.rollout` to a gated `serving` agent:

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: support-agent
  namespace: my-team
spec:
  image: ghcr.io/my-org/support-agent:1.5.0    # the candidate change
  executionModel: serving
  evalSuiteRef: support-quality                # canary requires a gated agent
  rollout:
    strategy: canary                           # named-revision traffic split
    canaryPercent: 10                          # 10% of live traffic to the candidate
```

Apply the change. The controller produces a candidate revision, splits traffic (a Knative named-revision
split), and the deploy-gate enters a `canary` phase:

```bash
kubectl apply -f support-agent.yaml
kubectl get agentdeployment support-agent -n my-team \
  -o jsonpath='{.status.gate.phase} {.status.rollout.candidateRevision} {.status.rollout.currentPercent}{"\n"}'
# e.g.  canary  support-agent-8e3f...  10
```

Per-arm online scores fall out of the online-scoring worker keyed by revision — you don't wire anything
extra. There is **no shadow arm** (that would double real side-effects); the canary is a real traffic split.

## 2. Promote (human-gated by default)

In v1, a passing signal **does not auto-serve** — a human promotes. The candidate rests at `canary` (or
`awaiting-promotion`) until you approve it:

```bash
# Promote the candidate to 100% (or click Promote in the console).
kubectl annotate agentdeployment support-agent -n my-team \
  agents.ctxmesh.ai/promote=<candidateRevision>
```

With a noisy new online signal, the human click *is* the correct damping mechanism — the platform surfaces
a signal worth trusting and lets you decide.

## 3. Opt into automatic progression

Instead of promoting by hand, let a healthy verdict advance the canary through a step ladder and
auto-promote at 100%:

```yaml
spec:
  rollout:
    strategy: canary
    canaryPercent: 10
    autoProgress:
      enabled: true
      steps:                     # percent ladder the canary climbs
        - percent: 25
        - percent: 50
        - percent: 100
      dwellSeconds: 3600         # minimum soak per step before an advance is considered
```

The controller advances **exactly one step per reconcile**, and only on a step that has *soaked* the full
`dwellSeconds` **and** has an explicitly healthy verdict (`RegressionDetected=False`, which structurally
needs enough samples in the window). It **holds** on an unknown verdict, a detected regression, a freeze,
or mid-dwell — it never fast-forwards. A human `promote` or `rollback` always wins over auto-progression, and
a fresh push resets the ladder to step 0.

Watch the progression:

```bash
kubectl get agentdeployment support-agent -n my-team \
  -o jsonpath='{.status.rollout.currentPercent} {.status.rollout.reason} {.status.rollout.lastAdvanceAt}{"\n"}'
# reason ∈ Advanced | AutoProgressHeld | InsufficientData | Frozen | AutoPromoted
```

## 4. Roll back

Rollback is a separate, audited actuator — human-gated by default:

```bash
kubectl annotate agentdeployment support-agent -n my-team \
  agents.ctxmesh.ai/rollback=<agentversion>     # revert the serving spec to a known-good AgentVersion
```

Opt into **automatic** rollback with `spec.rollout.autoRollback.enabled: true` — the controller then rolls
back to the last-healthy version on `RegressionDetected=True`, reusing the same damping guards (cooldown,
flap detection, a healthy target) and setting `status.rollback.frozenUntilAck` to stop runaway actions until
a human acknowledges:

```bash
kubectl annotate agentdeployment support-agent -n my-team \
  agents.ctxmesh.ai/rollback-ack=""             # clear a frozenUntilAck freeze set by an auto-action
```

## Per-execution-model strategy

The canary traffic-split is a **`serving`-only** mechanism (it splits HTTP traffic across Knative
revisions). `eventing` and `job` agents have no request traffic to split, so `strategy: canary` does not
apply to them — for those, promotion is the plain promote-all/hold path from the deploy gate. Sticky A/B
routing and eventing/job canary strategies are on the roadmap.

## When to use / when not

- **Use** a canary when a change is risky enough that a slice of real traffic is the honest test, and you
  have an `online` scoring policy so both arms are judged.
- **Use** `autoProgress` once you trust the online signal and want hands-off progression with a soak.
- **Not** for an `eventing` / `job` agent (no request traffic to split).
- **Not** a substitute for the offline deploy gate — gate first, then canary.

## Defaults

- `spec.rollout` absent ⇒ promote-all/hold (no canary).
- `strategy` defaults to `""` (promote-all/hold); `canaryPercent` defaults to `10` (range 1–99).
- `autoProgress.enabled` and `autoRollback.enabled` default to `false` (both opt-in).
- `autoProgress.steps` defaults to `[{percent: 100}]`; `dwellSeconds` defaults to `3600` (minimum 60).
- Promotion and rollback are **human-gated in v1** unless you explicitly opt into the automatic paths.

## Failure modes

- **Insufficient samples in a window** → auto-progression holds (`reason: InsufficientData`); it never
  advances on absence of evidence. *Fix:* let more traffic accrue, or lower the suite's `online.minSamples`.
- **A regression is detected** (`RegressionDetected=True`) → progression holds; with `autoRollback.enabled`
  the controller rolls back and sets `frozenUntilAck`. *Fix:* investigate, then clear the freeze with
  `rollback-ack`.
- **A freeze is set** (`status.rollback.frozenUntilAck: true`) → all auto-actions hold until acked.
- **Online scoring backend lagging / unavailable** → the verdict is `Unknown`; progression holds (no
  fast-forward on a missing signal).

:::note
Exact canary config field names are stable in the CRD; the online-scoring verdict thresholds and the
sample-count minimums finalize toward GA. Auto-progression on real live scores is proven in the harness;
the automatic paths remain opt-in and default-off.
:::

## See also

- Reference: [AgentDeployment](/reference/crd/agentdeployment/) (rollout + rollback status) ·
  [EvalSuite](/reference/crd/evalsuite/)
- Concept: [Runs & execution](/concepts/runs-and-execution/) · [Architecture](/concepts/architecture/)
- Guide: [Evals & the deploy gate](/guides/evals-and-the-deploy-gate/) ·
  [Feedback & improvement](/guides/feedback-and-improvement/) · [Alerting](/guides/alerting/)
