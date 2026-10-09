import {HttpError} from './domain.mjs';
// Wall-clock form input is always Madrid, regardless of the user's device zone.
export function madridInstant(input){
  if(typeof input!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(input))throw new HttpError(400,'Indica fecha y hora de Madrid.');
  const wall=Date.parse(input+'Z'),format=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const candidates=[wall-3600000,wall-7200000].filter(t=>format.format(t).replace(' ','T')===input);
  if(candidates.length!==1)throw new HttpError(400,'La hora no existe o se repite por el cambio de hora; elige otra hora.');
  return new Date(candidates[0]).toISOString();
}
