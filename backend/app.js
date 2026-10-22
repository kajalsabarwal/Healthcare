import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHmac,timingSafeEqual,scryptSync} from 'node:crypto';
import {selectNext,doctorAvailability} from './scheduling.js';
import {createRecovery} from './recovery.js';
const fail=(status,message)=>{const e=Error(message);e.status=status;throw e;};
const integer=(v,min=1,max=2147483647)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail(400,'Invalid integer');return v;};
const text=(v,max=100)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(400,`Text must contain 1–${max} characters`);return v.trim();};
const exists=async(s,t,id)=>await s.get(t,id)||fail(404,'Resource not found');
const now=()=>new Date();
function recordData(b){
  const recovery_status=b.recovery_status??'under_treatment';
  if(!['under_treatment','recovering','recovered','follow_up'].includes(recovery_status))fail(400,'Invalid recovery status');
  return {diagnosis:text(b.diagnosis,1000),treatment:b.treatment===undefined?'':text(b.treatment,2000),recovery_status,notes:text(b.notes,2000)};
}
function same(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)fail(413,'Request too large');}try{return JSON.parse(raw||'{}');}catch{fail(400,'Invalid JSON');}}

export function createApp({store,mode='mysql',scheduler={mode:'java'},username,password,secret,recovery=createRecovery(),onMutation=()=>{}}) {
  if(!username||!password||!secret||secret.length<32)throw Error('Set administrator credentials and a session secret of at least 32 characters');
  const clients=new Set(),attempts=new Map();
  const hash=scryptSync(password,'hospital-admin',64);
  const currentCredential=async()=>await store.credential(username)||{password_hash:hash.toString('hex'),salt:'hospital-admin',version:'initial'};
  const recoveryLimits=new Map();
  function recoveryLimit(key,max){const now=Date.now();for(const [k,v] of recoveryLimits)if(v.until<now)recoveryLimits.delete(k);const value=recoveryLimits.get(key)||{count:0,until:now+15*60000};value.count++;recoveryLimits.set(key,value);if(value.count>max)fail(429,'Too many recovery attempts. Try again in 15 minutes.');}
  const sign=p=>createHmac('sha256',secret).update(p).digest('base64url');
  function session(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hospital_session='))?.slice(17);if(!cookie)return null;const [p,s]=cookie.split('.');if(!s||!same(sign(p),s))return null;try{const v=JSON.parse(Buffer.from(p,'base64url').toString());return v.exp>Date.now()?v:null;}catch{return null;}}
  const broadcast=()=>{onMutation();for(const res of clients)res.write('event: refresh\ndata: {}\n\n');};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
      if(path==='/api/health'&&method==='GET')return json(200,{status:'ok',storage:mode,scheduler:scheduler.mode});
      if(!path.startsWith('/api/')) {
        const allowed={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
        if(method!=='GET'||!allowed[path])fail(404,'Not found');
        const mime=path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html';
        res.setHeader('Content-Type',mime+'; charset=utf-8');return res.end(await readFile(fileURLToPath(new URL('../frontend/'+allowed[path],import.meta.url))));
      }
      if(!['GET','HEAD'].includes(method)) {
        // Same-origin browser writes only. CLI clients use session + CSRF header.
        const origin=req.headers.origin;
        if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)fail(403,'Cross-origin write rejected');
        if(!String(req.headers['content-type']||'').startsWith('application/json'))fail(415,'Use application/json');
      }
      if(path==='/api/recovery/config'&&method==='GET')return json(200,recovery.config());
      if(['/api/recovery/request','/api/recovery/reset'].includes(path)&&method==='POST'){
        const b=await body(req),channel=b.channel;
        if(!['sms','email'].includes(channel))fail(400,'Choose SMS or email');
        const contact=text(b.contact,254),valid=recovery.matches(channel,contact)&&b.username===username;
        recoveryLimit(req.socket.remoteAddress+path,path.endsWith('/request')?5:10);
        recoveryLimit('account:'+path,path.endsWith('/request')?5:10);
        if(path.endsWith('/request')){
          if(!recovery.config().enabled)fail(503,'Recovery delivery is not configured. Contact the administrator.');
          if(valid)await recovery.send(channel);
          return json(200,{message:'If these details match the recovery account, a verification code has been sent.'});
        }
        if(typeof b.password!=='string'||b.password.length<12||b.password.length>128)fail(400,'Use a new password of 12–128 characters');
        if(typeof b.code!=='string'||!/^\d{6,10}$/.test(b.code))fail(400,'Enter a valid verification code');
        if(!valid||!await recovery.verify(channel,b.code))fail(400,'Invalid or expired verification code');
        const salt=randomBytes(16).toString('hex'),version=randomBytes(16).toString('hex');
        await store.saveCredential(username,{password_hash:scryptSync(b.password,salt,64).toString('hex'),salt,version});
        onMutation();
        for(const client of clients)client.end();clients.clear();
        res.setHeader('Set-Cookie','hospital_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return json(200,{message:'Password reset. Sign in with your new password.'});
      }
      if(path==='/api/login'&&method==='POST') {
        const key=req.socket.remoteAddress;const a=attempts.get(key)||{count:0,start:Date.now()};
        if(Date.now()-a.start>60000){a.count=0;a.start=Date.now();}if(++a.count>10)fail(429,'Too many login attempts. Try again in a minute.');attempts.set(key,a);
        const credential=await currentCredential();
        const b=await body(req);if(typeof b.password!=='string'||b.password.length>200||b.username!==username||!timingSafeEqual(Buffer.from(credential.password_hash,'hex'),scryptSync(b.password,credential.salt,64)))fail(401,'Invalid credentials');
        const user={username,version:credential.version,csrf:randomBytes(24).toString('hex'),exp:Date.now()+8*3600000};const p=Buffer.from(JSON.stringify(user)).toString('base64url');
        res.setHeader('Set-Cookie',`hospital_session=${p}.${sign(p)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);
        return json(200,{username,csrf:user.csrf,mode});
      }
      const user=session(req);if(!user)fail(401,'Please sign in');
      if(user.version!==(await currentCredential()).version)fail(401,'Password changed. Sign in again.');
      if(method!=='GET'&&!same(String(req.headers['x-csrf-token']||''),user.csrf))fail(403,'Invalid CSRF token');
      if(path==='/api/session'&&method==='GET')return json(200,{username:user.username,csrf:user.csrf,mode});
      if(path==='/api/logout'&&method==='POST'){res.setHeader('Set-Cookie','hospital_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(200,{ok:true});}
      if(path==='/api/events'&&method==='GET') {
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write('event: refresh\ndata: {}\n\n');clients.add(res);
        const timer=setInterval(()=>{if(Date.now()>user.exp){res.end();return;}res.write(': heartbeat\n\n');},15000);
        req.on('close',()=>{clearInterval(timer);clients.delete(res);});return;
      }
      if(path==='/api/state'&&method==='GET') {
        const [patients,doctors,appointments,bills]=await Promise.all(['patients','doctors','appointments','bills'].map(t=>store.all(t)));
        return json(200,{patients,doctors:await doctorAvailability(doctors,appointments,scheduler),appointments,bills,mode});
      }
      const collections={'/api/patients':'patients','/api/doctors':'doctors','/api/appointments':'appointments','/api/bills':'bills'};
      if(path==='/api/staff'&&method==='GET')return json(200,{items:await store.all('staff')});
      const staffMatch=path.match(/^\/api\/staff\/(\d+)$/);
      if((path==='/api/staff'&&method==='POST')||(staffMatch&&method==='PATCH')){
        const b=await body(req);if(typeof b.morning_shift!=='boolean'||typeof b.night_shift!=='boolean'||(!b.morning_shift&&!b.night_shift))fail(400,'Assign at least one shift');
        const data={name:text(b.name),morning_shift:b.morning_shift?1:0,night_shift:b.night_shift?1:0};
        let row;if(staffMatch){const id=integer(+staffMatch[1]);await exists(store,'staff',id);row=await store.patch('staff',id,data);}else row=await store.insert('staff',data);
        broadcast();return json(staffMatch?200:201,row);
      }
      if(collections[path]&&method==='GET')return json(200,{items:await store.all(collections[path]),limit:1000});
      if(path==='/api/patients'&&method==='POST') {
        const b=await body(req),dob=text(b.dob,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||!Number.isFinite(Date.parse(dob))||new Date(dob).toISOString().slice(0,10)!==dob||dob>new Date().toISOString().slice(0,10)||dob<'1900-01-01')fail(400,'Enter a valid past birth date');
        const phone=text(b.phone,20);if(!/^[+\d ()-]{7,20}$/.test(phone))fail(400,'Invalid phone number');
        const row=await store.insert('patients',{name:text(b.name),dob,phone});broadcast();return json(201,row);
      }
      if(path==='/api/doctors'&&method==='POST') {const b=await body(req);const row=await store.insert('doctors',{name:text(b.name),specialty:text(b.specialty,80),on_duty:1});broadcast();return json(201,row);}
      let match=path.match(/^\/api\/doctors\/(\d+)\/duty$/);
      if(match&&method==='PATCH') {
        const id=integer(+match[1]),b=await body(req);if(typeof b.on_duty!=='boolean')fail(400,'on_duty must be boolean');
        const row=await store.withDoctor(id,async s=>{if(!b.on_duty&&await s.active(id))fail(409,'Complete the active visit before going off duty');return s.patch('doctors',id,{on_duty:b.on_duty?1:0});});broadcast();return json(200,row);
      }
      if(path==='/api/appointments'&&method==='POST') {
        const b=await body(req),doctor=integer(b.doctor_id),patient=integer(b.patient_id),priority=integer(b.priority,0,3),reason=text(b.reason,300);
        const row=await store.withDoctor(doctor,async s=>{
          await exists(s,'patients',patient);const d=await exists(s,'doctors',doctor);if(!d.on_duty)fail(409,'Doctor is off duty');
          if((await s.all('appointments')).some(x=>x.patient_id===patient&&['waiting','in_progress'].includes(x.status)))fail(409,'Patient already has an open appointment');
          const queued=await s.waiting(doctor);if(queued.length>=1000)fail(409,'Doctor queue is full');
          return s.insert('appointments',{patient_id:patient,doctor_id:doctor,priority,reason,status:'waiting'});
        });broadcast();return json(201,row);
      }
      match=path.match(/^\/api\/doctors\/(\d+)\/next$/);
      if(match&&method==='POST') {
        const doctor=integer(+match[1]);const row=await store.withDoctor(doctor,async s=>{
          const d=await exists(s,'doctors',doctor);if(!d.on_duty)fail(409,'Doctor is off duty');if(await s.active(doctor))fail(409,'Doctor already has an active visit');
          const visits=await s.waiting(doctor);if(visits.length>1000)fail(409,'Queue exceeds supported capacity');
          const id=await selectNext(doctor,true,visits,scheduler);if(!id)fail(409,'No patients waiting');
          return s.patch('appointments',id,{status:'in_progress'});
        });broadcast();return json(200,row);
      }
      match=path.match(/^\/api\/appointments\/(\d+)\/(complete|cancel)$/);
      if(match&&method==='POST') {
        const id=integer(+match[1]),action=match[2],a=await exists(store,'appointments',id);
        const row=await store.withDoctor(a.doctor_id,async s=>{const current=await exists(s,'appointments',id);if(current.status!==(action==='complete'?'in_progress':'waiting'))fail(409,'Appointment cannot make that transition');return s.patch('appointments',id,{status:action==='complete'?'completed':'cancelled',completed_at:now()});});broadcast();return json(200,row);
      }
      match=path.match(/^\/api\/patients\/(\d+)\/history$/);
      if(match&&method==='GET') {const id=integer(+match[1]);await exists(store,'patients',id);const before=integer(Number(url.searchParams.get('before')||2147483647)),limit=integer(Number(url.searchParams.get('limit')||20),1,100);const rows=await store.history(id,before,limit);return json(200,{records:rows,next_cursor:rows.length===limit?rows.at(-1).id:null});}
      if(match&&method==='POST') {
        const patient_id=integer(+match[1]);await exists(store,'patients',patient_id);
        const b=await body(req),data=recordData(b);
        if(!data.treatment)fail(400,'Enter the treatment or care plan');
        const row=await store.insert('medical_records',{patient_id,appointment_id:null,...data});
        broadcast();return json(201,row);
      }
      if(['/api/records','/api/bills'].includes(path)&&method==='POST') {
        const b=await body(req),id=integer(b.appointment_id),a=await exists(store,'appointments',id),isBill=path==='/api/bills';
        const row=await store.withDoctor(a.doctor_id,async s=>{const visit=await exists(s,'appointments',id);if(!['in_progress','completed'].includes(visit.status))fail(409,'Start the visit first');
          const t=isBill?'bills':'medical_records';if((await s.all(t)).some(x=>x.appointment_id===id))fail(409,'Entry already exists for this visit');
          const data=isBill?{amount_paise:integer(b.amount_paise,1,100000000),status:'unpaid'}:recordData(b);
          return s.insert(t,{appointment_id:id,patient_id:visit.patient_id,...data});
        });broadcast();return json(201,row);
      }
      match=path.match(/^\/api\/bills\/(\d+)\/paid$/);
      if(match&&method==='POST') {const id=integer(+match[1]),b=await exists(store,'bills',id),a=await exists(store,'appointments',b.appointment_id);const row=await store.withDoctor(a.doctor_id,async s=>s.patch('bills',id,{status:'paid',paid_at:now()}));broadcast();return json(200,row);}
      fail(404,'Route not found');
    }catch(e){if(res.headersSent)return res.end();const status=e.status||(e.code==='ER_DUP_ENTRY'?409:500);if(status===500)console.error('Request failed:',e.code||e.message);json(status,{error:status===500?'Internal server error':e.code==='ER_DUP_ENTRY'?'Duplicate or conflicting appointment':e.message});}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  server.on('close',()=>{for(const res of clients)res.end();});
  return server;
}
