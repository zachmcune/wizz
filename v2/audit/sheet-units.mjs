// BEFORE/AFTER contact sheet for every unit: drawn at its ground origin with the origin marked.
import sharp from 'sharp';
import { readFileSync, readdirSync } from 'node:fs';
const MAN = process.argv[2], ATLAS = process.argv[3], OUT = process.argv[4], LABEL = process.argv[5];
const man = JSON.parse(readFileSync(MAN,'utf8'));
const ids = readdirSync('data/units').map(f=>JSON.parse(readFileSync('data/units/'+f,'utf8')).id).sort();
const CELL=132, COL=2, ROWH=148;
const W=ids.length*CELL, H=2*ROWH+26;
const comps=[];
for(let i=0;i<ids.length;i++){
  const id=ids[i];
  for(let r=0;r<2;r++){
    const f=man.frames[`unit/${id}/blue/${r===0?0:2}`];
    if(!f) continue;
    const buf=await sharp(`${ATLAS}/${man.pages[f.page].file}`).extract({left:f.x,top:f.y,width:f.w,height:f.h}).png().toBuffer();
    const px=Math.round(f.pivotX*f.w), py=Math.round(f.pivotY*f.h);
    const marks=Buffer.from(`<svg width="${f.w}" height="${f.h}" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="${py}" x2="${f.w}" y2="${py}" stroke="#2ec6ff" stroke-width="1" stroke-opacity="0.9"/>
      <circle cx="${px}" cy="${py}" r="2" fill="#ff4fd8"/></svg>`);
    const cell=await sharp({create:{width:f.w,height:f.h,channels:4,background:{r:16,g:19,b:24,alpha:1}}})
      .composite([{input:buf,top:0,left:0},{input:marks,top:0,left:0}]).png().toBuffer();
    comps.push({input:cell, top:26+r*ROWH+8, left:i*CELL+8});
  }
  const lbl=Buffer.from(`<svg width="${CELL}" height="20" xmlns="http://www.w3.org/2000/svg">
    <text x="4" y="14" font-family="monospace" font-size="9" fill="#ded7c7">${id}</text></svg>`);
  comps.push({input:lbl, top:26+2*ROWH-2, left:i*CELL});
}
const head=Buffer.from(`<svg width="${W}" height="26" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#15131c"/>
  <text x="10" y="17" font-family="monospace" font-size="12" fill="#f4efe4">UNIT GROUNDING — ${LABEL} — cyan = ground origin, magenta dot = pivot (row 1: facing 0, row 2: facing 2)</text></svg>`);
comps.push({input:head,top:0,left:0});
await sharp({create:{width:W,height:H,channels:4,background:{r:21,g:19,b:28,alpha:1}}}).composite(comps).png().toFile(OUT);
console.log('wrote',OUT,W+'x'+H);
