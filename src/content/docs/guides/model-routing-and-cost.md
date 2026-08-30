---
title: Model routing & cost
description: "Aliases, provider priority and fallback, per-conversation and per-agent budgets, and the budget_exceeded halt."
sidebar:
  order: 6
---

**Goal:** route your agents through a stable model alias with automatic provider fallback and a rate cap,
then put a hard USD budget on a conversation or an agent so a runaway loop halts instead of billing.

**Prerequisites:** the platform installed; a provider key bound as a [`SecretBinding`](/reference/crd/secretbinding/)
([Connect a model provider](/guides/connect-a-model-provider/)); an agent deployed
([Deploy an agent](/guides/deploy-an-agent/)).

## How this fits together

Agents never call providers directly and never hold provider keys. The controller injects a
**`MODEL_GATEWAY_URL`** into every agent; the agent calls it with `model="<alias>"`. A
[`ModelRoute`](/reference/crd/modelroute/) — **whose `metadata.name` *is* the alias** — maps that alias
to an ordered provider list (priority 1 first, the rest are fallback). Cost is enforced separately by the
gateway budget proxy, driven by [`AgentDeployment.spec.budget`](/reference/crd/agentdeployment/). There is
**no `modelRouteRef`** on the agent — the alias is the only thing the agent's code names.

## 1. Declare the route (name = alias) with a fallback and a rate cap

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ModelRoute
metadata:
  name: chat-default            # ← agents call model="chat-default"
  namespace: my-team
spec:
  providers:                    # ordered: priority 1 is primary, the rest are fallback
    - provider: anthropic
      model: claude-sonnet-4-6
      priority: 1
      secretBindingRef: anthropic-key
    - provider: openai
      model: gpt-4o
      priority: 2
      secretBindingRef: openai-key
    - provider: mock            # deterministic MOCK_OK, no key — a last-resort dev fallback
      model: mock-default
      priority: 3
  rateLimit:
    tenantRPM: 600              # optional per-tenant requests/minute, forwarded to the gateway
```

Apply it and confirm it rendered into the live gateway config:

```bash
kubectl apply -f chat-default.yaml
kubectl get modelroute chat-default -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'
# → True   (rendered into the gateway ConfigMap; all referenced SecretBindings resolved)
```

The gateway tries `anthropic` first; on a provider error it **automatically falls back** to `openai`,
then the keyless `mock`. Priorities must be unique within the route.

## 2. Pick the alias from your agent

Point your model client's base URL at the injected gateway and name the route:

```python
# The launcher injects MODEL_GATEWAY_URL; call the ModelRoute by its metadata.name.
client = OpenAI(base_url=os.environ["MODEL_GATEWAY_URL"], api_key="unused")
client.chat.completions.create(model="chat-default", messages=[...])
```

The gateway resolves `chat-default` → the primary provider, injects the real key from the
`SecretBinding`, prices the call, and books the spend against any budget you set below.

## 3. Put a hard budget on the agent

Add [`spec.budget`](/reference/crd/agentdeployment/) to the agent. Caps are exact-decimal USD strings;
either cap may be omitted (that dimension is then unenforced).

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: support-agent
  namespace: my-team
spec:
  image: ghcr.io/my-org/support-agent:1.4.0
  budget:
    perConversationUSD: "0.50"   # hard cap per conversation
    perAgentUSD: "50.00"         # hard cap per agent, across all conversations
    softThresholdPct: 80         # emit a one-shot alert at 80% of a cap, then continue
```

Setting `spec.budget` makes the controller start a **budget proxy inside the launcher** and repoint the
agent's `MODEL_GATEWAY_URL` at it, so every model call is metered before it reaches the gateway. An agent
with **no** `spec.budget` pays zero overhead — its calls go straight to the gateway, unchanged.

## 4. Watch a budget halt a run

Before each call the proxy checks `spent + thisCall` against the hard cap. On a breach it **refuses the
call before the provider is hit** and returns a typed error:

```json
{ "error": "budget_exceeded", "dimension": "conversation", "spent": "0.50", "cap": "0.50" }
```

- **HTTP 402**, typed **`budget_exceeded`**, with the `dimension` (which cap tripped) and the exact
  `spent`/`cap`. The stricter of the two caps trips first.
- The run **halts**: every subsequent model call in that scope is also refused, so the run cannot spend
  past the cap even if the agent retries.
- At the **soft** threshold (`softThresholdPct` of a cap) the proxy emits a one-shot `budget.alert`
  (a span event + a log line) and **continues** — no halt.

The per-agent dimension keys on the agent's identity and accrues across every call with no agent
cooperation. The per-conversation dimension keys on the conversation id the agent's request carries.

### Raise or reset the budget

There is no runtime "reset" verb — spend is keyed by conversation/agent and enforced against the current
cap. To let a halted conversation continue, **raise the cap**:

```bash
kubectl patch agentdeployment support-agent -n my-team --type merge \
  -p '{"spec":{"budget":{"perConversationUSD":"1.00"}}}'
```

A new conversation always starts fresh under the current cap.

## Reading spend

There is **no per-conversation/per-agent spend field on `AgentDeployment.status`** — spend is not surfaced
on the CRD. Read cost from the console instead: open a run's trace and drill into the cost per run, or use
the per-agent cost breakdown. See [Observability & tracing](/guides/observability-and-tracing/).

:::note
Spend accounting is in-memory in the single dev gateway (a restart resets a mid-flight conversation to a
fresh budget); durable, cross-replica enforcement backed by the state layer finalizes toward GA. The
enforced dimension is USD; token / wall-clock budgets are schema-ready but not yet enforced.
:::

## When to use / when not

- **Use** one route per logical model your agents need (`chat-default`, `cheap-summarizer`, `cheap-judge`).
- **Use** `spec.budget` on any agent whose loop could run away — an autonomous or tool-calling agent.
- **Don't** put provider keys in agent env or images — the gateway exists to remove exactly that.
- **Don't** rely on `perConversationUSD` alone for an agent whose requests don't carry a conversation id;
  set `perAgentUSD` too (it accrues unconditionally).

## Defaults

- `spec.rateLimit` omitted ⇒ no rate cap. `spec.budget` omitted ⇒ no cost enforcement (zero overhead).
- `softThresholdPct` defaults to `80` (range 1–99).
- Provider `priority` is ascending (1 tried first); priorities must be unique within a route.

## Failure modes

- **Primary provider errors** → automatic fallback to the next priority in the list.
- **`budget_exceeded` (HTTP 402)** → a hard cap was crossed; the call is refused and the run halts. *Fix:*
  raise the cap (above) for a new headroom, or accept the halt as the intended guard.
- **Dangling `secretBindingRef`** → that route is not `Ready` (reason `SecretUnresolved`); the route is
  excluded from the gateway config and agents calling that alias fail fast. Other routes still render.
- **Unresolved alias** (no matching `ModelRoute`) → model calls fail at the gateway. *Fix:* apply the route.

## See also

- Reference: [ModelRoute](/reference/crd/modelroute/) · [AgentDeployment](/reference/crd/agentdeployment/) ·
  [SecretBinding](/reference/crd/secretbinding/)
- Concept: [Architecture](/concepts/architecture/) · [Security model](/concepts/security-model/)
- Guide: [Connect a model provider](/guides/connect-a-model-provider/) ·
  [Observability & tracing](/guides/observability-and-tracing/) ·
  [Multi-tenancy & quotas](/guides/multi-tenancy-and-quotas/)
