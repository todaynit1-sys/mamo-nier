import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const source=await fs.readFile(new URL('../src/ofp.js',import.meta.url),'utf8');
const context=vm.createContext({});vm.runInContext(source,context);const ofp=context.MamoOfp;

test('MIR catalog retains all 41 pinned mamo-oz coefficient values',()=>{
  assert.equal(Object.keys(ofp.MIR).length,41);
  assert.equal(ofp.MIR.benzene,.72);assert.equal(ofp.MIR.toluene,4);
  assert.equal(ofp.MIR['ethylbenzene+xylene'],7.8);
  assert.equal(ofp.source.commit,'7e8ce1c72bf43093257cde0cbb8c0776a8d64149');
  assert.equal(createHash('sha256').update(JSON.stringify(ofp.MIR)).digest('hex'),'a8f9d8817c73fb50caefbd9989c5c4a123b3f71f0462dbf4839305ba382de8fc');
});
test('relative OFP equals the explicit ppb × MIR sum and excludes TVOC/unknowns',()=>{
  const result=ofp.analyze([{}],['Benzene','Toluene','TVOC','Unknown'],{},[{Benzene:10,Toluene:20,TVOC:999,Unknown:100}]);
  assert.equal(result.includedCount,2);assert.equal(result.results[0].value,87.2);
  const contributions=ofp.contributionSummary(result.results);
  assert.equal(contributions[0].chemical,'Toluene');assert.equal(contributions[0].mean,80);
  assert.ok(Math.abs(contributions.reduce((sum,row)=>sum+row.sharePercent,0)-100)<1e-10);
});
test('blank, malformed, negative and unaligned records are excluded rather than zero-filled',()=>{
  const raw=[{Benzene:''},{Benzene:'1x'},{Benzene:-2},{Benzene:'0'},{Benzene:'1e1'}];
  const result=ofp.analyze(raw.map(()=>({})),['Benzene'],{},raw);
  assert.deepEqual(Array.from(result.results,r=>r.value),[null,null,null,0,7.199999999999999]);
  assert.equal(result.validCount,2);assert.equal(result.excludedPointCount,3);
  assert.equal(ofp.analyze([{}],['Benzene'],{},[]).validCount,0);
});
test('matching tolerates case/spacing but does not assign group coefficients to individual isomers',()=>{
  assert.equal(ofp.match(['  Ethene + Ethane  '],{})[0].mir,5.4);
  assert.equal(ofp.match(['1,3-butadiene'],{})[0].mir,12.61);
  for(const name of ['ethylbenzene','m-xylene','p-xylene','trimethylbenzene','TVOC'])assert.equal(ofp.match([name],{})[0].status,'계수 미등록');
  assert.equal(ofp.match(['Benzene'],{Benzene:'ppm'})[0].status,'ppb 단위 아님');
  assert.equal(ofp.match(['Benzene','benzene'],{}).filter(row=>row.status==='포함').length,0);
});
test('zero values remain valid and an absent match cannot become a false zero OFP',()=>{
  const zero=ofp.analyze([{}],['Benzene'],{},[{Benzene:0}]);
  assert.equal(zero.results[0].value,0);assert.equal(ofp.contributionSummary(zero.results)[0].sharePercent,null);
  assert.equal(ofp.analyze([{}],['TVOC'],{},[{TVOC:5}]).results[0].value,null);
});

test('OFP CSV records excluded point totals as blank and retains coefficient evidence',async()=>{
  const ui=await fs.readFile(new URL('../src/research.js',import.meta.url),'utf8');
  const csv=ui.match(/  function csv\(rows\)[^\n]+/)[0],exporter=ui.match(/  function ofpCsv\(snapshot\)[^\n]+/)[0];
  const scope=vm.createContext({});vm.runInContext(csv+'\n'+exporter,scope);
  const dataset=ofp.analyze([{},{}],['Benzene','Toluene'],{},[{Benzene:10,Toluene:20},{Benzene:'',Toluene:20}]);
  const snapshot={meta:{sample:false,ofp:{mapping:dataset.mapping}},ofpPoints:dataset.results.map((result,i)=>({id:i+1,time:'10:00',lat:37,lon:127,ofp:result}))};
  const rows=scope.ofpCsv(snapshot).split('\r\n');
  assert.equal(rows.length,5);
  assert.ok(rows[1].includes('"benzene","0.72","10","7.199999999999999","87.2","예"'));
  assert.ok(rows[3].includes('"benzene","0.72","","","","아니오"'));
  assert.ok(rows[4].includes('"toluene","4","20","80","","아니오"'));
});
