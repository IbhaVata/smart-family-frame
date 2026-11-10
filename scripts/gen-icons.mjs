// Generates simple PNG app icons (solid warm background + frame + sun + hills)
// without any native dependencies. Output: public/icon-192.png, icon-512.png, apple-touch-icon.png
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public');

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const mix = (a, b, t) => a + (b - a) * t;
function pixel(u, v) {
  // background gradient
  let r = mix(58, 21, (u + v) / 2), g = mix(42, 16, (u + v) / 2), b = mix(34, 13, (u + v) / 2);
  // frame border
  const inFrame = u > 0.17 && u < 0.83 && v > 0.23 && v < 0.77;
  const onBorder = inFrame && !(u > 0.205 && u < 0.795 && v > 0.265 && v < 0.735);
  if (onBorder) { r = 233; g = 220; b = 203; }
  // sun
  const dx = u - 0.39, dy = v - 0.42;
  if (Math.sqrt(dx * dx + dy * dy) < 0.066) { r = 242; g = 184; b = 128; }
  // hills
  const inner = u > 0.205 && u < 0.795 && v > 0.265 && v < 0.735;
  if (inner) {
    const hill1 = 0.70 - 0.18 * Math.exp(-Math.pow((u - 0.42) / 0.11, 2));
    const hill2 = 0.72 - 0.14 * Math.exp(-Math.pow((u - 0.62) / 0.09, 2));
    if (v > Math.min(hill1, hill2)) { r = 201; g = 111; b = 74; }
  }
  return [Math.round(r), Math.round(g), Math.round(b), 255];
}
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(join(outDir, name), png(size, pixel));
  console.log('wrote', name);
}
