import { getDownloadRelease } from "$lib/releases";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ platform }) => {
	return {
		release: await getDownloadRelease(platform)
	};
};
