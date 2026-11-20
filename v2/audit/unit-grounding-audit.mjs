// Audit every unit's grounding from the baked atlas, per facing. Writes JSON for the before/after sheet.
import sharp from 'sharp';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const label = process.argv[2] ?? 'after';
const man = JSON.parse(readFileSync('public/atlas-final/units.json','utf8'));
const pages = new Map();
async function page(i){ if(pages.has(i)) return pages.get(i);
  const r = await sharp('public/atlas-final/'+man.pages[i].file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const e = {data:r.data,width:r.info.width,ch:r.info.channels}; pages.set(i,e); return e; }
const ids = readdirSync('data/units').map(f=>JSON.parse(readFileSync('data/units/'+f,'utf8')).id).sort();
const HOVER = new Set(['wisp','rift_skimmer']);
const rows=[];
for(const id of ids){
  const per=[];
  for(let f=0;f<8;f++){
    const fr=man.frames[`unit/${id}/blue/${f}`];
    if(!fr){ per.push(null); continue; }
    const pg=await page(fr.page);
    const at=(x,y)=>{const i=(y*pg.width+x)*pg.ch;return {a:pg.data[i+3],r:pg.data[i],g:pg.data[i+1],b:pg.data[i+2]};};
    // First pass: mark body pixels so the outline ring (which sits adjacent to the body) can be excluded
    // from the shadow measurement. A contact shadow is a FLAT ellipse, so requiring a run of horizontal
    // neighbours separates it from the 2px outline stroke.
    const isBody=(x,y)=>{const p=at(x,y);return p.a>200 && (p.r+p.g+p.b)>110;};
    let bodyBottom=-1e9, bodyTop=1e9, bl=1e9, br=-1e9;
    let sTop=1e9,sBottom=-1e9,sL=1e9,sR=-1e9,sN=0;
    for(let y=fr.y;y<fr.y+fr.h;y++)for(let x=fr.x;x<fr.x+fr.w;x++){
      const p=at(x,y);
      const bright=(p.r+p.g+p.b)>110;
      if(p.a>200&&bright){ if(y>bodyBottom)bodyBottom=y; if(y<bodyTop)bodyTop=y; if(x<bl)bl=x; if(x>br)br=x; }
      else if(p.a>4&&p.a<=160&&(p.r+p.g+p.b)<=110){ if(y<sTop)sTop=y; if(y>sBottom)sBottom=y; if(x<sL)sL=x; if(x>sR)sR=x; sN++; }
    }
    const pivY=fr.y+fr.pivotY*fr.h, pivX=fr.x+fr.pivotX*fr.w;
    per.push({gap:+(bodyBottom-pivY).toFixed(1), pivotY:+pivY.toFixed(1), bodyW:br-bl,
      shadow: sN? {w:sR-sL, cx:+((sL+sR)/2-pivX).toFixed(1), bottom:+(sBottom-pivY).toFixed(1)} : null});
  }
  const gaps=per.filter(Boolean).map(p=>p.gap);
  rows.push({id, hover:HOVER.has(id),
    gapMin:+Math.min(...gaps).toFixed(1), gapMax:+Math.max(...gaps).toFixed(1),
    spread:+(Math.max(...gaps)-Math.min(...gaps)).toFixed(1),
    hasShadow: per.filter(Boolean).every(p=>p.shadow!==null), per});
}
writeFileSync(`docs/proof/phase-5/art/units-grounding-${label}.json`, JSON.stringify(rows,null,2));
console.log('id'.padEnd(18),'hover','gapMin','gapMax','spread','shadow');
for(const r of rows) console.log(r.id.padEnd(18), r.hover?'YES ':'no  ',
  String(r.gapMin).padStart(6),String(r.gapMax).padStart(6),String(r.spread).padStart(6), r.hasShadow?'yes':'NO');
const bad = rows.filter(r=>!r.hover && (Math.abs(r.gapMin)>2||Math.abs(r.gapMax)>2));
console.log('\nunits with feet off the ground (>2px):', bad.length, '/', rows.length);
