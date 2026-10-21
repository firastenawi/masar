// يرسم أيقونة مَسار (مسار صاعد ينتهي بهدف) ويحفظها PNG بلا مكتبات خارجية.
// التشغيل: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const OUT = path.join(import.meta.dirname, "..", "apps", "web", "public", "icons");
const BG = [0x1f, 0x4e, 0x79];
const FG = [0xff, 0xff, 0xff];
const ACCENT = [0xfb, 0xbf, 0x24]; // الهدف
const SS = 4; // تنعيم الحواف بأخذ عينات متعددة لكل بكسل

// نقاط المسار بإحداثيات من 0 إلى 1
const PATH = [
  [0.22, 0.76],
  [0.4, 0.58],
  [0.52, 0.66],
  [0.72, 0.38],
];
const GOAL = [0.76, 0.3];

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** لون نقطة واحدة: خلفية بزوايا مستديرة، ثم خط المسار، ثم دائرة الهدف */
function sample(x, y, { scale, rounded }) {
  // تصغير الرسم حول المركز (للأيقونة القابلة للقص maskable)
  const gx = 0.5 + (x - 0.5) / scale;
  const gy = 0.5 + (y - 0.5) / scale;

  if (rounded) {
    const r = 0.22;
    const cx = Math.min(Math.max(x, r), 1 - r);
    const cy = Math.min(Math.max(y, r), 1 - r);
    if (Math.hypot(x - cx, y - cy) > r) return null; // شفاف خارج الزوايا
  }
  if (Math.hypot(gx - GOAL[0], gy - GOAL[1]) < 0.085) return ACCENT;
  for (let i = 0; i < PATH.length - 1; i++) {
    if (distToSegment(gx, gy, PATH[i], PATH[i + 1]) < 0.045) return FG;
  }
  for (const p of PATH.slice(0, -1)) if (Math.hypot(gx - p[0], gy - p[1]) < 0.045) return FG; // وصلات مستديرة
  return BG;
}

function render(size, options) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, options);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return rgba;
}

// ───── ترميز PNG ─────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const icons = [
  ["icon-192.png", 192, { scale: 1, rounded: true }],
  ["icon-512.png", 512, { scale: 1, rounded: true }],
  // maskable: خلفية كاملة والرسم داخل المنطقة الآمنة (يقصّها Android بأشكال مختلفة)
  ["icon-512-maskable.png", 512, { scale: 0.72, rounded: false }],
  // iPhone لا يدعم الشفافية في أيقونة الشاشة الرئيسية
  ["apple-touch-icon.png", 180, { scale: 0.9, rounded: false }],
  ["favicon-32.png", 32, { scale: 1, rounded: true }],
];
for (const [name, size, options] of icons) {
  writeFileSync(path.join(OUT, name), encodePng(size, render(size, options)));
  console.log("✓", name);
}
