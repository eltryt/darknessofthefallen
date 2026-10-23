// Read-only probe of the Blizzard Game Data API: how the item search pages and
// filters behave. Prints counts and samples, never credentials.
import { blizzardClient } from './blizzard-api.mjs';

const api = await blizzardClient();
const namespace = `static-classic1x-${api.region}`;
const count = async (params) => {
	const page = await api.get('/data/wow/search/item', {
		namespace,
		orderby: 'id',
		_pageSize: '1000',
		...params,
	});
	const ids = page?.results?.map((r) => r.data.id) || [];
	return `${JSON.stringify(params)} → pageCount ${page?.pageCount}, results ${ids.length}, ids ${ids[0]}…${ids.at(-1)}, keys ${Object.keys(page || {}).join(',')}`;
};
for (const params of [
	{},
	{ id: '[1,1000]' },
	{ id: '[1,5000]' },
	{ id: '[19000,20000]' },
	{ id: '[19000,20000]', is_equippable: 'true' },
	{ id: '[1,30000]', is_equippable: 'true', _page: '2' },
	{ id: '[200000,250000]' },
])
	console.log(await count(params));
