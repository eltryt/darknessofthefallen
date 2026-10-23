// Minimal Blizzard Battle.net API client for scripts that run in GitHub Actions.
// Credentials come from BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET and are never logged.
const REGION = process.env.BLIZZARD_REGION || 'eu';

export async function blizzardClient({ region = REGION } = {}) {
	const id = process.env.BLIZZARD_CLIENT_ID,
		secret = process.env.BLIZZARD_CLIENT_SECRET;
	if (!id || !secret) throw new Error('Missing BLIZZARD_CLIENT_ID or BLIZZARD_CLIENT_SECRET.');
	const tokenResponse = await fetch('https://oauth.battle.net/token', {
		method: 'POST',
		headers: {
			Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: 'grant_type=client_credentials',
	});
	if (!tokenResponse.ok)
		throw new Error(`Blizzard token request failed with HTTP ${tokenResponse.status}.`);
	const { access_token: token } = await tokenResponse.json();
	const base = `https://${region}.api.blizzard.com`;
	// GET with retries for rate limits (429), transient server errors and dropped connections.
	async function get(path, params = {}) {
		const url = new URL(path, base);
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
		for (let attempt = 0; ; attempt++) {
			let response, body;
			try {
				response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				// The connection can also drop while the body is being read.
				if (response.ok) body = await response.json();
			} catch (error) {
				if (attempt >= 5) throw error;
				await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
				continue;
			}
			if (response.ok) return body;
			if (response.status === 404) return null;
			if ((response.status === 429 || response.status >= 500) && attempt < 5) {
				await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
				continue;
			}
			throw new Error(`Blizzard API ${url.pathname} answered HTTP ${response.status}.`);
		}
	}
	return { get, region };
}

// Runs tasks with a fixed number of requests in flight (Blizzard allows 100 per second).
export async function pool(items, limit, task) {
	const results = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				results[i] = await task(items[i], i);
			}
		}),
	);
	return results;
}
