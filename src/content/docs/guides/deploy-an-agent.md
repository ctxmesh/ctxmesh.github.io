---
title: Deploy an agent
description: "Deploy a custom-image agent, verify it's serving, and attach governance."
sidebar:
  order: 1
---

**Goal:** get your own agent image running as a governed, autoscaled service.

**Prerequisites:** the platform installed; a namespace you can write to; a model available via a
[`ModelRoute`](/guides/connect-a-model-provider/); your agent packaged on a supported base image.

## 1. Describe the agent

An agent is one resource. The minimum is an image and an execution model:

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: support-agent
  namespace: my-team
spec:
  image: ghcr.io/my-org/support-agent:1.0.0
  executionModel: serving        # serving | eventing | job
  # The model is chosen in your code by calling MODEL_GATEWAY_URL with model="<ModelRoute name>".
  scaling:
    min: 0                        # scale to zero when idle (default)
    max: 3
```

Apply it:

```bash
kubectl apply -f support-agent.yaml
```

## 2. Watch it come up

```bash
kubectl get agentdeployment support-agent -n my-team -w
# Ready transitions to True once the serving revision is up.
kubectl get agentdeployment support-agent -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status} {.status.url}{"\n"}'
```

The controller injects the gateway URL + launcher config, wires tracing, and reports readiness and the
serving URL on `status`.

## 3. Talk to it

Send a request to `status.url` (or use the console **Playground**). Every turn is traced — open the
agent's **runs** in the console to see the step → tool → model tree, cost, and any guardrail decisions.

## 4. Attach governance (by reference)

Governance is opt-in and reusable. Author the policies once (see the linked guides) and reference them:

```yaml
spec:
  image: ghcr.io/my-org/support-agent:1.0.0
  executionModel: serving
  guardrailPolicyRef: default-guardrails   # content rules — /guides/guardrails/
  approvalPolicyRef: sensitive-tools       # human approval — /guides/approvals/
  evalSuiteRef: support-quality            # gate releases — /guides/evals-and-the-deploy-gate/
  feedbackStoreRef: support-feedback       # feedback model — /guides/feedback-and-improvement/
  sessionMemory:
    scope: session                         # per-conversation memory — /guides/memory-and-sessions/
```

A **dangling reference fails closed**: the agent goes `Ready=False` and is held rather than served
ungoverned.

## When to use / when not

- **`serving`** for interactive request/response agents; **`eventing`** for async/event-driven work;
  **`job`** for batch. See [Execution models](/concepts/execution-models/).
- Leave `scaling.min: 0` for scale-to-zero unless you need warm capacity (cold-start latency vs cost).

## Defaults

- `executionModel` defaults to `serving`; `scaling` defaults to `min: 0`, `max: 3`.
- No `evalSuiteRef` ⇒ no deploy gate (zero overhead). No policy refs ⇒ today's ungoverned behavior.

## Failure modes

- Image pull / crash → the revision is not `Ready`; `kubectl describe` + the pod logs show why.
- Dangling policy ref → `Ready=False` with the reason on the condition (fix or remove the ref).
- Model alias unresolved (no matching `ModelRoute`) → model calls fail fast at the gateway.

## Next

[Connect a model provider](/guides/connect-a-model-provider/) · [Guardrails](/guides/guardrails/) · [Gate a release on an eval suite](/guides/evals-and-the-deploy-gate/) · [AgentDeployment reference](/reference/crd/agentdeployment/)
