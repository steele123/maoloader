import { getDownloadRelease } from "$lib/releases";
import { renderReadme } from "$lib/server/readme";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ platform }) => {
	const release = await getDownloadRelease(platform);
	// Older releases carry only "maoloader vX" as notes; that's not worth a section.
	const notes = release?.notes && release.notes.trim() !== `maoloader v${release.version}` ? release.notes : "";
	return {
		release,
		notes_html: notes ? renderReadme(notes) : undefined
	};
};
