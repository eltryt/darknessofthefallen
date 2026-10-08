import test from 'node:test';
import assert from 'node:assert/strict';
import {discordSecrets} from '../scripts/configure-discord.mjs';
const valid = {DISCORD_CLIENT_ID: '123456789012345678', DISCORD_CLIENT_SECRET: 'test-only-secret', DISCORD_GUILD_ID: '223456789012345678', DISCORD_LEADER_ID: '323456789012345678'};
test('Discord setup rejects incomplete configuration without revealing secret values', () => {
  assert.throws(() => discordSecrets({...valid, DISCORD_LEADER_ID: ''}), error => error.message.includes('DISCORD_LEADER_ID') && !error.message.includes(valid.DISCORD_CLIENT_SECRET));
  assert.throws(() => discordSecrets({...valid, DISCORD_CLIENT_ID: 'guild-name'}), /numeric ID/);
  assert.deepEqual(discordSecrets(valid), valid);
});
test('Discord setup preserves omitted roles and rejects malformed or unknown ranks', () => {
  assert.ok(!('DISCORD_ROLE_MAP' in discordSecrets(valid)));
  for (const map of ['null', '[]', '{broken', '{"423456789012345678":"admin"}']) assert.throws(() => discordSecrets({...valid, DISCORD_ROLE_MAP: map}), /DISCORD_ROLE_MAP/);
  const map = '{"423456789012345678":"member"}';
  assert.equal(discordSecrets({...valid, DISCORD_ROLE_MAP: map}).DISCORD_ROLE_MAP, map);
});
