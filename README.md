# ctxmesh.ai — website & documentation

The public marketing site and product documentation for **ctxmesh** — the Kubernetes-native
platform for building, governing, and operating AI agents at scale.

Built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build). Static
output, hosted on **GitHub Pages** at [ctxmesh.ai](https://ctxmesh.ai).

## Repository posture

- **Public, read-only for everyone else.** Anyone may read, fork, and open a pull request; only
  repository owners can push or create branches (`main` is protected). This is the one
  outward-facing repo — keep it clean.
- Not for code or internal planning — those live in the private `ctxmesh` (code) and
  `agent-brain` (planning/specs) repos. This repo is the **public** face only.

## Develop locally

Requires Node 22 (see `.nvmrc`).

```bash
nvm use            # Node 22
npm install
npm run dev        # http://localhost:4321
npm run build      # static output → ./dist/
npm run preview    # preview the production build
```

## Structure

```
.
├── public/                 # static assets (incl. CNAME → ctxmesh.ai)
├── src/content/docs/       # all pages — one .md/.mdx file per route
│   ├── index.mdx           # landing page (splash)
│   ├── getting-started/    # introduction, installation, quickstart
│   ├── concepts/           # architecture, custom resources
│   ├── guides/             # task guides
│   ├── reference/          # API/CLI reference (grows toward GA)
│   └── contact.md          # contact page
├── astro.config.mjs        # site config, sidebar (auto-generated per directory)
└── .github/workflows/      # deploy.yml → builds + publishes to GitHub Pages
```

## Deploy

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the Astro site and
publishes it to GitHub Pages (least-privilege token: `contents: read`, `pages: write`). No other
host or service is involved. HTTPS on the custom domain is provisioned by GitHub.

## Docs stay in sync with the product

The docs here are the **user-facing** rendering of the product. The source of truth for product
behavior is the private `agent-brain` (PRD, glossary, specs). A **docs-sync review runs at every
milestone close** to check these docs against the shipped product and file any drift. Versioned
docs are added once ctxmesh is generally available.
