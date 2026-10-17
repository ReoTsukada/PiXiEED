#!/usr/bin/env python3
"""Generate lossless responsive UI previews; full Maou screenshots stay unchanged."""
from pathlib import Path
from PIL import Image
import json
from io import BytesIO
root=Path(__file__).resolve().parents[1]; target=root/'assets/screenshots/previews';target.mkdir(exist_ok=True)
rows=[]
for source in sorted((root/'assets/screenshots').glob('*-maou.png')):
 with Image.open(source) as image:
  variants=[]; seen=set(); original=BytesIO();image.convert("RGBA").save(original,"WEBP",lossless=True,method=6)
  for width in sorted({min(480,image.width),min(960,image.width)}):
   height=round(image.height*width/image.width);dest=target/f'{source.stem}-{width}.webp'
   preview=image.convert('RGBA').resize((width,height),Image.Resampling.LANCZOS)
   data=BytesIO();preview.save(data,'WEBP',lossless=True,method=6)
   if len(data.getvalue())>len(original.getvalue()):
    width,height=image.size;dest=target/f'{source.stem}-{width}.webp';data=original
   if width in seen:continue
   seen.add(width);dest.write_bytes(data.getvalue())
   variants.append({'path':'/'+dest.relative_to(root).as_posix(),'width':width,'height':height,'bytes':dest.stat().st_size})
  rows.append({'source':'/'+source.relative_to(root).as_posix(),'sourceBytes':source.stat().st_size,'sourceWidth':image.width,'sourceHeight':image.height,'variants':variants})
(root/'docs/performance-20261017/image-previews.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'sources':len(rows),'variants':sum(len(r['variants'])for r in rows),'bytes':sum(v['bytes']for r in rows for v in r['variants'])}))
