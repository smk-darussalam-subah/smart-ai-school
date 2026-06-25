// Generate PWA icons (icon-192.png, icon-512.png) for DIIS brand
// Usage: node scripts/generate-pwa-icons.js
const sharp = require('sharp');
const path = require('path');

function buildSvg(size) {
  const rx = Math.round(size * 0.18);
  const fontSize = Math.round(size * 0.55);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#10b981"/>
      <stop offset="100%" style="stop-color:#059669"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="url(#bg)"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
    font-family="Arial, sans-serif" font-weight="900" font-size="${fontSize}"
    fill="white">D</text>
</svg>`;
}

const outDir = path.join(__dirname, '..', 'apps', 'web', 'public');

(async () => {
  await sharp(Buffer.from(buildSvg(192))).png().toFile(path.join(outDir, 'icon-192.png'));
  console.log('Created icon-192.png (192x192)');

  await sharp(Buffer.from(buildSvg(512))).png().toFile(path.join(outDir, 'icon-512.png'));
  console.log('Created icon-512.png (512x512)');

  console.log('PWA icons generated successfully.');
})().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
