import { randomUUID } from 'node:crypto';
import { HttpError, text, choice, can, classes, classKeys } from './domain.mjs';
import { audit, transaction } from './database-core.mjs';
import {
	gameVersions,
	bisStatuses,
	bisContents,
	guideContentTypes,
	hostAllowed,
	itemQualities,
	equipmentStats,
} from '../public/armory-catalog.js';
import { normalizeSpecValue, isValidSpecForClass } from '../public/specs.js';

const now = () => new Date().toISOString();
const LIST_LIMIT = 20,
	ENTRY_LIMIT = 200;

function activeCharacter(db, id) {
	return db
		.prepare(
			'SELECT c.*,u.display_name AS owner_name FROM characters c JOIN users u ON u.id=c.user_id WHERE c.id=? AND c.archived_at IS NULL',
		)
		.get(id);
}
// Owners and armory readers may view a sheet. Others get 404, so ids cannot be probed.
function viewable(db, user, id) {
	const c = activeCharacter(db, id);
	if (!c || (c.user_id !== user.id && !can(user, 'armory.read')))
		throw new HttpError(404, 'Personaje no encontrado.');
	return c;
}
// Only the owner edits a character's BiS lists, whatever the rank.
function owned(db, user, id) {
	const c = activeCharacter(db, id);
	if (!c || c.user_id !== user.id) throw new HttpError(404, 'Personaje no encontrado.');
	if (!can(user, 'character.write'))
		throw new HttpError(403, 'Tu rango no permite editar personajes.');
	return c;
}
function ownedList(db, user, listId) {
	const list = db.prepare('SELECT * FROM bis_lists WHERE id=?').get(listId);
	if (!list) throw new HttpError(404, 'Lista no encontrada.');
	return { list, character: owned(db, user, list.character_id) };
}
function specOf(c, value, name) {
	const spec = normalizeSpecValue(text(value ?? '', name, 40, false));
	if (spec && !isValidSpecForClass(spec, classKeys[c.class]))
		throw new HttpError(400, `La ${name} no pertenece a la clase.`);
	return spec;
}
function entryInput(c, v) {
	const slots = gameVersions[c.game_version]?.slots || [];
	const itemId = text(v.item_id ?? '', 'identificador del objeto', 40, false);
	if (itemId && !/^[\w:-]+$/.test(itemId))
		throw new HttpError(400, 'Identificador de objeto no válido.');
	const priority = Number(v.priority ?? 3);
	if (!Number.isInteger(priority) || priority < 1 || priority > 5)
		throw new HttpError(400, 'Prioridad no válida.');
	return {
		slot: choice(v.slot, slots, 'ranura'),
		item_id: itemId || null,
		item_name: text(v.item_name, 'objeto', 120),
		source: text(v.source ?? '', 'fuente', 120, false),
		boss: text(v.boss ?? '', 'jefe', 120, false),
		priority,
		status: choice(v.status || 'Pendiente', bisStatuses, 'estado'),
		is_primary: v.is_primary === true ? 1 : 0,
		notes: text(v.notes ?? '', 'notas del jugador', 1000, false),
	};
}
// A new principal item for a slot demotes the previous one to an alternative.
function saveEntry(db, listId, id, e) {
	if (e.is_primary)
		db.prepare('UPDATE bis_entries SET is_primary=0 WHERE list_id=? AND slot=? AND id<>?').run(
			listId,
			e.slot,
			id,
		);
	db.prepare(
		`INSERT INTO bis_entries(id,list_id,slot,item_id,item_name,source,boss,priority,status,is_primary,notes,updated_at)
		 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
		 ON CONFLICT(id) DO UPDATE SET slot=excluded.slot,item_id=excluded.item_id,item_name=excluded.item_name,source=excluded.source,boss=excluded.boss,priority=excluded.priority,status=excluded.status,is_primary=excluded.is_primary,notes=excluded.notes,updated_at=excluded.updated_at`,
	).run(
		id,
		listId,
		e.slot,
		e.item_id,
		e.item_name,
		e.source,
		e.boss,
		e.priority,
		e.status,
		e.is_primary,
		e.notes,
		now(),
	);
	db.prepare('UPDATE bis_lists SET updated_at=? WHERE id=?').run(now(), listId);
}
// Only verified links of active providers are resolved; specific specs override class-wide links.
export function resolveGuides(db, c, spec) {
	const providers = db
		.prepare('SELECT id,name,homepage FROM guide_providers WHERE active=1 ORDER BY sort,name')
		.all();
	const links = db
		.prepare(
			"SELECT provider_id,content_type,phase,spec,url,verified_at FROM guide_links WHERE verified_at IS NOT NULL AND game_version=? AND class=? AND (spec='' OR spec=?) ORDER BY phase,spec DESC",
		)
		.all(c.game_version, c.class, spec || '');
	return providers.map((p) => ({
		...p,
		sections: Object.keys(guideContentTypes).map((type) => {
			const matches = links.filter((l) => l.provider_id === p.id && l.content_type === type);
			const byPhase = new Map();
			for (const l of matches) if (!byPhase.has(l.phase)) byPhase.set(l.phase, l);
			return { type, links: [...byPhase.values()].map(({ url, phase }) => ({ url, phase })) };
		}),
	}));
}
function sheet(db, user, c) {
	const owner = c.user_id === user.id,
		review = can(user, 'armory.review');
	const lists = db
		.prepare('SELECT * FROM bis_lists WHERE character_id=? ORDER BY created_at')
		.all(c.id)
		.map((list) => ({
			...list,
			entries: db
				.prepare(
					'SELECT * FROM bis_entries WHERE list_id=? ORDER BY slot,is_primary DESC,priority,item_name',
				)
				.all(list.id),
		}));
	const specs = [...new Set([normalizeSpecValue(c.spec), c.secondary_spec].filter(Boolean))];
	return {
		character: c,
		stats: JSON.parse(c.stats || '{}'),
		owner: { id: c.user_id, name: c.owner_name, linked: !c.user_id.startsWith('manual:') },
		canEdit: owner && can(user, 'character.write'),
		canReview: review,
		equipment: db
			.prepare('SELECT * FROM character_equipment WHERE character_id=? ORDER BY slot')
			.all(c.id)
			.map((row) => ({ ...row, gems: JSON.parse(row.gems), stats: JSON.parse(row.stats) })),
		lists,
		guides: Object.fromEntries(
			(specs.length ? specs : ['']).map((spec) => [spec, resolveGuides(db, c, spec)]),
		),
		...(review
			? {
					reviews: db
						.prepare(
							'SELECT r.*,a.display_name AS reviewer_name,b.display_name AS completed_by_name FROM character_reviews r JOIN users a ON a.id=r.reviewer_id LEFT JOIN users b ON b.id=r.completed_by WHERE r.character_id=? ORDER BY r.created_at DESC',
						)
						.all(c.id),
					notes: db
						.prepare(
							'SELECT n.*,u.display_name AS author_name FROM character_officer_notes n JOIN users u ON u.id=n.author_id WHERE n.character_id=? ORDER BY n.created_at DESC',
						)
						.all(c.id),
				}
			: {}),
	};
}
function guideLinkInput(db, v) {
	const provider = db
		.prepare('SELECT * FROM guide_providers WHERE id=?')
		.get(text(v.provider_id, 'proveedor', 40));
	if (!provider) throw new HttpError(400, 'Proveedor no válido.');
	const cls = choice(v.class, classes, 'clase');
	const spec = normalizeSpecValue(text(v.spec ?? '', 'especialización', 40, false));
	if (spec && !isValidSpecForClass(spec, classKeys[cls]))
		throw new HttpError(400, 'La especialización no pertenece a la clase.');
	const url = text(v.url, 'URL', 500);
	if (!hostAllowed(url, JSON.parse(provider.allowed_hosts)))
		throw new HttpError(400, `La URL debe ser HTTPS y pertenecer a ${provider.name}.`);
	if (typeof v.verified !== 'boolean')
		throw new HttpError(400, 'Indica si la URL está verificada.');
	return {
		provider_id: provider.id,
		game_version: choice(v.game_version, Object.keys(gameVersions), 'versión'),
		class: cls,
		spec,
		content_type: choice(v.content_type, Object.keys(guideContentTypes), 'tipo de contenido'),
		phase: text(v.phase ?? '', 'fase', 40, false),
		url,
		notes: text(v.notes ?? '', 'notas', 300, false),
		verified: v.verified,
	};
}

