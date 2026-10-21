import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const require=createRequire(import.meta.url),field=require('../src/field-report.js'),weather=require('../src/weather.js');
const archiveContext=vm.createContext({TextEncoder,Uint32Array,Uint8Array,DataView,Blob,Date,Set});
vm.runInContext(await fs.readFile(new URL('../src/research-archive.js',import.meta.url),'utf8'),archiveContext);
const archive=archiveContext.MamoArchive;
const meta={sample:false,createdISO:'2026-10-21T00:00:00Z',appVersion:'6.9',region:'경기도',source:{filename:'260601_테스트 일반.csv'},measurement:{type:'voc',component:'TVOC',unit:'ppb',percentile:90},analysis:{mode:'single-point',windSourceLabel:'기상청 AWS #112'},map:{includeBasemap:false},quality:{nonNumericConcentrationCells:0}};
const points=[{time:'2026-06-01 14:30:00',chem:{Benzene:0,Toluene:2}},{time:'2026-06-01 14:31:00',chem:{Benzene:10,Toluene:4}}];
const fields={complex:'테스트 산업단지',date:'2026. 6. 1.',department:'소속',staff:[{grade:'직급',name:'시험 사용자'},{grade:'',name:''}],notes:'현장 기록'};
const model=()=>field.buildModel({snapshot:{meta},points,chemicals:['Benzene','Toluene'],units:{Benzene:'ppb',Toluene:'ppb'},fields});

test('statistics include valid zeros, exclude absent cells and use sample n-1 deviation',()=>{
  const stat=field.statistics([0,10,null,undefined,NaN,'20']);assert.equal(stat.n,2);assert.equal(stat.mean,5);assert.equal(stat.max,10);assert.equal(stat.sd,Math.sqrt(50));
  assert.equal(field.statistics([5]).sd,null);assert.equal(field.statistics([]).mean,null);assert.equal(field.statistics([-5,-2]).max,-2);
});
test('field report uses the full original concentration series even when the map is OFP-filtered',()=>{
  const source={...meta,ofp:{active:true},measurement:{...meta.measurement,component:'OFP 상대지수',unit:'ppb·MIR',count:1}};
  const report=field.buildModel({snapshot:{meta:source},points,chemicals:['Benzene'],units:{Benzene:'ppb'},fields});
  assert.equal(report.pointCount,2);assert.equal(report.stats[0].mean,5);assert.equal(report.stats[0].unit,'ppb');
  assert.match(field.preview(report,'data:image/png;base64,AA=='),/지도는 OFP 상대지수이며 아래 표는 원본 성분 농도/);
});
test('Word model freezes input fields and metadata independently of later app changes',()=>{
  const shot=JSON.parse(JSON.stringify(meta)),inputs=JSON.parse(JSON.stringify(fields));
  const report=field.buildModel({snapshot:{meta:shot},points,chemicals:['Benzene'],units:{Benzene:'ppb'},fields:inputs});
  shot.analysis.mode='overlap';inputs.staff[0].name='changed';inputs.notes='changed';
  assert.equal(report.meta.analysis.mode,'single-point');assert.equal(report.staff[0].name,'시험 사용자');assert.equal(report.notes,'현장 기록');
});
test('measurement date suggestions never replace a missing date with today and preserve date ranges',()=>{
  assert.equal(field.guessDate([{time:'10:00:00'}],weather.measurementMinute),'');
  assert.equal(field.guessDate([...points,{time:'10:00:00'}],weather.measurementMinute),'');
  assert.equal(field.guessDate(points,weather.measurementMinute),'2026. 6. 1.');
  assert.equal(field.guessDate([...points,{time:'2026-06-02 00:01:00'}],weather.measurementMinute),'2026. 6. 1. ~ 2026. 6. 2.');
  assert.equal(field.guessComplex('260601_테스트 일반.csv'),'테스트 일반산업단지');
});
test('mixed concentration units and per-species sample counts are retained',()=>{
  const report=field.buildModel({snapshot:{meta:{...meta,measurement:{...meta.measurement,type:'pm'}}},points:[{chem:{'PM2.5':12,NO2:.01}},{chem:{'PM2.5':14}}],chemicals:['NO2','PM2.5'],units:{'PM2.5':'µg/m³',NO2:'ppm'},fields});
  assert.deepEqual(report.stats.map(row=>row.chemical),['NO2','PM2.5']);
  assert.equal(report.stats.find(row=>row.chemical==='NO2').n,1);assert.equal(report.stats.find(row=>row.chemical==='NO2').sd,null);assert.equal(report.stats.find(row=>row.chemical==='PM2.5').unit,'µg/m³');
});
test('preview and OOXML escape inspection text and display a sample warning',()=>{
  const report=field.buildModel({snapshot:{meta:{...meta,sample:true}},points,chemicals:['Benzene'],units:{},fields:{...fields,notes:'<script>alert(1)</script> & "기록"\u0000'}});
  const html=field.preview(report,'data:image/png;base64,AA=='),xml=field.documentXml(report,{width:890,height:532});
  assert.ok(!html.includes('<script>'));assert.ok(!xml.includes('\u0000'));assert.match(xml,/&lt;script&gt;/);assert.match(html,/실제 관측 또는 점검 결과가 아닙니다/);assert.match(xml,/w:pStyle w:val="Title"/);
});
test('inspection preview and Word omit operational footers, wind provenance and analysis captions',()=>{
  const report=model(),outputs=[field.preview(report,'data:image/png;base64,AA=='),field.documentXml(report,{width:890,height:532})];
  for(const output of outputs)for(const text of ['조사 참고용','배출 기여율','분석 상태 기록','기상청 AWS','입력 260601','배경지도 미포함','같은 미리보기 상태','풍상 추적','상위 10% 기준'])assert.ok(!output.includes(text),text);
});
test('DOCX tables repeat headers and allow content growth while preserving map aspect ratio',()=>{
  const xml=field.documentXml(model(),{width:1000,height:500});
  assert.match(xml,/<w:tblHeader\/>/);assert.ok(!xml.includes('w:hRule="exact"'));assert.match(xml,/<w:pageBreakBefore\/>/);
  const [,x,y]=xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);assert.equal(Number(x)/Number(y),2);
  assert.match(xml,/N&lt;2/);assert.ok(!xml.includes('분석 상태 기록'));assert.ok(!xml.includes('조사 참고용'));assert.ok(!xml.includes('AWS #'));assert.ok(!xml.includes('배경지도 미포함'));
});
test('genuine Word ZIP contains internal image/style relationships and no external image reference',async()=>{
  const png=new Blob([Uint8Array.from([137,80,78,71])],{type:'image/png'}),files=field.files(model(),png,{width:890,height:532});
  const blob=await archive.zip(files,new Date(meta.createdISO),{allowFolders:true,type:field.mime}),bytes=new Uint8Array(await blob.arrayBuffer());
  assert.equal(blob.type,field.mime);assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
  const names=files.map(file=>file.name);assert.ok(names.includes('word/media/map.png'));assert.ok(names.includes('[Content_Types].xml'));
  const relationships=files.find(file=>file.name==='word/_rels/document.xml.rels').data;assert.match(relationships,/Target="media\/map.png"/);assert.ok(!relationships.includes('TargetMode="External"'));
});
test('OOXML folder support never permits traversal and default research ZIP still rejects directories',async()=>{
  for(const name of ['../x','word/../x','/word/x','word//x','word\\x',undefined])await assert.rejects(archive.zip([{name,data:'x'}],new Date(),{allowFolders:true}),/파일명/);
  await assert.rejects(archive.zip([{name:'word/document.xml',data:'x'}]),/파일명/);
});
