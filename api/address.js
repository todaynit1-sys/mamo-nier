// Only representative coordinates are sent to Photon, never measurements or report text.
export const config={maxDuration:30};
const cache=new Map();let queue=Promise.resolve(),lastRequest=0,pending=0;
export function addressFromFeature(feature){
  const p=feature?.properties||{};
  if(p.countrycode&&p.countrycode.toUpperCase()!=='KR')return null;
  const clean=value=>typeof value==='string'?value.replace(/[\x00-\x1f<>]/g,'').trim().slice(0,100):'';
  const street=p.street||(p.osm_key==='highway'?p.name:'');
  const parts=[p.state,p.county,p.city,p.district,p.locality,street,p.housenumber].map(clean).filter(Boolean);
  // A nearby POI/business name is not the measured point's address.
  return parts.length?[...new Set(parts)].join(' '):null;
}
async function lookup(point){
  const key=`${point.lat.toFixed(5)},${point.lon.toFixed(5)}`,hit=cache.get(key);
  if(hit&&hit.expires>Date.now())return hit.address;
  if(pending>=6)throw Error('busy');pending++;
  const job=queue.then(async()=>{
    const again=cache.get(key);if(again&&again.expires>Date.now())return again.address;
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,1100-(Date.now()-lastRequest))));lastRequest=Date.now();
    const url=new URL(process.env.MAMO_PHOTON_URL||'https://photon.komoot.io/reverse');if(url.protocol!=='https:')throw Error('provider');
    for(const [name,value] of Object.entries({lat:point.lat,lon:point.lon,limit:1,radius:0.15,lang:'default'}))url.searchParams.set(name,String(value));
    const response=await fetch(url,{headers:{'User-Agent':'MAMO-NIER field report (https://mamo-nier.vercel.app/)'},signal:AbortSignal.timeout(3500),redirect:'error'});
    if(!response.ok)throw Error('provider');
    const data=await response.json(),address=addressFromFeature(data.features?.[0]);
    if(cache.size>=300)cache.delete(cache.keys().next().value);
    cache.set(key,{address,expires:Date.now()+86400000});return address;
  });queue=job.catch(()=>{});try{return await job;}finally{pending--;}
}
export default async function handler(req,res){
  const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
  if(req.method!=='POST'){res.setHeader('Allow','POST');send(405,{ok:false});return;}
  let body;
  try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||Object.keys(body).some(k=>k!=='points')||!Array.isArray(body.points)||!body.points.length||body.points.length>3||body.points.some(p=>!p||Object.keys(p).some(k=>!['lat','lon'].includes(k))||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||p.lat<32||p.lat>40||p.lon<124||p.lon>132))throw Error();}
  catch{send(400,{ok:false});return;}
  const addresses=[];
  for(const point of body.points){try{addresses.push(await lookup(point));}catch{addresses.push(null);}}
  send(200,{ok:true,addresses,source:'Photon · © OpenStreetMap contributors'});
}
