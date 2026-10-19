import test from 'node:test';
import assert from 'node:assert/strict';
import {
	encryptPayload,
	b64url,
	unb64url,
	vapidAuthorization,
	generateVapidKeys,
} from '../src/web-push.mjs';

test('payload encryption matches the RFC 8291 test vector', async () => {
	const body = await encryptPayload(
		'When I grow up, I want to be a watermelon',
		{
			p256dh:
				'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
			auth: 'BTBZMqHH6r4Tts7J_aSIgg',
		},
		{
			sender: {
				publicKey:
					'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
				privateKey: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
			},
			salt: unb64url('DGv6ra1nlYgDCS1FRnbzlw'),
		},
	);
	assert.equal(
		b64url(body),
		'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
	);
});

test('VAPID authorization is a verifiable ES256 token for the push service origin', async () => {
	const keys = await generateVapidKeys();
	const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', {
		...keys,
		subject: 'https://darknessofthefallen.com',
	});
	const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
	assert.equal(k, keys.publicKey);
	const [h, c, s] = token.split('.');
	const claims = JSON.parse(new TextDecoder().decode(unb64url(c)));
	assert.equal(claims.aud, 'https://fcm.googleapis.com');
	const key = await crypto.subtle.importKey(
		'raw',
		unb64url(keys.publicKey),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['verify'],
	);
	assert.ok(
		await crypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			key,
			unb64url(s),
			new TextEncoder().encode(h + '.' + c),
		),
	);
});
