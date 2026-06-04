import { error, json } from "@sveltejs/kit";
import { seedRegistry } from "$lib/registry/admin";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ platform, request }) => {
	const token = request.headers.get("x-maoloader-admin-token");
	const expected = platform?.env?.ADMIN_TOKEN;
	if (expected && token !== expected) {
		error(401, "Invalid admin token");
	}

	await seedRegistry(platform?.env as Env);
	return json({ ok: true });
};
