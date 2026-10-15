/* MIR values reproduced without alteration from the pinned mamo-oz source below. */
(() => {
  'use strict';
  const MIR = Object.freeze({
  "ethene+ethane": 5.4,
  "propane": 0.49,
  "propene": 11.66,
  "isobutane": 1.23,
  "butane": 1.15,
  "acetylene": 0.95,
  "butene": 9.73,
  "cyclopentane": 2.39,
  "isopentane": 1.45,
  "pentane": 1.31,
  "pentene": 7.21,
  "dimethylbutane+methylpentane": 1.5,
  "n-hexane": 1.24,
  "isoprene": 10.61,
  "1-hexene": 5.49,
  "methylcyclopentane": 2.19,
  "benzene": 0.72,
  "cyclohexane": 1.25,
  "methylhexane+dimethylpentane": 1.61,
  "heptane": 1.07,
  "methyl cyclohexane": 1.7,
  "toluene": 4,
  "methylheptane+trimethylpentane": 1.24,
  "n-octane": 0.9,
  "ethylbenzene+xylene": 7.8,
  "styrene": 1.73,
  "n-nonane": 0.78,
  "ethyltoluene+isopropylbenzene+propylbenzene+trimethylbenzene": 7.5,
  "diethylbenzene": 7.1,
  "n-decane": 0.68,
  "n-undecane": 0.55,
  "n-dodecane": 0.45,
  "1.3-butadiene": 12.61,
  "tetrachloroethylene": 0.029,
  "trichloroethylene": 0.64,
  "butanone": 1.48,
  "methanol": 0.67,
  "chloroform+dichloromethane": 0.041,
  "ethyl acetate": 0.63,
  "2-propanol": 0.61,
  "acetone": 0.36
});
  const KEY='OFP 상대지수', UNIT='ppb·MIR';
  const source=Object.freeze({repository:'todaynit1-sys/mamo-oz',commit:'7e8ce1c72bf43093257cde0cbb8c0776a8d64149',path:'assets/app.js',gitBlob:'4aa6f41fb6ba2749cced32ca284956d72bb46be3',url:'https://github.com/todaynit1-sys/mamo-oz/blob/7e8ce1c72bf43093257cde0cbb8c0776a8d64149/assets/app.js',method:'Σ concentration(ppb) × MIR; mamo-oz-compatible relative index',unit:UNIT,coefficientUnit:'g O3 / g VOC',coefficientCount:41,reference:'https://www.arb.ca.gov/regact/2009/mir2009/mir2009.htm'});
  const limitation='ppb×MIR 합은 비교용 상대지수입니다. 분자량을 반영한 질량 기반 OFP(µg O₃/m³)나 실제 오존 농도·배출 기여율이 아닙니다. 혼합 성분 계수는 원본 묶음 이름에만 적용합니다.';
  const normalize=name=>String(name).normalize('NFKC').trim().toLowerCase().replace(/\s*\(ppb\)\s*$/i,'').replace(/[‐‑–−]/g,'-').replace(/\s+/g,'').replace(/^1,3-butadiene$/,'1.3-butadiene');
  const keys=new Map(Object.keys(MIR).map(key=>[normalize(key),key]));
  function match(chemicals,units={}){
    const rows=chemicals.map(chemical=>{
      const key=keys.get(normalize(chemical));
      const unit=String(units[chemical]||'ppb').trim().toLowerCase();
      return {chemical,key:key||null,mir:key?MIR[key]:null,unit,status:!key?'계수 미등록':unit!=='ppb'?'ppb 단위 아님':'포함'};
    });
    const counts=new Map();for(const row of rows)if(row.status==='포함')counts.set(row.key,(counts.get(row.key)||0)+1);
    for(const row of rows)if(row.status==='포함'&&counts.get(row.key)>1)row.status='동일 성분 중복 열';
    return rows;
  }
  function analyze(points,chemicals,units,rawRows){
    const mapping=match(chemicals,units),included=mapping.filter(row=>row.status==='포함');
    const aligned=Array.isArray(rawRows)&&rawRows.length===points.length;
    const results=points.map((point,index)=>{
      const contributions=[],invalid=[];
      for(const row of included){
        const raw=aligned?rawRows[index][row.chemical]:undefined;
        const concentration=typeof raw==='number'?raw:typeof raw==='string'&&raw.trim()!==''?Number(raw):NaN;
        if(!Number.isFinite(concentration)||concentration<0){invalid.push({chemical:row.chemical,reason:!Number.isFinite(concentration)?'빈값·비수치 또는 원본 행 미확인':'음수 농도'});continue;}
        contributions.push({chemical:row.chemical,key:row.key,mir:row.mir,concentrationPpb:concentration,value:concentration*row.mir});
      }
      const total=contributions.reduce((sum,c)=>sum+c.value,0);
      return {value:included.length&&!invalid.length&&Number.isFinite(total)?total:null,contributions,invalid};
    });
    const validCount=results.filter(result=>result.value!==null).length;
    return {mapping,results,includedCount:included.length,validCount,excludedPointCount:points.length-validCount,totalPointCount:points.length,source:{...source},limitation};
  }
  function contributionSummary(results){
    const valid=results.filter(row=>row.value!==null),totals=new Map();
    for(const result of valid)for(const contribution of result.contributions){
      const current=totals.get(contribution.chemical)||{chemical:contribution.chemical,key:contribution.key,mir:contribution.mir,total:0};current.total+=contribution.value;totals.set(contribution.chemical,current);
    }
    const sum=valid.reduce((total,row)=>total+row.value,0);
    return Array.from(totals.values(),row=>({...row,mean:row.total/valid.length,sharePercent:sum>0?row.total/sum*100:null})).sort((a,b)=>b.mean-a.mean);
  }
  globalThis.MamoOfp={KEY,UNIT,MIR,source,limitation,normalize,match,analyze,contributionSummary};
})();
