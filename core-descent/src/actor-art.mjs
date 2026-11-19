/**
 * Original 32 × 32 pixel artwork. These are horizontal slices of small painted
 * figures, not gameplay geometry. Each silhouette is authored in local space,
 * facing +X; SpriteAtlas supplies the eight views and the vertical projection.
 */

function px(c,x,y,w,h,color){
  const left=Math.max(-16,Math.round(x)),top=Math.max(-16,Math.round(y));
  const right=Math.min(16,Math.round(x+w)),bottom=Math.min(16,Math.round(y+h));
  if(right<=left||bottom<=top)return;
  c.fillStyle=color;c.fillRect(left,top,right-left,bottom-top);
}
function oval(c,x,y,rx,ry,color){
  for(let row=-Math.ceil(ry);row<Math.ceil(ry);row++){
    const q=(row+.5)/ry;if(Math.abs(q)>1)continue;
    const span=Math.max(1,Math.round(rx*Math.sqrt(1-q*q)));
    px(c,x-span,y+row,span*2,1,color);
  }
}
function poly(c,points,color){
  const lo=Math.floor(Math.min(...points.map(p=>p[1]))),hi=Math.ceil(Math.max(...points.map(p=>p[1])));
  for(let y=lo;y<hi;y++){
    const xs=[];
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],scan=y+.5;
      if((a[1]<=scan&&b[1]>scan)||(b[1]<=scan&&a[1]>scan))xs.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    xs.sort((a,b)=>a-b);
    for(let i=0;i+1<xs.length;i+=2)px(c,Math.ceil(xs[i]),y,Math.floor(xs[i+1])-Math.ceil(xs[i])+1,1,color);
  }
}
function line(c,x0,y0,x1,y1,color,width=1){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
  let err=dx+dy;
  for(;;){px(c,x0,y0,width,width,color);if(x0===x1&&y0===y1)break;const e=2*err;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;}}
}
function slab(c,x,y,rx,ry,edge,body,light){
  oval(c,x,y,rx,ry,edge);oval(c,x,y-.5,Math.max(1,rx-1),Math.max(1,ry-1),body);
  if(light)oval(c,x-2,y-2,Math.max(1,rx-3),Math.max(1,ry-3),light);
}
function layers(add,first,last,name,paint,step=1){for(let z=first;z<=last;z+=step)add(z,`${name}${z}`,c=>paint(c,z));}
function eyes(c,x,y,iris,wide=false){
  px(c,x,y-4,wide?3:2,2,'#202c32');px(c,x,y+2,wide?3:2,2,'#202c32');
  px(c,x+(wide?1:0),y-4,1,1,iris);px(c,x+(wide?1:0),y+2,1,1,iris);
}

