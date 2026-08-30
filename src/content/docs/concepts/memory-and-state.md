---
title: Memory & state
description: "Session vs shared vs long-term (RAG) memory, the State Layer, and scale-to-zero safety."
---

An agent that forgets everything between requests is a chatbot with amnesia. ctxmesh gives agents
three *different* kinds of memory — because "remember this conversation," "share a scratchpad with my
teammates," and "recall facts across sessions" are genuinely different needs with different lifespans
and retrieval models. The unifying design decision behind all of them is that **agent state lives
out of the pod** — which is precisely what makes [scale-to-zero](/concepts/execution-models/) safe.

## The three kinds of memory

| Kind | Scope | Retrieval | Lifespan | Backed by |
|------|-------|-----------|----------|-----------|
| **Session memory** | one conversation, private to the agent | read/write the conversation log | conversation-lifetime (dev TTL) | Valkey (State Layer) |
| **Shared memory** | a team's scratchpad within a registry | read/write a shared conversation log | conversation-lifetime | Valkey (State Layer) |
| **Long-term / knowledge** | across conversations, by *meaning* | semantic (vector) search | durable | pgvector |

**Session memory** is conversation context: the turns of *this* conversation, private to the agent.
Configure it with `AgentDeployment.spec.sessionMemory` (`scope: session`).

**Shared memory** is the same mechanism at a wider scope (`scope: shared`) — a team scratchpad keyed
per registry conversation, so agents collaborating within an [`AgentRegistry`](/concepts/multi-agent/)
can leave notes for each other. It requires the agent to be a registry member.

**Long-term memory and knowledge** retrieve by *meaning*, not by conversation. Two flavors:
`AgentDeployment.spec.longTermMemory` is an agent's own learned facts that persist across conversations
(the agent calls `remember` and later `search`), while a
[`KnowledgeBase`](/concepts/custom-resources/) is a *managed corpus* — you upload documents, the
platform chunks, embeds, and indexes them, and the agent retrieves cited passages via a synthetic
`knowledge_search` tool. Both are semantic; both are durable.

## Why state lives out of the pod

This is the load-bearing trade-off. If an agent kept its memory *in* the pod, then the platform's most
valuable efficiency property — **scale-to-zero**, idling an unused agent to zero replicas — would
silently destroy that memory. Every cold start would begin with amnesia, and scale-to-zero would be a
correctness bug rather than a cost win.

So ctxmesh keeps session state in an **out-of-pod State Layer** (Valkey), keyed by `conversationId`.
An idle agent scales to zero; its conversations sit untouched in the State Layer; a cold pod's first
read returns the context. Continuity is a *guarantee* of the architecture, not an accident of the pod
staying warm. The cost is a network hop to fetch memory — cheap, and the price of making scale-to-zero
safe.

The same reasoning applies to [runs](/concepts/runs-and-execution/): durable run state lives in
Postgres, not the pod, so a run survives a reschedule. State that must outlive a pod does not live in
one.

## How an agent reaches memory (it holds no keys)

An agent never talks to Valkey or Postgres directly. It talks to the launcher's **localhost memory
plane** (`:2998`); the launcher proxies to the State Layer and, for long-term memory and knowledge, to
the token service that holds the database credentials. The agent pod carries **no datastore
credentials** — consistent with the [security model](/concepts/security-model/), where secrets never
enter the agent container. The [SDK](/sdk/) wraps this plane as `client.memory` and `client.knowledge`,
but it's plain HTTP underneath, so any language reaches it.

A few properties worth knowing:

- **Per-user isolation** (`sessionMemory.perUser`) buckets each end-user's conversation memory
  separately, keyed off a hash of the *verified* [run capability's](/concepts/security-model/) user id
  — so one user's history never surfaces in another's. It's opt-in (it changes conversation-handoff and
  share-link behavior) and is product-grade isolation inside the pod boundary, not a hard security
  boundary.
- **Fail-open, deliberately.** Session memory reads and writes fail *open* — a State Layer blip
  degrades context, it doesn't fail the run. Durable runs (which must not silently duplicate) live in
  Postgres and cost governance fails *closed*; memory is the one place best-effort is the right call.
- **Backend location.** In dev, the State Layer is an in-cluster Valkey the chart installs; in
  production you point `sessionMemory.backend` (or the cluster default) at a **managed, persistent,
  HA** Valkey — integrated for dev, bring-your-own for production, the same posture as the rest of the
  [state plane](/concepts/architecture/).

## Knowledge: three planes, one search

RAG in ctxmesh is three distinct planes, and it's worth knowing which you're using:

1. **Agent-generated memory** — what the agent itself learns and recalls (`longTermMemory`).
2. **The managed corpus** — documents you upload into a `KnowledgeBase`; the platform owns
   chunking, embedding, and indexing, and exposes them as the synthetic `knowledge_search` tool.
3. **Bring-your-own retrieval** — your existing Pinecone/Weaviate/etc., wired in as a plain
   [`MCPToolBinding`](/reference/crd/mcptoolbinding/). The platform doesn't manage it; it's just a tool.

For the managed corpus, retrieval is **agentic**: the model calls `knowledge_search` mid-loop and gets
back passages **with citations** (`documentRef#chunkIndex`), so answers are grounded and traceable. An
agent is granted a corpus by reference (`spec.knowledgeBases[]`), and the launcher enforces that
roster — an agent can only search the corpora it was granted. Two choices are pinned at corpus creation
as one-way doors: the **embedding model** and the **chunking** strategy (changing either means
re-embedding).

## See also

- [Architecture](/concepts/architecture/) — the state plane and scale-to-zero
- [Execution models](/concepts/execution-models/) — where scale-to-zero comes from
- [Security model](/concepts/security-model/) — why the agent holds no datastore keys
- [Memory & sessions](/guides/memory-and-sessions/) · [Knowledge & RAG](/guides/knowledge-and-rag/)
- [AgentDeployment reference](/reference/crd/agentdeployment/) · [KnowledgeBase reference](/reference/crd/knowledgebase/)
