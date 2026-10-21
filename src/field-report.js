/* Field-report workflow adapted from todaynit1-sys/mamo-vocs2 @ ff314192.
   Frozen report model shared by HTML preview and genuine OOXML Word output. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MamoFieldReport=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const title='첨단감시장비 활용 산업단지 현장점검';
  const mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
  const fmt=value=>Number.isFinite(value)?value.toLocaleString('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1}):'미기록';
  function statistics(values){
    let n=0,mean=0,m2=0,max=-Infinity;
    for(const value of values){if(typeof value!=='number'||!Number.isFinite(value))continue;n++;const delta=value-mean;mean+=delta/n;m2+=delta*(value-mean);max=Math.max(max,value);}
    return {n,mean:n?mean:null,sd:n>1?Math.sqrt(Math.max(0,m2/(n-1))):null,max:n?max:null};
  }
  function guessComplex(filename){return String(filename||'').replace(/\.[^.]+$/,'').replace(/^\d{6,8}[_\s-]*/,'').trim().replace(/(국가|일반)$/,'$1산업단지');}
  function guessDate(points,toMinute){
    const dates=points.map(point=>toMinute(point.time)).filter(Boolean).map(value=>value.slice(0,8)).sort();
    if(!dates.length||dates.length!==points.length)return '';
    const display=value=>`${value.slice(0,4)}. ${Number(value.slice(4,6))}. ${Number(value.slice(6,8))}.`;
    return dates[0]===dates.at(-1)?display(dates[0]):display(dates[0])+' ~ '+display(dates.at(-1));
  }
  function buildModel({snapshot,points,chemicals,units,fields}){
    const meta=JSON.parse(JSON.stringify(snapshot.meta));
    const stats=Array.from(new Set(chemicals)).map(chemical=>({chemical,unit:units[chemical]||(meta.measurement.type==='pm'?'미기록':'ppb'),...statistics(points.map(point=>point.chem?.[chemical]))}));
    if(new Set(stats.map(row=>row.unit)).size===1)stats.sort((a,b)=>(b.mean??-Infinity)-(a.mean??-Infinity));
    return {title,complex:String(fields.complex||'').trim()||'미기록',date:String(fields.date||'').trim()||'미기록',department:String(fields.department||'').trim()||'미기록',staff:fields.staff.map(row=>({grade:String(row.grade||'').trim(),name:String(row.name||'').trim()})),notes:String(fields.notes||'').trim(),stats,pointCount:points.length,meta};
  }
  function reportLines(model){
    const m=model.meta;
    return {map:`${m.measurement.component} (${m.measurement.unit})`,
      statistics:`전체 측정지점 ${model.pointCount}개 · 표준편차: 표본표준편차.${m.ofp?.active?' 지도는 OFP 상대지수이며 아래 표는 원본 성분 농도입니다.':''}`,
      quality:m.quality?.nonNumericConcentrationCells?`농도 빈값·비수치 ${m.quality.nonNumericConcentrationCells}개. ${m.quality.missingValuePolicy}`:''};
  }
  const css=`*{box-sizing:border-box}body{font-family:'Malgun Gothic','Noto Sans CJK KR',sans-serif;margin:0;color:#000;background:#e2e8f0;font-size:10pt;line-height:1.4}.paper{width:210mm;min-height:297mm;margin:16px auto;padding:18mm 16mm 16mm;background:#fff}h1{font-size:16pt;text-align:center;margin:0 0 12pt;font-weight:700}h2{font-size:11.5pt;margin:12pt 0 5pt}p{margin:4pt 0}.small{font-size:8pt;color:#333}.sample{font-weight:700}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #d9d9d9;padding:5pt 6pt;vertical-align:middle;overflow-wrap:anywhere}th{background:#f2f2f2;color:#000;text-align:center}td.num{text-align:right;font-variant-numeric:tabular-nums}.info th{width:22%}.map{display:block;max-width:100%;height:auto;max-height:100mm;margin:0 auto}.mapbox{padding:4pt;border:1px solid #d9d9d9}.notes{border:1px solid #d9d9d9;min-height:25mm;padding:7pt;white-space:pre-wrap;overflow-wrap:anywhere}.statistics{font-size:9pt}.statistics th,.statistics td{padding:2pt 4pt}.statistics th:first-child{width:40%}.statistics th:nth-child(2){width:10%}thead{display:table-header-group}tr{break-inside:avoid}caption{text-align:left;margin:6pt 0}.footer{font-size:7.5pt;color:#333;margin-top:9pt;overflow-wrap:anywhere}@page{size:A4;margin:18mm 16mm 16mm}@media print{body{background:white}.paper{width:auto;min-height:0;padding:0;margin:0;break-after:page}.paper:last-child{break-after:auto}}@media screen and (max-width:800px){.paper{width:100%;min-height:0;padding:16px;margin:10px 0}.statistics{font-size:10px}h1{font-size:18px}h2{font-size:15px}.small{font-size:11px}}`;
  function preview(model,imageData){
    const m=model.meta,l=reportLines(model);
    const staff=model.staff.map(row=>`소속 ${escape(model.department)}　직급 ${escape(row.grade||'미기록')}　성명 ${escape(row.name||'미기록')}`).join('<br>');
    const row=(label,value)=>`<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>현장점검 보고서</title><style>${css}</style></head><body><section class="paper"><h1>${title}</h1>${m.sample?'<p class="sample">가상 예시 자료이며 실제 관측 또는 점검 결과가 아닙니다.</p>':''}<h2>대상지역 측정정보</h2><table class="info"><tbody>${row('산업단지 명',escape(model.complex))}${row('측정일자',escape(model.date))}${row('측정자',staff)}${row('장비 및 자료',escape(m.instrumentAndSource||'미기록'))}</tbody></table><h2>측정지역 및 이동측정 결과</h2><p class="small">${escape(l.map)}</p><div class="mapbox"><img class="map" alt="저장 시점의 측정 지점과 사업장 지도" src="${escape(imageData)}"></div><h2>특이사항</h2><div class="notes">${escape(model.notes)}</div></section><section class="paper"><h2>측정항목별 농도</h2><p class="small">${escape(l.statistics)}</p>${l.quality?`<p class="small">${escape(l.quality)}</p>`:''}<table class="statistics"><thead><tr><th scope="col">주요 측정항목</th><th scope="col">단위</th><th scope="col">평균</th><th scope="col">표준편차</th><th scope="col">최대값</th></tr></thead><tbody>${model.stats.map(row=>`<tr><td>${escape(row.chemical)}</td><td>${escape(row.unit)}</td><td class="num">${fmt(row.mean)}</td><td class="num">${fmt(row.sd)}</td><td class="num">${fmt(row.max)}</td></tr>`).join('')}</tbody></table></section></body></html>`;
  }
  function run(text,{bold=false,size=21}={}){return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="맑은 고딕"/>${bold?'<w:b/>':''}<w:color w:val="000000"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escape(text)}</w:t></w:r>`;}
  function paragraph(text,{style='',align='left',bold=false,size=21,before=0,after=60,pageBreak=false,keep=false}={}){return `<w:p><w:pPr>${style?`<w:pStyle w:val="${style}"/>`:''}<w:jc w:val="${align}"/><w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/>${pageBreak?'<w:pageBreakBefore/>':''}${keep?'<w:keepNext/>':''}</w:pPr>${String(text??'').split('\n').map((line,i)=>(i?'<w:r><w:br/></w:r>':'')+run(line,{bold,size})).join('')}</w:p>`;}
  function table(rows,widths,{header=false,notes=false}={}){
    const borders=['top','left','bottom','right','insideH','insideV'].map(side=>`<w:${side} w:val="single" w:sz="6" w:color="D9D9D9"/>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="10090" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="35" w:type="dxa"/><w:left w:w="70" w:type="dxa"/><w:bottom w:w="35" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(width=>`<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows.map((row,index)=>`<w:tr><w:trPr><w:cantSplit/>${header&&index===0?'<w:tblHeader/>':''}${notes?'<w:trHeight w:val="1400" w:hRule="atLeast"/>':''}</w:trPr>${row.map((cell,col)=>`<w:tc><w:tcPr><w:tcW w:w="${widths[col]}" w:type="dxa"/><w:vAlign w:val="center"/>${header&&index===0||!header&&row.length===2&&col===0?'<w:shd w:fill="F2F2F2"/>':''}</w:tcPr>${paragraph(cell,{size:header?18:20,bold:header&&index===0||!header&&row.length===2&&col===0,align:header&&col>1?'right':header&&index===0?'center':'left',after:0})}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
  }
  function drawing(widthPx,heightPx){
    const scale=Math.min(17.8/widthPx,10/heightPx),cx=Math.round(widthPx*scale*360000),cy=Math.round(heightPx*scale*360000);
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="측정 지도" descr="측정 지점과 사업장 후보의 저장 시점 지도"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="map.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdMap"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }
  function documentXml(model,imageSize){
    const m=model.meta,l=reportLines(model),section=text=>paragraph(text,{style:'Heading1',bold:true,size:23,before:160,after:60,keep:true});
    const body=[paragraph(title,{style:'Title',align:'center',bold:true,size:32,after:180})];
    if(m.sample)body.push(paragraph('가상 예시 자료이며 실제 관측 또는 점검 결과가 아닙니다.',{bold:true,size:19}));
    body.push(section('대상지역 측정정보'),table([['산업단지 명',model.complex],['측정일자',model.date],['측정자',model.staff.map(row=>`소속 ${model.department}    직급 ${row.grade||'미기록'}    성명 ${row.name||'미기록'}`).join('\n')],['장비 및 자료',m.instrumentAndSource||'미기록']],[2200,7890]),section('측정지역 및 이동측정 결과'),paragraph(l.map,{size:18,after:50}),drawing(imageSize.width,imageSize.height),section('특이사항'),table([[model.notes]],[10090],{notes:true}),paragraph('측정항목별 농도',{style:'Heading1',bold:true,size:23,pageBreak:true,after:80,keep:true}),paragraph(l.statistics,{size:17,after:80}));
    if(l.quality)body.push(paragraph(l.quality,{size:17,after:80}));
    body.push(table([['주요 측정항목','단위','평균','표준편차','최대값'],...model.stats.map(row=>[row.chemical,row.unit,fmt(row.mean),fmt(row.sd),fmt(row.max)])],[4100,1000,1660,1660,1670],{header:true}));
    const sectionXml='<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1020" w:right="908" w:bottom="907" w:left="908" w:header="0" w:footer="0"/></w:sectPr>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}${sectionXml}</w:body></w:document>`;
  }
  function files(model,png,imageSize){
    if(!png||!Number.isFinite(imageSize.width)||!Number.isFinite(imageSize.height)||imageSize.width<=0||imageSize.height<=0)throw new Error('보고서 지도 이미지를 먼저 준비하세요.');
    const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return [
      {name:'[Content_Types].xml',data:xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'},
      {name:'_rels/.rels',data:xml+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDocument" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
      {name:'word/document.xml',data:documentXml(model,imageSize)},
      {name:'word/_rels/document.xml.rels',data:xml+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMap" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/map.png"/><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
      {name:'word/styles.xml',data:xml+'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="맑은 고딕"/><w:color w:val="000000"/><w:sz w:val="21"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/></w:rPr></w:style></w:styles>'},
      {name:'word/media/map.png',data:png}
    ];
  }
  return {title,mime,statistics,guessComplex,guessDate,buildModel,preview,files,documentXml};
});
