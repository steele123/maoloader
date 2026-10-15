import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// LadderEye's cutoffs endpoint sends no CORS header, so client plugins read it through here.
const UPSTREAM = "https://laddereye.com/api/cutoffs";
const REGIONS = new Set([
	"NA1", "EUW1", "KR", "EUN1", "BR1", "LA1", "LA2", "OC1", "TR1", "JP1", "RU", "SG2", "TW2", "VN2"
]);
const CACHE_SECONDS = 60;

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type"
};

export const OPTIONS: RequestHandler = () => new Response(null, { status: 204, headers: corsHeaders });

export const GET: RequestHandler = async ({ url, fetch }) => {
	const region = (url.searchParams.get("region") ?? "NA1").toUpperCase();
	if (!REGIONS.has(region)) {
		return json({ error: `Unknown region "${region}"` }, { status: 400, headers: corsHeaders });
	}

	let upstream: Response;
	try {
		upstream = await fetch(`${UPSTREAM}?region=${region}&days=1`, {
			headers: { Accept: "application/json" },
			// Cloudflare edge cache, so every client in a region shares one upstream call a minute.
			cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true }
		} as RequestInit);
	} catch {
		return json({ error: "LadderEye is unreachable" }, { status: 502, headers: corsHeaders });
	}

	if (!upstream.ok) {
		return json(
			{ error: `LadderEye answered ${upstream.status}` },
			{ status: 502, headers: corsHeaders }
		);
	}

	return new Response(await upstream.text(), {
		headers: {
			...corsHeaders,
			"Content-Type": "application/json",
			"Cache-Control": `public, max-age=${CACHE_SECONDS}`
		}
	});
};
