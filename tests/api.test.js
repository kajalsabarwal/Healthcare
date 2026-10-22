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
 r=await request('/bills','POST',{appointment_id:visit,amount_paise:125050});assert.equal(r.status,201);const bill=r.body.id;
 assert.equal((await request(`/bills/${bill}/paid`,'POST',{})).body.status,'paid');
 assert.equal((await request(`/appointments/${visit}/complete`,'POST',{})).status,200);
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
