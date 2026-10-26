import {existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
function endpointURL(value:string){
 const u=new URL(value);
 if(u.username||u.password||u.search||u.hash)throw Error('Invalid endpoint');
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('HTTPS required');
 return u;
}
import assets from './assets.ts';
const APP_ID='PaperTwinDesktop-1',host='127.0.0.1',port=Number(process.env.PAPER_TWIN_TEST_PORT||17643);
const origin=`http://${host}:${port}`,token=crypto.randomUUID(),headless=process.argv.includes('--headless');
const env=(name:string)=>Object.entries(process.env).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1];
const dataRoot=env('LOCALAPPDATA')||join(homedir(),'.local','share');
const profile=join(dataRoot,'PaperTwin','BrowserData');
const started=Date.now();let lastHeartbeat=Date.now();
function report(text:string){
 if(process.platform!=='win32'){console.error(text);return;}
 const safe=text.replaceAll("'","''");const script=`Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show('${safe}','文献双屏译读')`;
 spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
}
function launch(){
 if(headless)return;
 if(process.platform!=='win32'){console.log('Open '+origin+'/reader.html');return;}
 const choices=[
  join(env('ProgramFiles(x86)')||'C:\\Program Files (x86)','Microsoft','Edge','Application','msedge.exe'),
  join(env('ProgramFiles')||'C:\\Program Files','Microsoft','Edge','Application','msedge.exe'),
  join(dataRoot,'Microsoft','Edge','Application','msedge.exe'),
  join(env('ProgramFiles')||'C:\\Program Files','Google','Chrome','Application','chrome.exe'),
  join(dataRoot,'Google','Chrome','Application','chrome.exe')
 ];
 const browser=choices.find(existsSync);
 if(!browser){report('未找到 Microsoft Edge 或 Google Chrome。请安装或更新其中一个浏览器后重新打开本程序。');process.exit(1);}
 mkdirSync(profile,{recursive:true});
 const child=spawn(browser,[`--app=${origin}/reader.html`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-mode'],{windowsHide:true,stdio:'ignore',detached:true});
 child.on('error',()=>{report('无法打开阅读窗口。请检查 Edge 是否可正常运行。');process.exit(1);});child.unref();
}
const mime=(p:string)=>p.endsWith('.html')?'text/html; charset=utf-8':/\.(m?js)$/.test(p)?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':p.endsWith('.wasm')?'application/wasm':p.endsWith('.svg')?'image/svg+xml':'application/octet-stream';
const security={
 'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'
};
function json(data:any,status=200){return Response.json(data,{status,headers:security});}
let server;
try{
 server=Bun.serve({hostname:host,port,maxRequestBodySize:1024*1024,idleTimeout:150,
  async fetch(req){
   const url=new URL(req.url);if(url.origin!==origin)return new Response('Forbidden',{status:403});
   if(url.pathname==='/api/health')return json({app:APP_ID});
   if(url.pathname.startsWith('/api/')){
    if(req.method!=='POST'||req.headers.get('Origin')!==origin||req.headers.get('X-Paper-Twin')!==token)return json({error:'Forbidden'},403);
    if(url.pathname==='/api/heartbeat'){lastHeartbeat=Date.now();return json({ok:true});}
    if(url.pathname!=='/api/translate')return json({error:'Not found'},404);
    try{
     const {endpoint,authorization,payload}=await req.json();const target=endpointURL(endpoint);
     if(typeof payload?.model!=='string'||!Array.isArray(payload.messages)||payload.messages.length>4||typeof authorization!=='string'||authorization.length>8192)throw Error('Invalid request');
     const body=JSON.stringify(payload);if(body.length>500000)throw Error('Request too large');
     const headers={'Content-Type':'application/json'};if(authorization)(headers as any).Authorization=authorization;
     const controller=new AbortController(),cancel=()=>controller.abort();req.signal.addEventListener('abort',cancel,{once:true});
     const timeout=setTimeout(cancel,120000);if(req.signal.aborted)cancel();
     try{
      const response=await fetch(target.href,{method:'POST',headers,body,redirect:'error',signal:controller.signal});
      const raw=await response.text();if(raw.length>8*1024*1024)throw Error('Response too large');
      return new Response(raw,{status:response.status,headers:{...security,'Content-Type':'application/json'}});
     }finally{clearTimeout(timeout);req.signal.removeEventListener('abort',cancel);}
    }catch{return json({error:{message:'无法连接翻译接口，请检查地址、网络或服务商状态'}},502);}
   }
   if(req.method!=='GET'&&req.method!=='HEAD')return new Response('Method not allowed',{status:405});
   const key=url.pathname==='/'?'/reader.html':url.pathname;
   const file=assets[key];if(!file)return new Response('Not found',{status:404,headers:security});
   if(key.endsWith('.html')){
    const html=(await Bun.file(file).text()).replace('<meta charset="utf-8">',`<meta charset="utf-8"><meta name="app-token" content="${token}"><script src="desktop.js"></script>`);
    return new Response(req.method==='HEAD'?null:html,{headers:{...security,'Content-Type':mime(key)}});
   }
   return new Response(req.method==='HEAD'?null:Bun.file(file),{headers:{...security,'Content-Type':mime(key)}});
  }
 });
 launch();console.log('PAPER_TWIN_READY '+origin);
 let lastTick=Date.now();
 setInterval(()=>{const now=Date.now();if(now-lastTick>60000)lastHeartbeat=now;lastTick=now;if(!headless&&now-lastHeartbeat>120000&&now-started>120000){server.stop(true);process.exit(0);}},15000);
}catch{
 try{const response=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(2000)});if((await response.json()).app===APP_ID){launch();process.exit(0);}}catch{}
 report('本机阅读服务无法启动，可能是端口 17643 被其他软件占用。请关闭旧窗口，等待两分钟后重试。');process.exit(1);
}
