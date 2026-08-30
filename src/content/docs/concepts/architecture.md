---
title: Architecture
description: "The control plane, data plane, and state plane — and how a request flows through them."
sidebar:
  order: 1
---

ctxmesh is a Kubernetes operator plus a small control plane. You interact with it through
[custom resources](/concepts/custom-resources/); the platform reconciles them into running,
governed, observable agents. It **integrates** proven infrastructure (Knative, KEDA, LiteLLM, an
OTLP pipeline) rather than reinventing it, and adds the CRD surface, the governance, and the
deploy-gate orchestration on top.

## Three planes

```
            ┌──────────────────────── Control plane ────────────────────────┐
            │  Controller (operator)   Gateway (LiteLLM)   Console / BFF     │
            └───────┬───────────────────────┬───────────────────┬───────────┘
   kubectl / API    │ reconciles            │ routes model I/O  │ caller-scoped reads
   ────────────────►│                       │                   │
            ┌────────▼──────── Data plane (your agents) ─────────▼───────────┐
            │   Agent pod:  [ launcher (PID 1) ] ── [ your agent container ] │
            │   guardrails · tools · memory · feedback · deep tracing        │
            └───────────────────────────┬───────────────────────────────────┘
                                         │
            ┌────────────────────── State plane ────────────────────────────┐
            │  Postgres (control-plane state)   Object store   State Layer   │
            │  runs / versions / datasets       (blobs)        (Valkey mem)  │
            └───────────────────────────────────────────────────────────────┘
```

- **Control plane** — operates the platform. You bring nothing here; it's what the chart installs.
- **Data plane** — your agents. You bring the agent image; the platform brings the launcher + contract.
- **State plane** — durable state (control-plane Postgres, an object store for blobs, and the
  Valkey-based State Layer for session memory). Integrated for dev; **bring your own** for production.

## The components

### Controller (the operator)
Reconciles every custom resource. For an `AgentDeployment` it builds the serving revision, injects the
gateway URL + launcher config, resolves policy references (fail-closed on a dangling ref), runs the
**eval gate**, and drives **progressive rollout** (canary, auto-progression, auto-rollback). It holds
the RBAC to do this; your console never elevates (caller-scoped, see below).

### Gateway (model traffic)
All LLM calls flow through an in-cluster **LiteLLM** gateway. It routes a call's `model` alias to a
provider per its [`ModelRoute`](/reference/crd/modelroute/), applies fallback, and enforces per-tenant
and per-conversation **budgets** and rate limits — so agents never hold provider keys and scaling out
never breaches an org's provider limits.

### Launcher (in every agent pod, PID 1)
The un-forgeable enforcement + contract boundary. It:
- **enforces guardrails** on the request/response path (in-path proxy);
- exposes the **language-agnostic localhost plane** — feedback, memory, knowledge, tools, discovery,
  and an OTLP collector — so agents get the full contract without the SDK;
- emits the **deep trace** (the step → tool → model causal tree) via base-image auto-instrumentation;
- scrubs the environment and brokers on-behalf-of credentials.

See [The launcher contract](/concepts/the-launcher-contract/) and
[Launcher endpoints](/reference/launcher-endpoints/).

### Console / BFF
The operator surface: agents, runs and traces, cost, approvals, and governance. Every read is
**caller-scoped** — the console acts with *your* Kubernetes identity/RBAC, never a privileged service
account (see [Security model](/concepts/security-model/)).

## Execution models

An agent runs under one of three models, and rollout adapts to each:

| Model | Backend | Rollout | Use for |
|-------|---------|---------|---------|
| `serving` | Knative | traffic-split canary | request/response agents (chat, APIs) |
| `eventing` | Knative Eventing / KEDA | shadow consumer group | event-driven / async work |
| `job` | Kubernetes Job | version-pinned sample scoring | batch / offline runs |

## The golden path (a request end to end)

1. You apply an `AgentDeployment` (optionally referencing guardrail / approval / eval / feedback policies).
2. The controller reconciles it — resolving policies, gating on the `EvalSuite` if present, creating the
   serving revision, and injecting the gateway URL + launcher config.
3. A request hits the agent pod. The launcher scans input against the guardrail policy, runs the agent
   turn, brokers tool calls (pausing for approval if the approval policy requires it), routes model
   calls through the gateway under budget, and scans output before releasing it.
4. The whole turn is traced (step → tool → model), and feedback + online scores flow back — which can
   gate the **next** release (canary auto-progression or auto-rollback).

## Design principles

- **Integrate, don't rebuild** — LiteLLM for routing, Knative/KEDA for scaling, an OTLP pipeline for
  tracing; ctxmesh owns the CRD surface, the gate, and the governance.
- **Fail closed** — a missing guardrail, a dangling policy ref, an unrunnable eval gate, or a
  guardrail-engine error denies/holds rather than serving ungoverned.
- **Deep observability without the SDK** — framework spans come from base-image auto-instrumentation;
  the SDK is only for custom, no-framework loops.

Next: [Custom resources](/concepts/custom-resources/) · [The launcher contract](/concepts/the-launcher-contract/) · [Security model](/concepts/security-model/).
