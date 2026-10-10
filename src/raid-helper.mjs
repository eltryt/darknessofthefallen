// Only endpoints documented at https://raid-helper.dev/documentation/api.
export const raidHelperReady=env=>Boolean(env.RAID_HELPER_API_KEY&&/^\d{17,20}$/.test(env.DISCORD_GUILD_ID||'')&&/^\d{17,20}$/.test(env.RAID_HELPER_CHANNEL_ID||''));
export class ProviderError extends Error {
  constructor(status,retryAfter=60){super(`Raid-Helper HTTP ${status}`);this.status=status;this.retryAfter=retryAfter;}
}
export function raidHelper(env,transport=fetch){
  const call=async(path,method='GET',value,headers={})=>{
    if(!raidHelperReady(env))throw new ProviderError(503);
    const r=await transport('https://raid-helper.xyz/api/'+path,{method,redirect:'manual',headers:{Authorization:env.RAID_HELPER_API_KEY,'Content-Type':'application/json',...headers},...(value===undefined?{}:{body:JSON.stringify(value)}),signal:AbortSignal.timeout(10000)});
    if(!r.ok){
      let seconds=Number(r.headers.get('retry-after'))||60,reason='';
      try{const data=await r.json();if(r.status===429)seconds=Number(data.retry_after)||seconds;const value=data.reason||data.message||data.error;
        if(typeof value==='string'){reason=value.replaceAll(env.RAID_HELPER_API_KEY,'[redacted]').replace(/\b\d{17,20}\b/g,'[id]').slice(0,250);}
      }catch{}
      const error=new ProviderError(r.status,Math.max(5,Math.min(seconds,86400)));error.reason=reason;throw error;
    }
    const valueOut=await r.json();if(valueOut.status&&valueOut.status!=='success')throw new ProviderError(422);
    return valueOut;
  };
  const id=value=>{if(!/^[\w-]{1,80}$/.test(String(value)))throw new ProviderError(400);return encodeURIComponent(value);};
  return {
    async list(){
      const events=[];for(let page=1;page<=10;page++){
        const data=await call(`v4/servers/${id(env.DISCORD_GUILD_ID)}/events`,'GET',undefined,{Page:String(page),ChannelFilter:env.RAID_HELPER_CHANNEL_ID});
        if(!Array.isArray(data.postedEvents)||!Number.isInteger(data.pages)||data.pages>10)throw new ProviderError(502);
        events.push(...data.postedEvents);if(page>=data.pages)return events;
      }throw new ProviderError(502);
    },
    get:event=>call(`v4/events/${id(event)}`),
    create:value=>call(`v4/servers/${id(env.DISCORD_GUILD_ID)}/channels/${id(env.RAID_HELPER_CHANNEL_ID)}/event`,'POST',value),
    update:(event,value)=>call(`v4/events/${id(event)}`,'PATCH',value),
    remove:event=>call(`v4/events/${id(event)}`,'DELETE'),
    signup:(event,value)=>call(`v4/events/${id(event)}/signups`,'POST',value),
    editSignup:(event,signup,value)=>call(`v4/events/${id(event)}/signups/${id(signup)}`,'PATCH',value),
    removeSignup:(event,signup)=>call(`v4/events/${id(event)}/signups/${id(signup)}`,'DELETE')
  };
}
