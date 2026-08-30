---
title: Observability backends
description: "Wire your trace backend (Langfuse / Tempo / Honeycomb) at the OTLP collector, with redaction at the collector."
sidebar:
  order: 11
---

ctxmesh is **not** a trace database. It **emits** OpenInference/OTLP spans and delegates the deep trace
explorer to an existing backend. This page is how an operator wires that backend, where redaction
happens, and how metrics are scraped.

## The emit → collect → export path

Every agent run is a trace tree with **zero SDK**: the launcher emits an `agent.invoke` boundary span,
base-image OpenInference auto-instrumentation nests the reasoning/tool/model spans beneath it, and the
gateway emits the **authoritative token/cost** span. All of it goes to a **per-pod OTel Collector
sidecar** the controller injects — the user container reaches it at `localhost:4317` (OTLP gRPC) /
`localhost:4318` (OTLP HTTP). The collector batches, applies redaction, and **exports**.

Because export is best-effort and non-blocking, a backend outage never fails a run — spans are dropped,
the request is served.

## Wiring a backend

The collector's exporters are **presence-toggled**, not a hardcoded vendor:

- **The `debug` exporter is always present** — a lightweight sink you can read with `kubectl logs` on
  the sidecar, so tracing "works" even before a real backend is wired.
- **An OTLP exporter is additive** — when the trace-backend credentials (endpoint + auth) are present in
  the agent's namespace, the collector also exports there. Absent → debug-only. This means **any
  OTLP-compatible backend** works: point the exporter's endpoint at it.

The bundled dev backend is **Langfuse** (installed for dev/trial), which provides the OTLP ingest
endpoint and the trace UI. In production, wire your own OTLP sink instead:

| Backend | How | Notes |
|---------|-----|-------|
| **Langfuse** (self-hosted or cloud) | OTLP HTTP endpoint + Basic auth (public/secret key). | The bundled dev default; the console link-out points here. |
| **Grafana Tempo** | OTLP endpoint (gRPC/HTTP). | Pair with Grafana for the explorer. |
| **Honeycomb** | OTLP endpoint + the `x-honeycomb-team` header (API key). | |
| **Any OTLP collector/gateway** | Point the exporter at your central collector; fan out downstream. | The most flexible: your collector governs sampling/retention. |

:::note
The exact values wiring for a **production** OTLP exporter (endpoint + auth via a mounted Secret ref)
finalizes toward GA — the dev path wires Langfuse's deterministic dev keys as literal env on the
collector. In production, mount the credential as a Secret ref rather than an env literal, and confirm
the collector image/version pin on your cluster.
:::

## Redaction happens at the collector

Trace attributes (tool args/results, prompts) can carry sensitive content. Redaction is applied **at the
collector**, before export — so the raw content never reaches the backend. The always-on redaction +
custom detectors are driven by the agent's `tracePolicy` (see the trace-governance surface). This is the
single choke point: your backend sees already-redacted spans.

## Metrics (Prometheus)

The control plane exposes metrics for scraping. These are **opt-in** because they require the Prometheus
Operator CRDs and/or a NetworkPolicy-enforcing CNI, so they default off to keep `helm install` clean on
a vanilla cluster:

| Values dial | What it installs |
|-------------|------------------|
| `prometheus.serviceMonitor.enabled` | A `ServiceMonitor` for the controller-manager HTTPS metrics (`:8443`). Set `insecureSkipVerify: false` + provide cert-manager TLS in production so Prometheus actually verifies the cert. |
| `prometheus.podMonitor.queueProxy.enabled` | A `PodMonitor` scraping Knative queue-proxy per-revision request metrics (feeds the `AlertPolicy` error-rate / p95-latency SLO conditions). Also needs Knative configured to export request metrics. |
| `prometheus.runPipeline.enabled` | A `PodMonitor` for the BFF + run-worker metrics port (`:9092`) + a `PrometheusRule` with a dead-worker-pool alert. |
| `networkPolicy.metricsIngress.enabled` | A NetworkPolicy restricting `/metrics` ingress to namespaces labeled `metrics: enabled`. |

See [Helm values](/reference/helm-values/) for the full block.

## Honest status (pre-GA)

- **Shipped:** SDK-free OTLP emit, the per-pod collector sidecar, presence-toggled exporters,
  collector-side redaction, the Prometheus scrape dials, Langfuse as the bundled dev backend.
- **Deferred to your backend:** head/tail **sampling**, per-tenant **retention TTL**, and
  metadata-only mode — provided today by your trace backend's own retention/sampling config (ctxmesh
  emits OTLP; the backend governs). Production OTLP exporter credentials via mounted Secret finalize
  toward GA.

## See also

- [Observability model](/concepts/observability-model/)
- [Observability & tracing](/guides/observability-and-tracing/)
- [Helm values](/reference/helm-values/)
- [Launcher endpoints](/reference/launcher-endpoints/)
- [Security posture](/operations/security-posture/)
