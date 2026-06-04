import { escapeSvelte, mdsvex } from "mdsvex";
import adapter from "@sveltejs/adapter-cloudflare";
import { codeToHtml } from "shiki";

function escapeHtml(value) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

async function highlightCode(code, lang = "text") {
	const language = lang || "text";
	try {
		const html = await codeToHtml(code, {
			lang: language,
			theme: "github-dark",
			defaultColor: false,
		});
		return `{@html \`${escapeSvelte(html)}\`}`;
	} catch {
		const html = `<pre class="shiki language-${escapeHtml(language)}"><code>${escapeHtml(code)}</code></pre>`;
		return `{@html \`${escapeSvelte(html)}\`}`;
	}
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	},
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter()
	},
	preprocess: [
		mdsvex({
			extensions: [".svx", ".md"],
			highlight: {
				highlighter: highlightCode
			}
		})
	],
	extensions: [".svelte", ".svx", ".md"]
};

export default config;
