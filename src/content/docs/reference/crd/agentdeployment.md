---
title: AgentDeployment
description: The primary resource — a long-running AI agent, its runtime, and its references to governance and quality policies.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `AgentDeployment` · Scope: Namespaced

## Overview

`AgentDeployment` is the primary ctxmesh resource: it describes a single AI agent — its container
image, execution model, resources, scaling bounds, memory, knowledge, and the governance/quality
policies it opts into. The controller reconciles each `AgentDeployment` into an immutable
[`AgentVersion`](/reference/crd/agentversion/) snapshot and (for the default `serving` model) a
Knative Service that serves HTTP traffic. The headline guarantee is **fail-closed governance**: a
dangling policy reference (`guardrailPolicyRef`, `approvalPolicyRef`, `feedbackStoreRef`,
`evalSuiteRef`) holds the agent `Ready=False` rather than serving it ungoverned.

The **model is not referenced here.** The agent's code chooses its model at call time by calling the
injected gateway (`MODEL_GATEWAY_URL`) with `model="<ModelRoute name>"` — a [`ModelRoute`](/reference/crd/modelroute/)'s
`metadata.name` *is* the model alias. There is no `modelRouteRef` field.

## When to use / when not

- **Use** to deploy any agent — a request-driven service, an event consumer, or a one-shot job.
- **Use** to attach reusable policies (guardrails, approvals, feedback, eval gate, budget) by reference.
- **Not** for the model choice (chosen in code via the gateway), and **not** for prompt/tool *content*
  (prompts are `promptRef` to a Postgres-resident store; tools are bound via [`MCPToolBinding`](/reference/crd/mcptoolbinding/)).

## Naming constraint

