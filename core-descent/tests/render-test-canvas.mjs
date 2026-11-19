/** Operation recorder, not a pixel renderer. Browser QA checks actual artwork. */
export class TestCanvas {
  constructor(width=800,height=600){this.width=width;this.height=height;this.clientWidth=width;this.clientHeight=height;this.context=new TestContext();}
  getContext(){return this.context;}
}
export class TestContext {
  constructor(){this.calls=[];this.fillStyle='#000';this.globalAlpha=1;}
  gradient(method,args){const call={method,args,stops:[]};this.calls.push(call);return {addColorStop(at,color){call.stops.push({at,color});}};}
  createLinearGradient(...args){return this.gradient('createLinearGradient',args);}
  createRadialGradient(...args){return this.gradient('createRadialGradient',args);}
  createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};}
}
for(const method of ['save','restore','translate','scale','rotate','setTransform','beginPath','closePath','rect','clip','arc','ellipse','moveTo','lineTo','stroke','fill','clearRect','strokeRect','fillRect','drawImage','fillText','putImageData']) {
  TestContext.prototype[method]=function(...args){this.calls.push({method,args,alpha:this.globalAlpha,fillStyle:this.fillStyle});};
}
export function withCanvas(run){const previous=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=TestCanvas;try{return run();}finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}}
