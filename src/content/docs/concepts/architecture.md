---
title: Architecture
description: How the ctxmesh control plane, gateway, and launcher fit together.
sidebar:
  order: 1
---

ctxmesh is a Kubernetes operator plus a small control plane. You interact with it through
**custom resources**; the platform reconciles them into running, governed, observable agents.

## The pieces

- **Custom resources (the API)** — `AgentDeployment` and its companions (`GuardrailPolicy`,
  `ApprovalPolicy`, `FeedbackStore`, `EvalSuite`, `ModelRoute`, and more) are the declarative
  surface. You `kubectl apply` intent; the controller makes it real.
- **Controller** — reconciles the resources: it builds serving revisions, wires model routing,
  resolves policy references, runs the eval gate, and drives progressive rollout.
- **Gateway** — the model-traffic plane. It routes calls to providers, enforces per-tenant and
  per-conversation **budgets**, and applies rate limits — so scaling out never breaches an org's
  provider limits.
- **Launcher** — a sidecar/base-image component in every agent pod. It exposes a language-agnostic
  localhost contract (memory, tools, feedback, telemetry), **enforces content guardrails** on the
  request/response path, and emits the deep trace — so agents get the full platform contract
  whether or not they use an SDK.
- **Console** — the operator surface: agents, runs and traces, cost, approvals, and governance
  policies.

## The execution models

An agent runs under one of three execution models, and rollout adapts to each:

- **serving** — a request/response service (Knative), rolled out with a traffic-split canary.
- **eventing** — an event-consumer, rolled out with a shadow consumer group.
- **job** — batch runs, rolled out by scoring version-pinned runs on a sample.

## The golden path

1. You describe an `AgentDeployment` (optionally referencing guardrail, approval, eval, and
   feedback policies).
2. The controller reconciles it — resolving policies, gating on the `EvalSuite` if present, and
   creating the serving revision.
3. The launcher enforces guardrails and traces every turn; the gateway routes model calls under
   budget.
4. Feedback and online scores flow back and can gate the **next** release (canary auto-progression
   or auto-rollback).

Next: the [custom resources](/concepts/custom-resources/) that make up the API.
