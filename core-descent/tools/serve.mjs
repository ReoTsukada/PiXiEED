import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const port=Number(process.env.PORT||4173);
const path=new URL('../dist/index.html',import.meta.url);
createServer(async(req,res)=>{if(req.url!=='/'&&req.url!=='/index.html'){res.writeHead(404);res.end('Not found');return;}try{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(path));}catch{res.writeHead(503);res.end('Run npm run build first.');}}).listen(port,'0.0.0.0',()=>console.log(`CORE DESCENT local preview: http://localhost:${port}`));
