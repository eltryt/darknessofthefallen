// Web Push without dependencies: RFC 8291 (aes128gcm payload encryption) and
// RFC 8292 (VAPID). WebCrypto only, so the same code runs in Node and Workers.
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

export const b64url = (bytes) =>
	btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
export function unb64url(text) {
	const s = atob(
		text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (text.length % 4)) % 4),
	);
	return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
const concat = (...parts) => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let i = 0;
	for (const p of parts) out.set(p, (i += p.length) - p.length);
	return out;
};
async function hkdf(salt, ikm, info, length) {
	const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	return new Uint8Array(
		await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8),
	);
}
// A P-256 private key from its raw scalar and uncompressed public point.
const privateJwk = (d, publicRaw) => ({
	kty: 'EC',
	crv: 'P-256',
	d: b64url(d),
	x: b64url(publicRaw.slice(1, 33)),
	y: b64url(publicRaw.slice(33, 65)),
});

// Encrypts one record for a subscription. `sender` and `salt` exist only so the
// RFC test vector can be reproduced; real messages use fresh random values.
export async function encryptPayload(
	plaintext,
	{ p256dh, auth },
	{ sender = null, salt = crypto.getRandomValues(new Uint8Array(16)) } = {},
) {
	const uaPublic = unb64url(p256dh),
		authSecret = unb64url(auth);
	let asPrivate, asPublic;
	if (sender) {
		asPublic = unb64url(sender.publicKey);
		asPrivate = await subtle.importKey(
			'jwk',
			privateJwk(unb64url(sender.privateKey), asPublic),
			{ name: 'ECDH', namedCurve: 'P-256' },
			false,
			['deriveBits'],
		);
	} else {
		const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
			'deriveBits',
		]);
		asPrivate = pair.privateKey;
		asPublic = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
	}
	const uaKey = await subtle.importKey(
		'raw',
		uaPublic,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[],
	);
	const shared = new Uint8Array(
		await subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256),
	);
	const ikm = await hkdf(
		authSecret,
		shared,
		concat(enc.encode('WebPush: info\0'), uaPublic, asPublic),
		32,
	);
	const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
	const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	const body = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
	// 0x02 marks the last (and only) record; no padding.
	const cipher = new Uint8Array(
		await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(body, new Uint8Array([2]))),
	);
	const header = new Uint8Array(21);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, 4096);
	header[20] = asPublic.length;
	return concat(header, asPublic, cipher);
}

// VAPID Authorization header for one push service origin, valid for 12 hours.
export async function vapidAuthorization(endpoint, { publicKey, privateJwk: jwk, subject }) {
	const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const claims = b64url(
		enc.encode(
			JSON.stringify({
				aud: new URL(endpoint).origin,
				exp: Math.floor(Date.now() / 1000) + 12 * 3600,
				sub: subject,
			}),
		),
	);
	const key = await subtle.importKey(
		'jwk',
		typeof jwk === 'string' ? JSON.parse(jwk) : jwk,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign'],
	);
	const signature = await subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		enc.encode(head + '.' + claims),
	);
	return `vapid t=${head}.${claims}.${b64url(signature)}, k=${publicKey}`;
}

export async function generateVapidKeys() {
	const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify',
	]);
	return {
		publicKey: b64url(await subtle.exportKey('raw', pair.publicKey)),
		privateJwk: await subtle.exportKey('jwk', pair.privateKey),
	};
}
