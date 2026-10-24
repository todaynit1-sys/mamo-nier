import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import kmaHandler from '../api/kma.js';
import institutionHandler from '../api/institution.js';
import addressHandler from '../api/address.js';
const root=path.resolve(import.meta.dirname,'../dist');
http.createServer(async(req,res)=>{
  const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(requested==='/api/kma'||requested==='/api/institution'||requested==='/api/address'){
    const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>2048){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:{code:'invalid-request',message:'조회 요청이 너무 큽니다.'}}));return;}chunks.push(chunk);}
    req.body=Buffer.concat(chunks).toString('utf8');await ({'/api/kma':kmaHandler,'/api/institution':institutionHandler,'/api/address':addressHandler}[requested])(req,res);return;
  }
  const file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
  fs.createReadStream(file).pipe(res);
}).listen(8766,'127.0.0.1',()=>console.log('MAMO development: http://127.0.0.1:8766'));
