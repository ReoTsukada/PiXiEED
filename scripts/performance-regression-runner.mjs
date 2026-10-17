/** Sequential local functional regression; do not run alongside timed performance samples. */
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='docs/performance-20261017/regression';mkdirSync(out,{recursive:true});
const scripts=['home-tool-grid-browser-harness.mjs','entry-integration-browser-harness.mjs','entry-camera-compat-browser-harness.mjs','tool-shell-save-browser-harness.mjs','home-map-navigation-browser-harness.mjs','performance-game-first-use-browser-harness.mjs','seo-http-harness.mjs'];
const report={startedAt:new Date().toISOString(),scope:'functional regression, isolated synthetic storage and blocked external requests; these are not performance samples',results:[]};
for(const script of scripts){
 const r=spawnSync(process.execPath,['scripts/'+script],{encoding:'utf8',timeout:240000,env:{...process.env,PIXIEED_BROWSER_BASE_URL:'http://127.0.0.1:4197'}});
 const row={script,exitCode:r.status,error:r.error?.message||null,completedAt:new Date().toISOString()};report.results.push(row);writeFileSync(out+'/'+script+'.log',(r.stdout||'')+(r.stderr||''));writeFileSync(out+'/results.json',JSON.stringify(report,null,2)+'\n');console.log(script,r.status===0?'PASS':'FAIL');
}
report.completedAt=new Date().toISOString();writeFileSync(out+'/results.json',JSON.stringify(report,null,2)+'\n');if(report.results.some(r=>r.exitCode!==0))process.exitCode=1;
