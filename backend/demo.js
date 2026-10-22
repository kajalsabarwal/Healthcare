import {MemoryStore} from './store.js';
import {createApp} from './app.js';
import {randomBytes} from 'node:crypto';
const server=createApp({store:new MemoryStore(),mode:'demo',scheduler:{mode:'local'},username:'admin',password:'demo-hospital',secret:randomBytes(32).toString('hex')});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Synthetic in-memory demo: http://127.0.0.1:'+(process.env.PORT||3000)+' | admin / demo-hospital'));
