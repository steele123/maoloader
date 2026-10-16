export type GitHubRepository = {
	owner: string;
	repo: string;
	url: string;
};

export function parseGitHubRepository(repository: string): GitHubRepository | undefined {
	try {
		const url = new URL(repository);
		if (url.hostname !== "github.com") {
			return undefined;
		}
		const [owner, repo] = url.pathname
			.replace(/^\/+|\/+$/g, "")
			.split("/")
			.filter(Boolean);
		if (!owner || !repo) {
			return undefined;
		}
		return {
			owner,
			repo: repo.replace(/\.git$/i, ""),
			url: `https://github.com/${owner}/${repo.replace(/\.git$/i, "")}`
		};
	} catch {
		return undefined;
	}
}

// GitHub throttles anonymous requests from Cloudflare's shared IPs (403/429), so the deployed
// site reads repos through the REST API with a read-only token (GITHUB_TOKEN). Without one,
// it falls back to the anonymous git ref list, raw files and codeload, which is fine locally.

let token: string | undefined;

/** Called once per request from hooks.server.ts with the GITHUB_TOKEN secret, if any. */
export function configureGitHub(value?: string) {
	token = value?.trim() || undefined;
}

const USER_AGENT = "maoloader-registry";
const SHA = /^[0-9a-f]{40}$/i;

export type ResolvedRef = {
	/** Branch or tag as given (or the default branch), for display. */
	name: string;
	/** Exact commit, so the reviewed files are the ones that get published. */
	sha: string;
};

function api(path: string, accept = "application/vnd.github+json") {
	return fetch(`https://api.github.com${path}`, {
		headers: {
			Accept: accept,
			Authorization: `Bearer ${token}`,
			"User-Agent": USER_AGENT,
			"X-GitHub-Api-Version": "2022-11-28"
		}
	});
}

function failure(status: number, what: string): Error {
	if (status === 401) return new Error("The site's GitHub token was rejected. Ask the site owner to replace GITHUB_TOKEN.");
	if (status === 403 || status === 429) return new Error("GitHub is rate-limiting the site right now. Try again in a few minutes.");
	return new Error(`${what} failed: GitHub answered ${status}.`);
}

/** Turns a branch, tag, commit or nothing (the default branch) into a commit SHA. */
export async function resolveGitHubRef(owner: string, repo: string, ref?: string): Promise<ResolvedRef> {
	const wanted = ref?.trim();
	if (wanted && SHA.test(wanted)) {
		return { name: wanted, sha: wanted.toLowerCase() };
	}
	return token ? resolveWithApi(owner, repo, wanted) : resolveAnonymously(owner, repo, wanted);
}

async function resolveWithApi(owner: string, repo: string, wanted?: string): Promise<ResolvedRef> {
	let name = wanted;
	if (!name) {
		const response = await api(`/repos/${owner}/${repo}`);
		if (response.status === 404) throw notFound(owner, repo);
		if (!response.ok) throw failure(response.status, "Repository lookup");
		name = ((await response.json()) as { default_branch?: string }).default_branch || "main";
	}

	// Accepts a branch, a tag or a short SHA and answers with the full commit SHA.
	const response = await api(`/repos/${owner}/${repo}/commits/${encodeURIComponent(name)}`, "application/vnd.github.sha");
	if (response.status === 404 || response.status === 422) {
		if (!wanted) throw notFound(owner, repo);
		throw new Error(`No branch, tag or commit named "${wanted}" in ${owner}/${repo}.`);
	}
	if (!response.ok) throw failure(response.status, "Commit lookup");
	return { name, sha: (await response.text()).trim() };
}

async function resolveAnonymously(owner: string, repo: string, wanted?: string): Promise<ResolvedRef> {
	const response = await fetch(`https://github.com/${owner}/${repo}.git/info/refs?service=git-upload-pack`, {
		headers: { "User-Agent": USER_AGENT }
	});
	if (response.status === 404 || response.status === 401) throw notFound(owner, repo);
	if (!response.ok) throw failure(response.status, "Repository lookup");

	// Lines look like "<sha> refs/heads/main"; the first also carries "symref=HEAD:refs/heads/main".
	const advertisement = await response.text();
	const refs = new Map<string, string>();
	for (const match of advertisement.matchAll(/([0-9a-f]{40}) ([^\s\0]+)/g)) {
		refs.set(match[2], match[1]);
	}
	const defaultBranch = advertisement.match(/symref=HEAD:refs\/heads\/([^\s\0]+)/)?.[1] ?? "main";

	if (!wanted) {
		const sha = refs.get("HEAD") ?? refs.get(`refs/heads/${defaultBranch}`);
		if (!sha) throw new Error("That repository has no commits yet.");
		return { name: defaultBranch, sha };
	}

	// Annotated tags list the tag object first and the commit as "^{}".
	const sha =
		refs.get(`refs/heads/${wanted}`) ?? refs.get(`refs/tags/${wanted}^{}`) ?? refs.get(`refs/tags/${wanted}`);
	if (sha) return { name: wanted, sha };

	if (/^[0-9a-f]{7,39}$/i.test(wanted)) {
		throw new Error(`Use the full 40-character commit SHA instead of "${wanted}".`);
	}
	throw new Error(`No branch or tag named "${wanted}" in ${owner}/${repo}.`);
}

function notFound(owner: string, repo: string) {
	return new Error(`Couldn't find github.com/${owner}/${repo}. Is the repository public?`);
}

export async function fetchGitHubArchive(repository: string, ref?: string) {
	const parsed = parseGitHubRepository(repository);
	if (!parsed) {
		throw new Error("Repository must be a GitHub URL like https://github.com/owner/repo");
	}

	const resolved = await resolveGitHubRef(parsed.owner, parsed.repo, ref);
	const response = token
		? await api(`/repos/${parsed.owner}/${parsed.repo}/zipball/${resolved.sha}`)
		: await fetch(`https://codeload.github.com/${parsed.owner}/${parsed.repo}/zip/${resolved.sha}`, {
				headers: { "User-Agent": USER_AGENT }
			});
	if (!response.ok) {
		throw failure(response.status, "Archive download");
	}

	const body = await response.arrayBuffer();
	return {
		body,
		ref: resolved.sha,
		size: body.byteLength
	};
}

export async function fetchGitHubFile(repository: string, path: string, ref?: string) {
	const parsed = parseGitHubRepository(repository);
	if (!parsed) {
		throw new Error("Repository must be a GitHub URL like https://github.com/owner/repo");
	}

	// Callers pass the SHA from an earlier lookup to read several files from one commit.
	const sha = ref && SHA.test(ref) ? ref : (await resolveGitHubRef(parsed.owner, parsed.repo, ref)).sha;
	const encodedPath = path
		.split("/")
		.map((part) => encodeURIComponent(part))
		.join("/");
	const response = token
		? await api(`/repos/${parsed.owner}/${parsed.repo}/contents/${encodedPath}?ref=${sha}`, "application/vnd.github.raw")
		: await fetch(rawGitHubUrl(parsed.url, sha, path)!, { headers: { "User-Agent": USER_AGENT } });
	if (response.status === 404) {
		throw new Error(`${path} wasn't found in the repository.`);
	}
	if (!response.ok) {
		throw failure(response.status, `Reading ${path}`);
	}

	return {
		ref: sha,
		text: await response.text()
	};
}

export function rawGitHubUrl(repository: string, ref: string, path: string) {
	const parsed = parseGitHubRepository(repository);
	if (!parsed) {
		return undefined;
	}
	const cleanPath = path.replace(/^\/+/, "");
	return `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(ref)}/${cleanPath}`;
}
