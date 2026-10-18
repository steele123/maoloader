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

const METHOD = /^(GET|POST|PUT|PATCH|DELETE) (\S.*)$/;
const METHOD_ONLY = /^(GET|POST|PUT|PATCH|DELETE)$/;

// Request names in endpoint tables, like "GET /lol-lobby/v2/lobby", get a small method badge.
const methodBadge = (method: string) => `<span class="method is-${method.toLowerCase()}">${method}</span>`;

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
		codespan(token: Tokens.Codespan) {
			// The lexer has already escaped the text.
			if (METHOD_ONLY.test(token.text)) return methodBadge(token.text);
			const request = METHOD.exec(token.text);
			if (!request) return `<code>${token.text}</code>`;
			return `<code class="endpoint">${methodBadge(request[1])}${request[2]}</code>`;
		},
		tablecell(token: Tokens.TableCell) {
			const type = token.header ? "th" : "td";
			const align = token.align ? ` align="${token.align}"` : "";
			// "socket `/lol-...`" in a table means a live update, so it gets a badge like a request.
			const content = this.parser
				.parseInline(token.tokens)
				.replace(/(^|\s)socket\s+<code>/g, `$1<code class="endpoint">${methodBadge("SOCKET")}`)
				.replace(/(^|\s)socket(?=\s+and\s+<code)/g, `$1${methodBadge("SOCKET")}`);
			return `<${type}${align}>${content}</${type}>
`;
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
	const html = markdown.parse(source, { async: false }) as string;
	// Wide tables scroll inside their own frame instead of the page. Raw HTML in a README is shown
	// as text, so every <table> here came from the renderer.
	return html.replaceAll("<table>", '<div class="table-wrap"><table>').replaceAll("</table>", "</table></div>");
}
