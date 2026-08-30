---
title: HTTP API
description: "The console / BFF /api surface — agents, runs (+ SSE events), providers, MCP, traces, cost, audit, tenants, datasets, and shared runs."
---

The console is a static SPA backed by a Go **BFF** that serves the `/api` surface. Every route here is
**caller-scoped**: the BFF acts with *your* Kubernetes identity and RBAC, never a privileged service
account — you see and change exactly what your RBAC permits, and denials surface as the API server's own
`403`. See [RBAC & personas](/operations/rbac/) and [Security posture](/operations/security-posture/).

:::note
This is the shipped route surface, confirmed against the BFF. Some routes are **provider-gated** (a
feature flag or a wired backend): when the feature is off or the backend (e.g. the trace/cost adapter,
the control-plane store) is not configured, the route returns **`501 Not Implemented`** with an honest
message rather than a fake empty result. Request/response bodies finalize toward GA.
:::

## Conventions

- **Auth:** a bearer token (the console session / your kubeconfig token). Unauthenticated `/api` calls
  are rejected.
- **Method + path** matter (Go 1.22 `ServeMux`): a `GET` and a `POST` on the same path are distinct
  routes; a missing method → `405`.
- **`501`** means "not wired here" (feature-flagged off or backend unconfigured) — not an error in your
  request.
- **`403`** is the real Kubernetes RBAC decision for the resource you named — no pre-emption by the BFF.

## Agents

| Method + path | Purpose |
|---------------|---------|
| `GET /api/agents` | List agents (caller-scoped). |
| `POST /api/agents` | Create an agent (config-builder apply). |
| `GET /api/agents/{ns}/{name}` | Agent detail. |
| `PUT /api/agents/{ns}/{name}` | Edit an agent. |
| `DELETE /api/agents/{ns}/{name}` | Delete an agent. |
| `POST /api/agents/{ns}/{name}/fork` | Fork an agent. |
| `POST /api/agents/{ns}/{name}/publish` | Publish as a template. |
| `POST /api/agents/{ns}/{name}/rollback` | Roll back to a prior version (writes the rollback annotation; see [Annotations & labels](/reference/annotations-and-labels/)). |
| `GET /api/agents/{ns}/{name}/versions/diff` | Diff two agent versions. |
| `GET /api/agents/{ns}/{name}/logs` | Agent logs. |
| `GET /api/agents/{ns}/{name}/runs` | Runs for this agent. |
| `GET /api/agents/{ns}/{name}/online-score` | Online-scoring vector for the agent. |
| `GET / PUT /api/agents/{ns}/{name}/tracepolicy` | Get / set the trace redaction policy. |
| `GET / PUT /api/agents/{ns}/{name}/sessionmemory` | Get / set session-memory config. |
| `GET / PUT /api/agents/{ns}/{name}/longtermmemory` | Get / set long-term-memory config. |
| `GET /api/agents/{ns}/{name}/memory` | Read the agent's memory surface. |
| `GET /api/agents/{ns}/{name}/references` · `GET /api/usedby` | What this agent references / what references it. |
| `POST /api/agents/generate` · `POST /api/agents/refine` · `POST /api/agents/check-requirements` | Create-from-prompt generation / refine / requirement check. |
| `POST /api/expand` | Expand simplified config to an `AgentDeployment` (the `expand` core). |
| `GET /api/topology` | Agent/registry topology graph. |
| `GET /api/templates` · `POST /api/templates` · `DELETE /api/templates/{kind}/{namespace}/{name}` | Template catalog. |
| `GET /api/recipes` | Starter recipes. |

## Runs & invoke

| Method + path | Purpose |
|---------------|---------|
| `GET /api/runs` | List runs. |
| `POST /api/runs` | Create a run. |
| `GET /api/runs/{id}` | Run detail. |
| `GET /api/runs/{id}/tree` | The run's span/step tree. |
| `GET /api/runs/{id}/events` | **Live run events (SSE stream).** |
| `POST /api/runs/{id}/resume` | Resume a paused (e.g. approval-gated) run. |
| `POST /api/runs/{id}/cancel` | Cancel a run. |
| `GET /api/runs/{id}/fixture` | The run's recorded replay fixture. |
| `POST /api/invoke` | Invoke an agent (playground). |

## Sharing runs

| Method + path | Purpose |
|---------------|---------|
| `POST /api/runs/{id}/shares` | Create a share link/token for a run. |
| `GET /api/runs/{id}/shares` · `DELETE /api/runs/{id}/shares/{shareId}` | List / revoke shares. |
| `GET /api/shared/runs/{token}` | **Public** read of a shared run (token-gated; honest 404 on unknown/expired/revoked). |
| `GET /api/my/shares` | Shares you created. |

## Providers & model routing

| Method + path | Purpose |
|---------------|---------|
| `POST /api/providers` | Connect a provider (paste a key once; stored server-side, never in the browser). |
| `GET /api/providers` | List connected providers. |
| `GET /api/providers/{name}/models` | Live model list from the provider. |
| `POST /api/providers/{name}/rotate` | Rotate the provider key. |
| `DELETE /api/providers/{name}` | Disconnect. |
| `GET/POST /api/modelroutes` · `GET/PUT/DELETE /api/modelroutes/{ns}/{name}` | Model routes. |
| `GET/POST /api/secretbindings` · `GET/PUT/DELETE /api/secretbindings/{ns}/{name}` | Secret bindings. |

