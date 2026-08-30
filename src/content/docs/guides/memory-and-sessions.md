---
title: Memory & sessions
description: "Turn on session memory (session / shared / per-user), correlate by conversationId, and set TTL and limits."
---

**Goal:** give an agent conversation memory so a multi-turn chat keeps its context — even across a
scale-to-zero cold start.

**Prerequisites:** an agent deployed ([Deploy an agent](/guides/deploy-an-agent/)). For a `shared`
scratchpad the agent must be a member of an [`AgentRegistry`](/reference/crd/agentregistry/).

## How session memory works

Agent state **never lives in the pod** — that is what makes scale-to-zero safe. Conversation context
lives in a dedicated Valkey (the **State Layer**), fronted by a control-plane proxy, and is reached by
the agent through the launcher's traced localhost memory endpoint. You turn it on with one field on the
agent; the controller injects the backend wiring, and the stock managed loop replays recent turns
before each new turn and appends the completed exchange after it. Every memory op is a `memory.*` span
in the run's trace tree. See [Memory & state](/concepts/memory-and-state/) for the model.

## 1. Enable session memory on the agent

Add `spec.sessionMemory` to the `AgentDeployment`. The presence of the field is the switch — absent
means no conversation memory.

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: support-agent
  namespace: my-team
spec:
  image: ghcr.io/my-org/support-agent:1.4.0
  executionModel: serving
  sessionMemory:
    scope: session          # session (private, default) | shared (registry team scratchpad)
    # backend:
    #   addr: agentry-statelayer.agentry.svc:6379   # default if omitted
```

Apply it:

```bash
kubectl apply -f support-agent.yaml
```

Enabling (or disabling) memory changes the pod template, so the controller rolls a new Knative
revision. `Ready` transitions back to `True` once the new revision is up:

```bash
kubectl get agentdeployment support-agent -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
# → True
```

## 2. Correlate turns with a conversationId

Memory is keyed per conversation. The console chat sends one stable `conversationId` per session (as the
`X-Conversation-Id` header); the BFF forwards it, and the managed loop threads memory automatically —
**only** when the agent is bound to memory. Turn 2 in the same conversation sees turn 1's context; a new
`conversationId` starts a fresh context.

- **`session` scope** keys memory as `mem:{namespace}/{agent}:{conversationId}` — private to this agent.
- **`shared` scope** keys it as `mem:shared:{registry}:{conversationId}` — one context that every agent
  in the same registry conversation reads and writes. Each writer's messages are stamped
  **server-authoritatively** with that agent's own name, so "who wrote what" stays recoverable in the
  shared log. `shared` requires registry membership; a `scope: shared` on a non-member agent silently
  keeps the private layout (a visible misconfiguration, never a rootless shared key).

## 3. Verify it survives scale-to-zero

The proof that state is external: converse, let the agent scale to zero, converse again on a cold pod,
and the earlier context is still there.

```bash
# After a first turn, watch the agent scale to zero, then send a second turn on the same conversationId.
kubectl get agentdeployment support-agent -n my-team -w
# A cold pod's first memory GET returns the stored context — no lost history.
```

Open the run in the console and confirm the `memory.get` / `memory.append` spans in the trace tree.

## Per-user isolation (opt-in)

`spec.sessionMemory.perUser: true` isolates each invoking end-user's conversation into its own bucket,
so two users on the same `conversationId` never share history. It is **product-grade** (launcher-stamped
from the verified run capability), **private scope only**, and defaults off.

```yaml
spec:
  sessionMemory:
    scope: session
    perUser: true
```

:::caution
Enabling `perUser` **breaks conversation handoff and share-links** for the agent (the key now embeds a
per-user segment) — which is exactly why it is opt-in.
:::

## When to use / when not

- **Use `session`** for any multi-turn agent that should remember earlier turns in the same
  conversation.
- **Use `shared`** for a team of registry agents collaborating on one thread (a shared scratchpad).
- **Not** for cross-conversation facts an agent should recall by meaning — that is
  `spec.longTermMemory` (semantic, pgvector); see [Memory & state](/concepts/memory-and-state/).
- **Not** for a searchable document corpus — that is a [KnowledgeBase](/guides/knowledge-and-rag/).

## Defaults

- `scope` defaults to `session` (private per-agent); `perUser` defaults to `false`.
- `backend.addr` defaults to `agentry-statelayer.agentry.svc:6379`.
- The managed loop replays only the last **`MAX_HISTORY_MESSAGES` = 40** turns as prompt context; older
  turns fall out of the prompt (the store still holds them, capped below).
- The store retains the last **500 entries** per conversation (`LTRIM` on append) and each conversation
  expires after a **24-hour TTL**, refreshed on every write (not on reads). Only the clean
  `{user, assistant}` pair is persisted — intermediate tool-call scratchpad messages are not.

:::note
The exact TTL and per-conversation entry cap are the dev-posture defaults above and are not yet exposed
as spec fields — per-tenant TTL/retention governance is finalizing toward GA. Author against
`scope` / `perUser` / `backend.addr` (the stable surface) for now.
:::

## Failure modes

- **Backend unreachable** → the launcher's memory endpoint returns a typed error; the agent treats
  memory as **best-effort** and answers **without** context rather than failing the turn (the same
  non-fatal philosophy as tool calls). Note: in a proxy-cutover, network-isolated install, memory
  **fails open** (silent loss) rather than blocking the turn.
- **No `conversationId`** (or no `spec.sessionMemory`) → the agent runs single-shot: nothing is
  replayed and nothing is stored (today's Playground behaviour).
- **`scope: shared` on a non-registry agent** → no shared key is created; the agent silently keeps its
  private layout. Add the agent to a registry to get the shared scratchpad.
- **Bad `conversationId`** (empty, `>128` chars, or containing `/`, `:`, whitespace, or control
  characters) → the memory op is rejected (a key/path-injection guard).

## See also

- [AgentDeployment reference](/reference/crd/agentdeployment/) (`spec.sessionMemory`, `spec.longTermMemory`)
- [Memory & state](/concepts/memory-and-state/) · [Custom resources](/concepts/custom-resources/)
- [Deploy an agent](/guides/deploy-an-agent/) · [Knowledge & RAG](/guides/knowledge-and-rag/)
