// Only representative coordinates are sent to Photon, never measurements or report text.
export const config={maxDuration:30};
const cache=new Map();let queue=Promise.resolve(),lastRequest=0,pending=0;
const streetOf=feature=>feature?.properties?.street||(feature?.properties?.osm_key==='highway'?feature.properties.name:'');
export function addressFromFeature(feature){
  const p=feature?.properties||{};
  if(p.countrycode&&p.countrycode.toUpperCase()!=='KR')return null;
  const clean=value=>typeof value==='string'?value.replace(/[\x00-\x1f<>]/g,'').trim().slice(0,100):'';
  const street=streetOf(feature);
  const parts=[p.state,p.county,p.city,p.district,p.locality,street,p.housenumber].map(clean).filter(Boolean);
  // A nearby POI/business name is not the measured point's address.
  return parts.length?[...new Set(parts)].join(' '):null;
}
export function chooseAddress(features,point){
  if(!Array.isArray(features))return null;
  const valid=features.filter(feature=>addressFromFeature(feature));
  const road=valid.find(feature=>streetOf(feature))||valid[0];if(!road)return null;
  const normalized=value=>String(value||'').replace(/\s+/g,'').toLowerCase();
  const street=normalized(streetOf(road));
  const distance=feature=>{
    const coordinates=feature.geometry?.coordinates;
    if(feature.geometry?.type!=='Point'||!Array.isArray(coordinates)||!Number.isFinite(coordinates[0])||!Number.isFinite(coordinates[1]))return Infinity;
    return Math.hypot((coordinates[1]-point.lat)*111320,(coordinates[0]-point.lon)*111320*Math.cos(point.lat*Math.PI/180));
  };
  // A road measurement has no building number itself: use only a nearby address on that same road.
  const houses=valid.filter(feature=>street&&normalized(streetOf(feature))===street&&/^\d+(?:-\d+)?$/.test(String(feature.properties.housenumber||''))&&distance(feature)<=75);
  houses.sort((a,b)=>distance(a)-distance(b));
  if(houses.length)return addressFromFeature(houses[0]);
  // Never assign a far-away building's number simply because it exists in the response.
  return addressFromFeature({...road,properties:{...road.properties,housenumber:undefined}});
}
async function lookup(point){
  const key=`${point.lat.toFixed(5)},${point.lon.toFixed(5)}`,hit=cache.get(key);
  if(hit&&hit.expires>Date.now())return hit.address;
  if(pending>=6)throw Error('busy');pending++;
  const job=queue.then(async()=>{
    const again=cache.get(key);if(again&&again.expires>Date.now())return again.address;
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,1100-(Date.now()-lastRequest))));lastRequest=Date.now();
    const url=new URL(process.env.MAMO_PHOTON_URL||'https://photon.komoot.io/reverse');if(url.protocol!=='https:')throw Error('provider');
    for(const [name,value] of Object.entries({lat:point.lat,lon:point.lon,limit:10,radius:0.15,lang:'default'}))url.searchParams.set(name,String(value));
    const response=await fetch(url,{headers:{'User-Agent':'MAMO-NIER field report (https://mamo-nier.vercel.app/)'},signal:AbortSignal.timeout(3500),redirect:'error'});
    if(!response.ok)throw Error('provider');
    const data=await response.json(),address=chooseAddress(data.features,point);
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
