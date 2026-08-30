---
title: Connect a model provider
description: "Give your agents a model via a ModelRoute + SecretBinding — with fallback and budgets."
sidebar:
  order: 2
---

**Goal:** make a model available to your agents through the gateway, with a fallback and a rate
budget, without any agent ever holding a provider key.

**Prerequisites:** the platform installed; a provider API key stored in your secret backend.

## How model access works

Agents never call providers directly. The controller injects a **`MODEL_GATEWAY_URL`** into every
agent; the agent calls it with `model="<alias>"`. A **`ModelRoute`** — whose **name is the alias** —
maps that alias to one or more providers (priority-ordered, with fallback), pulling each provider's
key from a **`SecretBinding`**. Swap or fail-over providers by editing the route; agents don't change.

## 1. Bind the provider secret

`SecretBinding` references a secret in your backend by name — the key is never inlined in a CRD.

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: SecretBinding
metadata:
  name: anthropic-key
  namespace: my-team
spec:
  backend: kubernetes            # kubernetes (v1); external backends via External Secrets Operator
  secretName: anthropic-api-key  # the Secret in this namespace
  key: apiKey                    # the data key holding the token
```

For Vault / AWS / GCP, sync the secret into the namespace with the **External Secrets Operator**, then
point the `SecretBinding` at the synced Secret — see [Secrets](/operations/secrets/).

## 2. Define the route (the name is the alias)

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ModelRoute
metadata:
  name: default-model            # ← agents call model="default-model"
  namespace: my-team
spec:
  providers:                     # ordered: priority 1 is primary, the rest are fallback
    - provider: anthropic
      model: claude-sonnet-4-6
      priority: 1
      secretBindingRef: anthropic-key
    - provider: mock             # deterministic mock provider — no key, ideal for dev/CI
      model: mock-default
      priority: 2
  rateLimit:
    tenantRPM: 600               # optional per-tenant requests/minute
```

Apply both:

```bash
kubectl apply -f secretbinding.yaml -f modelroute.yaml
kubectl get modelroute default-model -n my-team -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'
# → True   (the route is rendered into the live gateway config)
```

## 3. Use the alias from your agent

Point your agent's model client at the gateway (base URL = `MODEL_GATEWAY_URL`, injected for you) and
call the **alias**:

```python
# The launcher injects MODEL_GATEWAY_URL; call the route by its name.
client = OpenAI(base_url=os.environ["MODEL_GATEWAY_URL"], api_key="unused")
client.chat.completions.create(model="default-model", messages=[...])
```

The gateway resolves `default-model` → the anthropic provider (falling back to the mock), injects the
real key from the `SecretBinding`, and books the spend against the budget.

## When to use / when not

- **Use** one route per logical model your agents need (`default-model`, `cheap-summarizer`, …).
- **Don't** put provider keys in agent env or images — that's exactly what the gateway removes.

## Failure modes

- Primary provider errors → automatic fallback to the next priority.
- Budget exceeded → the gateway returns a typed **`budget_exceeded`** error (HTTP 402) and refuses
  further calls for that scope; see [Model routing & cost](/guides/model-routing-and-cost/).
- Dangling `secretBindingRef` → the route is not `Ready`; agents calling that alias fail fast.

## See also

[ModelRoute reference](/reference/crd/modelroute/) · [SecretBinding reference](/reference/crd/secretbinding/) · [Model routing & cost](/guides/model-routing-and-cost/) · [Secrets](/operations/secrets/)
