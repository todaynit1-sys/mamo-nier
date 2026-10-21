import {createHash,timingSafeEqual} from 'node:crypto';
import institution from '../src/institution-access.js';

// Credential values are supplied only by the deployment's encrypted environment.
export function verifyInstitution(code,configuration){
  let entries;
  try{const parsed=JSON.parse(configuration||'');if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error();entries=Object.entries(parsed);if(!entries.length||entries.some(([key,id])=>!key.trim()||!institution.profile(id)))throw Error();}
  catch{return {configured:false,profile:null};}
  if(typeof code!=='string'||!code.trim()||code.length>32)return {configured:true,profile:null};
  const hash=value=>createHash('sha256').update(value.trim().toLowerCase()).digest(),input=hash(code);
  let profile=null;
  for(const [candidate,id] of entries)if(timingSafeEqual(input,hash(candidate)))profile=institution.profile(id);
  return {configured:true,profile};
}
function send(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(payload));}
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');send(res,405,{ok:false,error:{code:'method',message:'POST 요청만 사용할 수 있습니다.'}});return;}
  let body;
  try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||Object.keys(body).some(key=>key!=='code')||typeof body.code!=='string'||body.code.length>32)throw Error();}
  catch{send(res,400,{ok:false,error:{code:'invalid-request',message:'기관 코드 입력을 확인하세요.'}});return;}
  const result=verifyInstitution(body.code,process.env.MAMO_INSTITUTION_CODES);
  if(!result.configured){send(res,503,{ok:false,error:{code:'configuration',message:'기관 접속 설정을 확인 중입니다. 잠시 후 다시 시도하세요.'}});return;}
  if(!result.profile){send(res,401,{ok:false,error:{code:'invalid-code',message:'기관 코드가 올바르지 않습니다.'}});return;}
  send(res,200,{ok:true,profile:result.profile});
}
