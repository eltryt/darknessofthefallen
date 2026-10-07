export const ranks = ['visitor','member','raider','raid_leader','officer','leader'];
export const classes = ['Guerrero','Paladín','Cazador','Pícaro','Sacerdote','Chamán','Mago','Brujo','Druida'];
export const combatRoles = ['Tanque','Sanador','DPS melee','DPS distancia'];
export const permissions = {
  'community.read':'member',
  'character.write':'member','roster.read':'raid_leader','attendance.manage':'raid_leader',
  'loot.manage':'raid_leader','progress.manage':'raid_leader','recruitment.manage':'officer',
  'members.manage':'officer','audit.read':'officer','settings.manage':'leader','backup.export':'leader'
};
export function can(user, permission) {
  return !!user && permission in permissions && ranks.indexOf(user.rank) >= ranks.indexOf(permissions[permission]);
}
export function roleFromDiscord(id, roles, env) {
  if (env.DISCORD_LEADER_ID && id === env.DISCORD_LEADER_ID) return 'leader';
  const map = JSON.parse(env.DISCORD_ROLE_MAP || '{}');
  return roles.reduce((rank,role)=>ranks.includes(map[role]) && ranks.indexOf(map[role])>ranks.indexOf(rank)?map[role]:rank,'visitor');
}
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export function text(value,name,max=200,required=true) {
  if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim())) throw new HttpError(400,`Campo no válido: ${name}`);
  return value.trim();
}
export function choice(value,values,name) {if(!values.includes(value))throw new HttpError(400,`Valor no válido: ${name}`);return value;}
export function characterInput(v) {
  return {name:text(v.name,'nombre',40),surname:text(v.surname??'','apellido',40,false),class:choice(v.class,classes,'clase'),role:choice(v.role,combatRoles,'rol'),spec:text(v.spec??'','especialización',80,false),professions:text(v.professions??'','profesiones',160,false),availability:text(v.availability??'','disponibilidad',500,false),notes:text(v.notes??'','notas',2000,false),isMain:v.isMain===true};
}
export function publicCharacter(c){return {name:[c.name,c.surname].filter(Boolean).join(' '),class:c.class,role:c.role};}
export function attendanceMetrics(rows){const result={raids:rows.length,attended:0,absent:0,reserve:0,late:0};for(const r of rows){if(r.status==='Asistió')result.attended++;if(r.status==='Ausente')result.absent++;if(r.status==='Reserva')result.reserve++;if(r.status==='Llegó tarde')result.late++;}result.percentage=result.raids?Math.round((result.attended+result.late)/result.raids*100):0;return {...result,formula:'(Asistió + Llegó tarde) / registros',policy:'Indicador descriptivo; no determina prioridad de loot.'};}