function adventurer(frame,add){
  const step=[0,2,0,-2][frame],sway=[0,1,0,-1][frame];
  layers(add,1,4,'boots',(c,z)=>{
    for(const side of [-1,1]){const x=(side<0?step:-step),y=side<0?-7:3;
      poly(c,[[x-4,y],[x+4,y],[x+7,y+2],[x+6,y+5],[x-4,y+5]],z===1?'#1d2529':'#654534');
      if(z>1){px(c,x-2,y+1,6,2,'#936746');px(c,x+5,y+2,1,2,'#bb8d59');if(z===4)px(c,x-3,y+1,2,3,'#cfaa73');}
    }
  });
  layers(add,5,9,'legs',(c,z)=>{for(const side of [-1,1]){const x=(side<0?step:-step)*(10-z)/6,y=side<0?-5:5;slab(c,x,y,3.5,3,'#263336',z<7?'#52605a':'#566d62','#84917a');}});
  layers(add,7,18,'cloak',(c,z)=>{
    const spread=z<11?10:z<16?9:7,back=z<11?-12+sway:z<15?-10:-7;
    poly(c,[[back,-spread],[1,-spread+2],[4,-5],[3,5],[0,spread-1],[back+1,spread],[back-2,spread-4]],'#203d44');
    poly(c,[[back+1,-spread+1],[0,-spread+3],[2,-3],[1,5],[back+2,spread-1],[back-1,spread-4]],z<10?'#2c5960':z<15?'#356d6b':'#57877c');
    line(c,back+2,-spread+2,back+3,spread-2,z>14?'#92af91':'#528b7c');
    if(z<12){px(c,back+3,-spread+1,2,2,'#c5ab70');px(c,back+2,spread-2,3,1,'#c5ab70');px(c,back-1,2,3,3,'#203d44');}
  });
  layers(add,9,17,'jerkin',(c,z)=>{
    const ry=z<11?5:z<16?6:5;
    slab(c,0,0,z<16?6:5,ry,'#3a342e',z===10?'#463b2e':z>14?'#a17a4e':'#7b593b',z===10?null:'#b48b59');
    if(z===10){px(c,5,-4,2,8,'#3c3027');px(c,6,-1,2,3,'#e1be75');}
    if(z>=12&&z<=16){px(c,4,-4,1,8,'#47352b');px(c,5,-2,1,1,'#ddbf82');px(c,5,1,1,1,'#ddbf82');}
    // A crossed leather strap and a small travel satchel, independent of weapon.
    if(z>12){line(c,-3,-5,4,4,'#4f3b2f',2);px(c,-3,-5,1,2,'#d7bd86');}
    if(z>=10&&z<=14){slab(c,-5,7,4,3,'#392f2b','#926541',z===14?'#c59660':null);if(z===12)px(c,-4,9,2,1,'#d0ae70');}
    for(const side of [-1,1]){
      slab(c,2,side*8,3.5,3,'#263c3e',z>14?'#648b73':'#3f6b5b',z===16?'#9bac83':null);
      if(z>=11&&z<=14){slab(c,7,side*8,3,2.5,'#6c4934','#d8aa75',z>12?'#efd096':null);px(c,4,side*8-2,2,4,'#674b34');}
    }
  });
  add(18,'scarf',c=>{oval(c,0,0,6,6,'#234b50');px(c,4,-4,3,8,'#c4ba84');px(c,6,-2,2,3,'#e5d4a0');px(c,-2,-6,4,2,'#a9b893');});
  layers(add,19,26,'face',(c,z)=>{
    const rx=z<21?4:z>24?5:6,ry=z<21?4:z>24?5:6;
    slab(c,0,0,rx,ry,'#433d32',z>24?'#71513a':'#bd895c',z>24?'#9e7348':'#e2b881');
    if(z>=21&&z<=24){px(c,4,-4,3,8,'#e7bd85');px(c,6,-2,2,3,'#edca94');px(c,2,-6,2,2,'#bf8b60');px(c,2,4,2,2,'#d7a370');}
    if(z===23)eyes(c,6,0,'#8ab9b2');
    if(z===20)px(c,5,-1,2,2,'#9d664d');
    // Hood frames the face; its front remains open instead of becoming a helmet.
    poly(c,[[-7,-5],[-3,-7],[3,-6],[4,-4],[0,-4],[-2,-2],[-2,3],[3,4],[2,6],[-4,6],[-7,3]],z>24?'#4e7e72':'#2c5554');
    if(z>22){px(c,-5,-4,2,7,'#76a08a');px(c,-3,-6,4,1,'#adbd93');}
    if(z===24){px(c,2,-5,3,2,'#684a35');px(c,3,3,2,2,'#684a35');}
  });
  add(27,'hood-crown',c=>{slab(c,-2,-.5,4.5,4,'#315c59','#648f7c','#a4b694');px(c,-4,1,2,2,'#426e64');});
}

function slime(kind,frame,add){
  const bog=kind==='bog_slime',squash=frame%2;
  const p=bog?['#233e3c','#45685a','#729779','#a9be91','#d6d9ae']:['#1c4944','#33785a','#62ab72','#a3ce82','#e3edb5'];
  add(1,'wet-edge',c=>{oval(c,-1,0,14,11,p[0]);oval(c,1,1,12,9,p[1]);px(c,-13,5,4,2,p[2]);px(c,8,-9,3,1,p[2]);});
  const top=bog?18:15;
  layers(add,2,top,'gel',(c,z)=>{
    const k=z/top,r=13*Math.sqrt(Math.max(.12,1-k*k))+squash*.7,shift=Math.round(Math.sin(frame*Math.PI/2)*(1-k));
    slab(c,shift-1,0,r,r*.79,p[0],k>.7?p[3]:k>.35?p[2]:p[1],k>.5?p[3]:null);
    if(z===6||z===10){px(c,-7,4,2,2,p[3]);px(c,-2,-5,1,1,p[4]);}
    if(z===9)eyes(c,9-squash,0,bog?'#edb5e0':'#eff8c4',true);
    if(z===8)px(c,10,-1,1,2,p[0]);
    if(z===top-2){oval(c,-4,-3,3,2,p[4]);px(c,1,-4,2,1,p[4]);}
  });
  if(bog){
    add(17,'spore-stems',c=>{px(c,-6,-3,2,3,'#ced0a7');px(c,2,3,2,3,'#a6b08b');});
    add(19,'spore-caps',c=>{slab(c,-5,-2,4,3,'#5b426d','#b384bd','#e7c6da');slab(c,3,4,3,2,'#594a70','#9e80ba','#d4bbd4');});
  }
}

