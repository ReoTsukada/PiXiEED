import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
if (process.argv.length !== 3) throw new Error('Usage: node scripts/file-list-site/build.mjs <empty output directory>');
const dest = resolve(process.argv[2]);
await mkdir(dest, { recursive: true });
if ((await readdir(dest)).length) throw new Error('Output must be empty');
const local = ['library-import/index.html','library-import/start.mjs','library/index.html','library/list.mjs','library/advert.mjs','library/ready.txt','style.css','_headers','envelope.mjs','404.html'];
const shared = ['ads.txt','js/display-ads.mjs','js/adsense-offerwall-policy.js','data/draw-display-ad-config.mjs','data/site-config.js','data/project-gallery-ad-config.mjs'];
for (const [src, out] of [...local.map(f => [resolve(here,f),f]),...shared.map(f => [resolve(root,f),f]),[resolve(root,'assets/learn/heart-16.png'),'heart-16.png']]) {
  await mkdir(dirname(resolve(dest,out)), { recursive: true });
  await copyFile(src, resolve(dest,out));
}
