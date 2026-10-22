import {MemoryStore} from './store.js';
import {createApp} from './app.js';
import {randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
const store=new MemoryStore(),dataFile=process.env.DEMO_DATA_FILE;
if(dataFile&&existsSync(dataFile)){
 const saved=JSON.parse(readFileSync(dataFile,'utf8'));
 store.data={...store.data,...saved.data};
 store.credentials=new Map(saved.credentials||[]);
}
function save(){if(!dataFile)return;writeFileSync(dataFile+'.tmp',JSON.stringify({data:store.data,credentials:[...store.credentials]}),{mode:0o600});renameSync(dataFile+'.tmp',dataFile);}
const server=createApp({store,mode:'demo',scheduler:{mode:'local'},username:'admin',password:'demo-hospital',secret:randomBytes(32).toString('hex'),onMutation:save});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Synthetic in-memory demo: http://127.0.0.1:'+(process.env.PORT||3000)+' | admin / demo-hospital'));