function quadruped(kind,frame,add){
  const ice=kind==='frost_wolf',reptile=kind==='marsh_stalker',step=[0,2,0,-2][frame];
  const p=ice?['#334d66','#6c99af','#a6ccda','#e4ece8','#75e4ed']:reptile?['#293f39','#496a50','#72965e','#b1bf7a','#eacb7b']:['#3b3031','#6c6057','#a3977b','#ded1ac','#ebbc73'];
  layers(add,1,reptile?4:7,'paws',(c,z)=>{
    for(const x of [-8,7])for(const side of [-1,1]){
      const offset=(x<0?1:-1)*side*step,y=side*6;
      slab(c,x+offset,y,z<3?4:2.5,2.5,p[0],z>4?p[2]:p[1],z===2?p[3]:null);
      if(z===1)for(let toe=0;toe<2;toe++)px(c,x+offset+3,y-1+toe*2,1,1,p[3]);
    }
  });
  layers(add,reptile?4:7,14,'body',(c,z)=>{
    const r=z<10?11:z<13?10:7,ry=reptile?6:5;
    slab(c,-2,0,r,ry,p[0],z>11?p[2]:p[1],z>11?p[3]:null);
    if(reptile){for(let x=-10;x<=5;x+=4){px(c,x,-2,2,3,z>11?p[3]:p[1]);px(c,x+1,3,2,1,p[0]);}}
    else {px(c,-7,-4,4,2,p[2]);px(c,-3,3,5,2,p[2]);}
    const ty=(frame===1?2:frame===3?-2:0);
    if(z<=10){poly(c,[[-9,-3],[-15,-2+ty],[-16,1+ty],[-12,3],[-7,2]],p[1]);px(c,-15,ty,4,1,p[2]);}
  });
  layers(add,9,17,'head',(c,z)=>{
    const r=z<12?5:z>15?4:6;
    slab(c,6,0,r,r*.8,p[0],z>14?p[2]:p[1],z>14?p[3]:null);
    if(z>=10&&z<=14){slab(c,11,0,4,3,p[0],reptile?p[2]:p[3],null);px(c,14,-2,2,4,p[0]);}
    if(z===14)eyes(c,10,0,p[4]);
    if(z===11){px(c,12,-3,1,1,'#f0e0bb');px(c,12,2,1,1,'#f0e0bb');}
  });
  layers(add,16,reptile?18:20,'ears',(c,z)=>{
    if(reptile){px(c,2,-8,5-(z-16),2,p[2]);px(c,2,6,5-(z-16),2,p[2]);}
    else{for(const side of [-1,1]){const r=3-(z-16)/2;slab(c,3,side*5,r,Math.max(1,r-1),p[0],z>18?p[2]:p[1],z<19?'#b58e83':null);}}
  });
  if(ice||reptile)add(reptile?16:15,'dorsal-details',c=>{for(let x=-9;x<3;x+=4){poly(c,[[x-2,-1],[x,-3],[x+2,0],[x,2]],ice?'#b8f0ef':'#c0bd7c');}});
}

