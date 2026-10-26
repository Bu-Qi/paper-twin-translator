import{test}from'node:test';import assert from'node:assert/strict';
import{splitText,endpointURL,translate,translationPrompt,isPahlavi,PAHLAVI}from'../core.js';
globalThis.chrome={permissions:{contains:async()=>true}};
const cfg={endpoint:'https://example.com/v1/chat/completions',model:'test',language:'简体中文',domain:'化学',glossary:''};
test('分块保留长段文字和段落',()=>{const x='a'.repeat(6000);assert.equal(splitText(x).join(''),x);assert.ok(splitText(x).every(x=>x.length<=2800));assert.deepEqual(splitText('one\n\ntwo'),['one','two']);});
test('仅允许安全接口和本机 HTTP',()=>{assert.throws(()=>endpointURL('http://example.com'));assert.throws(()=>endpointURL('https://user:password@example.com'));assert.equal(endpointURL('http://localhost:1234/v1/chat/completions').hostname,'localhost');});
test('发送兼容请求并解析译文',async()=>{globalThis.fetch=async(url,opts)=>{const b=JSON.parse(opts.body);assert.equal(b.messages[1].content,'yield 85%');assert.equal(opts.redirect,'error');return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'收率 85%'}}]})};};assert.equal(await translate('yield 85%',cfg),'收率 85%');});
test('拒绝截断译文及限流错误',async()=>{globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'partial'}}]})});await assert.rejects(translate('x',cfg),/截断/);globalThis.fetch=async()=>({ok:false,status:429});await assert.rejects(translate('x',cfg),/限流/);});
test('俄语原文与俄语目标语言完整传递，不改变西里尔文字',async()=>{
 const russian='Соединение 5 получено с выходом 85%. Температура 25 °C.';
 let sent;
 globalThis.fetch=async(_url,opts)=>{sent=JSON.parse(opts.body);return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'化合物 5，收率为 85%。温度为 25 °C。'}}]})};};
 await translate(russian,cfg);assert.equal(sent.messages[1].content,russian);assert.match(sent.messages[0].content,/detect the source language.*Russian/);assert.match(sent.messages[0].content,/into 简体中文/);
 await translate('化合物 5 的收率为 85%。',{...cfg,language:'俄语（Russian）'});assert.match(sent.messages[0].content,/into 俄语（Russian）/);assert.equal(sent.messages[1].content,'化合物 5 的收率为 85%。');
});
test('中文与波斯语互译时保留原始 Unicode 文字和目标语言',async()=>{
 const persian='ترکیب ۵ با بازده ۸۵٪ به دست آمد.';let sent;
 globalThis.fetch=async(_url,opts)=>{sent=JSON.parse(opts.body);return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:persian}}]})};};
 assert.equal(await translate('化合物 5 的收率为 85%。',{...cfg,language:'波斯语（Persian）'}),persian);assert.match(sent.messages[0].content,/into 波斯语（Persian）/);
 await translate(persian,cfg);assert.equal(sent.messages[1].content,persian);assert.match(sent.messages[0].content,/Persian \(Farsi\)/);assert.match(sent.messages[0].content,/into 简体中文/);
});

test('中古波斯语模式覆盖领域、保留存疑处，并与现代波斯语分开',async()=>{
 const pal={...cfg,sourceLanguage:PAHLAVI,pahlaviFormat:'拉丁转写／转录'};
 assert.equal(isPahlavi(pal),true);assert.equal(isPahlavi({...cfg,sourceLanguage:'波斯语（Persian）'}),false);
 const prompt=translationPrompt(pal);assert.match(prompt,/Middle Iranian philology/);assert.doesNotMatch(prompt,/expert academic translator in 化学/);assert.match(prompt,/ISO 639-3: pal/);assert.match(prompt,/Never silently substitute/);assert.match(prompt,/Mark uncertain words/);assert.match(prompt,/cannot be read reliably/);
 const original='šāhān šāh [x] 𐭠𐭡';let sent;
 globalThis.fetch=async(_url,opts)=>{sent=JSON.parse(opts.body);return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'【存疑：šāhān šāh [x] 𐭠𐭡】'}}]})};};
 await translate(original,pal);assert.equal(sent.messages[1].content,original);
 assert.match(translationPrompt({...cfg,language:PAHLAVI}),/scholarly Latin transcription\/transliteration/);
});