`metadata.name` must be **at most 44 characters** (a CEL admission rule). The controller derives
Knative revision names as `<name>-<specHash8>` plus a bounded binding-digest suffix; 63 (the DNS-1035
label cap) minus that 19-character budget leaves 44 characters of name.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.image` | string | **Yes** | — | Fully-qualified agent container image, e.g. `ghcr.io/ctxmesh/echo-agent:latest`. MinLength 1. |
| `spec.executionModel` | string (enum) | No | `serving` | `serving` (Knative Service, request-driven), `eventing` (serving + a Knative Eventing Trigger on the registry broker), or `job` (one-shot Kubernetes Job, or a CronJob when a `schedule` scaling policy targets it). |
| `spec.port` | int32 | No | `8080` | TCP port the agent HTTP server listens on (passed as `$AGENT_PORT`). Range 1–65535. |
| `spec.resources` | object | No | — | CPU/memory requests for the agent container. When omitted, no requests are set (Knative default). |
| `spec.resources.cpu` | quantity | No | — | CPU request, e.g. `500m`. Maps to `resources.requests.cpu`. |
| `spec.resources.memory` | quantity | No | — | Memory request, e.g. `256Mi`. Maps to `resources.requests.memory`. |
| `spec.env` | []EnvVar | No | — | Extra environment variables injected alongside the controller-managed ones. Standard Kubernetes `EnvVar` schema. |
| `spec.scaling` | object | No | min=0, max=3 | Knative autoscaler bounds. |
| `spec.scaling.min` | int32 | No | `0` | Minimum replicas. `0` enables scale-to-zero. Minimum 0. |
| `spec.scaling.max` | int32 | No | `3` | Maximum replicas. Minimum 1. |
| `spec.sessionMemory` | object | No | — | Conversation memory (the folded home of the retired `MemoryBinding`). Absent ⇒ no conversation memory. |
| `spec.sessionMemory.scope` | string (enum) | No | `session` | `session` = private per-agent; `shared` = a registry-shared team scratchpad (requires the agent to be a registry member). |
| `spec.sessionMemory.perUser` | bool | No | `false` | Isolate each invoking end-user's conversation memory into its own bucket. Product-grade (launcher-stamped), only meaningful for `session` scope; breaks conversation handoff/share-links, so opt-in. |
| `spec.sessionMemory.backend.addr` | string | No | cluster state-layer | `host:port` of the Valkey backend. Defaults to `ctxmesh-statelayer.ctxmesh.svc:6379`. MaxLength 256. |
| `spec.longTermMemory` | object | No | — | Long-term, cross-conversation semantic memory (pgvector), orthogonal to `sessionMemory`. |
| `spec.longTermMemory.enabled` | bool | No | `false` | Turns on long-term memory. |
| `spec.longTermMemory.perUser` | bool | No | `false` | Scope each memory to the invoking user (store scope `agent_user`) rather than agent-wide. |
| `spec.longTermMemory.embeddingRoute` | string | No | cluster default | Gateway model route used to embed memories + queries. Must exist on the agent's gateway. MaxLength 253. |
| `spec.knowledgeBases` | []object | No | — | RAG corpora this agent may access (an additive *capability*, enforced at the launcher roster gate). Max 16 items. A dangling ref is skipped (not fail-closed) and surfaces a condition. |
| `spec.knowledgeBases[].name` | string | **Yes** (per item) | — | The [`KnowledgeBase`](/reference/crd/knowledgebase/) name. MinLength 1, MaxLength 253. |
| `spec.knowledgeBases[].namespace` | string | No | agent's namespace | Namespace of the KnowledgeBase. MaxLength 63. |
| `spec.knowledgeBases[].autoInject` | bool | No | `false` | When true, the SDK auto-injects the most relevant chunks each turn (RAG). When false, the KB is tool-only (`knowledge_search`). |
| `spec.role` | string | No | — | The agent's role within its [`AgentRegistry`](/reference/crd/agentregistry/) (`orchestrator`/`worker`/`reviewer`, or a custom registry role). Injected as `AGENT_ROLE`. Ignored for non-members. MaxLength 63. |
| `spec.allowedCallers` | []string | No | — | Per-agent inbound A2A allowlist (peer agent names permitted to call this agent). Empty ⇒ the launcher's default (registry-membership check). Max 64 entries, each 1–63 chars. |
| `spec.budget` | object | No | — | USD cost-governance caps (PRD §14). Enforced by the gateway budget proxy; omitted ⇒ no cost enforcement. |
| `spec.budget.perConversationUSD` | string | No | — | Hard per-conversation USD cap, exact decimal string e.g. `0.50`. Omit to leave unenforced. Pattern `^[0-9]+(\.[0-9]{1,6})?$`. |
| `spec.budget.perAgentUSD` | string | No | — | Hard per-agent USD cap across all conversations, e.g. `10.00`. Pattern `^[0-9]+(\.[0-9]{1,6})?$`. |
| `spec.budget.softThresholdPct` | int32 | No | `80` | Percent of a hard cap at which the gateway emits a one-shot budget alert (but continues). Range 1–99. |
| `spec.evalSuiteRef` | string | No | — | Names an [`EvalSuite`](/reference/crd/evalsuite/) (same namespace) that gates this deployment. Omitted ⇒ no eval gate. MaxLength 253. |
| `spec.promptRef` | string | No | image-bundled prompt | Names a git-backed prompt version (Postgres-resident; `PromptVersion` CRD was retired). Swapping it rolls a new revision without an image rebuild. MaxLength 253. |
| `spec.guardrailPolicyRef` | string | No | — | Names a [`GuardrailPolicy`](/reference/crd/guardrailpolicy/) (same namespace). **A missing/invalid ref fails the agent closed** — held, not served unguarded. MaxLength 253. |
| `spec.approvalPolicyRef` | string | No | — | Names an [`ApprovalPolicy`](/reference/crd/approvalpolicy/) (same namespace) requiring human approval for named tool calls. **A dangling ref sets `Ready=False`.** MaxLength 253. |
| `spec.feedbackStoreRef` | string | No | — | Names a [`FeedbackStore`](/reference/crd/feedbackstore/) (same namespace) declaring this agent's multi-source feedback model. Absent ⇒ open relay to Langfuse. MaxLength 253. |
| `spec.tracePolicy` | object | No | — | Extends the always-on trace-redaction policy with custom regex detectors (the built-in email/SSN/key detectors are always applied). |
| `spec.tracePolicy.customDetectors` | []object | No | — | Extra named RE2 redaction rules applied after the built-ins. Max 16. |
| `spec.tracePolicy.customDetectors[].name` | string | **Yes** (per item) | — | Detector label (appears in the `[REDACTED:<name>]` marker). 1–32 chars, pattern `^[a-z0-9][a-z0-9-]*$`. |
| `spec.tracePolicy.customDetectors[].pattern` | string | **Yes** (per item) | — | RE2 regex whose matches are scrubbed. 1–256 chars. |
| `spec.runtime` | object | No | — | Runtime authoring primitives: structured output schema, tool-use policy, per-turn resilience. |
| `spec.runtime.outputSchema` | JSON (RawExtension) | No | — | JSON Schema the agent's final answer must conform to. Stored verbatim; not structurally validated at admission. |
| `spec.runtime.toolPolicy.default` | string (enum) | No | `allow` | Rule for any tool without an override: `allow` / `deny` / `require-approval`. |
| `spec.runtime.toolPolicy.overrides` | []object | No | — | Per-tool policy list (keyed on `name`, first match wins). |
| `spec.runtime.toolPolicy.overrides[].name` | string | **Yes** (per item) | — | Exact tool name. MinLength 1. |
| `spec.runtime.toolPolicy.overrides[].rule` | string (enum) | **Yes** (per item) | — | `allow` / `deny` / `require-approval`. |
| `spec.runtime.toolPolicy.overrides[].retryable` | bool | No | `false` | Opt this tool in to retries on transient failure. |
| `spec.runtime.toolPolicy.forcedChoice` | string | No | — | `""`/`auto` = model chooses; `required` = force ≥1 tool call; a tool name = force that tool. |
| `spec.runtime.toolPolicy.parallelLimit` | int32 | No | `0` | Cap on concurrent tool calls per turn. 0 = unlimited. Minimum 0. |
| `spec.runtime.toolPolicy.maxToolCallsPerRun` | int32 | No | `0` | Cap on total tool calls per run (anti-DoS). 0 = unlimited; enforced fail-closed at the egress sidecar. Minimum 0. |
| `spec.runtime.resilience.modelCall.timeoutSeconds` | int32 | No | `0` | Per-model-call hard deadline. 0 = none. Minimum 0. |
| `spec.runtime.resilience.modelCall.maxRetries` | int32 | No | `0` | Max retries on transient model-call failure. Minimum 0. |
| `spec.runtime.resilience.toolCall.timeoutSeconds` | int32 | No | `0` | Per-tool-call hard deadline. 0 = none. Minimum 0. |
| `spec.runtime.resilience.toolCall.maxRetries` | int32 | No | `0` | Max retries on transient tool-call failure. Minimum 0. |
| `spec.runtime.resilience.toolCall.circuitBreaker.failureThreshold` | int32 | **Yes** (if set) | — | Consecutive failures before the circuit opens. Minimum 1. |
| `spec.runtime.resilience.toolCall.circuitBreaker.cooldownSeconds` | int32 | No | `0` | Duration the circuit stays open before half-opening. 0 = implementation default. Minimum 0. |
| `spec.rollout` | object | No | — | Progressive-delivery strategy for a **gated `serving`** agent (requires an `evalSuiteRef`). Absent ⇒ promote-all/hold. |
| `spec.rollout.strategy` | string (enum) | No | `""` | `""` = promote-all/hold; `canary` = a named-revision traffic split so both arms accumulate online scores. |
| `spec.rollout.canaryPercent` | int32 | No | `10` | Percent of live traffic to the candidate during a canary. Range 1–99. Consulted only when `strategy: canary`. |
| `spec.rollout.autoRollback.enabled` | bool | No | `false` | Opt-in automatic rollback to the last-healthy version on `RegressionDetected=True`. Reuses the human-rollback damping guards. |
| `spec.rollout.autoProgress.enabled` | bool | No | `false` | Opt-in automatic canary progression + auto-promote on a healthy verdict. |
| `spec.rollout.autoProgress.steps` | []object | No | `[{percent: 100}]` | Percent ladder the canary auto-advances through. Max 10. Treated as a set (min percent strictly greater than current). |
| `spec.rollout.autoProgress.steps[].percent` | int32 | **Yes** (per item) | — | Candidate traffic percent at this rung. Range 2–100. |
| `spec.rollout.autoProgress.dwellSeconds` | int32 | No | `3600` | Minimum soak per step before an advance is considered. Minimum 60. |
| `spec.record` | bool | No | `false` | Marks the agent **record-capable** (forces the launcher gateway on so a run can capture model+tool I/O into a replay fixture). Capture is still opted in per-run. |
| `spec.endUserAccess` | bool | No | `false` | Opt this agent into the standalone `/chat` end-user runtime. **Requires** the tenant to enable an end-user IdP (`Tenant.spec.endUserIdentity.enabled`) AND this flag. **Only valid on `serving`** (rejected for `eventing`/`job`). |
| `spec.mountServiceAccountToken` | *bool | No | `false` (not mounted) | Auto-mount the default kube-API ServiceAccount token. Secure by default (off); set `true` only for an agent that builds an in-cluster kube config. Applies only to agents with a per-agent identity SA. |

### Cross-field validation (admission)

- `metadata.name` ≤ 44 characters (revision-name budget, above).
- `endUserAccess: true` is rejected on `executionModel: job` or `eventing` (end-user chat is
  interactive request-driven).

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.conditions` | []Condition | Reconciliation state; the `Ready` condition mirrors the underlying Knative Service `Ready`. A dangling fail-closed policy ref holds `Ready=False`. |
| `status.url` | string | Public HTTP endpoint, copied from the Knative Service once ready. |
| `status.latestVersion` | string | Name of the most recent `AgentVersion` snapshot, e.g. `echo-agent-7d9f4c1a`. |
| `status.observedGeneration` | int64 | `.metadata.generation` last fully reconciled. |
| `status.gate` | object | Deploy-gate state when `evalSuiteRef` is set (nil otherwise). |
| `status.gate.phase` | string (enum) | `pending` / `scoring` / `awaiting-promotion` / `promoted` / `blocked` / `warned` / `canary` / `aborted`. A passing candidate rests at `awaiting-promotion` (or `canary`) until a human promotes — v1 does not auto-promote by default. |
| `status.gate.score` | string | Candidate's weighted-mean suite score in `[0,1]` (decimal string). Empty until scored (or when the gate failed closed unscored). |
| `status.gate.threshold` | string | The EvalSuite threshold the score was compared against. |
| `status.gate.decision` | string (enum) | Terminal decision: `promoted` / `blocked` / `warned`. |
| `status.gate.scoredRevision` | string | The candidate revision the gate scored and decided on. |
| `status.gate.reason` | string | Short machine reason (e.g. `ScorePassed`, `ScoreBelowThreshold`, `LangfuseUnavailable`). |
| `status.rollback` | object | Human-rollback actuator state + damping guards (nil until first evaluated). |
| `status.rollback.rolledBackTo` | string | The AgentVersion last reverted to. |
| `status.rollback.lastRollbackAt` | time | When the last successful rollback was actuated. |
| `status.rollback.history` | []object | Recent rollback events (input to the two-version flap detector). |
| `status.rollback.frozenUntilAck` | bool | When true, freezes further actions until a human acks (anti-runaway guard). |
| `status.rollout` | object | Auto-progression actuator state for a canary (nil when off). |
| `status.rollout.candidateRevision` | string | The candidate revision this progression is pinned to. |
| `status.rollout.currentPercent` | int32 | Candidate-arm traffic percent progression has advanced to. |
| `status.rollout.lastAdvanceAt` | time | When the controller last advanced a step (the dwell clock). |
| `status.rollout.reason` | string | Most recent auto-progression outcome (e.g. `Advanced`, `AutoProgressHeld`, `InsufficientData`, `Frozen`, `AutoPromoted`). |

