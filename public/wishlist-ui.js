import { encounterCatalog } from './encounter-catalog.js';
export async function mountWishlist(host, characters, refresh, ctx) {
	const { api, esc, empty, field, select, area, formHandler, toast } = ctx;
	const wishes = await api('/api/wishlists');
	const verifiedRaids = encounterCatalog.raids.filter((raid) => raid.status === 'verified');
	host.innerHTML = /* HTML */ `<div class="wishlist-heading">
			<div>
				<span class="eyebrow">Planifica tu equipo</span>
				<h2>Mi wishlist</h2>
				<p>Tus prioridades personales. No implican una asignación de loot.</p>
			</div>
			<span class="pill">${wishes.length} ${wishes.length === 1 ? 'objeto' : 'objetos'}</span>
		</div>
		<details class="catalog-note">
			<summary>Catálogo de bosses de Forever · pendiente de verificar</summary>
			<p>
				No hay una lista de encuentros y botín verificada cargada todavía. Puedes indicar la raid y
				el boss manualmente. Las entradas personales no son confirmaciones oficiales.
			</p>
			<a
				class="link"
				href="${encounterCatalog.sources[0].url}"
				target="_blank"
				rel="noopener noreferrer"
				>Consultar la presentación oficial ↗</a
			>
		</details>
		<div class="filters wishlist-filters">
			<label
				>Personaje<select data-wish-character>
					<option value="">Todos mis personajes</option>
					${[...new Map(wishes.map((w) => [w.data.characterId, w.data.characterName])).entries()].map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('')}
				</select></label
			><label
				>Buscar objeto, raid o boss<input
					type="search"
					data-wish-search
					placeholder="Nombre del objeto o encuentro…"
			/></label>
		</div>
		<div data-wish-list></div>
		${
			characters.length
				? /* HTML */ `<details class="card wishlist-add">
						<summary>Añadir un objeto</summary>
						<form id="wishlist-form" class="form">
							<div class="form-grid">
								<label
									>Personaje<select name="characterId">
										${characters.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
									</select></label
								>${field('Objeto', 'item')}<label
									>Raid · opcional<input name="raid" maxlength="120" list="wishlist-raids" /></label
								><datalist id="wishlist-raids">
									${verifiedRaids.map((raid) => `<option value="${esc(raid.name)}"></option>`).join('')}</datalist
								><label
									>Boss · opcional<input
										name="boss"
										maxlength="120"
										list="wishlist-bosses" /></label
								><datalist id="wishlist-bosses"></datalist
								>${select('Prioridad · 1 es la más alta', 'priority', ['1', '2', '3', '4', '5'])}${area('Notas para el equipo de loot', 'notes', false)}
							</div>
							<button type="submit">Añadir a wishlist</button>
						</form>
					</details>`
				: ''
		}`;
	const raidInput = host.querySelector('[name="raid"]');
	if (raidInput)
		raidInput.oninput = () => {
			const raid = verifiedRaids.find((raid) => raid.name === raidInput.value);
			host.querySelector('#wishlist-bosses').innerHTML = (raid?.bosses || [])
				.map((boss) => `<option value="${esc(boss.name)}"></option>`)
				.join('');
		};
	const render = () => {
		const character = host.querySelector('[data-wish-character]').value,
			query = host.querySelector('[data-wish-search]').value.trim().toLocaleLowerCase('es');
		const filtered = wishes.filter(
			(w) =>
				(!character || w.data.characterId === character) &&
				[w.data.item, w.data.boss, w.data.raid].join(' ').toLocaleLowerCase('es').includes(query),
		);
		const groups = new Map();
		for (const w of filtered) {
			const key = JSON.stringify([w.data.raid || '', w.data.boss || '']);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(w);
		}
		host.querySelector('[data-wish-list]').innerHTML = filtered.length
			? [...groups.values()]
					.map(
						(group) =>
							/* HTML */ `<section class="wishlist-encounter">
								<header>
									<div>
										<span class="eyebrow">${esc(group[0].data.raid || 'Raid sin indicar')}</span>
										<h3>${esc(group[0].data.boss || 'Boss sin indicar')}</h3>
									</div>
									<span class="pill"
										>${group.length} ${group.length === 1 ? 'objeto' : 'objetos'}</span
									>
								</header>
								<ul>
									${group
										.sort((a, b) => a.data.priority - b.data.priority)
										.map(
											(w) =>
												/* HTML */ `<li class="wishlist-item">
													<span
														class="wish-priority"
														aria-label="Prioridad ${Number(w.data.priority)}"
														>P${Number(w.data.priority)}</span
													>
													<div>
														<strong>${esc(w.data.item)}</strong
														><small>${esc(w.data.characterName)}</small
														>${w.data.notes ? `<p>${esc(w.data.notes)}</p>` : ''}
													</div>
													<button
														class="secondary"
														data-remove-wish="${esc(w.id)}"
														aria-label="Retirar ${esc(w.data.item)}"
													>
														Retirar
													</button>
												</li>`,
										)
										.join('')}
								</ul>
							</section>`,
					)
					.join('')
			: empty(
					wishes.length ? 'Sin coincidencias' : 'Tu wishlist está vacía',
					'Añade los objetos que buscas o cambia los filtros.',
				);
		host.querySelectorAll('[data-remove-wish]').forEach(
			(button) =>
				(button.onclick = async () => {
					if (!confirm('¿Retirar este objeto de tu wishlist?')) return;
					try {
						await api('/api/wishlists/' + button.dataset.removeWish, 'DELETE', {});
						await refresh();
					} catch (error) {
						toast(error.message);
					}
				}),
		);
	};
	host.querySelector('[data-wish-character]').onchange = render;
	host.querySelector('[data-wish-search]').oninput = render;
	render();
	formHandler('#wishlist-form', async (value) => {
		await api('/api/wishlists', 'POST', { ...value, priority: Number(value.priority) });
		toast('Wishlist actualizada');
		await refresh();
	});
}
