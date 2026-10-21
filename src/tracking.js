/* Local investigation bounds, not a calibrated dispersion model. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MamoTracking=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const rad=Math.PI/180,metresLat=111320;
  const sigmaByStability={A:25,B:20,C:15,D:10,E:7.5,F:5};
  const defaults={minutes:2,maxDistanceM:500,calmBelowMs:.5};
  function parameters({wd,ws,stability='D',auto=true,minutes=2,distanceM=300,maxDistanceM=500}){
    if(!Number.isFinite(wd)||wd<0||wd>360||!Number.isFinite(ws)||ws<defaults.calmBelowMs)return null;
    const limit=Math.min(1500,Math.max(50,Number(maxDistanceM)||500));
    const requested=auto?ws*Math.min(15,Math.max(1,Number(minutes)||2))*60:Number(distanceM);
    const R=Math.round(Math.min(limit,Math.max(50,Number.isFinite(requested)?requested:300)));
    const factor=auto?Math.max(.7,Math.min(2.5,(2/ws)**.35)):1;
    const sig=Math.min(45,(sigmaByStability[stability]||10)*factor);
    return {wd:wd%360,ws,sig,half:Math.min(85,2*sig),R,requestedDistanceM:requested,capped:requested>limit};
  }
  function offset(p,target){const east=(target.lon-p.lon)*metresLat*Math.cos(p.lat*rad),north=(target.lat-p.lat)*metresLat;return {east,north};}
  function match(cone,facility){
    const {east,north}=offset(cone.p,facility),dist=Math.hypot(east,north);
    if(dist<5||dist>cone.R+1e-7)return null;
    const bearing=(Math.atan2(east,north)/rad+360)%360,diff=Math.abs((bearing-cone.wd+540)%360-180);
    if(diff>cone.half+1e-7)return null;
    return {dist,bearing,score:Math.exp(-.5*(diff/cone.sig)**2)*(1-.5*dist/cone.R)};
  }
  function point(p,wd,x,y){const angle=wd*rad;return [p.lat+(x*Math.cos(angle)-y*Math.sin(angle))/metresLat,p.lon+(x*Math.sin(angle)+y*Math.cos(angle))/(metresLat*Math.cos(p.lat*rad))];}
  function polygon(cone,{shape='plume',fraction=1}={}){
    const {p,wd,R,half}=cone;
    if(shape==='wedge'){
      const radius=R*fraction,result=[[p.lat,p.lon]],steps=Math.max(8,Math.ceil(2*half/2));
      for(let i=0;i<=steps;i++)result.push(point(p,wd-half+2*half*i/steps,radius,0));
      result.push([p.lat,p.lon]);return result;
    }
    // The outer contour uses the same angular boundary and radius as candidate matching.
    // Inner contours remain visual bands; they do not change the candidate search.
    const angle=Math.atan(Math.tan(half*rad)*fraction)/rad,result=[[p.lat,p.lon]];
    result.push(point(p,wd,R*Math.cos(angle*rad),-R*Math.sin(angle*rad)));
    const steps=Math.max(12,Math.ceil(2*angle/2));
    for(let i=1;i<=steps;i++){const theta=(-angle+2*angle*i/steps)*rad;result.push(point(p,wd,R*Math.cos(theta),R*Math.sin(theta)));}
    result.push([p.lat,p.lon]);return result;
  }
  return {defaults,parameters,match,polygon,point};
});
