---
title: Quickstart (console)
description: "The no-YAML path: connect a provider, create an agent from a prompt, and run it — all in the console."
---

There are two ways to get an agent running on ctxmesh: author YAML and `kubectl apply` it (the
[YAML quickstart](/getting-started/quickstart/)), or do the whole thing in the **console** without
writing any YAML. This page walks the no-YAML path: connect a model provider, describe an agent in
plain English, review what the platform generated, and run it — a few minutes end to end.

Everything the console does here is [caller-scoped](/concepts/security-model/): it acts with *your*
Kubernetes identity and RBAC, so you can only create what you're allowed to create. Nothing is
auto-applied — you review before anything lands.

## 1. Connect a model provider

Agents call the [gateway](/concepts/architecture/) with a `ModelRoute` *name*; connecting a provider is
how that route comes to exist. In the console's **Providers** page, paste your provider API key once.
The [BFF](/concepts/architecture/) validates it **server-side** and creates the backing
`Secret` + `SecretBinding` + `ModelRoute` for you — caller-scoped, and the key never lands in the
browser or a log. Connect is idempotent: re-connecting rotates the key rather than erroring, and each
connection offers **Rotate key** and **Disconnect**.

Once connected, the model picker is populated and create-agent can select a `provider / model` directly
— you don't hand-author a route on the golden path. See
[Connect a model provider](/guides/connect-a-model-provider/).

## 2. Create an agent from a prompt

Open **Create agent** and *describe* what you want — "an agent that answers questions about our refund
policy and can look up an order by number." The BFF asks a model to generate a simplified `agent.yaml`,
validates it through the same [`expand`](/reference/cli/) core the CLI uses, and returns it **for your
review**. Two things to know:

- **It is never auto-applied.** You see the generated config, can tune it (model, tools, memory,
  guardrails), and only then create it.
- **It is cost-tagged.** Generation is a model call, tracked as such, so there are no surprise costs.

Prefer to start from something concrete? The **recipe gallery** offers curated, working examples that
pre-fill the create flow, and a **connect-checklist** tells you up front what the agent needs (is the
model route connected? is each tool ready, or does it need approval or consent?) — killing the
"created it, ran it, it broke" surprise before it happens.

When you create, the console issues the create as *you* — the API server enforces your RBAC. A `viewer`
can't create; that's the [caller-scoped model](/concepts/identity/) working as designed.

## 3. Run it

The new agent's page shows its status and a live log tail. Open the **chat panel** and send a turn:
the console creates a [run](/concepts/runs-and-execution/), the agent executes through the managed
loop, and you get an answer. Turns share one `conversationId`, so a memory-bound agent keeps context
across the conversation. If a tool needs your [on-behalf-of consent](/concepts/security-model/), an
inline "Connect" prompt appears mid-run and the turn resumes once you've connected — connecting is part
of running the agent, not a separate setup step.

## 4. Inspect the run

Every turn is fully traced. The **run inspector** shows the run's steps, timing, tokens, and cost —
with tool spans visible — as an on-theme, redaction-honest summary; the native
[trace explorer](/concepts/observability-model/) gives you the full span tree with a timing waterfall,
no separate login. This is the same [observability](/guides/observability-and-tracing/) a framework
agent gets for free, surfaced right where you ran the agent.

## Where to go next

- To iterate on the agent conversationally — describe, generate, **test inline**, refine by chat, then
  publish — the console's **draft** authoring flow lets you test a real deployed agent before you
  commit it.
- To do the same thing scriptably or in CI, the [YAML quickstart](/getting-started/quickstart/) and the
  [CLI](/reference/cli/) cover `agent.yaml` + `kubectl apply`.
- To develop locally with zero cloud, see [Local development](/getting-started/local-dev/).

## See also

- [Introduction](/getting-started/introduction/) · [Quickstart (YAML)](/getting-started/quickstart/) · [Local development](/getting-started/local-dev/)
- [Connect a model provider](/guides/connect-a-model-provider/) · [Deploy an agent](/guides/deploy-an-agent/) · [Tools & MCP](/guides/tools-and-mcp/)
- [Runs & execution](/concepts/runs-and-execution/) · [Identity](/concepts/identity/) · [Observability & tracing](/guides/observability-and-tracing/)
