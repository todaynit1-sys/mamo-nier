import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const tracking=createRequire(import.meta.url)('../src/tracking.js');
const origin={lat:37.2,lon:126.8};
const facility=(wd,distance)=>{const [lat,lon]=tracking.point(origin,wd,distance,0);return {lat,lon};};

test('local investigation defaults to two minutes and a 500m ceiling, with explicit wider search available',()=>{
  assert.equal(tracking.parameters({wd:270,ws:2}).R,240);
  assert.equal(tracking.parameters({wd:270,ws:8}).R,500);
  assert.equal(tracking.parameters({wd:270,ws:8}).capped,true);
  assert.equal(tracking.parameters({wd:270,ws:8,minutes:5,maxDistanceM:1500}).R,1500);
  assert.equal(tracking.parameters({wd:270,ws:2,auto:false,distanceM:1000}).R,500);
  assert.equal(tracking.parameters({wd:270,ws:2,auto:false,distanceM:1000,maxDistanceM:1500}).R,1000);
});
test('calm, missing and invalid winds do not produce directional candidates',()=>{
  for(const ws of [0,.49,-1,null,undefined,NaN,Infinity])assert.equal(tracking.parameters({wd:270,ws}),null);
  for(const wd of [null,undefined,NaN,-1,361])assert.equal(tracking.parameters({wd,ws:2}),null);
  assert.ok(tracking.parameters({wd:360,ws:.5}));
});
test('candidate selection rejects downwind, off-angle and outside-radius facilities and wraps north correctly',()=>{
  const cone={p:origin,...tracking.parameters({wd:355,ws:2})};
  assert.ok(tracking.match(cone,facility(2,100)));
  assert.equal(tracking.match(cone,facility(175,100)),null);
  assert.equal(tracking.match(cone,facility(355,cone.R+1)),null);
  assert.equal(tracking.match(cone,facility(355+cone.half+1,100)),null);
  assert.ok(tracking.match(cone,facility(355+cone.half-.01,100)));
});
test('every plotted boundary stays inside the candidate radius for all stabilities, winds, shapes and visual bands',()=>{
  for(const stability of ['A','B','C','D','E','F'])for(const ws of [.5,1,2,8])for(const shape of ['plume','wedge'])for(const fraction of [1,.66,.33]){
    const cone={p:origin,...tracking.parameters({wd:47,ws,stability})};
    for(const [lat,lon] of tracking.polygon(cone,{shape,fraction})){
      const east=(lon-origin.lon)*111320*Math.cos(origin.lat*Math.PI/180),north=(lat-origin.lat)*111320;
      assert.ok(Math.hypot(east,north)<=cone.R+1e-6);
      if(fraction===1&&Math.hypot(east,north)>5)assert.ok(tracking.match(cone,{lat,lon}));
    }
  }
});
