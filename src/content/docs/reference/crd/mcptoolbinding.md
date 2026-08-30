---
title: MCPToolBinding
description: Binds one MCP tool server (sidecar or remote) to one agent, gated by a ToolRegistry, and drives the discovery sidecar.
---

> apiVersion: `agents.ctxmesh.ai/v1beta1` · Kind: `MCPToolBinding` · Scope: Namespaced · shortName: `mtb`

## Overview

An `MCPToolBinding` binds one MCP tool server to one agent. The server runs either as a `sidecar` (in
the agent pod, reached over localhost) or as a `remote` shared service. The binding is gated by a
`ToolRegistry` (a Postgres-authoritative catalog — see [Retired resources](/reference/crd/retired-resources/))
that must approve the tool. Enforcement point: the **controller** (validates registry membership +
image/url pin-matching and renders the tool into the agent manifest and discovery sidecar). The
headline guarantee is that an agent only gets tools that its registry has approved and pinned.

## When to use / when not

- **Use** to grant an agent an MCP tool, either co-resident (sidecar) or from a shared remote server.
- **Not** for the model gateway or for on-behalf-of credentials — those are `ModelRoute` /
  `CredentialStore`.

## Spec fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec.agentRef` | string | **Yes** | — | The [`AgentDeployment`](/reference/crd/agentdeployment/) (same namespace) this tool is bound to. MinLength 1. |
| `spec.registryRef` | string | **Yes** | — | The `ToolRegistry` (same namespace) that must approve this tool. MinLength 1. |
| `spec.toolName` | string | **Yes** | — | The catalog key in the referenced ToolRegistry. MinLength 1. |
| `spec.mode` | string (enum) | **Yes** | — | `sidecar` (in the agent pod, localhost) or `remote` (shared standalone service). |
| `spec.server` | object | **Yes** | — | Locates the tool server for the selected mode. |
| `spec.server.image` | string | Conditional | — | Container image for a `sidecar`-mode server. **Required when `mode: sidecar`.** |
| `spec.server.url` | string | Conditional | — | Base URL of a `remote`-mode MCP server. **Required when `mode: remote`.** |

### Validation rules (admission, CEL)

- `mode: remote` requires `server.url`; `mode: sidecar` requires `server.image`.

## Status

| Field | Type | Meaning |
|-------|------|---------|
| `status.observedGeneration` | int64 | `.metadata.generation` this status reflects. |
| `status.conditions` | []Condition | `Ready=True` means the tool is registered, pin-matched, rendered into the agent manifest, and pushed to the discovery sidecar. Failure reasons include `UnregisteredTool`, `RegistryMismatch`. |

## Examples

### Sidecar mode

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: MCPToolBinding
metadata:
  name: weather-for-triage
  namespace: my-team
spec:
  agentRef: triage-agent
  registryRef: approved-tools
  toolName: weather
  mode: sidecar
  server:
    image: ghcr.io/my-org/weather-mcp:1.2.0
```

### Remote mode

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: MCPToolBinding
metadata:
  name: search-for-triage
  namespace: my-team
spec:
  agentRef: triage-agent
  registryRef: approved-tools
  toolName: web-search
  mode: remote
  server:
    url: http://web-search-mcp.my-team.svc.cluster.local:8080
```

## See also

- Concept: [Custom resources](/concepts/custom-resources/)
- Related: [AgentDeployment](/reference/crd/agentdeployment/) · [CredentialStore](/reference/crd/credentialstore/)
  (MCP on-behalf-of credentials) · [Retired resources](/reference/crd/retired-resources/) (`ToolRegistry`)
