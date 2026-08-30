---
title: Bring your own MCP
description: "Register your own MCP server, auth tiers (key/bearer → OAuth 2.1), per-user on-behalf-of grants, and sharing."
---

**Goal:** register your own MCP server so agents can call it — with the right authentication tier, with
each user acting on their **own** credential, and optionally shared so teammates can discover and connect
it.

**Prerequisites:** the platform installed; an MCP server reachable from the cluster; for OAuth, the
server's OAuth client configuration. Once registered, you bind and govern tools as in
[Tools & MCP](/guides/tools-and-mcp/).

## How registering a server works

Registering an MCP server is a **console / BFF** action (not a hand-authored CRD): it creates a small
**bundle** in your namespace — a `ToolRegistry` catalog entry, a credential Secret (if the server is
credentialed), a `SecretBinding`, and a per-server egress NetworkPolicy. Tokens land **only** in the
Secret, held in a locked credential namespace, never in a CRD, a DTO, a log, or the agent container. The
backend that *stores and refreshes* those credentials is selected by a
[`CredentialStore`](/reference/crd/credentialstore/) (see step 3). See
[Identity](/concepts/identity/) for the on-behalf-of model.

## 1. Register the server (pick an auth tier)

Register through the console's **MCP servers** page. The auth tier determines whose credential the
runtime hop uses (`credentialSource`):

| Auth tier | `credentialSource` | Runtime credential |
|-----------|--------------------|--------------------|
| **No auth** (public) | `none` (derived, forced) | none attached |
| **Key / bearer** | `shared` (one admin-set) or `byo-oauth` | a static key, or each user's own |
| **OAuth 2.1** | `byo-oauth` | each invoking user's own OAuth grant (OBO) |

Register defaults are **reach-preserving**: a no-auth server registers as namespace-visible (`team`,
`none`); a keyed/OAuth server registers **owner-only** (`private`, `byo-oauth`). Widening beyond your
team is always an explicit **Publish** act (step 4).

## 2. Per-user on-behalf-of (OBO) grants

For a `byo-oauth` (OAuth 2.1) server, no shared credential exists. The first time a user's run needs the
tool, the platform surfaces a **"Connect your account"** consent; the user authorizes, and a per-user
grant is stored. From then on, **that user's** agent runs call the server **as that user** — refreshed
and revocable, fully audited. The mechanics that make this safe:

- The invoking user's identity travels as an **unforgeable, short-TTL run capability** the agent
  *relays* but cannot forge; the caller's Kubernetes token never enters the agent pod.
- The **egress sidecar** resolves the run capability to the user's grant and injects the credential at
  the wire — the token stays **out** of the agent container.
- Grant resolution precedence: a **public** server attaches no credential; a user's **personal** grant
  wins over a shared org credential (use *my* account); otherwise the shared credential; otherwise
  **consent-required**.
- **Unattended runs** (cron/eventing, no invoking user) authenticate via the pod's projected
  ServiceAccount token → only public/shared credentials; a personal-only tool surfaces
  consent-required on the agent (never a cross-user token).
- A **personal** server bound to a shared agent is **owner-only** — another invoker gets a terminal
  "private to its owner" error, not a consent prompt (they can't consent to a server they can't see).

## 3. Choose where credentials are stored (CredentialStore)

The credential **backend** is a config choice, not a rebuild. A `ClusterCredentialStore` sets the
cluster-wide default; a namespaced `CredentialStore` overrides it for one namespace. The token-service
constructs and health-checks the selected backend and does the OAuth refresh — **agent pods hold no
backend credentials**.

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: ClusterCredentialStore
metadata:
  name: cluster-default
spec:
  provider:
    postgres:                        # exactly one of kubernetes | postgres | openbao | remote
      dsnSecretRef:
        name: cred-postgres-dsn
        key: dsn
      encryption:                    # a Postgres backend refuses plaintext — it must have a KEK
        localKEKSecretRef:
          name: cred-kek
          key: kek
```

The zero-dependency default is `kubernetes` (grants stored as Secrets in the locked credential
namespace). Check the store is healthy:

```bash
kubectl get clustercredentialstore cluster-default \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
# → True   (the token-service constructed and health-checked the backend)
```

See the [CredentialStore reference](/reference/crd/credentialstore/) for the `postgres` encryption
custodians (local KEK / OpenBao transit / KMS v2), `openbao`, and `remote` (BYO vault over mTLS).

## 4. Share a server across a team or the org

Two orthogonal axes control sharing — **visibility** (who can discover it) and **credentialSource**
(whose credential the hop uses):

- **`visibility ∈ {private, team, org, public}`** — `private` = owner-only, `team` = your namespace,
  `org` = your Tenant's namespaces, `public` = all tenants.
- **`credentialSource ∈ {byo-oauth, shared, none}`** — each invoker's own OBO grant, one admin-set
  credential, or none (derived for no-auth servers).

**Publish** widens visibility (tiered by blast radius — `→team`, `→org`, `→public` each need a higher
authorization). The flagship pattern is **`public/org × byo-oauth`**: publish the server *definition* so
teammates discover it, and each connects their **own** account — your secret is never shared. Publishing
opens **no** egress by itself.

**Connect (materialize)** imports a discovered server's **definition** into the caller's namespace — url,
tools, and non-secret OAuth client config only. **No credential crosses the namespace boundary**: the
publisher's Secret is never read, and the copy is frozen (a one-time snapshot, so a compromised publisher
can't redirect a consumer's traffic). The existing per-namespace approval, egress, and OBO-consent path
then runs unchanged in the consumer's namespace.

:::caution
Forbidden sharing cells are rejected on write: **`private × shared`** (pointless) and **`public × shared`**
(a cross-tenant confused-deputy — never share one credential across tenants).
:::

## When to use / when not

- **Use `byo-oauth`** for any per-user service (GitHub, Drive, a SaaS API) — each user acts as
  themselves, and the publisher never shares a token.
- **Use `shared`** only for a genuinely org-wide service credential set by an admin, at `team`/`org`
  visibility.
- **Not** for a platform-approved catalog tool that already exists — just bind it
  ([Tools & MCP](/guides/tools-and-mcp/)).

## Defaults

- No-auth servers register `(team, none)`; keyed/OAuth servers register `(private, byo-oauth)`.
- Default credential backend: `kubernetes` (grants as Secrets in the locked credential namespace).
- OAuth grants refresh ahead of expiry (60s skew) with single-flight refresh; revoke does RFC 7009 at
  the authorization server.

## Failure modes

- **Mid-run consent-required** → the run surfaces a structured `consent_required` tool result and a
  "Connect your account" prompt; the model is told to stop, not retry.
- **Connecting an undiscoverable server** → **404** (existence is never confirmed — no oracle), a
  fail-closed guard.
- **Publish beyond your authorization** → denied (a caller-scoped RBAC check per widening tier).
- **`postgres` backend without a KEK** → rejected by admission; a Postgres backend refuses to store
  plaintext tokens (exactly one KEK custodian required).
- **Org-credential write by a non-admin** → denied (RBAC on the credential namespace) — the
  credential-substitution attack surface is closed.

## See also

- [CredentialStore reference](/reference/crd/credentialstore/) · [MCPToolBinding reference](/reference/crd/mcptoolbinding/)
  · [SecretBinding reference](/reference/crd/secretbinding/)
- [Identity](/concepts/identity/) · [Security model](/concepts/security-model/)
- [Tools & MCP](/guides/tools-and-mcp/) · [Approvals](/guides/approvals/)
