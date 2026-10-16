/// <reference types="bun" />
import { expect, test } from "bun:test";
import { parseChangelog } from "./changelog";

test("splits releases and keeps their notes", () => {
	const releases = parseChangelog(
		"# Title\n\nIntro text.\n\n## 0.2.0 - 2026-10-16\n\n### New\n- Thing\n\n## v0.1.1 — 2026-10-15\r\n\r\n- Fix\n\n## 0.1.0\n\nFirst.\n\n## 0.0.9 and earlier\n\nOld stuff."
	);
	expect(releases).toEqual([
		{ version: "0.2.0", date: "2026-10-16", body: "### New\n- Thing" },
		{ version: "0.1.1", date: "2026-10-15", body: "- Fix" },
		{ version: "0.1.0", date: undefined, body: "First." }
	]);
	expect(parseChangelog(undefined)).toEqual([]);
});
