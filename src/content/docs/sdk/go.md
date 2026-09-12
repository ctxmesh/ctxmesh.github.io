---
title: Go SDK
description: "ctxmesh (Go): a plane-client for memory, knowledge, skills, feedback, delegation and agent-to-agent calls, with endpoints read from the injected environment."
---

The Go package is **`github.com/ctxmesh/ctxmesh/sdk/go`**, imported as `ctxmesh`. It is a
**plane client** — every launcher route reachable with typed clients and typed errors — over the
[localhost plane](/concepts/the-launcher-contract/) the platform serves beside your agent.

It holds no credentials. Endpoints and identity arrive in the environment the launcher injects, so
there is no API key to manage and no base URL to configure.

## Install

```sh
go get github.com/ctxmesh/ctxmesh/sdk/go
```

Go resolves the module from the `sdk/go/vX.Y.Z` tag via `proxy.golang.org`; there is no separate
registry entry. See [Compatibility](/reference/compatibility/) for the version to pin.

## Constructing a client

```go
import ctxmesh "github.com/ctxmesh/ctxmesh/sdk/go"

c, err := ctxmesh.New()          // reads MEMORY_PORT, CONVERSATION_ID, DELEGATE_PORT, …
if err != nil {
    // "not running in a ctxmesh pod" — the env the launcher injects is absent
}
```

`New` returns an error rather than panicking when the environment is missing, so the same binary can
run outside a pod and say so. `NewWithConfig` takes an explicit `*Config` for tests.

## Memory, knowledge, skills

```go
ctx := context.Background()

_ = c.Memory.Append(ctx, ctxmesh.Entry{Role: "user", Content: "what changed?"}, "")
history, _ := c.Memory.Get(ctx, "")
_ = c.Memory.Put(ctx, entries, "")
hits, _ := c.Memory.Search(ctx, "deploy", "", capability)

_ = c.Memory.Remember(ctx, "prefers terse answers", nil)   // long-term
facts, _ := c.Memory.SearchAgent(ctx, "contact preference", 5, 0.0)

chunks, _ := c.Knowledge.Search(ctx, "rollback procedure", "runbooks", 5)

skills, _ := c.Skills.List(ctx)
body, _ := c.Skills.Load(ctx, "deploy")
```

`Skills.Load` returns the skill **body**. Long-term memory proxies to the token service, so
`Remember` and `SearchAgent` are only wired when the platform provisions it.

## Feedback and agent-to-agent

```go
_ = c.Feedback.Score(ctx, traceID, "helpfulness", 1, "clear")

reply, _ := c.Mesh.Call(ctx, "billing-agent", map[string]any{"q": "invoice 42"})
```

## Delegation and handoff

```go
d, err := c.Runs.Delegate(ctx, "research-agent", "step-1", "call-1", capability,
    map[string]any{"topic": "pricing"})
// d.OK, d.Answer, d.SubRun, d.Suspend

h, err := c.Runs.Handoff(ctx, "escalation-agent", capability, "over to you", true)
```

Both reach the **delegate listener** (`DELEGATE_PORT`, default 2994), not the memory port — the SDK
routes them for you. `step` and `callId` are the idempotency key and are required.

## Errors

Every call returns a typed error. A route the platform has not wired for this agent returns a
`NotWired` error rather than a confusing transport failure, so "the platform did not provision
long-term memory" is distinguishable from "the call failed".

## What this tier does *not* include

The managed agent loop, tool dispatch, the model-gateway client, `serve`, prompt spotlighting and
record/replay are **authoring tier** and live in the [Python](/sdk/python/) and
[TypeScript](/sdk/typescript/) SDKs only ([ADR 0139](https://github.com/ctxmesh/ctxmesh/blob/main/decisions)).
You write your own loop and call the model gateway over plain HTTP at `$MODEL_GATEWAY_URL`.

That is not a gap so much as the tier's premise: every capability here is a localhost HTTP endpoint,
so this package is convenience, never a requirement. An agent in any language is fully governed and
traced without it.

## The run capability

`delegate`, `handoff`, per-user session memory and per-user knowledge each need the caller's **run
capability** — the `X-Ctxmesh-Run-Capability` header. It is an explicit per-call parameter rather
than client state, because a capability is minted for one run and a field on a long-lived client
would outlive it.

Where the route requires it, the SDK refuses locally with a typed error instead of sending a request
the launcher will reject. **Session memory is the one that fails quietly**: omit the capability there
and the launcher falls back to the agent-wide bucket with no error, so the parameter is visible on
every memory call for exactly that reason.

## See also

- [SDKs](/sdk/) — the six packages and what each tier gives you
- [Compatibility](/reference/compatibility/) — which SDK works with which ctxmesh
- [The launcher contract](/concepts/the-launcher-contract/) — the plane this wraps
- [Launcher endpoints](/reference/launcher-endpoints/) — the raw HTTP surface
