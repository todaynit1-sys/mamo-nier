import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const archive = await fs.readFile(new URL('../src/research-archive.js',import.meta.url),'utf8');
const context=vm.createContext({TextEncoder,Blob});
vm.runInContext(archive,context);

test('ZIP uses standard UTF-8 headers and the published CRC32 check value',async()=>{
  const name='검증.txt',content='123456789';
  const blob=await context.MamoArchive.zip([{name,data:content}],new Date('2026-10-15T00:00:00Z'));
  const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
  assert.equal(blob.type,'application/zip');
  assert.equal(view.getUint32(0,true),0x04034b50);
  assert.equal(view.getUint16(6,true),0x800); // UTF-8 filename flag
  assert.equal(view.getUint16(8,true),0); // STORE method
  assert.equal(view.getUint32(14,true),0xcbf43926); // ISO CRC32 check for 123456789
  const nameSize=view.getUint16(26,true);
  assert.equal(new TextDecoder().decode(bytes.slice(30,30+nameSize)),name);
  assert.equal(new TextDecoder().decode(bytes.slice(30+nameSize,39+nameSize)),content);
  const end=bytes.length-22,central=view.getUint32(end+16,true);
  assert.equal(view.getUint32(central,true),0x02014b50);
  assert.equal(view.getUint32(central+16,true),0xcbf43926);
  assert.equal(view.getUint32(central+42,true),0);
  assert.equal(view.getUint32(end,true),0x06054b50);
  assert.equal(view.getUint16(end+10,true),1);
});

test('ZIP keeps binary bytes and empty files',async()=>{
  const payload=new Uint8Array([0,1,128,255]);
  const zip=await context.MamoArchive.zip([{name:'a.bin',data:new Blob([payload])},{name:'empty',data:''}]);
  const bytes=new Uint8Array(await zip.arrayBuffer());
  assert.deepEqual(bytes.slice(35,39),payload);
  assert.equal(new DataView(bytes.buffer).getUint16(bytes.length-12,true),2);
});

test('ZIP rejects traversal, invalid names and duplicate entries',async()=>{
  for(const name of ['../escape','a/b','a\\b','..','.','\0','']) await assert.rejects(context.MamoArchive.zip([{name,data:'x'}]));
  await assert.rejects(context.MamoArchive.zip([{name:'same',data:'a'},{name:'same',data:'b'}]));
});

test('measurement CSV uses captured units after live state changes',async()=>{
  const source=await fs.readFile(new URL('../src/research.js',import.meta.url),'utf8');
  const csvFunction=source.match(/  function csv\(rows\)[^\n]+/)[0];
  const pointFunction=source.match(/  function pointCsv\(snapshot\)[^\n]+/)[0];
  const scope=vm.createContext({S:{units:{Benzene:'ppm'}}});
  vm.runInContext(csvFunction+'\n'+pointFunction,scope);
  const snapshot={units:{Benzene:'ppb'},meta:{sample:false,measurement:{component:'Benzene',unit:'ppb'}},points:[{id:1,time:'10:00',lat:37,lon:127,chem:{Benzene:2},value:2,tvoc:2,appliedWind:{wd:270,ws:2}}]};
  const output=scope.pointCsv(snapshot);
  assert.match(output,/Benzene \(ppb\)/);
  assert.doesNotMatch(output,/Benzene \(ppm\)/);
});
