---
title: Identity
description: "Console persona vs agent ServiceAccount vs end-user OIDC, and on-behalf-of credential identity."
---

"Who is acting?" has more than one answer in an agent platform, and conflating them is how systems
leak authority. ctxmesh keeps **three identities** structurally separate — the operator at the console,
the agent's own pod identity, and the end-user talking to a running agent — plus a fourth idea layered
on top: **on-behalf-of**, the identity an agent's *tool calls* run as. This page explains the four and
why the separation is load-bearing rather than incidental.

## The three identities

```
   ┌─ Console persona ─────────────┐   who authored / operates the platform
   │  your Kubernetes identity     │   → caller-scoped RBAC (you, at the console)
   └───────────────────────────────┘

   ┌─ Agent ServiceAccount ────────┐   the agent pod's own K8s identity
   │  unprivileged, per-agent      │   → holds no user power, no secrets
   └───────────────────────────────┘

   ┌─ End-user (OIDC) ─────────────┐   a person chatting with a deployed agent
   │  their own login, per-tenant  │   → verified by the BFF; NO K8s client built
   └───────────────────────────────┘
```

### Console persona — your Kubernetes identity

When you use the console, you act as *yourself*. The [BFF](/concepts/architecture/) builds a
caller-scoped Kubernetes client from your bearer token, and the API server enforces your RBAC
(`operator` / `developer` / `viewer`). There is no privileged service account behind the console to
elevate through — this is the [caller-scoped principle](/concepts/security-model/). The persona governs
*authoring and operating* the platform.

### Agent ServiceAccount — the pod's own identity

A running agent pod has its own Kubernetes ServiceAccount, and it is deliberately **unprivileged**. It
is not the caller, and it is not the end-user. Tool credentials do not resolve at the pod level — they
resolve per invoking user (below) — so a compromised agent gains no user's access simply by being a
pod. The agent's SA identity is for the platform's own plumbing, not for reaching your data.

### End-user identity — OIDC, per tenant, K8s-free

An end-user chatting with a deployed agent (via a `/chat` surface) logs in with **their own identity**,
through a **per-tenant OIDC issuer** configured on `Tenant.spec.endUserIdentity` (`enabled`, `issuer`,
`clientId`). This is a different plane from the console persona: end-users are *customers of an agent*,
not operators of the platform. The BFF verifies the end-user's ID token and mints a run capability
carrying the end-user's `sub` — an implicit RFC 8693 token exchange — and, importantly, **builds no
Kubernetes client for the end-user**. The end-user path is structurally K8s-free: their OIDC token can
never become cluster authority. The persisted principal is typed `oidc:<iss>#<sub>` and keyed on
`(iss, sub)` — **never email** — so identity is stable and privacy-preserving.

Reaching an agent as an end-user requires **two keys**, and both must be set — a clean separation of
who decides what:

- the tenant admin enabled end-user login (`Tenant.spec.endUserIdentity.enabled` — *who may log in*),
  **and**
- the agent owner exposed the agent (`AgentDeployment.spec.endUserAccess = true` — *what they reach*).

The controller mirrors an exposed agent into a table the BFF reads with **zero new RBAC**;
**row-existence is the exposure gate**, fail-closed — no row means a `404` (not end-user-facing), an
agent that isn't Ready means a `409`.

:::note
Per-tenant generic OIDC end-user identity is built; enterprise federation (SAML, SCIM, multi-IdP)
finalizes toward GA as a commercial capability.
:::

## On-behalf-of — the identity a tool call runs as

The three identities above are *who is present*. On-behalf-of (OBO) is *whose authority a tool call
carries*. When an agent calls an external tool "as the user," the platform resolves the **invoking
user's** stored credential and injects it at the [egress sidecar](/concepts/security-model/) — the
user's credential never enters the agent container, and the agent relays a **run capability** it cannot
forge rather than asserting any identity itself.

The key insight is that OBO threads the *end-user's* identity (from their OIDC `sub`, carried in the run
capability) all the way to the tool call — so an agent acting for Alice uses Alice's Google grant, not a
shared key and not the agent's SA. Across a [delegation or handoff](/concepts/multi-agent/), the same
capability is inherited within the trust boundary, so teammate agents act as the same user without
re-consenting — and a call outside the boundary is denied.

## Why keep them separate

Because collapsing any two of these is a privilege-escalation waiting to happen. If the console shared a
privileged SA, a UI bug would become a cluster compromise. If the agent's SA could resolve any user's
credential, a prompt injection would exfiltrate everyone's tokens. If an end-user's OIDC token minted a
Kubernetes client, a customer of one agent would hold cluster authority. The separation isn't
bureaucracy — each boundary removes a class of escalation, and the fourth idea (OBO) is what lets the
platform still do useful, user-scoped work *across* those boundaries without ever merging them.

## See also

- [Security model](/concepts/security-model/) — the run capability, egress, fail-closed
- [Multi-agent](/concepts/multi-agent/) — inherited on-behalf-of across teams and handoffs
- [Architecture](/concepts/architecture/) — the caller-scoped console/BFF
- [RBAC](/operations/rbac/) · [Credential stores](/operations/credential-stores/) · [Tenancy operations](/operations/tenancy-operations/)
- [Tenant reference](/reference/crd/tenant/) · [AgentDeployment reference](/reference/crd/agentdeployment/)
