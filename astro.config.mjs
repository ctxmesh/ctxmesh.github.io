// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	// The canonical site URL. Served at the apex custom domain (see public/CNAME);
	// the ctxmesh.github.io org repo also serves at root, so no `base` is needed.
	site: 'https://ctxmesh.ai',
	integrations: [
		starlight({
			title: 'ctxmesh',
			description:
				'The Kubernetes-native platform for building, governing, and operating AI agents at scale.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/ctxmesh' },
			],
			// Docs-as-code: each section auto-generates from its directory, so a new page
			// appears in the sidebar just by adding a Markdown/MDX file. The per-milestone
			// docs-sync review keeps these in step with the shipped product.
			sidebar: [
				{ label: 'Getting started', items: [{ autogenerate: { directory: 'getting-started' } }] },
				{ label: 'Concepts', items: [{ autogenerate: { directory: 'concepts' } }] },
				{ label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
				{ label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
				{ label: 'Contact', link: '/contact/' },
			],
			// A "last updated" stamp from git history on each doc — useful as docs evolve
			// with the product.
			lastUpdated: true,
			editLink: {
				baseUrl: 'https://github.com/ctxmesh/ctxmesh.github.io/edit/main/',
			},
		}),
	],
});
