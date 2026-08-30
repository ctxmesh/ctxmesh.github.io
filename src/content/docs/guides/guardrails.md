---
title: Guardrails
description: "Govern what an agent can say — PII, denylists, an optional judge — enforced in-pod, fail-closed."
sidebar:
  order: 3
---

**Goal:** attach content governance to an agent — enforced in the pod, before any offending output
reaches a client.

**Prerequisites:** an agent deployed ([Deploy an agent](/guides/deploy-an-agent/)).

## What a GuardrailPolicy does

A [`GuardrailPolicy`](/reference/crd/guardrailpolicy/) governs the agent's content on the
request/response path, enforced **in-pod by the launcher** (an in-path proxy). The deterministic
layers are **fail-closed**: if the engine can't run, the request is denied (`failMode: closed`).

## 1. Author the policy

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: GuardrailPolicy
metadata:
  name: default-guardrails
  namespace: my-team
spec:
  piiDetectors:
    builtIns: true                 # email / SSN / key detectors
  patternDenylist:
    - name: internal-codename
      pattern: 'ACME-[A-Z]{4}'     # RE2
      action: block                # block | redact | auditOnly
      appliesTo: output            # input | output | toolOutput | all
  failMode: closed                 # closed (deny on engine error) | open
```

Optional layers:
- **`semanticJudge`** — a fenced LLM-judge classification layer (`enabled` + a cheap `modelRoute`). It
  adds latency + cost, is **off by default**, and **fails open** — it is never the basis of a
  fail-closed guarantee.
- **`userRateLimit`** — per-end-user request/spend/concurrency limits.

## 2. Attach it to the agent

```yaml
spec:
  guardrailPolicyRef: default-guardrails
```

A dangling ref **holds the agent** `Ready=False` — a guardrail with a hole is not a guardrail.

## 3. Verify

```bash
kubectl get guardrailpolicy default-guardrails -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Validated")].status}'   # True when all patterns compile
```

Send input/output that trips a rule; the block is a typed **`guardrail_blocked`** (HTTP 403,
non-retryable). A `redact` rule mutates the content and continues. Every decision is traced.

## Streaming

Guarded agents are **buffered** by default (output-blocking can't un-send tokens). A policy may opt
into **streaming** (`spec.streaming.mode: Enabled`) — the launcher then holds a rolling window and
releases tokens only once provably clean — but **only when the policy is provably stream-safe**
(bounded output detectors, no judge). The effective mode + reason are reported on
`status.streaming` and in the console. See [ADR-backed behavior](/reference/crd/guardrailpolicy/).

## When to use / when not

- **Use** on any agent handling user or PII content.
- **Not a defense against novel prompt injection** — the denylist is a tripwire for *known* patterns,
  not resistance to unseen attacks. Combine with approvals for risky tools.

## Failure modes

- Engine can't run / body over the size cap / malformed → **blocked** (`failMode: closed`).
- Judge unreachable → judge skipped (fails open); the deterministic layers still apply.

## See also

[GuardrailPolicy reference](/reference/crd/guardrailpolicy/) · [Approvals](/guides/approvals/) · [Security model](/concepts/security-model/)
