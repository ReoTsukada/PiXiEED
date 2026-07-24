(() => {
  const canvas = document.getElementById('canvas');
  const viewport = document.getElementById('viewport');
  const status = document.getElementById('status');
  const ctx = canvas.getContext('2d');
  const image = new Image();
  let markers = [], scale = 1, pan = { x: 0, y: 0 }, active = null, drag = null;
  const redraw = () => {
    if (!image.width) return;
    canvas.width = image.width; canvas.height = image.height;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0);
    markers.forEach((marker, index) => { ctx.beginPath(); ctx.arc(marker.x, marker.y, marker.radius, 0, Math.PI * 2); ctx.fillStyle='rgba(255,85,103,.20)';ctx.fill();ctx.lineWidth=Math.max(1,2/scale);ctx.strokeStyle='rgba(255,100,115,.95)';ctx.stroke();ctx.fillStyle='#fff';ctx.font=`${Math.max(10,12/scale)}px sans-serif`;ctx.fillText(String(index+1),marker.x+marker.radius+2,marker.y-marker.radius-2); });
    canvas.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${scale})`;
    status.textContent = `${image.width}×${image.height}px / ${markers.length}箇所`;
  };
  const emit = () => parent.postMessage({ type:'pixfind-marker-change', markers }, '*');
  const point = event => { const rect=viewport.getBoundingClientRect(); return { x:Math.round((event.clientX-rect.left-pan.x)/scale), y:Math.round((event.clientY-rect.top-pan.y)/scale) }; };
  const fit = () => { if(!image.width)return; scale=Math.min(1, Math.max(.15, Math.min((viewport.clientWidth-16)/image.width,(viewport.clientHeight-16)/image.height))); pan={x:Math.max(8,(viewport.clientWidth-image.width*scale)/2),y:Math.max(8,(viewport.clientHeight-image.height*scale)/2)}; redraw(); };
  window.addEventListener('message', event => { const data=event.data||{}; if(data.type!=='pixfind-marker-source'||!data.imageDataUrl)return; markers=Array.isArray(data.markers)?data.markers.map(({x,y,radius})=>({x,y,radius:Math.max(2,Number(radius)||8)})):[]; image.onload=fit; image.src=data.imageDataUrl; });
  viewport.addEventListener('pointerdown', event => { if(!image.width)return; viewport.setPointerCapture(event.pointerId); const p=point(event); active=markers.findIndex(m=>Math.hypot(m.x-p.x,m.y-p.y)<=m.radius+4); drag={pointerId:event.pointerId,start:p,marker:active>=0?{...markers[active]}:null}; if(active<0){markers.push({x:Math.max(0,Math.min(image.width-1,p.x)),y:Math.max(0,Math.min(image.height-1,p.y)),radius:Math.max(5,Math.round(Math.min(image.width,image.height)/28))});active=markers.length-1; redraw();emit();} });
  viewport.addEventListener('pointermove', event => { if(!drag||drag.pointerId!==event.pointerId||active<0)return; const p=point(event); markers[active].x=Math.max(0,Math.min(image.width-1,p.x));markers[active].y=Math.max(0,Math.min(image.height-1,p.y));redraw();emit(); });
  viewport.addEventListener('pointerup', () => { drag=null;active=null; });
  viewport.addEventListener('wheel', event => { if(!image.width)return;event.preventDefault(); const before=scale;scale=Math.max(.1,Math.min(12,scale*(event.deltaY<0?1.14:.88))); const rect=viewport.getBoundingClientRect(),px=event.clientX-rect.left,py=event.clientY-rect.top;pan.x=px-(px-pan.x)*(scale/before);pan.y=py-(py-pan.y)*(scale/before);redraw();},{passive:false});
  document.getElementById('zoomIn').onclick=()=>{scale=Math.min(12,scale*1.25);redraw()};document.getElementById('zoomOut').onclick=()=>{scale=Math.max(.1,scale*.8);redraw()};document.getElementById('zoomReset').onclick=fit;document.getElementById('undo').onclick=()=>{markers.pop();redraw();emit()};
})();
