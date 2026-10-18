<script lang="ts">
	import { enhance } from "$app/forms";
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import FileArchiveIcon from "@lucide/svelte/icons/file-archive";
	import GitBranchIcon from "@lucide/svelte/icons/git-branch";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
	import UploadIcon from "@lucide/svelte/icons/upload";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";
	import { listingsFromPackage, SCREENSHOT_LIMIT, type PackageFields } from "$lib/registry/manifest";
	import { MAX_PACKAGE_BYTES, MAX_SCREENSHOT_BYTES, readPackageZip, type PackageZip } from "$lib/registry/package-zip";
	import type { SubmitFunction } from "@sveltejs/kit";
	import type { ActionData, PageData } from "./$types";

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Mode = "upload" | "repo";
	let mode: Mode = $state("upload");

	// Upload: the zip is read in the browser first so problems show before anything is sent.
	let fileInput: HTMLInputElement | undefined = $state();
	let fileName = $state("");
	let zip: PackageZip | undefined = $state();
	let zipError = $state("");
	let dragging = $state(false);
	let sending = $state(false);
	let fields: PackageFields = $state({ kind: "plugin" });

	const preview = $derived.by(() => {
		if (!zip) return undefined;
		try {
			return { listings: listingsFromPackage(zip, fields, new Date().toISOString()) };
		} catch (error) {
			return { error: error instanceof Error ? error.message : String(error) };
		}
	});
	const needsFields = $derived(Boolean(zip && !zip.manifestText));
	const listedShots = $derived(
		preview?.listings?.reduce((total, listing) => total + (listing.assets.screenshots?.length ?? 0), 0) ?? 0
	);

	// Screenshots picked on the form, checked here so problems show before sending.
	let shotPreviews: string[] = $state([]);
	let shotError = $state("");
	function useShots(files: FileList | null) {
		for (const url of shotPreviews) URL.revokeObjectURL(url);
		const picked = [...(files ?? [])];
		shotError =
			picked.length > SCREENSHOT_LIMIT - listedShots
				? `Pick up to ${SCREENSHOT_LIMIT - listedShots} screenshots.`
				: picked.find((file) => file.size > MAX_SCREENSHOT_BYTES)
					? "Each screenshot must be 5 MB or smaller."
					: "";
		shotPreviews = shotError ? [] : picked.map((file) => URL.createObjectURL(file));
	}

	async function useFile(file: File | undefined) {
		zip = undefined;
		zipError = "";
		fileName = file?.name ?? "";
		if (!file) return;
		if (!file.name.toLowerCase().endsWith(".zip")) {
			zipError = "Choose a .zip file.";
			return;
		}
		if (file.size > MAX_PACKAGE_BYTES) {
			zipError = "The package must be 25 MB or smaller.";
			return;
		}
		try {
			zip = readPackageZip(new Uint8Array(await file.arrayBuffer()));
		} catch (error) {
			zipError = error instanceof Error ? error.message : String(error);
		}
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		const file = event.dataTransfer?.files[0];
		if (!file || !fileInput) return;
		// Put the dropped file in the real input so the form sends it.
		const transfer = new DataTransfer();
		transfer.items.add(file);
		fileInput.files = transfer.files;
		void useFile(file);
	}

	const submitUpload: SubmitFunction = () => {
		sending = true;
		return async ({ result, update }) => {
			sending = false;
			await update({ reset: result.type === "success" });
			if (result.type === "success") {
				zip = undefined;
				fileName = "";
				fields = { kind: "plugin" };
				useShots(null);
			}
		};
	};

	const manifestExample = `{
  "author": { "name": "you" },
  "plugins": [
    {
      "slug": "example",
      "title": "Example",
      "version": "0.1.0",
      "description": "Short summary.",
      "image": "icon.png",
      "entry": "index.js"
    }
  ]
}`;
</script>

<svelte:head>
	<title>Submit a plugin · maoloader</title>
	<meta
		name="description"
		content="Upload a maoloader plugin or theme as a .zip, or submit a GitHub repository, for review."
	/>
