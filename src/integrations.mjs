// Provider boundary. Future APIs must normalize data here, never in UI components.
export class CharacterProvider {async readCharacter(){throw new Error('Provider not configured');}}
export class ManualCharacterProvider extends CharacterProvider {constructor(db){super();this.db=db;}async readCharacter(id){return this.db.prepare('SELECT * FROM characters WHERE id=?').get(id);}}
export class RaidProvider {async listEvents(){return {events:[],status:'not_configured'};}}
export class LogsProvider {async guildProgress(){return {raids:[],status:'not_configured'};}}
export async function deliverRecruitment(db,env){
  const endpoint=env.DISCORD_RECRUITMENT_WEBHOOK;
  if(!endpoint)return;
  if(!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(endpoint))throw new Error('Invalid webhook destination');
  for(const row of db.prepare('SELECT o.id,o.application_id,a.data FROM outbox o JOIN applications a ON a.id=o.application_id WHERE o.delivered_at IS NULL AND o.attempts<5 LIMIT 5').all()){
    db.prepare('UPDATE outbox SET attempts=attempts+1 WHERE id=?').run(row.id);
    const a=JSON.parse(row.data);
    try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowed_mentions:{parse:[]},content:`Nueva candidatura: ${a.name} · ${a.class} · ${a.role}\n${env.APP_ORIGIN}/panel?application=${row.application_id}`}),signal:AbortSignal.timeout(10000)});if(r.ok)db.prepare('UPDATE outbox SET delivered_at=? WHERE id=?').run(new Date().toISOString(),row.id);}catch{/* Retry by next job; no token or candidate data in logs. */}
  }
}
