---
title: ModelRoute
description: A named model alias — provider priority, fallback, and per-tenant rate budget — applied by the integrated gateway.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `ModelRoute` · Scope: Namespaced · shortName: `mr`

## Overview

A `ModelRoute` declares a **named LLM alias**. Its `metadata.name` *is* the model alias: agents call
the injected in-cluster gateway (`MODEL_GATEWAY_URL`) with `model="<ModelRoute name>"`, and the
gateway routes the call to the route's ordered provider list. The controller renders every
`ModelRoute` from every namespace into a single gateway (LiteLLM) `config.yaml` in the gateway
ConfigMap. Enforcement point: the **model gateway**. The headline guarantee is that agents never hold
provider keys or call providers directly — the alias is the only thing they name.

**There is no `modelRouteRef` on `AgentDeployment`.** The model is chosen in the agent's code by
calling the gateway with this route's name.

## When to use / when not

- **Use** to give agents a stable, portable model name decoupled from the concrete provider/model.
- **Use** to declare provider **fallback order** (priority 1 first) and an optional per-tenant rate cap.
- **Not** needed when using the console's auto-managed routes / model picker — those create routes for
  you. Hand-authoring stays available under "Advanced".

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.providers` | []object | **Yes** | — | Ordered LiteLLM provider entries, tried in ascending `priority`. MinItems 1, MaxItems 10. Priorities must be unique across the list. |
| `spec.providers[].provider` | string | **Yes** | — | LiteLLM provider prefix, e.g. `anthropic`, `openai`, or the special `mock` (deterministic `MOCK_OK`, no key needed). MinLength 1. |
| `spec.providers[].model` | string | **Yes** | — | Provider-specific model name, e.g. `claude-sonnet-4-6` or `mock-default`. MinLength 1. |
| `spec.providers[].priority` | int32 | **Yes** | — | Try order; lower is tried first. Must be ≥1 and unique within the route. |
| `spec.providers[].secretBindingRef` | string | Conditional | — | Names a [`SecretBinding`](/reference/crd/secretbinding/) (same namespace) injected as `SB_<binding-name>`. **Required for every non-`mock` provider unless `apiBase` is set.** Ignored for `mock`. |
| `spec.providers[].apiBase` | string | No | — | Points this provider at an arbitrary OpenAI-compatible upstream base URL (dummy key, no SecretBinding). Must be an `http(s)` URL (pattern `^https?://.+`). Ignored for `mock`. |
| `spec.rateLimit` | object | No | — | Optional per-tenant rate cap forwarded to LiteLLM. Omitted ⇒ no rate limit. |
| `spec.rateLimit.tenantRPM` | int32 | **Yes** (if set) | — | Max requests per minute for the owning tenant. Maps to LiteLLM `rpm` on every rendered provider entry. Minimum 1. |

### Validation rules (admission, CEL)

- Provider priorities must be **unique** within a route.
- `secretBindingRef` is **required for every non-`mock` provider unless `apiBase` is set**.

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.conditions` | []Condition | Reconciliation state. `Ready=True` once the route is rendered into the live gateway ConfigMap and all referenced SecretBindings resolve. |
| `status.observedGeneration` | int64 | `.metadata.generation` this status reflects. |

## Examples

### Minimal — single provider with a key

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ModelRoute
metadata:
  name: claude-sonnet
  namespace: my-team
spec:
  providers:
    - provider: anthropic
      model: claude-sonnet-4-6
      priority: 1
      secretBindingRef: anthropic-key
```

An agent then calls the gateway with `model="claude-sonnet"`.

### Fuller — priority fallback + rate limit

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ModelRoute
metadata:
  name: chat-default
  namespace: my-team
spec:
  providers:
    - provider: anthropic
      model: claude-sonnet-4-6
      priority: 1
      secretBindingRef: anthropic-key
    - provider: openai
      model: gpt-4o
      priority: 2
      secretBindingRef: openai-key
  rateLimit:
    tenantRPM: 600
```

### Mock (no key) and apiBase (keyless upstream)

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ModelRoute
metadata:
  name: echo-mock
  namespace: my-team
spec:
  providers:
    - provider: mock
      model: mock-default
      priority: 1
    - provider: openai
      model: any-id
      priority: 2
      apiBase: http://tool-mock.my-team.svc.cluster.local:9099/v1
```

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [SecretBinding](/reference/crd/secretbinding/) · [AgentDeployment](/reference/crd/agentdeployment/) ·
  [Tenant](/reference/crd/tenant/) (per-tenant model budget / RPM caps)
