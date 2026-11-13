import type { Pool } from 'pg';
import type { Diagnostics } from '../queue/diagnostics.js';
type Minimum = { fechaMinima?: Date; categoria: NonNullable<Diagnostics['retryAfter']> };
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function httpDate(value:string,now:Date):Date|undefined {
  let match=/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), ([0-9]{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT$/.exec(value);
  let parts: string[] | undefined = match?.slice(1);
  if(!parts) {
    match=/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), ([0-9]{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-([0-9]{2}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT$/.exec(value);
    if(match) {
      parts=match.slice(1); parts[0]=parts[0]!.slice(0,3);
      let year=Math.floor(now.getUTCFullYear()/100)*100+Number(parts[3]);
      if(year>now.getUTCFullYear()+50) year-=100;
      parts[3]=String(year);
    }
  }
  if(!parts) {
    match=/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( [1-9]|[0-9]{2}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) ([0-9]{4})$/.exec(value);
    if(match) parts=[match[1]!,match[3]!.trim(),match[2]!,match[7]!,match[4]!,match[5]!,match[6]!];
  }
  if(!parts) return;
  const [dayName,day,month,year,hour,minute,second]=parts;
  const date=new Date(0); date.setUTCFullYear(Number(year),months.indexOf(month!),Number(day));
  date.setUTCHours(Number(hour),Number(minute),Number(second),0);
  if(date.getUTCFullYear()!==Number(year) || date.getUTCMonth()!==months.indexOf(month!)
    || date.getUTCDate()!==Number(day) || date.getUTCHours()!==Number(hour)
    || date.getUTCMinutes()!==Number(minute) || date.getUTCSeconds()!==Number(second)
    || weekdays[date.getUTCDay()]!==dayName) return;
  return date;
}
export async function retryAfter(pool:Pool,value:string|undefined):Promise<Minimum> {
  if(value===undefined) return {categoria:'ausente'};
  const epoch=(await pool.query<{ms:string}>('SELECT ceil(extract(epoch FROM clock_timestamp())*1000)::text AS ms')).rows[0]!.ms;
  const now=new Date(Number(epoch));
  if(/^[0-9]+$/.test(value)) {
    // Evita pérdida de precisión y nunca recorta una demora válida.
    if(value.replace(/^0+/, '').length>20) return {categoria:'no_representable'};
    const milliseconds=BigInt(now.getTime())+BigInt(value)*1000n;
    if(milliseconds>8640000000000000n) return {categoria:'no_representable'};
    return {categoria:'segundos',fechaMinima:new Date(Number(milliseconds))};
  }
  const date=httpDate(value,now);
  return date ? {categoria:'fecha',fechaMinima:date} : {categoria:'invalido'};
}
