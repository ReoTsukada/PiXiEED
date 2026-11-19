import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Small offline bundler for this fixed set of named ES modules. Module scopes
// stay isolated: renderer-local identifiers cannot shadow combat calculations.
const modules=['weapons','catalog','items','core','loot','world','map','fog','combat-math','engine','rankings','boss','market','sprites','renderer','weapon-ui','camp-ui','app'];
let source='"use strict";\nconst __modules=Object.create(null);\n';
const resolved=new Set();
for(const name of modules){
 let content=await readFile(root+`src/${name}.mjs`,'utf8');
 const exports=[...content.matchAll(/^export\s+(?:const|let|function|class)\s+([\w$]+)/gm)].map(m=>m[1]);
 content=content.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)\.mjs['"];?/gm,(_line,names,dependency)=>{
  if(!resolved.has(dependency))throw new Error(`Dependency order: ${name} imports ${dependency}`);
  return `const {${names.replace(/\s+as\s+/g,':')}}=__modules[${JSON.stringify(dependency)}];`;
 }).replace(/^export (?=(?:const|let|function|class)\b)/gm,'');
 if(/^\s*(?:import|export)\s/m.test(content))throw new Error(`Unsupported module syntax in ${name}`);
 source+=`\n// module: ${name}\n__modules[${JSON.stringify(name)}]=(()=>{\n${content}\nreturn {${exports.join(',')}};\n})();\n`;
 resolved.add(name);
}
const css=await readFile(root+'src/style.css','utf8');
const shell=await readFile(root+'src/shell.html','utf8');
const html=shell.replace('/*__STYLE__*/',()=>css).replace('/*__SCRIPT__*/',()=>`(()=>{\n${source}\n})();`);
await mkdir(root+'dist',{recursive:true});
await writeFile(root+'dist/index.html',html);await writeFile(root+'dist/bundle.js',source);
// The PiXiEED static publisher includes only this entry in /core-descent/.
await writeFile(root+'index.html',html);
console.log(`Built index.html and dist/index.html (${Buffer.byteLength(html)} bytes; no runtime dependencies).`);
const {WEAPONS}=await import('../src/weapons.mjs');
const {CORE_DEFS,RARITIES,ROLL_MIN,ROLL_MAX}=await import('../src/catalog.mjs');
await mkdir(root+'data',{recursive:true});
await writeFile(root+'data/core-catalog.json',JSON.stringify({version:'0.8.0',source:'src/catalog.mjs',generated:true,weapons:WEAPONS,definitions:CORE_DEFS,rarities:RARITIES,rollRange:[ROLL_MIN,ROLL_MAX]},null,2));
