---
title: TypeScript SDK
description: "ctxmesh (TypeScript): agent.fromEnv() with async parity — serve / runManagedLoop, delegate_to / handoff_to, and the RunsClient."
---

The TypeScript package is **`ctxmesh`**, bundled in the `base-node` agent image (Node 22). It is at
**parity** with the [Python SDK](/sdk/python/) — the same public surface, the same env/port contract,
and byte-for-byte identical [trace trees](/concepts/observability-model/) — with `async` where the
Python calls are synchronous. Like Python, it takes **no credentials**: everything comes from the
[launcher-injected environment](/concepts/the-launcher-contract/). For *when* to use it, see the
[SDK overview](/sdk/).

## Constructing a client

```ts
import { agent } from "ctxmesh";

const client = agent.fromEnv();     // reads MODEL_GATEWAY_URL, MEMORY_PORT, AGENT_NAME, ... from env
```

`agent.fromEnv()` returns a `Client` and throws `NotInPodError` when the launcher environment is
absent. For tests/offline, `agent.fromConfig(config)` builds one from an explicit `PlaneConfig`. The
`Client` class is also exported directly. The client exposes `memory`, `tools`, `feedback`, `model`,
`knowledge`, a `trace` client, and `requestScope`.

## `client.model` — the gateway

Pass the **`ModelRoute` name** as `model` (agents choose the route by name — there is no route
reference on the agent):

```ts
const resp = await client.model.chat(
  "gpt-4o",                                       // a ModelRoute name
  [{ role: "user", content: "Summarize this ticket." }],
  { timeout: 30_000 },                            // ms
);
resp.text;           // "" on a tool-call turn
resp.toolCalls;      // ToolCall[]
resp.hasToolCalls;   // boolean
resp.usage;          // { promptTokens, completionTokens, totalTokens }
```

`chat` emits an OpenInference `llm` span automatically.

:::note
Streaming (`stream` / `streamCompletion`) lands with the parity follow-through; `chat` is the supported
model call today. All other surface below is shipped.
:::

## `client.memory` / `client.knowledge`

```ts
await client.memory.append({ role: "user", content: "..." }, cid);
const history = await client.memory.get(cid);
await client.memory.remember("The customer prefers email.", { topic: "prefs" });
const facts = await client.memory.searchAgent("contact preference", 5, 0.0);

client.knowledge.available();                     // granted KnowledgeBase names (sync)
const hits = await client.knowledge.search("refund policy", "docs", 10);
// each hit: { content, documentRef, chunkIndex, startOffset, endOffset, mimeType, score }
```

## `client.tools` — MCP, delegate & handoff

```ts
const tools = await client.tools.list();          // live manifest + synthetic tools
const result = await client.tools.call("search_web", { query: "ctxmesh" });
```

A [team](/concepts/multi-agent/) supervisor also gets the synthetic `delegate_to` and `handoff_to`
tools (`client.tools.delegate(...)` / `client.tools.handoff(...)`), normally called by the model inside
the managed loop rather than by hand.

## `client.feedback`

```ts
await client.feedback.score(traceId, "helpfulness", 1.0, "clear");
```

## The managed loop and `serve`

```ts
import { agent, runManagedLoop, ManagedConfig } from "ctxmesh";

const client = agent.fromEnv();
const config = ManagedConfig.fromEnv();
const result = await runManagedLoop(client, config, "Where's my order?");
result.output;             // final text
result.steps;              // iteration count
result.toolsCalled;        // tool names
result.consentRequired;    // servers needing on-behalf-of consent
result.approvalRequired;   // { key, summary } if paused
```

The one-liner agent hands the whole lifecycle to the SDK:

```ts
import { serve } from "ctxmesh";

await serve();             // no handler → managed loop; serves /invoke, /healthz, /readyz on $AGENT_PORT
```

`serve(handler)` — where `handler(req: InvokeRequest) => string | Promise<string> | ManagedResult` —
runs custom per-request logic, binding the request scope and trace context and handling SSE streaming
(`req.emitToken`, `req.emitStep`).

## Request scope and approvals

A custom loop must bind `requestScope` so tool calls carry the invoking user's
[on-behalf-of credential](/concepts/security-model/) (an `AsyncLocalStorage`-based relay); otherwise
they downgrade to org/public credentials:

```ts
await client.requestScope(req.headers, req.approvals, async () => {
  // tool calls here run on-behalf-of the invoking user
});
```

Human-in-the-loop:

```ts
import { pauseForApproval } from "ctxmesh";

pauseForApproval("refund", "Refund $250 to order #4821");   // throws ApprovalRequiredError if not granted
await client.tools.call("issue_refund", { order: "4821" });
```

## Driving runs — `RunsClient`

```ts
import { RunsClient } from "ctxmesh";

const runs = new RunsClient("https://console.example", { token: myBearer });
const run = await runs.create({ agent: "support", input: "hi", namespace: "team-a" });
for await (const event of runs.stream(run.id)) {            // { seq, kind, data }
  // kind in state | message | token | step
}
await runs.resume(run.id, { decision: "approve" });
await runs.cancel(run.id);
const done = await runs.run({ agent: "support", input: "hi" });  // create + poll to terminal
```

## Errors

`CtxmeshError` base; `NotInPodError` / `ConfigError`, `EndpointError`, `GuardrailBlockedError`,
`ApprovalRequiredError`, `ConsentRequiredError` — mirroring Python.

## See also

- [SDK overview](/sdk/) · [Python SDK](/sdk/python/) — the parity package
- [Custom agent loop](/sdk/custom-agent-loop/) — traced steps without a framework
- [The launcher contract](/concepts/the-launcher-contract/) · [Runs & execution](/concepts/runs-and-execution/)
- [Launcher endpoints](/reference/launcher-endpoints/) · [HTTP API](/reference/http-api/)
