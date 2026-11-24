import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const specs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 256, height: 256 } });
p.on('console', m => console.log('console:', m.text()));
p.on('pageerror', e => console.log('err:', e.message));
await p.goto('http://localhost:5199/nescap/index.html?renderer=webgl');
await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
for (const s of specs) {
  const url = await p.evaluate(s => window.cap(s), s);
  fs.writeFileSync(`${out}/${s.name}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
await b.close();