export async function armoryApi({
	db,
	user,
	path,
	method,
	url,
	body,
	send,
	requireUser,
	requirePermission,
}) {
	if (!path.startsWith('/api/armory/')) return false;
	requireUser();
	let m;
	if (path === '/api/armory/characters' && method === 'GET') {
		const guild = url.searchParams.get('scope') === 'guild' && can(user, 'armory.read');
		send(
			200,
			db
				.prepare(
					`SELECT c.id,c.name,c.surname,c.class,c.spec,c.is_main,c.user_id,u.display_name AS owner_name FROM characters c JOIN users u ON u.id=c.user_id WHERE c.archived_at IS NULL${guild ? '' : ' AND c.user_id=?'} ORDER BY ${guild ? 'u.display_name,' : ''}c.is_main DESC,c.name`,
				)
				.all(...(guild ? [] : [user.id])),
		);
		return true;
	}
	if ((m = path.match(/^\/api\/armory\/characters\/([^/]+)$/)) && method === 'GET') {
		send(200, sheet(db, user, viewable(db, user, m[1])));
		return true;
	}
	// Manual equipment: the owner types the item or picks it from the Classic catalogue
	// (public/catalog). A picked item brings its id, icon name and stats. Rows stay manual.
	if ((m = path.match(/^\/api\/armory\/characters\/([^/]+)\/equipment\/([\w]+)$/))) {
		const c = owned(db, user, m[1]),
			slot = choice(m[2], gameVersions[c.game_version]?.slots || [], 'ranura'),
			previous =
				db
					.prepare('SELECT * FROM character_equipment WHERE character_id=? AND slot=?')
					.get(c.id, slot) || null;
		if (method === 'DELETE') {
			if (previous?.origin === 'provider')
				throw new HttpError(409, 'Este hueco lo actualiza el proveedor de datos.');
			transaction(db, () => {
				db.prepare('DELETE FROM character_equipment WHERE character_id=? AND slot=?').run(
					c.id,
					slot,
				);
				audit(db, user.id, 'armory.equipment.cleared', c.id, { previous, next: null });
			});
			send(200, { ok: true });
			return true;
		}
		if (method === 'PUT') {
			if (previous?.origin === 'provider')
				throw new HttpError(409, 'Este hueco lo actualiza el proveedor de datos.');
			const v = await body();
			const level = v.item_level === '' || v.item_level == null ? null : Number(v.item_level);
			if (level !== null && (!Number.isInteger(level) || level < 1 || level > 1000))
				throw new HttpError(400, 'Nivel de objeto no válido.');
			const quality = text(v.quality ?? '', 'calidad', 20, false);
			if (quality && !(quality in itemQualities)) throw new HttpError(400, 'Calidad no válida.');
			const itemId = v.item_id == null || v.item_id === '' ? null : String(v.item_id);
			if (itemId !== null && !/^\d{1,7}$/.test(itemId))
				throw new HttpError(400, 'Identificador de objeto no válido.');
			const icon = text(v.icon ?? '', 'icono', 80, false);
			if (icon && !/^[a-z0-9_-]+$/.test(icon)) throw new HttpError(400, 'Icono no válido.');
			let stats = v.stats ?? {};
			if (typeof stats === 'string') {
				try {
					stats = stats ? JSON.parse(stats) : {};
				} catch {
					throw new HttpError(400, 'Atributos no válidos.');
				}
			}
			if (!stats || typeof stats !== 'object' || Array.isArray(stats))
				throw new HttpError(400, 'Atributos no válidos.');
			const kept = {};
			for (const key of equipmentStats) {
				if (!(key in stats)) continue;
				const value = Number(stats[key]);
				if (!Number.isInteger(value) || Math.abs(value) > 10000)
					throw new HttpError(400, 'Atributos no válidos.');
				kept[key] = value;
			}
			const row = {
				item_id: itemId,
				item_name: text(v.item_name, 'nombre del objeto', 160),
				quality,
				item_level: level,
				icon,
				stats: kept,
				enchant: text(v.enchant ?? '', 'encantamiento', 120, false),
				source_label: text(v.source_label ?? '', 'origen', 120, false),
			};
			transaction(db, () => {
				db.prepare(
					`INSERT INTO character_equipment(id,character_id,slot,item_id,item_name,quality,item_level,icon,stats,enchant,source_label,origin,updated_at)
					 VALUES(?,?,?,?,?,?,?,?,?,?,?,'manual',?)
					 ON CONFLICT(character_id,slot) DO UPDATE SET item_id=excluded.item_id,item_name=excluded.item_name,quality=excluded.quality,
					 item_level=excluded.item_level,icon=excluded.icon,stats=excluded.stats,enchant=excluded.enchant,source_label=excluded.source_label,updated_at=excluded.updated_at`,
				).run(
					randomUUID(),
					c.id,
					slot,
					row.item_id,
					row.item_name,
					row.quality,
					row.item_level,
					row.icon,
					JSON.stringify(row.stats),
					row.enchant,
					row.source_label,
					now(),
				);
				audit(db, user.id, 'armory.equipment.saved', c.id, { previous, next: { slot, ...row } });
			});
			send(200, { slot, ...row });
			return true;
		}
	}
	if ((m = path.match(/^\/api\/armory\/characters\/([^/]+)\/bis-lists$/)) && method === 'POST') {
		const c = owned(db, user, m[1]),
			v = await body();
		const list = {
			spec: specOf(c, v.spec, 'especialización'),
			content: choice(v.content || 'General', bisContents, 'contenido'),
			phase: text(v.phase ?? '', 'fase', 40, false),
			title: text(v.title ?? '', 'título', 80, false),
		};
		const id = randomUUID();
		transaction(db, () => {
			if (
				db.prepare('SELECT COUNT(*) AS n FROM bis_lists WHERE character_id=?').get(c.id).n >=
				LIST_LIMIT
			)
				throw new HttpError(400, `Límite de ${LIST_LIMIT} listas por personaje.`);
			if (
				db
					.prepare(
						'SELECT 1 FROM bis_lists WHERE character_id=? AND spec=? AND content=? AND phase=?',
					)
					.get(c.id, list.spec, list.content, list.phase)
			)
				throw new HttpError(409, 'Ya existe una lista para esa especialización, contenido y fase.');
			db.prepare(
				'INSERT INTO bis_lists(id,character_id,spec,content,phase,title,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
			).run(id, c.id, list.spec, list.content, list.phase, list.title, now(), now());
			audit(db, user.id, 'armory.bis.list.created', c.id, { list: id, ...list });
		});
		send(201, { id });
		return true;
	}
	if ((m = path.match(/^\/api\/armory\/bis-lists\/([^/]+)$/))) {
		const { list, character } = ownedList(db, user, m[1]);
		if (method === 'DELETE') {
			transaction(db, () => {
				db.prepare('DELETE FROM bis_lists WHERE id=?').run(list.id);
				audit(db, user.id, 'armory.bis.list.deleted', character.id, { list: list.id });
			});
			send(200, { ok: true });
			return true;
		}
		if (method === 'PATCH') {
			const v = await body();
			const title = text(v.title ?? list.title, 'título', 80, false),
				phase = text(v.phase ?? list.phase, 'fase', 40, false);
			transaction(db, () => {
				if (
					db
						.prepare(
							'SELECT 1 FROM bis_lists WHERE character_id=? AND spec=? AND content=? AND phase=? AND id<>?',
						)
						.get(character.id, list.spec, list.content, phase, list.id)
				)
					throw new HttpError(409, 'Ya existe una lista para esa fase.');
				db.prepare('UPDATE bis_lists SET title=?,phase=?,updated_at=? WHERE id=?').run(
					title,
					phase,
					now(),
					list.id,
				);
				audit(db, user.id, 'armory.bis.list.updated', character.id, {
					list: list.id,
					title,
					phase,
				});
			});
			send(200, { ok: true });
			return true;
		}
		throw new HttpError(405, 'Método no permitido.');
	}
	if ((m = path.match(/^\/api\/armory\/bis-lists\/([^/]+)\/entries$/)) && method === 'POST') {
		const { list, character } = ownedList(db, user, m[1]),
			e = entryInput(character, await body()),
			id = randomUUID();
		transaction(db, () => {
			if (
				db.prepare('SELECT COUNT(*) AS n FROM bis_entries WHERE list_id=?').get(list.id).n >=
				ENTRY_LIMIT
			)
				throw new HttpError(400, `Límite de ${ENTRY_LIMIT} objetos por lista.`);
			saveEntry(db, list.id, id, e);
			audit(db, user.id, 'armory.bis.entry.created', character.id, {
				list: list.id,
				entry: id,
				slot: e.slot,
				item: e.item_name,
			});
		});
		send(201, { id });
		return true;
	}
	if ((m = path.match(/^\/api\/armory\/bis-entries\/([^/]+)$/))) {
		const entry = db.prepare('SELECT * FROM bis_entries WHERE id=?').get(m[1]);
		if (!entry) throw new HttpError(404, 'Objeto no encontrado.');
		const { list, character } = ownedList(db, user, entry.list_id);
		if (method === 'DELETE') {
			transaction(db, () => {
				db.prepare('DELETE FROM bis_entries WHERE id=?').run(entry.id);
				db.prepare('UPDATE bis_lists SET updated_at=? WHERE id=?').run(now(), list.id);
				audit(db, user.id, 'armory.bis.entry.deleted', character.id, { entry: entry.id });
			});
			send(200, { ok: true });
			return true;
		}
		if (method === 'PATCH') {
			const e = entryInput(character, {
				...entry,
				is_primary: !!entry.is_primary,
				...(await body()),
			});
			transaction(db, () => {
				saveEntry(db, list.id, entry.id, e);
				audit(db, user.id, 'armory.bis.entry.updated', character.id, {
					entry: entry.id,
					status: e.status,
				});
			});
			send(200, { ok: true });
			return true;
		}
		throw new HttpError(405, 'Método no permitido.');
	}
	if ((m = path.match(/^\/api\/armory\/characters\/([^/]+)\/reviews$/)) && method === 'POST') {
		requirePermission('armory.review');
		const c = viewable(db, user, m[1]),
			summary = text((await body()).summary ?? '', 'resumen', 2000, false),
			id = randomUUID();
		transaction(db, () => {
			db.prepare(
				'INSERT INTO character_reviews(id,character_id,reviewer_id,summary,created_at) VALUES(?,?,?,?,?)',
			).run(id, c.id, user.id, summary, now());
			audit(db, user.id, 'armory.review.created', c.id, { review: id });
		});
		send(201, { id });
		return true;
	}
	if ((m = path.match(/^\/api\/armory\/reviews\/([^/]+)$/)) && method === 'PATCH') {
		requirePermission('armory.review');
		const review = db.prepare('SELECT * FROM character_reviews WHERE id=?').get(m[1]);
		if (!review) throw new HttpError(404, 'Revisión no encontrada.');
		viewable(db, user, review.character_id);
		const v = await body();
		const summary = text(v.summary ?? review.summary, 'resumen', 2000, false),
			status = choice(v.status ?? review.status, ['En curso', 'Completada'], 'estado');
		const completed = status === 'Completada';
		transaction(db, () => {
			db.prepare(
				'UPDATE character_reviews SET summary=?,status=?,completed_at=?,completed_by=? WHERE id=?',
			).run(
				summary,
				status,
				completed ? review.completed_at || now() : null,
				completed ? review.completed_by || user.id : null,
				review.id,
			);
			audit(db, user.id, 'armory.review.updated', review.character_id, {
				review: review.id,
				status,
			});
		});
		send(200, { ok: true });
		return true;
	}
	if ((m = path.match(/^\/api\/armory\/characters\/([^/]+)\/notes$/)) && method === 'POST') {
		requirePermission('armory.review');
		const c = viewable(db, user, m[1]),
			note = text((await body()).body, 'nota interna', 2000),
			id = randomUUID();
		transaction(db, () => {
			db.prepare(
				'INSERT INTO character_officer_notes(id,character_id,author_id,body,created_at) VALUES(?,?,?,?,?)',
			).run(id, c.id, user.id, note, now());
			// The audit keeps who and when, never the private note text.
			audit(db, user.id, 'armory.note.created', c.id, { note: id });
		});
		send(201, { id });
		return true;
	}
	if ((m = path.match(/^\/api\/armory\/notes\/([^/]+)$/)) && method === 'DELETE') {
		requirePermission('armory.review');
		const note = db.prepare('SELECT * FROM character_officer_notes WHERE id=?').get(m[1]);
		if (!note) throw new HttpError(404, 'Nota no encontrada.');
		if (note.author_id !== user.id && !can(user, 'armory.configure'))
			throw new HttpError(403, 'Solo su autor o el Líder pueden retirar esta nota.');
		transaction(db, () => {
			db.prepare('DELETE FROM character_officer_notes WHERE id=?').run(note.id);
			audit(db, user.id, 'armory.note.deleted', note.character_id, { note: note.id });
		});
		send(200, { ok: true });
		return true;
	}
	if (path === '/api/armory/guides' && method === 'GET') {
		requirePermission('armory.configure');
		send(200, {
			providers: db.prepare('SELECT * FROM guide_providers ORDER BY sort,name').all(),
			links: db
				.prepare(
					'SELECT l.*,u.display_name AS verified_by_name FROM guide_links l LEFT JOIN users u ON u.id=l.verified_by ORDER BY l.class,l.spec,l.provider_id,l.content_type,l.phase',
				)
				.all(),
		});
		return true;
	}
	if ((m = path.match(/^\/api\/armory\/guide-links(?:\/([^/]+))?$/))) {
		requirePermission('armory.configure');
		const id = m[1];
		if (method === 'DELETE' && id) {
			transaction(db, () => {
				if (!db.prepare('DELETE FROM guide_links WHERE id=?').run(id).changes)
					throw new HttpError(404, 'Enlace no encontrado.');
				audit(db, user.id, 'armory.guide.deleted', id, {});
			});
			send(200, { ok: true });
			return true;
		}
		if ((method === 'POST' && !id) || (method === 'PATCH' && id)) {
			const v = guideLinkInput(db, await body()),
				linkId = id || randomUUID();
			transaction(db, () => {
				const previous = id ? db.prepare('SELECT * FROM guide_links WHERE id=?').get(id) : null;
				if (id && !previous) throw new HttpError(404, 'Enlace no encontrado.');
				const clash = db
					.prepare(
						'SELECT id FROM guide_links WHERE provider_id=? AND game_version=? AND class=? AND spec=? AND content_type=? AND phase=? AND id<>?',
					)
					.get(v.provider_id, v.game_version, v.class, v.spec, v.content_type, v.phase, linkId);
				if (clash)
					throw new HttpError(409, 'Ya existe un enlace para ese proveedor, clase y sección.');
				// A changed URL must be verified again.
				const keepVerification = previous && previous.url === v.url && v.verified;
				const verifiedAt = v.verified
					? keepVerification
						? previous.verified_at || now()
						: now()
					: null;
				const verifiedBy = v.verified
					? keepVerification
						? previous.verified_by || user.id
						: user.id
					: null;
				db.prepare(
					`INSERT INTO guide_links(id,provider_id,game_version,class,spec,content_type,phase,url,notes,verified_at,verified_by,updated_at)
					 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
					 ON CONFLICT(id) DO UPDATE SET provider_id=excluded.provider_id,game_version=excluded.game_version,class=excluded.class,spec=excluded.spec,content_type=excluded.content_type,phase=excluded.phase,url=excluded.url,notes=excluded.notes,verified_at=excluded.verified_at,verified_by=excluded.verified_by,updated_at=excluded.updated_at`,
				).run(
					linkId,
					v.provider_id,
					v.game_version,
					v.class,
					v.spec,
					v.content_type,
					v.phase,
					v.url,
					v.notes,
					verifiedAt,
					verifiedBy,
					now(),
				);
				audit(db, user.id, id ? 'armory.guide.updated' : 'armory.guide.created', linkId, {
					provider: v.provider_id,
					class: v.class,
					spec: v.spec,
					type: v.content_type,
					verified: v.verified,
				});
			});
			send(id ? 200 : 201, { id: linkId });
			return true;
		}
		throw new HttpError(405, 'Método no permitido.');
	}
	if ((m = path.match(/^\/api\/armory\/guide-providers\/([^/]+)$/)) && method === 'PATCH') {
		requirePermission('armory.configure');
		const v = await body();
		if (typeof v.active !== 'boolean') throw new HttpError(400, 'Estado no válido.');
		transaction(db, () => {
			if (
				!db
					.prepare('UPDATE guide_providers SET active=?,updated_at=? WHERE id=?')
					.run(v.active ? 1 : 0, now(), m[1]).changes
			)
				throw new HttpError(404, 'Proveedor no encontrado.');
			audit(db, user.id, 'armory.provider.updated', m[1], { active: v.active });
		});
		send(200, { ok: true });
		return true;
	}
	throw new HttpError(404, 'Endpoint no encontrado.');
}
