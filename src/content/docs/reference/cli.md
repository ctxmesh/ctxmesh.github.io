---
title: CLI
description: "The ctxmesh CLI: expand, dev [--ui|--replay], eval, download-fixture, replay-serve — flags, exit codes, and env."
---

The command-line tool is a single binary (`ctxmesh`) with a handful of subcommands for authoring,
local iteration, the CI/CD eval gate, and record/replay. Everything the CLI does is also reachable from
the console — the CLI is the scriptable, CI-friendly path.

:::note
Exact distribution coordinates finalize toward GA. Flags and exit codes below are confirmed against
the shipped commands.
:::

## `expand`

Expand the simplified `agent.yaml` authoring format into a full `AgentDeployment` manifest, printed to
stdout.

```
ctxmesh expand <file>
```

- Reads the simplified format (`name`, `image`, `executionModel`, `resources`, `scaling`, `model.route`,
  and the fields added in later milestones) and prints the expanded `AgentDeployment` YAML.
- An **unknown top-level field** is a hard error naming the field (no silent drops). A field not yet
  supported is rejected with an explicit "not yet supported" message.
- Round-trips cleanly with `kubectl apply -f -`.

## `dev`

Run an agent locally — no cluster — against a mock or real model gateway, optionally with the console UI
or a recorded replay.

```
ctxmesh dev [flags]
```

| Flag | Default | Meaning |
|------|---------|---------|
| `-f, --file` | `agent.yaml` | Path to the `agent.yaml` to run. |
| `-p, --port` | `8080` | Host port to publish the agent's `/invoke` on. |
| `--provider` | `mock` | Gateway backend: `mock` (deterministic `MOCK_OK`) or `real`. |
| `--model` | — | Upstream model id for `--provider real` (e.g. `openai/gpt-4o-mini`). |
| `--base-url` | — | Upstream base URL for `--provider real` (optional; provider default otherwise). |
| `--key-env` | — | Name of the host env var holding the API key for `--provider real`. |
| `--no-wait` | `false` | Render + bring the stack up but don't block or run the readiness smoke. |
| `--ui` | `false` | Also serve the console UI (dev-mode BFF: config preview + local `/invoke`, no cluster, no login). |
| `--ui-port` | `8888` | Host port for the console UI when `--ui` is set. |
| `--ui-dist` | `ui/dist` | Directory of the built SPA to serve with `--ui`. |
| `--replay` | — | Replay a recorded fixture (a merged fixture JSON or a dir of partial blobs) — swaps the gateway for a both-channel replay mock so model + tool I/O come from the recording (deterministic, zero cluster deps). |

**Replay exit codes:** `0` = pass · `1` = agent error · `2` = structural divergence from the recording.

## `eval`

Run the CI/CD eval gate for a candidate `agent.yaml`: apply it to an eval namespace as a **zero-traffic
preview**, poll the in-cluster eval-gate to a terminal phase, and exit with a structured report.

```
ctxmesh eval --candidate agent.yaml --min-score 0.80
```

| Flag | Default | Meaning |
|------|---------|---------|
| `--candidate` | — (**required**) | Path to the `agent.yaml` to evaluate. |
| `--min-score` | — (**required**) | Minimum score required to pass, in `[0,1]`. |
| `--dataset` | — | Override the `EvalSuite`'s dataset ref (uses the `agent.yaml` `eval.dataset` when omitted). |
| `--namespace` | `agent-eval` | Eval namespace to apply the candidate into. |
| `--output` | `json` | Report format: `json` or `junit`. |

**Exit codes:** `0` = pass (score ≥ `--min-score`) · `1` = fail (terminal decision below threshold) ·
`2` = infra (kubeconfig missing, apply failed, timeout, other infra error). The candidate is held at 0%
traffic during eval; applied resources are deleted on exit (best-effort). See
[Evals & the deploy gate](/guides/evals-and-the-deploy-gate/).

## `download-fixture`

Download and merge a recorded run's replay fixture from the object store into a local file.

```
ctxmesh download-fixture <run-id> [-o out.json]
```

- Pulls every partial fixture blob a run recorded — the **model channel** (captured at the launcher
  gateway) and the **tool channel** (captured at the egress sidecar) — from the durable object store,
  merges them into one fixture, and writes it. Default output: `<run-id>.fixture.json` in the current
  directory.
- Reads the object store from the environment (below).
- A fixture is **sensitive by default** (full prompts + tool results) — the file is written `0600`;
  treat it accordingly and do not commit it.

**Exit codes:** `0` = ok · `1` = validation error (no run id / store unconfigured) · `2` = no recorded
fixture, or a fetch/merge/write error.

| Env | Meaning |
|-----|---------|
| `OBJECT_STORE_ADDR` | `host:port` of the durable object store (required). |
| `OBJECT_STORE_ACCESS_KEY` | Access key. |
| `OBJECT_STORE_SECRET_KEY` | Secret key. |

Typical loop:

```bash
ctxmesh download-fixture run-abc123
ctxmesh dev --replay run-abc123.fixture.json
```

See [Record & replay](/guides/record-and-replay/).

## `replay-serve`

Serve a recorded fixture as the both-channel replay mock.

```
ctxmesh replay-serve <fixture-path> [-p 4000]
```

Internal — this is what `dev --replay` uses under the hood; documented for completeness. `-p/--port`
defaults to `4000`.

## Datasets, labeling, and cost governance

Dataset **export** and **labeling** are not CLI subcommands — they run as a run-worker job (export from
traces, redacted) and an append-only label API, driven from the console or the HTTP API (`POST
/api/datasets/{name}/export`, `POST /api/datasets/{name}/cases/{caseId}/labels`,
`POST /api/datasets/{name}/pin`). Judge cost caps for online scoring are control-plane spend the CLI
does not touch. See [HTTP API](/reference/http-api/) and
[Feedback & improvement](/guides/feedback-and-improvement/).

## See also

- [HTTP API](/reference/http-api/)
- [Record & replay](/guides/record-and-replay/)
- [Evals & the deploy gate](/guides/evals-and-the-deploy-gate/)
- [Deploy an agent](/guides/deploy-an-agent/)
- [API group](/reference/api-group/)
