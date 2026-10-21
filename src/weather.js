/* KMA AWS protocol helpers shared by the browser and the fixed-host server route. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MamoWeather=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  class WeatherError extends Error{constructor(code,message,retryable=false){super(message);this.name='WeatherError';this.code=code;this.retryable=retryable;}}
  const fail=(code,message,retryable=false)=>new WeatherError(code,message,retryable);
  function minuteValue(value){
    if(typeof value!=='string'||!/^\d{12}$/.test(value))return null;
    const parts=[value.slice(0,4),value.slice(4,6),value.slice(6,8),value.slice(8,10),value.slice(10,12)].map(Number);
    const date=new Date(Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4]));
    if(date.getUTCFullYear()!==parts[0]||date.getUTCMonth()+1!==parts[1]||date.getUTCDate()!==parts[2]||date.getUTCHours()!==parts[3]||date.getUTCMinutes()!==parts[4])return null;
    return date.getTime()-9*3600000;
  }
  function kstMinute(date){return new Date(date.getTime()+9*3600000).toISOString().slice(0,16).replace(/\D/g,'');}
  function measurementMinute(value){
    const text=String(value??'').trim();if(/^\d{12}$/.test(text))return minuteValue(text)!==null?text:null;
    if(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)){
      const local=text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
      if(!local||minuteValue(local.slice(1).join(''))===null)return null;
      const ms=Date.parse(text);return Number.isFinite(ms)?kstMinute(new Date(ms)):null;
    }
    const match=text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
    if(!match||Number(match[6]||0)>59)return null;const result=match.slice(1,6).map((part,i)=>i?part.padStart(2,'0'):part).join('');return minuteValue(result)!==null?result:null;
  }
  function validateRange(tm1,tm2,now=Date.now()){
    const start=minuteValue(tm1),end=minuteValue(tm2);
    if(start===null||end===null||end<start)throw fail('invalid-time','측정 날짜·시각을 확인하세요. 연월일과 시·분이 필요합니다.');
    if(end-start>24*3600000)throw fail('range-too-long','기상청 분자료는 한 지점당 하루 이내로 조회합니다. 측정 파일을 날짜별로 나누어 주세요.');
    if(end>now+5*60000)throw fail('future-time','미래 시각의 관측값은 조회할 수 없습니다. 측정 파일의 날짜를 확인하세요.');
    return {tm1,tm2};
  }
  function measurementRange(points,now=Date.now()){
    if(!points.length)throw fail('no-measurements','먼저 측정 파일을 여세요.');
    const times=points.map(point=>measurementMinute(point.time));
    if(times.some(time=>!time))throw fail('missing-time','측정 파일에 날짜가 없거나 읽을 수 없는 시각이 있습니다. 연월일·시각을 확인하거나 바람을 직접 입력하세요. 현재 날씨로 대체하지 않습니다.');
    times.sort();return validateRange(times[0],times.at(-1),now);
  }
  function parseAws(text,{stn,tm1,tm2}){
    if(typeof text!=='string'||!text.trim())throw fail('upstream-empty','기상청에서 빈 응답을 받았습니다.',true);
    let json;try{json=JSON.parse(text);}catch{}
    const upstreamCode=Number(json?.status??json?.statusCode??json?.code);
    if(upstreamCode===429||/호출\s*(횟수|제한)|요청\s*한도|too many requests/i.test(text))throw fail('kma-rate-limit','기상청 요청 한도에 도달했습니다. 잠시 후 다시 조회하세요.',true);
    if([401,403].includes(upstreamCode)||/활용\s*신청|인증\s*(실패|오류|키)|인증되지|unauthorized|forbidden/i.test(text))throw fail('kma-auth','기상청 인증키 또는 AWS 활용신청 상태를 확인해야 합니다.');
    if(json||/<html|<!doctype/i.test(text))throw fail('upstream-format','기상청 관측 표 대신 오류 응답을 받았습니다.',true);
    if(/#\s*(?:ERROR|FAIL)|서비스.*(?:중단|오류)/i.test(text))throw fail('upstream-format','기상청 관측 서비스에서 오류를 반환했습니다.',true);
    let wdIndex=2,wsIndex=3;const records=[];
    for(const raw of text.split(/\r?\n/)){
      const line=raw.trim();if(!line)continue;
      if(line.startsWith('#')){const columns=line.replace(/^#+\s*/,'').split(/[\s,]+/);if(columns.includes('WD1')&&columns.includes('WS1')){wdIndex=columns.indexOf('WD1');wsIndex=columns.indexOf('WS1');}continue;}
      const cells=line.split(/[\s,]+/);if(!/^\d{12}$/.test(cells[0]))continue;
      if(Number(cells[1])!==Number(stn)||cells[0]<tm1||cells[0]>tm2)continue;
      const wd=Number(cells[wdIndex]),ws=Number(cells[wsIndex]);
      // Missing 1-minute means must not be replaced by 10-minute means or gusts.
      if(!Number.isFinite(wd)||wd<0||wd>360||!Number.isFinite(ws)||ws<0||ws>=100)continue;
      records.push({time:cells[0],wd:wd===360?0:wd,ws});
    }
    if(!records.length){if(!/^\s*#/m.test(text)&&!/^\d{12}\s/m.test(text))throw fail('upstream-format','기상청 응답 형식을 확인할 수 없습니다.',true);return null;}
    let x=0,y=0,speed=0;for(const row of records){const radians=row.wd*Math.PI/180;x+=row.ws*Math.sin(radians);y+=row.ws*Math.cos(radians);speed+=row.ws;}
    const wind={wd:Math.round((Math.atan2(x,y)*180/Math.PI+360)%360)%360,ws:Number((speed/records.length).toFixed(1)),n:records.length};
    return {wind,observedStart:records[0].time,observedEnd:records.at(-1).time,windDefinition:'WD1/WS1 · 풍속 가중 벡터 풍향 / 산술 평균 풍속'};
  }
  async function request({stn,tm1,tm2,key,signal,fetchImpl=globalThis.fetch}){
    const controller=new AbortController(),abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      let response;try{response=await fetchImpl('/api/kma',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stn,tm1,tm2,authKey:key}),signal:controller.signal,cache:'no-store'});}catch(error){
        if(signal?.aborted)throw new DOMException('조회 취소','AbortError');
        if(controller.signal.aborted)throw fail('timeout','기상청 조회 서버의 응답이 지연됩니다. 다시 조회하세요.',true);
        throw fail('connection','기상청 조회 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 조회하세요.',true);
      }
      let result;try{result=await response.json();}catch{
        if(signal?.aborted)throw new DOMException('조회 취소','AbortError');
        if(controller.signal.aborted)throw fail('timeout','기상청 조회 서버의 응답이 지연됩니다. 다시 조회하세요.',true);
        throw fail('route-unavailable','기상청 조회 서버의 응답을 읽지 못했습니다. 잠시 후 다시 조회하세요.',true);
      }
      if(!response.ok||!result.ok)throw fail(result.error?.code||'upstream-http',result.error?.message||'기상청 조회에 실패했습니다.',Boolean(result.error?.retryable));
      return result;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  return {WeatherError,fail,minuteValue,measurementMinute,measurementRange,validateRange,parseAws,request};
});
