---
title: Feedback & improvement
description: "The FeedbackStore, the feedback hook, the online score, and the improvement loop that gates the next release."
sidebar:
  order: 8
---

**Goal:** capture human and external feedback on an agent's runs, curate it into a scored signal, and feed
that signal back into the loop that gates the agent's next release.

**Prerequisites:** an agent deployed ([Deploy an agent](/guides/deploy-an-agent/)); the bundled trace
backend up (Langfuse — the store of record for scores). For the release gate side, an
[`EvalSuite`](/guides/evals-and-the-deploy-gate/).

## The shape of the loop

Feedback flows in as **scores on a run's trace** (Langfuse is the store of record — the platform holds no
separate feedback datastore). A [`FeedbackStore`](/reference/crd/feedbackstore/) is a **declarative config
object**: it declares which score names belong to which source (human / external), so the write path can
*gate* which scores are accepted and the read path can *attribute* each score to its source. Those scores
become an **online score** on production traffic, which the improvement loop uses to detect regressions and
to build a curated dataset for the **next** offline gate. A dangling `feedbackStoreRef` **fails the agent
closed**.

## 1. Declare the feedback model

A `FeedbackStore` declares a `human` source and/or `external` channels, each binding one or more
`ScoreDecl` dimensions. **A score `name` is unique across the whole store** (all sources) — the name is the
attribution key.

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: FeedbackStore
metadata:
  name: support-feedback
  namespace: my-team
spec:
  mode: Enforce                    # Enforce = reject an undeclared score name; Monitor = accept + count it
  human:                           # dashboard thumbs / ratings / corrections
    scores:
      - name: thumbs
        dataType: BOOLEAN          # NUMERIC | BOOLEAN carry a number; CATEGORICAL carries a label
      - name: accuracy
        dataType: NUMERIC
      - name: resolution
        dataType: CATEGORICAL
        categories: [resolved, escalated, abandoned]
  external:                        # allowlisted external signal channels (webhook/API)
    - name: csat-webhook
      score:
        name: csat
        dataType: NUMERIC
```

Apply it and confirm the spec is coherent:

```bash
kubectl apply -f support-feedback.yaml
kubectl get feedbackstore support-feedback -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Validated")].status}'
# → True   (Validated=False, reason InvalidSpec, when there is no source or a duplicate score name)
```

## 2. Attach it to the agent (fails closed)

```yaml
spec:
  feedbackStoreRef: support-feedback
```

Reference it and the agent's feedback ingestion is gated by this model. A **dangling ref holds the agent**
`Ready=False` — like every governance ref, it fails closed rather than serving ungoverned. Absent a ref,
the agent falls back to today's open relay to Langfuse (every score accepted, no attribution).

## 3. Submit a score

A run's feedback is a score keyed by the run's **`traceId`**. Two paths:

**Runtime hook** — the launcher exposes a local feedback endpoint (`FEEDBACK_PORT`, `:2995`) that relays
to Langfuse's scores API:

```bash
# From inside the agent (the launcher injects the port); value is numeric (a boolean coerces to 0/1).
curl -s -X POST localhost:2995/feedback \
  -H 'content-type: application/json' \
  -d '{"traceId":"<runTraceId>","name":"thumbs","value":1,"comment":"resolved my issue"}'
# → 202 Accepted   (relayed to Langfuse as a score on that trace)
```

**Console / external write path** — `POST /api/feedback` is the caller-scoped write path: it resolves
`trace → run → agent`, proves you can read that agent (which also defeats trace-id forgery), then **gates
the score name** by the bound `FeedbackStore` per its `mode` before relaying to Langfuse.

## 4. From feedback to the next release

The feedback scores feed the **improvement loop**:

- An **online score** is computed on production traffic — a vector of an operational component (free,
  deterministic), the **feedback** component (these scores, sparse), and a sampled LLM-judge component
  (cost-capped) — stored per `(AgentVersion, window)`. Configure it on the `EvalSuite.spec.online` policy.
- That online score drives **regression detection** and the **canary** verdict (see
  [Canary & rollout](/guides/canary-and-rollout/)).
- Curated runs (a "add this run to the dataset" flag) build a **pinned dataset** that a future
  [`EvalSuite`](/guides/evals-and-the-deploy-gate/) scores against — so the **next** release is gated on a
  better bar built from real production signal.

Promotion and rollback stay **human-gated** in v1 — with a noisy new signal the human click is the intended
damping mechanism (see [Canary & rollout](/guides/canary-and-rollout/) for the automatic opt-ins).

## When to use / when not

- **Use** a `FeedbackStore` to curate a fixed set of feedback dimensions (thumbs, ratings, CSAT, NPS) and
  reject undeclared score names, and to attribute each score to a human vs external channel.
- **Use** `mode: Monitor` first when migrating an already-emitting agent — it accepts and counts undeclared
  names so nothing is silently dropped while you finalize the model.
- **Not** a data store — the raw scores live in Langfuse; this CRD is config. Deleting it stops
  gating/attribution but keeps the raw feedback in Langfuse.

## Defaults

- `spec.mode` defaults to `Enforce`. `ScoreDecl.dataType` defaults to `NUMERIC`.
- At least one source (`human` or `external`) must be declared (`Validated=False` otherwise).
- No `feedbackStoreRef` on the agent ⇒ open relay to Langfuse (unchanged).

## Failure modes

- **Enforce mode, undeclared score name** → the console write path returns **HTTP 422** (the score name is
  not declared). *Fix:* declare the dimension, or switch the store to `mode: Monitor`.
- **Missing `traceId`** → **HTTP 400** at both the runtime hook and the API (no silent drop).
- **Langfuse relay fails** → **HTTP 502** (surfaced, not swallowed — the caller can retry).
- **Dangling `feedbackStoreRef`** → the agent is held `Ready=False` (fail-closed). *Fix:* create the store
  or remove the ref.
- **Duplicate score name across sources / no source** → `Validated=False` (reason `InvalidSpec`).

:::note
The LLM-as-judge feedback source and the fold-normalization knobs (weight/min/max) are deferred — they are
additive later, not shipped inert. The judge sampling, online-score windowing, and dataset labeling UX
finalize toward GA.
:::

## See also

- Reference: [FeedbackStore](/reference/crd/feedbackstore/) · [EvalSuite](/reference/crd/evalsuite/) ·
  [AgentDeployment](/reference/crd/agentdeployment/)
- Concept: [Observability model](/concepts/observability-model/) · [Runs & execution](/concepts/runs-and-execution/)
- Guide: [Evals & the deploy gate](/guides/evals-and-the-deploy-gate/) ·
  [Canary & rollout](/guides/canary-and-rollout/) · [Observability & tracing](/guides/observability-and-tracing/)