function humanoid(kind,frame,add){
  const gob=kind==='goblin',ice=kind==='ice_archer',imp=kind==='fire_imp',shaman=kind==='spore_shaman';
  const p=gob?{skin:'#82a65a',skinHi:'#bed07e',skinLo:'#4b653d',cloth:'#956c42',clothHi:'#bc9362',edge:'#34352c'}:
    ice?{skin:'#a9d0d2',skinHi:'#e0eeeb',skinLo:'#6c91a5',cloth:'#47778c',clothHi:'#7db5c3',edge:'#2b4153'}:
    imp?{skin:'#be6247',skinHi:'#f2a366',skinLo:'#723a3b',cloth:'#603747',clothHi:'#986164',edge:'#362937'}:
    shaman?{skin:'#7c9b79',skinHi:'#bac6a0',skinLo:'#465e56',cloth:'#615077',clothHi:'#9b7cab',edge:'#303344'}:
    {skin:'#c09b72',skinHi:'#edcd9b',skinLo:'#7e6551',cloth:'#a68156',clothHi:'#dcc08c',edge:'#4b4339'};
  const step=[0,2,0,-2][frame],short=gob||imp,headStart=short?16:19;
  layers(add,1,6,'feet',(c,z)=>{for(const side of [-1,1]){const x=side*step,y=side*5;slab(c,x,y,z<3?5:3,2.5,p.edge,z<3?'#5a4637':p.cloth,z===2?'#a47d50':null);}});
  layers(add,7,headStart-1,'clothing',(c,z)=>{
    const r=short?5:6,ry=z<headStart-4?6:7;
    slab(c,-1,0,r,ry,p.edge,p.cloth,z>headStart-4?p.clothHi:null);
    if(!short){poly(c,[[-8,-8],[-3,-7],[-1,0],[-4,8],[-9,7]],p.cloth);px(c,-7,-5,1,10,p.clothHi);px(c,-8,2,2,3,p.edge);}
    if(z===9){px(c,4,-5,2,10,p.edge);px(c,5,-1,2,3,'#d9b777');}
    if(z===headStart-2){px(c,2,-5,2,10,p.skinLo);px(c,3,-2,2,3,ice?'#d8f2e6':shaman?'#d6c592':'#e4bf79');}
    for(const side of [-1,1]){
      slab(c,1,side*8,3,2.5,p.edge,z>headStart-4?p.clothHi:p.cloth,null);
      if(z<=headStart-3&&z>=headStart-6)slab(c,6,side*8,3,2,p.skinLo,p.skin,p.skinHi);
    }
  });
  if(imp)layers(add,5,9,'tail',(c,z)=>{line(c,-5,1,-13,4,p.skinLo,2);line(c,-13,4,-15,-1,p.skin,2);if(z===9)poly(c,[[-16,-5],[-11,-2],[-16,1]],p.skinHi);});
  if(gob)add(11,'scrap-dagger',c=>{px(c,8,6,7,2,'#a1aaa0');px(c,8,5,2,4,'#c6a85b');px(c,13,6,3,1,'#e3dbb5');});
  const headTop=short?23:26;
  layers(add,headStart,headTop,'head',(c,z)=>{
    const k=z-headStart,r=(k===0||z===headTop)?4:short?7:6;
    slab(c,0,0,r,r-1,p.edge,z===headTop?p.skinHi:p.skin,z>headStart+3?p.skinHi:null);
    if(z>=headStart+1&&z<=headTop-2){slab(c,6,0,gob?4:3,3,p.skinLo,p.skin,p.skinHi);}
    if(z===headTop-3){eyes(c,7,0,imp?'#ffdb88':gob?'#f2dd8d':ice?'#8ff0f1':'#d9bd8b');}
    if(gob){poly(c,[[-2,-5],[-3,-12],[3,-8],[4,-4]],z>19?p.skinHi:p.skin);poly(c,[[-2,5],[-3,12],[3,8],[4,4]],p.skin);if(z===19){px(c,7,-3,2,1,'#f3deae');px(c,7,2,2,1,'#f3deae');}}
    if(!short&&!shaman){
      poly(c,[[-7,-5],[-3,-7],[3,-6],[4,-4],[-1,-4],[-2,4],[4,4],[3,6],[-4,6],[-7,3]],z>24?p.clothHi:p.cloth);
      if(z===headStart+2)px(c,5,-4,3,8,ice?'#779da9':'#a08765');
      if(z===headTop)line(c,-5,-3,-3,4,ice?'#e2e9df':'#f0d9ad',2);
    }
  });
  if(imp)layers(add,23,27,'horns',(c,z)=>{for(const side of [-1,1])slab(c,-2-(z-23)/2,side*(5+(z-23)/3),Math.max(1,3-(z-23)/2),1.5,'#765141',z>25?'#f7d49c':'#c8a777',null);});
  if(shaman){
    layers(add,26,29,'mushroom-hat',(c,z)=>{const r=z===26?14:z===27?13:z===28?10:7;slab(c,-2,0,r,r*.8,'#49364f',z===26?'#856177':'#b7839e',z>27?'#dab1ba':null);if(z>26){px(c,-8,-5,3,2,'#f0d5c1');px(c,0,-6,3,2,'#e9d1bd');px(c,5,2,2,2,'#f0dac5');px(c,-4,5,4,2,'#dfc1b4');}});
    layers(add,6,25,'staff',(c,z)=>{px(c,11,-10,2,2,z%4===0?'#ad9972':'#74644f');if(z>21)slab(c,12,-10,3-(z-22)*.3,3-(z-22)*.3,'#675170','#af91cb',z>23?'#e7d4e6':null);});
  }else if(!gob&&!imp){
    add(12,'bow',c=>{line(c,9,-13,14,-7,'#644a36',2);line(c,14,-7,15,5,'#916e45',2);line(c,15,5,10,13,'#bca071',2);line(c,9,-12,10,12,'#d7cfaa');line(c,7,0,15,0,ice?'#d4f0eb':'#e4cb99');});
    layers(add,11,18,'quiver',(c,z)=>{px(c,-7,-8,3,4,z>16?'#d4c398':'#6a503b');if(z>16){px(c,-8,-9,1,3,'#b5b89b');px(c,-5,-9,1,3,'#e3d5b2');}});
  }
}

function scarab(frame,add){
  const step=[0,1,0,-1][frame];
  layers(add,1,3,'legs',(c,z)=>{for(const side of [-1,1])for(let i=0;i<3;i++){const x=-9+i*7+step*(i%2?1:-1);line(c,x,side*5,x-2,side*11,'#594d38',2);line(c,x-2,side*11,x+1,side*14,z===3?'#c3a867':'#8f7846');}});
  layers(add,3,12,'carapace',(c,z)=>{const r=13*Math.sqrt(1-Math.pow(z/16,2));slab(c,-2,0,r,r*.78,'#303f39',z<7?'#536e52':z<10?'#8d9a60':'#b8bb75',z>7?'#d4ce8b':null);px(c,-12,-1,23,2,'#344839');if(z>7){line(c,-8,-4,-2,-7,'#5c7753');line(c,-8,4,-2,7,'#5c7753');}if(z===11){px(c,-5,-5,4,2,'#ebe1ad');px(c,0,3,4,2,'#d8d097');}});
  layers(add,4,8,'head',(c,z)=>{slab(c,10,0,4,5,'#3b3d2d','#9b8a50',z>6?'#d3b873':null);if(z===7)eyes(c,12,0,'#f4ce84');});
  add(6,'mandibles',c=>{line(c,12,-3,15,-6,'#d1b47c',2);line(c,12,3,15,6,'#d1b47c',2);px(c,15,-4,1,2,'#59432e');px(c,15,2,1,2,'#59432e');});
}

