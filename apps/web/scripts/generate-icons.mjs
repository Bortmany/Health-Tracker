// Generates the PWA icons without any image libraries: draws the logo
// pixel-by-pixel and writes real PNG files using only Node's zlib.
// The logo: dark rounded square, bright green line trending down (weight
// going down = "Cut"), with a dot marking today.
// Run: node scripts/generate-icons.mjs   (outputs into public/)

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../public');
mkdirSync(outDir, { recursive: true });

const BG = [10, 10, 10];
const ACCENT = [200, 241, 53];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Distance from point to line segment, for drawing the trend line.
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function smooth(edge, dist) {
  return Math.max(0, Math.min(1, (edge - dist) + 0.5));
}

function drawIcon(size, opaque) {
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const stroke = size * 0.055;
  // Downward trend line points (relative coords)
  const pts = [
    [0.2, 0.32],
    [0.42, 0.48],
    [0.56, 0.4],
    [0.8, 0.66],
  ].map(([x, y]) => [x * size, y * size]);
  const dotR = size * 0.05;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded-square mask
      const cx = Math.max(radius - x, x - (size - 1 - radius), 0);
      const cy = Math.max(radius - y, y - (size - 1 - radius), 0);
      const cornerDist = Math.hypot(cx, cy);
      const inShape = opaque ? 1 : smooth(radius, cornerDist);
      if (inShape <= 0) continue;

      let [r, g, b] = BG;
      // Trend line
      let d = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        d = Math.min(d, segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
      }
      const lineA = smooth(stroke, d);
      // End dot
      const dotA = smooth(dotR, Math.hypot(x - pts[3][0], y - pts[3][1]) - dotR);
      const a = Math.max(lineA, dotA);
      if (a > 0) {
        r = Math.round(r + (ACCENT[0] - r) * a);
        g = Math.round(g + (ACCENT[1] - g) * a);
        b = Math.round(b + (ACCENT[2] - b) * a);
      }

      const idx = (y * size + x) * 4;
      px[idx] = r;
      px[idx + 1] = g;
      px[idx + 2] = b;
      px[idx + 3] = Math.round(255 * inShape);
    }
  }
  return encodePng(size, px);
}

// Apple touch icons must be fully opaque (iOS renders transparency as black).
writeFileSync(join(outDir, 'icon-192.png'), drawIcon(192, false));
writeFileSync(join(outDir, 'icon-512.png'), drawIcon(512, false));
writeFileSync(join(outDir, 'apple-touch-icon.png'), drawIcon(180, true));
console.log('Icons written to public/: icon-192.png, icon-512.png, apple-touch-icon.png');
