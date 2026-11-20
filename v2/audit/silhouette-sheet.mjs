// Silhouette-only contact sheet: every building's mask on black, no colour/texture. This is the "name the building"
// sheet Zachary asked for — if a building cannot be identified from this alone, its silhouette has failed.
import sharp from 'sharp';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const ROOT = process.argv[2] ?? '.';
const OUT = process.argv[3] ?? 'docs/proof/phase-5/art/buildings-silhouettes.png';
const CELL = 150, LABEL = 22, COLS = 7;
const man = JSON.parse(readFileSync(`${ROOT}/public/atlas-final/buildings.json`,'utf8'));
const ids = readdirSync(`${ROOT}/data/buildings`).map(f=>JSON.parse(readFileSync(`${ROOT}/data/buildings/${f}`,'utf8')).id).sort();
const rows = Math.ceil(ids.length/COLS);
const W = COLS*CELL, H = rows*(CELL+LABEL)+40;
const comps=[];
const head=Buffer.from(`<svg width="${W}" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0b0a0f"/>
  <text x="12" y="18" font-family="monospace" font-size="14" fill="#f4efe4">NAME THE BUILDING — silhouettes only</text>
  <text x="12" y="33" font-family="monospace" font-size="10" fill="#8f8a80">filled black = the shape a player sees at phone zoom on a dark map</text></svg>`);
comps.push({input:head,top:0,left:0});
for(let i=0;i<ids.length;i++){
  const id=ids[i];
  const f=man.frames[`building/${id}/blue/0`];
  if(!f) continue;
  const src=sharp(`${ROOT}/public/atlas-final/${man.pages[f.page].file}`);
  const {data,info}=await src.ensureAlpha().raw().toBuffer({resolveWithObject:true});
  // Build a pure silhouette: opaque -> white, everything else transparent.
  const buf=Buffer.alloc(f.w*f.h*4);
  for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
    const si=((f.y+y)*info.width+(f.x+x))*info.channels;
    const di=(y*f.w+x)*4;
    const a=data[si+3];
    if(a>160){ buf[di]=240;buf[di+1]=238;buf[di+2]=232;buf[di+3]=255; }
  }
  const cell=await sharp(buf,{raw:{width:f.w,height:f.h,channels:4}})
    .resize(CELL-16,CELL-16,{fit:'contain',background:{r:11,g:10,b:15,alpha:1}}).png().toBuffer();
  const col=i%COLS, row=Math.floor(i/COLS);
  comps.push({input:cell, top:40+row*(CELL+LABEL)+8, left:col*CELL+8});
  const lbl=Buffer.from(`<svg width="${CELL}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><text x="8" y="15" font-family="monospace" font-size="10" fill="#ded7c7">${i+1}. ${id}</text></svg>`);
  comps.push({input:lbl, top:40+row*(CELL+LABEL)+CELL-8, left:col*CELL});
}
await sharp({create:{width:W,height:H,channels:4,background:{r:11,g:10,b:15,alpha:1}}}).composite(comps).png().toFile(OUT);
console.log('wrote',OUT,W+'x'+H,'|',ids.length,'buildings');
