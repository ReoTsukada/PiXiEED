#!/usr/bin/env node
// Compare repeated local-only browser measurements and merge coverage with static route inventory.
// Generic readiness is a DOM/navigation proxy; the post-observation action is not INP.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs/performance-20261017');
const BEFORE_JSON = path.join(DOCS, process.env.PIXIEED_PERF_BEFORE || 'before-browser.json');
const AFTER_JSON = path.join(DOCS, process.env.PIXIEED_PERF_AFTER || 'after-browser.json');
const BEFORE_JSONL = path.join(DOCS, 'before-browser.jsonl');
const AFTER_JSONL = path.join(DOCS, 'after-browser.jsonl');
const INVENTORY_JSON = path.join(DOCS, 'route-inventory.json');
const OUT_JSON = path.join(DOCS, 'performance-comparison.json');
const OUT_MD = path.join(DOCS, 'performance-comparison.md');

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
function readJsonl(file) {
  try {
    const cases=[];let summary=null;
    for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean)) {
      try { const row=JSON.parse(line); if(row.recordType==='summary')summary=row;else cases.push(row); } catch {}
    }
    return {cases,summary};
  } catch (e) { if (e.code === 'ENOENT') return {cases:[],summary:null}; throw e; }
}
function loadMeasurement(jsonFile, jsonlFile, phase) {
  const root=readJson(jsonFile);
  const jsonCases=Array.isArray(root?.cases)?root.cases:[];
  const lineData=readJsonl(jsonlFile),lineCases=lineData.cases;
  // A running harness flushes JSONL as each case completes; its final JSON can be stale or absent.
  const cases=lineCases.length>jsonCases.length?lineCases:jsonCases;
  const jsonlPreferred=lineCases.length>jsonCases.length;
  const source=jsonlPreferred?path.basename(jsonlFile):path.basename(jsonFile);
  const generatedAt=(jsonlPreferred?lineData.summary?.generatedAt:null)||root?.generatedAt||lineData.summary?.generatedAt||null;
  if (!cases.length) return { available:false, phase, source:fs.existsSync(jsonFile)?path.basename(jsonFile):path.basename(jsonlFile), generatedAt, cases:[], warning:`No ${phase} measurement cases were found.` };
  return { available:true,phase,source,generatedAt,artifactRoot:root?.artifactRoot||null,caseCount:cases.length,routes:root?.routes||[...new Set(cases.map(c=>c.route))],viewports:root?.viewports||uniqueBy(cases.map(c=>c.viewport).filter(Boolean),v=>v.name),runsPerRouteViewport:root?.runsPerRouteViewport||null,cases };
}
function uniqueBy(rows,keyFn) { const m=new Map();for(const x of rows)m.set(keyFn(x),x);return [...m.values()]; }
function keyOf(route,viewport) { return `${route}\u0000${viewport}`; }
function finite(v) { return typeof v==='number'&&Number.isFinite(v); }
function median(values) { if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2; }
function stats(values) {
  const xs=values.filter(finite);
  if(!xs.length)return {n:0,median:null,min:null,max:null};
  return {n:xs.length,median:median(xs),min:Math.min(...xs),max:Math.max(...xs)};
}
function groupCases(cases) {
  const groups=new Map();
  for(const c of cases) {
    const viewport=typeof c.viewport==='string'?c.viewport:(c.viewport?.name||`${c.viewport?.width||'?'}x${c.viewport?.height||'?'}`);
    const key=keyOf(c.route||'unknown',viewport);
    if(!groups.has(key))groups.set(key,{route:c.route||'unknown',viewport,samples:[]});
    groups.get(key).samples.push(c);
  }
  return groups;
}
function summarizeGroup(group) {
  const xs=group.samples;
  const readinessKinds=[...new Set(xs.map(x=>x.readiness?.kind).filter(Boolean))];
  const genericCount=xs.filter(x=>x.readiness?.kind==='generic-dom-and-navigation'||x.readiness?.kind==='generic-dom-proxy').length;
  const genericProxyCount=xs.filter(x=>x.readiness?.kind==='generic-dom-and-navigation').length;
  const readyCount=xs.filter(x=>x.readiness?.ready===true).length;
  const timedOutCount=xs.filter(x=>x.readiness?.timedOut===true||x.readiness?.ready===false).length;
  const first=xs.map(x=>x.firstAction).filter(Boolean);
  const reqs=xs.map(x=>x.navigationRequestSummary||x.initialNavigationRequestSummary||null).filter(Boolean);
  return {
    sampleCount:xs.length,
    runNumbers:xs.map(x=>x.run).filter(x=>x!=null).sort((a,b)=>a-b),
    readiness:{kinds:readinessKinds,readyCount,timedOutCount,elapsedMs:stats(xs.map(x=>x.readiness?.elapsedMs)),genericDomProxyCount:genericProxyCount,interpretation:genericProxyCount?'DOM/navigation proxy; not application-ready timing':'route-specific signal when available; see kinds'},
    metrics:{
      mainLcpMs:stats(xs.map(x=>x.metrics?.lcp?.finalValueMs)),
      mainFcpMs:stats(xs.map(x=>x.metrics?.paint?.firstContentfulPaint)),
      domContentLoadedMs:stats(xs.map(x=>x.metrics?.navigation?.domContentLoadedEventEnd)),
      clsLabSum:stats(xs.map(x=>x.metrics?.cls?.value)),
      mainLongTaskCount:stats(xs.map(x=>x.metrics?.longTasks?.count)),
      mainLongTaskDurationMs:stats(xs.map(x=>x.metrics?.longTasks?.sumMs)),
      initialNavigationRequestCount:stats(reqs.map(x=>x.count)),
      initialNavigationEncodedBytes:stats(reqs.map(x=>x.encodedDataLengthBytes)),
      firstActionElapsedMs:stats(first.map(x=>x.durationMs)),
      firstActionSuccessCount:first.filter(x=>x.success===true).length,
      firstActionAttemptCount:first.filter(x=>x.attempted===true).length,
      firstActionKinds:[...new Set(first.map(x=>x.kind).filter(Boolean))],
      firstActionInterpretation:'Post-observation harness action duration and success; this is not INP.'
    }
  };
}
function fmt(value, digits=1) { return value==null?'—':Number(value).toLocaleString('en-US',{maximumFractionDigits:digits}); }
function statCell(stat,suffix='') { return stat?.n?`${fmt(stat.median)}${suffix} [${fmt(stat.min)}–${fmt(stat.max)}; n=${stat.n}]`:'—'; }
function pct(before,after) { if(!finite(before)||before===0||!finite(after))return null;return (after-before)/before*100; }
function compareMetric(b,a) { return {before:b,after:a,deltaMedian:a?.median!=null&&b?.median!=null?a.median-b.median:null,deltaPercentMedian:pct(b?.median,a?.median)}; }
function readInventory() {
  const d=readJson(INVENTORY_JSON);
  if(!d)return {routes:[],warning:'Static route inventory is missing.'};
  return {routes:d.routes||[],summary:d.summary||{},file:path.basename(INVENTORY_JSON)};
}
function build() {
  const before=loadMeasurement(BEFORE_JSON,BEFORE_JSONL,'before');
  const after=loadMeasurement(AFTER_JSON,AFTER_JSONL,'after');
  const inventory=readInventory();
  const bg=groupCases(before.cases), ag=groupCases(after.cases);
  const keys=new Set([...bg.keys(),...ag.keys()]);
  const invByRoute=new Map(inventory.routes.map(r=>[r.route,r]));
  const routeGroups=[];
  for(const key of keys) {
    const b=bg.get(key),a=ag.get(key),first=b||a;
    const bs=b?summarizeGroup(b):null,as=a?summarizeGroup(a):null;
    const bm=bs?.metrics||{},am=as?.metrics||{};
    const inventoryRoute=invByRoute.get(first.route);
    const metricNames=['mainLcpMs','mainFcpMs','domContentLoadedMs','clsLabSum','mainLongTaskCount','mainLongTaskDurationMs','initialNavigationRequestCount','initialNavigationEncodedBytes','firstActionElapsedMs'];
    const metricComparisons=Object.fromEntries(metricNames.map(name=>[name,compareMetric(bm[name],am[name])]));
    routeGroups.push({route:first.route,viewport:first.viewport,inventory:inventoryRoute?{audience:inventoryRoute.audience,sitemap:inventoryRoute.sitemap,canonical:inventoryRoute.canonical,aliasOf:inventoryRoute.aliasOf,noindex:inventoryRoute.noindex}:null,before:bs,after:as,comparison:metricComparisons});
  }
  routeGroups.sort((a,b)=>a.route.localeCompare(b.route)||a.viewport.localeCompare(b.viewport));
  const measuredRoutes=new Set([...before.cases,...after.cases].map(c=>c.route).filter(Boolean));
  const allInventoryRoutes=inventory.routes.map(r=>r.route);
  const missingInventory=allInventoryRoutes.filter(r=>!measuredRoutes.has(r));
  const unknownMeasured=[...measuredRoutes].filter(r=>!invByRoute.has(r));
  const output={
    generatedAt:new Date().toISOString(),
    methodology:{aggregation:'Per route and viewport, aggregate available repetitions with median, minimum, and maximum.',lcp:'Main-frame final LCP observation in milliseconds.',fcp:'Main-frame first-contentful-paint in milliseconds.',dcl:'Navigation Timing domContentLoadedEventEnd in milliseconds.',readiness:'Route signal wait elapsed from navigation. Generic DOM/navigation readiness is explicitly a DOM proxy, not application-ready.',cls:'Lab session sum of layout-shift entries excluding hadRecentInput=true.',longTasks:'Main-frame long-task count and summed duration; iframe values remain available in source measurement.',requests:'Initial navigation request summary captured before the post-observation first action.',firstAction:'Post-observation harness action elapsed time and success; not INP.',bytes:'CDP encodedDataLength bytes, not decoded asset size.'},
    inputs:{before:{available:before.available,source:before.source,generatedAt:before.generatedAt,caseCount:before.caseCount||0,artifactRoot:before.artifactRoot||null,warning:before.warning||null},after:{available:after.available,source:after.source,generatedAt:after.generatedAt,caseCount:after.caseCount||0,artifactRoot:after.artifactRoot||null,warning:after.warning||null}},
    staticInventoryCoverage:{source:inventory.file||null,staticHtmlRoutes:allInventoryRoutes.length,measuredDistinctRoutes:measuredRoutes.size,measuredRoutes:[...measuredRoutes].sort(),unmeasuredStaticRoutes:missingInventory,unmeasuredStaticRouteCount:missingInventory.length,measuredRoutesNotInStaticInventory:unknownMeasured,scopeNote:'Browser coverage is limited to routes present in before/after measurement inputs; static inventory route rows are not mutated.'},
    routeViewportGroups:routeGroups,
    caveats:['A `generic-dom-and-navigation` readiness sample is only a DOM/navigation proxy.','The post-observation `firstAction` duration is a harness interaction check and must not be called INP.','Only route/viewport groups present in each measurement input are compared; missing after data is shown as unavailable.']
  };
  return output;
}
function markdown(report) {
  const lines=['# PiXiEED performance comparison','',`Generated ${report.generatedAt}. Before: ${report.inputs.before.available?`${report.inputs.before.caseCount} case(s) in ${report.inputs.before.source}`:'unavailable'}. After: ${report.inputs.after.available?`${report.inputs.after.caseCount} case(s) in ${report.inputs.after.source}`:'unavailable'}.`,'',
    `Static inventory coverage: **${report.staticInventoryCoverage.measuredDistinctRoutes}/${report.staticInventoryCoverage.staticHtmlRoutes}** routes measured; ${report.staticInventoryCoverage.unmeasuredStaticRouteCount} static routes remain without browser samples. Coverage is joined into this report only; the inventory artifact is unchanged.`, '',
    'Generic readiness means a DOM/navigation proxy. First-action time is a post-observation harness interaction, not INP. CLS is the lab session sum excluding shifts with recent input. Request bytes are CDP encoded response lengths.', '',
    '| Route | Viewport | Metric | Before median [min–max; n] | After median [min–max; n] | Median change |', '|---|---|---|---:|---:|---:|'];
  const rows=[['LCP','mainLcpMs',' ms'],['FCP','mainFcpMs',' ms'],['DCL','domContentLoadedMs',' ms'],['Readiness','readiness.elapsedMs',' ms'],['CLS lab sum','clsLabSum',''],['Main long-task count','mainLongTaskCount',''],['Main long-task duration','mainLongTaskDurationMs',' ms'],['Initial nav requests','initialNavigationRequestCount',''],['Initial nav encoded bytes','initialNavigationEncodedBytes',' B'],['First action','firstActionElapsedMs',' ms']];
  const get=(g,pathExpr)=>pathExpr==='readiness.elapsedMs'?g?.readiness?.elapsedMs:g?.metrics?.[pathExpr];
  for(const g of report.routeViewportGroups) for(const [label,key,suffix] of rows) {
    const b=get(g.before,key),a=get(g.after,key),cmp=g.comparison[key];
    const delta=cmp?.deltaMedian==null?'—':`${cmp.deltaMedian>0?'+':''}${fmt(cmp.deltaMedian)}${suffix}`;
    lines.push(`| \`${g.route}\` | ${g.viewport} | ${label} | ${statCell(b,suffix)} | ${statCell(a,suffix)} | ${delta} |`);
  }
  lines.push('','## Readiness and first-action status','');
  for(const g of report.routeViewportGroups) {
    const f=g.before?.metrics.firstActionSuccessCount??0,fa=g.before?.metrics.firstActionAttemptCount??0;
    const a=g.after?.metrics.firstActionSuccessCount??0,aa=g.after?.metrics.firstActionAttemptCount??0;
    const bReady=g.before?`${g.before.readiness.readyCount}/${g.before.sampleCount} ready; ${g.before.readiness.kinds.join(', ')||'no kind'}`:'—';
    const aReady=g.after?`${g.after.readiness.readyCount}/${g.after.sampleCount} ready; ${g.after.readiness.kinds.join(', ')||'no kind'}`:'—';
    lines.push(`- \`${g.route}\` at ${g.viewport}: readiness before ${bReady}; after ${aReady}. First action success before ${f}/${fa}; after ${a}/${aa}.`);
  }
  lines.push('','## Static routes not represented in browser samples','',...(report.staticInventoryCoverage.unmeasuredStaticRoutes.length?report.staticInventoryCoverage.unmeasuredStaticRoutes.map(r=>`- \`${r}\``):['- None.']),'','Full per-route/viewport statistics and inventory metadata are in [`performance-comparison.json`](performance-comparison.json).','');
  return lines.join('\n');
}

const report=build();
fs.writeFileSync(OUT_JSON,JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(OUT_MD,markdown(report));
console.log(`Wrote ${path.relative(ROOT,OUT_JSON)} and ${path.relative(ROOT,OUT_MD)}`);
console.log(`Browser coverage: ${report.staticInventoryCoverage.measuredDistinctRoutes}/${report.staticInventoryCoverage.staticHtmlRoutes} static routes; before=${report.inputs.before.caseCount||0}, after=${report.inputs.after.caseCount||0} cases.`);
