---
title: Quickstart
description: "Deploy your first agent, give it a model, and talk to it — end to end."
sidebar:
  order: 3
---

This is the happy path, start to finish. You'll give an agent a model, deploy it, and see its trace.

:::note[Docs in progress]
Field names track the shipped product; exact commands and chart coordinates are finalized toward
general availability.
:::

## 1. Give agents a model

Agents call the gateway with a model **alias**; a `ModelRoute` (whose name is the alias) resolves it.
For a zero-key first run, use the built-in mock provider:

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ModelRoute
metadata:
  name: default-model
  namespace: my-team
spec:
  providers:
    - provider: mock            # deterministic mock — no API key needed
      model: mock-default
      priority: 1
```

```bash
kubectl apply -f modelroute.yaml
```

(Swap in a real provider + a `SecretBinding` later — see [Connect a model provider](/guides/connect-a-model-provider/).)

## 2. Deploy the agent

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: hello-agent
  namespace: my-team
spec:
  image: ghcr.io/ctxmesh/example-agent:latest
  executionModel: serving
```

```bash
kubectl apply -f hello-agent.yaml
kubectl get agentdeployment hello-agent -n my-team -w
# wait for Ready=True
```

## 3. Talk to it

Get the serving URL and send a request (the agent calls `model="default-model"` internally):

```bash
URL=$(kubectl get agentdeployment hello-agent -n my-team -o jsonpath='{.status.url}')
curl -s "$URL" -d '{"input":"hello"}'
```

## 4. See the trace

Open the console → the agent's **runs**. You'll see this invocation as a durable run with its full
step → tool → model trace and its cost. That's the whole point: nothing is a black box.

## You've done it

You deployed a governed, autoscaled agent and inspected its run. Next, make it real:

- Give it a real model → [Connect a model provider](/guides/connect-a-model-provider/)
- Add content rules → [Guardrails](/guides/guardrails/)
- Gate releases on quality → [Evals & the deploy gate](/guides/evals-and-the-deploy-gate/)
- Understand the moving parts → [Architecture](/concepts/architecture/)
