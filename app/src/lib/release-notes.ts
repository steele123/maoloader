// Turns release notes (a CHANGELOG.md section) into HTML for the update dialog. Handles what the
// changelog uses: ### headings, "- " lists with wrapped lines, **bold**, `code` and paragraphs.
// Everything is escaped first, so notes can never inject markup.

const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

const inline = (text: string) =>
	escapeHtml(text)
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/`([^`]+)`/g, "<code>$1</code>");

export function releaseNotesHtml(markdown: string): string {
	const html: string[] = [];
	let list: string[] | undefined;
	let paragraph: string[] = [];

	const flushParagraph = () => {
		if (paragraph.length) html.push(`<p>${inline(paragraph.join(" "))}</p>`);
		paragraph = [];
	};
	const flushList = () => {
		if (list) html.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
		list = undefined;
	};

	for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
		const line = raw.trimEnd();
		const heading = line.match(/^#{1,6}\s+(.*)$/);
		if (heading) {
			flushParagraph();
			flushList();
			html.push(`<h4>${inline(heading[1])}</h4>`);
		} else if (/^\s*[-*]\s+/.test(line)) {
			flushParagraph();
			list ??= [];
			list.push(line.replace(/^\s*[-*]\s+/, ""));
		} else if (list && /^\s+\S/.test(line)) {
			// A wrapped list item continues on an indented line.
			list[list.length - 1] += ` ${line.trim()}`;
		} else if (!line.trim()) {
			flushParagraph();
			flushList();
		} else {
			flushList();
			paragraph.push(line.trim());
		}
	}
	flushParagraph();
	flushList();
	return html.join("");
}
