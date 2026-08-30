---
title: Workflows
description: "Author a Workflow graph — CEL bindings, branch / loop / map control flow, and typed error routing — evaluated deterministically."
---

**Goal:** author a declarative, durable graph of agent invocations whose routing is computed
deterministically from prior node outputs — not chosen by a model.

**Prerequisites:** the platform installed; an [`AgentRegistry`](/reference/crd/agentregistry/) whose
members include every agent your steps invoke; each of those agents already
[deployed](/guides/deploy-an-agent/).

## How a workflow works

A `Workflow` is a graph of **steps** (`spec.steps[]`). Each step invokes a standing
[`AgentDeployment`](/reference/crd/agentdeployment/) as a **sub-run**, binds its inputs from prior outputs
via **CEL**, declares a typed **`outputSchema`**, and points to the next step with exactly one control-flow
construct: `next` (linear), `branches` (conditional), `map` (fan-out), or `loop`. Routing is
**evaluated deterministically in Go, never by a model** — the author fixed the graph at authoring time.

Because a node is a real agent run, structured outputs and guardrails apply per node with no extra config.
Like a team, `spec.registryRef` is the **trust boundary**: every step's `agentRef` must be a member of it.

The controller **validates** the graph — structure, CEL compilation, registry membership, and the
load-bearing rule below — and reports `Validated`/`Invalid` on `status`. It does **no execution**; a
workflow *instance* is a durable Run (`workflowRef` + a pinned spec snapshot) run by the executor.

:::note[The load-bearing rule]
A step whose output is referenced by another step's `when` / `input` / `map.over` **MUST** pin an
`outputSchema` — CEL over a typed object is a workflow language; over free text it isn't. Validation fails
(`Validated=False`) if a referenced step has no schema.
:::

## 1. Author the graph

This flow classifies a message, branches to a specialist, and routes failures to a fallback handler with a
typed `catch`. The `classify` step pins an `outputSchema` because a `branches` `when` reads its output.

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: Workflow
metadata:
  name: support-flow
  namespace: my-team
spec:
  registryRef: support             # the trust boundary — every agentRef must be a member
  inputSchema:                     # types the `input` CEL variable (optional)
    type: object
    properties:
      message: { type: string }
  steps:
    - name: classify               # first step = the default start
      agentRef: triage-agent
      input:
        message: input.message
      outputSchema:                # REQUIRED: its output is referenced below
        type: object
        properties:
          topic: { type: string }
      branches:
        - when: steps.classify.output.topic == "billing"
          to: billing
      default: general             # fallthrough when no branch matches
    - name: billing
      agentRef: billing-agent
      input:
        topic: steps.classify.output.topic
      catch:                       # typed error routing (first match wins)
        - errors: ["tool_error", "timeout"]
          next: fallback
    - name: general
      agentRef: answer-agent
    - name: fallback
      agentRef: human-handoff-agent
  budget:
    maxTotalSpawns: 20             # total node launches (reuses the SpawnBudget shape)
```

Apply it:

```bash
kubectl apply -f support-flow.yaml
```

## 2. Watch it validate

```bash
kubectl get workflow support-flow -n my-team -w
kubectl get workflow support-flow -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Validated")].status}{"\n"}'
# → True   (graph sound, all CEL compiles, referenced steps have outputSchema, members resolve)
```

`Validated=True` means the graph is structurally sound, every CEL expression compiles, every referenced
step pins an `outputSchema`, and `registryRef` + every `agentRef` resolve to registry members.
`status.specHash` is the hash of the validated spec (the executor pins it at instance creation).

## 3. Control flow

Each step sets **exactly one** construct (controller-validated):

- **`next: <step>`** — unconditional edge; `""` (or omitted) is terminal.
- **`branches: [{when: <CEL>, to: <step>}]` + `default`** — ordered conditional edges, first matching
  `when` wins; `default` is the fallthrough.
- **`map: {over, as, do, parallelism, join, completion}`** — fan out over a CEL list (`over`), bind each
  element to `as`, run step `do` per element (up to `parallelism` concurrently), optionally reduce via
  `join`. `completion: all` (default) collects every item on success and fails fast on the first failure;
  `completion: any` returns the first successful item and fails only if all items fail.
- **`loop: {until, maxIterations, do}`** — repeat `do` until the CEL predicate `until` is true, capped at
  `maxIterations` (**required** — no Turing-completeness by construction).

**Typed error routing.** When a step's sub-run fails after exhausting `retries`, a `catch` list routes it by
its **classified failure code** — the closed vocabulary `timeout`, `cancelled`, `budget_exceeded`,
`guardrail_denied`, `tool_error`, `agent_error`, `platform_error`, or `"*"` (catch-all). Catchers are
ordered, first match wins; the handler binds the failure as the `error` CEL variable (`{node, message,
type}` — route on `error.type`, never the free-text message). The shorthand `onError: <step>` is sugar for
`catch: [{errors: ["*"], next: <step>}]`. No matching catcher ⇒ the workflow fail-fasts. `catch`/`onError`
are **not** supported on `map`/`loop` nodes.

## When to use / when not

- **Use** for a fixed, auditable process — branching, retries, typed error handling, fan-out/reduce — where
  the routing must be reproducible and independent of model judgment.
- **Use** an [`AgentTeam`](/guides/multi-agent-teams/) instead for open-ended, **model-chosen** delegation.
- **Not** for container steps, cron jobs, or arbitrary code — nodes are **agents**, not scripts.

## Defaults

- `map.parallelism` defaults to **1** (bounded fan-out; the spawn budget backstops the total).
- `loop.maxIterations` is **required** (minimum 1) — there is no default and no unbounded loop.
- `retries` defaults to `0`; `map.completion` defaults to `all`.
- `spec.budget` reuses the `SpawnBudget` shape (`maxFanOut`/`maxSpawnDepth`/`maxTotalSpawns`); a nil block
  resolves to defaults. `steps` requires at least one entry (max 128); the first step is the default start.

:::note[Validated vs executed]
The full graph vocabulary is **validated** in v1; `map`, `loop`, and per-node `retries` execute in the
v1b executor. Specifics finalize toward GA — the CRD shape above is authoritative; consult the
[Workflow reference](/reference/crd/workflow/) for exhaustive field detail.
:::

## Failure modes

- **`Validated=False` (Invalid)** — the graph is malformed: a CEL expression doesn't compile, a referenced
  step lacks an `outputSchema` (the load-bearing rule), a step references a non-existent step, a step sets
  more than one control-flow construct, or `registryRef`/an `agentRef` isn't a registry member. The
  condition message names the fault. The workflow will not run until it validates.
- **A node sub-run fails** — retries first (up to `retries`); then a matching `catch`/`onError` routes to a
  handler; with no match the workflow **fail-fasts** and cancel-cascades its non-terminal children.
- **Unresolvable node endpoint at create** — the instance fails fast at creation rather than minting a run
  that silently stalls.

## See also

- [Workflow reference](/reference/crd/workflow/) · [AgentRegistry reference](/reference/crd/agentregistry/) ·
  [AgentDeployment reference](/reference/crd/agentdeployment/)
- [Multi-agent teams](/guides/multi-agent-teams/) · [Multi-agent](/concepts/multi-agent/) ·
  [Runs & execution](/concepts/runs-and-execution/)
