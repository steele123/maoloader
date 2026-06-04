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

export async function fetchDefaultBranch(owner: string, repo: string) {
	const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
		headers: githubHeaders()
	});
	if (!response.ok) {
		throw new Error(`GitHub repo lookup failed: ${response.status}`);
	}
	const payload = (await response.json()) as { default_branch?: string };
	return payload.default_branch || "main";
}

export async function fetchGitHubArchive(repository: string, ref?: string) {
	const parsed = parseGitHubRepository(repository);
	if (!parsed) {
		throw new Error("Repository must be a GitHub URL like https://github.com/owner/repo");
	}

	const targetRef = ref?.trim() || (await fetchDefaultBranch(parsed.owner, parsed.repo));
	const archiveUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/zipball/${encodeURIComponent(targetRef)}`;
	const response = await fetch(archiveUrl, {
		headers: githubHeaders()
	});

	if (!response.ok) {
		throw new Error(`GitHub archive fetch failed: ${response.status}`);
	}

	const body = await response.arrayBuffer();
	return {
		body,
		ref: targetRef,
		size: body.byteLength
	};
}

export async function fetchGitHubFile(repository: string, path: string, ref?: string) {
	const parsed = parseGitHubRepository(repository);
	if (!parsed) {
		throw new Error("Repository must be a GitHub URL like https://github.com/owner/repo");
	}

	const targetRef = ref?.trim() || (await fetchDefaultBranch(parsed.owner, parsed.repo));
	const apiPath = path
		.split("/")
		.map((part) => encodeURIComponent(part))
		.join("/");
	const response = await fetch(
		`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${apiPath}?ref=${encodeURIComponent(targetRef)}`,
		{
			headers: githubHeaders()
		}
	);

	if (!response.ok) {
		throw new Error(`GitHub file fetch failed for ${path}: ${response.status}`);
	}

	const payload = (await response.json()) as {
		content?: string;
		encoding?: string;
		download_url?: string;
		type?: string;
	};
	if (payload.type !== "file") {
		throw new Error(`${path} must be a file.`);
	}
	if (payload.encoding === "base64" && payload.content) {
		return {
			ref: targetRef,
			text: decodeBase64(payload.content)
		};
	}
	if (payload.download_url) {
		const rawResponse = await fetch(payload.download_url, {
			headers: {
				"User-Agent": "maoloader-registry"
			}
		});
		if (!rawResponse.ok) {
			throw new Error(`GitHub raw file fetch failed for ${path}: ${rawResponse.status}`);
		}
		return {
			ref: targetRef,
			text: await rawResponse.text()
		};
	}

	throw new Error(`${path} did not include readable content.`);
}

export function rawGitHubUrl(repository: string, ref: string, path: string) {
	const parsed = parseGitHubRepository(repository);
	if (!parsed) {
		return undefined;
	}
	const cleanPath = path.replace(/^\/+/, "");
	return `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(ref)}/${cleanPath}`;
}

function githubHeaders() {
	return {
		Accept: "application/vnd.github+json",
		"User-Agent": "maoloader-registry"
	};
}

function decodeBase64(value: string) {
	const binary = atob(value.replace(/\s/g, ""));
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}
