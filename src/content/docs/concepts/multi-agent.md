---
title: Multi-agent
description: "Registries (isolated mesh), teams and delegate_to, workflows, and handoff — and how they differ."
---

ctxmesh has four multi-agent primitives, and the single most useful thing to understand is *how they
differ* — because they answer different questions. One defines a trust boundary. One lets a
supervisor **decide** who to call at runtime. One lets an author **pre-declare** a deterministic
graph. One **transfers control** of a whole conversation. Reaching for the wrong one is where
multi-agent systems get tangled, so this page is organized around the distinctions.

The through-line: **who chooses what runs next?**

- **A model chooses** → a [team](#agentteam--delegate_to--dynamic-delegation) with `delegate_to`.
- **The graph chooses** (a deterministic evaluation over prior outputs) → a
  [workflow](#workflow--the-declarative-graph).
- **The conversation moves on** → [`handoff_to`](#handoff_to--transfer-of-control).

And underneath all three sits the [registry](#agentregistry--the-isolated-mesh) — the closed,
governed boundary they all operate within.

## AgentRegistry — the isolated mesh

An [`AgentRegistry`](/reference/crd/agentregistry/) is a **closed communication boundary**: a named
group of agents that may talk to each other, and to *no one outside*. It is the trust boundary every
other primitive builds on.

Agents call each other through their own launcher — never directly. The caller's launcher wraps the
payload in a platform-owned **[message envelope](/reference/message-envelope/)** (`traceId`,
`registryId`, `conversationId`, `messageId`, sender/receiver, `role`, `depth`, `path`, `payload`),
resolves the target, and enforces access control *before* forwarding. Three checks gate every hop, all
in the callee's launcher: **registry isolation** (a cross-registry call is denied), **role** (a
within-registry role — `orchestrator` / `worker` / `reviewer` / custom, set via
`AgentDeployment.spec.role`), and a **per-agent allowlist** (`AgentDeployment.spec.allowedCallers` →
`caller_not_allowed`). **Conversation guards** bound the whole exchange: max hop **depth**, **cycle
detection** (revisiting an agent on the path, including self-calls), and a per-conversation **budget**.

Isolation is defense-in-depth: the app-layer checks are backed by a per-registry **NetworkPolicy**
(Calico), so a cross-registry call fails at the network layer too — independent of whether the
launcher check runs (NetworkPolicy, not a service mesh — see
[Architecture](/concepts/architecture/)). Async delivery within a registry adds a per-registry
**dead-letter queue**.

Use a registry whenever more than one agent needs to coordinate. It is the foundation; teams and
workflows *reference* a registry as their boundary.

## AgentTeam + delegate_to — dynamic delegation

An [`AgentTeam`](/reference/crd/agentteam/) gives a **supervisor** agent a roster of summonable
sub-agents and one synthetic tool: `delegate_to(sub_agent, task)`. The supervisor **reasons about
which sub-agent to call** and calls it like any other tool — *sub-agent-as-a-tool* — so your existing
tool loop and trace tree just work. This is **inference-driven** orchestration: the model decides.

Under the hood, a `delegate_to` runs the roster member as a **durable [sub-run](/concepts/runs-and-execution/)**
on the run-worker path (not a new Deployment), carrying spawn lineage (`parentRunId`, `rootRunId`,
`spawnDepth`). Two properties matter:

- **On-behalf-of is inherited, no re-consent.** The sub-run acts as the same end-user with the same
  granted [credential scope](/concepts/security-model/) — the supervisor doesn't re-prompt the human.
- **Spawn is bounded.** The `AgentTeam.spec.spawnBudget` caps **depth**, **fan-out**, and **total**
  spawns across the run tree (a shared, fail-closed counter keyed by the root run), with a tenant quota
  as the hard ceiling above it. A denied spawn returns as honest tool text the model can act on — never
  a crash.

A supervisor awaiting its delegations doesn't hold a worker slot: it **suspends durably** (the run goes
`waiting`) and resumes when the children finish — depth-agnostic, so nested delegation composes.

Use a team when the routing is **dynamic** — a triage agent that inspects a request and delegates to
the right specialist. See [Multi-agent teams](/guides/multi-agent-teams/).

## Workflow — the declarative graph

A [`Workflow`](/reference/crd/workflow/) is a **declarative graph** of agent invocations —
conditional branches, loops, map-reduce fan-out, joins — where the routing is **decided at authoring
time** and computed **deterministically** by the platform. This is **evaluation-driven**, not
inference-driven: the graph is the authority, and **CEL** expressions over prior node outputs choose
the next node.

The key distinction from a team: in a team the *model* picks the next agent; in a workflow the
*graph* does. They nest happily — a workflow node can be an agent that itself delegates.

Mechanically:

- Each **node is a [sub-run](/concepts/runs-and-execution/)** (the same durable primitive teams use),
  so structured outputs, [guardrails](/guides/guardrails/), and tracing apply per node for free. A node
  whose output is referenced by a branch or binding must declare an `outputSchema` — CEL over a typed
  object is a workflow language; CEL over free text is a guessing game.
- The **CRD defines the graph; the instance is a run** — a workflow execution is a durable run (with
  the `waiting` state), not a new custom resource. The executor lives in the run-worker.
- **Typed error routing:** a failed node can `catch` on a *classified failure code* (a closed enum:
  `timeout`, `cancelled`, `budget_exceeded`, `guardrail_denied`, `tool_error`, `agent_error`,
  `platform_error`) and route to a handler, binding the failure as an `error` CEL variable — routing on
  the failure *type*, never a parsed message.
- **Planning mode** lets a planner agent emit a workflow spec inline (its `outputSchema` *is* the
  workflow schema), gated by a human plan-approval pause before it runs.

Use a workflow when the process is **known and deterministic** — a review pipeline, a data DAG,
anything with fixed steps, conditions, and error handling. See [Workflows](/guides/workflows/).

## handoff_to — transfer of control

`handoff_to` is a **conversation** primitive, not a delegation and not a graph edge. It **terminates
agent A's run**, repoints the conversation's active-agent pointer to agent B, and starts B as a **fresh
root run** on the same conversation. It's a baton pass, not a function call.

What makes it distinct: A doesn't wait for B (unlike `delegate_to`), and B isn't the next node in a
graph (unlike a workflow). The run's `agent` field is **immutable** — it's the audit record of who was
in control — and on-behalf-of is **re-minted for the conversation owner against B's boundary**, not
transferred as a capability. Optionally, `handoff_to(include_history=false)` hands off with a *summary*
so B skips replaying the full history on the transfer turn.

Use a handoff when a conversation should **move to a different agent** — a generalist that passes a
user to a domain specialist mid-conversation.

## The trace tree

All of this is legible as **one trace tree**: a root run's `agent.invoke` span nests its children's
spans via [W3C context propagation](/concepts/observability-model/), following the spawn lineage
(`parentRunId` / `rootRunId` / `spawnDepth`). A delegated sub-run and a workflow node both appear as
child spans; a handoff opens a new root on the same conversation, preserved in the lineage for audit.

## See also

- [Runs & execution](/concepts/runs-and-execution/) — sub-runs, the `waiting` state, lineage
- [Security model](/concepts/security-model/) — inherited on-behalf-of, spawn budgets fail-closed
- [Observability model](/concepts/observability-model/) — the multi-agent trace tree
- [Multi-agent teams](/guides/multi-agent-teams/) · [Workflows](/guides/workflows/) · [Share a run](/guides/share-a-run/)
- [AgentRegistry](/reference/crd/agentregistry/) · [AgentTeam](/reference/crd/agentteam/) · [Workflow](/reference/crd/workflow/) · [Message envelope](/reference/message-envelope/)
