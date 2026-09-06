---
title: Compatibility and versioning
description: "Which SDK works with which ctxmesh, what the version number does and does not promise, and how the in-pod plane contract is versioned."
---

## The short version

**The SDKs ship at the product's version.** A ctxmesh release and the Python and TypeScript
SDKs published alongside it carry the same version string, minted from the same git tag. If
you are running ctxmesh `0.1.0-beta.1`, use the SDK `0.1.0-beta.1`.

| SDK (`ctxmesh` on PyPI / npm) | ctxmesh | Status |
| --- | --- | --- |
| `0.1.0-beta.1` | `0.1.0-beta.1` | current |

## What the version number does *not* tell you

This is the cost of matched versioning and it is worth stating plainly: **the SDK's version
carries no independent semver signal.** A bump from `0.1.0-beta.1` to `0.1.0-beta.2` means
*ctxmesh* released, not that the SDK's own API changed — and equally, an SDK release with no
API change still gets a new number.

So do not read an SDK bump as "something in my code may break". Read the
[changelog](https://github.com/ctxmesh/ctxmesh/blob/main/CHANGELOG.md) instead, which says what
actually changed and calls breaking changes out explicitly.

We chose matched versions because, before 1.0, an unambiguous answer to *"which SDK do I
install?"* is worth more than a semver signal on a surface that is still moving. The same
choice is made by the Elasticsearch clients and by Kubernetes' `client-go`, which tracks the
Kubernetes minor. After 1.0 the SDKs may move to independent semver with a compatibility
matrix; going that direction later is easy, and the reverse is not.

## The support window

- An SDK is supported against **the ctxmesh it shipped with**, and forward against **later
  patches of the same minor** — `0.1.0-beta.1` through `0.1.x`.
- Older SDKs keep working across a minor by design (see the plane contract below), but only
  the matching pair is *tested* together in CI.
- Pre-1.0, a minor version may carry breaking changes. They are always in the changelog.

## The contract underneath: the in-pod plane

Your agent's code never talks to ctxmesh over the network. It talks to the **launcher** beside
it in the same pod, over localhost — memory, the model gateway, AMP calls to other agents,
delegation, feedback. That localhost surface is the real compatibility boundary, because the
SDK ships inside *your* image and the launcher ships with the platform, so the two are upgraded
on different days by different people.

The plane is therefore versioned the way the CRDs are — `v1alpha1`, `v1beta1`, stable — and
changes to it follow the same rule:

- A new name for an existing endpoint or header is **served alongside the old one**, never
  instead of it, for at least one minor.
- The launcher **accepts** a new form before anything **emits** it, so a newer component can
  never hand an older one something it cannot read.
- Removal only happens after a deprecation window, and always with a changelog entry.

The AMP rename is the worked example: the launcher serves `POST /amp/{target}` *and*
`/a2a/{target}`, and accepts `X-AMP-Envelope` *and* `X-A2A-Envelope`, so an SDK predating the
rename keeps working against a launcher that postdates it.

## Kubernetes

ctxmesh is tested against the Kubernetes versions its CRDs and Knative dependency support.
Requirements are listed under [installation](/getting-started/installation/); the chart's
`kubeVersion` constraint is authoritative and Helm will refuse an install on an unsupported
cluster rather than fail halfway.

## Where releases are announced

- **[GitHub Releases](https://github.com/ctxmesh/ctxmesh/releases)** — the canonical notes for
  each version, generated from the changelog entry for that tag.
- **[CHANGELOG.md](https://github.com/ctxmesh/ctxmesh/blob/main/CHANGELOG.md)** — the full
  history in one file.
- **[Upgrading](https://github.com/ctxmesh/ctxmesh/blob/main/docs/upgrading.md)** — what to do
  when a release needs you to do something, including the breaking changes.
