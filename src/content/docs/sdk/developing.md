---
title: Developing with the SDK
description: "The inner loop: get the SDK, unit-test an agent with no cluster using ctxmesh.testing, assert what the agent DID, then ship it as an image."
---

The other SDK pages tell you what the surface *is*. This one is about the loop you actually
work in: write a handler, test it in a second with no cluster, then ship it as an image.

The short version: **an agent is a container that answers the launcher's invoke contract.**
The SDK is typed sugar over the [localhost plane](/concepts/the-launcher-contract/) the
launcher injects around your process. So the fast inner loop is the one where you replace
that plane with fakes and never leave your editor — and the SDK ships those fakes.

## Getting the SDK

**Inside an agent image, it is already there.** `base-python` and `base-node` bundle the
package, so a `FROM ghcr.io/ctxmesh/base-python` agent can `import ctxmesh` with no install
step and no `requirements.txt` entry.

**On your machine, install it from the repository:**

```sh
git clone https://github.com/ctxmesh/ctxmesh
pip install ./ctxmesh/sdk/python
```

```sh
# TypeScript
cd ctxmesh/sdk/typescript && pnpm install && pnpm build
```

:::note[Not on PyPI or npm yet]
`pip install ctxmesh` and `npm install ctxmesh` do **not** work today — neither package is
published. Publishing needs a reserved project name and Trusted Publishing credentials,
which is why the source install above is the real path for now. Until it lands, pin the
SDK by cloning at a tag rather than tracking `main`.
:::

## Test with no cluster

`ctxmesh.testing` ships fakes of the localhost plane: tiny `http.server` stubs that speak
the same contracts the launcher does. Point a client at them and your handler runs
end-to-end — no cluster, no launcher, no provider key, no network.

```python
from ctxmesh import InvokeRequest, agent
from ctxmesh.config import PlaneConfig, RunContext
from ctxmesh.serve import process_invoke
from ctxmesh.testing import DiscoveryStub, GatewayStub, MemoryStub


def handler(req: InvokeRequest) -> str:
    """The agent under test — the same function you'd serve in production."""
    return req.client.model.chat(
        "gpt-4o-mini", [{"role": "user", "content": req.input}]
    ).text


def test_the_agent_answers():
    with (
        MemoryStub() as mem,
        DiscoveryStub() as disc,
        GatewayStub(content="hello from offline") as gw,
    ):
        cfg = PlaneConfig.for_test(
            memory_base_url=mem.base_url,
            discovery_base_url=disc.base_url,
            model_gateway_url=gw.base_url,
            run=RunContext(agent_name="offline-agent", conversation_id=""),
        )
        client = agent.from_config(cfg)

        body = process_invoke(client, handler, "offline-agent", b'{"input":"hi"}', {})
        assert body["output"] == "hello from offline"
```

Each stub binds an ephemeral localhost port and exposes it as `base_url`, so tests run in
parallel without fighting over ports. `PlaneConfig.for_test` is the seam: it builds a fully
wired config from explicit URLs instead of reading the launcher's environment.

The four stubs cover the plane:

| Stub | Fakes | Useful knobs |
|---|---|---|
| `MemoryStub` | session + long-term memory (`:2998`) | — round-trips what you write |
| `DiscoveryStub` | the tool manifest (`:2999`) **and a real inline MCP server** | `tool_result`, `manifest_input_schema` |
| `GatewayStub` | the OpenAI-compatible model gateway | `content`, `usage`, `model`, `force_status` |
| `FeedbackStub` | feedback scores (`:2995`) | `force_status` |

`force_status` is how you test the paths that are hard to provoke for real — a budget `402`
from the gateway, a `502` from a feedback backend. Those branches are usually the least
exercised code in an agent and the most annoying to reproduce in a cluster.

## Assert what the agent *did*, not just what it returned

This is the part worth learning. Every stub records each request it received, so a test can
check the agent talked to the plane correctly — not merely that the return value looked
right. A handler that returns a plausible string while calling the wrong endpoint, dropping
the conversation id, or sending the wrong model is exactly the bug an output assertion
misses.

```python
def test_the_agent_uses_the_conversation_it_was_given():
    with MemoryStub() as mem, DiscoveryStub() as disc, GatewayStub() as gw:
        cfg = PlaneConfig.for_test(
            memory_base_url=mem.base_url,
            discovery_base_url=disc.base_url,
            model_gateway_url=gw.base_url,
            run=RunContext(agent_name="offline-agent", conversation_id=""),
        )
        client = agent.from_config(cfg).with_conversation("conv-1")

        client.memory.append({"role": "user", "content": "remember me"})
        assert client.memory.get() == [{"role": "user", "content": "remember me"}]

        # The plane was really exercised, on the right conversation.
        wrote = [r for r in mem.requests if r.method == "POST"]
        assert wrote, "the handler never wrote to memory"
        assert wrote[-1].path == "/memory/conv-1/append"
        assert wrote[-1].json() == {"role": "user", "content": "remember me"}
```

A `RecordedRequest` carries `method`, `path`, `query`, `headers` and `body`, plus `.json()`
for the parsed body. Assert on whichever carries meaning for your agent: the model name you
sent, the tool you resolved, the conversation you scoped to. Note that the conversation id
travels in the memory **path**, not a header — which is exactly the kind of thing worth
pinning in a test, because it is invisible in the return value. (`headers` keys are
lowercased, as `http.server` delivers them.)

`DiscoveryStub` has a deliberate trap built in, and it is a good one. Its catalog advertises
the tool as `word-count` (hyphen) while the MCP server exposes `word_count` (underscore) —
the same split a real deployment has. A client that fails to resolve the catalog key to the
real MCP name gets a JSON-RPC error from the stub instead of a silent pass. The fake is
built to fail you the way production would.

## What the fakes deliberately do not cover

They stand in for the **launcher plane**, not for the platform. Guardrails, approval gating,
quotas, the deploy gate, real tracing backends, cost attribution and tenant isolation are
all enforced by the control plane around your pod, and none of it is in scope for a unit
test. A green offline suite means your handler speaks the plane correctly; it says nothing
about whether the policy in front of it will let a given call through.

That is the right split — but it does mean the offline suite is not the whole story. Deploy
to a cluster before you believe it.

:::caution[TypeScript has no offline fakes yet]
`ctxmesh.testing` is Python-only. The TypeScript SDK is at parity on its public surface but
ships no test stubs, so a TypeScript agent's inner loop today is
[the local dev stack](/getting-started/local-dev/) rather than in-process fakes. Parity is
planned.
:::

## From a passing test to a running agent

The handler you tested is the handler you serve:

```python
from ctxmesh import agent, serve

client = agent.from_env()          # reads the launcher-injected environment
serve(client, handler)             # the same `handler` the test drove
```

Then build and deploy:

```sh
docker build -t your-registry/your-agent:v1 .
```

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: your-agent
spec:
  image: your-registry/your-agent:v1
```

`from_env()` and `from_config()` produce the same client — the only difference is where the
plane's URLs come from. That is what makes the offline test meaningful: production swaps the
config source, not the code path.

For iterating against a real launcher and console without a full cluster, see
[local development](/getting-started/local-dev/). For deploying properly, see
[deploy an agent](/guides/deploy-an-agent/).

## See also

- [SDK overview](/sdk/) — when you need an SDK at all, and when you don't
- [Python SDK](/sdk/python/) and [TypeScript SDK](/sdk/typescript/) — the API surface
- [Custom agent loop](/sdk/custom-agent-loop/) — tracing your own loop by hand
- [The launcher contract](/concepts/the-launcher-contract/) — what the fakes are faking
