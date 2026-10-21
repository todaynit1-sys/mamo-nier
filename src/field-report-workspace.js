/* Field-report UI. Inspection text stays in this browser tab and in explicit exports. */
(() => {
  'use strict';
  function mount({candidateHost,exportHost,getData,getSource,renderMap,download}){
    const byId=id=>document.getElementById(id);
    candidateHost.querySelector('#candidateSummary').insertAdjacentHTML('afterend','<button id="btnFieldReport" class="btn primary fullButton" type="button">현장점검 보고서 · Word</button>');
    exportHost.insertAdjacentHTML('afterbegin','<section class="card"><h3>현장점검 보고서</h3><p class="hint">측정정보·지도·특이사항과 항목별 평균·표준편차·최댓값을 A4 보고서로 작성합니다.</p><button id="btnFieldReportExport" class="btn primary fullButton" type="button">현장점검 보고서 열기</button></section>');
    document.body.insertAdjacentHTML('beforeend',`<dialog id="fieldReportDialog" aria-labelledby="fieldReportTitle"><div class="dialogHeader"><h2 id="fieldReportTitle">현장점검 보고서</h2><button class="btn" type="button" id="btnCloseFieldReport">닫기</button></div><p class="hint">측정정보·지도·특이사항과 항목별 농도 통계표를 작성합니다. 기본 2쪽이며 항목이 많거나 기록이 길면 추가 쪽으로 이어집니다.</p><div class="fieldReportLayout"><form class="fieldReportForm" id="fieldReportForm"><label class="fieldLabel" for="fieldComplex">산업단지 명 / 측정 구역</label><input id="fieldComplex" type="text" maxlength="160"><label class="fieldLabel" for="fieldDate">측정일자</label><input id="fieldDate" type="text" maxlength="80" placeholder="파일에 날짜가 없다면 직접 기록"><label class="fieldLabel" for="fieldDepartment">측정자 소속</label><input id="fieldDepartment" type="text" maxlength="100" readonly aria-describedby="fieldInstitutionHint"><p class="hint" id="fieldInstitutionHint">소속은 접속 기관으로 고정됩니다. 수도권대기환경청은 지정 측정자를 사용하며 다른 기관은 직급·성명을 입력하세요.</p><fieldset><legend>측정자 1</legend><div class="fieldStaffRow"><label>직급<input id="fieldGrade1" type="text" maxlength="40"></label><label>성명<input id="fieldName1" type="text" maxlength="40"></label></div></fieldset><fieldset><legend>측정자 2</legend><div class="fieldStaffRow"><label>직급<input id="fieldGrade2" type="text" maxlength="40"></label><label>성명<input id="fieldName2" type="text" maxlength="40"></label></div></fieldset><label class="fieldLabel" for="fieldNotes">특이사항</label><textarea id="fieldNotes" rows="5" maxlength="1800" placeholder="점검에서 직접 확인한 내용과 조치 사항을 기록하세요."></textarea><label class="checkLabel"><input id="fieldBasemap" type="checkbox" checked> 배경지도 포함</label><p class="hint">빈 항목은 ‘미기록’으로 표시합니다. 성명·특이사항은 서버에 전송하지 않으며 탭을 닫으면 입력 내용이 사라집니다.</p><button class="btn fullButton" id="btnRefreshFieldReport" type="submit">미리보기 갱신</button></form><iframe id="fieldReportFrame" title="현장점검 보고서 미리보기" sandbox="allow-same-origin allow-modals"></iframe></div><div class="dialogFooter"><span id="fieldReportReady" role="status" aria-live="polite"></span><div class="fieldReportActions"><button class="btn" type="button" id="btnPrintFieldReport" disabled>인쇄 · PDF</button><button class="btn primary" type="button" id="btnSaveFieldDocx" disabled>Word(.docx) 저장</button></div></div></dialog>`);
    const dialog=byId('fieldReportDialog'),frame=byId('fieldReportFrame'),ready=byId('fieldReportReady');
    let revision=0,activeJob=0,cached=null,busy=false,frameReady=false,source=null,lastFocus=null,hasData=false,externalBusy=false,institution=null;
    function buttons(){
      for(const id of ['btnFieldReport','btnFieldReportExport'])byId(id).disabled=!hasData||busy||externalBusy;
      byId('btnRefreshFieldReport').disabled=busy;byId('btnSaveFieldDocx').disabled=!cached||busy||!frameReady;byId('btnPrintFieldReport').disabled=!cached||busy||!frameReady;
      byId('btnRefreshFieldReport').setAttribute('aria-busy',String(busy));
    }
    function dirty(){revision++;cached=null;frameReady=false;ready.textContent='입력이 바뀌었습니다. 미리보기를 갱신한 뒤 저장하세요.';buttons();}
    function fields(){return {complex:byId('fieldComplex').value,date:byId('fieldDate').value,department:institution?.department||'',staff:institution?.fixedStaff?institution.staff.map(row=>({...row})):[1,2].map(i=>({grade:byId('fieldGrade'+i).value,name:byId('fieldName'+i).value})),notes:byId('fieldNotes').value};}
    function setInstitution(profile){
      if(dialog.open)dialog.close();activeJob=++revision;busy=false;cached=null;frameReady=false;source=null;
      institution=profile?JSON.parse(JSON.stringify(profile)):null;
      byId('fieldDepartment').value=institution?.department||'';byId('fieldDepartment').readOnly=true;
      for(const i of [1,2])for(const field of ['grade','name']){const input=byId('field'+(field==='grade'?'Grade':'Name')+i);input.value=institution?.staff[i-1]?.[field]||'';input.readOnly=Boolean(institution?.fixedStaff);}
      byId('fieldNotes').value='';frame.srcdoc='<!doctype html><html lang="ko"><meta charset="utf-8"><p>보고서를 다시 열어 확인하세요.</p></html>';ready.textContent='';buttons();
    }
    async function refresh(){
      if(busy)return;const token=++revision;activeJob=token;busy=true;cached=null;frameReady=false;ready.textContent='현재 지도와 측정 통계를 준비하고 있습니다…';buttons();
      try{
        const context=getData();context.snapshot.meta.map.includeBasemap=byId('fieldBasemap').checked;
        const model=MamoFieldReport.buildModel({...context,fields:fields()});
        const map=await renderMap(context.snapshot);
        if(token!==revision||getSource()!==context.source)return;
        cached={model,png:map.png,size:map.size};
        frame.onload=()=>{if(token!==revision)return;frameReady=true;buttons();};
        frame.srcdoc=MamoFieldReport.preview(model,map.dataUrl);
        ready.textContent=`${model.meta.sample?'가상 예시 · ':''}${model.pointCount}개 지점 · ${model.stats.length}개 항목 준비 완료. Word는 이 미리보기 시점의 내용을 저장합니다.`;
      }catch(error){if(token===revision)ready.textContent='보고서를 만들지 못했습니다. '+error.message+' 배경지도 포함을 해제하고 다시 시도할 수 있습니다.';}
      finally{if(activeJob===token){busy=false;buttons();}}
    }
    function open(){
      if(!hasData||externalBusy||busy)return;
      lastFocus=document.activeElement;const context=getData();
      if(source!==context.source){source=context.source;byId('fieldComplex').value=context.site||MamoFieldReport.guessComplex(context.snapshot.meta.source?.filename);byId('fieldDate').value=MamoFieldReport.guessDate(context.points,MamoWeather.measurementMinute);byId('fieldNotes').value='';}
      dialog.showModal();refresh();
    }
    byId('btnFieldReport').onclick=open;byId('btnFieldReportExport').onclick=open;
    byId('btnCloseFieldReport').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{activeJob=++revision;busy=false;cached=null;frameReady=false;buttons();lastFocus?.focus();});
    byId('fieldReportForm').addEventListener('input',dirty);
    byId('fieldReportForm').onsubmit=event=>{event.preventDefault();refresh();};
    byId('btnSaveFieldDocx').onclick=async()=>{
      if(!cached||busy||!frameReady)return;const report=cached,token=++revision;activeJob=token;busy=true;buttons();
      try{
        const blob=await MamoArchive.zip(MamoFieldReport.files(report.model,report.png,report.size),new Date(report.model.meta.createdISO),{allowFolders:true,type:MamoFieldReport.mime});
        const name=report.model.complex.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,70);
        if(token!==revision)return;download(blob,`MAMO_${report.model.meta.sample?'SAMPLE_':''}현장점검_${name}.docx`);ready.textContent='미리보기와 같은 지도·입력 내용·통계를 Word 파일로 저장했습니다.';
      }catch(error){if(token===revision)ready.textContent='Word 파일을 저장하지 못했습니다. '+error.message;}
      finally{if(activeJob===token){busy=false;buttons();}}
    };
    byId('btnPrintFieldReport').onclick=()=>{if(!cached||!frameReady)return;frame.contentWindow.focus();frame.contentWindow.print();};
    frame.srcdoc='<!doctype html><html lang="ko"><meta charset="utf-8"><p>측정 파일을 준비한 뒤 보고서를 확인하세요.</p></html>';
    return {setInstitution,update(dataAvailable,appBusy){hasData=dataAvailable;externalBusy=appBusy;buttons();}};
  }
  globalThis.MamoFieldWorkspace={mount};
})();
