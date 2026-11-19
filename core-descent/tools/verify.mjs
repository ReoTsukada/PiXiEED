import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
for(const args of [['tools/build.mjs'],['--test'],['tools/puzzle-audit.mjs','9']]){
 const result=spawnSync(process.execPath,args,{cwd,stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
console.log('Build, tests and puzzle audit passed. Online / device / persistence testing remains separate.');
