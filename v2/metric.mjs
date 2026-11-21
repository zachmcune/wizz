// Readability metric from ACTUAL PIXELS: how many separate unit blobs can be distinguished?
// Method: find connected components of "unit-coloured" pixels (non-terrain, non-HUD) in the fight
// region, and count blobs above a minimum area. More distinct blobs = more readable.
import sharp from 'sharp';
export async function countBlobs(file, region) {
  const img = sharp(file);
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const x0 = region?.x ?? 0, y0 = region?.y ?? 0;
  const w = Math.min(region?.w ?? meta.width, meta.width - x0);
  const h = Math.min(region?.h ?? meta.height, meta.height - y0);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * info.width + (x0 + x)) * 4;
      const r = data[i], g = data[i+1], b = data[i+2];
      // Terrain is green-dominant. Units are saturated non-green (purple/orange/grey-blue).
      const max = Math.max(r,g,b), min = Math.min(r,g,b);
      const sat = max === 0 ? 0 : (max-min)/max;
      const greenish = g >= r && g >= b;
      const greyish = sat < 0.12 && max > 60 && max < 200;
      const isUnit = (!greenish && sat > 0.18) || greyish;
      if (isUnit) mask[y*w+x] = 1;
    }
  }
  // 4-connected flood fill, ignoring components smaller than minArea.
  const seen = new Uint8Array(w*h);
  const areas = [];
  const stack = [];
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || seen[p]) continue;
    let area = 0;
    stack.length = 0; stack.push(p); seen[p] = 1;
    while (stack.length) {
      const q = stack.pop(); area++;
      const qx = q % w, qy = (q / w) | 0;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = qx+dx, ny = qy+dy;
        if (nx<0||ny<0||nx>=w||ny>=h) continue;
        const n = ny*w+nx;
        if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    areas.push(area);
  }
  areas.sort((a,b)=>b-a);
  return { blobs: areas.filter(a=>a>=24).length, largest: areas[0]??0, total: areas.length, w, h };
}
