// Sensitivity check: how separated are these pairs if we look ONLY at the top third (the silhouette's identity)?
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
const man=JSON.parse(readFileSync('public/atlas-final/buildings.json','utf8'));
const cache=new Map();
async function mask(id:string, topFrac:number){
  const key=id+':'+topFrac;
  if(cache.has(key)) return cache.get(key);
  const f=man.frames[`building/${id}/blue/0`];
  const {data,info}=await sharp('public/atlas-final/'+man.pages[f.page].file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const bits=new Uint8Array(f.w*f.h);
  let L=f.w,R=-1,T=f.h,B=-1;
  for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const i=((f.y+y)*info.width+(f.x+x))*info.channels;
    if(data[i+3]>160){bits[y*f.w+x]=1; if(x<L)L=x; if(x>R)R=x; if(y<T)T=y; if(y>B)B=y;}}
  const h=B-T+1; const keepTop = T; const keepBottom = T + Math.round(h*topFrac);
  const m={w:f.w,h:f.h,bits,L,R,T:keepTop,B:keepBottom};
  cache.set(key,m); return m;
}
function iou(a:any,b:any){
  const aw=a.R-a.L+1, ah=a.B-a.T+1, bw=b.R-b.L+1, bh=b.B-b.T+1;
  const W=96,H=96, span=Math.max(aw,ah,bw,bh,1), s=(W-2)/span;
  const ras=(m:any)=>{const o=new Uint8Array(W*H); const dw=Math.max(1,Math.round((m.R-m.L+1)*s)), dh=Math.max(1,Math.round((m.B-m.T+1)*s));
    const ox=Math.round((W-dw)/2), oy=Math.round((H-dh)/2);
    for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){ const sx=m.L+Math.min(m.R-m.L,Math.round(x/dw*(m.R-m.L+1)));
      const sy=m.T+Math.min(m.B-m.T,Math.round(y/dh*(m.B-m.T+1)));
      const gx=ox+x,gy=oy+y; if(gx<0||gy<0||gx>=W||gy>=H)continue; o[gy*W+gx]=m.bits[sy*m.w+sx]; }
    return o;};
  const ra=ras(a),rb=ras(b); let i=0,u=0;
  for(let k=0;k<ra.length;k++){const av=ra[k],bv=rb[k]; if(av&&bv)i++; if(av||bv)u++;}
  return u?i/u:1;
}
const pairs=[['attunement_spire','frost_spire'],['celestial_cannon','golem_forge'],['arcane_gate','arcane_sentry'],
 ['resonance_vault','storm_conductor'],['inferno_beacon','ley_conduit'],['ley_conduit','storm_conductor'],
 ['ley_conduit','resonance_vault'],['resonance_vault','summoning_circle'],['arcane_bunker','resonance_vault'],['arcane_bunker','ley_conduit']];
console.log('pair'.padEnd(46),'top70%','top50%','top35%');
for(const [a,b] of pairs){
  const r=[];
  for(const f of [0.70,0.50,0.35]) r.push(iou(await mask(a,f),await mask(b,f)).toFixed(3));
  console.log(`${a} ~ ${b}`.padEnd(46), r.join('   '));
}
