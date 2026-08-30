---
title: ApprovalPolicy
description: Declarative human-in-the-loop — which tool calls require approval and who may approve. Strictly monotonic (only adds requirements).
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `ApprovalPolicy` · Scope: Namespaced · shortName: `apr`

## Overview

An `ApprovalPolicy` is a namespaced, reusable human-in-the-loop policy referenced by
`AgentDeployment.spec.approvalPolicyRef`. It declaratively requires human approval for named tool
calls and optionally narrows **who** may approve. Enforcement point: the **controller** merges the
policy's requirements into the agent's effective tool policy (reusing the existing
pause/resume/voucher runtime); the run pauses at a gated tool call until an approver signs off. The
headline guarantee is that it is **strictly monotonic** — it can only *add* approval requirements
under a max-strictness merge (`allow < require-approval < deny`), so an inline `toolPolicy` can never
weaken a requirement the policy demands. A **dangling ref sets `Ready=False`** on the agent.

An `ApprovalPolicy` carries *only* approval requirements — never allow/deny (that is `ToolPolicy`'s
job). v1 is tool-scoped.

## When to use / when not

- **Use** to require sign-off before an agent runs sensitive tools (refunds, deletions, sends).
- **Use** `approvers` to restrict approval to specific users/groups (AND-ed with RBAC).
- **Not** for allow/deny of tools — use `AgentDeployment.spec.runtime.toolPolicy` for that.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.rules` | []object | **Yes** | — | Select which tool calls require approval (union across rules). MinItems 1, MaxItems 64. Each rule must set `tools` or `allTools`. |
| `spec.rules[].tools` | []string | Conditional | — | Exact tool names whose calls require approval (no globs). Union across rules. Max 128 (list-set). Set this **or** `allTools`. |
| `spec.rules[].allTools` | bool | Conditional | `false` | Require approval for **every** tool the agent may call (a coarse gate). Set this **or** `tools`. |
| `spec.approvers` | []object | No | — | Narrow who may approve to these subjects, **AND-ed with RBAC** (a resume caller must hold resume RBAC AND match an entry). Empty ⇒ any caller with resume RBAC may approve. Max 64. |
| `spec.approvers[].kind` | string (enum) | **Yes** (per item) | — | `User` (a K8s username) or `Group` (a K8s group). |
| `spec.approvers[].name` | string | **Yes** (per item) | — | The username or group name matched against the caller's verified identity (from a SelfSubjectReview — never a client claim). 1–316 chars. |

### Validation rules (admission, CEL)

- Each rule must set `tools` or `allTools` (a rule that gates nothing is rejected).

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.conditions` | []Condition | Reconciliation state. `Validated=True` when the spec is coherent; `Validated=False` (reason varies) when a rule gates nothing. |

## Examples

### Minimal — approval on named tools

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ApprovalPolicy
metadata:
  name: sensitive-tools
  namespace: my-team
spec:
  rules:
    - tools:
        - issue_refund
        - delete_account
```

### Fuller — all tools, restricted approvers

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ApprovalPolicy
metadata:
  name: high-risk
  namespace: my-team
spec:
  rules:
    - allTools: true
  approvers:
    - kind: Group
      name: sre-oncall
    - kind: User
      name: alice@example.com
```

Reference it from an agent with `spec.approvalPolicyRef: sensitive-tools`. A ServiceAccount approver
works via its string forms (User `system:serviceaccount:<ns>:<name>` / Group
`system:serviceaccounts:<ns>`).

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Guide: [Guardrails and approvals](/guides/guardrails/)
- Related: [GuardrailPolicy](/reference/crd/guardrailpolicy/) · [AgentDeployment](/reference/crd/agentdeployment/)
  (see `spec.runtime.toolPolicy` for allow/deny)
