/* Public report profiles only. Access values exist exclusively in server configuration. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MamoInstitution=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const profiles={
  "master": {
    "name": "마스터 (전체 열람)",
    "department": "수도권대기환경청"
  },
  "science": {
    "name": "국립환경과학원",
    "department": "국립환경과학원"
  },
  "capital": {
    "name": "수도권대기환경청",
    "department": "수도권대기환경청"
  },
  "hangang": {
    "name": "한강유역환경청",
    "department": "한강유역환경청"
  },
  "wonju": {
    "name": "원주지방환경청",
    "department": "원주지방환경청"
  },
  "daegu": {
    "name": "대구지방환경청",
    "department": "대구지방환경청"
  },
  "nakdong": {
    "name": "낙동강유역환경청",
    "department": "낙동강유역환경청"
  },
  "yeongsan": {
    "name": "영산강유역환경청",
    "department": "영산강유역환경청"
  },
  "jeonbuk": {
    "name": "전북지방환경청",
    "department": "전북지방환경청"
  },
  "geumgang": {
    "name": "금강유역환경청",
    "department": "금강유역환경청"
  }
};
  function profile(id){
    if(!Object.hasOwn(profiles,id))return null;
    const office=profiles[id],fixedStaff=office.department==='수도권대기환경청';
    return {...office,fixedStaff,staff:fixedStaff?[{grade:'환경연구사',name:'신현준'},{grade:'전문연구원',name:'서현정'}]:[{grade:'',name:''},{grade:'',name:''}]};
  }
  return {profile};
});
