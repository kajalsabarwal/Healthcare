import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../backend/app.js';
import {MemoryStore} from '../backend/store.js';
import {localSelect} from '../backend/scheduling.js';
let server,base,cookie,csrf;
async function request(path,method='GET',data,auth=true){const res=await fetch(base+'/api'+path,{method,headers:{...(auth?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return {status:res.status,body:await res.json(),headers:res.headers};}
before(async()=>{server=createApp({store:new MemoryStore(),mode:'demo',scheduler:{mode:'local'},username:'admin',password:'testing-password',secret:'x'.repeat(32)});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;const r=await request('/login','POST',{username:'admin',password:'testing-password'},false);assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];csrf=r.body.csrf;});
after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
test('authentication, CSRF, origin, and malformed input are rejected',async()=>{
 assert.equal((await request('/state','GET',null,false)).status,401);
 assert.equal((await request('/patients','POST',{name:'bad'},false)).status,401);
 const r=await fetch(base+'/api/patients',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);
 const cross=await fetch(base+'/api/patients',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf,Origin:'https://untrusted.example'},body:'{}'});assert.equal(cross.status,403);
 assert.equal((await request('/patients','POST',{name:'Test',dob:'2025-02-31',phone:'0000000000'})).status,400);
 assert.equal((await request('/patients','POST',{name:'Test',dob:'2999-01-01',phone:'0000000000'})).status,400);
});
test('priority ordering and FIFO tie breaks',()=>{
 const row=(id,priority,time)=>({id,priority,created_at:new Date(time).toISOString()});
 assert.equal(localSelect([row(1,0,1),row(2,3,3),row(3,2,2)]),2);
 assert.equal(localSelect([row(2,0,2),row(1,0,1)]),1);
 assert.equal(localSelect([row(2,2,1),row(1,2,1)]),1);
 assert.equal(localSelect([]),0);
});
test('complete patient-to-appointment-to-record-to-billing lifecycle',async()=>{
 let r=await request('/doctors/1/next','POST',{});assert.equal(r.status,200);assert.equal(r.body.patient_id,2);const visit=r.body.id;
 assert.equal((await request('/doctors/1/next','POST',{})).status,409);
 assert.equal((await request('/doctors/1/duty','PATCH',{on_duty:false})).status,409);
 assert.equal((await request('/appointments','POST',{patient_id:2,doctor_id:2,priority:0,reason:'Duplicate'})).status,409);
 r=await request('/records','POST',{appointment_id:visit,diagnosis:'Synthetic follow-up',notes:'Demo note'});assert.equal(r.status,201);
 assert.equal((await request('/records','POST',{appointment_id:visit,diagnosis:'Duplicate',notes:'Demo'})).status,409);
 r=await request('/patients/2/history?limit=1');assert.equal(r.body.records.length,1);assert.equal(r.body.records[0].diagnosis,'Synthetic follow-up');
 const cursor=r.body.next_cursor;assert.equal((await request(`/patients/2/history?before=${cursor}`)).body.records.length,0);
 assert.equal((await request('/patients/2/history?limit=999')).status,400);
 assert.equal((await request('/bills','POST',{appointment_id:visit,amount_paise:0})).status,400);
 r=await request('/bills','POST',{appointment_id:visit,amount_paise:125050,description:'Demo consultation'});assert.equal(r.status,201);assert.equal(r.body.description,'Demo consultation');const bill=r.body.id;
 assert.equal((await request(`/bills/${bill}/paid`,'POST',{})).body.status,'paid');
 assert.equal((await request(`/appointments/${visit}/complete`,'POST',{})).status,200);
 assert.equal((await request('/state')).body.doctors.find(d=>d.id===1).available,true);
 assert.equal((await request('/state')).body.appointments.find(a=>a.id===visit).status,'completed');
 assert.equal((await request(`/appointments/${visit}/complete`,'POST',{})).status,409);
 assert.equal((await request('/doctors/1/duty','PATCH',{on_duty:false})).status,200);
 assert.equal((await request('/doctors/1/next','POST',{})).status,409);
 assert.equal((await request('/doctors/1/duty','PATCH',{on_duty:true})).status,200);
});
test('concurrent call-next requests start at most one visit',async()=>{
 const r=await Promise.all([request('/doctors/2/next','POST',{}),request('/doctors/2/next','POST',{})]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);
});
test('register patient, queue, cancel and validation',async()=>{
 const r=await request('/patients','POST',{name:'New Demo',dob:'2000-01-01',phone:'0000000010'});assert.equal(r.status,201);
 const a=await request('/appointments','POST',{patient_id:r.body.id,doctor_id:3,priority:0,reason:'Demo visit'});assert.equal(a.status,201);
 assert.equal((await request(`/appointments/${a.body.id}/complete`,'POST',{})).status,409);
 assert.equal((await request(`/appointments/${a.body.id}/cancel`,'POST',{})).status,200);
 assert.equal((await request('/doctors/3/next','POST',{})).status,409);
 assert.equal((await request('/appointments','POST',{patient_id:r.body.id,doctor_id:999,priority:0,reason:'Demo'})).status,404);
 assert.equal((await request('/appointments','POST',{patient_id:r.body.id,doctor_id:3,priority:4,reason:'Demo'})).status,400);
});
test('standalone disease, treatment and recovery history stays patient-specific',async()=>{
 const data={diagnosis:'Synthetic condition',treatment:'Demo care plan',recovery_status:'recovering',notes:'Demo progress note'};
 const r=await request('/patients/4/history','POST',data);assert.equal(r.status,201);assert.equal(r.body.appointment_id,null);
 const h=await request('/patients/4/history');assert.equal(h.body.records[0].treatment,data.treatment);assert.equal(h.body.records[0].recovery_status,'recovering');
 assert.ok(!(await request('/patients/1/history')).body.records.some(x=>x.diagnosis===data.diagnosis));
 assert.equal((await request('/patients/4/history','POST',{...data,recovery_status:'invalid'})).status,400);
 assert.equal((await request('/patients/4/history','POST',{...data,treatment:''})).status,400);
 assert.equal((await request('/patients/999/history','POST',data)).status,404);
});
test('staff has requested shifts and names can be edited',async()=>{
 const r=await request('/staff');assert.equal(r.status,200);
 const vansh=r.body.items.find(s=>s.name==='Vansh');assert.equal(vansh.morning_shift,1);assert.equal(vansh.night_shift,1);
 assert.equal(r.body.items.filter(s=>s.morning_shift).length,3);
 const staff=r.body.items.find(s=>s.name==='Milli');
 const edited=await request('/staff/'+staff.id,'PATCH',{name:'Milli Demo',morning_shift:false,night_shift:true});assert.equal(edited.body.name,'Milli Demo');assert.equal(edited.body.night_shift,1);
 assert.equal((await request('/staff/'+staff.id,'PATCH',{name:'Milli',morning_shift:false,night_shift:false})).status,400);
 assert.equal((await request('/staff/999','PATCH',{name:'Unknown',morning_shift:true,night_shift:false})).status,404);
});
test('discharge summary updates preserve history and reject stale or cross-patient edits',async()=>{
 const summary={diagnosis:'Synthetic condition',treatment:'Demo treatment',discharge_advice:'Demo discharge advice',follow_up:'Demo follow-up',discharge_date:'2025-01-10'};
 const first=await request('/patients/4/discharge-summaries','POST',summary);assert.equal(first.status,201);
 const update=await request('/patients/4/discharge-summaries','POST',{...summary,previous_id:first.body.id,follow_up:'Updated follow-up'});assert.equal(update.status,201);
 const history=await request('/patients/4/discharge-summaries');assert.equal(history.body.summaries.length,2);assert.equal(history.body.summaries[0].previous_id,first.body.id);assert.equal(history.body.summaries[1].follow_up,'Demo follow-up');
 assert.equal((await request('/patients/4/discharge-summaries','POST',{...summary,previous_id:first.body.id})).status,409);
 assert.equal((await request('/patients/1/discharge-summaries','POST',{...summary,previous_id:update.body.id})).status,400);
 assert.equal((await request('/patients/1/discharge-summaries')).body.summaries.length,0);
 assert.equal((await request('/patients/4/discharge-summaries','POST',{...summary,discharge_date:'2025-02-31'})).status,400);
 const revisions=await Promise.all([request('/patients/4/discharge-summaries','POST',{...summary,previous_id:update.body.id}),request('/patients/4/discharge-summaries','POST',{...summary,previous_id:update.body.id})]);assert.deepEqual(revisions.map(r=>r.status).sort(),[201,409]);
});
test('report images validate content and link only to the correct patient summary',async()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
 const summaries=await request('/patients/4/discharge-summaries');const id=summaries.body.summaries[0].id;
 const upload=await request('/patients/4/attachments','POST',{filename:'synthetic-report.png',summary_id:id,content_base64:png});assert.equal(upload.status,201);assert.equal(upload.body.mime,'image/png');assert.ok(!('content_base64' in upload.body));
 const listing=await request('/patients/4/attachments');assert.equal(listing.body.attachments[0].summary_id,id);assert.ok(!('content_base64' in listing.body.attachments[0]));
 const image=await fetch(base+'/api/attachments/'+upload.body.id+'/image',{headers:{Cookie:cookie}});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(png,'base64'));
 assert.equal((await fetch(base+'/api/attachments/'+upload.body.id+'/image')).status,401);
 assert.equal((await request('/patients/1/attachments','POST',{filename:'wrong-patient.png',summary_id:id,content_base64:png})).status,400);
 assert.equal((await request('/patients/4/attachments','POST',{filename:'unsafe.svg',content_base64:Buffer.from('<svg></svg>').toString('base64')})).status,400);
 assert.equal((await request('/patients/4/attachments','POST',{filename:'large.png',content_base64:Buffer.alloc(2097153).toString('base64')})).status,413);
});
