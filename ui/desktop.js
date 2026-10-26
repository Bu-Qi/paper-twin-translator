// A small desktop adapter; PDF and translation UI remain ordinary sandboxed web content.
const token=document.querySelector('meta[name="app-token"]').content;
const listeners=new Set(),windows=new Map();let serial=0;
const notify=changes=>{for(const listener of listeners)listener(changes,'local');};
window.chrome={
 runtime:{getURL:path=>new URL(path,location.origin+'/').href,openOptionsPage:async()=>window.open('/options.html','paper-twin-settings','width=860,height=950')},
 permissions:{contains:async()=>true,request:async()=>true},
 storage:{local:{
  get:async key=>({[key]:JSON.parse(localStorage.getItem('pt:'+key)||'null')}),
  set:async entries=>{const changes={};for(const[key,value]of Object.entries(entries)){const oldValue=JSON.parse(localStorage.getItem('pt:'+key)||'null');localStorage.setItem('pt:'+key,JSON.stringify(value));changes[key]={oldValue,newValue:value};}notify(changes);},
  remove:async key=>{const oldValue=JSON.parse(localStorage.getItem('pt:'+key)||'null');localStorage.removeItem('pt:'+key);notify({[key]:{oldValue}});}
 },onChanged:{addListener:fn=>listeners.add(fn)}},
 windows:{create:async options=>{const u=new URL(options.url);if(u.origin!==location.origin)throw Error('只允许打开本机阅读窗口');const w=window.open(u.href,'_blank',`popup,width=${options.width||950},height=${options.height||900}`);if(!w)throw Error('窗口被拦截，请允许本程序打开弹窗');const id=++serial;windows.set(id,w);return{id};},update:async id=>{const w=windows.get(id);if(!w||w.closed)throw Error('窗口已关闭');w.focus();return{id};}}
};
window.addEventListener('storage',e=>{if(e.key?.startsWith('pt:'))notify({[e.key.slice(3)]:{oldValue:JSON.parse(e.oldValue||'null'),newValue:JSON.parse(e.newValue||'null')}});});
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
 if(url.origin===location.origin)return nativeFetch(input,options);
 if(options.method!=='POST')throw Error('不支持的外部请求');
 const headers=new Headers(options.headers);return nativeFetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json','X-Paper-Twin':token},signal:options.signal,body:JSON.stringify({endpoint:url.href,authorization:headers.get('Authorization')||'',payload:JSON.parse(options.body)})});
};
const heartbeat=()=>nativeFetch('/api/heartbeat',{method:'POST',headers:{'X-Paper-Twin':token}}).catch(()=>{});heartbeat();setInterval(heartbeat,15000);
