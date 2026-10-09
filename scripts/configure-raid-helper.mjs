import {spawnSync} from 'node:child_process';
import {raidHelper,raidHelperReady} from '../src/raid-helper.mjs';
const env={...process.env,RAID_HELPER_CHANNEL_ID:'1550997172982382723'};
if(!raidHelperReady(env))throw new Error('Missing RAID_HELPER_API_KEY or DISCORD_GUILD_ID in GitHub Actions secrets.');
try{
  const api=raidHelper(env),events=await api.list();
  console.log(`Raid-Helper authenticated read succeeded. Events in configured channel: ${events.length}.`);
  if(events.length){
    const raw=await api.get(events[0].id),event=raw.event||raw;
    // Schema-only diagnostics, no member names, IDs, signups, event titles or tokens.
    console.log('Event schema fields: '+Object.keys(event).sort().join(', '));
    console.log(`Template options: ${event.classes?.length??0}; role definitions: ${event.roles?.length??0}.`);
  }
}catch(e){throw new Error(`Raid-Helper read check failed${e.status?' (HTTP '+e.status+')':''}. Check the server API key, guild and channel configuration.`);}
for(const name of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'])if(!env[name])throw new Error(`Missing ${name}.`);
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','bulk'],{input:JSON.stringify({RAID_HELPER_API_KEY:env.RAID_HELPER_API_KEY}),encoding:'utf8',env:process.env,timeout:120000});
if(result.error||result.status!==0)throw new Error('Could not install Raid-Helper secret in the existing Worker.');
console.log('Raid-Helper secret installed without changing Discord OAuth credentials.');
