---
title: Custom resources
description: The custom resources that make up the ctxmesh API.
sidebar:
  order: 2
---

Everything in ctxmesh is a Kubernetes custom resource. You compose an agent and its governance by
referencing policies from the `AgentDeployment` spec.

## Core

| Resource | What it declares |
|----------|------------------|
| **AgentDeployment** | An agent: image, model route, tools, memory, scaling, and references to the policies below. |
| **AgentVersion** | An immutable snapshot of an agent (image + pinned tool/prompt versions) — the unit of rollout. |
| **ModelRoute** | Which model/provider a call resolves to, behind the gateway. |

## Governance

| Resource | What it declares |
|----------|------------------|
| **GuardrailPolicy** | Content governance: PII detectors, pattern denylists, an optional LLM judge, and a fail mode. Enforced by the launcher on input/output. |
| **ApprovalPolicy** | Human-in-the-loop: which tool calls require approval and who may approve them. The run pauses until an approver signs off. |
| **FeedbackStore** | A declarative, multi-source feedback model (human / external) correlated to traces — gating ingestion and attributing each score to its source. |

## Quality & rollout

| Resource | What it declares |
|----------|------------------|
| **EvalSuite** | A dataset + scorers + thresholds that gate a candidate before it serves. |
| **AgentScalingPolicy** | The autoscaling intent (request-rate, custom-metric, queue-depth, or schedule). |

## Referencing policies

A policy is authored once and reused. An agent opts in by reference:

```yaml
apiVersion: agents.ctxmesh.ai/v1alpha1
kind: AgentDeployment
metadata:
  name: support-agent
spec:
  image: ghcr.io/my-org/support-agent:1.0.0
  modelRouteRef: default-chat
  guardrailPolicyRef: default-guardrails
  approvalPolicyRef: sensitive-tools
  feedbackStoreRef: support-feedback
  evalSuiteRef: support-quality
```

A missing or invalid reference fails **closed** — the agent is held rather than served ungoverned.

:::note
A full field-by-field reference for each resource lives under [Reference](/reference/), and grows
as the API stabilizes toward general availability.
:::
