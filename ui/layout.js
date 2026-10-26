// Keep the original translation chunks/cache intact; attach geometry to those chunks.
const compact=s=>s.replace(/[\s\u00ad-]/gu,'');
export function pdfLayout(content,viewport,chunks){
 const boxes=chunks.map(()=>[]),texts=chunks.map(compact);let cursor=0,offset=0;
 for(const item of content.items){
  if(!item.str?.trim()||!item.transform)continue;
  const needle=compact(item.str);if(!needle)continue;
  let found=-1,at=-1;
  for(let i=cursor;i<texts.length;i++){const pos=texts[i].indexOf(needle,i===cursor?offset:0);if(pos!==-1){found=i;at=pos;break;}}
  // Long PDF items may span more than one text chunk.
  const indices=[];
  if(found>=0){cursor=found;offset=at+needle.length;indices.push(found);}
  else for(let i=cursor;i<texts.length;i++)if(needle.includes(texts[i])&&texts[i])indices.push(i);
  const t=item.transform,v=viewport.transform;
  const x=v[0]*t[4]+v[2]*t[5]+v[4],baseline=v[1]*t[4]+v[3]*t[5]+v[5];
  const size=Math.hypot(v[0]*t[2]+v[2]*t[3],v[1]*t[2]+v[3]*t[3])||item.height||12;
  const style=content.styles?.[item.fontName]||{},family=style.fontFamily||'';
  const width=Math.max(size,Math.abs(item.width||size)*viewport.scale);
  const box={x:Math.max(0,x),y:Math.max(0,baseline-size*(style.ascent||0.85)),width,height:size*1.25,size,family,weight:/bold|black|heavy/i.test(family)?700:400,italic:/italic|oblique/i.test(family),count:item.str.length};
  for(const i of indices)boxes[i].push(box);
 }
 return{width:viewport.width,height:viewport.height,blocks:boxes.map(items=>{
  if(!items.length)return null;
  const x=Math.min(...items.map(b=>b.x)),y=Math.min(...items.map(b=>b.y));
  const main=items.reduce((a,b)=>a.count>=b.count?a:b);
  return{x,y,width:Math.min(viewport.width-x,Math.max(...items.map(b=>b.x+b.width))-x),height:Math.min(viewport.height-y,Math.max(...items.map(b=>b.y+b.height))-y),size:main.size,weight:main.weight,italic:main.italic,serif:/serif|times|roman|song|宋/i.test(main.family)&&!/sans/i.test(main.family)};
 })};
}
export function textStyle(text){
 const heading=text.match(/^(#{1,6})\s+/);return{size:heading?Math.max(1.1,1.8-heading[1].length*0.15):1,weight:heading?700:400};
}
