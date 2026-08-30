---
title: RBAC & personas
description: "How access works — caller-scoped console, built-in personas, per-namespace binding."
sidebar:
  order: 3
---

Access in ctxmesh is standard Kubernetes RBAC. There is no separate app-level permission system to
learn or to drift out of sync — if you can't `get` an `AgentDeployment` with your kubeconfig, you
can't see it in the console either.

## Caller-scoped console

The console/BFF is **caller-scoped**: it performs reads and writes with *your* identity, not a
privileged service account. Two operators open the same console and see different agents, runs, and
namespaces — exactly what their RBAC grants. This is the core of the [security posture](/operations/security-posture/):
the platform never elevates on your behalf.

## Built-in personas

The chart ships ClusterRoles for common personas; bind them per namespace (a `RoleBinding`) to scope
who can do what where:

| Persona | Can |
|---------|-----|
| **Operator** | Full agent lifecycle + governance in bound namespaces (create/update/delete agents and policies, promote/rollback). |
| **Developer** | Author + deploy agents and iterate; read runs/traces/cost. |
| **Viewer** | Read-only: agents, runs, traces, cost, audit. |

```bash
# Grant a developer access to one namespace.
kubectl create rolebinding alice-dev \
  --clusterrole=ctxmesh-developer \
  --user=alice@example.com \
  --namespace=my-team
```

(Exact ClusterRole names are confirmed at install; `helm show` lists them.)

## Approvers

Approval authority is layered on RBAC, not instead of it: an [`ApprovalPolicy`](/guides/approvals/)'s
`approvers` set **narrows** who may approve a paused run, AND-ed with the resume RBAC — it can never
grant approval rights to someone who lacks RBAC.

## Agent identity

Each agent runs under its own controller-minted ServiceAccount (least privilege). Tool access and
memory use per-run **on-behalf-of** capabilities carrying the caller's verified identity, so access is
scoped per user where configured — see [Identity](/concepts/identity/).

## See also

[Security posture](/operations/security-posture/) · [Approvals](/guides/approvals/) · [Audit](/operations/audit/)