The provider-connect endpoints are gated by `bff.providerConnect.enabled` (a hardened install `404`s
them). See [Connect a model provider](/guides/connect-a-model-provider/).

## MCP & tools

| Method + path | Purpose |
|---------------|---------|
| `POST/GET /api/mcpservers` · `DELETE /api/mcpservers/{ns}/{name}` · `GET /api/mcpservers/{ns}/{name}/references` | Register / list / deregister BYO MCP servers. |
| `GET /api/tools` · `GET /api/catalog` | Discovered tool catalog. |
| `POST /api/mcp/connect` · `POST /api/mcp/publish` · `POST /api/mcp/org-credential` | Connect / publish / set an org credential. |
| `POST /api/mcp/oauth/grant` · `DELETE /api/mcp/oauth/grant/{server}` | Begin per-user OAuth consent / revoke a grant. |
| `GET /api/mcp/approvals` · `POST /api/mcp/approvals/{ns}/{name}` · `POST /api/mcp/approvals/{ns}/{name}/reject` | The MCP approval queue (hardened installs). |
| `GET/POST /api/mcptoolbindings` · `GET/PUT/DELETE /api/mcptoolbindings/{ns}/{name}` | MCP tool bindings. |
| `GET/POST /api/toolregistries` · `GET/PUT/DELETE /api/toolregistries/{ns}/{name}` | Tool registries. |

MCP register/catalog is gated by `bff.mcp.enabled`; hardened installs can require approval. See
[Bring your own MCP](/guides/bring-your-own-mcp/).

## Policies, registries & scaling

| Method + path | Purpose |
|---------------|---------|
| `GET/POST /api/agentregistries` · `GET/PUT/DELETE /api/agentregistries/{ns}/{name}` | Agent registries (meshes). |
| `GET/POST /api/agentscalingpolicies` · `GET/PUT/DELETE /api/agentscalingpolicies/{ns}/{name}` | Scaling policies. |
| `GET/POST /api/evalsuites` · `GET/PUT/DELETE /api/evalsuites/{ns}/{name}` · `GET /api/evalsuites/{ns}/{name}/results` | Eval suites + results. |
| `GET/POST /api/promptversions` · `GET/PUT/DELETE /api/promptversions/{ns}/{name}` · `GET /api/promptversions/{ns}/{name}/diff` | Prompt versions. |
| `GET /api/guardrailpolicies` | Guardrail policies. |
| `GET /api/approvals` · `GET /api/alerts` | Approval queue · alert feed. |
| `GET /api/workflows` · `POST /api/workflows/{name}/runs` · `POST /api/workflows/runs` · `GET /api/workflows/spec-schema` | Workflows + run creation. |
| `GET/POST /api/teams` · `POST /api/teams/generate` | Agent teams. |
| `GET/POST /api/knowledgebases` · `GET /api/knowledgebases/{name}` · `POST .../search` · `POST .../documents` · `POST .../ingest` | Knowledge bases (RAG). |

## Datasets (the improvement loop)

| Method + path | Purpose |
|---------------|---------|
| `GET /api/datasets` · `GET /api/datasets/{name}/cases` | List datasets / cases. |
| `POST /api/datasets/{name}/export` | Export a redacted dataset from traces (a run-worker job). |
| `POST /api/datasets/{name}/cases/{caseId}/labels` | Append a label (append-only). |
| `POST /api/datasets/{name}/cases/from-run` | Add a run as a case. |
| `POST /api/datasets/{name}/pin` | Pin/version an immutable dataset snapshot. |

## Traces, cost & feedback

| Method + path | Purpose |
|---------------|---------|
| `GET /api/traces/{id}` | Link/resolve a trace. |
| `GET /api/traces/{id}/detail` | Trace tree detail. |
| `GET /api/cost` · `GET /api/cost/breakdown` · `GET /api/cost/forecast` · `GET /api/cost/chargeback` | Cost views. |
| `GET /api/feedback` · `POST /api/feedback` | Read / submit feedback. |
| `GET /api/metrics/cost` · `GET /api/metrics/eval-gated` | The cost metric · the "% deploys gated by an EvalSuite" counter. |

Trace/cost/feedback routes are backed by the trace/cost adapter; unconfigured → `501`.

## Tenancy

| Method + path | Purpose |
|---------------|---------|
| `GET/POST /api/tenants` · `GET /api/tenants/{name}` | Tenants. |
| `GET /api/tenants/usage` · `GET /api/tenants/{name}/usage` | Live usage (spend / rpm / inflight); `501` when no State Layer is wired. |

See [Tenancy operations](/operations/tenancy-operations/).

## Audit & identity

| Method + path | Purpose |
|---------------|---------|
| `GET /api/audit?namespace=&actor=&action=&kind=&limit=&cursor=` | Audit log (operator-only; keyset paging). `501` if no store; `403` if unauthorized. See [Audit](/operations/audit/). |
| `GET /api/whoami` · `GET /api/capabilities` | Your identity · the console capability probe (drives nav gating). |
| `GET /api/namespaces` · `PUT /api/namespaces/{name}/display-name` | Namespaces + display name. |
| `GET /api/health` | Liveness. |

## See also

- [CLI](/reference/cli/)
- [Audit](/operations/audit/) · [Tenancy operations](/operations/tenancy-operations/)
- [RBAC & personas](/operations/rbac/) · [Security posture](/operations/security-posture/)
- [Console mental model](/concepts/runs-and-execution/)
- [API group](/reference/api-group/)
