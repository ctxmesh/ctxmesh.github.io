---
title: Installation
description: "Install the ctxmesh platform on a Kubernetes cluster."
sidebar:
  order: 2
---

## Prerequisites

<!-- ctxmesh:prerequisites kubernetes>=1.29 knative-serving -->
- A Kubernetes cluster. ctxmesh itself needs **1.29 or newer** (the chart enforces it); your
  Knative Serving release may need newer.
- **Knative Serving.** Agents run as Knative Services, so this is the one add-on the default
  install needs.
- **Knative Eventing** — *only* if you use `executionModel: eventing`. The default
  (`serving`) and `job` agents need nothing from it, and the control plane starts and runs
  normally on a cluster without it. Install it when you want event-driven agents, then restart
  the ctxmesh controller so it picks the capability up; until then an eventing agent fails
  explicitly and tells you this.
- **KEDA** — *only* for queue-depth or custom-metric scaling (`AgentScalingPolicy`).
- Helm 3.8 or newer.
- Access to at least one model provider, or the bundled mock provider for local development.

The data plane (PostgreSQL, an object store, Valkey and NATS) is bundled for development and trial
installs; production installs bring their own.

## Install (overview)

ctxmesh installs as a set of custom resource definitions plus a control plane (a controller, a
gateway, and a console/BFF), delivered as a Helm chart:

```bash
helm install ctxmesh oci://ghcr.io/ctxmesh/charts/ctxmesh \
  --version 0.1.0-beta.8 \
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

:::note[Hardening the namespace]
The chart does not create or own the install namespace — `--create-namespace` does, which is what
keeps `helm uninstall` from ever deleting it (and the platform's PersistentVolumeClaims with it).
That also means the namespace carries no Pod Security Admission labels. Every control-plane
workload already sets `runAsNonRoot`, `allowPrivilegeEscalation: false`, dropped capabilities and a
seccomp profile in its own pod spec, so this is defence in depth rather than the control — but if
you want the namespace-level guard too:

```bash
kubectl label namespace ctxmesh   pod-security.kubernetes.io/enforce=baseline   pod-security.kubernetes.io/warn=restricted   pod-security.kubernetes.io/audit=restricted
```

`baseline` rather than `restricted` because the optional dev data plane (the bundled PostgreSQL and
object store, off by default in production installs) is not yet restricted-clean.
:::

The chart is an **OCI artifact on GHCR** — there is no `helm repo add` step, and Helm 3.8+
pulls `oci://` references natively. `--version` is the chart version; the images it
references carry the matching `appVersion`, so an install is reproducible from that one
number. See [compatibility](/reference/compatibility/) for which SDK goes with it.

On a fresh local cluster, measured runs took **7 to 18 minutes** from an empty cluster to a running
agent (typically 7 to 11), most of it pulling images.

## Sign in to the console

```bash
kubectl -n ctxmesh port-forward svc/ctxmesh-bff 9090:9090   # then open http://localhost:9090/
```

The console signs you in with a Kubernetes bearer token and acts with that identity's RBAC. To make
one for a namespace you will build agents in (`default` here), bind the chart's developer role to a
ServiceAccount and ask for a token:

```bash
kubectl -n default create serviceaccount ctxmesh-builder
kubectl -n default create rolebinding ctxmesh-builder --clusterrole=ctxmesh-developer --serviceaccount=default:ctxmesh-builder
kubectl -n default create token ctxmesh-builder --duration=8h
```

Paste the token into the console's sign-in. The same token reaches an agent through the control
plane, which is the path that mints the run's capability and records the run:

```bash
curl -s -X POST http://localhost:9090/api/invoke -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"agent":"my-agent","namespace":"default","input":"hello"}'
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
