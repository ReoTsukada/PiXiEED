import { decodeRaster, encodeRaster } from './conversion-raster.mjs?rev=20261028-conversion-1';
import { decodePcm, encodePcm } from './conversion-pcm.mjs?rev=20261028-conversion-1';
// One operation per worker. Termination is the cancellation mechanism.
self.onmessage = async ({data:request}) => {
 try {
  const {operation,source,format,options}=request;
  let result;
  if(operation==='decode-raster') result=decodeRaster(source,format);
  else if(operation==='encode-raster') result=encodeRaster(source,format,options);
  else if(operation==='decode-pcm') result=decodePcm(source,format);
  else if(operation==='encode-pcm') result=encodePcm(source,format,options);
  else throw new Error('未対応の処理です。');
  self.postMessage({ok:true,result});
 } catch(error) { self.postMessage({ok:false,message:error?.message||'変換できませんでした。'}); }
};
