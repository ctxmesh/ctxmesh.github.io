---
title: Record & replay
description: "Capture a run's model + tool I/O as a portable fixture, then replay it off-cluster for deterministic, provider-free CI."
---

**Goal:** capture a real run's model + tool I/O once, then replay it deterministically off-cluster — with
**both** channels mocked, the same agent image, and zero provider calls or cluster dependencies — so a
regression test runs in CI for free.

**Prerequisites:** an agent deployed ([Deploy an agent](/guides/deploy-an-agent/)); the `agentry` CLI
on your `PATH`; a durable object store configured (record mode writes the fixture there — see
[Failure modes](#failure-modes)).

## How record & replay works

Capture rides the **two platform proxies** already in an agent pod, so any contract-honoring agent is
captured by trusted platform code — not by instrumenting your container:

- the **launcher gateway** records the **model** channel (raw response bytes, including SSE framing);
- the **egress sidecar** records the **tool** channel, captured **before** any credential is injected — so
  a fixture never contains a token.

Enablement and capture are **orthogonal**:

- **Enablement is per-deployment** — `spec.record: true` on the `AgentDeployment` makes the agent
  *record-capable* (the controller forces the launcher gateway on and fronts every tool through the egress
  sidecar).
- **Capture is per-run** — a run opts in with `record: true`; a record-capable agent's non-recorded runs
  write nothing.

The result is a **portable fixture**: a versioned, content-addressed object-store blob (VCR-cassette
shape — ordered interactions per channel with request matchers). It is the load-bearing artifact you share
and pin in CI.

## 1. Make the agent record-capable

Set `spec.record` on the agent (see [`spec.record`](/reference/crd/agentdeployment/)):

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: support-agent
  namespace: my-team
spec:
  image: ghcr.io/my-org/support-agent:1.0.0
  executionModel: serving
  record: true                  # record-capable: forces the launcher gateway on + fronts all tools
```

```bash
kubectl apply -f support-agent.yaml
kubectl get agentdeployment support-agent -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
# → True once the record-capable revision is up.
```

## 2. Record a run

Opt a single run in by passing `record: true` when you create it (console **Playground**, or the run API):

```jsonc
// POST /api/runs
{ "agent": "my-team/support-agent", "input": "…", "record": true }
```

The BFF **fails the run closed with a 400** if the agent is not record-capable (there is no gateway to
capture at — never a silent no-capture). When it opts in, both proxies write partial fixture blobs under the
run's prefix in the object store. Note the run id from the response.

:::note
The exact run-creation request body finalizes toward GA; the load-bearing contract is `record: true` at
run creation against a record-capable agent (`spec.record: true`). Use the console Playground's record
toggle when in doubt.
:::

## 3. Download the fixture

Merge the run's partial blobs (the model channel + the tool channel) into one local file:

```bash
# The object store is read from the environment, exactly as the recorder wrote it:
export OBJECT_STORE_ADDR=…  OBJECT_STORE_ACCESS_KEY=…  OBJECT_STORE_SECRET_KEY=…

agentry download-fixture run-abc123
# writes ./run-abc123.fixture.json (0600 — sensitive-by-default, do NOT commit it)
```

The fixture holds full prompts + tool results, so it is **sensitive-by-default** and **not for git**. A
credential in a fixture is treated as an incident — every write and read is gated by a no-credentials
check.

## 4. Replay it — no provider, no cluster

Replay swaps the gateway for a both-channel mock driven by the fixture, runs the **same** agent image to
completion, and reports:

```bash
agentry dev --replay run-abc123.fixture.json
# model calls  → the Nth recorded model response, byte-identical (SSE re-served verbatim)
# tool calls   → recorded tool results, matched by call-id / name+args
```

`--replay` cannot be combined with `--provider real` (both channels come from the recording). Point your CI
job at the same command.

## 5. Gate CI on the replay

The replay maps its verdict to an **exit code** so CI triages "my code broke" vs "my code changed
behavior" without reading logs:

- **`0`** — pass. Byte-level request drift (e.g. a prompt timestamp changed) is served from the recording
  and merely **warned** (`model_request_drift`).
- **`1`** — the agent process itself failed.
- **`2`** — **structural divergence**: more model calls than recorded (`model_index_overflow`) or an
  unrecorded tool call (`tool_call_unrecorded`) — a hard fail with a comprehensible report.

```bash
agentry dev --replay run-abc123.fixture.json
echo "replay exit: $?"   # 0 pass · 1 agent failed · 2 behavior diverged
```

## When to use / when not

- **Use** to turn a real bug or a golden run into a deterministic regression test that runs provider-free
  in CI, and to hand a teammate a repro they can replay locally.
- **Not** for online quality scoring — that is the [deploy gate](/guides/evals-and-the-deploy-gate/). And
  **never** replay only the model channel against live tools: replay mocks **both** channels precisely
  because replayed model responses re-issue the same tool calls.

## Defaults

- `spec.record` defaults to **`false`** — the agent is not record-capable and the gateway interposition is
  byte-for-byte unchanged (zero overhead).
- A record-capable agent's runs write **nothing** unless the run opts in with `record: true`.
- Divergence is **lenient on bytes** (request-hash mismatch → serve recorded + warn) and **strict on
  shape** (structural mismatch → hard fail).

## Failure modes

- **Record enabled, no object store** → a record-capable proxy with no fixture sink is a **hard startup
  error** (never a silent capture-nothing). Configure the durable object store first.
- **`record: true` on a non-record-capable agent** → the run is refused with an HTTP **400** (set
  `spec.record` on the AgentDeployment).
- **`download-fixture` exit codes** — `0` ok; `1` validation error (no run id / object store unconfigured);
  `2` the run has no recorded fixture, or a fetch/merge/write error.
- **Structural divergence on replay** → exit `2` with a report naming the diverging step; that means the
  agent's behavior changed, not that the environment is broken.

## See also

- [Observability & tracing](/guides/observability-and-tracing/) (where a run's step tree lives) ·
  [Evals & the deploy gate](/guides/evals-and-the-deploy-gate/) (online quality)
- [AgentDeployment reference](/reference/crd/agentdeployment/) (`spec.record`) ·
  [Runs & execution](/concepts/runs-and-execution/)
