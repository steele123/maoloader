/// <reference types="bun" />
import { expect, test } from "bun:test";
import { renderReadme } from "./readme";

test("renders markdown but not author HTML or unsafe links", () => {
	const html = renderReadme(
		[
			"# Title",
			"<script>alert(1)</script>",
			"<img src=x onerror=alert(1)>",
			"[bad](javascript:alert(1)) [good](https://maoloader.com) [anchor](#usage)",
			"![pic](https://example.com/a.png) ![local](shot.png)"
		].join("\n\n")
	)!;
	expect(html).toContain("<h1>Title</h1>");
	expect(html).not.toContain("<script");
	expect(html).not.toMatch(/<img[^>]*onerror/);
	expect(html).not.toContain("javascript:");
	expect(html).toContain('href="https://maoloader.com/"');
	expect(html).toContain('href="#usage"');
	expect(html).toContain('<img src="https://example.com/a.png"');
	expect(html).not.toContain('src="shot.png"');
	expect(renderReadme("  ")).toBeUndefined();
});