function sandWorm(frame,add){
  const sway=[0,1,0,-1][frame];
  add(1,'sand-collar',c=>{oval(c,-1,0,15,12,'#816044');oval(c,-1,0,13,10,'#bd9b65');px(c,-13,-3,2,2,'#e1c593');px(c,9,7,3,2,'#e1c593');});
  layers(add,2,26,'segments',(c,z)=>{
    const cx=-3+Math.round(z/8)+sway,rx=z<7?11:z<18?8:9,ry=rx-2,band=z%5;
    slab(c,cx,0,rx,ry,'#674838',band===0?'#8c5c40':z>19?'#d0a36c':'#b78956',band===4?'#e1bd82':null);
    if(z%5===3){px(c,cx-4,-ry+2,3,1,'#e4c28b');px(c,cx+1,ry-2,3,1,'#885a3f');}
    if(z>=21){oval(c,cx+3,0,6,5,'#5c3034');oval(c,cx+4,0,4,3,'#241f2b');if(z>=24){for(const y of [-4,3])for(let x=-1;x<8;x+=3)px(c,cx+x,y,1,2,'#f2dbb0');}}
  });
  add(27,'lip-ridges',c=>{line(c,0,-6,8,-5,'#ecc895',2);line(c,0,5,8,4,'#b77e54',2);});
}

function winged(kind,frame,add){
  const dragon=kind==='cinder_drake',ember=kind!=='bat',lift=[0,3,1,-2][frame],wingZ=(dragon?14:10)+lift;
  const p=ember?['#3d2939','#703d48','#b45e4c','#e19b60','#f4d98d']:['#252b3b','#4f3e5b','#91617d','#c08f9c','#f0cc96'];
  if(dragon)layers(add,1,8,'claws',(c,z)=>{for(const x of [-8,7])for(const side of [-1,1]){slab(c,x,side*8,z<3?4:3,3,p[0],p[1],z>5?p[2]:null);if(z===2)for(let i=0;i<2;i++)px(c,x+3,side*8-1+i*2,2,1,'#d9bd99');}});
  add(wingZ,'wing-shadow',c=>{for(const side of [-1,1])poly(c,[[4,side*3],[11,side*10],[5,side*15],[-2,side*11],[-10,side*15],[-15,side*10],[-6,side*5]],p[0]);});
  add(wingZ+1,'wing-membrane',c=>{for(const side of [-1,1]){
    poly(c,[[4,side*4],[9,side*10],[5,side*13],[-1,side*9],[-9,side*13],[-12,side*10],[-5,side*6]],p[2]);
    line(c,4,side*4,-9,side*12,p[1]);line(c,4,side*4,-1,side*9,p[3]);line(c,4,side*4,8,side*10,p[3]);
    px(c,8,side<0?-11:9,2,2,p[4]);
  }});
  layers(add,dragon?9:10,dragon?22:17,'torso',(c,z)=>{
    const r=dragon?10:7,ry=dragon?6:4;
    slab(c,-3,0,r,ry,p[0],z>(dragon?17:14)?p[2]:p[1],z>(dragon?20:16)?p[3]:null);
    if(dragon&&z<17){poly(c,[[-9,-3],[-15,-2],[-16,1],[-9,3]],p[2]);px(c,-15,0,4,1,p[3]);}
    if(z%4===2){px(c,-6,-3,2,1,p[3]);px(c,-1,2,2,1,p[3]);}
  });
  layers(add,dragon?15:12,dragon?25:20,'head',(c,z)=>{
    const top=dragon?25:20,rx=z===top?3:5;
    slab(c,6,0,rx,5,p[0],z>top-3?p[3]:p[2],z===top?p[4]:null);
    if(dragon&&z<22)slab(c,11,0,4,3,p[0],p[2],null);
    if(z===top-3){eyes(c,10,0,p[4]);px(c,12,-2,2,1,p[0]);px(c,12,1,2,1,p[0]);}
    if(z===top-5){px(c,11,-3,2,1,'#f0d6a3');px(c,11,2,2,1,'#f0d6a3');}
  });
  layers(add,dragon?24:19,dragon?29:23,'horns',(c,z)=>{
    const begin=dragon?24:19,r=Math.max(1,3-(z-begin)/2);
    for(const side of [-1,1])slab(c,2-(z-begin)/2,side*5,r,r*.8,p[0],dragon?'#d2b58a':p[2],z>begin+2?(dragon?'#f4dba7':p[3]):null);
  });
  if(dragon)add(24,'dorsal-spines',c=>{for(let x=-11;x<1;x+=4)poly(c,[[x-1,-1],[x,-3],[x+2,0],[x,2]],'#edac68');});
}

