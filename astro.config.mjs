// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	// The canonical site URL. The site is served directly by the ctxmesh.github.io
	// org repo (root, no `base` needed); ctxmesh.ai only *forwards* here (registrar
	// URL-forwarding) — so github.io is the canonical home for links, sitemap, and
	// the OG image (which must live on the domain that actually serves it).
	site: 'https://ctxmesh.github.io',
	integrations: [
		starlight({
			title: 'ctxmesh',
			description:
				'The Kubernetes-native platform for building, governing, and operating AI agents at scale.',
			// Two logos (not currentColor): Starlight renders the logo as an <img>,
			// so the SVG can't inherit the page text color — hardcode the wordmark per
			// theme (dark→light text, light→dark text).
			logo: {
				light: './src/assets/logo-light.svg',
				dark: './src/assets/logo-dark.svg',
				replacesTitle: true,
			},
			customCss: ['./src/styles/custom.css'],
			// Low-chroma, warm-leaning code themes (dark default + light toggle) so
			// syntax whispers and the state colors (blue/red) speak. The key line is
			// codeBackground: binding it to --panel makes every code block sit IN the
			// page as an inset instrument card in BOTH themes — the fix for the old
			// white-card-on-dark bug (a single fixed theme can't track the surface).
			expressiveCode: {
				themes: ['vitesse-dark', 'vitesse-light'],
				styleOverrides: {
					codeBackground: 'var(--panel)',
					borderColor: 'var(--line-2)',
					frames: { editorTabBarBackground: 'var(--paper)' },
				},
			},
			// Default social-share card (link previews on Slack/X/LinkedIn). Starlight
			// emits og/twitter title+description from frontmatter but no image; supply one.
			head: [
				// Theme default is AUTO (Starlight native) — follow the visitor's OS;
				// both dark and light are first-class, so no forced default.
				{ tag: 'meta', attrs: { property: 'og:image', content: 'https://ctxmesh.github.io/og.png' } },
				{ tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
				{ tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
				{ tag: 'meta', attrs: { property: 'og:image:alt', content: 'ctxmesh — run AI agents like production software' } },
				{ tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
				{ tag: 'meta', attrs: { name: 'twitter:image', content: 'https://ctxmesh.github.io/og.png' } },
			],
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
				{ label: 'SDKs', items: [{ autogenerate: { directory: 'sdk' } }] },
				{ label: 'Operations', items: [{ autogenerate: { directory: 'operations' } }] },
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
