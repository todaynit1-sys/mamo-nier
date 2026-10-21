const weather=require('../src/weather.js');

// This is a bounded KMA AWS query, never a general URL/CORS proxy.
async function queryKma(body,{fetchImpl=fetch,now=Date.now()}={}){
  const stn=String(body.stn??'');
  if(!/^[1-9]\d{0,3}$/.test(stn))throw weather.fail('invalid-station','AWS 지점번호는 1–9999 사이의 정수로 입력하세요.');
  const range=weather.validateRange(body.tm1,body.tm2,now);
  const authKey=process.env.KMA_API_KEY||body.authKey;
  if(typeof authKey!=='string'||authKey.length<10||authKey.length>256||/[\x00-\x20]/.test(authKey))throw weather.fail('kma-auth','기상청 인증키 설정을 확인해야 합니다.');
  const url=new URL('https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-aws2_min');
  for(const [name,value]of Object.entries({...range,stn,disp:'0',help:'0',authKey}))url.searchParams.set(name,value);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetchImpl(url,{signal:controller.signal,redirect:'error',headers:{Accept:'text/plain'}});
    if([401,403].includes(response.status))throw weather.fail('kma-auth','기상청 인증키 또는 AWS 활용신청 상태를 확인해야 합니다.');
    if(response.status===429)throw weather.fail('kma-rate-limit','기상청 요청 한도에 도달했습니다. 잠시 후 다시 조회하세요.',true);
    if(!response.ok)throw weather.fail('upstream-http','기상청 서버가 정상 응답하지 않았습니다 (HTTP '+response.status+'). 잠시 후 다시 조회하세요.',true);
    const text=await response.text();if(text.length>500000)throw weather.fail('upstream-format','기상청 응답 크기가 조회 범위를 초과했습니다.');
    const observation=weather.parseAws(text,{stn,...range});
    return {ok:true,station:Number(stn),range,observation,source:'기상청 API허브 AWS',retrievedISO:new Date().toISOString()};
  }catch(error){
    if(error.code&&error.name==='WeatherError')throw error;
    if(controller.signal.aborted)throw weather.fail('timeout','기상청 응답이 8초를 초과했습니다. 잠시 후 다시 조회하세요.',true);
    throw weather.fail('connection','기상청 서버와 연결하지 못했습니다. 잠시 후 다시 조회하세요.',true);
  }finally{clearTimeout(timer);}
}

async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  if(req.method!=='POST'){res.setHeader('Allow','POST');return send(405,{ok:false,error:{code:'method',message:'POST 요청만 지원합니다.'}});}
  try{
    if(!String(req.headers['content-type']||'').startsWith('application/json'))throw weather.fail('invalid-request','JSON 요청이 필요합니다.');
    const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body??{});if(raw.length>2048)throw weather.fail('invalid-request','조회 요청이 너무 큽니다.');
    let body;try{body=JSON.parse(raw);}catch{throw weather.fail('invalid-request','조회 요청 형식을 확인하세요.');}
    if(!body||Array.isArray(body)||typeof body!=='object')throw weather.fail('invalid-request','조회 요청 형식을 확인하세요.');
    if(Object.keys(body).some(key=>!['stn','tm1','tm2','authKey'].includes(key)))throw weather.fail('invalid-request','허용되지 않은 조회 항목입니다.');
    return send(200,await queryKma(body));
  }catch(error){
    const known=error.name==='WeatherError';const code=known?error.code:'internal';
    const status=/^invalid-|^range-|^future-/.test(code)?400:code==='timeout'?504:502;
    return send(status,{ok:false,error:{code,message:known?error.message:'기상청 조회 처리 중 오류가 발생했습니다.',retryable:known?error.retryable:true}});
  }
}
module.exports=handler;
module.exports.queryKma=queryKma;
