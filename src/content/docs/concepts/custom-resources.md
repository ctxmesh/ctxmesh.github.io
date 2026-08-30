---
title: Custom resources
description: "The full catalog of ctxmesh custom resources and how they compose."
sidebar:
  order: 2
---

Everything in ctxmesh is a Kubernetes custom resource in the **`agents.ctxmesh.ai`** API group,
served at **`v1beta1`** (the GA API posture — see [Versioning](/reference/)). You compose an agent
and its governance by authoring these resources and **referencing policies** from the
`AgentDeployment` spec. A missing or invalid reference fails **closed** — the agent is held, not
served ungoverned.

## The agent itself

| Resource | Kind | Declares |
|----------|------|----------|
| [AgentDeployment](/reference/crd/agentdeployment/) | `AgentDeployment` | The agent: image, execution model, tools, memory, knowledge, scaling, and references to the governance/quality policies below. The primary resource. |
| [AgentVersion](/reference/crd/agentversion/) | `AgentVersion` | An immutable snapshot of an agent's full config (image + pinned tool/prompt versions) — the unit of rollout and eval-gating. |
| [AgentRegistry](/reference/crd/agentregistry/) | `AgentRegistry` | An isolated group of agents forming a closed communication mesh (agent-to-agent scoping). |

## Models & secrets

| Resource | Kind | Declares |
|----------|------|----------|
| [ModelRoute](/reference/crd/modelroute/) | `ModelRoute` | A model alias → provider priority, fallback, and per-tenant rate budget, applied by the integrated gateway. |
| [SecretBinding](/reference/crd/secretbinding/) | `SecretBinding` | A reference to a secret in an external backend by name (provider keys, etc.) — resolved via External Secrets, never inlined. |
| [CredentialStore / ClusterCredentialStore](/reference/crd/credentialstore/) | `CredentialStore` | A backend (Kubernetes / Postgres / OpenBao / remote) for MCP on-behalf-of user credentials. |

## Tools

| Resource | Kind | Declares |
|----------|------|----------|
| [MCPToolBinding](/reference/crd/mcptoolbinding/) | `MCPToolBinding` | Binds an MCP tool server (sidecar or remote) to an agent, with auth tier and discovery. |

## Governance

| Resource | Kind | Declares |
|----------|------|----------|
| [GuardrailPolicy](/reference/crd/guardrailpolicy/) | `GuardrailPolicy` | Content governance: PII detectors, pattern denylists, an optional LLM judge, per-user rate limits, and a fail mode. Enforced in-pod by the launcher. |
| [ApprovalPolicy](/reference/crd/approvalpolicy/) | `ApprovalPolicy` | Human-in-the-loop: which tool calls require approval and who may approve. The run pauses until an approver signs off. |
| [FeedbackStore](/reference/crd/feedbackstore/) | `FeedbackStore` | A declarative multi-source feedback model (human / external) correlated to traces — gating ingestion and attributing each score to its source. |
| [AlertPolicy](/reference/crd/alertpolicy/) | `AlertPolicy` | Selector + conditions (error rate, p95 latency, run-failure rate, budget, regression) + notification channels. |

## Quality & rollout

| Resource | Kind | Declares |
|----------|------|----------|
| [EvalSuite](/reference/crd/evalsuite/) | `EvalSuite` | A dataset + scorers + thresholds used as a **deploy gate** and for scoring a candidate before it serves. |
| [AgentScalingPolicy](/reference/crd/agentscalingpolicy/) | `AgentScalingPolicy` | The autoscaling intent (request-rate / custom-metric / queue-depth / schedule) and bounds; the platform selects the backend. |

## Orchestration

| Resource | Kind | Declares |
|----------|------|----------|
| [AgentTeam](/reference/crd/agentteam/) | `AgentTeam` | A supervisor + roster for multi-agent delegation (`delegate_to`), with a spawn budget and durable suspend/resume. |
| [Workflow](/reference/crd/workflow/) | `Workflow` | A declarative graph (conditional / loop / map-reduce) with CEL bindings and typed error routing. |

## Knowledge

| Resource | Kind | Declares |
|----------|------|----------|
| [KnowledgeBase](/reference/crd/knowledgebase/) | `KnowledgeBase` | A managed RAG corpus: upload → chunk / embed / index → `knowledge_search`, granted to an agent by reference. |

## Multi-tenancy

| Resource | Kind | Declares |
|----------|------|----------|
| [Tenant](/reference/crd/tenant/) | `Tenant` | Groups namespaces, compute quotas, model budgets / RPM / concurrency, and isolation policy. |

## Referencing policies

A policy is authored once and reused. An agent opts in by reference:

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: support-agent
  namespace: my-team
spec:
  image: ghcr.io/my-org/support-agent:1.0.0
  # The model is chosen in the agent's code by calling the injected gateway
  # (MODEL_GATEWAY_URL) with model="<ModelRoute name>" — there is no modelRouteRef.
  guardrailPolicyRef: default-guardrails
  approvalPolicyRef: sensitive-tools
  feedbackStoreRef: support-feedback
  evalSuiteRef: support-quality
```

A dangling reference sets `Ready=False` on the agent and **holds** it (no serving revision) — the
control plane is fail-closed, so an agent is never served without the governance it names.

## Retired & folded resources

Some resources from earlier designs have been retired or folded into spec fields — if you're
searching for one, see [Retired resources](/reference/crd/retired-resources/):

- **`MemoryBinding`** → folded into `AgentDeployment.spec.sessionMemory`.
- **`PromptVersion`**, **`ToolRegistry`** → Postgres-authoritative stores (not served as CRDs).
- **`CostBudget`** (as a CRD) → `AgentDeployment.spec.budget` + the cost store.

See the [Reference](/reference/) for field-by-field pages, or [Architecture](/concepts/architecture/)
for how these pieces fit together at runtime.
