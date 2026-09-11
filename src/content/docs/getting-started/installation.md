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
- **Knative Eventing** — required. The controller watches Knative Eventing `Trigger`
  resources at startup, so on a cluster without it the controller cannot start. It is not
  optional even if you never use the eventing execution model.
- An object store and Postgres for control-plane state (bundled options are provided for
  development).
- Access to at least one model provider, or the bundled mock provider for local development.

## Install (overview)

ctxmesh installs as a set of custom resource definitions plus a control plane (a controller, a
gateway, and a console/BFF), delivered as a Helm chart:

```bash
helm install ctxmesh oci://ghcr.io/ctxmesh/charts/ctxmesh \
  --version 0.1.0-beta.3 \
  --namespace ctxmesh --create-namespace \
  --wait --timeout 20m
```

:::caution[Give the first install a real timeout]
`--wait` without `--timeout` uses Helm's **5-minute default**, and a first install does not
meet it: nine images are pulled on a cluster with an empty cache, and the PostgreSQL image
alone can take longer than five minutes. Without the flag the install is reported as failed
while it is in fact still pulling.

The timeout is a ceiling, not a wait — a cluster that already has the images finishes in
well under it.
:::

The chart is an **OCI artifact on GHCR** — there is no `helm repo add` step, and Helm 3.8+
pulls `oci://` references natively. `--version` is the chart version; the images it
references carry the matching `appVersion`, so an install is reproducible from that one
number. See [compatibility](/reference/compatibility/) for which SDK goes with it.

The install brings up:

- the **CRDs** (`AgentDeployment`, `GuardrailPolicy`, `ApprovalPolicy`, `FeedbackStore`,
  `EvalSuite`, and more);
- the **controller** that reconciles them;
- the **gateway** that routes model traffic and enforces budgets;
- the **console** for operating agents (runs, traces, cost, approvals, governance).

## Local development

A single-command local loop (a bundled launcher + mock model provider) lets you build and test an
agent without a cloud provider. See the [Quickstart](/getting-started/quickstart/).
