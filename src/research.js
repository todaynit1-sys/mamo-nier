/* Research workspace layer. The original parsers, data and screening math are retained. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = (value, digits = 2) => value===null||value===undefined||value===''?'미기록':Number.isFinite(Number(value)) ? Number(value).toLocaleString('ko-KR', {maximumFractionDigits: digits}) : '미기록';
  const displayTime = value => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' (KST)';
  const state = {sample:false, source:null, quality:null, panel:'analysis', busy:false, mapReady:false, statusTimer:null, lastFocus:null,facilitySource:{kind:'embedded',filename:null},pendingFacility:null,weather:null};
  const facilityRegistry=JSON.parse(byId('facilityProvenance')?.textContent||'null');
  function currentFacilityDataset(){
    if(state.facilitySource.kind!=='embedded'||S.mode!==facilityRegistry?.region)return null;
    const {excluded,...dataset}=facilityRegistry;return dataset;
  }
  function refreshFacilityNote(){
    const note=byId('facilityDatasetNote');if(!note)return;
    const dataset=currentFacilityDataset();note.hidden=!dataset;
    byId('regBlock').querySelector('.hint').textContent='선택 지역 사업장 데이터는 앱에 포함되어 있습니다. 배경지도·기상 조회에는 인터넷 연결이 필요합니다. 출처: '+(dataset?'경기도청 환경오염물질배출업소현황 · 행안부 누락 좌표 보완.':'환경부 대기오염물질 배출시설 설치사업장.');
    if(!dataset)return;
    const stats=dataset.statistics;
    note.textContent=`경기도 ${stats.displayedFacilities.toLocaleString('ko-KR')}개 · 도청 WGS84 ${stats.displayedProvinceCoordinates.toLocaleString('ko-KR')}개 / 행안부 좌표 보완 ${stats.displayedMoisCoordinates}개. 좌표 미확정 ${stats.excludedRows}행 제외 · 중복 ${stats.duplicateRowsRemoved}행 제거. 반영 ${dataset.appliedDate} / 원본 기준일 미기록. 출처 간 100m 초과 차이 ${stats.displayedDisagreementsOver100m}개는 현장 확인이 필요합니다.`;
  }
  const intro = document.createElement('section');
  intro.className = 'startIntro';
  intro.setAttribute('aria-labelledby','startTitle');
  intro.innerHTML = `<p class="eyebrow">MAMO / 이동측정 분석</p><h2 id="startTitle">측정 위치에서<br>배출원 후보까지.</h2><p class="startLead">측정값과 바람, 사업장 위치를 한 지도에서 살펴보세요. 분석 조건과 결과를 함께 저장해 조사와 연구에 활용할 수 있습니다.</p><ol class="startSteps"><li><span>01</span><div><strong>데이터 준비</strong><p>지역을 선택하고 측정 파일을 엽니다.</p></div></li><li><span>02</span><div><strong>풍상 범위 분석</strong><p>바람과 고농도 기준을 확인합니다.</p></div></li><li><span>03</span><div><strong>결과 기록</strong><p>지도·표·조건·보고서를 함께 저장합니다.</p></div></li></ol><p class="startBoundary">현장 조사 우선순위를 정하는 스크리닝 도구입니다.<br>분석 결과가 특정 사업장의 배출 기여를 입증하지는 않습니다.</p>`;
  byId('dropScreen').prepend(intro);
  byId('dropZone').querySelector('.big').textContent = '↑';
  byId('dzTitle').textContent='측정 파일을 선택하거나 끌어놓으세요';
  byId('dzDesc').innerHTML='CSV·TXT·TSV·XLSX·XLS / UTF-8·CP949<br>위도·경도, 성분(ppb) 또는 TVOC 열이 필요합니다.<br>바람은 파일 열 또는 분석 패널에서 설정합니다.';
  byId('regionCount').nextSibling.textContent='개 내장 · 배경지도와 기상 조회는 인터넷 연결 필요';
  byId('btnFacOnly').textContent = '사업장 지도만 열기';
  byId('btnFacOnly').nextElementSibling.textContent = '선택 지역의 내장 사업장을 확인합니다. 배경지도·기상 조회에는 인터넷 연결이 필요합니다.';
  byId('startBox').insertAdjacentHTML('beforeend', `<div class="startUtilities"><button class="btn" id="btnSample" type="button">예시 데이터로 둘러보기</button><button class="btn textButton" id="btnTemplate" type="button">CSV 양식 받기</button></div><div id="uploadStatus" class="uploadStatus" role="status" aria-live="polite"></div>`);
  const logo = document.querySelector('header .logo');
  logo.textContent = 'M'; logo.setAttribute('aria-hidden','true');
  document.querySelector('header h1 .hideM').textContent = 'MAMO · 대기오염 분석';
  document.querySelector('header h1 .showM').textContent = 'MAMO 분석';
  byId('modeSelTop').setAttribute('aria-label','사업장 지역');
  byId('regionSel').setAttribute('aria-label','분석 지역 선택');
  byId('regionSel2').setAttribute('aria-label','사업장 지역 선택');
  byId('btnCsv').innerHTML = '<span class="hideM">측정 파일 열기</span><span class="showM">파일 열기</span>';
  byId('btnBack').innerHTML = '<span class="hideM">새 분석</span><span class="showM">새 분석</span>';
  byId('btnLogout').textContent = '로그아웃';
  byId('btnLogout').insertAdjacentHTML('beforebegin','<button class="btn" id="btnHelp" type="button">사용 안내</button>');
  byId('btnHelp').innerHTML='<span class="hideM">사용 안내</span><span class="showM">안내</span>';
  document.querySelector('footer.disclaimer').textContent = '스크리닝 분석 · 후보 점수는 배출원일 확률이 아닙니다. 규제 판단에는 정식 확산모델 검증이 필요합니다. · 제작 신현준 / 수도권대기환경청';
  byId('mapWrap').insertAdjacentHTML('beforeend', `<div class="mapToolbar" aria-label="지도 보기"><button class="btn" id="btnFit" type="button">전체 범위</button><button class="btn" id="btnQuietMap" type="button" aria-pressed="false">배경 단순화</button><button class="btn" id="btnExpandMap" type="button" aria-pressed="false">지도 넓게</button></div><div class="northArrow" aria-label="북쪽">N<span aria-hidden="true">↑</span></div><div id="sampleBadge" class="sampleBadge" hidden>예시 · 가상 측정 데이터</div>`);
  const aside = document.querySelector('aside');
  aside.insertAdjacentHTML('afterbegin', `<div class="workspaceContext"><span class="eyebrow">ANALYSIS WORKSPACE</span><h2 id="workspaceTitle">분석 설정</h2><p id="workspaceSummary">측정 데이터를 준비하세요.</p></div><div class="workspaceTabs" role="tablist" aria-label="작업 패널"><button id="tabAnalysis" role="tab" aria-selected="true" aria-controls="panelAnalysis" data-panel="analysis">분석</button><button id="tabFacilities" role="tab" aria-selected="false" aria-controls="panelFacilities" tabindex="-1" data-panel="facilities">사업장</button><button id="tabExport" role="tab" aria-selected="false" aria-controls="panelExport" tabindex="-1" data-panel="export">결과 저장</button></div>`);
  const panelAnalysis = document.createElement('section');
  panelAnalysis.id='panelAnalysis'; panelAnalysis.className='workspacePanel'; panelAnalysis.setAttribute('role','tabpanel');panelAnalysis.setAttribute('aria-labelledby','tabAnalysis');
  const panelFacilities = document.createElement('section');
  panelFacilities.id='panelFacilities';panelFacilities.className='workspacePanel';panelFacilities.hidden=true;panelFacilities.setAttribute('role','tabpanel');panelFacilities.setAttribute('aria-labelledby','tabFacilities');
  const oldReport = byId('btnReport'); oldReport.remove();
  const analysisCards = Array.from(aside.querySelectorAll('.analysisCard'));
  analysisCards.forEach(card=>panelAnalysis.append(card));
  panelAnalysis.insertAdjacentHTML('afterbegin','<div class="card" id="analysisEmpty"><h3>측정 파일을 먼저 여세요</h3><p class="hint">상단 ‘파일 열기’에서 측정 데이터를 선택하면 성분·바람·후보 분석이 활성화됩니다. 사업장 지도는 파일 없이 확인할 수 있습니다.</p></div>');
  const facilityCard = aside.querySelector('.card.collapsible');
  facilityCard.classList.add('open'); panelFacilities.append(facilityCard);
  facilityCard.querySelector('#facFileStatus').insertAdjacentHTML('afterend','<p id="facilityDatasetNote" class="hint" hidden></p>');
  const tabs = aside.querySelector('.workspaceTabs'); tabs.after(panelAnalysis,panelFacilities);
  aside.id='workspaceAside';
  const headings = ['성분과 측정값','바람 조건','풍상 추적 설정','측정값 내 고농도 분류'];
  analysisCards.forEach((card,i)=>card.querySelector('h3').textContent=headings[i]);
  analysisCards[0].querySelector('h3').insertAdjacentHTML('afterend',`<section class="ofpControls" aria-labelledby="metricTitle"><label class="fieldLabel" id="metricTitle" for="analysisMetric">분석 모드</label><select id="analysisMetric"><option value="concentration">측정 농도</option><option value="ofp" disabled>OFP 상대지수 · MIR 가중</option></select><p class="hint" id="ofpAvailability" role="status">성분별 ppb 파일을 열면 MIR 적용 가능 항목을 확인합니다.</p><div id="ofpDetails" hidden><p class="hint">ppb×MIR 비교용 지수 · 실제 오존 농도 아님</p><details><summary>성분 매칭·MIR 계수·출처 확인</summary><p class="hint">Σ 성분 농도(ppb) × MIR. TVOC와 계수 미등록 성분은 합산하지 않습니다. 빈값·비수치·음수가 있는 지점은 OFP에서 제외합니다.</p><p class="hint">${esc(MamoOfp.limitation)}</p><div id="ofpMapping"></div><p class="hint"><a href="${MamoOfp.source.url}" target="_blank" rel="noopener">mamo-oz 원본 계수 41개</a> · commit ${MamoOfp.source.commit.slice(0,7)}<br><a href="${MamoOfp.source.reference}" target="_blank" rel="noopener">CARB MIR 참고 자료</a></p></details></div></section>`);
  // Move the original inputs: one identity and one event/state source per setting.
  const mapColumn=document.createElement('section');mapColumn.className='mapColumn';mapColumn.setAttribute('aria-label','지도와 빠른 분석 설정');
  byId('mapWrap').before(mapColumn);mapColumn.append(byId('mapWrap'));
  mapColumn.insertAdjacentHTML('afterbegin',`<section id="analysisQuickBar" class="analysisQuickBar" aria-label="빠른 분석 설정" hidden><div id="quickMetric" class="quickField"></div><div id="quickChem" class="quickField"></div><div id="quickActions" class="quickActions"><button id="btnQuickWind" class="btn" type="button" aria-controls="panelAnalysis" title="바람과 추적 조건으로 이동">바람·추적 설정</button></div><p id="quickOfpNote" class="hint" hidden>OFP = Σ ppb×MIR · 실제 오존 농도 아님</p></section>`);
  byId('quickMetric').append(byId('metricTitle'),byId('analysisMetric'));
  const chemRow=byId('selChem').closest('.row');byId('quickChem').append(...chemRow.children);chemRow.remove();
  const overlapRow=byId('overlapChk').closest('.row');const overlapLabel=overlapRow.querySelector('label');
  overlapLabel.className='quickOverlap';overlapLabel.removeAttribute('style');
  const overlapInput=byId('overlapChk');overlapLabel.replaceChildren(overlapInput,document.createTextNode('고농도 지점 중첩'));
  overlapInput.setAttribute('aria-describedby','quickTraceHelp');
  const overlapHelp=overlapRow.nextElementSibling;overlapHelp.id='quickTraceHelp';
  byId('quickActions').prepend(overlapLabel);overlapRow.remove();
  analysisCards[1].id='windSettingsCard';analysisCards[2].id='trackingSettingsCard';
  byId('btnQuickWind').onclick=()=>{showPanel('analysis');const input=byId('windModeRow').style.display==='none'?byId('ws'):byId('windMode');input.focus({preventScroll:true});input.scrollIntoView({block:'center'});};
  byId('analysisMetric').setAttribute('aria-describedby','ofpAvailability quickOfpNote');
  const mapResizeObserver=new ResizeObserver(()=>map?.invalidateSize({pan:false}));mapResizeObserver.observe(byId('mapWrap'));
  byId('chemChartBox').insertAdjacentHTML('beforebegin',`<section class="measurementReview" id="measurementReview" aria-labelledby="measurementReviewTitle" hidden><h4 id="measurementReviewTitle">측정 지점 검토</h4><div id="dataQualitySummary" class="dataQuality" role="status"></div><label class="fieldLabel" for="measurementPoint">지점 · 시각 · 선택 성분 농도</label><select id="measurementPoint"></select><p class="hint" id="measurementPosition" role="status"></p><div class="pointButtons"><button class="btn" id="btnPreviousPoint" type="button">이전 지점</button><button class="btn" id="btnNextPoint" type="button">다음 지점</button><button class="btn" id="btnMaximumPoint" type="button">최고 농도</button><button class="btn" id="btnLocatePoint" type="button">지도에서 보기</button></div><p class="hint">파일 순서대로 검토합니다. 선택은 단일 지점 추적에 적용되며 중첩 분석은 고농도 지점 전체를 유지합니다.</p></section>`);
  // Retain the original report control identity, move it into the results panel.
  const panelExport = document.createElement('section');
  panelExport.id='panelExport';panelExport.className='workspacePanel';panelExport.hidden=true;panelExport.setAttribute('role','tabpanel');panelExport.setAttribute('aria-labelledby','tabExport');
  panelExport.innerHTML = `<div class="card exportCard"><h3>그림과 보고서</h3><p class="hint">현재 지도 범위와 분석 조건을 함께 기록합니다. 바람·기준·필터를 확인한 뒤 저장하세요.</p><label class="fieldLabel" for="researchTitle">그림·보고서 제목</label><input id="researchTitle" type="text" value="이동측정 기반 배출원 후보 분석" maxlength="160"><label class="fieldLabel" for="researchSite">측정 구역 / 조사명 <span class="optional">선택</span></label><input id="researchSite" type="text" placeholder="예: 시화산업단지 이동측정" maxlength="160"><label class="fieldLabel" for="researchPeriod">측정 일시 <span class="optional">선택</span></label><input id="researchPeriod" type="text" placeholder="파일에 날짜가 없다면 직접 기록" maxlength="160"><label class="fieldLabel" for="researchInstrument">측정 장비 / 자료 출처 <span class="optional">선택</span></label><input id="researchInstrument" type="text" placeholder="장비명, 조사기관, 자료 버전" maxlength="200"><div class="row"><label for="figureScale">PNG 출력 배율</label><select id="figureScale"><option value="2">2배</option><option value="3" selected>3배</option></select></div><label class="checkLabel"><input id="figureBasemap" type="checkbox" checked> 그림에 배경지도 포함</label><p class="hint">SVG는 분석 도형·글자를 벡터로 저장합니다. 배경지도는 현재 화면의 래스터 타일입니다. PNG 배율은 출력 크기이며 지도 해상도를 새로 확보하지는 않습니다.</p><div class="exportButtons"><button class="btn primary" id="btnFigurePng" type="button">지도 PNG</button><button class="btn" id="btnFigureSvg" type="button">지도 SVG</button></div><div id="reportButtonSlot"></div></div><div class="card exportCard"><h3>분석 자료</h3><p class="hint" id="exportScope">단일 지점 또는 중첩 분석 결과 전체를 저장합니다.</p><div class="exportButtons"><button class="btn" id="btnCandidateCsv" type="button">후보 표 CSV</button><button class="btn" id="btnMeasurementsCsv" type="button">측정값 CSV</button><button class="btn" id="btnConditions" type="button">조건 JSON</button><button class="btn" id="btnMethods" type="button">사용 절차 HTML</button></div><p class="hint">후보 점수는 풍향 일치도와 거리의 가중 점수입니다. 배출원일 확률이나 배출 기여율을 뜻하지 않습니다.</p></div>`;
  panelFacilities.after(panelExport);byId('reportButtonSlot').append(oldReport);
  byId('btnMeasurementsCsv').insertAdjacentHTML('afterend','<button class="btn" id="btnOfpCsv" type="button">OFP 계산 내역 CSV</button>');
  panelExport.insertAdjacentHTML('afterbegin','<section class="card packageCard"><h3>연구 자료 한 번에 저장</h3><p class="hint">같은 분석 상태의 지도 PNG·SVG, 후보·측정 CSV, 조건 JSON, 보고서·사용 절차 HTML과 안내문을 ZIP 하나로 받습니다.</p><button class="btn primary fullButton" id="btnResearchPackage" type="button">연구 자료 ZIP 저장</button><p class="hint">보고서 HTML은 인터넷 없이 열 수 있습니다. PDF는 보고서를 열어 인쇄에서 저장하세요.</p></section>');
  oldReport.className='btn primary fullButton';oldReport.textContent='분석 보고서 미리보기 · PDF';oldReport.removeAttribute('style');
  byId('facSearch').placeholder='사업장명 또는 주소';byId('facSearch').insertAdjacentHTML('beforebegin','<label class="fieldLabel" for="facSearch">사업장명·주소 검색</label>');
  const searchRow = document.createElement('div');searchRow.className='searchRow';byId('facSearch').before(searchRow);searchRow.append(byId('facSearch'));searchRow.insertAdjacentHTML('beforeend','<button class="btn" id="btnFacSearch" type="button">검색</button>');
  byId('btnFacSearch').onclick=facSearchRun;
  const regHint=byId('regBlock').querySelector('.hint');regHint.textContent='선택 지역 사업장 데이터는 앱에 포함되어 있습니다. 배경지도·기상 조회에는 인터넷 연결이 필요합니다. 출처: 환경부 대기오염물질 배출시설 설치사업장.';
  const credit = Array.from(aside.children).find(n=>n.tagName==='DIV'&&n.getAttribute('style')?.includes('text-align:center'));if(credit)credit.classList.add('workspaceCredit');
  if(credit)for(const node of credit.childNodes)if(node.nodeType===Node.TEXT_NODE)node.textContent=node.textContent.replace(/v6\.1/g,'v6.8');
  document.body.insertAdjacentHTML('beforeend', `<div class="appStatus" id="appStatus" role="status" aria-live="polite"></div><dialog id="reportDialog" aria-labelledby="reportDialogTitle"><div class="dialogHeader"><div><p class="eyebrow">RESEARCH OUTPUT</p><h2 id="reportDialogTitle">분석 보고서</h2></div><button class="btn" id="btnCloseReport" type="button">닫기</button></div><p class="hint">인쇄 창에서 ‘PDF로 저장’을 선택하세요. A4 기준으로 지도·조건·후보 표를 나눠 출력합니다.</p><iframe id="reportFrame" title="분석 보고서 미리보기"></iframe><div class="dialogFooter"><span id="reportReady" role="status"></span><button class="btn primary" id="btnPrintReport" type="button" disabled>인쇄 · PDF로 저장</button></div></dialog><dialog id="helpDialog" aria-labelledby="helpTitle"><div class="dialogHeader"><h2 id="helpTitle">데이터 준비와 해석</h2><button class="btn" id="btnCloseHelp" type="button">닫기</button></div><ol class="helpSteps"><li><strong>지역과 파일</strong><p>사업장 지역을 선택한 뒤 CSV·TXT·XLSX·XLS 파일을 엽니다. Latitude·Longitude(또는 Longtitude)와 성분(ppb) 또는 TVOC 열이 필요합니다. 날짜·장비 정보가 없으면 결과 저장 패널에 직접 기록하세요.</p></li><li><strong>측정값과 바람</strong><p>성분·단위·유효 지점 수를 확인하세요. 바람은 직접 입력하거나 데이터 열 또는 기상청 관측을 사용합니다. 풍향은 바람이 불어오는 방향입니다.</p></li><li><strong>후보와 조건</strong><p>단일 지점 추적 또는 고농도 지점 중첩 분석을 선택합니다. 추적 거리·시간, 안정도, 업종·종별 필터가 결과에 영향을 줍니다.</p></li><li><strong>논문 자료 저장</strong><p>결과 저장 패널에서 지도, 후보 표, 측정값, 조건 JSON, PDF 보고서를 같은 분석 상태로 저장하세요. 자료 날짜가 확인되지 않으면 미기록으로 남깁니다.</p></li></ol><p class="notice">상위 백분위는 측정값 내부의 분류입니다. 간이 확산 범위와 후보 점수는 배출원 확정, 배출 기여율 또는 법정 기준 초과 판단에 사용할 수 없습니다. 예시 데이터는 기능 설명용 가상 자료입니다.</p></dialog>`);
  function status(text, persistent=false){clearTimeout(state.statusTimer);byId('appStatus').textContent=text;if(!persistent)state.statusTimer=setTimeout(()=>byId('appStatus').textContent='',6500);}
  function showPanel(name, focus=false){
    setMapExpanded(false);
    state.panel=name;
    for(const n of ['analysis','facilities','export']){
      const title=n[0].toUpperCase()+n.slice(1);const button=byId('tab'+title);byId('panel'+title).hidden=n!==name;button.setAttribute('aria-selected',String(n===name));button.tabIndex=n===name?0:-1;
    }
    byId('workspaceTitle').textContent={analysis:'분석 설정',facilities:'사업장 찾기',export:'결과 기록'}[name];
    aside.scrollTop=0;
    if(focus)byId('tab'+name[0].toUpperCase()+name.slice(1)).focus();
  }
  function setMapExpanded(expanded){
    if(expanded&&aside.contains(document.activeElement))byId('btnExpandMap').focus();
    document.body.classList.toggle('mapExpanded',expanded);
    const button=byId('btnExpandMap');button.setAttribute('aria-pressed',String(expanded));button.setAttribute('aria-expanded',String(!expanded));button.setAttribute('aria-controls','workspaceAside');button.textContent=expanded?'패널 보기':'지도 넓게';
    requestAnimationFrame(()=>map?.invalidateSize({pan:false}));
  }
  document.querySelectorAll('.workspaceTabs [role=tab]').forEach((button,i,buttons)=>{
    button.onclick=()=>showPanel(button.dataset.panel);
    button.onkeydown=e=>{let next=i;if(e.key==='ArrowRight')next=(i+1)%buttons.length;else if(e.key==='ArrowLeft')next=(i+buttons.length-1)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;e.preventDefault();showPanel(buttons[next].dataset.panel,true);};
  });
  document.querySelectorAll('.card.collapsible>h3').forEach((h,i)=>{
    h.setAttribute('role','button');h.tabIndex=0;const body=h.nextElementSibling;if(!body.id)body.id='disclosureBody'+i;h.setAttribute('aria-controls',body.id);
    h.addEventListener('click',()=>queueMicrotask(()=>h.setAttribute('aria-expanded',String(h.parentElement.classList.contains('open')))));
    h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();h.click();}};h.setAttribute('aria-expanded',String(h.parentElement.classList.contains('open')));
  });
  for(const id of ['dropZone','legendTitle']){byId(id).addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();byId(id).click();}});}
  byId('legendTitle').addEventListener('click',()=>queueMicrotask(()=>byId('legendTitle').setAttribute('aria-expanded',String(!byId('legend').classList.contains('min')))));
  const labels={ws:'풍속 (m/s)',wd:'풍향 (도)',windMode:'바람 출처',kmaStnInput:'기상청 AWS 지점번호',shape:'추적 표시 형태',tmin:'상류 추적 시간 (분)',dist:'추적 거리 (m)',stab:'대기안정도',thrPct:'고농도 기준 백분위',facKw:'업종 필터'};
  Object.entries(labels).forEach(([id,label])=>byId(id).setAttribute('aria-label',label));
  byId('btnKmaWind').textContent='기상청 바람 조회';byId('btnKmaStn').textContent='지점번호 조회';byId('btnAutoStab').textContent='풍속·측정시각으로 안정도 추정';
  byId('facShowChk').setAttribute('aria-label','지도에 사업장 표시');
  byId('kmaWindInfo').setAttribute('role','status');byId('facFileStatus').setAttribute('role','status');byId('facSearchRes').setAttribute('role','status');
  let weatherRequestId=0,weatherController=null;
  const weatherCache=new Map();
  function cancelWeather(){
    weatherRequestId++;weatherController?.abort();weatherController=null;
    for(const id of ['btnKmaWind','btnKmaStn']){byId(id).disabled=false;byId(id).removeAttribute('aria-busy');}
    if(state.weather?.status==='loading'){
      state.weather={...state.weather,status:'cancelled',completedISO:new Date().toISOString()};
      byId('kmaWindInfo').className='kmaInfo';byId('kmaWindInfo').textContent='설정이 바뀌어 조회를 취소했습니다. 현재 바람 입력값을 유지합니다.';
    }
  }
  function weatherBadge(message,kind=''){
    byId('kmaWindInfo').className='kmaInfo '+kind;byId('kmaWindInfo').textContent=message;
  }
  function windSourceLabel(){return S.windMode==='data'?'측정 파일':S.kma?(S.kma.edited?'조회 후 수정':'기상청 AWS #'+S.kma.stn):'직접 입력';}
  async function requestStation(station,range,signal){
    const cacheKey=station.stn+'|'+range.tm1+'|'+range.tm2;
    const cached=weatherCache.get(cacheKey);if(cached&&Date.now()-cached.time<300000)return {...cached.result,cached:true};
    const result=await MamoWeather.request({stn:station.stn,...range,key:KMA_KEY,signal});
    if(result.observation){if(weatherCache.size>=64)weatherCache.delete(weatherCache.keys().next().value);weatherCache.set(cacheKey,{time:Date.now(),result});}
    return result;
  }
  async function queryWeather(stationNumber=null){
    cancelWeather();const requestId=weatherRequestId,controller=new AbortController();weatherController=controller;
    state.weather={status:'loading',connection:'same-origin',startedISO:new Date().toISOString(),attemptedStations:[]};
    try{
      const points=state.ofp?.points||S.points,range=MamoWeather.measurementRange(points);
      const stations=parseStnText(KMA_STN_EMBED);
      let candidates;
      if(stationNumber!==null){
        if(!/^[1-9]\d{0,3}$/.test(String(stationNumber)))throw MamoWeather.fail('invalid-station','AWS 지점번호는 1–9999 사이의 정수로 입력하세요.');
        candidates=[stations.find(item=>item.stn===Number(stationNumber))||{stn:Number(stationNumber),name:'',dist:null}];
      }else{
        const latitude=points.map(point=>point.lat).sort((a,b)=>a-b),longitude=points.map(point=>point.lon).sort((a,b)=>a-b);
        candidates=nearestStations(stations,latitude[latitude.length>>1],longitude[longitude.length>>1],8);
      }
      if(!candidates.length)throw MamoWeather.fail('station-metadata','AWS 관측소 정보를 읽지 못했습니다. 지점번호를 직접 입력해 조회하세요.');
      state.weather.range=range;
      for(const id of ['btnKmaWind','btnKmaStn']){byId(id).disabled=true;byId(id).setAttribute('aria-busy','true');}
      const failures=[];
      for(let offset=0;offset<candidates.length;offset+=2){
        const batch=candidates.slice(offset,offset+2);state.weather.attemptedStations.push(...batch.map(item=>item.stn));
        weatherBadge(`${range.tm1}–${range.tm2} (KST) · ${batch.map(item=>item.name||'#'+item.stn).join(' · ')} 조회 중…`,'loading');
        const results=await Promise.allSettled(batch.map(item=>requestStation(item,range,controller.signal)));
        if(requestId!==weatherRequestId)return;
        for(let index=0;index<results.length;index++){
          const result=results[index];
          if(result.status==='rejected'){failures.push(result.reason);continue;}
          if(!result.value.observation)continue;
          const station=batch[index],response=result.value,observation=response.observation;
          // Commit only to the request that still owns the current file/settings.
          const meta={...station,...range};applyKmaWind(observation.wind,meta);
          S.kma={...S.kma,source:'기상청 API허브 AWS',retrievedISO:response.retrievedISO,observedStart:observation.observedStart,observedEnd:observation.observedEnd,windDefinition:observation.windDefinition,connection:'same-origin'};
          state.weather={...state.weather,status:'success',station:station.stn,cached:Boolean(response.cached),skippedConnectionErrors:failures.length,completedISO:new Date().toISOString()};
          weatherBadge(`기상청 AWS ${station.name||''} #${station.stn} · ${range.tm1}–${range.tm2} (KST) · 유효 ${observation.wind.n}분 · ${observation.wind.wd}° / ${observation.wind.ws} m/s${response.cached?' · 최근 조회 재사용':''}${failures.length?' · 일부 관측소 연결 실패 후 대체':''}`,'ok');
          refreshUi();return;
        }
        const terminal=failures.find(error=>['kma-auth','kma-rate-limit'].includes(error.code));if(terminal)throw terminal;
        // A shared transport outage is not fixed by querying six more stations.
        if(results.every(result=>result.status==='rejected'))throw failures.at(-1);
      }
      if(failures.length)throw MamoWeather.fail('partial-connection','일부 관측소 연결에 실패했고, 나머지 관측소에는 유효 관측값이 없습니다. 다시 조회하거나 지점번호를 지정하세요.',true);
      throw MamoWeather.fail('no-data',`조회한 ${candidates.length}개 관측소에 해당 측정 시간의 유효한 1분 바람이 없습니다. 날짜·지점번호를 확인하거나 바람을 직접 입력하세요.`);
    }catch(error){
      if(requestId!==weatherRequestId||error.name==='AbortError')return;
      state.weather={...state.weather,status:'error',code:error.code||'connection',message:error.message,completedISO:new Date().toISOString()};
      weatherBadge(`${error.message} 현재 바람은 ${windSourceLabel()} 값을 유지합니다.`,'fail');refreshUi();
    }finally{
      if(requestId===weatherRequestId){weatherController=null;for(const id of ['btnKmaWind','btnKmaStn']){byId(id).disabled=false;byId(id).removeAttribute('aria-busy');}}
    }
  }
  autoFetchWind=()=>queryWeather();
  fetchWindByStation=()=>queryWeather(byId('kmaStnInput').value.trim());
  for(const id of ['ws','wd','windMode'])byId(id).addEventListener(id==='windMode'?'change':'input',cancelWeather);
  byId('compassBtns').addEventListener('click',cancelWeather);
  function enhanceResults(){
    byId('candList').querySelectorAll('.candItem>span').forEach(el=>{if(/%$/.test(el.textContent))el.textContent=el.textContent.replace(/%$/,'점');});
    byId('candList').querySelectorAll('.candDetail .dr').forEach(row=>{const parts=row.querySelectorAll('span');if(parts.length>=2&&/적합도/.test(parts[0].textContent)){parts[0].textContent='후보 점수 (0–100)';parts[1].textContent=parts[1].textContent.replace(/%/g,'점');}});
    byId('candList').querySelectorAll('.candItem').forEach(el=>{if(el.hasAttribute('tabindex'))return;el.tabIndex=0;el.setAttribute('role','button');el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});el.addEventListener('click',()=>queueMicrotask(()=>byId('candList').querySelectorAll('.candItem').forEach(row=>row.setAttribute('aria-expanded',String(row.classList.contains('sel'))))));el.setAttribute('aria-expanded',String(el.classList.contains('sel')));});
    byId('facSearchRes').querySelectorAll('[onclick]').forEach(el=>{if(el.hasAttribute('tabindex'))return;el.tabIndex=0;el.setAttribute('role','button');el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};});
  }
  const resultObserver=new MutationObserver(enhanceResults);resultObserver.observe(byId('candList'),{childList:true,subtree:true});resultObserver.observe(byId('facSearchRes'),{childList:true,subtree:true});
  byId('candList').insertAdjacentHTML('afterend','<p class="candidateHelp">후보 점수는 풍향 일치도 × 거리 가중입니다. 배출원일 확률이 아닙니다. 고농도 기준은 측정값 내부 백분위입니다.</p>');
  const candidateCard=document.createElement('section');candidateCard.className='card candidateCard';candidateCard.innerHTML='<h3>배출원 후보</h3><p class="hint" id="candidateSummary" role="status"></p>';
  const candidateHelp=byId('candList').nextElementSibling;candidateCard.append(byId('candList'),candidateHelp);panelAnalysis.append(candidateCard);
  byId('facShowChk').parentElement.lastChild.textContent=' 사업장 표시·분석';
  const originalInit=initMap;
  initMap=function(){originalInit();L.control.scale({imperial:false,maxWidth:140}).addTo(map);byId('map').setAttribute('aria-label','측정 지점과 사업장 지도');map.on('moveend zoomend',refreshUi);state.mapReady=true;};
  function prepareOfp(text,parsed){
    const lines=text.split(/\r?\n/);let start=lines.findIndex(line=>/latitude/i.test(line));if(start<0)start=0;
    const raw=Papa.parse(lines.slice(start).join('\n'),{header:true,skipEmptyLines:true}),fields=raw.meta.fields||[];
    const lat=fields.find(field=>/^lat/i.test(field.trim()))||fields.find(field=>/위도/.test(field));
    const lon=fields.find(field=>/^lon/i.test(field.trim()))||fields.find(field=>/경도/.test(field));
    const validRows=raw.data.filter(row=>isKoreaCoord(parseFloat(row[lat]),parseFloat(row[lon])));
    const aligned=validRows.length===parsed.pts.length&&validRows.every((row,index)=>parseFloat(row[lat])===parsed.pts[index].lat&&parseFloat(row[lon])===parsed.pts[index].lon);
    const rows=aligned?validRows.map(row=>Object.fromEntries(fields.map(field=>[field.trim().replace(/\s*\(ppb\)/i,''),row[field]]))):[];
    const dataset=MamoOfp.analyze(parsed.pts,parsed.chems,parsed.units||{},rows);
    parsed.pts.forEach((point,index)=>point.ofp=dataset.results[index]);
    state.ofp={dataset,summary:MamoOfp.contributionSummary(dataset.results),points:parsed.pts,concentrationSelection:S.dataType==='pm'?(parsed.chems.includes('PM2.5')?'PM2.5':parsed.chems[0]):'TVOC'};
    S.analysisMetric='concentration';
    byId('ofpMapping').innerHTML=`<table><thead><tr><th>입력 성분</th><th>MIR / 처리</th></tr></thead><tbody>${dataset.mapping.map(row=>`<tr><td>${esc(row.chemical)}${row.key?`<br><small>${esc(row.key)}</small>`:''}</td><td>${row.status==='포함'?esc(row.mir):esc(row.status)}</td></tr>`).join('')||'<tr><td colspan="2">성분별 농도가 없습니다.</td></tr>'}</tbody></table>`;
  }
  function refreshOfp(){
    const active=S.analysisMetric==='ofp',context=state.ofp,dataset=context?.dataset,available=Boolean(dataset?.validCount&&dataset.includedCount&&S.dataType!=='pm');
    byId('analysisMetric').value=active?'ofp':'concentration';byId('analysisMetric').disabled=!context||!S.points.length;
    byId('analysisMetric').querySelector('option[value="ofp"]').disabled=!available;
    byId('selChem').disabled=active;byId('ofpDetails').hidden=!context;
    byId('btnOfpCsv').disabled=!dataset?.includedCount||state.busy;
    if(context){const message=`MIR 매칭 ${dataset.includedCount}/${dataset.mapping.length}성분${dataset.includedCount<dataset.mapping.length?' (일부 성분만 반영)':''} · OFP 유효 ${dataset.validCount}/${dataset.totalPointCount}지점${dataset.excludedPointCount?' · 빈값·비수치·음수 등 '+dataset.excludedPointCount+'지점 제외':''}${available?'':' · OFP 분석 불가: 매칭 성분·ppb 단위·유효 값을 확인하세요.'}`;if(byId('ofpAvailability').textContent!==message)byId('ofpAvailability').textContent=message;}
    if(active){
      byId('legendTitle').textContent='OFP 상대지수 수준';byId('chartTitle').textContent='OFP 상대지수 · 파일 순서';
      const summary=context.summary;
      byId('chemRank').innerHTML='<div class="cr"><b>성분별 OFP 평균 기여</b><span>ppb·MIR / 지수 내 비율</span></div>'+summary.slice(0,8).map(row=>`<div class="cr"><span>${esc(row.chemical)}</span><span><b>${number(row.mean)}</b> / ${row.sharePercent===null?'비율 없음':number(row.sharePercent,1)+'%'}</span></div>`).join('');
    }
  }
  byId('analysisMetric').onchange=()=>{
    const context=state.ofp;if(!context)return;
    const active=byId('analysisMetric').value==='ofp';
    if(active){if(!context.dataset.validCount||!context.dataset.includedCount||S.dataType==='pm'){refreshOfp();return;}context.concentrationSelection=S.selChem;S.analysisMetric='ofp';S.points=context.points.filter(point=>point.ofp.value!==null);S.selChem=MamoOfp.KEY;S.units[MamoOfp.KEY]=MamoOfp.UNIT;}
    else{S.analysisMetric='concentration';S.points=context.points;S.selChem=context.concentrationSelection;}
    byId('selChem').value=S.selChem;S.selectedId=S.points.reduce((best,point)=>chemVal(point)>chemVal(best)?point:best,S.points[0]).id;
    S.overlapData=null;renderAll();refreshUi();status(active?'OFP 상대지수로 지도·고농도 분류·후보 분석을 갱신했습니다.':'측정 농도 분석으로 돌아왔습니다.');
  };
  function pointReview(points,selectedId,valueOf){
    const index=points.findIndex(p=>p.id===selectedId);
    const maximumIndex=points.reduce((best,p,i)=>best<0||valueOf(p)>valueOf(points[best])?i:best,-1);
    return {index,maximumIndex,canPrevious:index>0,canNext:index>=0&&index<points.length-1};
  }
  let reviewPoints=null,reviewComponent=null,reviewQuality=null;
  function refreshPointReview(){
    const hasData=S.points.length>0;byId('measurementReview').hidden=!hasData;if(!hasData)return;
    const key=S.selChem+'|'+curUnit();
    if(reviewPoints!==S.points||reviewComponent!==key){
      byId('measurementPoint').innerHTML=S.points.map((p,i)=>`<option value="${i}">#${esc(p.id)} · ${esc(p.time||'시각 미기록')} · ${esc(number(chemVal(p)))} ${esc(curUnit())}</option>`).join('');
      reviewPoints=S.points;reviewComponent=key;
    }
    const review=pointReview(S.points,S.selectedId,chemVal);byId('measurementPoint').value=String(review.index);
    const position=review.index<0?'지점을 선택하세요.':`파일 순서 ${review.index+1} / ${S.points.length} · 지점 #${S.points[review.index].id}`;
    if(byId('measurementPosition').textContent!==position)byId('measurementPosition').textContent=position;
    byId('btnPreviousPoint').disabled=!review.canPrevious;byId('btnNextPoint').disabled=!review.canNext;
    byId('btnMaximumPoint').disabled=review.maximumIndex<0||review.maximumIndex===review.index;byId('btnLocatePoint').disabled=review.index<0;
    if(reviewQuality!==state.quality){
      const q=state.quality;const warning=Boolean(q&&(q.excluded||q.nonNumericConcentrationCells||q.parserWarningCount));
      byId('dataQualitySummary').dataset.warning=String(warning);
      byId('dataQualitySummary').textContent=q?`원본 ${q.rows}행 · 유효 좌표 ${q.validPoints}개 · 좌표 제외 ${q.excluded}행\n원본 농도 빈값·비수치 ${q.nonNumericConcentrationCells}개 · 파일 구조 경고 ${q.parserWarningCount}개${warning?'\n'+q.missingValuePolicy+' 제외 행과 빈값은 원본 자료에서 확인하세요.':''}`:'입력 자료 처리 기록이 없습니다. 원본 자료를 확인하세요.';
      reviewQuality=state.quality;
    }
  }
  function chooseMeasurement(index,locate=false){
    const point=S.points[index];if(!point)return;selectPoint(point.id);refreshPointReview();
    if(locate&&map)map.panTo([point.lat,point.lon],{animate:false});
  }
  byId('measurementPoint').onchange=()=>chooseMeasurement(Number(byId('measurementPoint').value));
  byId('btnPreviousPoint').onclick=()=>chooseMeasurement(pointReview(S.points,S.selectedId,chemVal).index-1);
  byId('btnNextPoint').onclick=()=>chooseMeasurement(pointReview(S.points,S.selectedId,chemVal).index+1);
  byId('btnMaximumPoint').onclick=()=>chooseMeasurement(pointReview(S.points,S.selectedId,chemVal).maximumIndex);
  byId('btnLocatePoint').onclick=()=>chooseMeasurement(pointReview(S.points,S.selectedId,chemVal).index,true);
  function refreshUi(){
    if(state.pendingFacility&&S.fileFacilities!==state.pendingFacility.before){state.facilitySource=state.pendingFacility.record;state.pendingFacility=null;}
    if(state.pendingFacility&&byId('facFileStatus').textContent.startsWith('오류:'))state.pendingFacility=null;
    refreshFacilityNote();
    const hasData=S.points.length>0;
    refreshOfp();
    refreshPointReview();
    if(hasData){const values=S.points.map(chemVal);byId('stAvg').textContent=number(values.reduce((a,b)=>a+b,0)/values.length)+' '+curUnit();byId('stMax').textContent=number(values.reduce((a,b)=>Math.max(a,b),-Infinity))+' '+curUnit();}
    byId('legendTitle').textContent=byId('legendTitle').textContent.replace(/\s*[▾▸]\s*$/,'');byId('legendTitle').setAttribute('aria-expanded',String(!byId('legend').classList.contains('min')));
    candidateCard.hidden=!hasData;
    byId('candidateSummary').textContent=`화면 후보 ${byId("candList").querySelectorAll(".candItem").length}개 · 전체 후보는 CSV·보고서에 저장됩니다.`;
    byId('facToggleBtn').textContent=S.facShow?'사업장 분석 켜짐':'사업장 분석 꺼짐';byId('facToggleBtn').setAttribute('aria-pressed',String(S.facShow));
    byId('analysisEmpty').hidden=hasData;
    byId('analysisQuickBar').hidden=!hasData;
    byId('quickOfpNote').hidden=S.analysisMetric!=='ofp';
    byId('btnQuickWind').textContent=S.windMode==='data'?'바람: 측정 파일 · 설정':(S.kma&&!S.kma.edited?'AWS #'+S.kma.stn+': ':'직접: ')+number(byId('wd').value,0)+'° / '+number(byId('ws').value,1)+' m/s · 설정';
    byId('sampleBadge').hidden=!state.sample;
    byId('workspaceSummary').textContent=hasData?`${state.sample?'가상 예시 · ':''}${S.fileName} · ${S.points.length.toLocaleString('ko-KR')}개 유효 지점${state.quality?.excluded?' · 좌표 제외 '+state.quality.excluded+'행':''}`:`${regionName(S.mode)} · 사업장 확인 모드`;
    byId('modeTag').textContent=`v6.8 · ${regionName(S.mode)}`;
    const ready=Boolean(map&&!byId('appScreen').classList.contains('hidden'));
    for(const id of ['btnFigurePng','btnFigureSvg','btnConditions','btnMethods'])byId(id).disabled=!ready||state.busy;
    for(const id of ['btnReport','btnMeasurementsCsv','btnCandidateCsv','btnResearchPackage'])byId(id).disabled=!hasData||state.busy;
    byId('exportScope').textContent=!hasData?'측정 파일을 열면 후보 표·측정값·PDF 보고서가 활성화됩니다. 사업장 지도와 조건은 지금 저장할 수 있습니다.':S.overlap?'중첩 고농도 지점 수와 최근접 거리를 저장합니다. 방향 열은 출력하지 않습니다.':'선택 측정 지점의 풍상 범위에 들어오는 후보 전체를 저장합니다. 후보 점수는 0–100 가중 점수입니다.';
    enhanceResults();
  }
  for(const name of ['renderAll','renderCone','renderFacilities']){
    const fn={renderAll,renderCone,renderFacilities}[name];
    const wrapped=function(...args){const result=fn(...args);refreshUi();return result;};
    if(name==='renderAll')renderAll=wrapped;else if(name==='renderCone')renderCone=wrapped;else renderFacilities=wrapped;
  }
  const originalFacilityMode=enterFacilityMode;
  const originalRegionLoad=loadRegion;loadRegion=function(...args){
    state.facilitySource={kind:'embedded',filename:null};state.pendingFacility=null;
    const result=originalRegionLoad(...args);const dataset=currentFacilityDataset();
    if(dataset&&args[0]===dataset.region){
      FAC_DATA[args[0]].forEach((row,i)=>Object.assign(S.fileFacilities[i],MamoFacilities.describe(row,dataset)));
      renderFacilities();
    }
    return result;
  };
  const originalFacilityLoad=loadFacilityFile;loadFacilityFile=function(file){
    const record={kind:'uploaded',filename:file.name,sizeBytes:file.size,sha256:null};state.pendingFacility={before:S.fileFacilities,record};
    if(crypto.subtle)file.arrayBuffer().then(bytes=>crypto.subtle.digest('SHA-256',bytes)).then(hash=>record.sha256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')).catch(()=>{});
    return originalFacilityLoad(file);
  };
  enterFacilityMode=function(){cancelWeather();state.weather=null;S.kma=null;state.sample=false;state.source=null;state.quality=null;state.ofp=null;S.analysisMetric='concentration';originalFacilityMode();showPanel('facilities');refreshUi();};
  const originalBack=byId('btnBack').onclick;byId('btnBack').onclick=e=>{cancelWeather();setMapExpanded(false);originalBack(e);refreshUi();};
  function modal(id){state.lastFocus=document.activeElement;byId(id).showModal();}
  for(const [button,id] of [['btnCloseReport','reportDialog'],['btnCloseHelp','helpDialog']])byId(button).onclick=()=>byId(id).close();
  for(const id of ['reportDialog','helpDialog'])byId(id).addEventListener('close',()=>state.lastFocus?.focus());
  byId('btnHelp').onclick=()=>modal('helpDialog');
  byId('btnFit').onclick=()=>{if(!map)return;const pts=S.points.length?S.points:activeFacilities();if(pts.length)map.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lon])),{padding:[48,48],maxZoom:16,animate:false});};
  byId('btnQuietMap').onclick=()=>{const pressed=document.body.classList.toggle('quietMap');byId('btnQuietMap').setAttribute('aria-pressed',String(pressed));};
  byId('btnExpandMap').onclick=()=>setMapExpanded(!document.body.classList.contains('mapExpanded'));
  setMapExpanded(false);
  function save(blob,name){const link=document.createElement('a');const url=URL.createObjectURL(blob);link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function csv(rows){return '\uFEFF'+rows.map(row=>row.map(v=>{let text=String(v??'');if(typeof v==='string'&&/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');}
  const dateStem=()=>new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const stem=()=>`MAMO_${state.sample?'SAMPLE_':''}${dateStem()}`;
  const template='No.,Time,Latitude,Longitude,Benzene(ppb),Toluene(ppb),TVOC(ppb),Wind Direction(degree),Wind Speed\n';
  byId('btnTemplate').onclick=()=>{save(new Blob(['\uFEFF'+template],{type:'text/csv;charset=utf-8'}),'MAMO_measurement_template.csv');status('CSV 양식을 저장했습니다. 성분명 뒤 (ppb)를 유지하세요.');};
  function concentrationFields(fields,type){
    if(type!=='pm')return fields.filter(f=>/\(ppb\)|tvoc|total/i.test(f));
    const patterns=[/pm\s*2\.?5/i,/pm\s*10/i,/pm\s*1\.?0/i,/no2/i,/voc/i,/hcl/i],seen=new Set(),result=[];
    for(const field of fields){const index=patterns.findIndex(pattern=>pattern.test(field.trim()));if(index>=0&&!seen.has(index)){seen.add(index);result.push(field);}}
    return result;
  }
  function qualityOf(text,pts,type){
    const lines=text.split(/\r?\n/);let start=lines.findIndex(l=>/latitude/i.test(l));if(start<0)start=0;
    const parsed=Papa.parse(lines.slice(start).join('\n'),{header:true,skipEmptyLines:true});const fields=parsed.meta.fields||[];const chemicals=concentrationFields(fields,type);
    const missing=parsed.data.reduce((sum,row)=>sum+chemicals.filter(f=>!Number.isFinite(parseFloat(row[f]))).length,0);
    return {rows:parsed.data.length,validPoints:pts.length,excluded:Math.max(0,parsed.data.length-pts.length),nonNumericConcentrationCells:missing,parserWarningCount:parsed.errors.length,missingValuePolicy:type==='pm'?'PM 자료: 개별 성분 빈값·비수치는 0으로 처리. 원본 자료 확인 필요.':'VOC 자료: 개별 성분 빈값·비수치는 0으로 처리; TVOC 빈값·비수치는 성분 합 사용. 원본 자료 확인 필요.',coordinatePolicy:'기존 한국 영역 좌표 검증을 통과한 행만 분석'};
  }
  let loadSequence=0;
  loadMeasurement=async function(file, options={}){
    cancelWeather();
    const sequence=++loadSequence;const upload=byId('uploadStatus');upload.dataset.kind='loading';upload.textContent=`${file.name} 읽는 중…`;byId('btnCsv').disabled=true;byId('dropZone').setAttribute('aria-busy','true');
    try{
      if(!/\.(csv|txt|tsv|xlsx|xls)$/i.test(file.name))throw new Error('CSV·TXT·TSV·XLSX·XLS 파일을 선택하세요.');
      const text=await fileToCsvText(file);const parsed=S.dataType==='pm'?parseMeasurementPM(text):parseMeasurement(text);
      if(sequence!==loadSequence)return;
      const bytes=await file.arrayBuffer();const digest=window.crypto?.subtle?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join(''):null;
      if(sequence!==loadSequence)return;
      const {pts,chems,units={}}=parsed;state.sample=Boolean(options.sample);state.source={filename:file.name,sizeBytes:file.size,sha256:digest,lastModifiedISO:new Date(file.lastModified).toISOString(),sample:state.sample};state.quality=qualityOf(text,pts,S.dataType);
      state.weather=null;S.kma=null;
      prepareOfp(text,parsed);
      S.points=pts;S.chems=chems;S.units=units;S.fileName=file.name;S.hasDataWind=pts.some(p=>p.wd!==null&&p.ws>0);S.selChem=S.dataType==='pm'?(chems.includes('PM2.5')?'PM2.5':chems[0]):'TVOC';
      byId('selChem').innerHTML=(S.dataType==='pm'?'':'<option value="TVOC">TVOC (합산)</option>')+chems.map(c=>`<option value="${esc(c)}">${esc(c)} (${esc(units[c]||'ppb')})</option>`).join('');byId('selChem').value=S.selChem;
      byId('selChem').insertAdjacentHTML('beforeend',`<option value="${MamoOfp.KEY}" hidden>${MamoOfp.KEY} (${MamoOfp.UNIT})</option>`);
      byId('windModeRow').style.display=S.hasDataWind?'flex':'none';if(!S.hasDataWind){S.windMode='manual';byId('windMode').value='manual';}
      byId('windHint').innerHTML=S.hasDataWind?'바람 열이 있습니다. <b>데이터 컬럼 사용</b>을 선택하면 각 지점의 바람을 적용합니다.':'풍향은 바람이 불어오는 방향입니다. 예: 270°(서풍) → 서쪽 사업장 후보를 살펴봅니다.';
      if(state.sample){S.kma=null;S.windMode='data';byId('windMode').value='data';byId('manualWindBox').style.display='none';byId('kmaWindInfo').textContent='예시 바람 · 가상 값 / 실제 관측 아님';}
      byId('manualWindBox').style.display=S.windMode==='manual'?'block':'none';
      S.selectedId=pts.reduce((best,p)=>chemVal(p)>chemVal(best)?p:best,pts[0]).id;
      byId('fileInfo').textContent=`${file.name} — ${pts.length}개 지점`;byId('dropScreen').classList.add('hidden');byId('appScreen').classList.remove('hidden','facOnly');
      if(!map)initMap();S.facShow=true;syncFacToggle();
      const thresholdCard=analysisCards[3];thresholdCard.classList.add('open');thresholdCard.querySelector('h3').setAttribute('aria-expanded','true');
      showPanel('analysis');
      requestAnimationFrame(()=>{map.invalidateSize();map.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lon])),{padding:[60,60],maxZoom:16,animate:false});renderAll();if(!state.sample)autoFetchWind();});
      upload.dataset.kind='success';upload.textContent=`${pts.length}개 지점 준비 완료`;status(`${state.sample?'가상 예시':'측정 파일'} ${pts.length}개 지점을 불러왔습니다.${state.quality.excluded?' 좌표가 유효하지 않은 '+state.quality.excluded+'행은 제외했습니다.':''}`);
      if(state.quality.nonNumericConcentrationCells){status(`농도 빈값·비수치 ${state.quality.nonNumericConcentrationCells}개에 기존 파서의 0 처리·성분 합 정책이 적용됐습니다. 원본 자료를 확인하세요.`,true);}
      refreshUi();
    }catch(error){upload.dataset.kind='error';upload.textContent=`파일을 열지 못했습니다. ${error.message} 위도·경도와 성분(ppb) 또는 TVOC 열, 구분자를 확인하고 다시 선택하세요.`;status(upload.textContent,true);byId('btnCsv').disabled=false;(byId('appScreen').classList.contains('hidden')?byId('dropZone'):byId('btnCsv')).focus();}
    finally{byId('btnCsv').disabled=false;byId('dropZone').removeAttribute('aria-busy');}
  };
  byId('btnSample').onclick=()=>{
    setMode('경기');const anchor=S.fileFacilities.reduce((best,f)=>(f.lat-37.325)**2+(f.lon-126.76)**2<(best.lat-37.325)**2+(best.lon-126.76)**2?f:best,S.fileFacilities[0]||{lat:37.325,lon:126.76});const rows=[];for(let i=0;i<32;i++){const val=4+(i%7)*2+(i>12&&i<22?40:0);rows.push([i+1,`10:${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`,anchor.lat+Math.sin(i/6)*.0002,anchor.lon+.0006+i*.00005,val,val*1.8,val*2.8,270,2]);}
    const data=template+rows.map(r=>r.join(',')).join('\n');loadMeasurement(new File([data],'가상_예시_이동측정.csv',{type:'text/csv'}),{sample:true});
  };

  // Export functions capture one immutable analysis state before any image work.
  function capture(){
    const colorValues=S.points.map(chemVal);
    const cuts=[80,90,95].map(p=>percentile(colorValues,p));
    const color=value=>value>=cuts[2]?'#f87171':value>=cuts[1]?'#fb923c':value>=cuts[0]?'#facc15':'#4ade80';
    const points=S.points.map((p,i)=>({...p,chem:{...p.chem},value:colorValues[i],color:color(colorValues[i]),appliedWind:{...windOf(p)}}));
    const overlap=Boolean(S.overlap);const raw=overlap?(S.overlapData?.arr||[]):computeCandidates();
    const candidates=raw.map((c,index)=>({rank:index+1,facility:{...c.f},distanceM:overlap?c.dmin:c.dist,score:overlap?null:c.score*100,bearingDeg:overlap?null:c.bearing,overlapCount:overlap?c.count:null}));
    const selected=points.find(p=>p.id===S.selectedId)||null;const winds=selected?.appliedWind||{wd:S.wd,ws:S.ws};
    const vals=points.map(p=>p.value);const high=points.length?threshold():null;
    const meta={schema:'mamo-analysis/1.0',appVersion:'6.8',build:window.MAMO_BUILD?{...window.MAMO_BUILD}:null,createdISO:new Date().toISOString(),title:byId('researchTitle').value.trim()||'이동측정 기반 배출원 후보 분석',site:byId('researchSite').value.trim()||null,measurementPeriod:byId('researchPeriod').value.trim()||null,instrumentAndSource:byId('researchInstrument').value.trim()||null,region:regionName(S.mode),sample:state.sample,sampleDefinition:'앱 내장 가상 예시 사용 여부; 사용자 파일의 실제 관측 여부를 검증한 값이 아님',source:state.source?{...state.source}:null,quality:state.quality?{...state.quality}:null,measurement:{type:S.dataType,component:S.selChem,unit:points.length?curUnit():null,count:points.length,mean:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,max:vals.length?vals.reduce((max,value)=>Math.max(max,value),-Infinity):null,selectedId:S.selectedId,percentile:S.thrPct,threshold:high,highCount:points.filter(p=>p.value>=high).length,timeStart:points[0]?.time||null,timeEnd:points.at(-1)?.time||null},analysis:{mode:overlap?'overlap':'single-point',shape:S.shape,stability:S.stab,windMode:S.windMode,selectedWind:winds,weatherObservation:byId('kmaWindInfo').innerText.trim()||null,weatherManuallyEdited:Boolean(S.kma?.edited),autoDistance:S.autoDist,trackingMinutes:S.tmin,manualDistanceM:S.dist,effectiveSelectedDistanceM:points.length&&winds.ws>0?effDist(winds.ws):null,effectiveSelectedSigmaDeg:points.length&&winds.ws>0?effSigma(winds.ws):null,facilitiesVisible:S.facShow,industryFilter:S.facKw||null,facilityCategories:S.facCats?Array.from(S.facCats):null,candidateCount:candidates.length,candidateScoreDefinition:'0–100 = 풍향 일치도 × 거리 가중 × 100; 배출원 확률이나 배출 기여율이 아님',overlapDefinition:'고농도 측정 지점의 풍상 범위에 포함된 지점 수; 방향·단일 점수와 구분'},map:{crs:'EPSG:3857',inputCoordinates:'WGS84 (EPSG:4326)',center:map?{lat:map.getCenter().lat,lon:map.getCenter().lng}:null,zoom:map?.getZoom()??null,bounds:map?{south:map.getBounds().getSouth(),west:map.getBounds().getWest(),north:map.getBounds().getNorth(),east:map.getBounds().getEast()}:null,displayedFacilityMarkers:facLayer?.getLayers().length??0,displayMarkerLimit:600,quietBackground:document.body.classList.contains('quietMap'),includeBasemap:byId('figureBasemap').checked,pngScale:Number(byId('figureScale').value),background:'OpenStreetMap standard raster tiles; current viewport only'},facilitySource:{...state.facilitySource,loadRecord:byId('facFileStatus').innerText.trim()},sources:{facilities:state.facilitySource.kind==='uploaded'?'사용자 업로드 사업장 파일: '+state.facilitySource.filename:'환경부 대기오염물질 배출시설 설치사업장 / 앱 내장 지역 데이터',facilityDataDate:'미기록',facilityCoordinateNote:'원본에 따라 정확 또는 근사 좌표; 사업장별 acc 필드 확인',wind:'기상청 API허브 AWS 또는 사용자 입력 / 측정 파일',basemap:'© OpenStreetMap contributors; https://www.openstreetmap.org/copyright'},limitations:['측정값 내 백분위 분류이며 법정 기준 초과 판단이 아님','풍향·안정도·거리 보정을 적용한 간이 스크리닝이며 배출원 확정이나 정량 기여율을 입증하지 않음','정온·기상 시공간 차이·근사 사업장 좌표 및 자료 시점의 불확실성을 고려해야 함','규제·법적 판단에는 CALPUFF·HYSPLIT 등 정식 확산모델 검증 필요']};
    meta.analysis.metric=S.analysisMetric==='ofp'?'ofp-relative-index':'concentration';
    meta.analysis.windSourceLabel=windSourceLabel();
    meta.analysis.weatherQuery=state.weather?JSON.parse(JSON.stringify(state.weather)):null;
    meta.analysis.weatherStation=S.kma?{...S.kma}:null;
    const dataset=currentFacilityDataset();
    if(dataset){
      meta.facilitySource.dataset=dataset;
      meta.sources.facilities='경기도청 환경오염물질배출업소현황 / 행정안전부 대기오염물질배출시설설치사업장 (누락 좌표 보완)';
      meta.sources.facilityImportDate=dataset.appliedDate;
      meta.sources.facilityCoordinateNote=dataset.policy+' 원본 좌표의 실제 정확도는 미검증. 출처 간 100m 초과 차이는 사업장별 기록 참고.';
    }
    if(state.ofp){const d=state.ofp.dataset;meta.ofp={active:S.analysisMetric==='ofp',source:{...d.source},formula:'Σ concentration(ppb) × MIR',unit:MamoOfp.UNIT,mapping:d.mapping.map(row=>({...row})),includedSpeciesCount:d.includedCount,validPointCount:d.validCount,excludedPointCount:d.excludedPointCount,totalPointCount:d.totalPointCount,invalidValuePolicy:'매칭 성분 중 빈값·비수치·음수가 하나라도 있으면 해당 지점은 OFP 분석에서 제외; 농도 모드의 원본 지점은 유지',unmatchedPolicy:'미등록·비ppb·동일 MIR 키 중복 열은 합산하지 않음; TVOC 합산 안 함',contributions:state.ofp.summary.map(row=>({...row})),limitation:MamoOfp.limitation};if(meta.ofp.active)meta.limitations.push(MamoOfp.limitation);}
    const ofpPoints=state.ofp?state.ofp.points.map(p=>({id:p.id,time:p.time,lat:p.lat,lon:p.lon,ofp:{value:p.ofp.value,contributions:p.ofp.contributions.map(row=>({...row})),invalid:p.ofp.invalid.map(row=>({...row}))}})):[];
    return {meta,points,candidates,selected,units:{...S.units},ofpPoints};
  }
  function ofpCsv(snapshot){return csv([['지점 ID','측정 시각','위도 WGS84','경도 WGS84','입력 성분','MIR 원본 키','MIR (g O3/g VOC)','농도 (ppb)','성분 기여 (ppb·MIR)','지점 합계 (ppb·MIR)','OFP 분석 포함','지점 제외 사유','앱 내장 가상 예시 여부'],...snapshot.ofpPoints.flatMap(point=>snapshot.meta.ofp.mapping.filter(row=>row.status==='포함').map(row=>{const c=point.ofp.contributions.find(c=>c.chemical===row.chemical);return [point.id,point.time,point.lat,point.lon,row.chemical,row.key,row.mir,c?.concentrationPpb??'',c?.value??'',point.ofp.value??'',point.ofp.value===null?'아니오':'예',point.ofp.invalid.map(e=>e.chemical+': '+e.reason).join('; '),snapshot.meta.sample?'예':'아니오'];}))]);}
  function pointCsv(snapshot){const chems=Array.from(new Set(snapshot.points.flatMap(p=>Object.keys(p.chem))));return csv([['지점 ID','측정 시각','위도 WGS84','경도 WGS84','선택 성분','선택 분석값','선택 단위',...chems.map(c=>c+' ('+(snapshot.units[c]||'ppb')+')'),'파서 반영 TVOC (ppb)','적용 풍향 (deg)','적용 풍속 (m/s)','앱 내장 가상 예시 여부'],...snapshot.points.map(p=>[p.id,p.time,p.lat,p.lon,snapshot.meta.measurement.component,p.value,snapshot.meta.measurement.unit,...chems.map(c=>p.chem[c]),p.tvoc,p.appliedWind.wd,p.appliedWind.ws,snapshot.meta.sample?'예':'아니오'])]);}
  function candidateCsv(snapshot){return csv([['순위','사업장명','종별','업종','주소','위도 WGS84','경도 WGS84','좌표 정확도','거리 (m)','후보 점수 (0–100, 확률 아님)','사업장 방위각 (deg)','중첩 지점 수','분석 모드','분석 지표','분석값 단위','앱 내장 가상 예시 여부','사업장 좌표 출처','도청 원본 행','행안부 보완 원본 행','출처 간 좌표 차이 (m)','사업장 자료 반영일'],...snapshot.candidates.map(c=>[c.rank,c.facility.name,c.facility.cat,c.facility.induty,c.facility.addr,c.facility.lat,c.facility.lon,c.facility.acc||'미기록',c.distanceM,c.score,c.bearingDeg,c.overlapCount,snapshot.meta.analysis.mode,snapshot.meta.analysis.metric,snapshot.meta.measurement.unit,snapshot.meta.sample?'예':'아니오',c.facility.src||'',c.facility.provinceRow??'',c.facility.moisRow??'',c.facility.sourceCoordinateDifferenceM??'',c.facility.datasetAppliedDate||''])]);}
  function textLines(text,max=52){const words=Array.from(String(text));const rows=[];for(let i=0;i<words.length;i+=max)rows.push(words.slice(i,i+max).join(''));return rows.length?rows:[''];}
  function tileData(tile){
    if(!tile.complete||!tile.naturalWidth)throw new Error('배경지도가 아직 로딩 중이거나 연결되지 않았습니다. 로딩 후 다시 저장하거나 배경지도 포함을 해제하세요.');
    const canvas=document.createElement('canvas');canvas.width=tile.naturalWidth;canvas.height=tile.naturalHeight;canvas.getContext('2d').drawImage(tile,0,0);
    try{return canvas.toDataURL('image/png');}catch{throw new Error('배경지도 이미지를 저장할 수 없습니다. 배경지도 포함을 해제하고 SVG로 저장하세요.');}
  }
  function figureSvg(snapshot){
    if(!map)throw new Error('지도를 먼저 여세요.');const size=map.getSize();const w=size.x,h=size.y;if(w<1||h<1)throw new Error('지도 크기를 확인할 수 없습니다.');
    const rect=byId('map').getBoundingClientRect();const pieces=[];
    const dots=[];const candidatePositions=new Map(snapshot.candidates.map(c=>[`${c.facility.lat},${c.facility.lon}`,c]));
    if(snapshot.meta.map.includeBasemap){
      const tiles=Array.from(byId('map').querySelectorAll('img.leaflet-tile')).filter(tile=>{const r=tile.getBoundingClientRect();return r.right>rect.left&&r.left<rect.right&&r.bottom>rect.top&&r.top<rect.bottom;});
      if(!tiles.length)throw new Error('배경지도를 불러온 뒤 다시 저장하세요.');
      for(const tile of tiles){const r=tile.getBoundingClientRect();const data=tileData(tile);pieces.push(`<image x="${r.left-rect.left}" y="${r.top-rect.top}" width="${r.width}" height="${r.height}" href="${data}"${snapshot.meta.map.quietBackground?' filter="url(#quiet)"':''}/>`);}
    }
    const project=latlng=>map.latLngToContainerPoint(latlng);
    const pathOf=latlngs=>{if(!latlngs.length)return'';if(Array.isArray(latlngs[0]))return latlngs.map(pathOf).join(' ');return latlngs.map((p,i)=>{const q=project(p);return `${i?'L':'M'}${q.x.toFixed(2)} ${q.y.toFixed(2)}`;}).join(' ')+' Z';};
    if(coneLayer)coneLayer.eachLayer(layer=>{const o=layer.options;if(layer instanceof L.Polyline){const latlngs=layer.getLatLngs();let d=pathOf(latlngs);if(!(layer instanceof L.Polygon))d=d.replace(/ Z/g,'');pieces.push(`<path d="${d}" fill="${layer instanceof L.Polygon?esc(o.fillColor||o.color):'none'}" fill-opacity="${o.fillOpacity??.2}" stroke="${esc(o.color||'#f97316')}" stroke-width="${o.weight??1}" stroke-opacity="${o.opacity??1}"${o.dashArray?` stroke-dasharray="${esc(o.dashArray)}"`:''}/>`);}});
    if(facLayer)facLayer.eachLayer(layer=>{if(!layer.getLatLng)return;const p=layer.getLatLng(),q=project(p);const candidate=candidatePositions.get(`${p.lat},${p.lng}`),count=candidate?.overlapCount;const fill=count?count>=3?'#dc2626':count===2?'#f97316':'#eab308':candidate?'#dc2626':'#64748b';dots.push(`<circle cx="${q.x}" cy="${q.y}" r="${count?8:candidate?5:3.5}" fill="${fill}" stroke="white" stroke-width="1" fill-opacity=".85"/>${count?`<text x="${q.x}" y="${q.y+3}" text-anchor="middle" font-size="8" fill="${count>=3?'white':'#1e293b'}" font-weight="700">${count}</text>`:''}`);});
    snapshot.points.forEach(p=>{const q=project([p.lat,p.lon]);const r=p.id===snapshot.meta.measurement.selectedId?7:4;dots.push(`<circle cx="${q.x}" cy="${q.y}" r="${r}" fill="${esc(p.color)}" stroke="${r===7?'#1e293b':'white'}" stroke-width="${r===7?2:1}"/>`);});
    const distance=map.distance(map.containerPointToLatLng([24,h-32]),map.containerPointToLatLng([Math.min(180,w/3),h-32]));const power=10**Math.floor(Math.log10(Math.max(distance,1)));const step=[1,2,5,10].map(k=>k*power).filter(m=>m<=distance).at(-1)||power;const bar=(Math.min(180,w/3)-24)*step/distance;
    const unit=step>=1000?`${number(step/1000)} km`:`${number(step,0)} m`;const subtitle=snapshot.points.length?`${snapshot.meta.region} · ${snapshot.meta.measurement.component} (${snapshot.meta.measurement.unit}) · ${snapshot.meta.analysis.mode==='overlap'?'고농도 지점 중첩':'단일 지점 풍상 추적'}`:`${snapshot.meta.region} · 대기배출사업장 지도`;
    const legendRows=[['#f87171','측정: 상위 5%'],['#fb923c','측정: 5–10%'],['#facc15','측정: 10–20%'],['#4ade80','측정: 그 외 80%']];
    if(snapshot.meta.ofp?.active)for(const row of legendRows)row[1]=row[1].replace('측정:','지수:');
    if(snapshot.meta.analysis.mode==='overlap')legendRows.push(['#dc2626','사업장: 중첩 3개+'],['#f97316','사업장: 중첩 2개'],['#eab308','사업장: 중첩 1개'],['#64748b','그 외 사업장']);else legendRows.push(['#dc2626','사업장 후보'],['#64748b','그 외 사업장']);
    const legendWidth=178,legendHeight=42+legendRows.length*21,legendX=Math.max(8,w-legendWidth-12),legendY=Math.max(65,h-legendHeight-18);
    const legend=snapshot.points.length?`<rect x="${legendX}" y="${legendY}" width="${legendWidth}" height="${legendHeight}" rx="4" fill="white" fill-opacity=".95" stroke="#cbd5e1"/><text x="${legendX+12}" y="${legendY+22}" font-size="12" font-weight="700">${snapshot.meta.analysis.metric==='ofp-relative-index'?'OFP 상대지수':'농도 분포'} / ${snapshot.meta.analysis.mode==='overlap'?'중첩 지점 수':'후보'}</text>${legendRows.map(([color,label],i)=>`<circle cx="${legendX+17}" cy="${legendY+43+i*21}" r="4" fill="${color}" stroke="#64748b" stroke-width=".4"/><text x="${legendX+30}" y="${legendY+47+i*21}" font-size="10">${label}</text>`).join('')}`:'';
    const lower=[`${snapshot.meta.sample?'가상 예시 · 실제 관측 아님 / ':''}좌표 WGS84 · 지도 EPSG:3857 · 현재 범위 사업장 ${snapshot.meta.map.displayedFacilityMarkers}개 (표시 상한 600개)`,snapshot.points.length?`분류 기준: ${snapshot.meta.measurement.percentile}백분위 / ≥ ${number(snapshot.meta.measurement.threshold)} ${snapshot.meta.measurement.unit} · 법정 기준 아님`:'사업장 자료 기준일: 미기록 · 사업장별 좌표 정확도 확인 필요',`사업장: ${snapshot.meta.facilitySource.kind==='uploaded'?'사용자 업로드 자료':'환경부 내장 자료'} / 배경지도: © OpenStreetMap contributors`,'간이 스크리닝 결과 · 배출원 확정 / 기여율 근거로 해석하지 않음'];
    if(snapshot.meta.ofp?.active)lower.splice(1,0,'OFP 상대지수 = Σ 농도(ppb) × MIR · mamo-oz '+snapshot.meta.ofp.source.commit.slice(0,7),'비교용 지수 · 실제 오존 농도 또는 질량 기반 OFP 아님');
    const titleLines=textLines(snapshot.meta.title,Math.max(10,Math.floor((w-40)/20)));
    const subtitleLines=textLines(subtitle,Math.max(18,Math.floor((w-40)/11)));
    const lowerLines=lower.flatMap(line=>textLines(line,Math.max(20,Math.floor((w-32)/10))));
    const top=40+titleLines.length*24+subtitleLines.length*16;
    const bottom=38+lowerLines.length*19;const height=top+h+bottom;
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img" aria-labelledby="figureTitle figureDescription"><title id="figureTitle">${esc(snapshot.meta.title)}</title><desc id="figureDescription">${esc(subtitle)}. ${esc(lower.join(' '))}</desc><defs><clipPath id="mapClip"><rect width="${w}" height="${h}"/></clipPath><filter id="quiet"><feColorMatrix type="saturate" values="0.05"/></filter></defs><rect width="100%" height="100%" fill="white"/><g font-family="Malgun Gothic,Apple SD Gothic Neo,sans-serif" fill="#1e293b">${titleLines.map((t,i)=>`<text x="20" y="${28+i*24}" font-size="18" font-weight="700">${esc(t)}</text>`).join('')}${subtitleLines.map((line,i)=>`<text x="20" y="${34+titleLines.length*24+i*16}" font-size="11" fill="#475569">${esc(line)}</text>`).join("")}<g transform="translate(0 ${top})"><g clip-path="url(#mapClip)"><rect width="${w}" height="${h}" fill="#f8fafc"/>${pieces.join('')}${dots.join('')}</g><rect x=".5" y=".5" width="${w-1}" height="${h-1}" fill="none" stroke="#cbd5e1"/><g transform="translate(24 24)"><rect x="-10" y="-14" width="38" height="58" rx="4" fill="white" fill-opacity=".94"/><text x="9" y="0" text-anchor="middle" font-size="12" font-weight="700">N</text><path d="M9 8 L1 29 L9 24 L17 29 Z" fill="#1e293b"/></g><g transform="translate(24 ${h-35})"><rect x="-8" y="-22" width="${bar+16}" height="40" fill="white" fill-opacity=".94"/><text x="${bar/2}" y="-6" text-anchor="middle" font-size="11">${unit}</text><path d="M0 0 V7 H${bar} V0" fill="none" stroke="#1e293b" stroke-width="2"/></g>${legend}</g>${lowerLines.map((line,i)=>`<text x="16" y="${top+h+22+i*19}" font-size="${w<500?8:10}" fill="#475569">${esc(line)}</text>`).join('')}</g></svg>`;
  }
  async function png(svg,scale){const image=new Image();const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('지도 그림을 변환하지 못했습니다. SVG로 저장하세요.'));image.src=url;});const canvas=document.createElement('canvas');canvas.width=image.naturalWidth*scale;canvas.height=image.naturalHeight*scale;if(canvas.width*canvas.height>40e6)throw new Error('출력 크기가 큽니다. PNG 배율을 2배로 낮춰주세요.');canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG를 저장하지 못했습니다.')),'image/png'));}finally{URL.revokeObjectURL(url);}}
  async function runExport(action){if(state.busy)return;state.busy=true;refreshUi();status('현재 분석 상태를 저장하는 중…',true);try{await action();status('결과를 준비했습니다. 저장된 자료의 조건과 해석 한계를 함께 확인하세요.');}catch(error){status(error.message,true);if(byId('reportDialog').open)byId('reportReady').textContent='보고서를 만들지 못했습니다. '+error.message;}finally{state.busy=false;refreshUi();}}
  byId('btnFigureSvg').onclick=()=>runExport(async()=>{const shot=capture(),name=stem();save(new Blob([figureSvg(shot)],{type:'image/svg+xml;charset=utf-8'}),name+'_map.svg');});
  byId('btnFigurePng').onclick=()=>runExport(async()=>{const shot=capture(),name=stem(),svg=figureSvg(shot);save(await png(svg,shot.meta.map.pngScale),name+'_map.png');});
  byId('btnCandidateCsv').onclick=()=>runExport(async()=>{const shot=capture();save(new Blob([candidateCsv(shot)],{type:'text/csv;charset=utf-8'}),stem()+'_candidates.csv');});
  byId('btnMeasurementsCsv').onclick=()=>runExport(async()=>{const shot=capture();save(new Blob([pointCsv(shot)],{type:'text/csv;charset=utf-8'}),stem()+'_measurements.csv');});
  byId('btnConditions').onclick=()=>runExport(async()=>{const shot=capture();save(new Blob([JSON.stringify(shot.meta,null,2)],{type:'application/json;charset=utf-8'}),stem()+'_conditions.json');});
  byId('btnOfpCsv').onclick=()=>runExport(async()=>{const shot=capture();save(new Blob([ofpCsv(shot)],{type:'text/csv;charset=utf-8'}),stem()+'_ofp.csv');});

  const reportCss=`*{box-sizing:border-box}body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#1e293b;font-size:11px;line-height:1.7;margin:0;background:#fff}.printAction{display:block;margin:16px auto;padding:10px 16px;border:1px solid #cbd5e1;background:white;color:#1e293b;cursor:pointer;font:inherit}.paper{max-width:920px;margin:auto;padding:32px}h1{font-size:23px;line-height:1.5;margin:4px 0 10px}h2{font-size:16px;margin:26px 0 12px;border-bottom:1px solid #94a3b8;padding-bottom:8px}h3{font-size:12px;margin:16px 0 6px}.kicker{font-size:9px;letter-spacing:1.2px;color:#475569}.muted{color:#475569}.sample{padding:10px;border:1px solid #b45309;background:#fff7ed;color:#9a3412;font-weight:bold}.figure{width:100%;height:auto;display:block;border:1px solid #cbd5e1}figure{margin:16px 0}figcaption{font-size:10px;color:#475569;margin-top:8px}table{width:100%;border-collapse:collapse;font-size:10px;margin:12px 0}thead{display:table-header-group}th{background:#f1f5f9;font-weight:700;text-align:left}th,td{padding:7px 8px;border:1px solid #cbd5e1;vertical-align:top;overflow-wrap:anywhere}td.num{font-variant-numeric:tabular-nums;text-align:right}table.conditions th{width:25%}.note{padding:12px;border-left:3px solid #475569;background:#f8fafc}.caption{font-size:10px}.section{break-inside:auto}tr,figure,.note{break-inside:avoid}.app-footer{font-size:9px;margin-top:28px;border-top:1px solid #cbd5e1;padding-top:12px}.process{display:flex;gap:12px}.process>div{flex:1;border-top:2px solid #2563eb;padding:12px 0}.process strong{font-size:13px}.metric{display:flex;gap:16px;margin:16px 0}.metric>div{flex:1;border:1px solid #cbd5e1;padding:12px}.metric b{display:block;font-size:20px;font-variant-numeric:tabular-nums}.chartSvg{width:100%;max-height:240px}.tableWrap{overflow-x:auto}@media(max-width:600px){.paper{padding:20px}.process,.metric{flex-wrap:wrap}.process>div,.metric>div{flex-basis:40%}h1{font-size:19px}}@page{size:A4;margin:16mm 14mm}@media print{.printAction{display:none}.paper{padding:0;max-width:none}body{font-size:10px}.tableWrap{overflow:visible}h2{break-after:avoid}.pageBreak{break-before:page}.figure{max-height:180mm;object-fit:contain}.sample,th,.note{-webkit-print-color-adjust:exact;print-color-adjust:exact}a{color:#1e293b;text-decoration:none}thead{display:table-header-group}}`;
  function conditionsRows(snapshot){const m=snapshot.meta;return [['현재 바람 출처',m.analysis.windSourceLabel||'미기록'],['최근 기상 조회',m.analysis.weatherQuery?m.analysis.weatherQuery.status+(m.analysis.weatherQuery.message?' / '+m.analysis.weatherQuery.message:''):'조회 기록 없음'],['적용한 AWS 관측',m.analysis.weatherStation?JSON.stringify(m.analysis.weatherStation):'직접 입력 또는 측정 파일 바람'],['분석 지표',m.analysis.metric==='ofp-relative-index'?'OFP 상대지수 (ppb×MIR); 매칭 성분만 합산':'측정 농도'],['조사명 / 구역',m.site||'미기록'],['측정 일시',m.measurementPeriod||'미기록 (파일 시각: '+(m.measurement.timeStart||'없음')+' → '+(m.measurement.timeEnd||'없음')+')'],['장비 / 측정 자료 출처',m.instrumentAndSource||'미기록'],['입력 파일',m.source?.filename||'없음'],['원본 파일 SHA-256',m.source?.sha256||'미기록'],['지역 / 성분 / 단위',`${m.region} / ${m.measurement.component} / ${m.measurement.unit||'해당 없음'}`],['분석 모드',m.analysis.mode==='overlap'?'고농도 지점 중첩':'선택 지점 풍상 추적'],['고농도 분류',`${m.measurement.percentile}백분위 이상 / 임계값 ${number(m.measurement.threshold)} ${m.measurement.unit||''}; 법정 기준 아님`],['선택 지점',m.measurement.selectedId??'없음'],['풍향 / 풍속 / 출처',`${number(m.analysis.selectedWind.wd)}° / ${number(m.analysis.selectedWind.ws)} m/s / ${m.analysis.windMode==='data'?'지점별 측정 파일':'수동 또는 기상청 조회'}${m.analysis.weatherManuallyEdited?' (조회 후 수정됨)':''}`],['기상 조회 기록',m.analysis.weatherObservation||'미기록'],['형태 / 안정도',`${m.analysis.shape==='plume'?'가우시안 플룸':'부채꼴'} / ${m.analysis.stability}`],['추적 크기',m.analysis.autoDistance?`풍속 연동 / ${m.analysis.trackingMinutes}분 / 선택 지점 ${number(m.analysis.effectiveSelectedDistanceM)} m`:`수동 ${m.analysis.manualDistanceM} m`],['선택 지점 확산각 σθ',number(m.analysis.effectiveSelectedSigmaDeg)+'°'],['업종 / 종별 필터',`${m.analysis.industryFilter||'전체'} / ${m.analysis.facilityCategories?.join(', ')||'전체'}`],['사업장 표시 / 후보 수',`${m.analysis.facilitiesVisible?'표시':'숨김'} / ${m.analysis.candidateCount}개`],['좌표계 / 지도 범위',`${m.map.inputCoordinates}; 지도 ${m.map.crs}; zoom ${m.map.zoom}; ${JSON.stringify(m.map.bounds)}`],['사업장 자료 출처',m.sources.facilities],['사업장 좌표 처리',m.sources.facilityCoordinateNote],['내장 사업장 자료 기준일',m.sources.facilityDataDate],['사업장 자료 반영일',m.sources.facilityImportDate||'미기록'],['분석 실행 기록',displayTime(m.createdISO)+' / MAMO '+m.appVersion]];}
  function conditionsTable(snapshot){return `<table class="conditions"><tbody>${conditionsRows(snapshot).map(([key,val])=>`<tr><th scope="row">${esc(key)}</th><td>${esc(val)}</td></tr>`).join('')}</tbody></table>`;}
  function trendSvg(snapshot){const values=snapshot.points.map(p=>p.value);if(!values.length)return'';const max=values.reduce((max,value)=>Math.max(max,value),1);const w=800,h=210;const thresholdValue=snapshot.meta.measurement.threshold;const bars=values.map((v,i)=>{const barW=740/values.length;const barH=v/max*144;return `<rect x="${48+i*barW}" y="${170-barH}" width="${Math.max(.4,barW-1)}" height="${barH}" fill="${esc(snapshot.points[i].color)}"/>`;}).join('');return `<svg class="chartSvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="측정 순서별 선택 성분 농도"><rect width="800" height="210" fill="white"/><g font-family="Malgun Gothic,sans-serif" font-size="10" fill="#475569">${[0,.5,1].map(k=>`<line x1="48" y1="${170-k*144}" x2="790" y2="${170-k*144}" stroke="#cbd5e1"/><text x="42" y="${174-k*144}" text-anchor="end">${number(max*k,1)}</text>`).join('')}${bars}<line x1="48" y1="${170-thresholdValue/max*144}" x2="790" y2="${170-thresholdValue/max*144}" stroke="#1e293b" stroke-dasharray="5 4"/><text x="50" y="15">${esc(snapshot.meta.measurement.component)} (${esc(snapshot.meta.measurement.unit)})</text><text x="48" y="192">첫 지점 #${esc(snapshot.points[0].id)}</text><text x="790" y="192" text-anchor="end">마지막 지점 #${esc(snapshot.points.at(-1).id)}</text><text x="400" y="207" text-anchor="middle">파일의 측정 지점 순서 · 점선 = 고농도 분류 기준</text></g></svg>`;}
  function candidateTable(snapshot){const overlap=snapshot.meta.analysis.mode==='overlap';const head=overlap?'<th scope="col">중첩 지점 수</th><th scope="col">최근접 거리 (m)</th>':'<th scope="col">거리 (m)</th><th scope="col">방위각 (deg)</th><th scope="col">후보 점수 (0–100)</th>';return `<div class="tableWrap" role="region" aria-label="후보 사업장 표" tabindex="0"><table><thead><tr><th scope="col">순위</th><th scope="col">사업장 / 종별</th><th scope="col">업종 / 주소 / 좌표 정확도</th>${head}</tr></thead><tbody>${snapshot.candidates.length?snapshot.candidates.map(c=>`<tr><td class="num">${c.rank}</td><td><strong>${esc(c.facility.name)}</strong><br>${esc(c.facility.cat||'미기록')}</td><td>${esc(c.facility.induty||'미기록')}<br>${esc(c.facility.addr||'미기록')}<br><span class="muted">좌표 ${esc(c.facility.acc||'미기록')}<br>${esc(c.facility.src||'미기록')}</span></td>${overlap?`<td class="num">${c.overlapCount}</td><td class="num">${number(c.distanceM,0)}</td>`:`<td class="num">${number(c.distanceM,0)}</td><td class="num">${number(c.bearingDeg,1)}</td><td class="num">${number(c.score,1)}</td>`}</tr>`).join(''):`<tr><td colspan="${overlap?5:6}">현재 범위·바람·필터 조건에서 후보가 없습니다. 특정 사업장의 배출 여부를 뜻하지 않습니다.</td></tr>`}</tbody></table></div>`;}
  function documentHtml(title,content){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${reportCss}</style></head><body><article class="paper">${content}</article></body></html>`;}
  function ofpReport(snapshot){const ofp=snapshot.meta.ofp;if(!ofp?.active)return'';return `<h2>OFP 상대지수 계산 기록</h2><p class="note">${esc(ofp.formula)} (${esc(ofp.unit)}). ${esc(ofp.limitation)}</p><p>MIR 매칭 ${ofp.includedSpeciesCount}/${ofp.mapping.length}성분 · OFP 유효 ${ofp.validPointCount}/${ofp.totalPointCount}지점 · 제외 ${ofp.excludedPointCount}지점. ${esc(ofp.invalidValuePolicy)}.</p><table><thead><tr><th>입력 성분 / 원본 키</th><th>MIR</th><th>처리</th></tr></thead><tbody>${ofp.mapping.map(row=>`<tr><td>${esc(row.chemical)} / ${esc(row.key||'미등록')}</td><td>${row.mir??'—'}</td><td>${esc(row.status)}</td></tr>`).join('')}</tbody></table><table><thead><tr><th>성분</th><th>OFP 평균 기여 (ppb·MIR)</th><th>지수 내 비율 (%)</th></tr></thead><tbody>${ofp.contributions.map(row=>`<tr><td>${esc(row.chemical)}</td><td>${number(row.mean)}</td><td>${number(row.sharePercent,1)}</td></tr>`).join('')}</tbody></table><p>계수 출처: <a href="${ofp.source.url}">mamo-oz / ${ofp.source.commit}</a>. 원본 계수값을 그대로 사용했습니다. 혼합 성분 계수는 개별 이성질체에 대입하지 않습니다. TVOC는 합산에서 제외됩니다.</p>`;}
  function methodsHtml(snapshot){return documentHtml('MAMO 사용 절차와 분석 기록',`<p class="kicker">MAMO / WORKFLOW AND METHODS</p><h1>이동측정 기반 배출원 후보 분석</h1>${snapshot.meta.sample?'<p class="sample">가상 예시 데이터입니다. 실제 관측·조사 결과가 아닙니다.</p>':''}<div class="process"><div><strong>01 데이터 준비</strong><p>지역 선택 → 파일 열기 → 유효 좌표와 성분·단위 확인</p></div><div><strong>02 분석 조건</strong><p>바람 출처 → 고농도 백분위 → 추적시간·안정도 → 사업장 필터</p></div><div><strong>03 후보 검토</strong><p>단일 지점 또는 고농도 중첩 → 후보 위치·업종·좌표 정확도 확인</p></div><div><strong>04 자료 저장</strong><p>현재 지도 PNG/SVG → 후보·측정 CSV → 조건 JSON → 보고서 PDF</p></div></div><h2>입력 자료</h2><p>CSV·TXT·TSV·XLSX·XLS. Latitude, Longitude(또는 Longtitude), 성분명(ppb) 또는 TVOC 열. 날짜·장비·출처가 없는 항목은 사용자가 직접 기록합니다. SHA-256은 원본 파일 바이트의 식별값입니다.</p><h2>간이 분석 방법</h2><p>풍향은 바람이 불어오는 방향입니다. 풍상 거리와 대기안정도에 따른 각도 범위를 사용해 사업장 후보를 선별합니다. 자동 거리는 풍속 × 추적시간을 사용하며 기존 코드의 50–1500 m 범위 제한과 약풍 각도 보정을 유지합니다. 후보 점수는 방향 일치와 거리 가중의 곱입니다. 중첩 모드는 여러 고농도 지점의 풍상 범위에 포함되는 사업장별 지점 수를 집계합니다. 이 설명은 구현 방법을 설명하며 과학적 타당성 검증을 대신하지 않습니다.</p><h2>현재 실행 조건</h2>${conditionsTable(snapshot)}${ofpReport(snapshot)}<h2>출처와 해석 한계</h2><p>${esc(snapshot.meta.sources.facilities)} · 기준일 ${esc(snapshot.meta.sources.facilityDataDate)}.<br>${esc(snapshot.meta.sources.wind)}.<br>${esc(snapshot.meta.sources.basemap)}.</p><ul>${snapshot.meta.limitations.map(l=>`<li>${esc(l)}</li>`).join('')}</ul><div class="app-footer">MAMO ${esc(snapshot.meta.appVersion)} · 제작·관리 신현준 / 수도권대기환경청 · 논문 작성 시 원본 측정 자료와 검증 방법을 별도로 제시하세요.</div>`);}
  byId('btnMethods').onclick=()=>runExport(async()=>{const shot=capture();save(new Blob([methodsHtml(shot)],{type:'text/html;charset=utf-8'}),stem()+'_workflow.html');});
  function reportDocument(snapshot,data,standalone=false){
      const m=snapshot.meta;const quality=m.quality;const content=`<p class="kicker">MAMO / SCREENING ANALYSIS RECORD</p><h1>${esc(m.title)}</h1><p class="muted">${esc(m.site||m.region)} · ${esc(m.measurementPeriod||'측정 일시 미기록')} · 기록 ${esc(displayTime(m.createdISO))}</p>${m.sample?'<p class="sample">가상 예시 · 실제 관측 데이터 또는 조사 결과가 아닙니다.</p>':''}<div class="metric"><div><span>유효 측정 지점</span><b>${m.measurement.count}</b></div><div><span>평균 (${esc(m.measurement.unit)})</span><b>${number(m.measurement.mean)}</b></div><div><span>최대 (${esc(m.measurement.unit)})</span><b>${number(m.measurement.max)}</b></div><div><span>후보 사업장</span><b>${m.analysis.candidateCount}</b></div></div><h2>1. 분석 지도와 측정값</h2><figure><img class="figure" src="${data}" alt="${esc(m.title)} 지도·농도 범례·북쪽·축척"><figcaption>그림 1. ${esc(m.region)} ${esc(m.measurement.component)} (${esc(m.measurement.unit)})와 ${m.analysis.mode==='overlap'?'고농도 지점 풍상 범위 중첩':'선택 지점 풍상 추적 범위'}. 배경지도는 현재 화면 타일입니다. 지도 표시 사업장 상한은 600개이며, 다음 표는 분석 후보 전체를 포함합니다.</figcaption></figure>${trendSvg(snapshot)}<p class="caption">그림 2. 파일에 기록된 측정 지점 순서별 농도. 고농도 분류 기준은 ${m.measurement.percentile}백분위 (≥ ${number(m.measurement.threshold)} ${esc(m.measurement.unit)}). 법정 기준 초과를 뜻하지 않습니다.</p><h2 class="pageBreak">2. 재현을 위한 분석 조건</h2>${conditionsTable(snapshot)}<h3>입력 자료 처리</h3><p>${quality?`원본 ${quality.rows}행 / 유효 좌표 ${quality.validPoints}개 / 좌표 제외 ${quality.excluded}행 / 농도 빈값·비수치 ${quality.nonNumericConcentrationCells}개 / 파서 경고 ${quality.parserWarningCount}개. ${esc(quality.missingValuePolicy)}`:'원본 처리 기록 미기록'}</p><h2 class="pageBreak">3. 배출원 후보 (${snapshot.candidates.length}개)</h2><p class="note">${m.analysis.mode==='overlap'?'중첩 지점 수와 최근접 거리를 기록했습니다. 단일 지점의 방위각이나 점수를 중첩 결과에 대입하지 않습니다.':'후보 점수 (0–100)는 풍향 일치도 × 거리 가중 × 100입니다. 배출원일 확률 또는 배출 기여율이 아닙니다.'}</p>${candidateTable(snapshot)}<h2>4. 자료 출처와 해석 한계</h2><p>${esc(m.sources.facilities)} · 자료 기준일 ${esc(m.sources.facilityDataDate)}<br>${esc(m.sources.wind)}<br>${esc(m.sources.basemap)}</p><ul>${m.limitations.map(l=>`<li>${esc(l)}</li>`).join('')}</ul><div class="app-footer">MAMO ${esc(m.appVersion)} · 제작·관리 신현준 / 수도권대기환경청 · 같은 분석 상태의 후보 CSV·측정 CSV·조건 JSON과 함께 보관하세요.</div>`;
    return documentHtml(m.title,(standalone?'<button class="printAction" onclick="window.print()">인쇄 · PDF로 저장</button>':'')+content+ofpReport(snapshot));
  }
  function blobDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('그림을 보고서에 넣지 못했습니다.'));reader.readAsDataURL(blob);});}
  byId('btnResearchPackage').onclick=()=>runExport(async()=>{
    const shot=capture(),name=stem(),svg=figureSvg(shot);
    status('지도와 보고서를 묶는 중…',true);
    const figure=await png(svg,shot.meta.map.pngScale),data=await blobDataUrl(figure);
    const instructions=[
      'MAMO 연구 자료 묶음',
      '제목: '+shot.meta.title,
      '기록 시각: '+shot.meta.createdISO,
      '앱 버전: '+shot.meta.appVersion,
      '입력 파일: '+(shot.meta.source?.filename||'미기록'),
      '원본 SHA-256: '+(shot.meta.source?.sha256||'미기록'),
      shot.meta.sample?'가상 예시입니다. 실제 관측 또는 조사 결과가 아닙니다.':'사용자 파일입니다. 실제 관측 여부와 품질은 원본 자료에서 확인하세요.',
      '',
      'map.png: 선택 배율의 지도 그림 / map.svg: 벡터 도형과 글자, 배경은 래스터 타일',
      'candidates.csv: 전체 후보 / measurements.csv: 파서 반영 측정값과 지점별 적용 바람',
      'conditions.json: 자료 출처, 파일 식별값, 분석 조건과 지도 범위',
      'report.html: 지도·그래프·조건·후보 표. 브라우저에서 열어 인쇄 또는 PDF 저장',
      'workflow.html: 사용 절차와 구현 방법',
      ...(shot.meta.ofp?.includedSpeciesCount?['ofp.csv: 전체 원본 유효 좌표 지점의 성분별 MIR 계산과 OFP 제외 사유']:[]),
      '',
      '모든 파일은 ZIP 저장을 누른 시점의 동일한 분석 상태로 생성했습니다.',
      '원본 측정 파일은 포함하지 않습니다. 원본과 이 ZIP을 함께 보관하세요.',
      ...shot.meta.limitations
    ].join('\r\n');
    const files=[{name:'map.png',data:figure},{name:'map.svg',data:svg},{name:'candidates.csv',data:candidateCsv(shot)},{name:'measurements.csv',data:pointCsv(shot)},{name:'conditions.json',data:JSON.stringify(shot.meta,null,2)},{name:'report.html',data:reportDocument(shot,data,true)},{name:'workflow.html',data:methodsHtml(shot)},{name:'README.txt',data:instructions}];
    if(shot.meta.ofp?.includedSpeciesCount)files.push({name:'ofp.csv',data:ofpCsv(shot)});
    save(await MamoArchive.zip(files,new Date(shot.meta.createdISO)),name+'_research.zip');
  });
  oldReport.onclick=()=>{
    if(state.busy||!S.points.length)return;modal('reportDialog');byId('reportReady').textContent='현재 분석 상태와 지도 준비 중…';byId('btnPrintReport').disabled=true;byId('reportFrame').srcdoc=documentHtml('보고서 준비','<p role="status">지도를 준비하고 있습니다.</p>');
    runExport(async()=>{
      const shot=capture();const svg=figureSvg(shot);const figure=await png(svg,2);const data=await blobDataUrl(figure);const m=shot.meta;
      byId('reportFrame').onload=()=>{byId('reportReady').textContent=`${m.sample?'가상 예시 · ':''}지도와 후보 ${shot.candidates.length}개 준비 완료`;byId('btnPrintReport').disabled=false;};byId('reportFrame').srcdoc=reportDocument(shot,data);
    });
  };
  byId('btnPrintReport').onclick=()=>{byId('reportFrame').contentWindow.focus();byId('reportFrame').contentWindow.print();};
  const login=byId('loginScreen');
  document.querySelector('.loginTitle').id='loginTitle';login.setAttribute('role','dialog');login.setAttribute('aria-modal','true');login.setAttribute('aria-labelledby','loginTitle');
  function loginFocus(){const blocked=getComputedStyle(login).display!=='none';document.querySelector('header').inert=blocked;byId('dropScreen').inert=blocked;byId('appScreen').inert=blocked;byId('accessCode').setAttribute('aria-invalid',String(Boolean(byId('loginErr').textContent.trim())));}
  new MutationObserver(loginFocus).observe(login,{attributes:true,attributeFilter:['style','class']});new MutationObserver(loginFocus).observe(byId('loginErr'),{childList:true,subtree:true});loginFocus();
  refreshUi();
})();
