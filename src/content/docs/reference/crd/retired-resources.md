---
title: Retired resources
description: Resources from earlier designs that were retired, folded into spec fields, or never built — what they were, why, and the replacement.
---

Some resources from earlier ctxmesh designs have been **retired**, **folded into an
[`AgentDeployment`](/reference/crd/agentdeployment/) spec field**, or moved to a
**Postgres-authoritative store** (not served as a CRD). This page documents them honestly so a search
lands somewhere useful instead of 404-ing. **None of these are served CRDs in
`agents.ctxmesh.ai/v1beta1`.**

## MemoryBinding → `AgentDeployment.spec.sessionMemory`

- **What it was:** a separate CRD binding conversation (session) memory to an agent.
- **Why retired:** a memory binding is always 1:1 with its agent and is never shared as an object, so a
  standalone CRD added indirection with no benefit.
- **Replacement:** the folded field
  [`AgentDeployment.spec.sessionMemory`](/reference/crd/agentdeployment/#spec-fields) — `scope`
  (`session` / `shared`), `perUser`, and `backend.addr`. (Long-term semantic memory is a sibling field,
  `spec.longTermMemory`.)

## PromptVersion → Postgres (BFF-managed)

- **What it was:** a CRD for a git-backed prompt version, referenced by an agent.
- **Why retired:** prompt versions are control-plane records, not cluster reconciliation state — storing
  many of them in etcd is an anti-pattern.
- **Replacement:** prompt versions live only in **Postgres**, managed via the BFF API. An agent still
  selects one by name with
  [`AgentDeployment.spec.promptRef`](/reference/crd/agentdeployment/#spec-fields); the controller
  resolves it via the prompt service. Swapping `promptRef` rolls a new revision with no image rebuild.

## ToolRegistry → Postgres-authoritative catalog

- **What it was:** a CRD catalog of approved MCP tools.
- **Why retired as a served CRD:** the tool catalog (with provenance and approval state) is a
  control-plane store, better served from Postgres than etcd.
- **Replacement:** the tool catalog is **Postgres-authoritative**. Tools are still bound to agents via
  [`MCPToolBinding`](/reference/crd/mcptoolbinding/), whose `spec.registryRef` names the catalog that
  must approve the tool.

## CostBudget (as a CRD) → `AgentDeployment.spec.budget`

- **What it was:** a separate CRD for cost-governance caps.
- **Why retired as a CRD:** a budget is a per-agent concern, cleanest as a field on the agent it governs.
- **Replacement:** the folded field
  [`AgentDeployment.spec.budget`](/reference/crd/agentdeployment/#spec-fields) —
  `perConversationUSD`, `perAgentUSD`, and `softThresholdPct` — enforced by the gateway budget proxy.
  Tenant-aggregate model spend/rate caps live on [`Tenant.spec.model`](/reference/crd/tenant/); per-end-user
  spend/rate caps live on [`GuardrailPolicy.spec.userRateLimit`](/reference/crd/guardrailpolicy/).

## Capability → not built

- **What it was:** a proposed CRD for declaring agent capabilities.
- **Status:** **not built.** There is no `Capability` resource. Capabilities that agents opt into
  (knowledge, memory, record mode, end-user access, tool policy, resilience) are expressed as fields on
  [`AgentDeployment`](/reference/crd/agentdeployment/), and cross-agent trust is expressed through
  [`AgentRegistry`](/reference/crd/agentregistry/) / [`AgentTeam`](/reference/crd/agentteam/) /
  [`Workflow`](/reference/crd/workflow/).

## See also

- [Custom resources](/concepts/custom-resources/) — the full catalog of served resources.
- [API group](/reference/api-group/) — the `agents.ctxmesh.ai/v1beta1` kinds and `kubectl` usage.
