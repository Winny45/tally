// Generates the PWA icons (blue square, three rising white bars) with no image dependencies.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const bars = [[0.24, 0.58], [0.44, 0.42], [0.64, 0.26]];
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const white = bars.some(([bx, top]) => u >= bx && u < bx + 0.13 && v >= top && v < 0.76);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const c = white ? [255, 255, 255] : [28, 92, 171];
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [180, 192, 512]) writeFileSync(`public/icon-${s}.png`, png(s));
