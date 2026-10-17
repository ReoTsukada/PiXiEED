/** Same sampler/conditions as the original, with separate output and CLS attribution. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const repo=process.cwd(),out=process.env.PIXIEED_PERF_OUTPUT;
if(!out)throw Error('Set PIXIEED_PERF_OUTPUT to a separate follow-up evidence directory');
let source=fs.readFileSync('scripts/performance-browser-harness.mjs','utf8');
source=source.replace(/^const REPO = .*$/m,'const REPO = '+JSON.stringify(repo)+';');
source=source.replace("const outputDir=path.join(REPO,'docs','performance-20261017');","const outputDir="+JSON.stringify(path.resolve(out))+';');
const old="observe('layout-shift', e => state.layoutShifts.push({ startTime:e.startTime, value:e.value, hadRecentInput:e.hadRecentInput }));";
if(!source.includes(old))throw Error('Observer marker changed');
source=source.replace(old,"observe('layout-shift', e => state.layoutShifts.push({ startTime:e.startTime, value:e.value, hadRecentInput:e.hadRecentInput, sources:(e.sources||[]).map(s=>({node:s.node?.outerHTML?.slice(0,350)||s.node?.nodeName,previous:s.previousRect.toJSON(),current:s.currentRect.toJSON()})), htmlClass:document.documentElement.className,bodyClass:document.body?.className,header:document.querySelector('header')?.getBoundingClientRect().toJSON() }));");
source=source.replace("cls:{value:shifts.filter", "cls:{entries:shifts,value:shifts.filter");
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'sampler-with-attribution.mjs'),source);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pixieed-cls-sampler-')),file=path.join(temp,'sampler.mjs');fs.writeFileSync(file,source);
try{const r=spawnSync(process.execPath,[file],{stdio:'inherit',env:process.env});process.exitCode=r.status??1;}finally{fs.rmSync(temp,{recursive:true,force:true});}
