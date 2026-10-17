/** Final evidence only. Run after both immutable-artifact browser samples finish. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='docs/performance-20261017',read=p=>JSON.parse(fs.readFileSync(dir+'/'+p,'utf8'));
const before=read('before-browser.json'),after=read('after-browser.json'),build=read('after-build.json'),start=read('before-fingerprint.json');
for(const r of [before,after]){
 assert.equal(r.cases.length,180);assert.equal(r.cases.filter(c=>c.errors?.length||!c.readiness?.ready).length,0);
 const groups=new Map();for(const c of r.cases){const k=c.route+'@'+c.viewport.name;groups.set(k,(groups.get(k)||0)+1);}assert.equal(groups.size,60);assert.ok([...groups.values()].every(n=>n===3));
}
assert.equal(after.artifactRoot,build.output);
assert.equal(after.cases.filter(c=>c.firstAction?.attempted&&!c.firstAction?.success).length,0);
const sha=b=>createHash('sha256').update(b).digest('hex'),combined=m=>sha(JSON.stringify(m,Object.keys(m).sort()));
const list=(root,p='')=>fs.readdirSync(path.join(root,p),{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(root,path.join(p,e.name)):[path.join(p,e.name)]).sort();
const artifacts={};
for(const [phase,root]of [['before',before.artifactRoot],['after',after.artifactRoot]]){
 const map=Object.fromEntries(list(root).map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]));artifacts[phase]={root,files:Object.keys(map).length,combinedSha256:combined(map),sha256:map};
}
const names=[...new Set(['ls-files','ls-files --others --exclude-standard'].flatMap(command=>execFileSync('git',command.split(' ').concat('-z'),{encoding:'utf8'}).split('\0')))].filter(n=>n&&!['.git','docs','node_modules','.aws','.codex','.agents'].includes(n.split('/')[0])).sort();
const source=Object.fromEntries(names.map(p=>[p,sha(fs.readFileSync(p))]));
const changed=names.filter(p=>start.sha256[p]&&start.sha256[p]!==source[p]),added=names.filter(p=>!start.sha256[p]),removed=Object.keys(start.sha256).filter(p=>!source[p]);
const publicSourceDrift=Object.keys(build.sha256).filter(p=>!p.startsWith('scripts/')&&!p.startsWith('tests/')&&source[p]!==build.sha256[p]);assert.deepEqual(publicSourceDrift,[],'current application must match measured frozen source');
const forbidden=changed.filter(p=>/^(?:admin\/|supabase\/|\.github\/|data\/site-config|js\/ads\/|js\/adsense|js\/display-ads|ads\.txt$|_headers$|wrangler)/.test(p));assert.deepEqual(forbidden,[]);
const visible=s=>s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const html=Object.keys(artifacts.before.sha256).filter(p=>p.endsWith('.html')&&artifacts.after.sha256[p]);
const textDiff=html.filter(p=>visible(fs.readFileSync(path.join(before.artifactRoot,p),'utf8'))!==visible(fs.readFileSync(path.join(after.artifactRoot,p),'utf8')));assert.deepEqual(textDiff,[]);
const png=Object.keys(start.sha256).filter(p=>/^assets\/screenshots\/.*\.png$/.test(p));assert.ok(png.every(p=>source[p]===start.sha256[p]));
const failures=p=>[...fs.readFileSync(dir+'/'+p,'utf8').matchAll(/^not ok \d+ - (.*)$/gm)].map(m=>m[1]).sort();assert.deepEqual(failures('regression-unit.tap'),failures('baseline-existing-failures.tap'));
const now=new Date().toISOString(),write=(p,v)=>fs.writeFileSync(dir+'/'+p,JSON.stringify(v,null,2)+'\n');
write('artifact-fingerprints.json',{checkedAt:now,method:'SHA-256 per compiled public file; combined hash is SHA-256 of sorted JSON map path -> SHA-256',artifacts});
write('final-source-fingerprint.json',{checkedAt:now,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'current tracked + nonignored untracked source, excluding docs/private/tool directories; scripts/tests may differ from earlier build freeze while application source must match it',files:names.length,combinedSha256:combined(source),sha256:source,publicSourceDrift});
write('performance-changed-files.json',{checkedAt:now,comparison:'against performance-start working state, not HEAD',changed:changed.map(p=>({path:p,beforeSha256:start.sha256[p],afterSha256:source[p]})),added:added.map(p=>({path:p,sha256:source[p]})),removed,unchangedProtectedConfiguration:true,forbiddenChangedPaths:forbidden});
write('source-preservation.json',{checkedAt:now,beforeArtifactSha256:artifacts.before.combinedSha256,afterArtifactSha256:artifacts.after.combinedSha256,scope:'compiled HTML lexical text excluding script/style/comments/tags; separate from browser rendering and SEO HTTP checks',htmlFilesCompared:html.length,visibleTextDifferences:textDiff,originalScreenshotPngsCompared:png.length,changedOriginalPngs:[],publicSourceDrift});
write('progress.json',{updatedAt:now,status:'complete',beforeInitialCases:'180/180',afterFinalInitialCases:'180/180',cssTrial:'180 complete trial cases archived; omitted from final implementation',firstUse:'36/36 complete',regression:'all 7 functional harnesses pass; 1465/1472 unit pass; identical 7 failures reproduced before',remaining:'production/field/warm-cache/physical-device validation; no commit/push/publish'});
console.log(JSON.stringify({checkedAt:now,sourceFiles:names.length,sourceCombinedSha256:combined(source),changed:changed.length,added:added.length,removed:removed.length,artifacts:Object.fromEntries(Object.entries(artifacts).map(([p,r])=>[p,{files:r.files,combinedSha256:r.combinedSha256}])),htmlTextDifferences:textDiff.length,unchangedOriginalPngs:png.length,publicSourceDrift,existingTestFailures:failures('regression-unit.tap').length},null,2));
