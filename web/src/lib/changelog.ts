// Splits a CHANGELOG.md into releases. Each release starts with "## <version>", optionally
// followed by " - <date>"; anything before the first release is ignored.

export type ChangelogRelease = {
	version: string;
	date?: string;
	/** The release's markdown, without its heading. */
	body: string;
};

const HEADING = /^##\s+v?(\d+\.\d+\.\d+[\w.+-]*)(?:\s+[-–—]\s+(.+?))?\s*$/;

export function parseChangelog(markdown: string | undefined): ChangelogRelease[] {
	if (!markdown) return [];
	const releases: ChangelogRelease[] = [];
	let current: ChangelogRelease | undefined;
	const lines: string[] = [];
	const finish = () => {
		if (current) releases.push({ ...current, body: lines.join("\n").trim() });
		lines.length = 0;
	};
	for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
		const heading = line.match(HEADING);
		if (heading) {
			finish();
			current = { version: heading[1], date: heading[2]?.trim() || undefined, body: "" };
		} else if (/^##\s/.test(line)) {
			// "## 0.1.3 and earlier" and other non-version headings end the previous release.
			finish();
			current = undefined;
		} else if (current) {
			lines.push(line);
		}
	}
	finish();
	return releases;
}
