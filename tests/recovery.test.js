import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../backend/app.js';
import {MemoryStore} from '../backend/store.js';
import {createRecovery} from '../backend/recovery.js';

test('recovery requires OTP, changes credentials, rejects replay, and invalidates sessions',async()=>{
 const store=new MemoryStore(),sent=[];let used=false;
 const recovery={config:()=>({enabled:true,phone:'+15550000000',channels:['sms','email']}),matches:(c,v)=>(c==='sms'&&v==='+15550000000')||(c==='email'&&v==='admin@example.test'),send:async c=>{sent.push(c);},verify:async(c,code)=>{if(code!=='123456'||used)return false;used=true;return true;}};
 const server=createApp({store,mode:'demo',scheduler:{mode:'local'},username:'admin',password:'initial-password',secret:'s'.repeat(32),recovery});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,data,cookie)=>{const r=await fetch(base+'/api'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
 const login=await call('/login',{username:'admin',password:'initial-password'});assert.equal(login.status,200);
 const account={username:'admin',channel:'sms',contact:'+15550000000'};
 assert.equal((await call('/recovery/request',{...account,contact:'+15550000001'})).status,200);assert.equal(sent.length,0);
 assert.equal((await call('/recovery/request',account)).status,200);assert.deepEqual(sent,['sms']);
 const reset={...account,code:'000000',password:'new-secure-password'};
 assert.equal((await call('/recovery/reset',reset)).status,400);
 assert.equal((await call('/recovery/reset',{...reset,code:'123456',password:'short'})).status,400);
 assert.equal((await call('/recovery/reset',{...reset,code:'123456'})).status,200);
 assert.equal((await call('/recovery/reset',{...reset,code:'123456'})).status,400);
 assert.equal((await call('/session',null,login.cookie)).status,401);
 assert.equal((await call('/login',{username:'admin',password:'initial-password'})).status,401);
 assert.equal((await call('/login',{username:'admin',password:'new-secure-password'})).status,200);
 assert.ok((await store.credential('admin')).password_hash!=='new-secure-password');
 assert.equal((await call('/recovery/request',{username:'admin',channel:'email',contact:'admin@example.test'})).status,200);assert.equal(sent.at(-1),'email');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('provider adapter uses configured contacts and never returns verification codes',async()=>{
 const calls=[];const provider=createRecovery({RECOVERY_PHONE:'+15550000000',RECOVERY_EMAIL:'admin@example.test',TWILIO_ACCOUNT_SID:'account',TWILIO_AUTH_TOKEN:'secret',TWILIO_VERIFY_SERVICE_SID:'service'},async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({status:url.endsWith('VerificationCheck')?'approved':'pending'})};});
 await provider.send('sms');await provider.send('email');assert.equal(await provider.verify('email','123456'),true);
 assert.equal(calls[0].options.body.get('Channel'),'sms');assert.equal(calls[1].options.body.get('To'),'admin@example.test');assert.ok(!JSON.stringify(provider.config()).includes('secret'));
 assert.equal(createRecovery({}).config().enabled,false);
 await assert.rejects(()=>createRecovery({}).send('sms'),/not configured/);
});
