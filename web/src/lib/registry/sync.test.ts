/// <reference types="bun" />
import { expect, test } from "bun:test";
import { autoPublishes, validGitHubSignature } from "./sync";
import { validStars, voterKey } from "./ratings";

async function sign(secret: string, body: string) {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
	return `sha256=${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

test("accepts only GitHub signatures made with the shared secret", async () => {
	const body = '{"ref":"refs/heads/main"}';
	expect(await validGitHubSignature("s3cret", body, await sign("s3cret", body))).toBe(true);
	expect(await validGitHubSignature("s3cret", body, await sign("other", body))).toBe(false);
	expect(await validGitHubSignature("s3cret", `${body} `, await sign("s3cret", body))).toBe(false);
	expect(await validGitHubSignature("s3cret", body, null)).toBe(false);
	expect(await validGitHubSignature("s3cret", body, "sha1=abc")).toBe(false);
	expect(await validGitHubSignature("", body, await sign("any", body))).toBe(false);
});

test("auto-publishes only repos on the trusted list, however their URL is written", () => {
	const env = { AUTO_PUBLISH_REPOSITORIES: "https://github.com/steele123/maoloader, https://github.com/other/thing" } as Env;
	expect(autoPublishes(env, "https://github.com/steele123/maoloader")).toBe(true);
	expect(autoPublishes(env, "https://github.com/steele123/maoloader/")).toBe(true);
	expect(autoPublishes(env, "https://github.com/steele123/maoloader-fork")).toBe(false);
	expect(autoPublishes(env, "https://github.com/someone/else")).toBe(false);
	expect(autoPublishes({} as Env, "https://github.com/steele123/maoloader")).toBe(false);
});

test("stars are whole numbers from 1 to 5", () => {
	expect(validStars(1)).toBe(1);
	expect(validStars("5")).toBe(5);
	for (const bad of [0, 6, 2.5, "x", null, undefined, -1]) expect(validStars(bad)).toBeUndefined();
});

test("voters are a salted hash that doesn't contain their address", async () => {
	const request = (ip: string) => new Request("https://maoloader.com/", { headers: { "cf-connecting-ip": ip, "user-agent": "test" } });
	const first = await voterKey(request("203.0.113.7"), { RATING_SALT: "salt" } as Env);
	expect(first).toMatch(/^[0-9a-f]{64}$/);
	expect(first).not.toContain("203.0.113.7");
	expect(await voterKey(request("203.0.113.7"), { RATING_SALT: "salt" } as Env)).toBe(first);
	expect(await voterKey(request("203.0.113.8"), { RATING_SALT: "salt" } as Env)).not.toBe(first);
	expect(await voterKey(request("203.0.113.7"), { RATING_SALT: "pepper" } as Env)).not.toBe(first);
});

test("screenshots are repo image paths, linked from GitHub at the pinned commit", async () => {
	const { manifestScreenshots } = await import("./manifest");
	const shots = manifestScreenshots(
		["media/plugins/x/home.webp", { path: "./media/plugins/x/lobby.png", caption: "The lobby" }],
		"https://github.com/steele123/maoloader",
		"abc123",
		"x"
	);
	expect(shots.map((shot) => shot.key)).toEqual(["media/plugins/x/home.webp", "media/plugins/x/lobby.png"]);
	expect(shots[1].caption).toBe("The lobby");
	expect(shots[0].url).toContain("abc123");
	expect(manifestScreenshots(undefined, "https://github.com/a/b", "r", "x")).toEqual([]);
	// A leading "/" just means the repo root.
	expect(manifestScreenshots(["/media/a.png"], "https://github.com/a/b", "r", "x")[0].key).toBe("media/a.png");
	for (const bad of ["../secret.png", "media/../../x.png", "notes.txt", "a\\b.png"]) {
		expect(() => manifestScreenshots([bad], "https://github.com/a/b", "r", "x")).toThrow();
	}
	expect(() => manifestScreenshots(Array(9).fill("a.png"), "https://github.com/a/b", "r", "x")).toThrow();
});
