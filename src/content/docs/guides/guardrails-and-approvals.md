---
title: Guardrails & approvals
description: Govern what an agent can say and do — content guardrails and human-in-the-loop approval.
sidebar:
  order: 1
---

Two governance layers you can attach to any agent by reference: **guardrails** (what it may say)
and **approvals** (what it may do without a human).

## Content guardrails

A `GuardrailPolicy` governs the agent's content on the request/response path, enforced in-pod by
the launcher (fail-closed by default):

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: GuardrailPolicy
metadata:
  name: default-guardrails
  namespace: my-team
spec:
  piiDetectors:
    builtIns: true            # email / SSN / key detectors, redacted
  patternDenylist:
    - name: internal-codename
      pattern: 'sk-[A-Za-z0-9]{20}'
      action: block
  failMode: closed            # deny if the guardrail engine can't run
```

Attach it: set `spec.guardrailPolicyRef: default-guardrails` on the agent. Guardrail decisions are
traced and auditable. Guarded agents are buffered by default; a policy can opt into **streaming**
when it is provably stream-safe, and the effective mode is reported on the policy's status.

## Human-in-the-loop approvals

An `ApprovalPolicy` declares which tool calls require a human to sign off, and who may approve:

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ApprovalPolicy
metadata:
  name: sensitive-tools
  namespace: my-team
spec:
  rules:
    - tools: ["delete_record", "issue_refund"]
  approvers:
    - kind: Group
      name: sre-oncall
```

Attach it with `spec.approvalPolicyRef: sensitive-tools`. When the agent tries a gated tool, the
run **pauses** in a requires-action state; a designated approver resumes it, and only then does the
tool call proceed. The approver check is enforced server-side against the caller's real identity.

## What you see

Every block, redaction, and approval is correlated to the run's trace and surfaced in the console —
so governance is observable, not a black box.
