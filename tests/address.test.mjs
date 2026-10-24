import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler,{addressFromFeature,chooseAddress} from '../api/address.js';

function response(){return {statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};}
test('address labels contain address components and never substitute a nearby business name',()=>{
  assert.equal(addressFromFeature({properties:{state:'경기도',city:'시험시',district:'검증동',street:'테스트로',housenumber:'12',name:'옆 사업장'}}),'경기도 시험시 검증동 테스트로 12');
  assert.equal(addressFromFeature({properties:{name:'옆 사업장'}}),null);
  assert.equal(addressFromFeature({properties:{countrycode:'JP',city:'Tokyo'}}),null);
});
test('reverse lookup prefers the closest numbered address on the same road, with safe street-only fallback',()=>{
  const point={lat:37.1,lon:127.1};
  const feature=(street,number,lat=37.1001,lon=127.1)=>({properties:{state:'경기도',city:'시험시',street,housenumber:number},geometry:{type:'Point',coordinates:[lon,lat]}});
  const road=feature('만세로',undefined),house=feature('만세로','123-4');
  assert.equal(chooseAddress([road,feature('만세로','125',37.1004),house],point),'경기도 시험시 만세로 123-4');
  assert.equal(chooseAddress([road,feature('다른길','55'),feature('만세로','999',37.102)],point),'경기도 시험시 만세로');
  assert.equal(chooseAddress([feature('만세로','999',37.102)],point),'경기도 시험시 만세로');
  assert.equal(chooseAddress([{properties:{state:'경기도',city:'시험시'}},house],point),'경기도 시험시 만세로 123-4');
  assert.equal(chooseAddress([{...house,geometry:undefined}],point),'경기도 시험시 만세로');
  assert.equal(chooseAddress([],point),null);
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
test('the server requests multiple address candidates and returns a nearby building number',async t=>{
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url.searchParams.get('limit'),'10');
    assert.equal(url.searchParams.get('radius'),'0.15');
    return {ok:true,json:async()=>({features:[{properties:{street:'만세로',state:'경기도',city:'시험시'}},{properties:{street:'만세로',housenumber:'123',state:'경기도',city:'시험시'},geometry:{type:'Point',coordinates:[127.12,37.1201]}}]})};
  });
  const res=response();await handler({method:'POST',body:{points:[{lat:37.12,lon:127.12}]}},res);
  assert.equal(res.statusCode,200);assert.deepEqual(res.body.addresses,['경기도 시험시 만세로 123']);
});
