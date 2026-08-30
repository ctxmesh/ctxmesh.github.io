---
title: Annotations & labels
description: "The promote / rollback / rollout-abort annotations and the tenant / registry-id / stage labels — the versioned API surface."
---

Some behaviors are driven by **annotations and labels** on ctxmesh resources rather than spec fields.
These are **versioned API surface** — documented and validated like fields, governed by the same
[deprecation policy](/operations/upgrade-and-versioning/#api-versioning--deprecation-policy). This page
is the reference for the operator-facing ones.

All keys are in the `agents.ctxmesh.ai/…` namespace.

## Behavioral annotations (you set these)

These are the human-gated verbs of the rollout/version workflow. You set the annotation; the controller
acts once and (for promote/rollback) **clears it** so it fires exactly once. They are AND-ed with your
RBAC — you must have the RBAC to change the resource.

| Annotation | On | Value | Effect |
|------------|----|----|--------|
| `agents.ctxmesh.ai/promote` | `AgentDeployment` | a version/revision id | Promote that candidate to serving. v1 promotion is **human-gated** — a passing eval score does **not** auto-promote. |
| `agents.ctxmesh.ai/rollback` | `AgentDeployment` | an `AgentVersion` | Roll back to that version. Human-gated; audited. The console's `POST /api/agents/{ns}/{name}/rollback` writes this. |
| `agents.ctxmesh.ai/rollout-abort` | `AgentDeployment` | (set) | Abort an in-flight canary — keep the **old** revision serving without a spec change to the candidate. |

:::note
Auto-progression and (opt-in) auto-rollback exist, but the **manual** promote/rollback/abort annotations
above are the always-available human controls. Auto behaviors are configured on the `AgentDeployment`
spec (`rollout.autoProgress`, `rollout.autoRollback.enabled`), not via these annotations. Folding
promote/abort into spec fields is a `v1`-milestone candidate — until then, these annotations are the
stable surface.
:::

## Labels (you or the controller set these)

| Label | On | Set by | Meaning |
|-------|----|----|---------|
| `agents.ctxmesh.ai/tenant` | namespaces + stamped resources | **controller** | Binds a namespace/resource to its `Tenant`. A **security-critical** boundary — a non-controller principal is forbidden from changing it (the tenant-label webhook, default-on in production). Do not set it by hand. |
| `agents.ctxmesh.ai/registry-id` | member agent pods | **controller** | The stable network identity of an agent's registry (distinct from your `memberSelector`) — the source for the NetworkPolicy podSelector and the shared-memory boundary. Controller-owned. |
| `agents.ctxmesh.ai/stage` | `AgentDeployment` | BFF / you | Marks lifecycle stage; the only value today is `draft` (a draft agent, not yet a live deploy). |

## Controller-managed annotations (informational)

You generally don't set these; they're stamped by the platform and useful to read/debug.

| Annotation | On | Meaning |
|------------|----|---------|
| `agents.ctxmesh.ai/source-spec` | `AgentDeployment` | The simplified `agent.yaml` the deployment was expanded from (round-trips create/edit/detail). |
| `agents.ctxmesh.ai/display-name` | providers / namespaces | Human display name (an annotation, not a label, so it isn't constrained to label syntax). |
| `agents.ctxmesh.ai/launcher-image` | agent revision | The launcher image stamped on the revision for auditability ("which agents run launcher X" is one query). |
| `agent-engine.ctxmesh.ai/config-hash` | gateway pod template | The rendered-config hash — changes only when the rendered gateway config changes, rolling the gateway without spurious restarts. |

The MCP/OAuth flow uses several further `agents.ctxmesh.ai/mcp-*` annotations (URL, auth type, OAuth
endpoints, boundary) on MCP resources — these are internal to the BYO-MCP mechanism and covered under
[Bring your own MCP](/guides/bring-your-own-mcp/); confirm their exact set with `kubectl describe` on the
resource.

## Stability

Per the deprecation policy, the behavioral annotations (`promote`, `rollback`, `rollout-abort`) and the
`tenant` label are **API** — additive-only within a served version, with the same deprecation-notice
period as fields. Controller-managed annotations are implementation surface: read them, don't depend on
them as a contract unless listed as API above.

## See also

- [Upgrade & versioning](/operations/upgrade-and-versioning/)
- [Canary & rollout](/guides/canary-and-rollout/)
- [Tenancy operations](/operations/tenancy-operations/)
- [Multi-agent](/concepts/multi-agent/)
- [API group](/reference/api-group/)