function stone(kind,frame,add){
  const ice=kind==='ice_guardian'||kind==='frost_giant',giant=kind==='frost_giant',legacy=kind==='boss',step=[0,1,0,-1][frame];
  const p=ice?['#354b66','#638fa7','#99c4d1','#d9e9e7','#9bf2ed']:legacy?['#2f4340','#5c7765','#99a98a','#d3cfaa','#e5ca8a']:['#292e3c','#4a4651','#78616a','#b68c7c','#ffbd78'];
  layers(add,1,9,'feet',(c,z)=>{for(const side of [-1,1]){const x=side*step;poly(c,[[x-8,side*7-4],[x+5,side*7-4],[x+8,side*7],[x+6,side*7+4],[x-7,side*7+4]],p[0]);px(c,x-5,side*7-3,10,5,z>6?p[2]:p[1]);if(z===3||z===8)px(c,x-5,side*7-3,4,2,p[3]);}});
  layers(add,10,22,'armour',(c,z)=>{
    const broad=z<14?8:z<20?10:8;
    poly(c,[[-broad,-9],[-3,-11],[7,-8],[10,-3],[9,7],[0,11],[-broad,7]],p[0]);
    poly(c,[[-broad+1,-8],[-3,-9],[6,-7],[8,-2],[7,6],[0,9],[-broad+1,6]],z>18?p[2]:p[1]);
    poly(c,[[-broad+2,-7],[-3,-8],[-1,-2],[-4,6],[-broad+2,5]],p[2]);
    if(z===21)line(c,-7,-6,3,-8,p[3],2);
    px(c,4,-5,2,10,p[0]);
    if(z>13&&z<20){px(c,6,-2,2,4,p[4]);if(z===17)px(c,7,-1,1,2,'#f2f5d9');}
    for(const side of [-1,1]){
      slab(c,z<15?3:-1,side*12,z>18?5:4,3.5,p[0],z>19?p[2]:p[1],z>20?p[3]:null);
      if(z===13){px(c,5,side*12-1,2,2,p[4]);}
    }
    if(!ice&&!legacy&&z%4===0){line(c,-6,-7,-3,-1,p[4]);line(c,-3,-1,-5,5,'#bb655b');}
    if(legacy&&z>18){px(c,-9,-8,3,3,'#6e945e');px(c,-6,6,4,2,'#a9b675');}
    if(giant&&z>=20){px(c,-6,-13,9,2,'#e9e9d5');px(c,-6,11,8,2,'#cbded7');}
  });
  layers(add,23,giant?29:28,'head',(c,z)=>{
    const top=giant?29:28,r=z===top?5:7;
    slab(c,0,0,r,r,p[0],z>26?p[2]:p[1],z>27?p[3]:null);
    if(z===25||z===26){px(c,6,-5,2,3,p[0]);px(c,6,2,2,3,p[0]);if(z===26)eyes(c,7,0,p[4]);}
    if(z===24){px(c,6,-2,3,4,p[2]);px(c,8,-1,1,2,p[0]);}
    if(giant&&z<27){poly(c,[[6,-4],[11,-3],[12,0],[10,3],[6,4]],'#c6dfdc');px(c,10,-2,1,4,'#f0f0df');}
    if(!ice&&!legacy&&z===28){px(c,-4,-4,2,7,'#ecaa77');px(c,-2,-4,3,1,'#d17d66');}
  });
  if(ice)layers(add,28,giant?32:31,'ice-crown',(c,z)=>{const at=z-28;for(const side of [-1,1]){poly(c,[[-5-at,-7*side],[-1-at,-8*side],[1-at,-5*side],[-2-at,-4*side]],at>2?p[4]:p[2]);px(c,-4-at,side<0?5:-7,1,2,p[3]);}});
  else if(legacy){add(30,'carved-crown',c=>{px(c,-5,-7,3,5,'#b8c49b');px(c,-5,3,3,5,'#b8c49b');px(c,-3,-6,5,1,'#e2d9ae');});}
  else add(29,'embers',c=>{px(c,-3,-3,2,2,'#f7b375');px(c,1,3,1,1,'#dd8063');});
}

function skeleton(frame,add){
  const step=[0,2,0,-2][frame];
  layers(add,1,8,'leg-bones',(c,z)=>{for(const side of [-1,1]){const x=side*step,y=side*5;px(c,x-2,y-2,z<3?8:3,3,'#625e4d');px(c,x-1,y-1,z<3?7:2,2,z===8?'#ecddb6':'#c5b797');if(z===4||z===8)px(c,x-2,y-2,4,3,'#e2d1a8');}});
  layers(add,9,18,'ribs',(c,z)=>{
    px(c,-3,-2,3,4,'#a79d80');px(c,-3,-1,1,2,'#f1e1b9');
    if(z===10||z===13||z===16){line(c,-2,-1,2,-6,'#c9b994',2);line(c,2,-6,5,-3,'#ecddb5');line(c,-2,1,2,6,'#c9b994',2);line(c,2,6,5,3,'#ecddb5');}
    if(z<13){px(c,-4,-6,6,2,'#c6b48e');px(c,-4,4,6,2,'#c6b48e');}
    for(const side of [-1,1]){px(c,0,side*9-1,6,2,'#a59678');px(c,5,side*8-1,3,3,'#dccba5');if(z>14)px(c,0,side*9-1,3,1,'#f0dfb9');}
  });
  layers(add,19,26,'skull',(c,z)=>{
    slab(c,0,0,z<21?4:z>24?5:6,z<21?4:6,'#655e4e',z>23?'#d5c8a6':'#b6a98a',z>24?'#f3e7c4':null);
    if(z===22||z===23){px(c,5,-5,3,4,'#30333a');px(c,5,1,3,4,'#30333a');if(z===23)eyes(c,7,0,'#c5d6cf');}
    if(z===20){px(c,4,-4,4,8,'#dbcba6');for(let y=-3;y<4;y+=2)px(c,7,y,1,1,'#706048');}
    if(z===21)px(c,7,-1,2,2,'#5e5348');
    if(z===26){px(c,-2,-4,1,4,'#958771');px(c,-1,-1,2,1,'#958771');}
  });
  add(15,'tattered-sash',c=>{px(c,-4,-7,3,14,'#686477');px(c,-6,5,2,7,'#514d63');px(c,-4,8,2,3,'#948a9b');});
}

