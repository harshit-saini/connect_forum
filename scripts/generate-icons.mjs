// Renders the app icons from SVG using Chromium. Run: CHROMIUM_PATH=... node scripts/generate-icons.mjs
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const TEAL = "#0f766e";
// Two overlapping circles: two people connecting. `pad` keeps the artwork inside the maskable safe zone.
const svg = (size, { rounded, pad }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="${TEAL}"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <circle cx="204" cy="256" r="104" fill="none" stroke="#ffffff" stroke-width="30" opacity="0.95"/>
    <circle cx="308" cy="256" r="104" fill="none" stroke="#99f6e4" stroke-width="30" opacity="0.95"/>
  </g>
</svg>`;

const targets = [
  ["public/icons/icon-192.png", 192, { rounded: true, pad: 0.06 }],
  ["public/icons/icon-512.png", 512, { rounded: true, pad: 0.06 }],
  ["public/icons/maskable-512.png", 512, { rounded: false, pad: 0.28 }],
  ["public/icons/apple-touch-icon.png", 180, { rounded: false, pad: 0.1 }],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [file, size, opts] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg(size, opts)}`);
  await writeFile(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  console.log("wrote", file);
}
await browser.close();
await writeFile("src/app/icon.svg", svg(512, { rounded: true, pad: 0.06 }).trim());
console.log("wrote src/app/icon.svg");
