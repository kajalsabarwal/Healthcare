export function localSelect(visits) {
  return [...visits].sort((a,b)=>b.priority-a.priority||new Date(a.created_at)-new Date(b.created_at)||a.id-b.id)[0]?.id||0;
}
export async function doctorAvailability(doctors,appointments,{mode='java',url='http://scheduler:8080'}={}) {
  const busy=new Set(appointments.filter(x=>x.status==='in_progress').map(x=>x.doctor_id));
  if(mode==='local')return doctors.map(d=>({...d,available:!!d.on_duty&&!busy.has(d.id)}));
  const body=doctors.map(d=>`${d.id}\t${!!d.on_duty}\t${busy.has(d.id)}`).join('\n');
  try {
    const r=await fetch(url+'/availability',{method:'POST',body,signal:AbortSignal.timeout(3000)});
    if(!r.ok)throw Error('Scheduler rejected snapshot');
    const rows=(await r.text()).trim().split('\n').filter(Boolean).map(x=>x.split('\t'));
    if(rows.length!==doctors.length||rows.some(x=>!['true','false'].includes(x[1])))throw Error('Invalid availability response');
    const availability=new Map(rows.map(([id,value])=>[+id,value==='true']));
    if(doctors.some(d=>!availability.has(d.id)))throw Error('Missing doctor availability');
    return doctors.map(d=>({...d,available:availability.get(d.id)}));
  }catch{const e=Error('Doctor availability service unavailable');e.status=503;throw e;}
}
export async function selectNext(doctor,available,visits,{mode='java',url='http://scheduler:8080'}={}) {
  if(!available)return 0;
  if(mode==='local')return localSelect(visits);
  const body=[`${doctor}\t${available}`,...visits.map(x=>`${x.id}\t${x.priority}\t${new Date(x.created_at).getTime()}`)].join('\n');
  let response;
  try{response=await fetch(url+'/next',{method:'POST',body,signal:AbortSignal.timeout(3000)});}catch{const e=Error('Scheduling service unavailable. Queue was not changed.');e.status=503;throw e;}
  const id=Number(await response.text());
  if(!response.ok||!Number.isSafeInteger(id)||id<0||(id!==0&&!visits.some(x=>x.id===id))){const e=Error('Invalid scheduling service response');e.status=503;throw e;}
  return id;
}
