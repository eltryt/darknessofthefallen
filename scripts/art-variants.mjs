// Phone versions of the page illustrations: 1024 px wide instead of 1672 px,
// about a third of the weight. theme.css swaps them in on narrow screens.
// Run after adding or replacing an illustration: node scripts/art-variants.mjs
// sharp ships with wrangler's dependencies, so nothing extra is installed.
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';
import { mobileArt } from '../public/art-variants.js';

const dir = fileURLToPath(new URL('../public/assets/art/', import.meta.url));
const present = new Set(await readdir(dir));
for (const name of mobileArt) {
	if (!present.has(`${name}.webp`)) throw new Error(`Missing illustration: ${name}.webp`);
	const info = await sharp(join(dir, `${name}.webp`))
		.resize({ width: 1024, withoutEnlargement: true })
		.webp({ quality: 60, effort: 6, smartSubsample: true })
		.toFile(join(dir, `${name}-m.webp`));
	console.log(`${name}-m.webp ${Math.round(info.size / 1024)} KB`);
}
