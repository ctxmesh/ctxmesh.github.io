---
title: Security model
description: "Trust boundaries: caller-scoped RBAC, on-behalf-of run capabilities, egress control, and the fail-closed doctrine."
---

ctxmesh treats the agent container as **the least-trusted thing in the system** — because a
prompt-injected agent is exactly that. Every security decision follows from one premise: *the agent
must never hold a raw secret, never assert an identity, and never be trusted to enforce a policy.* The
platform, not the agent, holds credentials, scopes identity, and enforces governance — and it does so
at boundaries the agent cannot bypass. This page is the "why" behind those boundaries; the
[Identity](/concepts/identity/) page details who is who.

## Caller-scoped reads: the console never elevates

The [console/BFF](/concepts/architecture/) does not hold broad power over your cluster. Every read and
write it performs acts with **your** Kubernetes identity: the BFF builds a per-request client from your
bearer token, and the API server enforces *your* RBAC. A `viewer` can't create an agent through the UI
because the API server says no — not because the UI hides a button. This matters because it means the
console can't become a confused-deputy: there is no privileged service account behind it to trick into
doing something you couldn't do yourself. RBAC personas (`operator` / `developer` / `viewer`) are just
Kubernetes (Cluster)Roles over the `agents.ctxmesh.ai` CRDs; the UI merely reflects them.

The deliberate exceptions are narrow and named — for example a [shareable run
link](/guides/share-a-run/) is the platform's one unauthenticated read, authorized *at mint time* by
the creator's RBAC and scoped to exactly one run's redaction-honest projection.

## On-behalf-of: the agent relays identity, it doesn't hold credentials

When an agent calls a tool "as the user," the user's credential must never touch the agent container.
The mechanism is a **run capability**: a short-TTL, signed (EdDSA), RFC 8693-style token the BFF mints
at `/invoke`. It names the invoking user (`sub` = a user *hash*, never an email), the agent (`act`),
and its audience (the credential plane). Crucially, the agent only **relays** this token — it cannot
forge or mint one.

```
  user ──/invoke──► BFF mints run capability {sub: userHash, act: agent, aud: credential-plane}
                     │ (short-TTL, EdDSA-signed)
                     ▼
              agent pod ── relays capability (never inspects the raw credential) ──►
                     ▼
            egress sidecar ── verifies capability → resolves THIS user's grant → injects it
                     ▼
                external tool / MCP server   ← runs on behalf of the user
```

The **egress sidecar** is the enforcement point. It verifies the capability, resolves the invoking
user's stored grant for that tool server, and injects the credential into the outbound call — *after*
the request leaves the agent's control. The token stays out of the agent container; the raw secret is
added downstream. A per-`(user, server, boundary)` grant model means "run as me" resolves to *my*
account, and a captured capability for a finished run is useless (the spawn edge requires a live parent
run).

This is what makes multi-agent on-behalf-of coherent: a [delegated sub-run or a
handoff](/concepts/multi-agent/) inherits the same capability within the trust boundary, so teammates
act as the same user **without re-consent** — and a call outside the boundary is denied.

Model calls follow the same shape: they flow through the [gateway](/concepts/architecture/), so agents
never hold provider API keys, and per-conversation/agent **budgets** are enforced there before a
provider is ever hit.

## The agent pod holds no secrets

The launcher **scrubs the environment** before launching your agent, stripping platform credentials
(object-store keys, the pod's projected token, OTLP auth) from the child. Your agent reaches every
privileged capability through the [launcher's localhost plane](/concepts/the-launcher-contract/) — it
never sees the underlying secret. Provider keys live behind the gateway; user credentials live behind
the egress sidecar in a locked credential namespace readable only by the credential components; the
Kubernetes bearer token never enters the pod. The agent's own identity is its ServiceAccount, which is
deliberately unprivileged (see [Identity](/concepts/identity/)).

## Egress control

Tool traffic is brokered, not free. The egress sidecar is the single choke point for outbound tool
calls, which lets [tool-call governance](/guides/tools-and-mcp/) be enforced *unbypassably*: a
`deny` on an on-behalf-of tool is a hard 403 by construction (no token exists off the sidecar), an
in-pod tool that's denied simply isn't deployed, and a per-run fan-out ceiling caps runaway tool loops.
Approval requirements are enforced on the wire (a signed, typed voucher), not merely surfaced in the
SDK — so the wire is the boundary and the UI is presentation. Network isolation between
[registries](/concepts/multi-agent/) is enforced by NetworkPolicy underneath the app-layer checks.

## Fail closed

The doctrine that ties it together: **when in doubt, deny or hold.** A missing or dangling policy
reference doesn't serve an ungoverned agent — it sets `Ready=False` and holds the agent with no serving
revision. A guardrail-engine error, an unrunnable eval gate, an oversize body, an unverifiable
capability — each denies rather than serving. Governance references resolve *closed*. The few
deliberate fail-*open* choices are named and bounded (session memory degrades rather than failing a run;
async dedupe processes rather than dropping, since at-least-once is the contract). Everything
security-critical fails closed, and — a GA hardening rule — a security-critical config that's *missing*
makes a component **refuse to start** rather than silently resolve to a shared or public credential.

:::note
Some hardening steps (encrypted in-cluster transport / mTLS, always-on tenant-label admission) finalize
in the production-hardening track toward GA and are gated behind explicit, self-incriminating config
flags so a deferral can't silently become permanent. See
[Security posture](/operations/security-posture/).
:::

## See also

- [Identity](/concepts/identity/) — console persona vs agent SA vs end-user OIDC
- [The launcher contract](/concepts/the-launcher-contract/) — env scrub, the egress sidecar
- [Multi-agent](/concepts/multi-agent/) — inherited on-behalf-of, spawn budgets
- [Observability model](/concepts/observability-model/) — redaction before persistence
- [RBAC](/operations/rbac/) · [Secrets](/operations/secrets/) · [Security posture](/operations/security-posture/) · [Credential stores](/operations/credential-stores/)