</svelte:head>

<section class="page-hero compact">
	<div>
		<p class="eyebrow">Submit</p>
		<h1>Share a plugin with everyone.</h1>
		<p>
			Drop in your plugin's .zip, or point us at a GitHub repo. Every submission is reviewed
			before it shows up in the store.
		</p>
	</div>
	<div class:ready={data.canSubmit} class="status-panel">
		<strong>{data.canSubmit ? "Submissions open" : "Submissions offline"}</strong>
		<span>Reviewed before publishing</span>
	</div>
</section>

{#if form?.message}
	<p class="admin-message" class:success={!!form && "submissionId" in form}>{form.message}</p>
{/if}

<div class="segmented submit-tabs" role="tablist" aria-label="How to submit">
	<button type="button" role="tab" aria-selected={mode === "upload"} onclick={() => (mode = "upload")}>
		<FileArchiveIcon />Upload a .zip
	</button>
	<button type="button" role="tab" aria-selected={mode === "repo"} onclick={() => (mode = "repo")}>
		<GitBranchIcon />From GitHub
	</button>
</div>

<div class="submit-layout">
	{#if mode === "upload"}
		<form
			class="surface-form"
			method="POST"
			action="?/upload"
			enctype="multipart/form-data"
			use:enhance={submitUpload}
		>
			<label
				class="dropzone"
				class:is-dragging={dragging}
				class:has-file={!!fileName}
				ondragover={(event) => {
					event.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={onDrop}
			>
				<input
					bind:this={fileInput}
					name="package"
					type="file"
					accept=".zip,application/zip"
					required
					onchange={(event) => useFile(event.currentTarget.files?.[0])}
				/>
				<UploadIcon />
				{#if fileName}
					<strong>{fileName}</strong>
					<span>{zip ? `${zip.files.length} files` : zipError ? "Couldn't read it" : "Reading…"} · choose another</span>
				{:else}
					<strong>Drop your plugin's .zip here</strong>
					<span>or click to choose one · up to 25 MB</span>
				{/if}
			</label>

			{#if zipError}
				<p class="check-line is-bad"><CircleAlertIcon />{zipError}</p>
			{/if}

			{#if zip}
				<ul class="check-list">
					<li class="check-line">
						<CircleCheckIcon />
						{zip.manifestText ? "Found maoloader.json" : "No maoloader.json, so fill in the details below"}
					</li>
					{#if zip.readme}
						<li class="check-line"><CircleCheckIcon />Found a README for the plugin page</li>
					{/if}
					{#if preview?.listings}
						{#each preview.listings as listing}
							<li class="check-line">
								<CircleCheckIcon />
								<span><strong>{listing.name}</strong> v{listing.version} · loads {listing.entry}</span>
							</li>
						{/each}
					{/if}
					{#if listedShots}
						<li class="check-line">
							<CircleCheckIcon />Found {listedShots} screenshot{listedShots === 1 ? "" : "s"} in maoloader.json
						</li>
					{/if}
					{#if preview?.error && !needsFields}
						<li class="check-line is-bad"><CircleAlertIcon />{preview.error}</li>
					{/if}
				</ul>
			{/if}

			{#if needsFields}
				<div class="form-grid">
					<Label>
						<span>Name</span>
						<Input name="name" bind:value={fields.name} placeholder="Auto Accept" required />
					</Label>
					<Label>
						<span>Version</span>
						<Input name="version" bind:value={fields.version} placeholder="1.0.0" required />
					</Label>
					<Label class="wide">
						<span>Short description</span>
						<Input
							name="description"
							bind:value={fields.description}
							placeholder="What it does, in one line"
							required
						/>
					</Label>
					<Label>
						<span>Your name</span>
						<Input name="author" bind:value={fields.author} placeholder="Shown as the author" />
					</Label>
					<Label>
						<span>Type</span>
						<select name="kind" bind:value={fields.kind}>
							<option value="plugin">Plugin</option>
							<option value="theme">Theme</option>
						</select>
					</Label>
					<Label class="wide">
						<span>Tags</span>
						<Input name="tags" bind:value={fields.tags} placeholder="lobby, champ select" />
						<small>Comma separated. Optional.</small>
					</Label>
				</div>
				{#if preview?.error && fields.name && fields.version && fields.description}
					<p class="check-line is-bad"><CircleAlertIcon />{preview.error}</p>
				{/if}
			{:else if zip?.manifestText}
				<!-- Used only when maoloader.json has no author. -->
				<div class="form-grid">
					<Label class="wide">
						<span>Your name</span>
						<Input name="author" bind:value={fields.author} placeholder="Used if maoloader.json has no author" />
					</Label>
				</div>
			{/if}

			{#if zip && preview?.listings?.length === 1}
				<div class="form-grid">
					<Label class="wide">
						<span>Screenshots</span>
						<input
							class="shot-input"
							name="screenshots"
							type="file"
							accept="image/png,image/jpeg,image/webp,image/gif"
							multiple
							onchange={(event) => useShots(event.currentTarget.files)}
						/>
						<small>
							Optional. Up to {SCREENSHOT_LIMIT - listedShots} PNG, JPG, WebP or GIF images, 5 MB each, shown
							at the top of the plugin page. Crop to what the plugin changes, and hide other players' names.
						</small>
					</Label>
				</div>
				{#if shotError}
					<p class="check-line is-bad"><CircleAlertIcon />{shotError}</p>
				{/if}
				{#if shotPreviews.length}
					<div class="shot-previews">
						{#each shotPreviews as src}<img {src} alt="" />{/each}
					</div>
				{/if}
			{/if}

			<div class="form-grid">
				<Label class="wide">
					<span>Notes for the reviewer</span>
					<Textarea name="notes" rows={2} placeholder="Optional. What changed, anything we should know" />
				</Label>
			</div>

			<div class="form-actions">
				<Button type="submit" disabled={!data.canUpload || !preview?.listings || !!shotError || sending}>
					{#if sending}<LoaderCircleIcon class="spin" />Sending…{:else}<UploadIcon />Submit for review{/if}
				</Button>
			</div>
		</form>
	{:else}
		<form class="surface-form" method="POST" action="?/repo">
			<div class="section-title">
				<GitBranchIcon />
				<h2>Repository</h2>
			</div>
			<div class="form-grid">
				<Label>
					<span>GitHub repository</span>
					<Input name="repository" type="url" placeholder="https://github.com/owner/repo" required />
				</Label>
				<Label>
					<span>Branch, tag, or SHA</span>
					<Input name="githubRef" placeholder="main, v1.0.0, or leave empty for default branch" />
				</Label>
				<Label class="wide">
					<span>Manifest path</span>
					<Input name="manifestPath" placeholder="packages/example/maoloader.json" />
					<small>Leave empty when the manifest is at the repository root.</small>
				</Label>
				<Label class="wide">
					<span>Review notes</span>
					<Textarea name="notes" rows={2} placeholder="Anything reviewers should know" />
				</Label>
			</div>

			<div class="form-actions">
				<Button type="submit">Submit for review</Button>
			</div>
		</form>
	{/if}

	<aside class="manifest-guide">
		<p class="eyebrow">maoloader.json</p>
		<h2>{mode === "upload" ? "Optional for uploads" : "Required for repos"}</h2>
		<p>
			{#if mode === "upload"}
				A zip with <code>index.js</code> at the top works as is: fill in the name and version on
				the left. Add a <code>maoloader.json</code> to set an icon, tags, or ship several plugins
				in one zip. A <code>README.md</code> becomes the plugin page.
			{:else}
				The manifest describes one repo that can contain several plugins or themes. Its
				<code>repository</code> must match the repo you submit.
			{/if}
		</p>
		<pre><code>{mode === "repo"
					? manifestExample.replace("{\n", '{\n  "repository": "https://github.com/owner/repo",\n')
					: manifestExample}</code></pre>
	</aside>
</div>
