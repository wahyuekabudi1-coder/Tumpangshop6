import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Create Brand SVG icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF9E2C"/>
      <stop offset="100%" stop-color="#E66800"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.25"/>
    </filter>
  </defs>
  <!-- Background with smooth rounded corner -->
  <rect width="512" height="512" rx="108" fill="url(#bg)"/>
  
  <!-- Subtle inner decorative accent -->
  <circle cx="430" cy="80" r="140" fill="#ffffff" fill-opacity="0.08"/>
  <circle cx="80" cy="430" r="100" fill="#000000" fill-opacity="0.04"/>

  <!-- Shopping bag icon in center (Safe Zone) -->
  <g filter="url(#shadow)" transform="translate(106, 86)">
    <!-- Bag Handle -->
    <path d="M 90 120 C 90 40, 210 40, 210 120" fill="none" stroke="#FFFFFF" stroke-width="26" stroke-linecap="round"/>
    
    <!-- Bag Body -->
    <rect x="35" y="110" width="230" height="230" rx="36" fill="#FFFFFF"/>
    
    <!-- Bag folded detail line -->
    <line x1="35" y1="160" x2="265" y2="160" stroke="#FFF2E2" stroke-width="8"/>
    
    <!-- Tumpang Shop 'TS' monogram badge on bag -->
    <circle cx="150" cy="235" r="48" fill="#FE8A00"/>
    <text x="150" y="248" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="34" fill="#FFFFFF" text-anchor="middle" letter-spacing="-1">TS</text>
  </g>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf-8');
console.log('Saved public/icon.svg');

// Simple PNG encoder from RGBA buffer
function createPng(width, height, rgbaBuffer) {
  // CRC32 table
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }

  function crc32(buf, start = 0, end = buf.length) {
    let c = 0xffffffff;
    for (let i = start; i < end; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const chunk = Buffer.alloc(12 + len);
    chunk.writeUInt32BE(len, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    const crc = crc32(chunk, 4, 8 + len);
    chunk.writeUInt32BE(crc, 8 + len);
    return chunk;
  }

  // PNG header
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA color type
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(scanlineLength * height);
  for (let y = 0; y < height; y++) {
    rawData[y * scanlineLength] = 0; // Filter None
    const srcStart = y * width * 4;
    const destStart = y * scanlineLength + 1;
    rgbaBuffer.copy(rawData, destStart, srcStart, srcStart + width * 4);
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// Generate brand RGBA raster
function renderBrandIconRgba(size, isMaskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const cornerRadius = isMaskable ? 0 : size * 0.21; // Maskable fills full canvas

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Base gradient orange (#FF9E2C to #E66800)
      const t = (x + y) / (size * 2);
      let r = Math.round(255 * (1 - t) + 230 * t);
      let g = Math.round(158 * (1 - t) + 104 * t);
      let b = Math.round(44 * (1 - t) + 0 * t);
      let a = 255;

      if (!isMaskable) {
        // Rounded corners test
        const qx = Math.max(0, Math.abs(x - center) - (center - cornerRadius));
        const qy = Math.max(0, Math.abs(y - center) - (center - cornerRadius));
        const dist = Math.hypot(qx, qy);
        if (dist > cornerRadius) {
          a = 0;
        }
      }

      if (a > 0) {
        // Safe Zone centered Bag Graphic
        const relX = (x - center) / size;
        const relY = (y - center) / size;

        // Bag body: relX in [-0.22, 0.22], relY in [-0.05, 0.32]
        if (relX >= -0.22 && relX <= 0.22 && relY >= -0.05 && relY <= 0.32) {
          // White bag body with soft rounded edges
          r = 255; g = 255; b = 255;
          // Inner orange badge on bag: center at (0, 0.14), radius 0.1
          const badgeDist = Math.hypot(relX, relY - 0.14);
          if (badgeDist <= 0.085) {
            r = 254; g = 138; b = 0; // Orange circle badge
            // White monogram bar for 'T'
            if (relY >= 0.10 && relY <= 0.12 && Math.abs(relX) <= 0.05) {
              r = 255; g = 255; b = 255;
            } else if (relY >= 0.12 && relY <= 0.18 && Math.abs(relX) <= 0.015) {
              r = 255; g = 255; b = 255;
            }
          }
        }
        
        // Bag handle curve: radius ~0.13, relY in [-0.22, -0.03], stroke thickness ~0.035
        const handleDist = Math.hypot(relX, relY - (-0.03));
        if (relY <= -0.03 && handleDist >= 0.10 && handleDist <= 0.145) {
          r = 255; g = 255; b = 255;
        }
      }

      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = a;
    }
  }

  return buf;
}

// Generate PNGs
const sizes = [
  { file: 'pwa-192x192.png', size: 192, maskable: false },
  { file: 'pwa-512x512.png', size: 512, maskable: false },
  { file: 'pwa-maskable-512x512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
  { file: 'favicon.png', size: 64, maskable: false },
];

for (const item of sizes) {
  const rgba = renderBrandIconRgba(item.size, item.maskable);
  const png = createPng(item.size, item.size, rgba);
  fs.writeFileSync(path.join(publicDir, item.file), png);
  console.log(`Generated public/${item.file} (${item.size}x${item.size})`);
}

// Simple 1-icon ICO file from 64px favicon
const favPng = fs.readFileSync(path.join(publicDir, 'favicon.png'));
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // ICO type
icoHeader.writeUInt16LE(1, 4); // 1 image

const icoEntry = Buffer.alloc(16);
icoEntry[0] = 64; // width
icoEntry[1] = 64; // height
icoEntry[2] = 0;  // colors
icoEntry[3] = 0;  // reserved
icoEntry.writeUInt16LE(1, 4); // planes
icoEntry.writeUInt16LE(32, 6); // bpp
icoEntry.writeUInt32LE(favPng.length, 8); // size
icoEntry.writeUInt32LE(22, 12); // offset (6 + 16 = 22)

const icoFile = Buffer.concat([icoHeader, icoEntry, favPng]);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoFile);
console.log('Generated public/favicon.ico');
