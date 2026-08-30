---
title: Concepts in 2 minutes
description: "The six ideas you need to hold to understand ctxmesh."
sidebar:
  order: 4
---

Six ideas. Hold these and the rest of the docs will make sense.

## 1. An agent is a custom resource

You don't wire up a deployment, a service, autoscaling, tracing, and model access by hand. You
write one [`AgentDeployment`](/reference/crd/agentdeployment/) and the controller reconciles all of
that into a running, autoscaled, observable service.

## 2. The launcher is the platform contract

Every agent pod runs a **launcher** (PID 1, from the base image). It exposes a language-agnostic
localhost plane — memory, tools, feedback, telemetry — and **enforces guardrails** on the
request/response path. Because the contract is the launcher, agents get the full platform
(deep traces, memory, guardrails) **whether or not they use an SDK**. The SDK is optional typed sugar.

## 3. Everything talks to models through the gateway

Agents never call providers directly and never hold provider keys. The controller injects a
`MODEL_GATEWAY_URL`; the agent calls it with `model="<alias>"`. A [`ModelRoute`](/reference/crd/modelroute/)
(whose **name is the alias**) maps that alias to a provider + fallback + rate budget, pulling the
key from a [`SecretBinding`](/reference/crd/secretbinding/). Swap providers by editing the route — no
agent change.

## 4. Governance is by reference, and fails closed

Content rules, human approvals, feedback, and eval gates are **separate resources** an agent opts
into by reference (`guardrailPolicyRef`, `approvalPolicyRef`, …). Author a policy once, reuse it. A
dangling or invalid reference **holds the agent** (`Ready=False`) rather than serving it ungoverned.

## 5. Runs are first-class

Every invocation is a durable **run** with a state machine, streamed events, and a full trace: the
step → tool → model causal tree, cost, and any guardrail/approval decisions. You inspect runs in the
console; nothing is a black box.

## 6. Releases are eval-gated

A new prompt, model, or image becomes an immutable [`AgentVersion`](/reference/crd/agentversion/). An
[`EvalSuite`](/reference/crd/evalsuite/) can gate promotion; a **canary** serves a candidate on a
traffic split and can auto-progress (or roll back) on the online score. You ship changes the way you
ship any production software.

---

Ready to see it run? → [Quickstart](/getting-started/quickstart/). Want the full picture? →
[Architecture](/concepts/architecture/).
