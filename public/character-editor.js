import { getSpecsForClass, normalizeSpecValue } from './specs.js';
import { classKey } from './roster-ui.js';
// Edits use the same owner-protected API as the profile. No local credentials.
export function attachCharacterEditor({ rows, api, refresh, toast }) {
	const form = document.querySelector('#character');
	if (!form) return;
	const heading = form.previousElementSibling;
	const submit = form.querySelector('button[type=submit]');
	const main = form.elements.isMain;
	const cancel = document.createElement('button');
	cancel.type = 'button';
	cancel.className = 'secondary';
	cancel.textContent = 'Cancelar edición';
	cancel.hidden = true;
	form.append(cancel);
	let editing = null;
	function reset() {
		editing = null;
		form.reset();
		updateSpecOptions(form.elements.class.value);
		heading.textContent = 'Añadir personaje';
		submit.textContent = 'Guardar personaje';
		main.disabled = false;
		cancel.hidden = true;
	}
	cancel.onclick = reset;
	// Profile cards expose edit/archive buttons; the form keeps the owner-protected API.
	for (const character of rows) {
		const button = document.querySelector(`[data-character-edit="${CSS.escape(character.id)}"]`);
		if (button)
			button.onclick = () => {
				editing = character.id;
				for (const key of [
					'name',
					'surname',
					'class',
					'role',
					'spec',
					'professions',
					'availability',
					'notes',
				])
					form.elements[key].value = character[key] || '';
				main.checked = !!character.is_main;
				main.disabled = true;
				cancel.hidden = false;
				heading.textContent = `Editar ${character.name}`;
				submit.textContent = 'Guardar cambios';
				const details = form.closest('details');
				if (details) details.open = true;
				updateSpecOptions(form.elements.class.value, character.spec || '');
				form.scrollIntoView({ block: 'center', behavior: 'smooth' });
				form.elements.name.focus({ preventScroll: true });
			};
		const archive = document.querySelector(
			`[data-character-archive="${CSS.escape(character.id)}"]`,
		);
		if (archive)
			archive.onclick = async () => {
				if (
					!confirm(
						`¿Archivar ${character.name}? Se retirará del roster, conservando su historial de asistencia y loot.`,
					)
				)
					return;
				archive.disabled = true;
				try {
					await api(`/api/characters/${character.id}`, 'DELETE', {});
					toast('Personaje archivado');
					await refresh();
				} catch (error) {
					toast(error.message);
					archive.disabled = false;
				}
			};
	}

	const oldSpec = form.elements.spec;
	const specSelect = document.createElement('select');
	specSelect.name = oldSpec.name;
	specSelect.id = oldSpec.id;
	oldSpec.replaceWith(specSelect);
	form.elements.class.addEventListener('change', () =>
		updateSpecOptions(form.elements.class.value),
	);
	updateSpecOptions(form.elements.class.value);

	function updateSpecOptions(selectedClass, value = '') {
		const options = getSpecsForClass(classKey(selectedClass));
		const normalized = normalizeSpecValue(value);
		specSelect.replaceChildren(new Option('Sin especificar', ''));
		for (const [id, spec] of Object.entries(options)) specSelect.add(new Option(spec.name, id));
		// Preserve custom/legacy values: editing another field must never erase them.
		if (normalized && !Object.hasOwn(options, normalized))
			specSelect.add(new Option(value, normalized));
		specSelect.value = normalized;
	}

	// Capture phase prevents the creation handler from also running during editing.
	form.addEventListener(
		'submit',
		async (event) => {
			if (!editing) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			submit.disabled = true;
			cancel.disabled = true;
			try {
				await api(`/api/characters/${editing}`, 'PATCH', Object.fromEntries(new FormData(form)));
				toast('Personaje actualizado');
				await refresh();
			} catch (error) {
				toast(error.message);
			} finally {
				submit.disabled = false;
				cancel.disabled = false;
			}
		},
		true,
	);
}
