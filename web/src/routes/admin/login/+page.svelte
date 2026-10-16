<script lang="ts">
	import { enhance } from "$app/forms";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
	import { Button } from "$lib/components/ui/button";
	import type { ActionData, PageData } from "./$types";

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let busy = $state(false);
</script>

<svelte:head>
	<title>Admin sign in · maoloader</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="login-card surface">
	<div class="icon-chip"><KeyRoundIcon /></div>
	<h1>Admin sign in</h1>
	<p>Enter the site's admin token. You stay signed in on this browser until you sign out.</p>

	{#if !data.configured}
		<p class="admin-message">ADMIN_TOKEN isn't set for this site yet, so nobody can sign in.</p>
	{:else}
		{#if form?.message}
			<p class="admin-message" role="alert">{form.message}</p>
		{/if}
		<form
			method="POST"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			<label class="login-field">
				<span>Admin token</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input name="token" type="password" autocomplete="current-password" required autofocus />
			</label>
			<label class="login-remember">
				<input name="remember" type="checkbox" checked />
				Keep me signed in for 30 days
			</label>
			<Button type="submit" size="lg" disabled={busy}>
				{#if busy}<LoaderCircleIcon class="spin" />Checking…{:else}Sign in{/if}
			</Button>
		</form>
	{/if}
</section>
