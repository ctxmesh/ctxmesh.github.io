---
title: Tools & MCP
description: "Bind an MCP tool server (sidecar or remote), discovery and hot-update, and tool-call governance."
---

**Goal:** give an agent an MCP tool — either co-resident in its pod (sidecar) or a shared remote server —
declaratively, with governance over which tools it may actually call.

**Prerequisites:** an agent deployed ([Deploy an agent](/guides/deploy-an-agent/)); an MCP tool
approved in a `ToolRegistry` (the catalog a binding must reference).

## How tool binding works

An [`MCPToolBinding`](/reference/crd/mcptoolbinding/) binds **one** MCP tool server to **one** agent. The
binding is gated by a **`ToolRegistry`** — an approved-tool catalog — so an agent only ever gets tools
its registry has approved and pinned. The controller renders the tool into the agent's pod: a
**discovery sidecar** exposes the current tool manifest to the agent over localhost, and a
binding change **hot-updates** without a pod restart. To register your **own** server (auth tiers,
OBO), see [Bring your own MCP](/guides/bring-your-own-mcp/).

## 1. Bind a tool

The two modes differ only in where the server runs:

- **`sidecar`** — the MCP server runs as a container **inside** the agent pod, reached over localhost.
  Requires `server.image`. Session state dies with the pod (fine for scale-to-zero).
- **`remote`** — the agent calls a **shared, standalone** MCP service. Requires `server.url`.

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: MCPToolBinding
metadata:
  name: search-for-support
  namespace: my-team
spec:
  agentRef: support-agent            # AgentDeployment, same namespace
  registryRef: approved-tools        # ToolRegistry that must approve the tool
  toolName: web-search               # the catalog key in the registry
  mode: remote                       # remote | sidecar
  server:
    url: http://web-search-mcp.my-team.svc.cluster.local:8080/mcp   # required for remote
    # image: ghcr.io/my-org/weather-mcp:1.2.0                       # required for sidecar
```

:::note
A remote MCP URL must include the server's MCP path (streamable-http servers serve at **`/mcp`**); a
bare host URL relies on a 307 redirect. Sidecar-mode tools are assigned deterministic localhost ports by
the controller.
:::

Apply it:

```bash
kubectl apply -f search-for-support.yaml
```

## 2. Watch the binding go Ready

The controller checks registry membership and image/url pin-matching, then pushes the tool into the
discovery sidecar:

```bash
kubectl get mcptoolbinding search-for-support -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
# → True   (registered, pin-matched, rendered into the manifest, pushed to the sidecar)
```

`Ready=True` means the tool is in the agent's live manifest. The agent discovers it by reading the
sidecar's tool manifest over localhost; each tool call emits a `TOOL` span in the run's trace.

## 3. Hot-update a binding

Changing only manifest content — e.g. a remote `server.url` — leaves the pod template untouched, so
there is **no Knative revision and no restart**: the controller pushes the new manifest to each ready
pod (propagation under ~5s) and the agent picks it up on its next tool read.

Adding or removing a binding, or changing a **sidecar-mode image**, changes the pod template and does
roll a new revision (deploy-time semantics — expected).

## 4. Govern which tools may be called

Binding a tool makes it *available*; **tool-call governance** decides whether a run may actually invoke
it. `spec.runtime.toolPolicy` on the `AgentDeployment` is enforced at the **egress-sidecar chokepoint** —
**unbypassable**, even by a hand-rolled agent loop:

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: support-agent
  namespace: my-team
spec:
  image: ghcr.io/my-org/support-agent:1.4.0
  runtime:
    toolPolicy:
      default: allow                 # allow | deny | require-approval
      overrides:
        - name: web-search
          rule: allow
        - name: delete-account
          rule: require-approval     # each call needs a human approval
      maxToolCallsPerRun: 50         # anti-DoS fan-out ceiling (0 = unlimited)
```

- `deny` on an **OBO/remote** tool is a hard 403 at the wire (the agent never gets the credential).
- `deny` on an **in-pod (sidecar)** tool is **structural** — the controller does not even deploy the
  tool's container.
- `require-approval` pauses the call until a human signs off — see [Approvals](/guides/approvals/) and
  the tool-call-governance behavior it enforces.

A policy edit **hot-reloads** at the sidecar without rolling the revision.

## When to use / when not

- **Use `sidecar`** for a lightweight per-agent tool with no shared state; **`remote`** for a tool
  shared across agents or one that holds session state (give it `min-scale: 1`).
- **Use `toolPolicy`** to `deny` or gate risky tools even if the code tries to call them — the SDK
  managed loop is *not* the security boundary; the egress sidecar is.
- **Not** for your own credentialed/OAuth server registration — that's [Bring your own MCP](/guides/bring-your-own-mcp/).

## Defaults

- `toolPolicy.default` defaults to `allow`; `parallelLimit` and `maxToolCallsPerRun` default to `0`
  (unlimited). Manifest propagation targets <5s.
- A binding with no `toolPolicy` restriction is byte-for-byte permissive — no body inspection, no added
  latency beyond a sub-millisecond localhost hop.

## Failure modes

- **Unregistered tool / pin mismatch** → binding `Ready=False` (`UnregisteredTool` / `RegistryMismatch`);
  the tool is excluded from the manifest, other bindings unaffected.
- **`require-approval` on an in-pod (sidecar) tool** → the agent is held `Ready=False`
  (`InPodToolRequireApprovalUnsupported`) — there is no per-pod approval shim; use `deny`, or make the
  tool remote.
- **Push fails** (pod restarting/scaled to zero) → non-fatal; the durable ConfigMap backing converges and
  a waking pod reads it. Eventual consistency even if a push never lands.
- **Fan-out ceiling hit** → the `(N+1)`th tool call in a run gets a terminal 403
  (`tool_call_ceiling_exceeded`, not a retryable 429).
- **Sidecar down** → the agent falls back to the durable tools manifest mount; remote tool calls still
  work.

## See also

- [MCPToolBinding reference](/reference/crd/mcptoolbinding/) · [AgentDeployment reference](/reference/crd/agentdeployment/)
  (`spec.runtime.toolPolicy`)
- [Approvals](/guides/approvals/) · [Bring your own MCP](/guides/bring-your-own-mcp/)
- [Security model](/concepts/security-model/) · [Custom resources](/concepts/custom-resources/)
