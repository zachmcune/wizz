// Phase 2 evidence: the four required viewport screenshots of the live simulation view.
//
// Phase 2 has no game renderer yet (Phase 3 owns that), so these capture the debug simulation view.
// That is the honest artifact for this phase: it proves the sim runs and is visible, at every
// supported screen size, with the same data the tests assert on.

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const v2Root = join(here, '..');
const outDir = join(v2Root, 'docs', 'proof', 'phase-2');
mkdirSync(outDir, { recursive: true });

const entry = join(v2Root, '.shot-entry.ts');
const bundle = join(v2Root, '.shot-bundle.mjs');
const htmlPath = join(v2Root, '.shot.html');
const dataPath = join(v2Root, '.shot-data.json');

const entrySource = `
import { getRegistry } from './tests/helpers';
import { initMatch } from './src/sim/factory';
import { stepSimulation } from './src/sim/step';
import { hashState } from './src/sim/hash';
import { TILE } from './src/core/constants';
import type { Command, GameState } from './src/sim/types';
import type { SimServices } from './src/sim/context';
import { buildProgressOf, getHarvester, getProductionQueue } from './src/sim/capabilities';
import { getPlayer } from './src/sim/queries';

function bot(state: GameState, services: SimServices, me: string): Command[] {
  const cmds: Command[] = [];
  const store = state.entities;
  const p = getPlayer(state, me);
  if (!p || p.defeated) return cmds;
  const oi = store.ownerIndexFor(me);
  let sanctum = -1, spire = -1, circle = -1;
  for (let s = 0; s < store.count; s++) {
    if (store.dead[s] || store.kind[s] !== 1) continue;
    if (store.ownerIndex[s] !== oi) continue;
    const d = store.extras[s]!.defId;
    const done = buildProgressOf(store.extras[s]!) === undefined;
    if (d === 'sanctum' && sanctum < 0) sanctum = s;
    else if (d === 'attunement_spire' && done && spire < 0) spire = s;
    else if (d === 'summoning_circle' && done && circle < 0) circle = s;
  }
  if (sanctum < 0) return cmds;
  const sx = store.posX[sanctum]!, sy = store.posY[sanctum]!;
  if (spire < 0 && p.mana >= 750) { cmds.push({ type: 'build', playerId: me, defId: 'attunement_spire', x: sx + 112, y: sy + 80 }); return cmds; }
  const hasLey = (() => { for (let s=0;s<store.count;s++){ if(store.dead[s]||store.kind[s]!==1)continue; if(store.ownerIndex[s]!==oi)continue; if(store.extras[s]!.defId==='ley_conduit'&&buildProgressOf(store.extras[s]!)===undefined)return true;} return false; })();
  if (spire >= 0 && !hasLey && p.mana >= 300) { cmds.push({ type: 'build', playerId: me, defId: 'ley_conduit', x: sx - 112, y: sy + 80 }); return cmds; }
  if (spire >= 0 && circle < 0 && p.mana >= 550) { cmds.push({ type: 'build', playerId: me, defId: 'summoning_circle', x: sx + 176, y: sy + 96 }); return cmds; }
  const wisps: number[] = []; let node = -1, bd = Infinity;
  for (let s=0;s<store.count;s++) {
    if (store.dead[s]) continue;
    if (store.kind[s]===0 && store.ownerIndex[s]===oi && getHarvester(store.extras[s]!)) wisps.push(s);
    if (store.extras[s]!.defId==='mana_node') { const d=Math.hypot(store.posX[s]!-sx,store.posY[s]!-sy); if(d<bd){bd=d;node=s;} }
  }
  if (spire >= 0 && wisps.length < 5) { const q=getProductionQueue(store.extras[spire]!); if((q?.length??0)===0 && p.mana>=200) cmds.push({type:'produce',playerId:me,buildingId:store.id[spire]!,defId:'wisp'}); }
  if (node>=0) { for (const w of wisps) { if (store.extras[w]!.orders.length===0 && (store.state[w]===0||store.state[w]===3)) { cmds.push({type:'harvest',playerId:me,entityIds:[store.id[w]!],nodeId:store.id[node]!}); break; } } }
  const army: number[] = [];
  for (let s=0;s<store.count;s++) { if(store.dead[s]||store.kind[s]!==0)continue; if(store.ownerIndex[s]!==oi)continue; const d=store.extras[s]!.defId; if(d==='imp_swarmling'||d==='arcane_archer')army.push(s); }
  if (circle>=0) { const q=getProductionQueue(store.extras[circle]!); if((q?.length??0)<3 && p.mana>=400) cmds.push({type:'produce',playerId:me,buildingId:store.id[circle]!,defId:army.length%3===0?'arcane_archer':'imp_swarmling'}); }
  if (army.length>=8) { let tx=0,ty=0,f=false; for(let s=0;s<store.count;s++){ if(store.dead[s]||store.kind[s]!==1)continue; const o=store.ownerId(store.ownerIndex[s]!); if(o===me||state.relations[me]?.[o]!=='enemy')continue; tx=store.posX[s]!;ty=store.posY[s]!;f=true;break;} if(f){ const idle=army.filter(s=>store.extras[s]!.orders.length===0); if(idle.length)cmds.push({type:'attackMove',playerId:me,entityIds:idle.map(s=>store.id[s]!),x:tx,y:ty}); } }
  return cmds;
}

export function capture(ticks: number, seed: number) {
  const reg = getRegistry();
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed,
    players: [
      { id: 'player0', controller: 'ai', team: 0, color: '#4f9dff', startIndex: 0, factionId: 'arcane' },
      { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, factionId: 'arcane' },
    ],
  });
  while (state.tick < ticks && !state.ended) {
    const cmds = [...(state.players[0]!.defeated?[]:bot(state,services,'player0')), ...(state.players[1]!.defeated?[]:bot(state,services,'player1'))];
    stepSimulation(state, services, cmds);
  }
  const store = state.entities;
  const colors: Record<string,string> = { player0: '#4f9dff', player1: '#ff5d5d' };
  const ents: any[] = [];
  for (let s=0;s<store.count;s++) {
    if (store.dead[s] || store.kind[s]===2) continue;
    const o = store.ownerId(store.ownerIndex[s]!);
    ents.push({ x:store.posX[s]!, y:store.posY[s]!, kind:store.kind[s]!, d:store.extras[s]!.defId, color:colors[o]??'#39d0c0', r:store.radius[s]!, hp:store.hp[s]!, max:store.maxHp[s]! });
  }
  const map = reg.map('duel_glade');
  return {
    tick: state.tick, mana: state.players.map(p=>Math.floor(p.mana)),
    units: [0,1].map(i=>{let n=0;for(let s=0;s<store.count;s++){if(store.dead[s]||store.kind[s]!==0||store.ownerIndex[s]!==i)continue;n++;}return n;}),
    hash: hashState(state), ended: state.ended, winner: state.winnerTeam,
    ents, tiles: map.tiles, heights: map.heights, tileW: map.tileW, tileH: map.tileH, mapW: map.tileW*TILE, mapH: map.tileH*TILE,
  };
}
`;

