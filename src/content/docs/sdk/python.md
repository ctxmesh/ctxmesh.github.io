---
title: Python SDK
description: "ctxmesh (Python): agent.from_env(), memory / tools / feedback / model / knowledge, traced steps, pause_for_approval, and run_managed_loop."
---

The Python package is **`ctxmesh`**, bundled in the `base-python` agent image. It is typed sugar over
the [launcher's localhost plane](/concepts/the-launcher-contract/) — it takes **no credentials** and
reads everything it needs from the launcher-injected environment. This page is a reference to the
public surface plus a short how-to; for *when* to use it at all, see the [SDK overview](/sdk/).

## Constructing a client

```python
from ctxmesh import agent

client = agent.from_env()          # reads MODEL_GATEWAY_URL, MEMORY_PORT, AGENT_NAME, ... from env
```

`agent.from_env()` returns a `Client` and raises `NotInPodError` when the launcher environment is
absent. For tests or offline use, `agent.from_config(config, span_processor=...)` builds a client from
an explicit `PlaneConfig` (with an in-memory span exporter). The `Client` class is also exported
directly.

The `Client` exposes five sub-clients — `memory`, `tools`, `feedback`, `model`, `knowledge` — plus a
`trace` client and `request_scope`.

## `client.model` — the gateway

All model calls flow through the [Model Gateway](/concepts/architecture/); you pass the **`ModelRoute`
name** as `model` (there is no model-route reference on the agent — the agent chooses the route by
name):

```python
resp = client.model.chat(
    model="gpt-4o",                       # a ModelRoute name
    messages=[{"role": "user", "content": "Summarize this ticket."}],
    timeout=30,                           # keyword-only; never collides with tool args
)
resp.text            # assistant content ("" on a tool-call turn)
resp.tool_calls      # list of tool-call dicts
resp.has_tool_calls  # bool
resp.usage           # {"prompt_tokens", "completion_tokens", "total_tokens"}
resp.message         # raw choices[0].message
```

`client.model.chat(...)` emits an OpenInference `llm` span automatically. Streaming is available via
`client.model.stream(model, messages, ...)` (yields content deltas) and `client.model.stream_completion(...)`
(yields deltas, then returns the assembled `ChatResponse`).

## `client.memory` — session & long-term

Session memory is the conversation log; the agent-memory methods are the durable, semantic
[long-term store](/concepts/memory-and-state/):

```python
client.memory.append({"role": "user", "content": "..."}, conversation_id=cid)
history = client.memory.get(conversation_id=cid)          # list of entries
hits    = client.memory.search("last invoice", conversation_id=cid)

client.memory.remember("The customer prefers email.", tags={"topic": "prefs"})
facts = client.memory.search_agent("contact preference", top_k=5, threshold=0.0)
```

## `client.knowledge` — managed RAG

```python
client.knowledge.available()                              # granted KnowledgeBase names
hits = client.knowledge.search("refund policy", knowledge_base="docs", top_k=10)
# each hit: {content, documentRef, chunkIndex, startOffset, endOffset, mimeType, score}
```

The same corpus is also exposed to the model as the synthetic `knowledge_search` tool for
[agentic RAG](/concepts/memory-and-state/), with citations.

## `client.tools` — MCP tools, delegate & handoff

```python
tools = client.tools.list()                               # live manifest + synthetic tools
result = client.tools.call("search_web", query="ctxmesh")  # MCP invocation
```

For [multi-agent](/concepts/multi-agent/) work, a team supervisor gets synthetic tools surfaced through
`client.tools`: `delegate_to` (run a roster member as a durable sub-run and return its result) and
`handoff_to` (transfer conversation control). In the [managed loop](#the-managed-loop) these are called
by the model like any tool; you rarely invoke them by hand.

## `client.feedback` — scores

```python
client.feedback.score(trace_id=resp_trace_id, name="helpfulness", value=1.0, comment="clear")
```

Scores are correlated to the run's `traceId` (see [Observability](/concepts/observability-model/)).

## The managed loop

`run_managed_loop` runs the stock, bounded, traced tool-calling loop so you don't reimplement ReAct:

```python
from ctxmesh import agent, run_managed_loop, ManagedConfig

client = agent.from_env()
config = ManagedConfig.from_env()          # system_prompt, model_route, max_steps, tool_policy, ...
result = run_managed_loop(client, config, text="Where's my order?")

result.output              # final completion text
result.steps               # iteration count
result.tools_called        # tool names invoked
result.consent_required    # MCP servers needing on-behalf-of consent
result.approval_required   # {key, summary} if paused for human approval
```

The simplest possible agent hands the whole request lifecycle to the SDK:

```python
import ctxmesh
ctxmesh.serve()            # no handler → runs the managed loop, serves /invoke, /healthz, /readyz
```

`serve` binds the [request scope](#request-scope-and-approvals) and trace context automatically and
handles streaming. Pass a handler — `serve(handler)` where `handler(req: InvokeRequest) -> str |
ManagedResult` — to run custom logic per request.

## Request scope and approvals

If you write your own loop (not `serve` / `run_managed_loop`), you **must** enter `request_scope` so
tool calls carry the invoking user's [on-behalf-of credential](/concepts/security-model/) — otherwise
they silently downgrade to org/public credentials:

```python
with client.request_scope(headers=req.headers, approvals=req.approvals):
    ...  # tool calls here run on-behalf-of the invoking user
```

For human-in-the-loop, `pause_for_approval(key, summary)` raises `ApprovalRequiredError` if the
decision hasn't been granted, and returns (proceeds) when a resumed run carries the approval:

```python
from ctxmesh import pause_for_approval

pause_for_approval("refund", summary="Refund $250 to order #4821")
client.tools.call("issue_refund", order="4821")
```

## Driving runs from outside — `RunsClient`

`RunsClient` talks to the console/BFF control plane (caller-authenticated with a bearer token — this is
*not* the in-pod localhost plane), to create, poll, stream, resume, and cancel
[runs](/concepts/runs-and-execution/):

```python
from ctxmesh import RunsClient

runs = RunsClient("https://console.example", token=my_bearer)
run = runs.create(agent="support", input="hi", namespace="team-a")
for event in runs.stream(run.id):          # RunEvent(seq, kind, data); kind in state|message|token|step
    ...
runs.resume(run.id, decision="approve")    # from requires_action
runs.cancel(run.id)
run = runs.run(agent="support", input="hi")  # convenience: create + poll to terminal
```

## Errors

`CtxmeshError` is the base; notable subclasses: `NotInPodError` / `ConfigError` (environment),
`EndpointError` (HTTP non-2xx), `GuardrailBlockedError`, `ApprovalRequiredError`, `ConsentRequiredError`.

## See also

- [SDK overview](/sdk/) — when to use the SDK at all
- [TypeScript SDK](/sdk/typescript/) — the parity package
- [Custom agent loop](/sdk/custom-agent-loop/) — traced steps without a framework
- [The launcher contract](/concepts/the-launcher-contract/) · [Runs & execution](/concepts/runs-and-execution/)
- [Launcher endpoints](/reference/launcher-endpoints/) · [HTTP API](/reference/http-api/)
