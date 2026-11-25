// Rasterizes public/favicon.svg to the PNG icon sizes using Playwright WebKit.
import { webkit } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname;
const browser = await webkit.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function shot(file, size, padding = 0) {
  const inner = size - padding * 2;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#6D28D9"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:linear-gradient(#2A0E61,#C4B5FD)">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: out(file), clip: { x: 0, y: 0, width: size, height: size } });
}

await shot('apple-touch-icon.png', 180);
await shot('icon-192.png', 192);
await shot('icon-512.png', 512);
await shot('icon-maskable-512.png', 512, 52);
await browser.close();
console.log('icons written');