### Promotion & rollback annotations

The human-gated state machine is driven by annotations:

- `agents.ctxmesh.ai/promote` — approve a passing candidate held at `awaiting-promotion`/`canary`.
- `agents.ctxmesh.ai/rollback=<version>` — roll the serving spec back to an AgentVersion.
- `agents.ctxmesh.ai/rollback-ack` — clear a `frozenUntilAck` freeze set by an auto-action.

## Examples

### Minimal

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: echo-agent
  namespace: my-team
spec:
  image: ghcr.io/ctxmesh/echo-agent:latest
```

### Fuller — governed, gated, with memory and budget

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: support-agent
  namespace: my-team
spec:
  image: ghcr.io/my-org/support-agent:1.4.0
  port: 8080
  resources:
    cpu: 500m
    memory: 512Mi
  scaling:
    min: 1
    max: 5
  sessionMemory:
    scope: session
  longTermMemory:
    enabled: true
    embeddingRoute: text-embedding-3-small
  knowledgeBases:
    - name: product-docs
      autoInject: true
  budget:
    perConversationUSD: "0.50"
    perAgentUSD: "50.00"
    softThresholdPct: 80
  guardrailPolicyRef: default-guardrails
  approvalPolicyRef: sensitive-tools
  feedbackStoreRef: support-feedback
  evalSuiteRef: support-quality
  rollout:
    strategy: canary
    canaryPercent: 10
```

The agent's code picks its model by calling `MODEL_GATEWAY_URL` with `model="<ModelRoute name>"` —
there is no `modelRouteRef` field on this resource.

## See also

- Concept: [Custom resources](/concepts/custom-resources/) · [Architecture](/concepts/architecture/)
- Guide: [Guardrails and approvals](/guides/guardrails/)
- Related: [AgentVersion](/reference/crd/agentversion/) · [ModelRoute](/reference/crd/modelroute/) ·
  [GuardrailPolicy](/reference/crd/guardrailpolicy/) · [ApprovalPolicy](/reference/crd/approvalpolicy/) ·
  [FeedbackStore](/reference/crd/feedbackstore/) · [EvalSuite](/reference/crd/evalsuite/) ·
  [KnowledgeBase](/reference/crd/knowledgebase/) · [AgentScalingPolicy](/reference/crd/agentscalingpolicy/)
- Folded away: `MemoryBinding` and `CostBudget` — see [Retired resources](/reference/crd/retired-resources/).
