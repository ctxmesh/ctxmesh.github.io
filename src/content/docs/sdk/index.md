---
title: SDKs
description: "The optional SDKs: typed sugar over the launcher plane. When you need one vs. SDK-free auto-instrumentation."
---

The ctxmesh SDKs are **optional**. Everything the platform offers an agent — memory, tools, the model
gateway, feedback, knowledge, deep tracing, on-behalf-of credentials — is a
[language-agnostic localhost plane](/concepts/the-launcher-contract/) served by the launcher. The SDK
is *typed sugar* over that plane, not a gateway to it. A framework agent in any language is fully
governed and deeply traced with **zero** ctxmesh imports.

So the real question is: when do you want the SDK?

## When you need an SDK

- **You're writing a no-framework agent loop.** A hand-rolled loop won't be auto-instrumented, so its
  internal steps won't show up in the trace tree. The SDK's **step-tracing helpers** let your loop emit
  the same `step → tool → model` spans an auto-instrumented framework produces. This is the single most
  common reason to reach for it — see [Custom agent loop](/sdk/custom-agent-loop/).
- **You want typed ergonomics** over the localhost plane: `client.memory`, `client.tools`,
  `client.model`, `client.knowledge`, `client.feedback` — instead of hand-writing HTTP to `localhost`.
- **You want the managed loop.** `run_managed_loop` (Python) / `runManagedLoop` (TypeScript) is the
  stock, bounded, traced tool-calling loop — system prompt in, tools from the manifest, `max_steps`
  guard, structured output — so you don't reimplement the ReAct pattern.
- **You need in-loop platform features** like `pause_for_approval` (human-in-the-loop) or the synthetic
  `delegate_to` / `handoff_to` tools for [multi-agent](/concepts/multi-agent/) work.
- **You're driving runs from outside a pod** — a client, a test, a CI job — with the `RunsClient`.

## When you don't

- A **framework agent** (LangChain, LlamaIndex, and friends) is already deeply traced and fully
  governed by the launcher. Import the SDK only if you additionally want its typed clients or the
  managed loop.
- Any language with no ctxmesh SDK still gets the full contract — the plane is plain HTTP. You lose the
  typed clients and the step-tracing helpers, nothing else.

## The two packages

Both packages are named **`ctxmesh`** and are at **parity** — the same public surface, the same
env/port contract, and byte-for-byte identical trace trees.

- **Python** — bundled in the `base-python` agent image. See [Python SDK](/sdk/python/).
- **TypeScript** — bundled in the `base-node` agent image, with `async` parity across the surface. See
  [TypeScript SDK](/sdk/typescript/).

:::note
Both SDKs are vendored into their base images (so an agent built on `base-python` / `base-node` can
`import ctxmesh` with zero setup). Standalone package publishing finalizes toward GA. The streaming
model API (`.stream`) is present in Python; the TypeScript streaming methods land as part of the parity
work. Signatures on the per-language pages reflect what ships today.
:::

## The shape of an SDK agent

Every SDK entry point starts by constructing a `Client` from the launcher-injected environment — it
never takes credentials, because there are none to take:

```python
from ctxmesh import agent

client = agent.from_env()          # reads MODEL_GATEWAY_URL, MEMORY_PORT, ... from the launcher
answer = client.model.chat(model="my-route", messages=[{"role": "user", "content": "hi"}]).text
```

From there you either serve a handler (`serve`), run the managed loop, or write your own traced loop.
The per-language pages cover each.

## See also

- [Python SDK](/sdk/python/) · [TypeScript SDK](/sdk/typescript/) · [Custom agent loop](/sdk/custom-agent-loop/)
- [The launcher contract](/concepts/the-launcher-contract/) — the plane the SDK wraps
- [Observability model](/concepts/observability-model/) — SDK-free vs. custom-loop tracing
- [Launcher endpoints](/reference/launcher-endpoints/) — the raw HTTP surface
- [Deploy an agent](/guides/deploy-an-agent/)
