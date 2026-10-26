import{DEFAULTS,endpointURL,translate,isPahlavi}from'./core.js';
const $=s=>document.getElementById(s),fields=Object.keys(DEFAULTS),status=$('status');
const saved=(await chrome.storage.local.get('settings')).settings||DEFAULTS;
fields.forEach(k=>$(k).value=saved[k]||DEFAULTS[k]);
const cfg=()=>Object.fromEntries(fields.map(k=>[k,$(k).value.trim()]));
const updateMode=()=>{$('pahlaviSettings').hidden=!isPahlavi(cfg());};$('sourceLanguage').onchange=updateMode;$('language').onchange=updateMode;updateMode();
$('form').onsubmit=async e=>{e.preventDefault();try{
 const c=cfg(),u=endpointURL(c.endpoint);
 const ok=await chrome.permissions.request({origins:[u.origin+'/*']});if(!ok)throw Error('接口设置未保存');
 await chrome.storage.local.set({settings:c});status.textContent='设置已保存。可以返回阅读窗口开始翻译。';
}catch(e){status.textContent=e.message;}};
$('test').onclick=async()=>{status.textContent='正在测试…';try{status.textContent='连接成功：'+await translate('The isolated yield was 85%.',cfg());}catch(e){status.textContent=e.message;}};
$('forget').onclick=async()=>{const c=(await chrome.storage.local.get('settings')).settings||{...DEFAULTS};c.key='';await chrome.storage.local.set({settings:c});$('key').value='';status.textContent='API Key 已删除。';};

$('zhipuPreset').onclick=()=>{if($('endpoint').value!==DEFAULTS.endpoint)$('key').value='';$('endpoint').value=DEFAULTS.endpoint;$('model').value=DEFAULTS.model;status.textContent='智谱免费模型已填入，请填写你自己的模型标准 API Key，然后保存设置。';};
