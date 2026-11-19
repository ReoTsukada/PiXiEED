/** Original 32px terrain art. All variation is decorative and deterministic. */
function px(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.max(0,Math.round(w)),Math.max(0,Math.round(h)));}
function oval(c,x,y,rx,ry,color){
 for(let row=-Math.ceil(ry);row<=Math.ceil(ry);row++){
  const t=(row+.5)/ry;if(Math.abs(t)>1)continue;
  const span=Math.round(rx*Math.sqrt(1-t*t));if(span)px(c,x-span,y+row,span*2,1,color);
 }
}
function bevel(c,x,y,w,h,color,cut=2){px(c,x+cut,y,w-cut*2,h,color);px(c,x,y+cut,w,h-cut*2,color);}
/** Scanline polygon: no antialiasing or subpixel seams on the source atlas. */
function poly(c,points,color){
 const lo=Math.floor(Math.min(...points.map(p=>p[1]))),hi=Math.ceil(Math.max(...points.map(p=>p[1])));
 for(let y=lo;y<hi;y++){
  const hits=[];
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length],scan=y+.5;
   if((a[1]<=scan&&b[1]>scan)||(b[1]<=scan&&a[1]>scan))hits.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2)px(c,Math.ceil(hits[i]),y,Math.ceil(hits[i+1])-Math.ceil(hits[i]),1,color);
 }
}
function tuft(c,x,y,color,light){px(c,x,y-3,1,4,color);px(c,x-2,y-1,2,2,color);px(c,x+1,y-2,1,3,light);px(c,x+2,y-3,1,2,light);}
function flower(c,x,y,petal){px(c,x,y,1,4,'#536b42');px(c,x-1,y+2,1,1,'#83935a');px(c,x-1,y-2,3,3,petal);px(c,x,y-1,1,1,'#e7ca80');}
function artHash(variant,index,salt=0){let n=Math.imul(variant+41,374761393)^Math.imul(index+17,668265263)^Math.imul(salt+3,2246822519);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;}
function grit(c,variant,count,dark,light){
 for(let i=0;i<count;i++){const n=artHash(variant,i,9),x=n%32,y=(n>>>8)%32;px(c,x,y,i%4===0?2:1,1,i%3===0?light:dark);}
}

