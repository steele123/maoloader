import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb(env?: Env) {
	return env?.PLUGIN_DB ? drizzle(env.PLUGIN_DB, { schema }) : undefined;
}

export type RegistryDb = NonNullable<ReturnType<typeof getDb>>;
