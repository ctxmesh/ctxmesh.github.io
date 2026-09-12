---
title: Rust SDK
description: "ctxmesh (Rust): a plane-client crate for memory, knowledge, skills, feedback, delegation and agent-to-agent calls, with endpoints read from the injected environment."
---

The Rust crate is **`ctxmesh`**. It is a **plane client** — every launcher route reachable with typed
clients and a typed `Error` — over the [localhost plane](/concepts/the-launcher-contract/) the
platform serves beside your agent.

It holds no credentials. Endpoints and identity arrive in the environment the launcher injects.

## Install

```sh
cargo add ctxmesh
```

`cargo add` selects the current pre-release while no stable exists. See
[Compatibility](/reference/compatibility/) for the version.

## Constructing a client

```rust
use ctxmesh::{Client, Entry};

let cx = Client::from_env()?;     // reads MEMORY_PORT, CONVERSATION_ID, DELEGATE_PORT, …
```

`from_env` returns `Result`, so a binary run outside a pod reports why rather than panicking.
`Client::with_config` takes an explicit config for tests.

## Memory, knowledge, skills

```rust
cx.memory_append(&Entry { role: "user".into(), content: "what changed?".into() }, None)?;
let history = cx.memory_get(None)?;
let hits = cx.memory_search("deploy", None, Some(capability))?;

cx.remember("prefers terse answers", None)?;          // long-term
let facts = cx.search_agent("contact preference", 5, 0.0)?;

let chunks = cx.knowledge_search("rollback procedure", Some("runbooks"), 5)?;

let skills = cx.skills()?;
let body = cx.skill_load("deploy")?;
```

## Feedback and agent-to-agent

```rust
cx.feedback(&trace_id, "helpfulness", 1.0, Some("clear"))?;
let reply = cx.call_agent("billing-agent", serde_json::json!({"q": "invoice 42"}))?;
```

## Delegation and handoff

```rust
let d = cx.delegate("research-agent", "step-1", "call-1", capability,
                    serde_json::json!({"topic": "pricing"}))?;
let h = cx.handoff("escalation-agent", capability, Some("over to you"), true)?;
```

Both reach the **delegate listener** (`DELEGATE_PORT`, default 2994), not the memory port. `step` and
`call_id` are the idempotency key and are required — the crate refuses locally if either is empty.

## Errors

`Error` distinguishes a transport failure from `Error::Invalid` (a required argument missing) and
from a route the platform has not wired for this agent, so a configuration gap does not present as a
network problem.

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
