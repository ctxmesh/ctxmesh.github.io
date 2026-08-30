---
title: Knowledge & RAG
description: "Create a KnowledgeBase: upload → chunk / embed / index → knowledge_search, and grant it to an agent."
---

**Goal:** give an agent a searchable document corpus — upload documents, let the platform chunk, embed,
and index them, then retrieve them mid-conversation with the `knowledge_search` tool.

**Prerequisites:** an agent deployed ([Deploy an agent](/guides/deploy-an-agent/)); an embedding
[`ModelRoute`](/guides/connect-a-model-provider/) available on the gateway; documents in your object
store (or ready to upload).

## How a KnowledgeBase works

A [`KnowledgeBase`](/reference/crd/knowledgebase/) declares a managed RAG corpus. You supply documents
by reference — never inline — and the platform runs an **ingestion** job that fetches, chunks, embeds
(via your `embeddingRoute`), and indexes them into a per-corpus pgvector index. An agent is **granted**
the corpus by reference and retrieves from it either via the built-in **`knowledge_search`** tool
(agentic RAG — the model searches mid-loop and cites `documentRef#chunkIndex`) or automatically each
turn with `autoInject`.

## 1. Create the KnowledgeBase

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: KnowledgeBase
metadata:
  name: product-docs
  namespace: my-team
spec:
  displayName: Product Documentation
  source:
    type: objectStorePrefix          # objectStorePrefix | upload
    objectStorePrefix: corpora/product-docs/
  embeddingRoute: text-embedding-3-small   # a ModelRoute NAME — IMMUTABLE after creation
  chunking:
    size: 512                        # tokens — IMMUTABLE after creation
    overlap: 64                      # tokens (< size)
    splitter: recursive              # recursive | markdown
```

For the **upload** source, set `source: { type: upload }` (no prefix — the bucket prefix is derived from
the KB name) and push documents through the BFF upload endpoint / the console.

Apply it:

```bash
kubectl apply -f product-docs.yaml
```

## 2. Watch the ingestion lifecycle

The corpus phase walks a fixed lifecycle. Watch `status.phase`, `documentCount`, and `chunkCount`:

```bash
kubectl get knowledgebase product-docs -n my-team \
  -o jsonpath='{.status.phase} docs={.status.documentCount} chunks={.status.chunkCount}{"\n"}' -w
# Pending → Ingesting → Ready   (docs=… chunks=…)
```

Phases:

| Phase | Meaning |
|-------|---------|
| `Pending` | Validated; no ingestion run has started yet. |
| `Ingesting` | An ingestion run is in progress. |
| `Ready` | The last run completed; the corpus is queryable. |
| `PartiallyIngested` | Some documents extracted below the character threshold and were flagged; the corpus is queryable but incomplete. |
| `Failed` | The last run failed for a non-budget reason. |
| `BudgetExceeded` | The run was halted by a tenant embedding-budget 402 — **fail-soft and resumable** (the cursor is preserved). |

Reaching `Ready` with a non-zero `chunkCount` is the signal the corpus is retrievable.

## 3. Grant the KnowledgeBase to an agent

Access is a folded **capability** on the agent — `spec.knowledgeBases[]`, enforced at the launcher
roster gate (an agent can only search corpora it was granted):

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: support-agent
  namespace: my-team
spec:
  image: ghcr.io/my-org/support-agent:1.4.0
  knowledgeBases:
    - name: product-docs
      autoInject: false      # false ⇒ tool-only (knowledge_search); true ⇒ RAG each turn
      # namespace: my-team   # defaults to the agent's namespace
```

Apply it, then confirm the agent is `Ready`:

```bash
kubectl apply -f support-agent.yaml
kubectl get agentdeployment support-agent -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
# → True
```

## 4. Retrieve

With `autoInject: false` the corpus is exposed to the agent as the built-in **`knowledge_search`** tool
— the model calls it mid-loop and gets top-k chunks with provenance (`documentRef#chunkIndex`) it can
cite. With `autoInject: true`, the SDK prepends the most relevant chunks to the system prompt each turn
as an ephemeral, cited `<retrieved_context>` block (never persisted). Every retrieval emits a
`knowledge.search` span in the run's trace.

## When to use / when not

- **Use** to give an agent a searchable body of documents (product docs, KB articles, PDFs).
- **`autoInject: true`** when every turn should be grounded in the corpus; **tool-only** when retrieval
  should be selective (the model decides when to search).
- **Not** for conversation memory (`spec.sessionMemory`) or cross-conversation facts
  (`spec.longTermMemory`) — those are agent fields, not a corpus.
- **Not** for a corpus you already keep in Pinecone/Weaviate — bring that in as a plain MCP tool
  ([Tools & MCP](/guides/tools-and-mcp/)); `knowledge_search` is only for platform-managed corpora.

## Defaults

- `chunking` defaults to **size 512 tokens, overlap 64, splitter `recursive`** (`markdown` splits on
  Markdown structural boundaries first).
- `spec.perUser` defaults to `false` (an org-wide corpus). `autoInject` defaults to `false` (tool-only).
- Ingestion is content-hash idempotent — re-ingest only re-embeds changed documents (a cost saver) and
  sweeps orphaned chunks from shrunk documents.

## Failure modes

- **Editing `embeddingRoute`, `chunking`, or `perUser` after creation** → **rejected by admission**
  (CEL transition rules). These are **one-way doors**: mixing embedding models or re-chunking corrupts
  the index. To change any of them, **delete and recreate** the KnowledgeBase.
- **`BudgetExceeded` phase** → the tenant embedding budget was hit (402). Ingestion is fail-soft and
  resumable — raise the budget and the run resumes from its cursor.
- **`Failed` phase** → a non-budget ingestion error; check `status.ingestionRunRef` and the run's trace.
- **`PartiallyIngested`** → some documents yielded too little extractable text (e.g. a scanned PDF —
  OCR/vision ingestion is not yet supported). The corpus is still queryable.
- **Dangling `knowledgeBases[].name`** (KB missing) → the ref is **skipped**, not fail-closed; the agent
  stays `Ready` and surfaces a condition. (This differs from governance refs, which fail closed.)
- **At-cap storage** → an upload past the tenant `corpusBytesHardCap` is blocked (413) and ingestion
  fails typed. The `corpusBytesSoftCap` is warn-only.

## See also

- [KnowledgeBase reference](/reference/crd/knowledgebase/) · [AgentDeployment reference](/reference/crd/agentdeployment/)
  (`spec.knowledgeBases`) · [ModelRoute reference](/reference/crd/modelroute/)
- [Memory & state](/concepts/memory-and-state/) · [Custom resources](/concepts/custom-resources/)
- [Connect a model provider](/guides/connect-a-model-provider/) · [Tools & MCP](/guides/tools-and-mcp/) ·
  [Memory & sessions](/guides/memory-and-sessions/)
