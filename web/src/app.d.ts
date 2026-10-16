// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			/** Signed in at /admin/login (or an admin Bearer token on API calls). */
			admin: boolean;
		}
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
		/** Secret GitHub signs webhook deliveries with (POST /api/github/webhook). */
		GITHUB_WEBHOOK_SECRET?: string;
		/** Comma-separated GitHub repo URLs whose pushes publish without review. */
		AUTO_PUBLISH_REPOSITORIES?: string;
		/** Salt for hashing who rated what. Falls back to ADMIN_TOKEN. */
		RATING_SALT?: string;
	}
}

export {};
