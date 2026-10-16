import type { Handle } from "@sveltejs/kit";
import { configureGitHub } from "$lib/registry/github";

export const handle: Handle = ({ event, resolve }) => {
	configureGitHub(event.platform?.env?.GITHUB_TOKEN);
	return resolve(event);
};
