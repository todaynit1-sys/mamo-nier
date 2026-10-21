/* Replace legacy unbounded plume drawing and use one envelope for map/candidates. */
(() => {
  'use strict';
  const byId=id=>document.getElementById(id),tracking=MamoTracking;
  S.tmin=tracking.defaults.minutes;S.trackingMaxDistanceM=tracking.defaults.maxDistanceM;
  byId('tmin').value=String(S.tmin);byId('tminVal').textContent=String(S.tmin);
  byId('autoDistBox').querySelector('.hint').textContent='거리 = 풍속 × 추적시간. 기본 2분·최대 500m로 주변 사업장부터 확인합니다. 조사 범위를 넓히려면 최대 거리를 조정하세요.';
  byId('manDistBox').querySelector('label').textContent='추적 거리';
  byId('autoDistBox').before(Object.assign(document.createElement('div'),{className:'row',innerHTML:'<label for="trackingMaxDistance">최대 조사 거리</label><select id="trackingMaxDistance"><option value="300">300m</option><option value="500" selected>500m · 기본</option><option value="1000">1km</option><option value="1500">1.5km</option></select>'}));
  byId('dist').max=String(S.trackingMaxDistanceM);
  byId('trackingMaxDistance').onchange=()=>{S.trackingMaxDistanceM=Number(byId('trackingMaxDistance').value);byId('dist').max=String(S.trackingMaxDistanceM);S.dist=Math.min(S.dist,S.trackingMaxDistanceM);byId('dist').value=String(S.dist);byId('distVal').textContent=String(S.dist);renderAll();};
  byId('legendBody').innerHTML=byId('legendBody').innerHTML.replace('추정 확산 범위','풍상 조사 범위');
  byId('shape').options[0].textContent='풍상 범위 · 단계 표시';
  byId('shape').options[1].textContent='풍상 범위 · 부채꼴';
  const params=wind=>tracking.parameters({...wind,stability:S.stab,auto:S.autoDist,minutes:S.tmin,distanceM:S.dist,maxDistanceM:S.trackingMaxDistanceM});
  effDist=ws=>params({wd:0,ws})?.R||0;
  effSigma=ws=>params({wd:0,ws})?.sig||0;
  coneParams=p=>{const result=params(windOf(p));return result?{p,...result}:null;};
  computeCandidates=()=>currentCone?activeFacilities().flatMap(f=>{const hit=tracking.match(currentCone,f);return hit?[{f,...hit}]:[];}).sort((a,b)=>b.score-a.score):[];
  computeOverlap=()=>{
    const facilities=activeFacilities(),cones=[],items=new Map(),countMap=new Map(),high=threshold();let skipped=0;
    for(const p of S.points){if(chemVal(p)<high)continue;const cone=coneParams(p);if(!cone){skipped++;continue;}cones.push(cone);
      for(const f of facilities){const hit=tracking.match(cone,f);if(!hit)continue;const row=items.get(f)||{f,count:0,dmin:Infinity,score:0};row.count++;row.dmin=Math.min(row.dmin,hit.dist);row.score+=hit.score;items.set(f,row);countMap.set(f,row.count);}
    }
    return {arr:[...items.values()].sort((a,b)=>b.count-a.count||b.score-a.score),cones,countMap,nHigh:cones.length,skipped};
  };
  function draw(cone,overlap=false){
    const bands=overlap?[{fraction:1,opacity:.09}]:[{fraction:1,opacity:.10},{fraction:.66,opacity:.15},{fraction:.33,opacity:.20}];
    for(const band of bands)L.polygon(tracking.polygon(cone,{shape:S.shape,fraction:band.fraction}),{color:overlap?'#7c3aed':'#ea580c',weight:band.fraction===1?1.2:0,dashArray:band.fraction===1?'4 4':null,fillColor:overlap?'#a78bfa':'#f97316',fillOpacity:band.opacity,interactive:false}).addTo(coneLayer);
    if(!overlap)L.polyline([[cone.p.lat,cone.p.lon],tracking.point(cone.p,cone.wd,cone.R,0)],{color:'#7c3aed',weight:2,dashArray:'6 6',opacity:.8,interactive:false}).addTo(coneLayer);
  }
  renderOverlap=()=>{
    const data=computeOverlap();S.overlapData=data;const msg=byId('mapMsg');
    data.cones.forEach(cone=>draw(cone,true));
    byId('selInfo').textContent=`고농도 ${data.nHigh}개 지점의 풍상 범위 중첩${data.skipped?' · 약풍·바람 미기록 '+data.skipped+'개 제외':''}`;
    byId('autoDistVal').textContent=`최대 ${S.trackingMaxDistanceM}m`;
    byId('travelHint').textContent=`조사 거리 최대 ${S.trackingMaxDistanceM}m. 사업장 색과 숫자는 범위에 포함된 고농도 지점 수입니다.`;
    msg.textContent=data.nHigh?'':'방향 추적 가능한 고농도 지점이 없습니다. 바람과 기준을 확인하세요.';msg.style.display=data.nHigh?'none':'block';
    updateCandidates();renderFacilitiesOnlyMarkers();
  };
  renderCone=()=>{
    coneLayer.clearLayers();currentCone=null;S.overlapData=null;
    if(S.overlap){renderOverlap();return;}
    const p=S.points.find(point=>point.id===S.selectedId),msg=byId('mapMsg'),cone=p?coneParams(p):null;
    if(!cone){
      const wind=p?windOf(p):{},calm=Number.isFinite(wind.ws)&&wind.ws<tracking.defaults.calmBelowMs;
      byId('selInfo').textContent=p?`지점 #${p.id} · ${calm?'약풍으로 방향 추적 보류':'유효한 풍향·풍속 필요'}`:'측정 지점을 선택하세요.';
      byId('travelHint').textContent=calm?'풍속 0.5m/s 미만에서는 부채꼴과 사업장 후보를 표시하지 않습니다. 해당 지점의 바람을 확인하세요.':'';
      byId('autoDistVal').textContent='추적 보류';msg.textContent=byId('selInfo').textContent;msg.style.display='block';updateCandidates();return;
    }
    currentCone=cone;draw(cone);msg.style.display='none';
    byId('autoDistVal').textContent=`${cone.R}m · 반각 ${cone.half.toFixed(1)}°`;
    byId('selInfo').textContent=`지점 #${p.id} · ${S.selChem} ${fmt(chemVal(p))} ${curUnit()} / 바람 ${cone.wd}° · ${cone.ws}m/s / 조사 거리 ${cone.R}m`;
    const distance=S.autoDist?`${cone.ws}m/s × ${S.tmin}분 = ${Math.round(cone.requestedDistanceM)}m${cone.capped?' → 최대 '+S.trackingMaxDistanceM+'m 적용':''}`:`직접 지정 ${cone.R}m`;
    byId('travelHint').textContent=`${distance}. 전체 각도 ${(2*cone.half).toFixed(1)}° · 안정도 ${S.stab}. 표시 범위와 후보 판정에 같은 거리·각도를 적용합니다.`;
    updateCandidates();
  };
})();
