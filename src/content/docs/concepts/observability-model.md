---
title: Observability model
description: "The agent-run trace tree, OpenInference/OTLP emission, SDK-free deep traces, and what's captured per turn."
---

The defining claim of ctxmesh observability is: **you get a deep trace of every agent run without
instrumenting your agent.** A framework agent — LangChain, LlamaIndex, whatever — emits a full
**step → tool → model** causal tree the moment it runs, because the tracing lives in the platform, not
in your code. This page explains *how* that works and *why* the design puts the trace where it does.

## The trace tree

A run is a **span tree**. The launcher opens the root span at the request boundary; everything the
agent does nests beneath it:

```
agent.invoke                      ← launcher boundary span (name, version, route, status, latency)
├── step (chain / reasoning)      ← framework or SDK step
│   ├── tool.call <name>          ← a tool invocation (args, result)
│   └── llm <model> (client)      ← the model call from the agent's view
│       └── gateway.completion    ← the LiteLLM server span: authoritative tokens + cost
└── step ...
```

For a **multi-agent** run, a child agent's `agent.invoke` nests under its caller's span — so a
supervisor delegating to a sub-agent, or a workflow fanning out over nodes, reads as **one tree**
across pods (see [Multi-agent](/concepts/multi-agent/)).

The distinction worth internalizing: token counts and **cost are authoritative on the
`gateway.completion` span**, because the [gateway](/concepts/architecture/) — not the agent — sees the
provider's real response and pricing. Client-side estimates are never the source of truth.

## How SDK-free deep traces work

Three mechanisms combine, none of which requires a line of your code:

1. **The launcher is a traced reverse proxy.** It stays PID 1 in front of your process (it doesn't
   `exec`-replace it), so it can emit the `agent.invoke` boundary span for every request — start, end,
   status, latency — regardless of what the agent does inside.
2. **The base image carries auto-instrumentation.** Agents build on an operator-published base image
   that ships **OpenInference** instrumentation. When a framework runs, its reasoning, tool, and model
   steps are captured as spans automatically. This is why a framework agent is deeply traced with zero
   ctxmesh imports.
3. **W3C trace context propagates across every hop.** The launcher extracts the incoming `traceparent`
   and injects it into the forwarded request, so the agent's internal spans nest under the boundary
   span — and, across an [A2A](/concepts/multi-agent/) call, a child agent's spans nest under the
   parent's. One trace, many pods.

A **no-framework** agent — a hand-rolled loop, or a language with no auto-instrumentation — gets the
`agent.invoke` boundary span for free but not the *internal* steps, because there's no framework to
instrument. That's exactly the gap the [SDK's step-tracing helpers](/sdk/custom-agent-loop/) fill: they
let a custom loop emit the same `step` / `tool` / `llm` spans an auto-instrumented framework would, so
the tree looks identical.

## OpenInference and OTLP — two words for two things

- **OpenInference** is the *semantic convention* — the attribute vocabulary for LLM spans
  (`llm.model`, token counts, input/output messages, tool names and args). It's what makes a trace
  *about an agent* rather than a generic HTTP trace.
- **OTLP** is the *wire protocol* the spans travel over. Each agent pod runs an **OTLP collector
  sidecar** (`:4317` gRPC, `:4318` HTTP) that receives spans, applies redaction, batches, and exports
  to the trace backend.

Putting the collector in a sidecar (rather than baking export into the launcher) keeps it
independently resource-limited and version-pinned, and — critically — makes the **backend swappable**.

## The backend is swappable, and the trace store isn't ours to own

ctxmesh emits OpenInference over OTLP and **delegates deep trace exploration to an existing backend**.
The bundled dev backend is **Langfuse** (an LLM-native trace UI on ClickHouse); the export target is a
seam at the collector, so a production operator points it at Tempo, Honeycomb, or a self-hosted OTLP
backend by configuration — not a rebuild. The philosophy mirrors the rest of the platform:
[integrate proven infrastructure](/concepts/architecture/), own the agent-shaped layer on top.

The [console](/concepts/architecture/) still gives you a native, on-theme **run inspector** and **trace
explorer** (a span tree with a timing waterfall and redaction-honest I/O) so the golden path needs no
separate login; the full-fidelity backend is a forensics link-out.

## What's captured per turn

For each turn you get: the boundary span (agent name, version, route, status, latency), the reasoning
and tool steps, the model calls with **OpenInference attributes** (model, prompt/completion messages,
tool args and results), and the authoritative **tokens + cost** from the gateway span. Live
[run events](/concepts/runs-and-execution/) (`token`, `step`) stream the same information in real time
so you can watch a run as it happens.

## Redaction happens before persistence

Sensitive values never reach the trace store unredacted. A **named-detector redaction policy** runs in
the collector, **before export** — built-in detectors for emails, US SSNs, and API-key/token shapes,
plus custom RE2 patterns via an agent's `tracePolicy`. It rewrites attribute *values* (to a stable
marker) while leaving span names, IDs, and tree structure intact — so a redacted trace is still fully
navigable. This is the observability half of the [fail-closed doctrine](/concepts/security-model/): the
platform would rather over-redact a value than leak one. Sampling and retention (including a
metadata-only mode that keeps structure and drops payloads) are governed by the same policy.

:::note
Redaction, sampling, and retention policy surfaces are maturing toward GA; the collector-side,
before-persistence enforcement point and the built-in detector set are in place today. See
[Observability & tracing](/guides/observability-and-tracing/).
:::

## See also

- [Architecture](/concepts/architecture/) — the collector swap seam, the gateway cost span
- [The launcher contract](/concepts/the-launcher-contract/) — the boundary span and OTLP sidecar
- [Runs & execution](/concepts/runs-and-execution/) — live `token` / `step` events
- [Custom agent loop](/sdk/custom-agent-loop/) — emitting step spans without a framework
- [Security model](/concepts/security-model/) — redaction and fail-closed
- [Observability & tracing](/guides/observability-and-tracing/) · [Observability backends](/operations/observability-backends/)
