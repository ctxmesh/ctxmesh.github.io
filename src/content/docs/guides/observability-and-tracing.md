---
title: Observability & tracing
description: "Read the trace tree and runs browser in the console, drill into cost, and link out to your trace backend."
sidebar:
  order: 9
---

**Goal:** understand exactly what an agent did on a given run — the step → tool → model tree, the cost, and
the tokens — using the console, and link out to the trace backend for deep forensics.

**Prerequisites:** an agent deployed and serving ([Deploy an agent](/guides/deploy-an-agent/)); the bundled
observability stack up (the OTel collector sidecar is injected per agent; Langfuse is the trace store of
record). No SDK is required — a framework agent on the platform base image is traced as-is.

## What you get for free

Every `/invoke` is traced with **zero SDK**. The launcher emits a boundary span and propagates W3C context
so base-image instrumentation nests beneath it, producing one trace per run:

```
agent.invoke                       (launcher boundary span — the run root, or an AMP child)
└─ <framework chain span>
   ├─ <reasoning step spans>
   ├─ tool.call <name>             (tool name, args, result)
   └─ llm <model> (client)         (the agent's view of the model call)
      └─ gateway.completion        (authoritative token counts + cost, from the gateway)
```

Cost and authoritative token counts live on the **gateway** span (it sees the provider response and knows
pricing); the agent's client span is its own view of the call. See
[Observability model](/concepts/observability-model/) for the full span/attribute model.

## 1. Find the run

Open the **runs browser** in the console (`/runs`) — a filterable, cursor-paginated list of runs (filter by
agent, time window, and a free-text query). Click a run to open it. From an agent you already have, the
agent's **runs** tab lists its runs directly.

## 2. Read the trace tree

The run's **trace explorer** (`/traces/:id`) renders the span tree as a DFS-ordered tree with a timing
waterfall and redaction-honest I/O — each `step`, each `tool.call` (name/args/result), and each `llm` call,
nested exactly as they executed. You do not need to log in to Langfuse to read it; the native page is the
primary surface.

Expand a span to see:

- **`tool.call <name>`** — the tool invoked, its arguments, and its result (redacted per the trace policy).
- **`llm <model>`** — the model call, with the model name and the OpenInference `llm.*` attributes.
- **`gateway.completion`** — the authoritative **token counts and cost** for that model call.
- Any **guardrail decision** on the request/response path (block / redact), traced inline.

## 3. Drill into cost

Two views:

- **Per run:** the trace explorer surfaces the cost per model call on the gateway spans, so you can see
  where a run's spend went, call by call.
- **Per agent:** the console's cost breakdown rolls up a recent window grouped by agent (the
  `agent:<ns>/<name>` tag), with an `(untagged)` bucket for spans that carry no agent tag — the fast way to
  see which agents are driving spend.

Cost is **not** exposed on `AgentDeployment.status` — read it here, not from the CRD. (For the hard USD caps
that *halt* a run on a budget breach, see [Model routing & cost](/guides/model-routing-and-cost/).)

## 4. Link out to the trace backend

Langfuse is the **store of record** for traces and scores. The native run/trace pages cover the common path;
for deep forensics, the **"Open in Langfuse"** link-out on a run opens that exact trace in Langfuse. Feedback
scores you submit (see [Feedback & improvement](/guides/feedback-and-improvement/)) land on the same trace,
so quality signal and execution detail sit together.

## Redaction

Trace redaction is always on: the built-in email / SSN / key detectors scrub sensitive span attributes at
the collector **before persistence**, leaving span structure intact. Extend it with custom RE2 detectors via
`AgentDeployment.spec.tracePolicy.customDetectors` — matches are replaced with a `[REDACTED:<name>]` marker.
See the [Security model](/concepts/security-model/).

## When to use / when not

- **Use** the runs browser + trace explorer as your first stop to debug *what an agent did* on a specific
  run — reasoning, tool calls, model calls, cost.
- **Use** the per-agent cost breakdown to spot spend outliers across agents.
- **Use** the Langfuse link-out only when you need backend-native deep forensics beyond the console page.
- **Not** the place to *enforce* cost — that's `spec.budget` ([Model routing & cost](/guides/model-routing-and-cost/)).
- **Not** where you'll find agent-wide spend on the CRD — status carries no spend field.

## Defaults

- Tracing is on by default for every agent — no SDK, no opt-in.
- Trace export is **best-effort**: if the collector sidecar or the backend is down, the request still serves
  and spans are dropped, not the run.
- A run with no incoming `traceparent` starts a **new root trace**; an AMP call continues the caller's trace.
- Built-in redaction detectors (email / SSN / key) are always applied.

## Failure modes

- **Collector sidecar down** → the agent still serves `/invoke`; spans for that window are dropped (tracing
  is non-blocking), not the request.
- **Trace backend unreachable** → the collector queues/drops per its retry config; the agent is unaffected,
  but new runs won't appear in the console/Langfuse until it recovers.
- **A no-framework / Go agent** → still gets the `agent.invoke` boundary span; internal reasoning spans need
  the SDK step-tracing helpers or hand-emitted OTLP.
- **Missing spans in a tree** → usually a dropped export (backend/collector blip) rather than a code path
  that didn't run — check the sidecar before assuming a bug.

:::note
The native trace explorer covers the common inspection path; some deep backend-native features remain a
Langfuse link-out, and the exact set of console cost/trace surfaces finalizes toward GA.
:::

## See also

- Concept: [Observability model](/concepts/observability-model/) · [Runs & execution](/concepts/runs-and-execution/) ·
  [The launcher contract](/concepts/the-launcher-contract/)
- Guide: [Record & replay](/guides/record-and-replay/) · [Share a run](/guides/share-a-run/) ·
  [Alerting](/guides/alerting/) · [Model routing & cost](/guides/model-routing-and-cost/) ·
  [Feedback & improvement](/guides/feedback-and-improvement/)
- Reference: [AgentDeployment](/reference/crd/agentdeployment/) (`tracePolicy`) · [HTTP API](/reference/http-api/)
