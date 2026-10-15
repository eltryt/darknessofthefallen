import { getSpecsForClass } from './specs.js';
import { classKey } from './roster-ui.js';
import { gameVersions, guideContentTypes } from './armory-catalog.js';

// Leader-only catalogue of external guide links. Nothing is generated from URL
// patterns: every link is typed in, checked by a person and marked as verified.
export async function guideAdmin(el, { api, esc, toast, classes }) {
	const { providers, links } = await api('/api/armory/guides');
	const specLabel = (cls, id) => getSpecsForClass(classKey(cls))[id]?.name || id || 'Toda la clase';
	const option = (value, label, selected) =>
		`<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
	el.innerHTML = /* HTML */ `<h2>Guías externas</h2>
		<p>
			Enlaces directos a Wowhead, Icy Veins, Archon u otros proveedores. Solo se muestran en las
			fichas los enlaces marcados como comprobados. No se copian contenidos de esas webs.
		</p>
		<section class="section">
			<h3>Proveedores</h3>
			<div class="guide-admin-providers">
				${providers
					.map(
						(p) =>
							`<label class="card"><span><strong>${esc(p.name)}</strong><small>${esc(JSON.parse(p.allowed_hosts).join(', '))}</small></span><span class="armory-check"><input type="checkbox" data-provider="${esc(p.id)}" ${p.active ? 'checked' : ''} />Activo</span></label>`,
					)
					.join('')}
			</div>
		</section>
		<section class="section">
			<h3>Enlaces configurados</h3>
			${
				links.length
					? `<div class="table-wrap" tabindex="0"><table><thead><tr><th scope="col">Clase · especialización</th><th scope="col">Proveedor · sección</th><th scope="col">Versión · fase</th><th scope="col">Estado</th><th scope="col"></th></tr></thead><tbody>${links
							.map(
								(l) =>
									`<tr><td>${esc(l.class)} · ${esc(specLabel(l.class, l.spec))}</td><td>${esc(providers.find((p) => p.id === l.provider_id)?.name || l.provider_id)} · ${esc(guideContentTypes[l.content_type])}<small class="cell-detail"><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.url)}</a></small></td><td>${esc(gameVersions[l.game_version]?.label || l.game_version)}${l.phase ? ' · ' + esc(l.phase) : ''}</td><td>${l.verified_at ? `Comprobado<small class="cell-detail">${esc(l.verified_by_name || '')} · ${esc(new Date(l.verified_at).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }))}</small>` : 'Pendiente de comprobar · oculto'}</td><td><button type="button" class="secondary" data-link-edit="${esc(l.id)}">Editar</button><button type="button" class="secondary danger" data-link-delete="${esc(l.id)}">Borrar</button></td></tr>`,
							)
							.join('')}</tbody></table></div>`
					: `<div class="empty-note" role="status"><strong>Sin enlaces todavía</strong><p>Añade cada guía después de abrirla y comprobar que existe y corresponde a la clase, la especialización y la versión de juego.</p></div>`
			}
		</section>
		<form id="guide-link" class="card form">
			<h3>Añadir enlace de guía</h3>
			<input type="hidden" name="id" />
			<div class="form-grid">
				<label
					>Proveedor<select name="provider_id" required>
						${providers.map((p) => option(p.id, p.name)).join('')}
					</select></label
				>
				<label
					>Versión del juego<select name="game_version" required>
						${Object.entries(gameVersions)
							.map(([id, v]) => option(id, v.label))
							.join('')}
					</select></label
				>
				<label
					>Clase<select name="class" required>
						${classes.map((c) => option(c, c)).join('')}
					</select></label
				>
				<label>Especialización<select name="spec"></select></label>
				<label
					>Sección<select name="content_type" required>
						${Object.entries(guideContentTypes)
							.map(([id, label]) => option(id, label))
							.join('')}
					</select></label
				>
				<label>Fase o temporada<input name="phase" maxlength="40" placeholder="Opcional" /></label>
				<label class="wide"
					>URL de la guía<input
						name="url"
						type="url"
						required
						maxlength="500"
						placeholder="https://"
				/></label>
				<label class="wide"
					>Notas<input name="notes" maxlength="300" placeholder="Opcional"
				/></label>
				<label class="wide armory-check"
					><input type="checkbox" name="verified" />He abierto la página y corresponde a esta clase,
					especialización y versión</label
				>
			</div>
			<div class="actions">
				<button type="submit">Guardar enlace</button
				><button type="button" class="secondary" data-link-reset hidden>Cancelar edición</button>
			</div>
		</form>`;
	const form = el.querySelector('#guide-link');
	const fillSpecs = (value = '') => {
		form.elements.spec.innerHTML = [
			option('', 'Toda la clase', value),
			...Object.entries(getSpecsForClass(classKey(form.elements.class.value))).map(([id, s]) =>
				option(id, s.name, value),
			),
		].join('');
	};
	form.elements.class.onchange = () => fillSpecs();
	fillSpecs();
	const refresh = () => guideAdmin(el, { api, esc, toast, classes });
	form.onsubmit = async (e) => {
		e.preventDefault();
		const v = Object.fromEntries(new FormData(form));
		const { id, ...payload } = v;
		try {
			await api(
				'/api/armory/guide-links' + (id ? '/' + encodeURIComponent(id) : ''),
				id ? 'PATCH' : 'POST',
				{ ...payload, verified: !!v.verified },
			);
			toast(v.verified ? 'Enlace guardado y visible' : 'Enlace guardado como pendiente');
			await refresh();
		} catch (error) {
			toast(error.message);
		}
	};
	el.querySelector('[data-link-reset]').onclick = () => refresh();
	el.querySelectorAll('[data-link-edit]').forEach(
		(b) =>
			(b.onclick = () => {
				const l = links.find((x) => x.id === b.dataset.linkEdit);
				for (const key of [
					'id',
					'provider_id',
					'game_version',
					'class',
					'content_type',
					'phase',
					'url',
					'notes',
				])
					form.elements[key].value = l[key] || '';
				fillSpecs(l.spec);
				form.elements.verified.checked = !!l.verified_at;
				form.querySelector('h3').textContent = 'Editar enlace de guía';
				el.querySelector('[data-link-reset]').hidden = false;
				form.scrollIntoView({ block: 'center' });
			}),
	);
	el.querySelectorAll('[data-link-delete]').forEach(
		(b) =>
			(b.onclick = async () => {
				if (!confirm('¿Borrar este enlace de guía?')) return;
				try {
					await api(
						'/api/armory/guide-links/' + encodeURIComponent(b.dataset.linkDelete),
						'DELETE',
						{},
					);
					await refresh();
				} catch (error) {
					toast(error.message);
				}
			}),
	);
	el.querySelectorAll('[data-provider]').forEach(
		(input) =>
			(input.onchange = async () => {
				try {
					await api(
						'/api/armory/guide-providers/' + encodeURIComponent(input.dataset.provider),
						'PATCH',
						{
							active: input.checked,
						},
					);
					toast('Proveedor actualizado');
				} catch (error) {
					input.checked = !input.checked;
					toast(error.message);
				}
			}),
	);
}
