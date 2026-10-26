import*as pdfjs from'./vendor/pdf.mjs';
import{DEFAULTS,splitText,translate,hash,isPahlavi}from'./core.js';
import*as db from'./db.js';
import{initSelection}from'./selection.js';
pdfjs.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.mjs';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),detached=params.get('view')==='translation';
if(detached)document.body.classList.add('detached');
let doc=null,pdf=null,page=0,channel=null,busy=false,importing=false,abort=null,profile='',settings={...DEFAULTS},renderVersion=0,scrollLock=false,translationWindow=null,translationDocId=null;
const source=$('source'),target=$('target');
const status=t=>$('status').textContent=t;
const selection=initSelection({source,target,configure:async()=>{await loadSettings();return{settings:{...settings},profile};}});
let pdfRenderTask=null,pdfTextTask=null;
async function loadSettings(){settings={...DEFAULTS,...(await chrome.storage.local.get('settings')).settings};profile=await hash(JSON.stringify([settings.endpoint,settings.model,settings.language,settings.domain,settings.glossary,settings.sourceLanguage,settings.pahlaviFormat,'philology-v1']));$('targetLabel').textContent=settings.language+' · '+(isPahlavi(settings)?'帕拉维语辅助释读（需校订）':settings.domain);$('languageNotice').hidden=!isPahlavi(settings);target.dir=settings.language==='波斯语（Persian）'?'rtl':'auto';}
const cacheKey=(p,i)=>`tr:${doc.id}:${profile}:${p}:${i}`;
function controls(){const locked=busy||importing;$('all').disabled=locked||!doc;$('current').disabled=locked||!doc;$('stop').disabled=!busy;$('prev').disabled=importing||!doc||page===0;$('next').disabled=importing||!doc||page>=doc.pages.length-1;$('file').disabled=locked;$('paste').disabled=locked;$('library').disabled=locked;}
function cancel(){abort?.abort();}
async function openDoc(id){
 cancel();renderVersion++;
 const item=await db.get('doc:'+id);if(!item)throw Error('记录不存在，请重新导入文件');
 const old=pdf;pdf=null;if(old)await old.destroy();doc=item;page=0;
 if(doc.pdf)pdf=await pdfjs.getDocument({data:doc.pdf.slice(),cMapUrl:'./vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/standard_fonts/',wasmUrl:'./vendor/wasm/'}).promise;
 channel?.close();channel=new BroadcastChannel('paper-twin:'+doc.id);
 channel.onmessage=async({data})=>{
  if(data.type==='ready'&&!detached)channel.postMessage({type:'page',page});
  if(data.type==='cleared'){cancel();location.href=chrome.runtime.getURL('reader.html');return;}
  if(data.type==='page'&&data.page!==page){page=data.page;await render();}
  if(data.type==='translation'&&data.page===page)await renderTranslations();
  if(data.type==='scroll'&&$('sync').checked){if(data.page!==page){page=data.page;await render();}setScroll(source,data.ratio);setScroll(target,data.ratio);}
 };
 const url=new URL(location.href);url.searchParams.delete('capture');url.searchParams.set('doc',id);history.replaceState({},'',url);
 $('title').textContent=doc.title;$('meta').textContent=`${doc.kind} · ${doc.pages.length} 页 / 组 · 自动本地保存`;
 await loadSettings();await render();if(detached)channel.postMessage({type:'ready'});status(isPahlavi(settings)?'帕拉维语试验性释读 · 准确率尚未验证，请核对转写文本并人工校订':'文献已加载。点击翻译本页，或翻译全文。');
}
async function saveDoc(item){
 await db.put('doc:'+item.id,item);
 const history=await db.get('history')||[];
 await db.put('history',[{id:item.id,title:item.title,date:Date.now()},...history.filter(x=>x.id!==item.id)]);
 await openDoc(item.id);
}
function buildTextPages(text){const chunks=splitText(text);if(!chunks.length)throw Error('未检测到有效正文');const pages=[];for(let i=0;i<chunks.length;i+=6)pages.push({chunks:chunks.slice(i,i+6)});return pages;}
async function importText(title,text,kind='文本'){
 if(!text.trim())throw Error('请输入文献文本');await saveDoc({id:await hash(text),title:title||'未命名文献',kind,pages:buildTextPages(text)});
}
function pdfPageText(content){
 // PDF text objects follow the document's internal order; blank lines mark paragraph boundaries.
 let text='',lastY=null,lastHeight=0;
 for(const it of content.items){if(!('str'in it))continue;const y=it.transform[5];
  if(lastY!==null&&Math.abs(y-lastY)>Math.max(lastHeight*1.8,18))text+='\n\n';
  text+=it.str+(it.hasEOL?'\n':' ');lastY=y;lastHeight=it.height||10;
 }
 return text.replace(/([A-Za-z])-\n(?=[a-z])/g,'$1').replace(/([^\n])\n([^\n])/g,'$1 $2');
}
$('file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 if(busy||importing)return;importing=true;controls();
 try{
  if(file.size>100*1024*1024)throw Error('文件超过 100MB，请拆分后导入');
  if(!file.name.toLowerCase().endsWith('.pdf')){await importText(file.name,await file.text());return;}
  status('正在读取 PDF…');const bytes=new Uint8Array(await file.arrayBuffer());
  const p=await pdfjs.getDocument({data:bytes.slice(),cMapUrl:'./vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/standard_fonts/',wasmUrl:'./vendor/wasm/'}).promise;
  try{const pages=[];for(let n=1;n<=p.numPages;n++){status(`正在提取 PDF 文本 ${n} / ${p.numPages}…`);const pg=await p.getPage(n);pages.push({chunks:splitText(pdfPageText(await pg.getTextContent()))});pg.cleanup();}
   await saveDoc({id:await hash(bytes),title:file.name,kind:'PDF',pdf:bytes,pages});
   if(!pages.some(x=>x.chunks.length))status('这是扫描件或无文字层 PDF：可查看原文，翻译前请先使用 OCR。');
  }finally{await p.destroy();}
 }catch(e){status('导入失败：'+e.message);}finally{importing=false;$('file').value='';controls();}
};
async function render(){
 selection.reset();pdfRenderTask?.cancel();pdfTextTask?.cancel();const v=++renderVersion;source.replaceChildren();target.replaceChildren();if(!doc)return;
 $('pageLabel').textContent=`${page+1} / ${doc.pages.length}`;controls();
 if(pdf&&!detached){
  const pg=await pdf.getPage(page+1);if(v!==renderVersion)return;
  const base=pg.getViewport({scale:1}),css=getComputedStyle(source),width=source.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
  const viewport=pg.getViewport({scale:Math.max(0.2,width/base.width)}),dpr=window.devicePixelRatio||1;
  const shell=document.createElement('div');shell.className='pdf-page-shell';shell.style.width=viewport.width+'px';shell.style.height=viewport.height+'px';shell.style.setProperty('--total-scale-factor',viewport.scale);source.append(shell);
  const canvas=document.createElement('canvas');canvas.className='pagecanvas';canvas.width=Math.ceil(viewport.width*dpr);canvas.height=Math.ceil(viewport.height*dpr);shell.append(canvas);
  const layer=document.createElement('div');layer.className='textLayer';shell.append(layer);
  pdfRenderTask=pg.render({canvasContext:canvas.getContext('2d'),viewport,transform:dpr===1?null:[dpr,0,0,dpr,0,0]});
  pdfTextTask=new pdfjs.TextLayer({textContentSource:pg.streamTextContent(),container:layer,viewport});
  try{await Promise.all([pdfRenderTask.promise,pdfTextTask.render()]);}catch(e){if(e.name==='RenderingCancelledException'||e.name==='AbortException')return;throw e;}if(v!==renderVersion)return;

 }else if(!detached){doc.pages[page].chunks.forEach((text,i)=>{const p=document.createElement('p');p.className='block';p.dir='auto';p.dataset.index=i;p.textContent=text;source.append(p);});}
 await renderTranslations();source.scrollTop=0;target.scrollTop=0;
}
async function renderTranslations(){
 if(!doc)return;const id=doc.id,p=page,ver=renderVersion,frag=document.createDocumentFragment();
 const chunks=doc.pages[p].chunks;
 if(!chunks.length){const el=document.createElement('p');el.className='pending';el.textContent='本页未识别到文字（图片、空白页或扫描件），需要先 OCR。';frag.append(el);}
 for(let i=0;i<chunks.length;i++){
  const saved=await db.get(cacheKey(p,i));const el=document.createElement('div');el.className='block';el.dir='auto';el.dataset.index=i;
  if(saved?.text){el.textContent=saved.text;}else{
   el.classList.add('pending');const text=document.createElement('div');text.textContent=`段落 ${i+1} · 待翻译\n${chunks[i].slice(0,100)}…`;el.append(text);
   if(!detached){const b=document.createElement('button');b.className='retry';b.textContent='翻译此段';b.disabled=busy;b.onclick=()=>run([{p,i}]);el.append(b);}
  }
  el.onmouseenter=()=>{source.querySelectorAll('.active').forEach(x=>x.classList.remove('active'));source.querySelector(`[data-index="${i}"]`)?.classList.add('active');};frag.append(el);
 }
 if(doc.id===id&&page===p&&ver===renderVersion){const old=target.scrollTop;target.replaceChildren(frag);target.scrollTop=old;}
}
async function go(n,broadcast=true){if(!doc||n<0||n>=doc.pages.length)return;page=n;await render();if(broadcast)channel?.postMessage({type:'page',page});}
$('prev').onclick=()=>go(page-1);$('next').onclick=()=>go(page+1);
function setScroll(el,ratio){scrollLock=true;el.scrollTop=ratio*Math.max(0,el.scrollHeight-el.clientHeight);requestAnimationFrame(()=>requestAnimationFrame(()=>{scrollLock=false;}));}
for(const [from,to]of[[source,target],[target,source]])from.addEventListener('scroll',()=>{
 if(scrollLock||!$('sync').checked||!doc)return;const ratio=from.scrollTop/Math.max(1,from.scrollHeight-from.clientHeight);setScroll(to,ratio);channel?.postMessage({type:'scroll',page,ratio});
},{passive:true});
async function run(jobs){
 if(busy||importing||!doc||detached)return;busy=true;abort=new AbortController();const signal=abort.signal;controls();let done=0,total=jobs.length;
 try{
  await loadSettings();if(!settings.endpoint)throw Error('请先点击设置，填写翻译接口、模型和 API Key');await renderTranslations();
  for(const{p,i}of jobs){
   if(signal.aborted)break;const key=cacheKey(p,i);if((await db.get(key))?.text){done++;continue;}
   status(`翻译中 ${done+1} / ${total} · 第 ${p+1} 页 · 可随时暂停`);
   const text=await translate(doc.pages[p].chunks[i],settings,signal);if(signal.aborted)break;
   await db.put(key,{text,date:Date.now()});done++;channel?.postMessage({type:'translation',page:p});if(p===page)await renderTranslations();
  }
  status(signal.aborted?`已暂停 · ${done} / ${total}，再次点击可接着翻译`:`翻译完成 · ${done} / ${total}`);
 }catch(e){status(signal.aborted?'已暂停，已完成的译文已保存':`翻译停止：${e.message}。已完成的译文保留，修正后可继续。`);}
 finally{busy=false;abort=null;controls();await renderTranslations();}
}
const jobsFor=pages=>pages.flatMap(p=>doc.pages[p].chunks.map((_,i)=>({p,i})));
$('current').onclick=()=>run(jobsFor([page]));$('all').onclick=()=>run(jobsFor(doc.pages.map((_,p)=>p)));$('stop').onclick=cancel;
$('settings').onclick=$('setup').onclick=()=>chrome.runtime.openOptionsPage();
$('font').onchange=()=>document.documentElement.style.setProperty('--text-size',$('font').value+'px');
$('paste').onclick=()=>$('pasteDialog').showModal();$('pasteCancel').onclick=()=>$('pasteDialog').close();
$('pasteOK').onclick=async()=>{try{await importText($('pasteTitle').value,$('pasteText').value);$('pasteDialog').close();}catch(e){status(e.message);}};
$('demo').onclick=()=>importText('示例 · 化学文献实验部分','General procedure for the synthesis of compound 5\n\nTo a solution of compound 4 (1.0 mmol) in ethanol (10 mL) was added potassium carbonate (2.0 mmol). The mixture was stirred at room temperature for 2 h.\n\nThe reaction mixture was filtered and concentrated under reduced pressure. The residue was purified by column chromatography to afford compound 5 as a white solid (85% yield).\n\nThis is a demonstration passage, not a validated experimental procedure.');
$('russianDemo').onclick=()=>importText('俄语示例 · 化学文献','Общая методика синтеза соединения 5\n\nСоединение 5 было получено в виде белого твердого вещества. Выход составил 85%. ИК- и ЯМР-спектры подтвердили структуру продукта.\n\nЭто демонстрационный текст для проверки перевода в программе, а не экспериментальный протокол.');
$('persianDemo').onclick=()=>importText('波斯语示例 · 化学文献','روش کلی تهیه ترکیب ۵\n\nترکیب ۵ به صورت جامد سفید با بازده ۸۵٪ به دست آمد. ساختار محصول با طیف‌سنجی مادون قرمز و رزونانس مغناطیسی هسته‌ای تأیید شد.\n\nاین متن فقط برای آزمایش ترجمه در برنامه است و دستورالعمل آزمایشگاهی نیست.');
$('detach').onclick=async()=>{
 if(!doc){status('请先导入文献');return;}const url=chrome.runtime.getURL(`reader.html?doc=${doc.id}&view=translation`);
 if(translationWindow&&translationDocId===doc.id){try{await chrome.windows.update(translationWindow,{focused:true});return;}catch{translationWindow=null;}}
 const win=await chrome.windows.create({url,type:'popup',width:950,height:900});translationWindow=win.id;translationDocId=doc.id;status('译文窗口已打开，可拖到第二块屏幕。两个窗口保持同步。');
};
$('export').onclick=async()=>{
 try{if(!doc)throw Error('请先导入文献');let text=`# ${doc.title}\n\n原文语言：${settings.sourceLanguage}；译文语言：${settings.language}；模型：${settings.model||'未配置'}\n\n${isPahlavi(settings)?'帕拉维语辅助释读（试验性）：准确率尚未验证；存疑处须人工校订。原文表示形式：'+settings.pahlaviFormat+'\n\n':''}`;
 for(let p=0;p<doc.pages.length;p++){text+=`## 第 ${p+1} 页 / 组\n\n`;for(let i=0;i<doc.pages[p].chunks.length;i++){text+=`### 原文 ${i+1}\n\n${doc.pages[p].chunks[i]}\n\n### 译文\n\n${(await db.get(cacheKey(p,i)))?.text||'（未翻译）'}\n\n`;}}
 const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=doc.title.replace(/[\\/:*?"<>|]/g,'_')+'-双语对照.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }catch(e){status(e.message);}
};
$('library').onclick=async()=>{const list=$('historyList');list.replaceChildren();for(const item of await db.get('history')||[]){const b=document.createElement('button');b.textContent=item.title+' · '+new Date(item.date).toLocaleDateString();b.onclick=async()=>{try{await openDoc(item.id);$('historyDialog').close();}catch(e){status(e.message);}};list.append(b);}if(!list.children.length)list.textContent='暂无记录';$('historyDialog').showModal();};
$('historyClose').onclick=()=>$('historyDialog').close();
$('clearHistory').onclick=async()=>{if(!confirm('确定删除全部本地文献和译文？此操作无法撤销。'))return;await db.clear();channel?.postMessage({type:'cleared'});location.href=chrome.runtime.getURL('reader.html');};
chrome.storage.onChanged.addListener(async changes=>{if(changes.settings){selection.reset();cancel();await loadSettings();if(doc)await renderTranslations();status('设置已更新。按新语言、模型及术语表读取缓存。');}});
window.addEventListener('beforeunload',()=>channel?.close());
try{
 await loadSettings();controls();
 if(params.has('capture')){const key='capture:'+params.get('capture'),item=(await chrome.storage.local.get(key))[key];if(item){await importText(item.title,item.text,'网页');await chrome.storage.local.remove(key);}else status('网页正文已失效，请重新提取');}
 else if(params.has('doc'))await openDoc(params.get('doc'));
}catch(e){status(e.message);}

let resizeTimer;let oldWidth=source.clientWidth;new ResizeObserver(()=>{const width=source.clientWidth;if(Math.abs(width-oldWidth)<2)return;oldWidth=width;clearTimeout(resizeTimer);if(pdf&&!detached)resizeTimer=setTimeout(()=>render().catch(e=>status('页面重绘失败：'+e.message)),180);}).observe(source);
