// Generates placeholder PWA PNG icons from code (no binary committed by hand).
// Draws the Arcane Dominion mark: dark rounded square, arcane ring, upward rune.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const ringR = size * 0.34;
  const ringW = size * 0.045;
  const set = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // background rounded square
      const rad = size * 0.18;
      const dxs = Math.max(rad - x, x - (size - rad), 0);
      const dys = Math.max(rad - y, y - (size - rad), 0);
      const corner = Math.hypot(dxs, dys);
      if (corner > rad) { set(x, y, 0, 0, 0, 0); continue; }
      set(x, y, 0x12, 0x10, 0x1c, 255);

      const d = Math.hypot(x - cx, y - cy);
      if (Math.abs(d - ringR) < ringW) set(x, y, 0x8b, 0x6c, 0xff, 255);

      // upward rune (triangle)
      const tw = size * 0.22;
      const th = size * 0.28;
      const topY = cy - th * 0.6;
      const ny = (y - topY) / th;
      if (ny >= 0 && ny <= 1) {
        const halfW = tw * ny;
        if (Math.abs(x - cx) < halfW && y < cy + th * 0.4) set(x, y, 0xc9, 0xb8, 0xff, 255);
      }
    }
  }
  return buf;
}

for (const size of [192, 512]) {
  const out = `public/icons/icon-${size}.png`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(size, size, draw(size)));
  console.log('wrote', out);
}
