---
title: Introduction
description: What ctxmesh is, who it's for, and the problem it solves.
sidebar:
  order: 1
---

**ctxmesh** is a Kubernetes-native platform for building, governing, and operating AI agents at
scale. You describe an agent declaratively as a Kubernetes custom resource, and the platform
provides the production substance around it: serving and autoscaling, model routing and cost
governance, content guardrails, human-in-the-loop approvals, eval-gated rollout, feedback
capture, and deep tracing.

## Why ctxmesh

Getting an agent to *work* is a prototype. Getting it to run **safely, observably, and
repeatably in production** is the hard part — and it is mostly operational: which model, at what
cost ceiling; what the agent is allowed to say and do; who signs off on a risky tool call; how a
new prompt or model is proven before it serves real traffic; and how you see what actually
happened. ctxmesh makes those concerns first-class and declarative, instead of bespoke glue per
team.

## What you get

- **Agents as custom resources** — an `AgentDeployment` captures the image, model route, tools,
  memory, and scaling in one spec; the platform reconciles it into a running, autoscaled service.
- **Governance** — `GuardrailPolicy` (PII redaction, pattern denylists, an optional LLM judge),
  a declarative `ApprovalPolicy` for gating tool calls on human approval, and per-tenant budgets
  — all enforced fail-closed.
- **Quality & rollout** — an `EvalSuite` gates promotion; a canary serves a candidate on a
  traffic split and can auto-progress (or roll back) on the online score.
- **Observability** — the step → tool → model causal tree, cost, and feedback, correlated to
  traces, without you instrumenting your code.
- **Multi-tenancy** — namespaced isolation and RBAC-scoped access, following standard operator
  conventions.

## Who it's for

Platform and ML-platform teams who already run Kubernetes and want to offer agents to their
organization with the same rigor they apply to any other production workload.

## Next

- [Installation](/getting-started/installation/) — get the platform running on a cluster.
- [Quickstart](/getting-started/quickstart/) — deploy and talk to your first agent.
- [Architecture](/concepts/architecture/) — how the pieces fit together.
