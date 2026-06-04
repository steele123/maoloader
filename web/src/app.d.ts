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
	}
}

export {};
