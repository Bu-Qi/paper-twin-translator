import{test}from'node:test';import assert from'node:assert/strict';import{pdfLayout,textStyle}from'../layout.js';
const viewport={width:600,height:800,scale:1,transform:[1,0,0,-1,0,800]};
const item=(str,x,y,size=12,fontName='body')=>({str,width:str.length*size/2,height:size,transform:[size,0,0,size,x,y],fontName});
test('PDF paragraph bounds preserve page coordinates, font size, heading and italic styles',()=>{
 const content={styles:{heading:{fontFamily:'Times-Bold'},body:{fontFamily:'Times-Roman'},note:{fontFamily:'Times-Italic'}},items:[item('Heading',60,740,24,'heading'),item('First line',60,700),item('second line',60,684),item('Note',320,600,10,'note')]};
 const layout=pdfLayout(content,viewport,['Heading','First line second line','Note']);assert.equal(layout.height,800);assert.equal(layout.blocks[0].size,24);assert.equal(layout.blocks[0].weight,700);assert.equal(layout.blocks[0].serif,true);assert.equal(layout.blocks[2].italic,true);assert.equal(layout.blocks[2].x,320);assert.ok(layout.blocks[1].height>25);assert.ok(layout.blocks[0].y<layout.blocks[1].y);
});
test('mapping keeps legacy chunks including hyphenated PDF words and repeated text',()=>{
 const layout=pdfLayout({items:[item('Inter-',20,700),item('national',20,680),item('Note',20,600),item('Note',320,600)]},viewport,['International','Note','Note']);assert.ok(layout.blocks.every(Boolean));assert.equal(layout.blocks[2].x,320);
});
test('blank/scanned PDF does not invent text regions; unmatched text can fall back',()=>{assert.deepEqual(pdfLayout({items:[]},viewport,['unmapped']).blocks,[null]);});
test('Markdown heading hierarchy is shared by both text panes',()=>{assert.ok(textStyle('# Title').size>textStyle('## Heading').size);assert.equal(textStyle('# Title').weight,700);assert.equal(textStyle('Ordinary paragraph').size,1);});
