---
title: API group
description: The agents.ctxmesh.ai/v1beta1 API group — the kinds served, their shortNames and scopes, and basic kubectl usage.
---

Every ctxmesh custom resource lives in the **`agents.ctxmesh.ai`** API group, served at **`v1beta1`**
(the storage version). Most resources graduated from `v1alpha1`, which is still served during the
deprecation window with a direct (field-identical) conversion; a few newer kinds are born directly in
`v1beta1` as single-version CRDs. **Always author resources at `agents.ctxmesh.ai/v1beta1`.**

## Kinds served

| Kind | Plural | shortName | Scope | Page |
|------|--------|-----------|-------|------|
| `AgentDeployment` | `agentdeployments` | — | Namespaced | [AgentDeployment](/reference/crd/agentdeployment/) |
| `AgentVersion` | `agentversions` | — | Namespaced | [AgentVersion](/reference/crd/agentversion/) |
| `AgentRegistry` | `agentregistries` | `ar` | Namespaced | [AgentRegistry](/reference/crd/agentregistry/) |
| `ModelRoute` | `modelroutes` | `mr` | Namespaced | [ModelRoute](/reference/crd/modelroute/) |
| `SecretBinding` | `secretbindings` | `sb` | Namespaced | [SecretBinding](/reference/crd/secretbinding/) |
| `CredentialStore` | `credentialstores` | `credstore` | Namespaced | [CredentialStore](/reference/crd/credentialstore/) |
| `ClusterCredentialStore` | `clustercredentialstores` | `clustercredstore` | Cluster | [CredentialStore](/reference/crd/credentialstore/) |
| `MCPToolBinding` | `mcptoolbindings` | `mtb` | Namespaced | [MCPToolBinding](/reference/crd/mcptoolbinding/) |
| `AgentScalingPolicy` | `agentscalingpolicies` | `asp` | Namespaced | [AgentScalingPolicy](/reference/crd/agentscalingpolicy/) |
| `EvalSuite` | `evalsuites` | `es` | Namespaced | [EvalSuite](/reference/crd/evalsuite/) |
| `GuardrailPolicy` | `guardrailpolicies` | `gp` | Namespaced | [GuardrailPolicy](/reference/crd/guardrailpolicy/) |
| `ApprovalPolicy` | `approvalpolicies` | `apr` | Namespaced | [ApprovalPolicy](/reference/crd/approvalpolicy/) |
| `FeedbackStore` | `feedbackstores` | `fs` | Namespaced | [FeedbackStore](/reference/crd/feedbackstore/) |
| `AlertPolicy` | `alertpolicies` | `ap` | Namespaced | [AlertPolicy](/reference/crd/alertpolicy/) |
| `AgentTeam` | `agentteams` | `at` | Namespaced | [AgentTeam](/reference/crd/agentteam/) |
| `Workflow` | `workflows` | `wf` | Namespaced | [Workflow](/reference/crd/workflow/) |
| `KnowledgeBase` | `knowledgebases` | `kb` | Namespaced | [KnowledgeBase](/reference/crd/knowledgebase/) |
| `Tenant` | `tenants` | `tnt` | Cluster | [Tenant](/reference/crd/tenant/) |

All kinds are in the `agents` category, so `kubectl get agents` lists them together (within a
namespace, and the cluster-scoped ones alongside).

Retired / folded resources (not served here) are documented at
[Retired resources](/reference/crd/retired-resources/).

## Versions

`v1beta1` is the storage version for every kind. These kinds are **also** served at `v1alpha1` during
the deprecation window: `AgentDeployment`, `AgentVersion`, `AgentRegistry`, `ModelRoute`,
`SecretBinding`, `CredentialStore`, `ClusterCredentialStore`, `MCPToolBinding`, `AgentScalingPolicy`,
`EvalSuite`, `Tenant`. The remaining kinds — `GuardrailPolicy`, `ApprovalPolicy`, `FeedbackStore`,
`AlertPolicy`, `AgentTeam`, `Workflow`, `KnowledgeBase` — are single-version, born directly in
`v1beta1`. Author everything at `v1beta1`.

## `kubectl` usage

List and inspect resources (by full name, plural, or shortName):

```bash
# Everything in the agents category, in a namespace
kubectl get agents -n my-team

# A specific kind, by shortName
kubectl get mr -n my-team                 # ModelRoutes
kubectl get gp -n my-team                 # GuardrailPolicies
kubectl get agentdeployments -n my-team   # no shortName

# Cluster-scoped kinds
kubectl get tenants
kubectl get clustercredentialstores

# Describe / inspect
kubectl describe agentdeployment support-agent -n my-team
kubectl get agentdeployment support-agent -n my-team -o yaml
```

Apply and delete manifests:

```bash
kubectl apply -f agent.yaml
kubectl delete agentdeployment support-agent -n my-team
```

Watch reconciliation via the printed status columns (each kind surfaces its own — e.g.
`AgentDeployment` prints `Ready`, `URL`, `Version`, `Gate`):

```bash
kubectl get agentdeployments -n my-team -w
```

Discover the served group/versions and per-kind schema on your cluster:

```bash
kubectl api-resources --api-group=agents.ctxmesh.ai
kubectl explain agentdeployment.spec --api-version=agents.ctxmesh.ai/v1beta1
```

## See also

- [Custom resources](/concepts/custom-resources/) — how the resources compose.
- [Reference](/reference/) — the field-by-field CRD pages.
