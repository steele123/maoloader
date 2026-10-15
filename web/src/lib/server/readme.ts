import { Marked, type Tokens } from "marked";

// READMEs come from plugin authors, so raw HTML is shown as text and only safe links survive.

const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function safeUrl(href: string, allowRelative: boolean) {
	try {
		const url = new URL(href, "https://maoloader.invalid/");
		if (url.origin === "https://maoloader.invalid") return allowRelative && href.startsWith("#") ? href : undefined;
		return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
	} catch {
		return undefined;
	}
}

const markdown = new Marked({
	gfm: true,
	renderer: {
		html(token: Tokens.HTML | Tokens.Tag) {
			return escapeHtml(token.text);
		},
		link(token: Tokens.Link) {
			const text = this.parser.parseInline(token.tokens);
			const href = safeUrl(token.href, true);
			if (!href) return text;
			const external = !href.startsWith("#");
			return `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="nofollow noreferrer"' : ""}>${text}</a>`;
		},
		image(token: Tokens.Image) {
			// Only absolute images load; the package's own files are not served on the site.
			const src = safeUrl(token.href, false);
			if (!src) return escapeHtml(token.text);
			return `<img src="${escapeHtml(src)}" alt="${escapeHtml(token.text)}" loading="lazy" />`;
		}
	}
});

export function renderReadme(source: string | undefined) {
	if (!source?.trim()) return undefined;
	return markdown.parse(source, { async: false }) as string;
}
