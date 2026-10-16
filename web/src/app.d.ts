// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
        interface Platform {
            env: Env;
            cf: CfProperties;
            ctx: ExecutionContext;
        }
    }

	interface Env {
		PLUGIN_DB?: D1Database;
		PLUGIN_BUCKET?: R2Bucket;
		ADMIN_TOKEN?: string;
		GITHUB_RELEASE_MANIFEST_URL?: string;
		/** Read-only GitHub token for reading submitted repos without being rate-limited. */
		GITHUB_TOKEN?: string;
	}
}

export {};
