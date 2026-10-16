import { dev } from "$app/environment";
import type { Cookies } from "@sveltejs/kit";

// Admin sign-in. The token is checked once at /admin/login; after that the browser holds a
// signed, HttpOnly session cookie. The cookie is an expiry plus an HMAC of it keyed by
// ADMIN_TOKEN, so it never contains the token, and replacing ADMIN_TOKEN signs everyone out.

export const ADMIN_COOKIE = "maoloader_admin";
const REMEMBER_SECONDS = 60 * 60 * 24 * 30;
const SESSION_SECONDS = 60 * 60 * 12;

const encoder = new TextEncoder();

async function hmac(key: string, message: string) {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		encoder.encode(key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
	return btoa(String.fromCharCode(...new Uint8Array(signature)))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

/** Compares without leaking where the strings differ: both sides are hashed first. */
async function sameSecret(left: string, right: string) {
	const [a, b] = await Promise.all([hmac("compare", left), hmac("compare", right)]);
	let difference = a.length ^ b.length;
	for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
		difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}
	return difference === 0;
}

export function checkAdminToken(env: Env | undefined, input: string) {
	const token = env?.ADMIN_TOKEN;
	return Boolean(token && input) && sameSecret(input.trim(), token!);
}

/** True for a request that may use admin pages and APIs. */
export async function isAdminRequest(env: Env | undefined, cookies: Cookies, authorization: string | null) {
	const token = env?.ADMIN_TOKEN;
	// With no token configured, admin is open only on the local dev server.
	if (!token) return dev;

	// Scripts can still send "Authorization: Bearer <token>".
	const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
	if (bearer) return sameSecret(bearer, token);

	const session = cookies.get(ADMIN_COOKIE);
	const [expires, signature] = session?.split(".") ?? [];
	if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
	return sameSecret(signature, await hmac(token, `maoloader-admin:${expires}`));
}

export async function startAdminSession(env: Env, cookies: Cookies, remember: boolean) {
	const lifetime = remember ? REMEMBER_SECONDS : SESSION_SECONDS;
	const expires = Math.floor(Date.now() / 1000) + lifetime;
	const signature = await hmac(env.ADMIN_TOKEN!, `maoloader-admin:${expires}`);
	cookies.set(ADMIN_COOKIE, `${expires}.${signature}`, {
		path: "/",
		httpOnly: true,
		secure: !dev,
		sameSite: "strict",
		// Without "remember", the cookie ends with the browser session (the signature still expires).
		...(remember ? { maxAge: lifetime } : {})
	});
}

export function endAdminSession(cookies: Cookies) {
	cookies.delete(ADMIN_COOKIE, { path: "/" });
}
