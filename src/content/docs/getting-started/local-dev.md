---
title: Local development
description: "The ctxmesh dev inner loop (with --ui) against the mock provider — build and test with zero cloud."
---

You don't need a cluster, a cloud key, or the full platform to build and iterate on an agent. The
`ctxmesh dev` command runs the **same launcher and runtime contract** your agent will meet in
production — locally, against a deterministic mock model — so you can develop the whole inner loop with
zero cloud spend. This page is the how-to; the [architecture](/concepts/architecture/) explains what
you're running.

## Why the inner loop is real

The point of `dev` is *fidelity*: it isn't a stub. It brings up the launcher as PID 1 in front of your
agent, wired to the same [localhost plane](/concepts/the-launcher-contract/) — memory, feedback,
discovery, and the model gateway — that runs in a pod. What you test locally is what runs in the
cluster, minus the cloud.

## Run an agent locally

From a directory with an `agent.yaml`:

```bash
ctxmesh dev                 # runs ./agent.yaml against the mock provider on :8080
```

`dev` renders the stack, brings it up, and runs a readiness smoke. Then talk to your agent:

```bash
curl -s localhost:8080/invoke -d '{"input": "hello"}'
```

Against the default **mock provider** the model returns a deterministic `MOCK_OK`, so runs are
reproducible and free — ideal for exercising your tool-calling loop, memory usage, and control flow
without a provider key.

Useful flags (see the full [CLI reference](/reference/cli/)):

| Flag | Default | Meaning |
|------|---------|---------|
| `-f, --file` | `agent.yaml` | the `agent.yaml` to run |
| `-p, --port` | `8080` | host port for the agent's `/invoke` |
| `--provider` | `mock` | gateway backend: `mock` (deterministic) or `real` |
| `--ui` | off | also serve the console UI (dev-mode BFF) |
| `--ui-port` | `8888` | host port for the UI when `--ui` is set |
| `--ui-dist` | `ui/dist` | directory of the built SPA to serve |
| `--replay` | — | replay a recorded fixture (zero cluster) |

## Bring up the console with `--ui`

Add `--ui` to serve the console alongside the loop — no login wall, no cluster:

```bash
ctxmesh dev --ui --ui-port 8888
```

This starts a **dev-mode BFF** bound to loopback only (`127.0.0.1`, a deliberate security property — it
can't be reached off your laptop). In dev mode the console skips the login gate and renders a reduced
chrome. The surfaces that need a real cluster (fleet, topology, providers, drift) answer an honest
`501` rather than pretending; what *does* work locally is the useful part of the inner loop:
**config preview** (expand your `agent.yaml`) and **running the agent** through a local `/invoke`.

The SPA must be built first:

```bash
make build-ui                    # builds the console into ui/dist
ctxmesh dev --ui --ui-port 8888
```

## Test against a real provider (optional)

When you want a real model in the loop, switch the gateway backend — the key is injected into the
**gateway container only**, never onto your agent's disk or into its environment:

```bash
ctxmesh dev --provider real --key-env OPENAI_API_KEY --model openai/gpt-4o-mini
```

## Replay a recorded run (deterministic, zero cloud)

If a run was [recorded](/guides/record-and-replay/) into a fixture, replay it locally with **both
channels mocked** — model *and* tool I/O come from the recording, so you can reproduce a production run
deterministically with no cluster and no keys:

```bash
ctxmesh dev --replay ./fixture.json
```

Replay is **lenient on request bytes** (a drifted timestamp still serves the recorded response, with a
warning) and **strict on shape** (an unrecorded tool call or model-index overflow is a hard fail). Exit
codes: `0` pass · `1` agent error · `2` structural divergence.

## The full stack on a local cluster

`dev` is the fast inner loop; when you want the *whole* platform — controllers, CRDs, gateway, the
observability stack, the console with real cluster reads — install the Helm chart onto a local `kind`
cluster. The chart templates the entire platform, including a bundled dev data plane (Valkey, object
store, and a dev trace backend) suitable for local use. See
[Installation](/getting-started/installation/) for the cluster path, and
[Local dev & Helm](/operations/install-production/) for production sizing.

## See also

- [CLI reference](/reference/cli/) — every `dev` flag and exit code
- [Quickstart (console)](/getting-started/quickstart-console/) — the no-YAML path
- [Quickstart](/getting-started/quickstart/) — the YAML path, end to end
- [The launcher contract](/concepts/the-launcher-contract/) — the runtime `dev` reproduces
- [Record & replay](/guides/record-and-replay/) · [Installation](/getting-started/installation/)
