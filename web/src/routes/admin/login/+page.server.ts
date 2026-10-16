import { fail, redirect } from "@sveltejs/kit";
import { checkAdminToken, startAdminSession } from "$lib/server/admin-auth";
import type { Actions, PageServerLoad } from "./$types";

// Only send people back to admin pages after signing in, never to another site.
function nextPath(value: string | null) {
	return value && /^\/admin(\/|\?|$)/.test(value) && !value.startsWith("/admin/login") ? value : "/admin";
}

export const load: PageServerLoad = ({ locals, url, platform }) => {
	if (locals.admin) redirect(303, nextPath(url.searchParams.get("next")));
	return { configured: Boolean(platform?.env?.ADMIN_TOKEN) };
};

export const actions: Actions = {
	default: async ({ request, cookies, platform, url }) => {
		const env = platform?.env;
		if (!env?.ADMIN_TOKEN) {
			return fail(503, { message: "ADMIN_TOKEN isn't set for this site, so nobody can sign in." });
		}

		const form = await request.formData();
		const token = String(form.get("token") ?? "");
		if (!(await checkAdminToken(env, token))) {
			// A short pause makes guessing slower without bothering a real admin.
			await new Promise((resolve) => setTimeout(resolve, 600));
			return fail(401, { message: "That token isn't right." });
		}

		await startAdminSession(env, cookies, form.get("remember") === "on");
		redirect(303, nextPath(url.searchParams.get("next")));
	}
};
