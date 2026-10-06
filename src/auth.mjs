import {randomBytes,createHash} from 'node:crypto';
import {HttpError,roleFromDiscord} from './domain.mjs';
export const token=()=>randomBytes(32).toString('base64url');
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split('=')));}
export function cookie(name,value,env,maxAge){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env.APP_ORIGIN.startsWith('https:')?'; Secure':''}`;}
export function currentSession(db,req){const raw=cookies(req).session;if(!raw)return null;return db.prepare('SELECT u.id,u.display_name,u.rank,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?').get(hash(raw),Date.now())||null;}
export function issueSession(db,id){const raw=token(),csrf=token();db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(raw),id,csrf,Date.now()+30*60*1000);return {raw,csrf};}
export function oauthReady(env){return !!(env.DISCORD_CLIENT_ID&&env.DISCORD_CLIENT_SECRET&&env.DISCORD_GUILD_ID);}
export function startOAuth(db,env){
  if(!oauthReady(env))throw new HttpError(503,'El acceso con Discord está pendiente de configuración.');
  const state=token();db.prepare('DELETE FROM oauth_states WHERE expires<?').run(Date.now());db.prepare('INSERT INTO oauth_states VALUES(?,?)').run(hash(state),Date.now()+600000);
  const params=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,response_type:'code',redirect_uri:`${env.APP_ORIGIN}/auth/discord/callback`,scope:'identify guilds.members.read',state});
  return {state,url:`https://discord.com/oauth2/authorize?${params}`};
}
export async function finishOAuth(db,req,url,env,fetcher=fetch){
  const state=url.searchParams.get('state'),code=url.searchParams.get('code');
  if(!state||state!==cookies(req).oauth_state||!code)throw new HttpError(400,'La autorización de Discord no es válida. Vuelve a iniciar sesión.');
  const found=db.prepare('DELETE FROM oauth_states WHERE hash=? AND expires>? RETURNING hash').get(hash(state),Date.now());
  if(!found)throw new HttpError(400,'La autorización ha caducado o ya se ha utilizado.');
  const r=await fetcher('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:`${env.APP_ORIGIN}/auth/discord/callback`}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new HttpError(502,'Discord no ha podido completar la autorización.');
  const access=await r.json();
  const opts={headers:{Authorization:`Bearer ${access.access_token}`},signal:AbortSignal.timeout(10000)};
  const [profileRes,memberRes]=await Promise.all([fetcher('https://discord.com/api/v10/users/@me',opts),fetcher(`https://discord.com/api/v10/users/@me/guilds/${encodeURIComponent(env.DISCORD_GUILD_ID)}/member`,opts)]);
  if(!profileRes.ok||!memberRes.ok)throw new HttpError(403,'Necesitas pertenecer al Discord de la hermandad para acceder.');
  const profile=await profileRes.json(),member=await memberRes.json();
  const rank=roleFromDiscord(profile.id,member.roles||[],env);
  db.prepare('INSERT INTO users VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,rank=excluded.rank,updated_at=excluded.updated_at').run(profile.id,profile.global_name||profile.username,rank,new Date().toISOString());
  db.prepare('DELETE FROM sessions WHERE user_id=? OR expires<?').run(profile.id,Date.now());
  return issueSession(db,profile.id);
}
