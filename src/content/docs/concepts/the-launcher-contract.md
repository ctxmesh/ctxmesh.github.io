---
title: The launcher contract
description: "The PID-1 launcher and the language-agnostic localhost plane (feedback, memory, knowledge, tools, discovery, OTLP) that gives every agent the full platform contract — SDK optional."
---

Every ctxmesh agent pod has the same shape: the **launcher runs as PID 1**, and your agent
container runs as its child. The launcher is not a convenience wrapper — it is the *contract
boundary* between your code and the platform. Everything the platform promises about an agent
(governance, memory, tracing, credentials) is enforced or served here, in-pod, on localhost. This
is why an agent written in any language, with any framework, gets the full platform without
importing anything ctxmesh-specific.

## Why a launcher at all

You could imagine the platform reaching *into* an agent — a library the agent must import, a
gateway it must remember to call, a header it must promise to forward. Every one of those is a
place where an agent (or a prompt-injected agent) can forget, skip, or lie. ctxmesh instead makes
the launcher the **un-forgeable** thing in the pod:

- It is **PID 1**, so it owns process lifecycle, signal handling, and the exit code — your agent is
  its child, launched (not `exec`-replaced) so the launcher stays in the request path.
- It sits **in front of your process** as a traced reverse proxy on `$AGENT_PORT`, so the
  `agent.invoke` boundary span and the guardrail scan happen whether or not the agent cooperates.
- It **scrubs the environment** before it launches your code, stripping platform credentials
  (object-store keys, the pod's projected token, OTLP auth) from the child's environment. Your
  agent reaches those capabilities *only* through the launcher's local proxies — it can never read
  the raw secret.

The trade-off is deliberate: a small amount of per-pod overhead (one extra process, a sub-ms proxy
hop, a handful of localhost listeners) buys a boundary that holds even when the agent code is
untrusted. The alternative — trusting every agent to behave — does not survive contact with
production.

## The localhost plane

The launcher exposes the platform as a set of **localhost HTTP endpoints**, one concern per port.
Your agent talks plain HTTP to `localhost`; the launcher does the privileged, cross-cluster work
behind each one. Because it is just HTTP + files + environment variables, the plane is
**language-agnostic** — the SDK is typed sugar over it, never a requirement.

```
        ┌──────────────────────── agent pod ─────────────────────────┐
        │                                                             │
 request │  ┌── launcher (PID 1) ──────────────────────────────────┐  │
 ────────┼─►│  proxy on $AGENT_PORT → guardrail scan → agent.invoke │  │
        │  │                                                       │  │
        │  │  localhost plane (one concern per port):              │  │
        │  │    :2999  discovery   — live tool manifest            │  │
        │  │    :2998  memory / knowledge — session + RAG          │  │
        │  │    :2996  gateway / guardrail / budget (model egress) │  │
        │  │    :2995  feedback    — scores keyed by traceId       │  │
        │  │    :2994  delegate    — spawn a sub-agent (teams)     │  │
        │  │    :4317  OTLP collector (sidecar) — redact/export    │  │
        │  └───────────────┬──────────────────────────────────────┘  │
        │                  │ launch (env scrubbed)                    │
        │        ┌─────────▼───────────────────────────────────────┐  │
        │        │  your agent container (any language)            │  │
        │        │  serves POST /invoke, /healthz, /readyz         │  │
        │        └─────────────────────────────────────────────────┘  │
        └─────────────────────────────────────────────────────────────┘
```

- **Discovery** (`:2999`) serves the live tool manifest, hot-reloadable when an
  [`MCPToolBinding`](/reference/crd/mcptoolbinding/) changes — so an agent sees a new tool without a
  restart. Its durable backing is the static `tools.json` mounted at `/etc/agent/tools.json`.
- **Memory / knowledge** (`:2998`) serve conversation [memory](/concepts/memory-and-state/) and
  managed-corpus retrieval (`knowledge_search`), proxying to the out-of-pod
  [State Layer](/concepts/memory-and-state/) and the token service — the agent pod itself holds no
  datastore credentials.
- **Gateway / guardrail / budget** (`:2996`) is the outbound choke point: model calls flow through
  it to the [Model Gateway](/concepts/architecture/), [guardrails](/guides/guardrails/) scan input
  and output in-path, and per-conversation [budgets](/guides/model-routing-and-cost/) are enforced
  before a provider is ever hit. Tool egress is brokered through a companion **egress sidecar** that
  injects the invoking user's credential (see [Security model](/concepts/security-model/)).
- **Feedback** (`:2995`) relays scores, correlated to the run's `traceId`.
- **Delegate** (`:2994`) is how a team supervisor spawns a sub-agent — platform-owned so agent code
  cannot forge a spawn (see [Multi-agent](/concepts/multi-agent/)).
- **OTLP collector** (`:4317` gRPC, `:4318` HTTP) is a sidecar that receives spans, applies
  redaction *before* export, batches, and ships to the trace backend — the swap seam that keeps the
  [observability model](/concepts/observability-model/) backend-agnostic.

:::note
Exact port assignments and endpoint shapes finalize toward GA; the split-by-concern model and the
localhost-HTTP contract are stable. See [Launcher endpoints](/reference/launcher-endpoints/) for the
field-level reference.
:::

## What the launcher does per turn

For a single request the launcher: scans the input against the agent's
[`GuardrailPolicy`](/reference/crd/guardrailpolicy/) (fail-closed), opens the boundary
`agent.invoke` span and propagates W3C trace context into your process, runs your agent's turn,
brokers each model call through the gateway under budget, brokers each tool call through the egress
sidecar (injecting the invoking user's [on-behalf-of credential](/concepts/security-model/) so the
raw token never enters your container), pauses for [approval](/guides/approvals/) if an
`ApprovalPolicy` requires it, scans the output before releasing it, and closes the span. The
resulting **step → tool → model** causal tree is emitted without any SDK call on your part — the
base image's auto-instrumentation produces it (see [Observability](/concepts/observability-model/)).

## SDK-optional by design

Because the whole contract is HTTP + files + env, a framework agent (LangChain, LlamaIndex, or your
own loop) gets deep traces, memory, tools, and governance *for free* — the launcher is already in
the path. The [SDKs](/sdk/) exist for two things the raw plane can't give you ergonomically: typed
clients over these endpoints, and **step-tracing helpers** so a hand-rolled, no-framework loop emits
the same span tree an auto-instrumented framework does. Reach for an SDK when you want the ergonomics
or you are building a [custom agent loop](/sdk/custom-agent-loop/); never reach for it just to
"connect to the platform" — you already are.

## See also

- [Architecture](/concepts/architecture/) — the three planes and how the launcher fits
- [Runs & execution](/concepts/runs-and-execution/) — what an invocation actually is
- [Security model](/concepts/security-model/) — env scrub, on-behalf-of, fail-closed
- [Observability model](/concepts/observability-model/) — the trace tree the launcher emits
- [Launcher endpoints](/reference/launcher-endpoints/) — the field-level reference
- [SDKs](/sdk/) — typed sugar over this plane
