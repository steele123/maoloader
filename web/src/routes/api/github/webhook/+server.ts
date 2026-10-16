import { json } from "@sveltejs/kit";
import { autoPublishes, syncRepository, validGitHubSignature } from "$lib/registry/sync";
import type { RequestHandler } from "./$types";

// GitHub calls this on every push to a repo with the maoloader webhook. Pushes to the default branch
// update the store: trusted repos (AUTO_PUBLISH_REPOSITORIES) publish at once, others wait for review.
export const POST: RequestHandler = async ({ platform, request }) => {
	const env = platform?.env;
	const secret = env?.GITHUB_WEBHOOK_SECRET;
	if (!env?.PLUGIN_DB || !secret) return json({ error: "Webhooks aren't set up here." }, { status: 501 });

	const body = await request.text();
	if (!(await validGitHubSignature(secret, body, request.headers.get("x-hub-signature-256")))) {
		return json({ error: "Bad signature." }, { status: 401 });
	}

	const event = request.headers.get("x-github-event");
	if (event === "ping") return json({ ok: true, message: "Webhook connected." });
	if (event !== "push") return json({ ok: true, message: `Ignored ${event} event.` });

	let payload: { ref?: string; after?: string; deleted?: boolean; repository?: { html_url?: string; default_branch?: string } };
	try {
		payload = JSON.parse(body);
	} catch {
		return json({ error: "Body isn't JSON." }, { status: 400 });
	}
	const repository = payload.repository?.html_url;
	const branch = payload.repository?.default_branch;
	if (!repository || !branch || payload.deleted) return json({ ok: true, message: "Nothing to sync." });
	if (payload.ref !== `refs/heads/${branch}`) return json({ ok: true, message: `Ignored a push to ${payload.ref}.` });

	try {
		const result = await syncRepository(env, repository, {
			ref: payload.after,
			publish: autoPublishes(env, repository),
			notes: "From a GitHub push."
		});
		return json({ ok: true, outcome: result.outcome, changed: result.changed.map((listing) => `${listing.slug}@${listing.version}`) });
	} catch (syncError) {
		// 200 so GitHub doesn't retry a push that can't sync (a broken maoloader.json, say).
		return json({ ok: false, error: String(syncError instanceof Error ? syncError.message : syncError) });
	}
};
