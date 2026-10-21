import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler,{verifyInstitution} from '../api/institution.js';
import {createRequire} from 'node:module';
const institution=createRequire(import.meta.url)('../src/institution-access.js');

test('server accepts normalized synthetic credentials and fails closed for missing configuration',()=>{
  const config=JSON.stringify({'example-capital-code':'capital','example-other-code':'hangang'});
  assert.equal(verifyInstitution(' EXAMPLE-CAPITAL-CODE ',config).profile.department,'수도권대기환경청');
  for(const code of ['',null,undefined,'invalid','toString','__proto__','constructor'])assert.equal(verifyInstitution(code,config).profile,null);
  for(const config of ['',null,'{}','[]','{bad','{"example":"unknown"}'])assert.equal(verifyInstitution('example',config).configured,false);
});
test('capital office supplies the two requested fixed report staff rows',()=>{
  const profile=institution.profile('capital');assert.equal(profile.fixedStaff,true);
  assert.deepEqual(profile.staff,[{grade:'환경연구사',name:'신현준'},{grade:'전문연구원',name:'서현정'}]);
});
test('other offices fix only affiliation and leave both grades and names empty',()=>{
  const expected={science:'국립환경과학원',hangang:'한강유역환경청',wonju:'원주지방환경청',daegu:'대구지방환경청',nakdong:'낙동강유역환경청',yeongsan:'영산강유역환경청',jeonbuk:'전북지방환경청',geumgang:'금강유역환경청'};
  for(const [code,department] of Object.entries(expected)){const profile=institution.profile(code);assert.equal(profile.department,department);assert.equal(profile.fixedStaff,false);assert.deepEqual(profile.staff,[{grade:'',name:''},{grade:'',name:''}]);}
});
test('returned profiles cannot leak edited staff into a later login',()=>{
  const first=institution.profile('capital');first.staff[0].name='수정';first.department='수정';
  assert.equal(institution.profile('capital').staff[0].name,'신현준');assert.equal(institution.profile('capital').department,'수도권대기환경청');
  const other=institution.profile('hangang');other.staff[0].name='다른 사용자';assert.equal(institution.profile('hangang').staff[0].name,'');
});

test('server route returns only the profile and never code configuration or cacheable responses',async()=>{
  const before=process.env.MAMO_INSTITUTION_CODES;process.env.MAMO_INSTITUTION_CODES=JSON.stringify({'test-only-secret-value':'capital'});
  async function request(method,body){const headers={};let payload;const response={setHeader(key,value){headers[key]=value;},end(value){payload=JSON.parse(value);}};await handler({method,body},response);return {status:response.statusCode,headers,payload};}
  try{
    const success=await request('POST',{code:'test-only-secret-value'});assert.equal(success.status,200);assert.equal(success.headers['Cache-Control'],'no-store');assert.equal(success.payload.profile.department,'수도권대기환경청');assert.ok(!JSON.stringify(success.payload).includes('test-only-secret-value'));
    assert.equal((await request('GET',null)).status,405);assert.equal((await request('POST',{code:'wrong'})).status,401);assert.equal((await request('POST',{code:123})).status,400);assert.equal((await request('POST',{code:'x',url:'https://example.com'})).status,400);
    delete process.env.MAMO_INSTITUTION_CODES;assert.equal((await request('POST',{code:'test'})).status,503);
  }finally{if(before===undefined)delete process.env.MAMO_INSTITUTION_CODES;else process.env.MAMO_INSTITUTION_CODES=before;}
});
