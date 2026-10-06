---
title: Quickstart
description: "Deploy your first agent, give it a model, and talk to it — end to end."
sidebar:
  order: 3
---

This is the happy path, start to finish. You'll give an agent a model, deploy it, run it, and open the run.

## 0. Make a namespace to work in

Every manifest below lands in `my-team`. Create it, and a token that may build and run agents there
(the same steps as [signing in to the console](/getting-started/installation/#sign-in-to-the-console),
for this namespace):

```bash
kubectl create namespace my-team
kubectl -n my-team create serviceaccount ctxmesh-builder
kubectl -n my-team create rolebinding ctxmesh-builder --clusterrole=ctxmesh-developer --serviceaccount=my-team:ctxmesh-builder
TOKEN=$(kubectl -n my-team create token ctxmesh-builder --duration=8h)
kubectl -n ctxmesh port-forward svc/ctxmesh-bff 9090:9090 &   # the console and its API
```

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
kubectl wait modelroute/default-model -n my-team --for=condition=Ready --timeout=5m
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
  image: ghcr.io/ctxmesh/echo-agent:v0.1.0-beta.8
  executionModel: serving
  env:
    - name: MODEL_ROUTE       # the ModelRoute from step 1; without it this agent only echoes
      value: default-model
```

```bash
kubectl apply -f hello-agent.yaml
kubectl get agentdeployment hello-agent -n my-team -w
# wait for Ready=True
```

## 3. Run it

Run the agent through the control plane, which mints the run's capability and records the run:

```bash
RUN=$(curl -s -X POST http://localhost:9090/api/runs -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"agent":"hello-agent","namespace":"my-team","input":"hello"}' | jq -r .id)
curl -s http://localhost:9090/api/runs/$RUN -H "Authorization: Bearer $TOKEN"
```

The run goes `queued`, then `running`, then `succeeded`, and `messages` holds the reply from the mock
model. The agent's own URL (`status.url`) answers a direct request too, but a call that bypasses the
control plane is not a run: nothing records it.

## 4. Open the run

Open `http://localhost:9090/runs/<the run id>` and sign in with the same token. The run page shows its
input, the reply and the event timeline.

Per-step traces and cost come from a trace backend, which a stock install does not include. Add one when
you want them: see [Observability backends](/operations/observability-backends/).

## You've done it

You deployed a governed, autoscaled agent, ran it through the control plane, and opened the run. Next, make it real:

- Give it a real model → [Connect a model provider](/guides/connect-a-model-provider/)
- Add content rules → [Guardrails](/guides/guardrails/)
- Gate releases on quality → [Evals & the deploy gate](/guides/evals-and-the-deploy-gate/)
- Understand the moving parts → [Architecture](/concepts/architecture/)