/** Terrain stays quiet under actors; larger landmarks are composed per room. */
export function paintTerrainTile(c,size,variant,biome='meadow'){
 c.save();c.scale(size/32,size/32);c.imageSmoothingEnabled=false;
 const v=((variant%16)+16)%16;
 if(biome==='desert'){
  px(c,0,0,32,32,['#bda071','#c0a373','#c1a475','#bea272'][v%4]);
  // Long, broken wind ridges do not outline the edge of each square.
  for(let r=0;r<3;r++)for(let x=0;x<32;x++){
   const y=(r*11+Math.round(Math.sin((x+v*3)*.14)*2)+v%4+32)%32;
   if((x+r+v)%9!==0){px(c,x,y,1,1,'#ceb183');if((x+v)%4!==0)px(c,x,y+1,1,1,'#b5986b');}
  }
  grit(c,v,18,'#b3976b','#d9be91');
  if(v===4||v===12){
   poly(c,[[5,12],[10,8],[23,10],[27,20],[20,24],[7,22]],'#ae9168');
   poly(c,[[6,11],[12,8],[22,10],[25,18],[18,21],[7,19]],'#c8ae7d');
   px(c,11,12,10,1,'#dec597');px(c,14,13,1,5,'#b49769');px(c,15,17,5,1,'#b49769');
   px(c,20,18,7,2,'#bda071');
  }
  if(v===7){tuft(c,6,22,'#9d9461','#c4b981');tuft(c,10,23,'#ab9c69','#d6c38d');}
 }else if(biome==='volcano'){
  px(c,0,0,32,32,['#393743','#3b3845','#3c3946','#393844'][v%4]);
  poly(c,[[0,4],[10,2],[14,9],[10,17],[0,18]],'#44414e');
  poly(c,[[13,0],[28,0],[31,9],[23,14],[16,10]],'#46414e');
  poly(c,[[13,15],[24,13],[32,20],[29,32],[12,32],[8,24]],'#413c49');
  px(c,2,4,7,1,'#514b57');px(c,16,2,9,1,'#524b58');px(c,15,16,7,1,'#534956');
  for(let y=0;y<32;y+=3){const x=12+Math.round(Math.sin(y*.3+v)*2);px(c,x,y,1,3,'#302c38');if(y%9===0)px(c,x-3,y+2,3,1,'#332e3c');}
  grit(c,v,15,'#302e39','#5a4d56');
  if(v===1||v===9){poly(c,[[21,21],[26,17],[29,22],[26,26]],'#594d5c');px(c,23,21,2,1,'#9a7d83');px(c,26,23,1,1,'#bea18c');}
 }else if(biome==='swamp'){
  px(c,0,0,32,32,['#3d5149','#40544b','#3e534b','#41564c'][v%4]);
  oval(c,8+(v%3),9,9,5,'#354b46');oval(c,25,25,10,6,'#344a46');
  px(c,2,10,8,1,'#4d6760');px(c,22,25,7,1,'#4e6a60');px(c,11,5,3,1,'#526c60');
  for(let i=0;i<5;i++)tuft(c,(i*7+v*5)%29+1,(i*11+v*3)%27+4,i%2?'#627951':'#526c4b','#80916a');
  grit(c,v,10,'#33463e','#6a7b5a');
  if(v===3||v===11){
   px(c,4,20,13,3,'#3b4037');px(c,5,20,11,1,'#776e50');px(c,7,21,7,1,'#918460');px(c,6,19,4,1,'#6c8757');
   px(c,21,11,1,3,'#9cab8b');oval(c,22,10,3,2,'#839eab');px(c,21,9,2,1,'#bed3c6');
  }
 }else if(biome==='tundra'){
  px(c,0,0,32,32,['#bfd1d4','#c1d3d5','#bdd0d3','#c0d2d4'][v%4]);
  // Broad snow forms are intentionally subtle, without a dark grid.
  oval(c,7,6,13,7,'#cddbdd');oval(c,29,25,15,8,'#c9d9dc');
  for(let x=0;x<32;x++){const y=16+Math.round(Math.sin((x+v*2)*.13)*2);if((x+v)%8!==0)px(c,x,y,1,1,'#acc4ce');if((x+v)%5!==0)px(c,x,y+1,1,1,'#d5e0df');}
  grit(c,v,12,'#aec6cf','#e8ebe3');
  if(v===5||v===13){poly(c,[[6,9],[13,6],[18,11],[15,18],[7,19]],'#91b9c9');poly(c,[[7,9],[13,7],[16,11],[12,13]],'#c5e0e2');px(c,11,12,1,5,'#d9eeeb');px(c,15,15,5,2,'#cbdcdd');}
  if(v===2){tuft(c,21,26,'#7d9e9c','#adbfad');px(c,19,24,5,1,'#e6e9df');}
 }else{
  px(c,0,0,32,32,['#556c44','#576e46','#536b43','#586f47'][v%4]);
  const patch=artHash(v,2,4);
  oval(c,5+patch%12,6+(patch>>>8)%12,9,5,'#506840');oval(c,22+(patch>>>16)%10,21+(patch>>>24)%11,10,6,'#5d754a');
  // Independent hashed points and varying density avoid diagonal stamp rows.
  for(let i=0,count=5+artHash(v,0,1)%5;i<count;i++){
   const n=artHash(v,i,3),x=2+n%28,y=4+(n>>>9)%25;
   tuft(c,x,y,n%3?'#4b633e':'#687e4e',n%2?'#7b8f59':'#708751');
   if((n>>>17)%5===0)tuft(c,Math.min(28,x+3),Math.min(29,y+2),'#526b42','#758b53');
  }
  grit(c,v,9,'#49633d','#8b995d');
  if(v===1||v===9){flower(c,8,10,'#d5c89b');flower(c,22,24,v===9?'#b5a8c1':'#d9dda7');px(c,16,15,2,2,'#c4b873');}
  if(v===4||v===12){poly(c,[[7,15],[13,12],[21,14],[24,20],[18,24],[8,22]],'#465b43');poly(c,[[8,14],[13,11],[21,13],[23,19],[17,22],[8,20]],'#7a8565');px(c,11,13,8,1,'#a1ac81');px(c,9,15,1,3,'#a1ac81');px(c,18,20,4,1,'#607253');tuft(c,7,23,'#42613c','#7c9357');}
 }
 c.restore();
}

