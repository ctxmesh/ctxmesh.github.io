---
title: Installation
description: "Install the ctxmesh platform on a Kubernetes cluster."
sidebar:
  order: 2
---

:::note[Docs in progress]
ctxmesh is under active development ahead of general availability. Installation instructions and
version-pinned artifacts are published here as they are released. This page describes the intended
shape; exact commands and chart coordinates land with the first public release.
:::

## Prerequisites

- A Kubernetes cluster (v1.31+).
- Knative Serving (for the serving execution model).
- An object store and Postgres for control-plane state (bundled options are provided for
  development).
- Access to at least one model provider, or the bundled mock provider for local development.

## Install (overview)

ctxmesh installs as a set of custom resource definitions plus a control plane (a controller, a
gateway, and a console/BFF), delivered as a Helm chart:

```bash
# Illustrative — real coordinates published at release.
helm repo add ctxmesh https://charts.ctxmesh.ai
helm install ctxmesh ctxmesh/agent-engine --namespace ctxmesh-system --create-namespace
```

The install brings up:

- the **CRDs** (`AgentDeployment`, `GuardrailPolicy`, `ApprovalPolicy`, `FeedbackStore`,
  `EvalSuite`, and more);
- the **controller** that reconciles them;
- the **gateway** that routes model traffic and enforces budgets;
- the **console** for operating agents (runs, traces, cost, approvals, governance).

## Local development

A single-command local loop (a bundled launcher + mock model provider) lets you build and test an
agent without a cloud provider. See the [Quickstart](/getting-started/quickstart/).
