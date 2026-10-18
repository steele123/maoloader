/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { listingsFromPackage } from "./manifest";
import { readPackageScreenshot, readPackageZip, sniffImage } from "./package-zip";

const now = "2026-10-15T00:00:00.000Z";
const zip = (files: Record<string, string | Uint8Array>) =>
	zipSync(Object.fromEntries(Object.entries(files).map(([name, body]) => [name, typeof body === "string" ? strToU8(body) : body])));

describe("readPackageZip", () => {
	test("finds the entry, README and manifest at the zip root", () => {
		const read = readPackageZip(zip({ "index.js": "x", "README.md": "# Hi", "lib/a.js": "y" }));
		expect(read.root).toBe("");
		expect(read.defaultEntry).toBe("index.js");
		expect(read.readme).toBe("# Hi");
		expect(read.manifestText).toBeUndefined();
		expect(read.files.sort()).toEqual(["README.md", "index.js", "lib/a.js"]);
	});

	test("looks inside a single wrapping folder", () => {
		const read = readPackageZip(zip({ "auto-accept/index.js": "x", "auto-accept/maoloader.json": "{}", "__MACOSX/._x": "" }));
		expect(read.root).toBe("auto-accept/");
		expect(read.files.sort()).toEqual(["index.js", "maoloader.json"]);
		expect(read.manifestText).toBe("{}");
	});

	test("rejects junk and unsafe paths", () => {
		expect(() => readPackageZip(strToU8("not a zip"))).toThrow("not a readable .zip");
		expect(() => readPackageZip(zip({ "../evil.js": "x" }))).toThrow("unsafe path");
	});
});

describe("listingsFromPackage", () => {
	test("builds a listing from form fields when there is no manifest", () => {
		const read = readPackageZip(zip({ "index.js": "x", "README.md": "# Hi" }));
		const [listing] = listingsFromPackage(read, { name: "Auto Accept", version: "1.0.0", description: "Accepts", author: "steel" }, now);
		expect(listing.slug).toBe("auto-accept");
		expect(listing.entry).toBe("index.js");
		expect(listing.author.name).toBe("steel");
		expect(listing.readme).toBe("# Hi");
		expect(listing.repository).toBeUndefined();
	});

	test("needs the fields when there is no manifest", () => {
		const read = readPackageZip(zip({ "index.js": "x" }));
		expect(() => listingsFromPackage(read, { name: "A" }, now)).toThrow("title, version, description.");
	});

	test("uses maoloader.json and checks the entry exists", () => {
		const manifest = JSON.stringify({
			author: { name: "steel" },
			plugins: [
				{ slug: "one", title: "One", version: "1.0.0", description: "d", entry: "one/index.js", image: "icon.png" },
				{ slug: "two", title: "Two", version: "1.0.0", description: "d", entry: "two.js" }
			]
		});
		const ok = readPackageZip(zip({ "maoloader.json": manifest, "one/index.js": "x", "two.js": "y" }));
		expect(listingsFromPackage(ok, {}, now).map((listing) => listing.slug)).toEqual(["one", "two"]);

		const missing = readPackageZip(zip({ "maoloader.json": manifest, "one/index.js": "x" }));
		expect(() => listingsFromPackage(missing, {}, now)).toThrow("doesn't contain it");
	});

	test("no entry file and no manifest is explained", () => {
		const read = readPackageZip(zip({ "a.js": "x", "b.js": "y" }));
		expect(() => listingsFromPackage(read, { name: "A", version: "1", description: "d" }, now)).toThrow("entry file");
	});
});

describe("wrapPackageZip", () => {
	test("moves root files into one folder and keeps their contents", async () => {
		const { wrapPackageZip } = await import("./package-zip");
		const wrapped = readPackageZip(wrapPackageZip(zip({ "index.js": "x", "lib/a.js": "y" }), "my-plugin"));
		expect(wrapped.root).toBe("my-plugin/");
		expect(wrapped.files.sort()).toEqual(["index.js", "lib/a.js"]);
		expect(new TextDecoder().decode(wrapped.readFile("lib/a.js"))).toBe("y");
	});
});

describe("screenshots in a zip", () => {
	const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
	const manifest = (screenshots: unknown) =>
		JSON.stringify({
			author: "steel",
			plugins: [{ slug: "one", title: "One", version: "1.0.0", description: "d", entry: "index.js", screenshots }]
		});

	test("keeps the listed paths and captions for the upload to store", () => {
		const read = readPackageZip(zip({ "maoloader.json": manifest([{ path: "media/a.png", caption: "The lobby" }]), "index.js": "x", "media/a.png": png }));
		const [listing] = listingsFromPackage(read, {}, now);
		expect(listing.assets.screenshots).toEqual([{ key: "media/a.png", caption: "The lobby" }]);
		expect(readPackageScreenshot(read, "media/a.png")?.type).toBe("image/png");
	});

	test("needs every listed image to be in the zip", () => {
		const read = readPackageZip(zip({ "maoloader.json": manifest(["media/missing.png"]), "index.js": "x" }));
		expect(() => listingsFromPackage(read, {}, now)).toThrow("doesn't contain it");
	});

	test("goes by the file's bytes, not its name", () => {
		expect(sniffImage(png)?.extension).toBe("png");
		expect(sniffImage(strToU8("RIFF\0\0\0\0WEBPVP8 "))?.type).toBe("image/webp");
		expect(sniffImage(strToU8("<html><script>"))).toBeUndefined();
		const read = readPackageZip(zip({ "index.js": "x", "fake.png": "<svg onload=alert(1)>" }));
		expect(readPackageScreenshot(read, "fake.png")).toBeUndefined();
	});
});
