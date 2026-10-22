// Runs against the real Docker Java + MySQL stack, seeded with synthetic fixtures.
import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:3000';
const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME||'admin',password:process.env.ADMIN_PASSWORD||'replace-with-a-strong-local-password'})});
assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0],user=await login.json();
const call=async(path,data)=>{const r=await fetch(base+'/api'+path,{method:data?'POST':'GET',headers:{Cookie:cookie,'X-CSRF-Token':user.csrf,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()};};
assert.equal((await call('/health')).body.storage,'mysql');
assert.equal((await call('/health')).body.scheduler,'java');
const next=await call('/doctors/1/next',{});assert.equal(next.status,200);assert.equal(next.body.patient_id,2);
const active=await Promise.all([call('/doctors/2/next',{}),call('/doctors/2/next',{})]);assert.deepEqual(active.map(x=>x.status).sort(),[200,409]);
assert.equal((await call('/records',{appointment_id:next.body.id,diagnosis:'Integration demo',notes:'Synthetic record'})).status,201);
assert.equal((await call('/patients/2/history')).body.records[0].diagnosis,'Integration demo');
assert.equal((await call('/bills',{appointment_id:next.body.id,amount_paise:50000})).status,201);
assert.equal((await call(`/appointments/${next.body.id}/complete`,{})).status,200);
console.log('Java + Node.js + MySQL integration checks passed');
