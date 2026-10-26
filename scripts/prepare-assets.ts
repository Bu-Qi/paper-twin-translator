import {cp,mkdir,copyFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pdf=join(root,'node_modules','pdfjs-dist'),ui=join(root,'ui'),vendor=join(ui,'vendor');
await mkdir(vendor,{recursive:true});
await copyFile(join(pdf,'build','pdf.mjs'),join(vendor,'pdf.mjs'));
await copyFile(join(pdf,'build','pdf.worker.mjs'),join(vendor,'pdf.worker.mjs'));
await copyFile(join(pdf,'LICENSE'),join(vendor,'PDFJS-LICENSE'));
for(const directory of ['cmaps','standard_fonts','wasm'])await cp(join(pdf,directory),join(vendor,directory),{recursive:true});
async function files(dir:string):Promise<string[]>{let out:string[]=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='tests')continue;const path=join(dir,entry.name);if(entry.isDirectory())out.push(...await files(path));else if(entry.isFile()&&!entry.name.endsWith('.md'))out.push(path);}return out;}
const list=(await files(ui)).sort(),imports:string[]=[],map:string[]=[];
for(const [i,path] of list.entries()){const name=relative(ui,path).replaceAll('\\','/');imports.push(`import file${i} from ${JSON.stringify('./ui/'+name)} with { type: "file" };`);map.push(`${JSON.stringify('/'+name)}:file${i}`);}
await writeFile(join(root,'assets.ts'),imports.join('\n')+'\nexport default {'+map.join(',')+'} as Record<string,string>;\n');
console.log(`Prepared ${list.length} embedded assets (PDF.js 5.6.205).`);
