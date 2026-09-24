/**
 * Local pixel-art finishing. Independent implementation inspired by region
 * abstraction and contrast-aware downscaling; not a neural/semantic redraw.
 * See docs/pixel-studio-research.md for references and limitations.
 */
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const SRGB = Float32Array.from({length:256}, (_, i) => { const v=i/255; return v<=.04045?v/12.92:((v+.055)/1.055)**2.4; });
export function rgbToLab(r,g,b) {
  const R=SRGB[clamp(Math.round(r),0,255)], G=SRGB[clamp(Math.round(g),0,255)], B=SRGB[clamp(Math.round(b),0,255)];
  const l=Math.cbrt(.4122214708*R+.5363325363*G+.0514459929*B);
  const m=Math.cbrt(.2119034982*R+.6806995451*G+.1073969566*B);
  const s=Math.cbrt(.0883024619*R+.2817188376*G+.6299787005*B);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
const dist = (a,b) => (a[0]-b[0])**2*1.3+(a[1]-b[1])**2+(a[2]-b[2])**2;
const FIXED = {
  pico8:['000000','1d2b53','7e2553','008751','ab5236','5f574f','c2c3c7','fff1e8','ff004d','ffa300','ffec27','00e436','29adff','83769c','ff77a8','ffccaa'],
  gameboy:['0f380f','306230','8bac0f','9bbc0f']
};
function normalize(image, options) {
  if(!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width<1 || image.height<1 || image.width*image.height>32e6 || !image.data || image.data.length!==image.width*image.height*4) throw new Error('画像の寸法または画素データが不正です。');
  const o={...options};
  o.style=o.style==='dither'?'dither':'illustration';
  o.size=Math.round(clamp(finite(o.size,128),16,o.style==='dither'?640:256));
  o.colors=Math.round(clamp(finite(o.colors,24),2,64));
  o.detail=clamp(finite(o.detail,.5));o.simplify=clamp(finite(o.simplify,.5));o.outline=clamp(finite(o.outline,.25));
  o.exposure=clamp(finite(o.exposure,0),-2,2);o.contrast=clamp(finite(o.contrast,0),-1,1);o.saturation=clamp(finite(o.saturation,0),-1,1);
  o.palette=['auto','grayscale','pico8','gameboy'].includes(o.palette)?o.palette:'auto';
  return o;
}
function adjusted(rgb,o) {
  const gain=2**o.exposure;
  let [r,g,b]=rgb.map(v=>v/255*gain);
  const l=.2126*r+.7152*g+.0722*b, saturation=1+o.saturation;
  r=l+(r-l)*saturation;g=l+(g-l)*saturation;b=l+(b-l)*saturation;
  const contrast=1+o.contrast*.8;
  return [r,g,b].map(v=>Math.round(clamp((v-.5)*contrast+.5)*255));
}
/** Build a bounded analysis raster using real source samples, not Canvas averaging. */
function analysisRaster(image,w,h,o) {
  const data=new Uint8ClampedArray(w*h*4), lab=new Float32Array(w*h*3);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const sx=Math.min(image.width-1,Math.floor((x+.5)*image.width/w)), sy=Math.min(image.height-1,Math.floor((y+.5)*image.height/h));
    const p=(sy*image.width+sx)*4, q=(y*w+x)*4;
    const a=image.data[p+3]/255;
    const rgb=adjusted([0,1,2].map(c=>image.data[p+c]*a+255*(1-a)),o);
    data.set([...rgb,255],q);lab.set(rgbToLab(...rgb),(y*w+x)*3);
  }
  return {data,lab,w,h};
}
function distanceAt(lab,p,q) {
  return (lab[p]-lab[q])**2*1.3+(lab[p+1]-lab[q+1])**2+(lab[p+2]-lab[q+2])**2;
}
/** Edge-guided medoid: a real sample from a coherent quadrant, never a blended boundary color. */
function sampleRegions(a,w,h,o) {
  const data=new Uint8ClampedArray(w*h*4), labs=new Float32Array(w*h*3);
  const radius=o.simplify<.05?0:Math.ceil(o.simplify*3), ratioX=a.w/w,ratioY=a.h/h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const cx=Math.min(a.w-1,Math.floor((x+.5)*ratioX)),cy=Math.min(a.h-1,Math.floor((y+.5)*ratioY)),center=(cy*a.w+cx);
    let chosen=center;
    if(radius) {
      let best=Infinity;
      // Four overlapping quadrants. Variance selects a surface; center agreement
      // protects small high-contrast features (eyes, lettering, silhouettes).
      for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const ids=[],sum=[0,0,0],sq=[0,0,0];
        for(let yy=0;yy<=radius;yy++)for(let xx=0;xx<=radius;xx++) {
          const q=clamp(cy+yy*dy,0,a.h-1)*a.w+clamp(cx+xx*dx,0,a.w-1),j=q*3;ids.push(q);
          for(let c=0;c<3;c++){sum[c]+=a.lab[j+c];sq[c]+=a.lab[j+c]**2;}
        }
        const mean=sum.map(v=>v/ids.length);
        const variance=sq.reduce((v,n,c)=>v+Math.max(0,n/ids.length-mean[c]**2)*(c===0?1.3:1),0);
        const source=[a.lab[center*3],a.lab[center*3+1],a.lab[center*3+2]];
        const cost=variance+dist(mean,source)*(.4+o.detail*2);
        if(cost<best){
          let md=Infinity,rep=center;
          for(const id of ids){
            const j=id*3,d=dist(mean,[a.lab[j],a.lab[j+1],a.lab[j+2]])+distanceAt(a.lab,j,center*3)*.05;
            if(d<md){md=d;rep=id;}
          }
          const disagreement=distanceAt(a.lab,rep*3,center*3);
          // Never replace an isolated dark/light accent with its surrounding mean.
          chosen=disagreement>.008+(1-o.detail)*.008?center:rep;best=cost;
        }
      }
    }
    data.set(a.data.subarray(chosen*4,chosen*4+4),(y*w+x)*4);
    labs.set(a.lab.subarray(chosen*3,chosen*3+3),(y*w+x)*3);
  }
  return {data,lab:labs,w,h};
}
function histogram(a) {
  const buckets=new Map(),{data,lab,w,h}=a;
  for(let i=0;i<w*h;i++){
    const p=i*4,key=(data[p]>>3)<<10|(data[p+1]>>3)<<5|(data[p+2]>>3);
    let edge=0;
    if(i%w+1<w)edge=Math.max(edge,distanceAt(lab,i*3,(i+1)*3));
    if(i+w<w*h)edge=Math.max(edge,distanceAt(lab,i*3,(i+w)*3));
    const weight=1+Math.min(2,Math.sqrt(edge)*6), item=buckets.get(key);
    if(item){item.weight+=weight;item.count++;}
    else buckets.set(key,{rgb:Array.from(data.subarray(p,p+3)),lab:Array.from(lab.subarray(i*3,i*3+3)),weight,count:1});
  }
  return [...buckets.values()];
}
/** Deterministic, edge-weighted OKLab k-means with palette medoids. */
export function makePalette(a,count) {
  const items=histogram(a);
  if(items.length<=count)return items.map(v=>v.rgb).sort((a,b)=>rgbToLab(...a)[0]-rgbToLab(...b)[0]);
  let first=items.reduce((p,c)=>c.weight>p.weight?c:p), centers=[first.lab.slice()];
  const nearest=new Float64Array(items.length).fill(Infinity);
  while(centers.length<count){
    let candidate=0,score=-1;
    for(let i=0;i<items.length;i++){
      nearest[i]=Math.min(nearest[i],dist(items[i].lab,centers.at(-1)));
      const value=nearest[i]*Math.sqrt(items[i].weight);
      if(value>score){score=value;candidate=i;}
    }
    if(score<1e-12)break;
    centers.push(items[candidate].lab.slice());
  }
  const labels=new Uint8Array(items.length);
  for(let iter=0;iter<9;iter++){
    const sums=centers.map(()=>[0,0,0,0]);
    for(let i=0;i<items.length;i++){
      let nearest=0,min=Infinity;
      for(let k=0;k<centers.length;k++){const d=dist(items[i].lab,centers[k]);if(d<min){min=d;nearest=k;}}
      labels[i]=nearest;const weight=Math.sqrt(items[i].weight);
      for(let c=0;c<3;c++)sums[nearest][c]+=items[i].lab[c]*weight;sums[nearest][3]+=weight;
    }
    for(let k=0;k<centers.length;k++)if(sums[k][3])centers[k]=sums[k].slice(0,3).map(v=>v/sums[k][3]);
  }
  const palette=[];
  for(let k=0;k<centers.length;k++){
    let min=Infinity,best=null;
    for(let i=0;i<items.length;i++)if(labels[i]===k){const d=dist(items[i].lab,centers[k]);if(d<min){min=d;best=items[i].rgb;}}
    if(best&&!palette.some(c=>c.every((v,i)=>v===best[i])))palette.push(best);
  }
  return palette.sort((a,b)=>rgbToLab(...a)[0]-rgbToLab(...b)[0]);
}
function paletteFor(a,o){
  if(FIXED[o.palette]){
    const full=FIXED[o.palette].map(hex=>[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)));
    if(full.length<=o.colors)return full;
    const labs=full.map(rgb=>rgbToLab(...rgb)),counts=new Float64Array(full.length);
    for(const item of histogram(a)){
      let best=0,min=Infinity;
      for(let k=0;k<labs.length;k++){const d=dist(item.lab,labs[k]);if(d<min){min=d;best=k;}}
      counts[best]+=item.weight;
    }
    return full.map((rgb,i)=>({rgb,i})).sort((a,b)=>counts[b.i]-counts[a.i]||a.i-b.i).slice(0,o.colors).sort((a,b)=>a.i-b.i).map(v=>v.rgb);
  }
  if(o.palette==='grayscale')return Array.from({length:o.colors},(_,i)=>Array(3).fill(Math.round(i*255/(o.colors-1))));
  return makePalette(a,o.colors);
}
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
function assign(a,palette,o){
  const labs=palette.map(v=>rgbToLab(...v)),indices=new Uint8Array(a.w*a.h);
  for(let i=0;i<indices.length;i++){
    let source=Array.from(a.lab.subarray(i*3,i*3+3));
    if(o.palette==='grayscale')source=[source[0],0,0];
    let best=0,second=0,d1=Infinity,d2=Infinity;
    for(let k=0;k<labs.length;k++){const d=dist(source,labs[k]);if(d<d1){second=best;d2=d1;best=k;d1=d;}else if(d<d2){second=k;d2=d;}}
    if(o.style==='dither'&&best!==second){
      // Canonical pair order prevents a Bayer phase inversion when nearest
      // and second-nearest swap around the midpoint.
      const low=Math.min(best,second),high=Math.max(best,second);
      const A=labs[low],B=labs[high],v=B.map((n,c)=>n-A[c]),length=dist(A,B);
      const t=clamp(((source[0]-A[0])*v[0]*1.3+(source[1]-A[1])*v[1]+(source[2]-A[2])*v[2])/Math.max(length,1e-10));
      const projected=A.map((n,c)=>n+v[c]*t);
      if(dist(projected,source)<d1*.97)best=t>(BAYER[((Math.floor(i/a.w)&3)<<2)|(i%a.w&3)]+.5)/16?high:low;
    }
    indices[i]=best;
  }
  if(o.style==='illustration'){
    // Single deterministic regularization sweep: only exchange near-equivalent
    // palette labels in smooth regions. Strong thin details are protected.
    const original=indices.slice(),strength=o.simplify*.0009;
    for(let y=1;y<a.h-1;y++)for(let x=1;x<a.w-1;x++){
      const i=y*a.w+x,neighbors=[i-1,i+1,i-a.w,i+a.w];
      let edge=0;for(const j of neighbors)edge=Math.max(edge,distanceAt(a.lab,i*3,j*3));
      if(edge>.004+(.5-o.detail)*.003)continue;
      const rgb=Array.from(a.lab.subarray(i*3,i*3+3));
      let label=original[i],cost=Infinity;
      for(const candidate of new Set([original[i],...neighbors.map(j=>original[j])])){
        const score=dist(rgb,labs[candidate])+neighbors.reduce((s,j)=>s+(original[j]!==candidate?strength:0),0);
        if(score<cost){cost=score;label=candidate;}
      }
      indices[i]=label;
    }
    if(o.outline>0){
      const before=indices.slice();
      for(let y=1;y<a.h-1;y++)for(let x=1;x<a.w-1;x++){
        const i=y*a.w+x,src=Array.from(a.lab.subarray(i*3,i*3+3));
        let brighter=0;
        for(const j of [i-1,i+1,i-a.w,i+a.w])brighter=Math.max(brighter,a.lab[j*3]-src[0]);
        // Dark side only, one output-cell wide. No universal black stroke.
        if(brighter<.14+(1-o.outline)*.1)continue;
        const target=[Math.max(0,src[0]-o.outline*.08),src[1],src[2]];
        let best=before[i],min=dist(target,labs[best]);
        for(let k=0;k<labs.length;k++){const d=dist(target,labs[k]);if(d<min&&labs[k][0]<=src[0]){best=k;min=d;}}
        indices[i]=best;
      }
    }
  }
  return indices;
}
export function convert(image,options={}){
  const o=normalize(image,options),scale=Math.min(1,o.size/Math.max(image.width,image.height));
  const width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
  const factor=o.style==='illustration'?3:1;
  const raster=analysisRaster(image,Math.min(image.width,width*factor),Math.min(image.height,height*factor),o);
  const a=o.style==='illustration'?sampleRegions(raster,width,height,o):raster;
  const palette=paletteFor(a,o),indices=assign(a,palette,o),data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<indices.length;i++)data.set([...palette[indices[i]],255],i*4);
  return {width,height,data,palette,indices};
}
