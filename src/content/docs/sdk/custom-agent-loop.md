---
title: Custom agent loop
description: "Build a no-framework agent that still emits the full step → tool → model trace."
---

Most agents get a deep [trace tree](/concepts/observability-model/) for free — the base image's
auto-instrumentation captures a framework's every step. But if you write your **own** tool-calling loop
with no framework, there's nothing for the auto-instrumentation to hook, so only the launcher's
`agent.invoke` boundary span appears — your reasoning, tool, and model steps are invisible. The SDK's
**step-tracing helpers** close that gap: you wrap your loop's boundaries and get the same
`step → tool → model` tree an auto-instrumented framework produces.

This page is the how-to for that case. If you're using a framework, you don't need any of this.

## The idea

`client.trace` gives you span scopes rooted under the launcher's boundary span (via
[W3C context propagation](/concepts/observability-model/)):

- `client.trace.loop(...)` — the agent root scope
- `client.trace.step(name)` — a reasoning/chain step
- `client.trace.tool(name, input=...)` — a tool call
- `llm` spans are emitted for you by `client.model.chat(...)`

Each scope yields a `SpanHandle` with `.set_input(...)`, `.set_output(...)`, and `.set_attribute(...)`.
Two rules make the trace correct and the tool calls governed:

1. **Bind the request context** so your spans nest under the inbound trace, not a new root.
2. **Enter the [request scope](/concepts/security-model/)** so tool calls carry the invoking user's
   on-behalf-of credential (skip this and they silently downgrade to org/public credentials).

`serve` does both for you when you hand it a handler — which is the recommended way to run a custom
loop.

## Python

```python
import ctxmesh
from ctxmesh import agent, InvokeRequest

def handle(req: InvokeRequest) -> str:
    client = req.client                      # request scope + trace already bound by serve()
    messages = [{"role": "user", "content": req.input}]

    with client.trace.loop("agent", headers=req.headers) as root:
        root.set_input(req.input)
        for _ in range(8):                   # your own max-steps guard
            with client.trace.step("reason"):
                resp = client.model.chat(model="gpt-4o", messages=messages)  # emits the llm span

            if not resp.has_tool_calls:
                root.set_output(resp.text)
                return resp.text

            messages.append(resp.message)
            for call in resp.tool_calls:
                name = call["function"]["name"]
                with client.trace.tool(name, input=call) as t:
                    out = client.tools.call(name, **_args(call))
                    t.set_output(out)
                messages.append({"role": "tool", "tool_call_id": call["id"], "content": str(out)})

        return "step budget exhausted"

ctxmesh.serve(handle)                        # binds request_scope + trace, serves /invoke
```

If you serve the loop yourself instead of via `serve`, wrap the body in
`with client.request_scope(headers=req.headers, approvals=req.approvals):` and pass `headers` into
`client.trace.loop(...)` so the on-behalf-of and trace-context invariants hold.

## TypeScript

```ts
import { serve, type InvokeRequest } from "ctxmesh";

await serve(async (req: InvokeRequest): Promise<string> => {
  const client = req.client;                 // request scope + trace already bound
  const messages: Array<Record<string, unknown>> = [{ role: "user", content: req.input }];

  return client.trace.loop("agent", req.headers, async (root) => {
    root.setInput(req.input);
    for (let i = 0; i < 8; i++) {
      const resp = await client.trace.step("reason", async () =>
        client.model.chat("gpt-4o", messages),   // emits the llm span
      );
      if (!resp.hasToolCalls) {
        root.setOutput(resp.text);
        return resp.text;
      }
      messages.push(resp.message);
      for (const call of resp.toolCalls) {
        const name = call.function.name;
        const out = await client.trace.tool(name, call, async (t) => {
          const r = await client.tools.call(name, argsOf(call));
          t.setOutput(r);
          return r;
        });
        messages.push({ role: "tool", tool_call_id: call.id, content: String(out) });
      }
    }
    return "step budget exhausted";
  });
});
```

## Add human-in-the-loop and multi-agent

Because you're on the platform plane, the same primitives the [managed loop](/sdk/python/) uses are
available in your custom loop:

- `pause_for_approval(key, summary)` / `pauseForApproval(key, summary)` — pause the run at a decision
  point; it resumes when a human [approves](/guides/approvals/).
- `client.tools.call("delegate_to", ...)` / `client.tools.call("handoff_to", ...)` — the synthetic
  [multi-agent](/concepts/multi-agent/) tools, if the agent is a team member.

## Prefer the managed loop when you can

The managed loop (`run_managed_loop` / `runManagedLoop`) already implements this pattern — bounded
steps, traced spans, tool dispatch, structured output, approval and delegation handling — so reach for
a custom loop only when you need control the managed loop doesn't give you. When you do, these helpers
make your loop indistinguishable from a framework agent in the trace tree.

## See also

- [SDK overview](/sdk/) · [Python SDK](/sdk/python/) · [TypeScript SDK](/sdk/typescript/)
- [Observability model](/concepts/observability-model/) — why a no-framework loop needs these helpers
- [The launcher contract](/concepts/the-launcher-contract/) — the plane your loop runs on
- [Approvals](/guides/approvals/) · [Multi-agent teams](/guides/multi-agent-teams/)
