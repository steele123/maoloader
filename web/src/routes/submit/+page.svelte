<script lang="ts">
	import GitBranchIcon from "@lucide/svelte/icons/git-branch";
	import type { ActionData, PageData } from "./$types";

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const manifestExample = `{
  "title": "Example Pack",
  "version": "0.1.0",
  "repository": "https://github.com/owner/repo",
  "description": "Short summary.",
  "image": "assets/icon.png",
  "plugins": [
    {
      "slug": "example",
      "title": "Example",
      "entry": "index.js"
    }
  ]
}`;
</script>

<svelte:head>
	<title>Submit a plugin - maoloader plugins</title>
	<meta
		name="description"
		content="Submit a GitHub plugin or theme repository for maoloader review and mirroring."
	/>
</svelte:head>

<section class="page-hero compact">
	<div>
		<p class="eyebrow">Submit</p>
		<h1>Submit a GitHub repo for review.</h1>
		<p>
			Add a maoloader.json manifest to your repository. Approved repos are mirrored before
			they become installable.
		</p>
	</div>
	<div class:ready={data.canSubmit} class="status-panel">
		<strong>{data.canSubmit ? "Submissions open" : "Submissions offline"}</strong>
		<span>GitHub repos only</span>
	</div>
</section>

{#if form?.message}
	<p class="admin-message success">{form.message}</p>
{/if}

<div class="submit-layout">
	<form class="surface-form" method="POST">
		<div class="section-title">
			<GitBranchIcon />
			<h2>Repository</h2>
		</div>
		<div class="form-grid">
			<label>
				<span>GitHub repository</span>
				<input name="repository" type="url" placeholder="https://github.com/owner/repo" required />
			</label>
			<label>
				<span>Branch, tag, or SHA</span>
				<input name="githubRef" placeholder="main, v1.0.0, or leave empty for default branch" />
			</label>
			<label class="wide">
				<span>Manifest path</span>
				<input name="manifestPath" placeholder="packages/example/maoloader.json" />
				<small>Leave empty when the manifest is at the repository root.</small>
			</label>
			<label class="wide">
				<span>Review notes</span>
				<textarea name="notes" rows="2" placeholder="Anything reviewers should know"></textarea>
			</label>
		</div>

		<div class="form-actions">
			<button type="submit">Submit for review</button>
		</div>
	</form>

	<aside class="manifest-guide">
		<p class="eyebrow">Manifest</p>
		<h2>What reviewers read</h2>
		<p>
			The manifest describes one repo that can contain multiple plugins or themes. Leave the
			path empty when it is at the repository root.
		</p>
		<pre><code>{manifestExample}</code></pre>
	</aside>
</div>
