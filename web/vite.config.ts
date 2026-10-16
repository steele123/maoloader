import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// The changelog page reads the repo's CHANGELOG.md, one level above the site.
	server: { fs: { allow: ['..'] } }
});
