import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
const data=JSON.parse(html.match(/<script id="facData" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const manifest=JSON.parse(await fs.readFile(new URL('../docs/gyeonggi-facilities-manifest.json',import.meta.url),'utf8'));
const context=vm.createContext({});vm.runInContext(await fs.readFile(new URL('../src/facility-data.js',import.meta.url),'utf8'),context);

test('embedded Gyeonggi data reconciles every source row and uses sane WGS84 coordinates',()=>{
  assert.deepEqual(JSON.parse(html.match(/<script id="facilityProvenance" type="application\/json">([\s\S]*?)<\/script>/)[1]),manifest);
  const s=manifest.statistics,rows=data['경기'];
  assert.equal(rows.length,17966);
  assert.equal(manifest.province.rows,rows.length+s.duplicateRowsRemoved+s.excludedRows);
  assert.equal(rows.filter(r=>r[6][0]==='mois').length,59);
  assert.equal(new Set(rows.map(r=>JSON.stringify(r.slice(0,6)))).size,rows.length);
  for(const r of rows){assert.ok(r[1]>=36.8&&r[1]<=38.35&&r[2]>=126.3&&r[2]<=127.95);assert.match(r[3],/^[1-5]종$/);assert.ok(r[6][1]>=2);}
  assert.equal(manifest.dataDate,null);
});

test('large known source differences preserve province coordinates and flag uncertainty',()=>{
  const row=data['경기'].find(r=>r[0]==='주화산업'&&r[1]===37.05377622);
  assert.equal(row[2],126.9112838);assert.ok(row[6][3]>3800);
  const description=context.MamoFacilities.describe(row,manifest);
  assert.equal(description.coordinateSource,'gg');assert.match(description.acc,/현장 확인 필요/);assert.match(description.acc,/정확도 미검증/);
  const restored=data['경기'].find(r=>r[6][0]==='mois');
  assert.match(context.MamoFacilities.describe(restored,manifest).acc,/5174→4326/);
});

test('candidate CSV carries the location source and original row references',async()=>{
  const source=await fs.readFile(new URL('../src/research.js',import.meta.url),'utf8');
  const scope=vm.createContext({});vm.runInContext(source.match(/  function csv\(rows\)[^\n]+/)[0]+'\n'+source.match(/  function candidateCsv\(snapshot\)[^\n]+/)[0],scope);
  const out=scope.candidateCsv({meta:{sample:false,analysis:{mode:'single-point',metric:'concentration'},measurement:{unit:'ppb'}},candidates:[{rank:1,facility:{name:'검증',src:'경기도청',provinceRow:100,moisRow:null,sourceCoordinateDifferenceM:123.4,datasetAppliedDate:'2026-10-15'}}]});
  assert.match(out,/사업장 좌표 출처/);assert.match(out,/"경기도청","100","","123\.4","2026-10-15"/);
});
