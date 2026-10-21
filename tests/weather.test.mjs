import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const require=createRequire(import.meta.url),weather=require('../src/weather.js'),{queryKma}=require('../api/kma.js'),handler=require('../api/kma.js');
const range={tm1:'202606011434',tm2:'202606011436'},now=Date.UTC(2026,9,21);
const table='# YYMMDDHHMI STN WD1 WS1 WDS WSS WD10 WS10\n202606011434 112 350 2 100 9 350 2\n202606011435 112 10 2 110 8 10 2\n202606011436 112 -99 -99 200 10 20 3\n#7777END';

test('measurement ranges use KST independent of host timezone and cross midnight correctly',()=>{
  assert.equal(weather.measurementMinute('2026-06-01T05:34:16Z'),'202606011434');
  assert.equal(weather.measurementMinute('2026-06-01T14:34:16+09:00'),'202606011434');
  assert.equal(weather.measurementMinute('2026/6/1 14:34:16'),'202606011434');
  assert.deepEqual(weather.measurementRange([{time:'2026-06-01 23:59:00'},{time:'2026-06-02 00:01:00'}],now),{tm1:'202606012359',tm2:'202606020001'});
});
test('missing, impossible, future and over-one-day dates are rejected without current-weather substitution or truncation',()=>{
  for(const value of ['10:34:00','2026-02-30 12:00','2026-02-30T12:00:00Z','2026-06-01 12:00:99','202602301200',null])assert.equal(weather.measurementMinute(value),null);
  assert.throws(()=>weather.measurementRange([{time:'10:34:00'}],now),{code:'missing-time'});
  assert.throws(()=>weather.validateRange(202606011434,range.tm2,now),{code:'invalid-time'});
  assert.throws(()=>weather.validateRange('202601010000','202601020001',now),{code:'range-too-long'});
  assert.throws(()=>weather.validateRange('202701010000','202701010001',now),{code:'future-time'});
});
test('WD1/WS1 wind averages wrap north correctly and never substitute ten-minute means or gusts for missing one-minute means',()=>{
  const result=weather.parseAws(table,{stn:112,...range});assert.deepEqual(result.wind,{wd:0,ws:2,n:2});
  assert.equal(result.observedStart,range.tm1);assert.equal(result.observedEnd,'202606011435');
  assert.equal(weather.parseAws(table,{stn:119,...range}),null);
  assert.equal(weather.parseAws('# header\n202606011436 112 -99 -99 200 10 20 3',{stn:112,...range}),null);
});
test('header-directed parsing keeps calm wind valid and excludes other stations and times',()=>{
  const reordered='# YYMMDDHHMI STN WDS WSS WD1 WS1\n202606011434 112 270 10 360 0\n202606011435 119 270 10 90 5\n202606021434 112 270 10 90 5';
  assert.deepEqual(weather.parseAws(reordered,{stn:112,...range}).wind,{wd:0,ws:0,n:1});
});
test('HTTP-200 authentication, throttling, HTML and empty responses are not labelled missing observations',()=>{
  for(const [text,code]of [['{"status":403,"message":"활용신청 필요"}','kma-auth'],['{"status":429}','kma-rate-limit'],['<html>Bad gateway</html>','upstream-format'],['#START\n#ERROR upstream failure','upstream-format'],['','upstream-empty']])assert.throws(()=>weather.parseAws(text,{stn:112,...range}),{code});
});
test('server uses only the fixed HTTPS KMA host and returns provenance without key or raw URL',async()=>{
  let requested;
  const result=await queryKma({stn:112,...range,authKey:'test-key-no-real-credentials'},{now,fetchImpl:async(url,options)=>{requested=url;assert.equal(options.redirect,'error');return {ok:true,status:200,text:async()=>table};}});
  assert.equal(requested.origin,'https://apihub.kma.go.kr');assert.equal(requested.pathname,'/api/typ01/cgi-bin/url/nph-aws2_min');
  assert.equal(requested.searchParams.get('stn'),'112');assert.equal(result.observation.wind.n,2);
  assert.equal(result.range.tm1,range.tm1);assert.ok(Number.isFinite(Date.parse(result.retrievedISO)));assert.ok(!JSON.stringify(result).includes('test-key'));
});
test('server distinguishes transport failures, upstream HTTP errors, authorization and real no-data',async()=>{
  const body={stn:112,...range,authKey:'test-key-no-real-credentials'};
  await assert.rejects(queryKma(body,{now,fetchImpl:async()=>{throw Error('secret upstream URL');}}),{code:'connection'});
  await assert.rejects(queryKma(body,{now,fetchImpl:async()=>({ok:false,status:503})}),{code:'upstream-http'});
  await assert.rejects(queryKma(body,{now,fetchImpl:async()=>({ok:false,status:403})}),{code:'kma-auth'});
  assert.equal((await queryKma(body,{now,fetchImpl:async()=>({ok:true,status:200,text:async()=>'#START7777\n#7777END'})})).observation,null);
});
test('route rejects arbitrary URL forwarding, methods and malformed bodies',async()=>{
  for(const [method,body,status]of [['GET',{},405],['POST',{url:'https://example.com'},400],['POST','{bad',400],['POST',{stn:0,...range},400]]){
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.output=JSON.parse(value);}};
    await handler({method,headers:{'content-type':'application/json'},body},res);assert.equal(res.statusCode,status);assert.equal(res.output.ok,false);assert.equal(res.headers['Cache-Control'],'no-store');
  }
});
test('client sends one same-origin POST and preserves typed errors without public proxy fallback',async()=>{
  let calls=0;await assert.rejects(weather.request({stn:112,...range,key:'test-key',fetchImpl:async(url,options)=>{calls++;assert.equal(url,'/api/kma');assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).authKey,'test-key');return {ok:false,json:async()=>({ok:false,error:{code:'kma-auth',message:'인증 확인',retryable:false}})};}}),{code:'kma-auth'});assert.equal(calls,1);
});
test('client cancellation propagates to the same-origin request',async()=>{
  const controller=new AbortController();
  const request=weather.request({stn:112,...range,key:'test-key',signal:controller.signal,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}))});
  controller.abort();await assert.rejects(request,{name:'AbortError'});
});