function warden(frame,add){
  const step=[0,2,0,-2][frame];
  layers(add,1,8,'greaves',(c,z)=>{for(const side of [-1,1])slab(c,side*step,side*6,z<3?6:4,3,'#252f3a',z>5?'#818b90':'#48535e',z===3||z===8?'#bdc3b4':null);});
  layers(add,7,19,'mantle',(c,z)=>{
    poly(c,[[-13,-10],[-7,-11],[1,-7],[2,7],[-6,11],[-13,9],[-11,4]],'#382f43');
    poly(c,[[-12,-8],[-7,-9],[-2,-6],[-2,7],[-6,9],[-11,8]],z>15?'#8d647c':'#67495f');
    px(c,-10,-7,1,12,'#aa8091');if(z<10){px(c,-13,-3,3,4,'#242d37');px(c,-11,6,3,4,'#242d37');}
  });
  layers(add,9,20,'armour',(c,z)=>{
    slab(c,-1,0,z>16?7:6,8,'#2c3b45',z>16?'#8d9b9e':'#536773',z>18?'#c5ccbd':null);
    px(c,4,-6,2,12,z%4===0?'#b8a676':'#3d505e');
    if(z===12){px(c,5,-2,2,4,'#e6c584');px(c,6,-1,1,2,'#547f83');}
    for(const side of [-1,1]){slab(c,0,side*11,5,3,'#293a45',z>17?'#a5b0b0':'#637985',z>19?'#d5d9c5':null);if(z===15)slab(c,6,side*10,3,2,'#33414a','#899e9e','#c7cbb4');}
  });
  layers(add,21,28,'helm',(c,z)=>{
    slab(c,-1,0,z===28?4:6,z===28?5:7,'#263a48',z>25?'#a5b5b8':'#6e8b99',z>26?'#d6e0d2':null);
    if(z>=23&&z<=25){px(c,4,-5,3,10,'#1f303b');if(z===24)eyes(c,6,0,'#e6ca8a');px(c,6,-1,2,2,'#a9bec2');}
    if(z===28)px(c,-3,-4,2,8,'#ebddad');
  });
  layers(add,25,31,'antler',(c,z)=>{for(const side of [-1,1]){const t=z-25;px(c,-5-t/3,side*7-1,Math.max(1,3-t/3),2,t>3?'#e1d6b0':'#a7a98f');if(t===3)px(c,-7,side<0?-10:8,3,2,'#cbd0b1');}});
}

function treant(frame,add){
  const sway=frame%2;
  layers(add,1,9,'roots',(c,z)=>{
    slab(c,-2,0,z<4?11:8,z<4?9:7,'#3c3a2c','#6f5736',z>5?'#9e7e49':null);
    if(z<5)for(const side of [-1,1]){line(c,-4,side*4,-13,side*11,'#6c5334',3);line(c,3,side*4,11,side*10,'#87663c',3);px(c,-12,side<0?-12:10,4,1,'#b29758');}
  });
  layers(add,10,28,'trunk',(c,z)=>{
    const r=z<16?7:z<24?8:6;
    slab(c,-2,0,r,r,'#3a3e2c',z>22?'#a18b4e':'#77663b',z>24?'#c4ad66':null);
    line(c,-5,-5,-4,5,'#493d2b',2);px(c,1,-6,2,12,'#b39454');px(c,-7,-2,2,5,'#6b8244');
    if(z>17)for(const side of [-1,1]){slab(c,-2+sway,side*11,5,3,'#41462e','#8c7644',z>24?'#b79b5b':null);px(c,2,side*12-1,3,2,'#9fa768');}
    if(z>=21&&z<=23){px(c,5,-5,3,4,'#263c32');px(c,5,1,3,4,'#263c32');if(z===23)eyes(c,7,0,'#f2d98e');}
    if(z===18){px(c,5,-3,3,6,'#3b3b29');px(c,7,-1,1,2,'#b49d5f');}
    if(z===26){px(c,1,-7,3,2,'#9ab269');px(c,-6,5,4,2,'#719452');}
  });
  layers(add,27,34,'foliage',(c,z)=>{
    const r=z<29?8:z<32?10:6;
    for(const [x,y,k] of [[-5,-7,0],[-6,6,1],[2,0,2]]){
      slab(c,x,y,r-(k===2?0:1),r*.66,'#2b503e',z<31?'#49794d':'#78a361',z>31?'#b1c479':null);
      if((z+k)%3===0){px(c,x-3,y-3,3,2,'#bdd28a');px(c,x+2,y+1,2,1,'#7ca568');}
    }
    if(z===31){px(c,-5,-9,2,2,'#d7be81');px(c,3,3,2,2,'#e5c49b');}
  });
}

