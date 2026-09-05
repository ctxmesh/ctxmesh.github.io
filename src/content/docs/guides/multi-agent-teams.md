---
title: Multi-agent teams
description: "AgentTeam: a supervisor that delegates to a governed roster of sub-agents via delegate_to, bounded by a spawn budget."
---

:::note[AMP is not Google's A2A]
**AMP** is ctxmesh's own call surface between agents *the platform already owns*: an agent never
dials another agent, it asks its own launcher, which stamps identity, enforces registry isolation
and trips the guards. Google's **Agent2Agent (A2A)** is an *interop* protocol — Agent Cards,
JSON-RPC, a task lifecycle — for agents run by different parties. Different problems; ctxmesh
implements none of A2A. The surface was called A2A until [M164](/reference/); the old header
`X-A2A-Envelope` and path `/a2a/{target}` are still accepted.
:::


**Goal:** stand up a supervisor agent that summons a governed roster of sub-agents on demand — each
delegation runs as a durable sub-run under the invoking user's identity.

**Prerequisites:** the platform installed; an [`AgentRegistry`](/reference/crd/agentregistry/) whose
members include your supervisor and every roster agent; each of those agents already
[deployed](/guides/deploy-an-agent/) and `Ready`. The supervisor's `spec.role` should be `orchestrator`.

## How a team works

An `AgentTeam` is three things: a **supervisor** (the orchestrating agent), a **roster** (a governed set
of summonable sub-agents), and a **spawn budget** (the ceiling on delegation). At runtime the supervisor's
model calls the injected **`delegate_to`** tool — the platform starts the chosen roster member as a durable
**sub-run** that inherits the invoking user's on-behalf-of grant (no re-consent), the conversation, and the
trace. The supervisor **suspends** while its delegations run (holding no worker slot) and resumes when they
finish. Every roster member is a *standing* `AgentDeployment` — you deploy and govern each one normally; the
team just makes them summonable.

**`registryRef` is the trust boundary.** The team *references* (never generates) an `AgentRegistry`. The
supervisor and every roster member **must** be members of it — that same registry scopes the sub-runs' OBO,
the NetworkPolicy, and shared memory. A member that isn't in the registry holds the team `Ready=False`.

## 1. Author the team

The minimum is a `registryRef`, a supervisor, and at least one roster entry. Each roster entry has a
roster-local `name` (what the supervisor summons), an `agentRef` (the standing agent it runs), and an
optional `description` surfaced to the supervisor's model so it can choose whom to delegate to.

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentTeam
metadata:
  name: support-team
  namespace: my-team
spec:
  registryRef: support            # the trust boundary — an existing AgentRegistry
  supervisor:
    agentRef: triage-agent        # role: orchestrator; a member of `support`
  roster:
    - name: billing
      agentRef: billing-agent
      description: Invoices, refunds, and payment questions.
    - name: technical
      agentRef: tech-agent
      description: Product troubleshooting and how-to.
  spawnBudget:
    maxFanOut: 4                   # sub-runs one supervisor step may start
    maxSpawnDepth: 3              # supervisor → sub-agent → … depth
    maxTotalSpawns: 20           # sub-runs across the whole spawn tree
```

Apply it:

```bash
kubectl apply -f support-team.yaml
```

## 2. Watch it resolve

The controller validates the supervisor and every roster member against `registryRef`, then reports
readiness and the resolved members:

```bash
kubectl get agentteam support-team -n my-team -w
# Ready transitions to True once every member resolves and is a registry member.
kubectl get agentteam support-team -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status} {.status.members}{"\n"}'
# → True   [triage-agent billing-agent tech-agent]
```

`Ready=True` means `registryRef`, the supervisor, and every roster member resolved **and** all are
members of the registry. `status.members` lists them.

## 3. Delegate at runtime

When the supervisor is a team supervisor, the controller injects the synthetic **`delegate_to`** tool.
The supervisor's model calls it by the roster `name`:

```text
delegate_to(sub_agent="billing", task="Refund the duplicate charge on invoice INV-4021.")
```

The platform starts `billing-agent` as a durable sub-run — inheriting the caller's OBO, the conversation,
and the trace — and returns its terminal result to the supervisor as the tool result. Open the run in the
console to see the spawn tree: the supervisor run with each delegation nested beneath it, each a real agent
run with its own steps, tools, model calls, and cost. Bounded parallel fan-out runs concurrent
`delegate_to` calls in one step, admitting up to `maxFanOut` and denying the rest fail-closed.

## When to use / when not

- **Use** for open-ended, **model-chosen** delegation — the supervisor decides *at runtime* which
  specialist to summon based on the request.
- **Use** a [`Workflow`](/guides/workflows/) instead when the routing is fixed and you want it evaluated
  **deterministically** (author decides the graph, not the model).
- **Not** for a single-loop agent with no delegation — just [deploy the agent](/guides/deploy-an-agent/).

## Defaults

- `spawnBudget` defaults to `maxFanOut: 4`, `maxSpawnDepth: 3`, `maxTotalSpawns: 20`. A nil block resolves
  to all three defaults.
- `maxFanOut` + `maxTotalSpawns` are **aggregate** ceilings enforced fail-closed across the whole spawn
  tree; `maxSpawnDepth` bounds the tree depth (distinct from AMP hop depth).
- Platform ceilings clamp any client-supplied budget (fan-out 128 / depth 32 / total 1024) so a
  compromised pod can't request an unbounded budget — these kill abuse, not legitimate config.
- `roster` requires at least one entry (max 64); `name` and `agentRef` are DNS labels (1–63 chars).

## Failure modes

Roster validation is **fail-closed** — a team with an unresolvable member is held `Ready=False` rather than
serving a broken roster. The `Ready` condition carries the reason:

- **`RegistryNotFound`** — `registryRef` names an `AgentRegistry` that doesn't exist. Create it (or fix the
  name), and make the supervisor + roster agents members.
- **`MemberNotFound`** — the supervisor or a roster `agentRef` names an `AgentDeployment` that doesn't
  exist in the namespace. Deploy it (or fix the ref).
- **`NotARegistryMember`** — the agent exists but isn't in `registryRef`. Add the registry's member label to
  its `AgentDeployment` (see [AgentRegistry](/reference/crd/agentregistry/)).

At runtime, a **budget denial or a sub-run failure is returned to the supervisor as an honest tool result**
(text the model can act on — try another sub-agent, or answer directly) — never a supervisor crash. If the
spawn-guard store is unreachable, delegation **fails closed** (denied) — a runaway supervisor is a cost and
resource risk.

## See also

- [AgentTeam reference](/reference/crd/agentteam/) · [AgentRegistry reference](/reference/crd/agentregistry/) ·
  [AgentDeployment reference](/reference/crd/agentdeployment/)
- [Workflows](/guides/workflows/) · [Deploy an agent](/guides/deploy-an-agent/) ·
  [Multi-agent](/concepts/multi-agent/)
