import { redirect } from "@sveltejs/kit";
import { DISCORD_INVITE } from "$lib/links";
import type { RequestHandler } from "./$types";

// maoloader.com/discord → the current invite. A temporary redirect, so browsers don't remember the
// old invite after it changes.
export const GET: RequestHandler = () => {
	redirect(302, DISCORD_INVITE);
};
