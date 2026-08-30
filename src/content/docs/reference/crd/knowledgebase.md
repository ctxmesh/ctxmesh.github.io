---
title: KnowledgeBase
description: A managed RAG corpus — upload → chunk / embed / index → knowledge_search — granted to an agent by reference. Embedding model and chunking are one-way doors.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `KnowledgeBase` · Scope: Namespaced · shortName: `kb`

## Overview

A `KnowledgeBase` is a namespaced managed RAG corpus: you supply documents (from an object-store prefix
or an upload) and the platform chunks, embeds, indexes, and serves them for retrieval-augmented
generation. An agent is granted access by reference (`AgentDeployment.spec.knowledgeBases`) and
retrieves either via the `knowledge_search` tool or (with `autoInject`) automatically each turn.
Enforcement point: the **controller** (validation + lifecycle) and the **ingestion executor**. The
headline property is two **one-way doors**: the `embeddingRoute` and the chunking parameters are
immutable after creation (changing either requires delete + recreate — mixing embedding models yields
silent wrong results). The spec carries refs only, never inline document content.

## When to use / when not

- **Use** to give an agent a searchable document corpus (docs, KB articles, PDFs).
- **Not** for conversation memory (`sessionMemory`) or cross-conversation facts (`longTermMemory`) —
  those are `AgentDeployment` fields.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.displayName` | string | No | — | Human-readable label, surfaced in the console/audit log. Does not affect routing/retrieval. Max 256 chars. |
| `spec.source` | object | **Yes** | — | Where documents come from (a ref, never inline content). |
| `spec.source.type` | string (enum) | **Yes** | — | `objectStorePrefix` (read from a durable prefix) or `upload` (via the BFF upload endpoint; bucket prefix derived from the KB name). |
| `spec.source.objectStorePrefix` | string | Conditional | — | Durable object-store prefix. **Required when `type: objectStorePrefix`**, ignored otherwise. |
| `spec.embeddingRoute` | string | **Yes** | — | Gateway [`ModelRoute`](/reference/crd/modelroute/) used to embed chunks. **Immutable after creation** (one-way door #1). MinLength 1. |
| `spec.chunking` | object | No | size=512, overlap=64, splitter=recursive | Chunking parameters. **Immutable after creation** (one-way door #2). |
| `spec.chunking.size` | int | No | `512` | Target chunk size in tokens. Minimum 1. |
| `spec.chunking.overlap` | int | No | `64` | Tokens overlapping adjacent chunks. Minimum 0 (must be < `size`, controller-validated). |
| `spec.chunking.splitter` | string (enum) | No | `recursive` | `recursive` (delimiter priority) or `markdown` (Markdown structural boundaries). |
| `spec.perUser` | bool | No | `false` | Per-user corpus scoping (isolate retrieval to the invoking user's hash). **Immutable after creation** (one-way door #3). When false the corpus is org-wide. |
| `spec.userStorageSoftCap` | int64 | No | `0` (disabled) | Warn-only per-user storage soft cap in bytes for a `perUser` corpus (reflects a condition, never blocks ingestion). Ignored for org-wide. Minimum 0. |

### Validation rules (admission, CEL — transition rules)

- `embeddingRoute` is immutable after creation.
- `chunking` (size/overlap/splitter) is immutable after creation.
- `perUser` is immutable after creation.

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.phase` | string (enum) | `Pending` / `Ingesting` / `Ready` / `PartiallyIngested` / `Failed` / `BudgetExceeded`. |
| `status.observedGeneration` | int64 | `.metadata.generation` last fully reconciled. |
| `status.documentCount` | int32 | Source documents in the corpus as of the last successful run. |
| `status.chunkCount` | int32 | Stored chunks as of the last successful run. |
| `status.sizeBytes` | int64 | Total raw source bytes (for tenant storage accounting). |
| `status.lastIngestedAt` | time | Timestamp of the last successful ingestion run. |
| `status.ingestionRunRef` | string | Name of the current/last ingestion Run in the run store. |
| `status.conditions` | []Condition | `Validated=True` when the spec is valid; `Validated=False` carries reason + message. |

## Examples

### Minimal — upload source

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: KnowledgeBase
metadata:
  name: product-docs
  namespace: my-team
spec:
  source:
    type: upload
  embeddingRoute: text-embedding-3-small
```

### Fuller — object-store prefix + chunking

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: KnowledgeBase
metadata:
  name: product-docs
  namespace: my-team
spec:
  displayName: Product Documentation
  source:
    type: objectStorePrefix
    objectStorePrefix: corpora/product-docs/
  embeddingRoute: text-embedding-3-small
  chunking:
    size: 512
    overlap: 64
    splitter: markdown
```

Grant it to an agent via `spec.knowledgeBases: [{ name: product-docs, autoInject: true }]`.

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [AgentDeployment](/reference/crd/agentdeployment/) (`spec.knowledgeBases`) ·
  [ModelRoute](/reference/crd/modelroute/) (embedding route) · [Tenant](/reference/crd/tenant/) (corpus storage quota)