try {
  writeFileSync(entry, entrySource);
  execFileSync('npx', ['esbuild', entry, '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`, '--log-level=error'], { cwd: v2Root, stdio: 'inherit' });
  const mod = await import(pathToFileURL(bundle).href);
  const data = mod.capture(3600, 12345); // 3 sim-minutes: base established, army forming
  writeFileSync(dataPath, JSON.stringify(data));
  console.log(`captured tick ${data.tick}, hash ${data.hash}, ${data.ents.length} entities`);

  writeFileSync(htmlPath, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>html,body{margin:0;background:#0d0b16;overflow:hidden;font-family:system-ui,sans-serif}
  canvas{display:block}
  #hud{position:absolute;left:8px;top:8px;color:#e8e4f8;font-size:12px;line-height:1.45;
       background:rgba(23,20,38,.86);border:1px solid #2e2947;border-radius:8px;padding:6px 10px}
  #hud b{color:#9b8cff}</style></head><body>
  <canvas id="c"></canvas><div id="hud"></div>
  <script>
  const D = ${JSON.stringify(data)};
  const c=document.getElementById('c'), ctx=c.getContext('2d'), hud=document.getElementById('hud');
  function layout(){
    const W = window.innerWidth, H = window.innerHeight;
    c.width = W * (window.devicePixelRatio||1); c.height = H * (window.devicePixelRatio||1);
    c.style.width = W+'px'; c.style.height = H+'px';
    const S = Math.min(W/D.mapW, H/D.mapH);
    ctx.setTransform((window.devicePixelRatio||1),0,0,(window.devicePixelRatio||1),0,0);
    ctx.fillStyle='#0d0b16'; ctx.fillRect(0,0,W,H);
    const ox = (W - D.mapW*S)/2, oy=(H - D.mapH*S)/2;
    for(let ty=0;ty<D.tileH;ty++)for(let tx=0;tx<D.tileW;tx++){
      const i=ty*D.tileW+tx;
      if(D.tiles[i]===1){ctx.fillStyle='#1a1630';ctx.fillRect(ox+tx*32*S,oy+ty*32*S,32*S+.5,32*S+.5);}
      else if(D.heights[i]>0){ctx.fillStyle='#241f3d';ctx.fillRect(ox+tx*32*S,oy+ty*32*S,32*S+.5,32*S+.5);}
    }
    for(const e of D.ents){
      const px=ox+e.x*S, py=oy+e.y*S;
      if(e.d==='mana_node'){ctx.fillStyle='#39d0c0';ctx.beginPath();ctx.arc(px,py,Math.max(3,4*S*8),0,7);ctx.fill();continue;}
      if(e.kind===1){const w=Math.max(10,e.r*2*S);ctx.fillStyle=e.color+'55';ctx.strokeStyle=e.color;ctx.lineWidth=1.4;ctx.fillRect(px-w/2,py-w/2,w,w);ctx.strokeRect(px-w/2,py-w/2,w,w);}
      else{ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(px,py,Math.max(2.6,e.r*S),0,7);ctx.fill();}
    }
    hud.innerHTML='<b>Arcane Dominion v2 — Phase 2 sim</b><br>tick '+D.tick+' · '+(D.tick/1200).toFixed(1)+' min<br>Mana P1 <b>'+D.mana[0]+'</b> · P2 <b>'+D.mana[1]+'</b><br>Units P1 <b>'+D.units[0]+'</b> · P2 <b>'+D.units[1]+'</b>';
  }
  layout(); window.addEventListener('resize', layout);
  window.__ready = true;
  </script></body></html>`);

  const VIEWPORTS = [
    { name: 'phone-667x375', width: 667, height: 375, dpr: 2, mobile: true },
    { name: 'phone-844x390', width: 844, height: 390, dpr: 3, mobile: true },
    { name: 'chromebook-1366x768', width: 1366, height: 768, dpr: 1, mobile: false },
    { name: 'desktop-1920x1080', width: 1920, height: 1080, dpr: 1, mobile: false },
  ];

  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  for (const vp of VIEWPORTS) {
    const ctxB = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile });
    const page = await ctxB.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(htmlPath).href);
    await page.waitForFunction(() => window.__ready === true);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(outDir, `${vp.name}--sim.png`) });
    const geom = await page.evaluate(() => ({
      vw: window.innerWidth, vh: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      hudOverflowRight: (() => { const r = document.getElementById('hud').getBoundingClientRect(); return Math.max(0, Math.round(r.right - window.innerWidth)); })(),
    }));
    results.push({ viewport: vp.name, errors, geom });
    await ctxB.close();
  }
  await browser.close();
  writeFileSync(join(outDir, 'screenshots.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  for (const f of [entry, bundle, htmlPath, dataPath]) rmSync(f, { force: true });
}
