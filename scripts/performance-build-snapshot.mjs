/** Compile a reviewable site snapshot without regenerating files in the working checkout. */
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {dirname,join,resolve}from'node:path';
import {createHash}from'node:crypto';import {buildPagesSite}from'./build-pages-site.mjs?rev=20261018-direct-runtime-1';
const repo=process.cwd(),phase=process.env.PHASE||'after';if(!['before','after'].includes(phase))throw Error('PHASE must be before/after');
const scratch=await mkdtemp(join(tmpdir(),`pixieed-performance-${phase}-`)),root=join(scratch,'source');await mkdir(root);
const names=[...new Set(['ls-files','ls-files --others --exclude-standard'].flatMap(command=>execFileSync('git',command.split(' ').concat('-z'),{encoding:'utf8'}).split('\0')))].filter(n=>n&&!['.git','docs','node_modules','.aws','.codex','.agents'].includes(n.split('/')[0]));
const sha256={};for(const n of names){const bytes=await readFile(join(repo,n));sha256[n]=createHash('sha256').update(bytes).digest('hex');await mkdir(dirname(join(root,n)),{recursive:true});await copyFile(join(repo,n),join(root,n));}
execFileSync('git',['init','-q',root]);execFileSync('git',['add','.'],{cwd:root});
const result=await buildPagesSite({root,output:join(scratch,'site')});
const artifactFiles=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const record={phase,checkedAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source:root,...result,sourceFileCount:names.length,combinedSha256:createHash('sha256').update(JSON.stringify(sha256,Object.keys(sha256).sort())).digest('hex'),sha256,limits:'Untracked/ignored puzzle outputs are excluded from the copied source. Event output is regenerated only in this isolated source copy.'};
const evidenceDir=resolve(process.env.PIXIEED_PERF_OUTPUT||'docs/performance-20261017');await mkdir(evidenceDir,{recursive:true});
await writeFile(join(evidenceDir,`${phase}-build.json`),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({...result,source:root,combinedSha256:record.combinedSha256}));
