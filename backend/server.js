import {MysqlStore} from './store.js';
import {createApp} from './app.js';
import mysql from 'mysql2/promise';
const pool=mysql.createPool({host:process.env.MYSQL_HOST||'localhost',port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE||'hospital',waitForConnections:true,connectionLimit:10,timezone:'Z',dateStrings:true});
await pool.query('SELECT 1');
const server=createApp({store:new MysqlStore(pool),scheduler:{mode:'java',url:process.env.SCHEDULER_URL||'http://localhost:8080'},username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD,secret:process.env.SESSION_SECRET});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Hospital application listening on port '+(process.env.PORT||3000)));
process.on('SIGTERM',()=>server.close(async()=>{await pool.end();process.exit(0);}));