export function terrainWallProfile(variant=0,pillar=false,biome='meadow'){
 const v=((variant%6)+6)%6;
 if((biome==='meadow'||biome==='tundra')&&(pillar||v%3===0))return {height:biome==='tundra'?50+(v%3)*2:44+(v%3)*2,shape:'tree'};
 if(biome==='desert'&&(pillar||v%3===0))return {height:37+(v%3)*3,shape:'cactus'};
 if(biome==='swamp'&&(pillar||v%3===0))return {height:34+(v%3)*2,shape:'reeds'};
 return {height:(biome==='desert'?27:biome==='volcano'?34:biome==='tundra'?31:biome==='swamp'?25:25)+(v%3)*3,shape:'rock'};
}

function trunk(c,z,variant,snow=false){
 const lean=Math.floor(z/10)-1,w=z<5?7:z>15?3:4;
 bevel(c,lean-w,-w,w*2+1,w*2,snow?'#4a514b':'#514d35',1);
 px(c,lean-w+1,-w+1,2,w*2-2,snow?'#7d7460':'#92815a');
 px(c,lean+1,-w+1,1,w*2-2,'#3b4333');
 if(z<6){for(const [x,y]of [[-12,-3],[2,-12],[4,4]]){poly(c,[[x,y],[x+4,y-1],[lean+2,2],[lean-2,5]],z<2?'#4b553a':'#756745');}}
 if(z>12&&z<25){const reach=Math.min(10,z-10);px(c,-reach,-5,reach,3,'#726045');px(c,2,3,Math.min(10,reach),3,'#64543d');}
 if(z%7===variant%7)px(c,lean-w+1,0,3,2,'#aa9060');
}
function foliage(c,z,clump,variant){
 const [x,y,zc,rx,rz]=clump,t=(z-zc)/rz;if(Math.abs(t)>=1)return;
 const radius=Math.max(1,Math.round(rx*Math.sqrt(1-t*t))),ry=Math.max(1,Math.round(radius*.88));
 const tone=t>.55?'#91a965':t>.05?'#728e50':t>-.5?'#567940':'#365a36';
 oval(c,x,y,radius,ry,'#31513a');oval(c,x-1,y-1,Math.max(1,radius-1),Math.max(1,ry-1),tone);
 if(t>-.15&&radius>3){oval(c,x-2,y-2,Math.max(2,radius*.58),Math.max(1,ry*.5),t>.55?'#b4bf7c':'#89a25e');}
 // Leaf clusters break an otherwise smooth ellipsoid into a small pixel crown.
 if(radius>3){px(c,x-radius+2,y-2,3,2,t>.1?'#a4b675':'#6d8f4d');px(c,x+1,y+ry-2,3,1,'#4c713d');if((z+variant)%4<2)px(c,x-1,y-ry,3,1,t>.3?'#bcc88b':'#8ba467');}
}
function meadowTree(c,z,v,height){
 if(z<26)trunk(c,z,v);
 const shift=v%2?1:-1;
 for(const clump of [[-7,-5,25,8,11],[6,-3,28,9,12],[-2,7,24,9,10],[-2+shift,-2,height-7,8,8]])foliage(c,z,clump,v);
 if(v===2&&z===height-2){px(c,-3,-3,2,2,'#e0c3aa');px(c,1,0,2,2,'#d8b8a1');}
}
function snowTree(c,z,v,height){
 if(z<height-4)trunk(c,z,v,true);
 // Separate swept boughs, each narrowing to a different crown height.
 for(const [base,peak,radius] of [[10,30,15],[21,39,12],[32,47,9],[42,height,5]]){
  if(z<base||z>peak)continue;
  const t=(z-base)/(peak-base),r=Math.max(1,Math.round(radius*(1-t))),ry=Math.max(1,Math.round(r*.83));
  const snowy=z-base<3||z-base===6;
  oval(c,0,0,r,ry,snowy?'#b4d0cf':'#305b53');
  poly(c,[[-r,0],[-r+3,-ry],[2,-ry],[r,2],[5,ry],[-4,ry]],snowy?'#dce7df':t>.5?'#6e9c89':'#487a68');
  if(r>4){px(c,-r+3,-ry+1,r-2,2,snowy?'#f0eee3':'#8ab39b');px(c,2,ry-1,r-3,1,snowy?'#c2d9d6':'#294e49');}
 }
}
function cactus(c,z,v,height){
 if(z<3){oval(c,0,0,15,13,'#9b865d');oval(c,0,-1,12,10,'#c6aa78');}
 const tips=[[0,0,height,5],[-10,-2,height-11,4],[10,3,height-6,4]];
 for(const [x,y,top,r]of tips){
  const start=x===0?2:x<0?12:18;if(z<start||z>top)continue;
  const radius=z>top-3?Math.max(1,r-(z-(top-3))):r;
  oval(c,x,y,radius,radius+1,'#496d50');oval(c,x-1,y-1,Math.max(1,radius-1),radius,'#6f9661');
  px(c,x-2,y-radius+1,1,radius*2-1,'#a6b77a');px(c,x+2,y-radius+2,1,Math.max(1,radius*2-3),'#527c52');
  if(z%5===v%5){px(c,x-radius,y-1,1,2,'#dfd4a1');px(c,x+radius-1,y+2,1,1,'#dfd4a1');}
  if(z===top&&x===0){oval(c,x,y,3,3,v%2?'#dcac90':'#d4c784');px(c,x,y-1,1,2,'#f1dbad');}
 }
 if(z>=12&&z<=16)bevel(c,-10,-4,11,5,'#64865a',1);
 if(z>=18&&z<=22)bevel(c,0,1,12,5,'#7b9a63',1);
}
function reeds(c,z,v,height){
 if(z<4){oval(c,0,0,16,14,'#31463d');oval(c,-2,-2,13,10,'#526544');}
 for(let i=0;i<10;i++){
  const x=(i*7+v*3)%27-13,y=(i*11+v)%26-13,top=17+(i*5+v*3)%18,lean=Math.round((z/top)*(i%3-1)*3);
  if(z>top)continue;
  px(c,x+lean,y,1,2,i%2?'#7b9661':'#4f7654');
  if(z>top-6){px(c,x+lean-1,y-1,3,3,i%3===0?'#b9bd88':'#8f8660');if(z===top-2)px(c,x+lean-1,y-1,1,2,'#d0c893');}
  if(z===8+i%5||z===13+i%3){px(c,x-3,y,4,1,'#96a66f');px(c,x+1,y+1,3,1,'#607e52');}
 }
 // Waterlogged, twisting wood and a pair of pale shelf fungi.
 if(z<height-6){const x=Math.round(Math.sin(z*.11)*3);bevel(c,x-3,-4,6,7,'#45463a',1);px(c,x-2,-3,1,5,'#8b8060');}
 if(z>=12&&z<=14){oval(c,-4,-3,5,4,z===14?'#8ca9a0':'#536e68');if(z===14)px(c,-7,-4,3,1,'#c8d3b4');}
 if(z>=20&&z<=22){oval(c,5,2,4,3,z===22?'#9bac99':'#516b66');if(z===22)px(c,3,1,3,1,'#d4d8bc');}
}
function sandstone(c,z,v,height){
 const course=Math.floor(z/8),mortar=z%8===0,offset=course%2?4:-3;
 let left=-16+(z>height-5?2:0),right=16-(z>height-4?(v%2?6:3):0);
 if(z>height-7&&v%2)left+=4;
 const points=[[left+3,-15],[right-2,-15],[right,-11],[right,13],[right-4,16],[left,14],[left,-10]];
 poly(c,points,mortar?'#8f7458':z>height-3?'#e1c494':'#b6976c');
 poly(c,[[left+3,-14],[-1,-14],[-2,11],[left+1,12]],mortar?'#b1946c':'#d1b17f');
 px(c,right-3,-10,2,21,mortar?'#7c6651':'#a48461');
 if(!mortar){px(c,offset,-13,1,26,'#997b59');if(z%8===6)px(c,left+4,-11,Math.max(1,right-left-9),1,'#e2c693');}
 if(z>height-4){poly(c,[[-12,-9],[2,-12],[11,-6],[10,7],[-5,11],[-12,5]],'#d3b582');px(c,-8,-7,13,1,'#edd3a0');px(c,2,-6,1,9,'#a88c62');px(c,-3,1,6,1,'#a88c62');}
 if(z===7||z===18){px(c,-12,4,4,2,'#9f8560');px(c,6,-10,5,1,'#ab8f66');}
}
function stone(c,z,v,height,swamp=false){
 const bulge=z<5?0:z>height-6?Math.floor((z-height+7)/2):1;
 const lo=-16+bulge,hi=16-bulge,split=(v%3-1)*4;
 const palette=swamp?['#354b43','#53665a','#7a8b6b','#a0aa7e']:['#4c5c4b','#78836a','#a1ab86','#c0c49c'];
 poly(c,[[lo+3,lo],[hi-4,lo],[hi,lo+6],[hi-1,hi-2],[3,hi],[lo,hi-5],[lo,lo+6]],z>height-3?palette[2]:palette[1]);
 poly(c,[[lo+3,lo],[split,lo],[split-3,hi-4],[lo+1,hi-5]],z>height-3?palette[3]:palette[2]);
 poly(c,[[hi-4,lo],[hi,lo+6],[hi-1,hi-2],[hi-5,hi-2]],palette[0]);
 // Surface marks must reach the forward silhouette: interior pixels disappear
 // under the next horizontal slice when the sprite is composited.
 const front=x=>Math.floor(x<=3?hi-5+(x-lo)*5/(3-lo):hi-(x-3)*2/(hi-4))-1;
 const seams=[6+v%3,15+(v*2)%4,height-7];
 for(let course=0;course<seams.length;course++)if(z===seams[course]||z===seams[course]+1){
  const n=artHash(v,course,14),start=lo+3+n%5,end=Math.min(hi-3,start+11+(n>>>8)%8),gap=start+4+(n>>>16)%4;
  for(let x=start;x<end;x++)if(x<gap||x>gap+2)px(c,x,front(x),1,1,z===seams[course]?palette[0]:swamp?'#72826a':'#a1a582');
 }
 if(z>3&&z<height-4){
  const course=Math.floor((z+v%3)/9),joint=(course%2?6:-6)+(v%3-1)*2+(z%7===0?1:0);
  px(c,joint,front(joint),1,1,swamp?'#41554a':'#626e59');
  if((z+v)%6===2){const x=-10+artHash(v,z,5)%20;px(c,x,front(x),2,1,swamp?'#82916f':'#b0b08c');}
 }
 if(z>height-5){oval(c,-7,-7,6,5,swamp?'#55775a':'#61824a');oval(c,-9,-8,4,3,swamp?'#8ca37b':'#94a865');px(c,-10,-9,3,1,swamp?'#c0c49b':'#c2c88a');}
 // Broken ivy trails on the exposed face, with an irregular, tapering end.
 if(z<height-2&&z>height-18-(v%3)*2){
  const x=-8+(v%3)*6+Math.round(Math.sin(z*.34+v)*2),y=front(x);
  px(c,x,y,1,1,swamp?'#637f59':'#547347');
  if((z+v)%4!==0){px(c,x-1,y,3,1,swamp?'#8ba478':'#7d9658');if(z%3===1)px(c,x-2,front(x-2),2,1,swamp?'#afbb8b':'#a0ae70');}
 }
 if(swamp&&z>=height-1){oval(c,6,3,4,3,'#8ba1af');px(c,4,1,3,1,'#c2d4cb');}
}
function crystal(c,z,cx,cy,top,radius,ice){
 if(z>top)return;
 const taper=z>top-9?(top-z+1)/10:1,r=Math.max(1,Math.ceil(radius*taper));
 const dark=ice?'#537f9c':'#302c3f',mid=ice?'#8db8cd':'#4a4159',light=ice?'#d1e8e9':'#81718d';
 poly(c,[[cx-r,cy-2],[cx-r+2,cy-r],[cx+2,cy-r],[cx+r,cy],[cx+r-2,cy+r],[cx-r+2,cy+r]],dark);
 poly(c,[[cx-r+1,cy-2],[cx-r+3,cy-r+1],[cx+1,cy-r+1],[cx,cy+r-1],[cx-r+2,cy+r-1]],mid);
 px(c,cx-r+2,cy-r+2,1,Math.max(1,r*2-4),light);
 if(z>top-9){poly(c,[[cx-r+1,cy-2],[cx,cy-r],[cx+2,cy],[cx,cy+r-1]],ice?'#bddde3':'#75667e');}
 if(ice&&z%11===2)px(c,cx-r+2,cy-1,Math.max(1,r-1),1,'#e7f1eb');
}
function volcanic(c,z,v,height){
 if(z<8){poly(c,[[-16,-10],[-11,-16],[12,-14],[16,-5],[13,16],[-12,16],[-16,8]],z<3?'#292837':'#493e4b');}
 const peaks=v%3===0?[[-7,-5,height-7,8],[7,1,height,8],[-5,9,height-15,6]]:v%3===1?[[-7,-4,height,7],[7,0,height-10,9],[0,9,height-17,6]]:[[-6,-7,height-9,8],[8,1,height-16,6],[0,7,height,8]];
 for(const [x,y,top,r]of peaks)crystal(c,z,x,y,top,r,false);
 if(z<9&&z%3===0){px(c,-12,4,3,1,'#9a6f6c');px(c,2,-10,3,1,'#aa8075');}
}
function iceRock(c,z,v,height){
 if(z<7){poly(c,[[-16,-9],[-10,-16],[12,-14],[16,-4],[13,14],[-12,16],[-16,7]],z<2?'#6c95aa':'#9bbdca');}
 const peaks=v%3===0?[[-6,-5,height,8],[8,2,height-5,7],[-4,9,height-12,7]]:v%3===1?[[-7,-3,height-11,8],[7,-4,height,7],[0,9,height-7,8]]:[[-7,-6,height-6,7],[7,2,height-12,8],[-3,8,height,7]];
 for(const [x,y,top,r]of peaks)crystal(c,z,x,y,top,r,true);
 if(z===7||z===8){oval(c,-8,8,8,5,z===8?'#e0e8e0':'#b6cfce');oval(c,6,-9,5,4,'#d7e4df');}
}

/** Every slice is still 32×32. Uneven crowns and facets give each wall its volume. */
export function paintTerrainWallLayers(variant,pillar,biome,add){
 const v=((variant%6)+6)%6,{height,shape}=terrainWallProfile(v,pillar,biome);
 for(let z=0;z<=height;z++)add(z,c=>{
  if(shape==='tree'){if(biome==='tundra')snowTree(c,z,v,height);else meadowTree(c,z,v,height);}
  else if(shape==='cactus')cactus(c,z,v,height);
  else if(shape==='reeds')reeds(c,z,v,height);
  else if(biome==='desert')sandstone(c,z,v,height);
  else if(biome==='volcano')volcanic(c,z,v,height);
  else if(biome==='tundra')iceRock(c,z,v,height);
  else stone(c,z,v,height,biome==='swamp');
 });
}
