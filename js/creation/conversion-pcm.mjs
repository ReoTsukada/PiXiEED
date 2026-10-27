/** Bounded AIFF/AIFC PCM and Sun AU input; WAV/AIFF/AU PCM output. */
const MIME={wav:'audio/wav',aiff:'audio/aiff',au:'audio/basic'};
const bad=(message='音声ファイルの構造が壊れているか未対応の種類です。')=>{throw new Error(message);};
function range(b,p,n){if(!Number.isSafeInteger(p)||!Number.isSafeInteger(n)||p<0||n<0||p+n>b.length)bad();}
function str(b,p,n){range(b,p,n);return String.fromCharCode(...b.subarray(p,p+n));}
function valid(rate,count,frames){if(!Number.isInteger(rate)||rate<8000||rate>48000||![1,2].includes(count)||!Number.isInteger(frames)||frames<1||frames/rate>120||frames*count*4>64*1024*1024)bad('音声は120秒以内、モノラル/ステレオ、8〜48kHzにしてください。');}
export function sniffPcm(input){const b=input instanceof Uint8Array?input:new Uint8Array(input);if(b.length>=24&&str(b,0,4)==='.snd')return 'au';if(b.length>=12&&str(b,0,4)==='FORM'&&['AIFF','AIFC'].includes(str(b,8,4)))return 'aiff';return null;}
function extended(v,p){const exponent=v.getUint16(p),hi=v.getUint32(p+2),lo=v.getUint32(p+6);if(exponent&0x8000||(exponent&0x7fff)===0x7fff)bad('AIFFのサンプルレートが不正です。');return (hi*2**32+lo)*2**((exponent&0x7fff)-16383-63);}
function sample(v,p,bits,le){if(bits===8)return v.getInt8(p)/128;if(bits===16)return v.getInt16(p,le)/32768;if(bits===24){let n=le?v.getUint8(p)+v.getUint8(p+1)*256+v.getUint8(p+2)*65536:v.getUint8(p)*65536+v.getUint8(p+1)*256+v.getUint8(p+2);if(n&0x800000)n-=0x1000000;return n/8388608;}return v.getInt32(p,le)/2147483648;}
function muLaw(x){const u=(~x)&255;let s=((u&15)<<3)+132;s<<=(u>>4)&7;return ((u&128)?132-s:s-132)/32768;}
function aLaw(x){const a=x^0x55,exp=(a>>4)&7;let s=(a&15)<<4;s+=exp?264:8;if(exp>1)s<<=exp-1;return ((a&128)?s:-s)/32768;}
export function decodePcm(input,kind=sniffPcm(input)){
 const b=input instanceof Uint8Array?input:new Uint8Array(input);if(b.length>64*1024*1024)bad('音声ファイルは64MB以内です。');const v=new DataView(b.buffer,b.byteOffset,b.byteLength);let rate,count,frames,bits,start,length,le=false,code=0;
 if(kind==='aiff'){
  if(sniffPcm(b)!=='aiff')bad();const end=v.getUint32(4)+8;if(end>b.length||end<12)bad();let comm=null,sound=null;const compressed=str(b,8,4)==='AIFC';
  for(let p=12;p+8<=end;){const tag=str(b,p,4),n=v.getUint32(p+4);range(b,p+8,n);if(p+8+n>end)bad();if(tag==='COMM'){if(comm)bad();comm={p:p+8,n};}if(tag==='SSND'){if(sound)bad();sound={p:p+8,n};}p+=8+n+(n&1);}
  if(!comm||!sound||comm.n<(compressed?22:18)||sound.n<8)bad();count=v.getUint16(comm.p);frames=v.getUint32(comm.p+2);bits=v.getUint16(comm.p+6);rate=extended(v,comm.p+8);
  if(compressed){const codec=str(b,comm.p+18,4);if(!['NONE','twos','sowt'].includes(codec))bad('AIFCは非圧縮PCM（NONE/twos/sowt）のみ対応しています。');le=codec==='sowt';}
  const offset=v.getUint32(sound.p);if(offset>sound.n-8)bad();start=sound.p+8+offset;length=sound.n-8-offset;
 }else if(kind==='au'){
  if(sniffPcm(b)!=='au')bad();start=v.getUint32(4);length=v.getUint32(8);code=v.getUint32(12);rate=v.getUint32(16);count=v.getUint32(20);if(start<24||start>b.length)bad();if(length===0xffffffff)length=b.length-start;
  const widths={1:8,2:8,3:16,4:24,5:32,6:32,7:64,27:8};bits=widths[code];if(!bits)bad('AUはPCM・浮動小数点・μ-law・A-lawの音声に対応しています。');if(!count)bad();frames=length/(count*bits/8);
 }else bad('AIFFまたはAU音声を選んでください。');
 if(!(kind==='au'&&code===7)&&![8,16,24,32].includes(bits))bad('AIFFは8/16/24/32bit PCMに対応しています。');valid(rate,count,frames);const expected=frames*count*bits/8;if(expected>length)bad();range(b,start,expected);const channels=Array.from({length:count},()=>new Float64Array(frames));let p=start;
 for(let i=0;i<frames;i++)for(let c=0;c<count;c++){let value;if(kind==='au'&&code===1)value=muLaw(b[p]);else if(kind==='au'&&code===27)value=aLaw(b[p]);else if(kind==='au'&&[6,7].includes(code))value=code===6?v.getFloat32(p):v.getFloat64(p);else value=sample(v,p,bits,le);if(!Number.isFinite(value))bad('音声に不正な数値が含まれています。');channels[c][i]=Math.max(-1,Math.min(1,value));p+=bits/8;}
 return {channels,sampleRate:rate,durationSeconds:frames/rate};
}
export function encodePcm(source,format,{bitDepth=16}={}){
 if(!MIME[format]||![16,24,32].includes(bitDepth))bad('PCM保存形式またはビット深度が不正です。');const {channels,sampleRate:rate}=source||{},count=channels?.length,frames=channels?.[0]?.length;valid(rate,count,frames);if(!channels.every(c=>(c instanceof Float32Array||c instanceof Float64Array)&&c.length===frames))bad();
 const size=frames*count*bitDepth/8,start=format==='wav'?44:format==='aiff'?54:28,b=new Uint8Array(start+size+(size&1)),v=new DataView(b.buffer),put=(p,s)=>b.set(new TextEncoder().encode(s),p);
 if(format==='wav'){put(0,'RIFF');v.setUint32(4,b.length-8,true);put(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,count,true);v.setUint32(24,rate,true);v.setUint32(28,rate*count*bitDepth/8,true);v.setUint16(32,count*bitDepth/8,true);v.setUint16(34,bitDepth,true);put(36,'data');v.setUint32(40,size,true);}
 else if(format==='aiff'){put(0,'FORM');v.setUint32(4,b.length-8);put(8,'AIFFCOMM');v.setUint32(16,18);v.setUint16(20,count);v.setUint32(22,frames);v.setUint16(26,bitDepth);const exp=Math.floor(Math.log2(rate));v.setUint16(28,16383+exp);v.setBigUint64(30,BigInt(rate)<<BigInt(63-exp));put(38,'SSND');v.setUint32(42,size+8);}
 else{put(0,'.snd');v.setUint32(4,start);v.setUint32(8,size);v.setUint32(12,bitDepth/8+1);v.setUint32(16,rate);v.setUint32(20,count);}
 let p=start;const le=format==='wav',factor=2**(bitDepth-1);for(let i=0;i<frames;i++)for(let c=0;c<count;c++){const value=channels[c][i];if(!Number.isFinite(value))bad('音声に不正な数値が含まれています。');const n=Math.max(-factor,Math.min(factor-1,Math.round(Math.max(-1,Math.min(1,value))*factor)));if(bitDepth===16)v.setInt16(p,n,le);else if(bitDepth===32)v.setInt32(p,n,le);else{b[p+(le?0:2)]=n&255;b[p+1]=(n>>8)&255;b[p+(le?2:0)]=(n>>16)&255;}p+=bitDepth/8;}
 return new Blob([b],{type:MIME[format]});
}
