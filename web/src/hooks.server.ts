import { json, redirect, type Handle } from "@sveltejs/kit";
import { configureGitHub } from "$lib/registry/github";
import { isAdminRequest } from "$lib/server/admin-auth";

const LOGIN_PATH = "/admin/login";

export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env;
	configureGitHub(env?.GITHUB_TOKEN);

	const path = event.url.pathname;
	const adminPage = path === "/admin" || path.startsWith("/admin/");
	const adminApi = path.startsWith("/api/admin/");
	event.locals.admin = await isAdminRequest(env, event.cookies, event.request.headers.get("authorization"));

	// Everything under /admin and /api/admin needs a signed-in admin, except the sign-in page.
	if (adminApi && !event.locals.admin) {
		return json({ error: "Sign in at /admin/login first." }, { status: 401 });
	}
	if (adminPage && path !== LOGIN_PATH && !event.locals.admin) {
		// After a blocked form post, come back to the page rather than to "?/action".
		const back = event.request.method === "GET" ? path + event.url.search : path;
		redirect(303, `${LOGIN_PATH}?next=${encodeURIComponent(back)}`);
	}

	const response = await resolve(event);
	if (adminPage || adminApi) {
		response.headers.set("Cache-Control", "no-store");
		response.headers.set("X-Robots-Tag", "noindex, nofollow");
	}
	return response;
};
