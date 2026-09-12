---
title: Ruby SDK
description: "ctxmesh (Ruby): a plane-client gem for memory, knowledge, skills, feedback, delegation and agent-to-agent calls, with endpoints read from the injected environment."
---

The Ruby gem is **`ctxmesh`**. It is a **plane client** — every launcher route reachable with typed
clients and a typed `Error` — over the [localhost plane](/concepts/the-launcher-contract/) the
platform serves beside your agent.

It holds no credentials. Endpoints and identity arrive in the environment the launcher injects.

## Install

```ruby
gem "ctxmesh"
```

Bundler resolves the current pre-release from a Gemfile without help. Installing directly needs
`--pre` while the gem is in beta, because `gem install` will not select a pre-release on its own:

```sh
gem install ctxmesh --pre
```

## Constructing a client

```ruby
require "ctxmesh"

cx = Ctxmesh::Client.from_env    # reads MEMORY_PORT, CONVERSATION_ID, DELEGATE_PORT, …
```

## Memory, knowledge, skills

```ruby
cx.memory_append({ role: "user", content: "what changed?" })
history = cx.memory_get
hits    = cx.memory_search("deploy", capability: capability)

cx.remember("prefers terse answers")               # long-term
facts = cx.search_agent("contact preference", top_k: 5)

chunks = cx.knowledge_search("rollback procedure", knowledge_base: "runbooks", top_k: 5)

skills = cx.skills
body   = cx.skill_load("deploy")
```

## Feedback and agent-to-agent

```ruby
cx.feedback(trace_id, "helpfulness", 1.0, comment: "clear")
reply = cx.call_agent("billing-agent", { q: "invoice 42" })
```

## Delegation and handoff

```ruby
d = cx.delegate("research-agent", step: "step-1", call_id: "call-1",
                capability: capability, input: { topic: "pricing" })

h = cx.handoff("escalation-agent", capability: capability,
               message: "over to you", include_history: true)
```

Both reach the **delegate listener** (`DELEGATE_PORT`, default 2994), not the memory port. `step:` and
`call_id:` are the idempotency key and are required — the gem raises locally if either is missing.

## Errors

`Ctxmesh::Error` covers transport and protocol failures; `Ctxmesh::NotWiredError` is raised when a
route the platform has not provisioned for this agent is called, so a configuration gap is
distinguishable from a network one.

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