function scorpion(frame,add){
  const step=frame%2?1:-1;
  layers(add,1,4,'legs',(c,z)=>{for(const side of [-1,1])for(let i=0;i<4;i++){const x=-11+i*5;line(c,x,side*5,x-2+step*(i%2?1:-1),side*11,'#795838',2);line(c,x-2,side*11,x+2,side*14,z>2?'#c39a5e':'#876340');}});
  layers(add,4,13,'armour',(c,z)=>{
    const r=z<7?12:z<11?11:8;slab(c,-3,0,r,r*.68,'#604534',z>9?'#c49b5c':'#a87b46',z>10?'#ead092':null);
    if(z%3===1){px(c,-11,-1,18,2,'#80603a');line(c,-8,-4,-8,3,'#72513a');}
    if(z===11){px(c,6,-3,3,2,'#402f33');px(c,6,1,3,2,'#402f33');px(c,8,-3,1,1,'#edc974');px(c,8,1,1,1,'#edc974');}
  });
  layers(add,5,10,'claws',(c,z)=>{for(const side of [-1,1]){
    line(c,3,side*5,8,side*10,'#8d643a',3);
    poly(c,[[7,side*8],[11,side*6],[15,side*7],[13,side*9],[10,side*10],[14,side*11],[15,side*14],[9,side*14],[6,side*11]],z>7?'#d5ae6e':'#a57a46');
    if(z===10)line(c,8,side*8,12,side*7,'#edd294');
  }});
  layers(add,11,31,'curved-tail',(c,z)=>{
    const x=z<19?-13:z<26?-13+(z-19)*.75:-8+(z-26)*1.4;
    slab(c,x,0,z>28?2.5:3.5,3,'#604332',z%4===0?'#88603b':'#c59859',z%4===3?'#ebca8d':null);
    if(z>=29){poly(c,[[x+1,-2],[x+6,-1],[x+7,1],[x+2,2]],'#49373c');px(c,x+5,-1,2,1,'#c79b77');}
  });
}

function hydra(frame,add){
  layers(add,1,10,'body',(c,z)=>{
    slab(c,-4,0,z<5?12:10,z<5?11:9,'#26443f',z>7?'#779a6c':'#4b7255',z>8?'#aac18b':null);
    if(z<6){for(const side of [-1,1]){px(c,-8,side*11-1,15,3,'#628767');px(c,6,side*11-1,3,1,'#c0c4a0');}px(c,-16,-2,9,3,'#476d50');}
    if(z===10)for(let x=-11;x<3;x+=4)px(c,x,-1,2,2,'#afba7a');
  });
  layers(add,9,33,'three-necks',(c,z)=>{
    for(let i=0;i<3;i++){
      const top=i===1?33:29,y=(i-1)*10,x=Math.min(9,-3+(z-9)*.56)+(i===1?0:frame%2?1:0);
      if(z>top)continue;
      const head=z>=top-6,r=head?(z===top?3:5):3;
      slab(c,x,y,r,head?4:3,'#2b4945',z>top-3?'#a8c28c':head?'#86a776':'#587c5a',z===top?'#d2d6a7':null);
      if(z>=top-5&&z<top-1){px(c,x+3,y-3,3,6,'#9db580');px(c,x+5,y-1,2,2,'#54684e');}
      if(z===top-3){px(c,x+4,y-3,2,1,'#edc88a');px(c,x+4,y+2,2,1,'#edc88a');}
      if(z===top-5){px(c,x+5,y-2,1,1,'#e9d8b0');px(c,x+5,y+1,1,1,'#e9d8b0');}
      if(z<top-6&&z%4===0)px(c,x-1,y-2,1,4,'#97ac73');
    }
  });
}

/** Returns false for unknown kinds so the atlas can reject misspelled species. */
export function paintActorLayers(kind,frame,add){
  frame=((frame%4)+4)%4;
  if(kind==='player')adventurer(frame,add);
  else if(kind==='slime'||kind==='bog_slime')slime(kind,frame,add);
  else if(['wolf','frost_wolf','marsh_stalker'].includes(kind))quadruped(kind,frame,add);
  else if(['goblin','sand_archer','ice_archer','fire_imp','spore_shaman'].includes(kind))humanoid(kind,frame,add);
  else if(kind==='scarab')scarab(frame,add);
  else if(kind==='sand_worm')sandWorm(frame,add);
  else if(['bat','ember_bat','cinder_drake'].includes(kind))winged(kind,frame,add);
  else if(['boss','lava_golem','ice_guardian','frost_giant'].includes(kind))stone(kind,frame,add);
  else if(kind==='skeleton')skeleton(frame,add);
  else if(kind==='warden')warden(frame,add);
  else if(kind==='elder_treant')treant(frame,add);
  else if(kind==='dune_scorpion')scorpion(frame,add);
  else if(kind==='mire_hydra')hydra(frame,add);
  else return false;
  return true;
}
