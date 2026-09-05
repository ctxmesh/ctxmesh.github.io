---
title: Skills
description: "Attach procedural knowledge to an agent — descriptions always in context, bodies loaded only when the model needs them."
---

A **skill** is procedural knowledge with **progressive disclosure**. Its name and description sit
in the model's context permanently and cost almost nothing; the body is loaded only when the
model judges the task relevant.

That is the whole reason skills exist rather than a longer prompt. Context is scarce, so ten
attached skills should cost ten short lines until one of them is actually needed.

## What a skill is not

The distinctions matter, because a fuzzy boundary just gives you a fourth confusing way to give
an agent context.

| | When it loads | Shape | Per agent |
|---|---|---|---|
| **Prompt** (`spec.promptRef`) | always, whole | one text blob | exactly one |
| **MCP tool** | when called | endpoint + JSON schema | many |
| **KnowledgeBase** | retrieved per query | chunked, embedded facts | many |
| **Skill** | **conditionally, whole** | authored procedure | many |

- **vs a prompt** — a prompt is unconditional and singular. Ten skills cost ten short
  descriptions until one is needed; ten prompts is not a thing you can have.
- **vs an MCP tool** — a tool is a callable the model invokes and gets a result from. A skill is
  text the model *reads*. A skill may well tell the model to use a tool; it is not one.
- **vs a KnowledgeBase** — RAG answers "what is true?" by retrieving fragments ranked against a
  query. A skill answers "how do I do this?" and is loaded whole, because a procedure with a
  third of its steps retrieved is worse than useless.

:::note
`spec.capabilities` is *also* called a skill in places — it mirrors the AMP Agent Card's skill
advertisement. That is a **discovery advertisement to other agents**; it does not change what an
agent can do. This page is about the execution artifact.
:::

## Versions are immutable

A skill version is identified by the **digest of its content**, on both source paths, and the
history is append-only. Aliases (`latest`, or one you name) are the only mutable part.

An alias is resolved **once, at deploy time**, and the resolved digest is recorded in
`AgentDeployment.status.resolvedSkills`. A running agent never follows a moving alias.

That matters more than it might sound: record/replay fixtures, `ctxmesh dev --replay` and the
eval deploy gate all assume a pinned artifact. A skill that changed underneath a replay would
make a green fixture a lie rather than merely a stale one.

## Attaching a skill

```yaml
apiVersion: agents.ctxmesh.ai/v1beta1
kind: AgentDeployment
metadata:
  name: support-agent
spec:
  image: ghcr.io/example/support:1
  skillRefs:
    - refund-policy@sha256:6b8f…      # pinned
    - escalation@stable               # an alias, resolved at deploy time
```

The version is **required**. A bare name would have to mean "latest", and an implicit floating
reference is exactly what this design refuses — the skill could change underneath a running
agent while the spec that produced it looked untouched. Writing `@latest` keeps the choice
visible in the spec and in review.

Changing the list rolls a new revision **with the image digest unchanged**, exactly as swapping
`promptRef` does. At most 16 skills may be attached: every description is always-on context
cost.

## Using a skill from an agent

```python
from ctxmesh import Client

client = Client()

# Cheap. Called on every run: names and descriptions only, no network.
for skill in client.skills.list():
    print(skill.name, skill.description)

# Expensive, and deliberately separate. Call it once the model has decided the skill applies.
body = client.skills.load("refund-policy")
```

```typescript
import { Client } from "ctxmesh";

const client = new Client();
const available = await client.skills.list();
const body = await client.skills.load("refund-policy");
```

Loading every skill up front would defeat the design. The two calls are separate so that the
affordable one stays affordable.

## What a skill cannot do (yet)

A skill carries **instructions and data, not executables**. A bundle containing a script is
rejected at validation with a named reason.

That is deliberate. Accepting arbitrary uploaded code that runs inside an agent pod is remote
code execution through a form, and it would be the softest surface in a platform otherwise built
on caller-scoped RBAC, egress control and credentials that never enter agent pods. Executable
skills are a separate, policy-gated capability rather than an assumed one.
