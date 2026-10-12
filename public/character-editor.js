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
		heading.textContent = 'Añadir personaje';
		submit.textContent = 'Guardar personaje';
		main.disabled = false;
		cancel.hidden = true;
	}
	cancel.onclick = reset;
	const table = document.querySelector('.table-wrap table');
	if (table) {
		const th = document.createElement('th');
		th.scope = 'col';
		th.textContent = 'Acciones';
		table.querySelector('thead tr').append(th);
		for (const [index, tr] of [...table.querySelectorAll('tbody tr')].entries()) {
			const character = rows[index],
				td = document.createElement('td'),
				button = document.createElement('button');
			button.type = 'button';
			button.className = 'secondary';
			button.textContent = 'Editar';
			button.setAttribute('aria-label', `Editar ${character.name}`);
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
				// Normalizar valores antiguos de especializaciones
				if (character.spec) {
					const normalizedSpec = normalizeOldSpecValue(character.spec);
					form.elements.spec.value = normalizedSpec;
				}
				main.checked = !!character.is_main;
				main.disabled = true;
				cancel.hidden = false;
				heading.textContent = `Editar ${character.name}`;
				submit.textContent = 'Guardar cambios';
				form.elements.name.focus();

				// Update specialization dropdown when editing
				updateSpecOptions(form.elements.class.value);
			};
			const archive = document.createElement('button');
			archive.type = 'button';
			archive.className = 'secondary danger';
			archive.textContent = 'Archivar';
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
			td.append(button, archive);
			tr.append(td);
		}
	}

	// Add class change listener to update specialization options dynamically
	const classSelect = form.elements.class;
	if (classSelect) {
		classSelect.addEventListener('change', function () {
			updateSpecOptions(this.value);
		});
	}

	function updateSpecOptions(selectedClass) {
		const specSelect = form.elements.spec;
		if (!specSelect) return;

		// Clear existing options
		specSelect.innerHTML = '';

		// Define specializations by class with stable IDs and Spanish names
		const specializations = {
			Guerrero: [
				{ id: 'arms', name: 'Armas' },
				{ id: 'protection', name: 'Protección' },
				{ id: 'fury', name: 'Furia' },
			],
			Paladín: [
				{ id: 'holy', name: 'Sagrado' },
				{ id: 'protection', name: 'Protección' },
				{ id: 'retribution', name: 'Hierro' },
			],
			Cazador: [
				{ id: 'beast_mastery', name: 'Bestia' },
				{ id: 'archery', name: 'Puntería' },
				{ id: 'survival', name: 'Supervivencia' },
			],
			Pícaro: [
				{ id: 'subtlety', name: 'Sutileza' },
				{ id: 'assassination', name: 'Asesinato' },
				{ id: 'combat', name: 'Combate' },
			],
			Sacerdote: [
				{ id: 'discipline', name: 'Disciplina' },
				{ id: 'holy', name: 'Sagrado' },
				{ id: 'shadow', name: 'Sombras' },
			],
			Chamán: [
				{ id: 'elemental', name: 'Elemental' },
				{ id: 'enhancement', name: 'Melee' },
				{ id: 'restore', name: 'Restauración' },
			],
			Mago: [
				{ id: 'arcane', name: 'Arcano' },
				{ id: 'fire', name: 'Fuego' },
				{ id: 'frost', name: 'Escarcha' },
			],
			Brujo: [
				{ id: 'affliction', name: 'Aflicción' },
				{ id: 'demonology', name: 'Demonología' },
				{ id: 'destruction', name: 'Destrucción' },
			],
			Druida: [
				{ id: 'balance', name: 'Equilibrio' },
				{ id: 'feral', name: 'Feral' },
				{ id: 'restore', name: 'Restauración' },
				{ id: 'guardian', name: 'Guardián' },
			],
		};

		// Add default option
		const defaultOption = document.createElement('option');
		defaultOption.value = '';
		defaultOption.textContent = 'Seleccionar especialización';
		specSelect.appendChild(defaultOption);

		// Add class-specific specializations or generic message if not found
		if (specializations[selectedClass]) {
			specializations[selectedClass].forEach((spec) => {
				const option = document.createElement('option');
				option.value = spec.id;
				option.textContent = spec.name;
				specSelect.appendChild(option);
			});
		} else {
			const genericOption = document.createElement('option');
			genericOption.value = '';
			genericOption.textContent = 'Especialización no disponible';
			genericOption.disabled = true;
			specSelect.appendChild(genericOption);
		}
	}

	// Función para normalizar valores antiguos a IDs estables
	function normalizeOldSpecValue(oldSpecValue) {
		const oldToNew = {
			Armas: 'arms',
			Furia: 'fury',
			Protección: 'protection',
			Sagrado: 'holy',
			Hierro: 'retribution',
			Bestia: 'beast_mastery',
			Puntería: 'archery',
			Supervivencia: 'survival',
			Sutileza: 'subtlety',
			Asesinato: 'assassination',
			Combate: 'combat',
			Disciplina: 'discipline',
			Sombras: 'shadow',
			Elemental: 'elemental',
			Melee: 'enhancement',
			Restauración: 'restore',
			Arcano: 'arcane',
			Fuego: 'fire',
			Escarcha: 'frost',
			Afllicción: 'affliction',
			Demonología: 'demonology',
			Destrucción: 'destruction',
			Equilibrio: 'balance',
			Feral: 'feral',
			Guardián: 'guardian',
		};

		return oldToNew[oldSpecValue] || oldSpecValue;
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
