---
title: Async & eventing
description: "The eventing execution model: brokers and triggers, at-least-once delivery, idempotency, a dead-letter queue, and large-payload blob offload."
---

**Goal:** run an agent as an **event consumer** — triggered by messages on its registry broker rather than
synchronous HTTP — with at-least-once delivery, idempotency, and a dead-letter queue.

**Prerequisites:** the platform installed with eventing enabled (Knative Eventing); an
[`AgentRegistry`](/reference/crd/agentregistry/) the agent is a **member** of (the broker is
registry-scoped); your agent packaged on a supported base image.

## How eventing works

Set `spec.executionModel: eventing` on an [`AgentDeployment`](/reference/crd/agentdeployment/). Each
`AgentRegistry` owns a **Broker** named `<registryName>-broker`; the controller subscribes an eventing
agent to it via a **Trigger** whose filter matches the CloudEvent `type` to the agent's name. An async A2A
message is the same platform message envelope carried as a **CloudEvent** — the launcher publishes to and
consumes from the broker, so your agent code never sees the transport.

An eventing agent is reconciled as a **plain Deployment + Service** (not a Knative Service): event
consumers aren't request-driven, and this shape is what a queue-depth scaler can own cleanly (see
[Scaling agents](/guides/scaling-agents/)).

| Property | Guarantee |
|----------|-----------|
| Delivery | **at-least-once** |
| Idempotency | the launcher consumer **dedupes on the envelope `messageId`** — a redelivery is processed once |
| Ordering | best-effort per `conversationId`; no global order |
| Failure | after N retries with exponential backoff, the message lands in a per-registry **DLQ** (dead-letter sink) — never infinitely retried |
| Large payloads | messages **> 256 KB** are auto-offloaded to the object store; the envelope carries a `$ref`; the launcher **rehydrates** transparently before the agent sees it |

## 1. Deploy the eventing agent

The agent must carry the registry's member label (the broker is registry-scoped):

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: worker-agent
  namespace: my-team
  labels:
    registry: support             # joins the `support` AgentRegistry
spec:
  image: ghcr.io/my-org/worker-agent:1.0.0
  executionModel: eventing        # serving | eventing | job
```

Apply it:

```bash
kubectl apply -f worker-agent.yaml
```

## 2. Watch it come up and subscribe

```bash
kubectl get agentdeployment worker-agent -n my-team -w
kubectl get agentdeployment worker-agent -n my-team \
  -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}{"\n"}'
# → True   (the Deployment + Service are up and the Trigger subscribes it to the registry broker)
```

The controller creates the agent's **Trigger** on `<registryName>-broker`, filtered to events whose
CloudEvent `type` names this agent. A **non-member** eventing agent goes `Ready=False`
(`NotRegistryMember`) with its Trigger torn down (but its HTTP endpoint kept) until membership is fixed.

## 3. Send it an event

Publish an async A2A message to the registry broker — the CloudEvent `type` names the target agent and the
envelope becomes the CloudEvent `data`. From another agent this is a normal async A2A send through the
launcher; the launcher stamps the `messageId` (the idempotency key) and routes it to the broker. The
subscribed agent is invoked once per unique `messageId`.

## 4. Scale it by queue depth

An eventing consumer pairs naturally with an [`AgentScalingPolicy`](/guides/scaling-agents/) using
`trigger: queue-depth` (`min: 0` for scale-to-zero) — the plain-Deployment shape is what KEDA scales.

## When to use / when not

- **Use** `eventing` for asynchronous, event-driven work — a consumer reacting to messages, decoupled from
  a synchronous caller.
- **Use** `serving` for interactive request/response, `job` for one-shot/scheduled batch.
- **Not** compatible with the end-user `/chat` runtime (`spec.endUserAccess` is rejected on `eventing` — it
  is interactive/request-driven only).

## Defaults

- Delivery is **at-least-once**; dedupe is keyed on the envelope **`messageId`**.
- Payloads over **256 KB** are auto-offloaded to the object store under a content-addressed (sha256) key;
  the launcher rehydrates on consume.
- Poison messages DLQ after **N retries** with **exponential backoff** (a per-registry dead-letter sink).
- If the dedupe store is unreachable the consumer **fails open** (processes) — at-least-once is the
  contract, and a rare double-process is safer than a drop. On oversize-payload publish, object-store
  failure surfaces a typed error; a dangling `$ref` on consume is NACK'd to the DLQ (the agent is never
  invoked with an unrehydratable message).

:::note[Broker & trigger wiring]
The registry Broker and the agent's Trigger are Knative Eventing objects (`<registryName>-broker` + a
per-agent Trigger filtered on the CloudEvent `type`) created by the controllers — you don't author them
directly; deploying an `eventing` agent into a registry wires them for you. Alternate queue backends
(Kafka / NATS) and their exact wiring finalize toward GA; see the reference pages.
:::

## Failure modes

- **Duplicate delivery** → deduped on `messageId` (recorded as a span); processed exactly once within the
  dedupe window.
- **Poison message** → after N failed attempts it lands in the DLQ (observable), never wedging the agent in
  a retry loop.
- **Oversize payload** → offloaded on publish; if the object store is down on publish, a typed error; a
  dangling/foreign `$ref` on consume → the message DLQs (can't rehydrate).
- **Non-member agent** → `Ready=False (NotRegistryMember)`; add the registry member label to subscribe.
- **Scale-to-zero consumer** → the broker buffers while idle; a new event scales it back up (cold start).

## See also

- [AgentDeployment reference](/reference/crd/agentdeployment/) ·
  [AgentRegistry reference](/reference/crd/agentregistry/)
- [Scaling agents](/guides/scaling-agents/) · [Execution models](/concepts/execution-models/) ·
  [Deploy an agent](/guides/deploy-an-agent/)