const uiSource=await fs.readFile(new URL('../src/research.js',import.meta.url),'utf8');
function workspace(request){
  const elements=new Map();const context=vm.createContext({AbortController,Date,console,MamoWeather:{...weather,request},KMA_KEY:'test-key',KMA_STN_EMBED:'embedded',state:{weather:null},S:{points:[{time:'2026-06-01 14:34:00',lat:37,lon:127},{time:'2026-06-01 14:36:00',lat:37,lon:127}],wd:270,ws:2,windMode:'manual',kma:{stn:119,edited:false}},byId(id){if(!elements.has(id))elements.set(id,{value:'',setAttribute(){},removeAttribute(){},addEventListener(){}});return elements.get(id);},parseStnText:()=>Array.from({length:8},(_,i)=>({stn:112+i,name:'station'+i})),nearestStations:stations=>stations,applyKmaWind(wind,meta){Object.assign(context.S,{wd:wind.wd,ws:wind.ws,kma:{...meta,edited:false}});},refreshUi(){}});
  const start=uiSource.indexOf('  let weatherRequestId='),end=uiSource.indexOf('  autoFetchWind=',start);vm.runInContext(uiSource.slice(start,end),context);return context;
}
test('automatic lookup reports shared connection failure after two requests and retains active wind provenance',async()=>{
  let calls=0;const context=workspace(async()=>{calls++;throw weather.fail('connection','연결 실패',true);});await context.queryWeather();
  assert.equal(calls,2);assert.equal(context.state.weather.code,'connection');assert.equal(context.S.ws,2);assert.equal(context.S.kma.stn,119);
});
test('automatic lookup moves past real missing data to the nearest available station',async()=>{
  const visited=[];const context=workspace(async({stn})=>{visited.push(stn);return {ok:true,observation:stn===114?{wind:{wd:90,ws:3,n:3},observedStart:range.tm1,observedEnd:range.tm2,windDefinition:'WD1/WS1'}:null,retrievedISO:'2026-10-21T00:00:00Z'};});await context.queryWeather();
  assert.deepEqual(visited,[112,113,114,115]);assert.equal(context.S.kma.stn,114);assert.equal(context.S.ws,3);assert.equal(context.state.weather.status,'success');
});
test('late response from a cancelled query cannot overwrite newly entered manual wind',async()=>{
  let release;const pending=new Promise(resolve=>release=resolve);const context=workspace(()=>pending);const running=context.queryWeather();context.cancelWeather();context.S.ws=5;
  release({ok:true,observation:{wind:{wd:90,ws:3,n:3}}});await running;assert.equal(context.S.ws,5);assert.equal(context.state.weather.status,'cancelled');
});
test('missing observations are not cached as failures and all eight stations are checked when transport works',async()=>{
  let calls=0;const context=workspace(async()=>{calls++;return {ok:true,observation:null};});await context.queryWeather();assert.equal(context.state.weather.code,'no-data');assert.equal(calls,8);await context.queryWeather();assert.equal(calls,16);
});
test('authentication failures stop station fallback; blank manual station does not trigger automatic lookup',async()=>{
  let calls=0;const context=workspace(async()=>{calls++;throw weather.fail('kma-auth','인증 확인');});await context.queryWeather();assert.equal(calls,2);assert.equal(context.state.weather.code,'kma-auth');await context.queryWeather('');assert.equal(calls,2);assert.equal(context.state.weather.code,'invalid-station');
});
