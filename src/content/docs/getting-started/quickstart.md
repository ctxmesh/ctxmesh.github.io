---
title: Quickstart
description: Deploy your first agent and talk to it.
sidebar:
  order: 3
---

:::note[Docs in progress]
The exact resource fields below track the product as it ships; treat this as the shape of the
workflow, not a version-pinned contract, until the first public release.
:::

Deploying an agent is a single declarative resource. You describe **what** the agent is; the
platform reconciles it into a running, autoscaled service.

## 1. Describe the agent

```yaml
apiVersion: agents.ctxmesh.ai/v1alpha1
kind: AgentDeployment
metadata:
  name: support-agent
  namespace: my-team
spec:
  image: ghcr.io/my-org/support-agent:1.0.0
  modelRouteRef: default-chat        # which model + provider to use
  # Optional governance — see the guides:
  # guardrailPolicyRef: default-guardrails
  # approvalPolicyRef: sensitive-tools
  # evalSuiteRef: support-quality
```

Apply it:

```bash
kubectl apply -f support-agent.yaml
```

## 2. Watch it come up

```bash
kubectl get agentdeployment support-agent -n my-team -w
```

The controller reconciles the spec into a serving revision, wires model routing and tracing, and
reports readiness on the resource status.

## 3. Talk to it

Reach the agent through its endpoint (or the console Playground). Every turn is traced — the
step → tool → model tree, cost, and any guardrail decisions show up in the console under the
agent's runs.

## Next

- Add **guardrails and approvals** → [Guardrails & approvals](/guides/guardrails-and-approvals/).
- Gate releases on **evals** and roll out with a **canary** → see the Guides.
- Understand the moving parts → [Architecture](/concepts/architecture/).
