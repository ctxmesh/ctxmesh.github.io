---
title: Approvals
description: "Require a human to sign off on risky tool calls — declaratively, by reference."
sidebar:
  order: 4
---

**Goal:** gate specific tool calls on a human approval, and control who may approve.

**Prerequisites:** an agent that uses tools ([Tools & MCP](/guides/tools-and-mcp/)).

## What an ApprovalPolicy does

An [`ApprovalPolicy`](/reference/crd/approvalpolicy/) declares which tool calls require a human to sign
off and who may approve. When the agent tries a gated tool, its run **pauses** in a
`requires_action` state; a designated approver resumes it, and only then does the tool call proceed.
The approver check is enforced **server-side against the caller's real identity** (not a client claim)
and is AND-ed with RBAC — the policy narrows *who* may approve, never widens it.

## 1. Author the policy

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ApprovalPolicy
metadata:
  name: sensitive-tools
  namespace: my-team
spec:
  rules:
    - tools: ["delete_record", "issue_refund"]   # exact tool names
    # - allTools: true                            # or gate every tool the agent may call
  approvers:                                       # optional: narrow who may approve
    - kind: Group
      name: sre-oncall
    - kind: User
      name: alice@example.com
```

If `approvers` is omitted, anyone with resume RBAC on the run may approve.

## 2. Attach it to the agent

```yaml
spec:
  approvalPolicyRef: sensitive-tools
```

The controller merges the require-approval requirements into the agent's effective tool policy at the
sidecar choke point (max-strictness — it can only *add* approval requirements). A dangling ref holds
the agent `Ready=False`.

## 3. The pause / resume flow

1. The agent calls a gated tool → the run pauses (`requires_action`); the tool does **not** run.
2. An approver sees the pending approval (console **Approvals** queue, or `GET /api/approvals`).
3. The approver resumes the run. The server verifies their identity (a `SelfSubjectReview`) against the
   `approvers` set **and** their RBAC, then mints a one-time approval voucher and the tool proceeds.

## When to use / when not

- **Use** for irreversible or high-blast-radius tools (deletes, payments, prod mutations).
- **Don't** gate every tool reflexively — approval friction should match risk. Use `allTools` only for
  genuinely sensitive agents.

## Failure modes

- Policy or caller identity unreadable at resume → the approval is **denied** (fail-closed), never a
  fall-back to RBAC-only.
- A caller not in `approvers` (or lacking resume RBAC) → 403; the run stays paused.

## See also

[ApprovalPolicy reference](/reference/crd/approvalpolicy/) · [Tools & MCP](/guides/tools-and-mcp/) · [Guardrails](/guides/guardrails/)
