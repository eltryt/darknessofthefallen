// Read-only probe of the Blizzard Game Data API: which namespaces answer and what an
// item looks like. Prints structure and samples, never credentials.
import { blizzardClient } from './blizzard-api.mjs';

const api = await blizzardClient();
const shape = (value, depth = 0) => {
	if (Array.isArray(value)) return value.length ? [shape(value[0], depth + 1)] : [];
	if (value && typeof value === 'object' && depth < 3)
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth + 1)]));
	return typeof value === 'object' ? '{…}' : value;
};
const region = api.region;
for (const namespace of [
	`static-classic1x-${region}`,
	`static-classic-${region}`,
	`static-forever-${region}`,
	`static-classic-forever-${region}`,
	`static-${region}`,
]) {
	const search = await api
		.get('/data/wow/search/item', { namespace, locale: 'es_ES', orderby: 'id', _pageSize: '3' })
		.catch((error) => (console.log(namespace, error.message), null));
	console.log(
		`\n== ${namespace}: ${search ? `${search.pageCount} pages, ${search.maxPageSize} max page size` : 'no answer'}`,
	);
	if (!search) continue;
	console.log('search result sample:', JSON.stringify(shape(search.results?.[0]), null, 1));
}
const namespace = `static-classic1x-${region}`;
// Thunderfury: a well-known Classic item with stats.
const item = await api.get('/data/wow/item/19019', { namespace, locale: 'es_ES' });
console.log('\n== item 19019:', JSON.stringify(item, null, 1)?.slice(0, 6000));
const media = await api.get('/data/wow/media/item/19019', { namespace });
console.log('\n== media 19019:', JSON.stringify(media));
const range = await api.get('/data/wow/search/item', {
	namespace,
	locale: 'es_ES',
	orderby: 'id',
	id: '[1,30000]',
	_pageSize: '1000',
});
console.log(`\n== ids 1-30000: ${range?.pageCount} pages of up to 1000`);
const last = await api.get('/data/wow/search/item', {
	namespace,
	orderby: 'id:desc',
	_pageSize: '1',
});
console.log('highest item id:', last?.results?.[0]?.data?.id);
