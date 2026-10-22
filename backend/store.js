const tables = new Set(['patients','doctors','appointments','medical_records','bills','staff']);
const fields = {
  patients:['name','dob','phone'],doctors:['name','specialty','on_duty'],staff:['name','morning_shift','night_shift'],
  appointments:['patient_id','doctor_id','priority','reason','status','completed_at'],
  medical_records:['appointment_id','patient_id','diagnosis','treatment','recovery_status','notes'],
  bills:['appointment_id','patient_id','amount_paise','status','paid_at']
};
function table(t) {if(!tables.has(t))throw Error('Unknown table');return t;}
function entries(t,data) {return Object.entries(data).filter(([k])=>fields[t].includes(k));}

export class MysqlStore {
  constructor(pool, connection=pool) {this.pool=pool;this.connection=connection;}
  async credential(username){const [rows]=await this.connection.execute('SELECT password_hash,salt,version FROM admin_credentials WHERE username=?',[username]);return rows[0];}
  async saveCredential(username,data){await this.connection.execute('INSERT INTO admin_credentials(username,password_hash,salt,version) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),salt=VALUES(salt),version=VALUES(version)',[username,data.password_hash,data.salt,data.version]);}
  async all(t) {const [rows]=await this.connection.execute(`SELECT * FROM ${table(t)} ORDER BY id DESC LIMIT 1000`);return rows;}
  async get(t,id) {const [rows]=await this.connection.execute(`SELECT * FROM ${table(t)} WHERE id=?`,[id]);return rows[0];}
  async insert(t,data) {
    const e=entries(t,data);const [result]=await this.connection.execute(`INSERT INTO ${table(t)} (${e.map(x=>x[0]).join(',')}) VALUES (${e.map(()=>'?').join(',')})`,e.map(x=>x[1]));
    return this.get(t,result.insertId);
  }
  async patch(t,id,data) {
    const e=entries(t,data);await this.connection.execute(`UPDATE ${table(t)} SET ${e.map(x=>x[0]+'=?').join(',')} WHERE id=?`,[...e.map(x=>x[1]),id]);return this.get(t,id);
  }
  async waiting(doctor) {const [rows]=await this.connection.execute("SELECT * FROM appointments WHERE doctor_id=? AND status='waiting' ORDER BY created_at,id LIMIT 1001",[doctor]);return rows;}
  async active(doctor) {const [rows]=await this.connection.execute("SELECT * FROM appointments WHERE active_doctor=?",[doctor]);return rows[0];}
  async history(patient,before,limit) {
    const [rows]=await this.connection.execute(`SELECT id,appointment_id,patient_id,diagnosis,treatment,recovery_status,notes,created_at FROM medical_records WHERE patient_id=? AND id<? ORDER BY id DESC LIMIT ${limit}`,[patient,before]);return rows;
  }
  async withDoctor(id,fn) {
    const c=await this.pool.getConnection();try {
      await c.beginTransaction();
      const [rows]=await c.execute('SELECT id FROM doctors WHERE id=? FOR UPDATE',[id]);
      if(!rows.length){const e=Error('Doctor not found');e.status=404;throw e;}
      const result=await fn(new MysqlStore(this.pool,c));await c.commit();return result;
    }catch(e){await c.rollback();throw e;}finally{c.release();}
  }
}

export class MemoryStore {
  constructor() {
    this.data={patients:[{id:1,name:'Aarav Demo',dob:'1997-05-14',phone:'0000000001'},{id:2,name:'Isha Demo',dob:'1985-09-03',phone:'0000000002'},{id:3,name:'Rohan Demo',dob:'2001-02-18',phone:'0000000003'},{id:4,name:'Anaya Demo',dob:'2016-11-22',phone:'0000000004'}],
      doctors:[{id:1,name:'Dr Komal',specialty:'General medicine',on_duty:1},{id:2,name:'Dr Gurdeep Singh',specialty:'Cardiology',on_duty:1},{id:3,name:'Dr Balbir',specialty:'Pediatrics',on_duty:1}],staff:[{id:1,name:'Harmeet',morning_shift:1,night_shift:0},{id:2,name:'Vansh',morning_shift:1,night_shift:1},{id:3,name:'Milli',morning_shift:1,night_shift:0}],appointments:[],medical_records:[],bills:[]};
    this.credentials=new Map();
    this.tail=Promise.resolve();
    this.insert('appointments',{patient_id:1,doctor_id:1,priority:0,reason:'Routine follow-up',status:'waiting'});
    this.insert('appointments',{patient_id:2,doctor_id:1,priority:2,reason:'Staff-assigned urgent review',status:'waiting'});
    this.insert('appointments',{patient_id:3,doctor_id:2,priority:0,reason:'Scheduled follow-up',status:'waiting'});
  }
  async all(t){return structuredClone(this.data[table(t)]).sort((a,b)=>b.id-a.id).slice(0,1000);}
  async credential(username){return structuredClone(this.credentials.get(username));}
  async saveCredential(username,data){this.credentials.set(username,structuredClone(data));}
  async get(t,id){return structuredClone(this.data[table(t)].find(x=>x.id===id));}
  async insert(t,data){const rows=this.data[table(t)];const row={id:Math.max(0,...rows.map(x=>x.id))+1,created_at:new Date().toISOString(),...data};rows.push(row);return structuredClone(row);}
  async patch(t,id,data){const row=this.data[table(t)].find(x=>x.id===id);Object.assign(row,data);return structuredClone(row);}
  async waiting(id){return (await this.all('appointments')).filter(x=>x.doctor_id===id&&x.status==='waiting').sort((a,b)=>a.id-b.id);}
  async active(id){return (await this.all('appointments')).find(x=>x.doctor_id===id&&x.status==='in_progress');}
  async history(id,before,limit){return (await this.all('medical_records')).filter(x=>x.patient_id===id&&x.id<before).slice(0,limit);}
  async withDoctor(id,fn){
    const previous=this.tail;let release;this.tail=new Promise(r=>release=r);await previous;
    const snapshot=structuredClone(this.data);
    try{if(!await this.get('doctors',id)){const e=Error('Doctor not found');e.status=404;throw e;}return await fn(this);}catch(e){this.data=snapshot;throw e;}finally{release();}
  }
}
