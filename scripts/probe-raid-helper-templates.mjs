// Manual probe only. For each candidate template it creates one event labelled
// PRUEBA TÉCNICA, prints the template's classes and specs, tries one API sign-up for the
// leader while `allowed_roles` names a role the leader lacks, and deletes the event.
// Prints no ids, keys or member names.
import { raidHelper, raidHelperReady } from '../src/raid-helper.mjs';
const env = { ...process.env, RAID_HELPER_CHANNEL_ID: '1550997172982382723' };
if (!raidHelperReady(env) || !/^\d{17,20}$/.test(env.DISCORD_LEADER_ID || ''))
	throw new Error('Missing test configuration.');
const api = raidHelper(env);
const role = env.PROBE_ALLOWED_ROLE || 'Personaje registrado';
const candidates = (env.PROBE_TEMPLATES || 'wowclassic').split(',').map((s) => s.trim());
const start = Math.floor(Date.now() / 1000) + 30 * 86400;
const why = (e) => `HTTP ${e.status || '?'} ${e.reason || e.message || ''}`.slice(0, 200);
for (const templateId of candidates) {
	console.log(`\n== Template "${templateId}" ==`);
	let eventId;
	try {
		const created = await api.create({
			leaderId: env.DISCORD_LEADER_ID,
			templateId,
			title: 'PRUEBA TÉCNICA plantilla (se borra sola)',
			description: 'Prueba automática de la web. Se elimina en unos segundos.',
			date: String(start),
			time: String(start),
			advancedSettings: {
				duration: 120,
				limit_per_user: 1,
				allow_duplicate: false,
				mentions: '',
				mention_leader: false,
				allowed_roles: role,
				bench_overflow: false,
			},
		});
		eventId = (created.event || created).id;
		const event = await api.get(eventId);
		const raw = event.event || event;
		console.log(
			'Settings echoed: allowed_roles=' +
				JSON.stringify(raw.advancedSettings?.allowed_roles) +
				' bench_overflow=' +
				JSON.stringify(raw.advancedSettings?.bench_overflow),
		);
		for (const c of raw.classes || [])
			console.log(
				`  class ${c.name} [${c.type || ''}] specs: ${(c.specs || []).map((s) => s.name).join(', ')}`,
			);
		console.log('  roles: ' + (raw.roles || []).map((r) => r.name).join(', '));
		const cls = (raw.classes || []).find((c) => c.type !== 'default' && (c.specs || []).length);
		if (cls) {
			try {
				await api.signup(eventId, {
					userId: env.DISCORD_LEADER_ID,
					name: 'PRUEBA',
					className: cls.name,
					specName: cls.specs[0].name,
				});
				const after = (await api.get(eventId)).signUps || [];
				console.log(
					`  API sign-up without the role: accepted, ${after.length} sign-up(s), status ${after.map((s) => s.status + '/' + s.className).join(', ')}`,
				);
			} catch (e) {
				console.log('  API sign-up without the role: rejected ' + why(e));
			}
		}
	} catch (e) {
		console.log('  create/read failed: ' + why(e));
	} finally {
		if (eventId)
			try {
				await api.remove(eventId);
				console.log('  test event deleted');
			} catch (e) {
				console.log('  DELETE FAILED, remove the PRUEBA TÉCNICA message by hand: ' + why(e));
			}
	}
}
