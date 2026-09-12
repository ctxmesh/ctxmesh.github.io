---
title: Java SDK
description: "ctxmesh (Java): a plane-client for memory, knowledge, skills, feedback, delegation and agent-to-agent calls, with endpoints read from the injected environment."
---

The Java artifact is **`ai.ctxmesh:ctxmesh`**. It is a **plane client** — every launcher route
reachable with typed clients and typed exceptions — over the
[localhost plane](/concepts/the-launcher-contract/) the platform serves beside your agent.

It holds no credentials. Endpoints and identity arrive in the environment the launcher injects.

## Install

```xml
<dependency>
  <groupId>ai.ctxmesh</groupId>
  <artifactId>ctxmesh</artifactId>
  <version>0.1.0-beta.5</version>
</dependency>
```

Maven resolves an exact version, so check [Compatibility](/reference/compatibility/) when upgrading —
a stale pin fails the build rather than silently resolving.

## Constructing a client

```java
import ai.ctxmesh.Client;

Client cx = Client.fromEnv();     // reads MEMORY_PORT, CONVERSATION_ID, DELEGATE_PORT, …
```

`Client.fromConfig` takes an explicit config for tests.

## Memory, knowledge, skills

```java
cx.memory.append(new Entry("user", "what changed?"), null);
List<Entry> history = cx.memory.get(null);
List<Entry> hits    = cx.memory.search("deploy", null, capability);

cx.memory.remember("prefers terse answers", null);          // long-term
var facts = cx.memory.searchAgent("contact preference", 5, 0.0);

var chunks = cx.knowledge.search("rollback procedure", "runbooks", 5);

var skills = cx.skills.list();
String body = cx.skills.load("deploy");
```

## Feedback and agent-to-agent

```java
cx.feedback.score(traceId, "helpfulness", 1.0, "clear");
var reply = cx.mesh.call("billing-agent", Map.of("q", "invoice 42"));
```

## Delegation and handoff

```java
Delegation d = cx.runs.delegate("research-agent", "step-1", "call-1", capability,
                                Map.of("topic", "pricing"));

Handoff h = cx.runs.handoff("escalation-agent", capability, "over to you", true);
```

Both reach the **delegate listener** (`DELEGATE_PORT`, default 2994), not the memory port. `step` and
`callId` are the idempotency key and are required — the SDK throws locally if either is blank.

## Errors

`CtxmeshException` covers transport and protocol failures; `NotWiredException` is thrown when a route
the platform has not provisioned for this agent is called, so a configuration gap does not present as
a network error.

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
