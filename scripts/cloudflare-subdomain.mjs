import {pathToFileURL} from 'node:url';

export async function ensureSubdomain(env = process.env, fetcher = fetch) {
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!/^[a-f0-9]{32}$/i.test(account || '') || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Cloudflare account ID and API token must be configured.');
  }
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`;
  const headers = {Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json'};
  const response = await fetcher(endpoint, {headers, signal: AbortSignal.timeout(30000)});
  const current = await response.json();
  // Never rename an existing account subdomain or mutate after an auth/network error.
  if (response.ok && current.success && current.result?.subdomain) return current.result.subdomain;
  if (!current.errors?.some(error => error.code === 10007)) {
    throw new Error(`Cannot read workers.dev configuration (HTTP ${response.status}).`);
  }
  const created = await fetcher(endpoint, {
    method: 'PUT', headers, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({subdomain: 'eltryt-darknessofthefallen'})
  });
  const result = await created.json();
  if (!created.ok || !result.success || !result.result?.subdomain) {
    throw new Error(`Cannot register workers.dev subdomain (HTTP ${created.status}, codes ${result.errors?.map(error => error.code).join(',') || 'unknown'}).`);
  }
  return result.result.subdomain;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`Cloudflare subdomain ready: ${await ensureSubdomain()}.workers.dev`);
}
