/* Interpret compact per-facility provenance without changing source coordinates. */
(() => {
  'use strict';
  function describe(row, dataset) {
    const evidence=row[6];
    if(!Array.isArray(evidence)||!dataset)return {};
    const [kind,provinceRow,moisRow,delta]=evidence;
    if(!['gg','mois'].includes(kind))return {};
    const src=kind==='gg'?'경기도청 환경오염물질배출업소현황':'행정안전부 대기배출시설 · 동일명·주소 좌표 보완';
    let acc=kind==='gg'?'원본 WGS84 · 정확도 미검증':'EPSG:5174→4326 변환 · 정확도 미검증';
    if(delta>100)acc+=` · 출처 간 ${Math.round(delta).toLocaleString('ko-KR')} m 차이, 현장 확인 필요`;
    return {src,acc,coordinateSource:kind,provinceRow,moisRow,sourceCoordinateDifferenceM:delta,datasetAppliedDate:dataset.appliedDate};
  }
  globalThis.MamoFacilities=Object.freeze({describe});
})();
