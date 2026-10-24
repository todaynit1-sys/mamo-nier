import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler,{addressFromFeature} from '../api/address.js';

function response(){return {statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};}
test('address labels contain address components and never substitute a nearby business name',()=>{
  assert.equal(addressFromFeature({properties:{state:'경기도',city:'시험시',district:'검증동',street:'테스트로',housenumber:'12',name:'옆 사업장'}}),'경기도 시험시 검증동 테스트로 12');
  assert.equal(addressFromFeature({properties:{name:'옆 사업장'}}),null);
  assert.equal(addressFromFeature({properties:{countrycode:'JP',city:'Tokyo'}}),null);
});
test('address endpoint rejects arbitrary forwarding, excessive points and report text before network access',async()=>{
  for(const body of [{url:'https://example.com'}, {points:Array(4).fill({lat:37,lon:127})},{points:[{lat:0,lon:0}]},{points:[{lat:37,lon:127,value:100}]},{points:[{lat:37,lon:127}],notes:'private'}]){
    const res=response();await handler({method:'POST',body},res);assert.equal(res.statusCode,400);
  }
  const res=response();await handler({method:'GET'},res);assert.equal(res.statusCode,405);assert.equal(res.headers['Cache-Control'],'no-store');
});
test('provider failures return an explicit missing address rather than a fabricated label',async t=>{
  t.mock.method(globalThis,'fetch',async()=>({ok:false}));
  const res=response();await handler({method:'POST',body:{points:[{lat:37.12345,lon:127.12345}]}},res);
  assert.equal(res.statusCode,200);assert.deepEqual(res.body.addresses,[null]);assert.ok(!JSON.stringify(res.body).includes('37.12345'));
});
