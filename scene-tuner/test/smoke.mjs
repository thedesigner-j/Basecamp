// Headless smoke test: editor loads, cursor reveals the bottom layer, the
// reveal fades back, and the standalone runtime plays a packed video.
// Run from scene-tuner/:  npm test   (needs `npm run build` first)
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const root = resolve(new URL('..', import.meta.url).pathname);
const out = join(root, 'test/output');
await mkdir(out, { recursive: true });

// Test video: blue top half, orange bottom half (WebM, since test Chromium has no H.264)
if (!existsSync(join(out, 'packed.webm'))) {
  execSync(`ffmpeg -v error -y -f lavfi -i "color=c=0x2266cc:s=320x180:d=3" -f lavfi -i "color=c=0xff8800:s=320x180:d=3" -filter_complex "[0:v][1:v]vstack" -c:v libvpx-vp9 -b:v 0 -crf 40 "${join(out, 'packed.webm')}"`);
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.webm': 'video/webm', '.mp4': 'video/mp4', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// wait for N seconds of the effect's own clock (headless software GL can be slow)
async function waitEffectTime(page, getFx, secs) {
  const t0 = await page.evaluate(`(${getFx})().time`);
  await page.waitForFunction(`(${getFx})().time > ${t0 + secs}`, null, { timeout: 30000 });
}

// ---------- editor ----------
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/dist/scene-tuner.html`);
  await page.waitForFunction(() => window.fx && window.fx.gl && window.fx.time > 0.5);

  const px = (fx, fy) => page.evaluate(([fx, fy]) => {
    const c = window.fx.canvas;
    const t = document.createElement('canvas');
    t.width = c.width; t.height = c.height;
    const g = t.getContext('2d');
    g.drawImage(c, 0, 0);
    return [...g.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data];
  }, [fx, fy]);

  const box = await page.locator('#preview').boundingBox();
  const before = await px(0.5, 0.5);
  await page.evaluate(() => window.fx.set({ hold: 0.3, fade: 0.4, smoothing: 0, edgeNoise: 0, ripple: 0 }));
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await sleep(300);
  const during = await px(0.5, 0.5);
  await page.screenshot({ path: join(out, 'editor-reveal.png') });
  // glow layer is orange at the center: red channel jumps
  check(during[0] > before[0] + 40, `editor: cursor reveals bottom layer (R ${before[0]} -> ${during[0]})`);

  await page.mouse.move(box.x + box.width + 200, box.y + 20); // leave the preview (into panel)
  await waitEffectTime(page, () => window.fx, 1.2);
  const after = await px(0.5, 0.5);
  check(Math.abs(after[0] - before[0]) < 20, `editor: reveal fades back after hold+fade (R ${after[0]} vs ${before[0]})`);

  await page.evaluate(() => window.fx.set({ showMask: true }));
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4, { steps: 10 });
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 20 });
  await sleep(100);
  await page.screenshot({ path: join(out, 'editor-mask.png') });
  await page.evaluate(() => window.fx.set({ showMask: false }));

  await page.click('#export-btn');
  const embed = await page.inputValue('#code-embed');
  const script = await page.inputValue('#code-script');
  check(embed.includes('data-scene-reveal') && embed.includes('"radius"'), 'export: embed snippet contains config');
  check(script.startsWith('<script>') && script.length > 10000, `export: inline script present (${script.length} chars)`);
  await page.screenshot({ path: join(out, 'editor-export.png') });
  await page.keyboard.press('Escape');

  // load a packed video through the UI, then reload: files should be restored
  await page.setInputFiles('#packed-input', join(out, 'packed.webm'));
  await page.waitForFunction(() => { const v = window.fx.getVideos()[0]; return v && v.readyState >= 2; }, null, { timeout: 15000 });
  await waitEffectTime(page, () => window.fx, 0.3);
  const vidTop = await px(0.5, 0.15);
  check(vidTop[2] > vidTop[0], `editor: packed video top half shows (blue) ${vidTop}`);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.15, { steps: 6 });
  await waitEffectTime(page, () => window.fx, 0.2);
  const vidBot = await px(0.5, 0.15);
  check(vidBot[0] > vidBot[2], `editor: cursor reveals packed bottom half (orange) ${vidBot}`);
  await page.reload();
  await page.waitForFunction(() => window.fx && window.fx.getVideos().length === 1, null, { timeout: 15000 });
  const names = await page.$$eval('.slot .name', (els) => els.map((e) => e.textContent));
  check(names.every((n) => n === 'packed.webm'), `editor: files restored after reload (${names})`);
  await page.click('#demo');

  // mobile layout
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(300);
  await page.screenshot({ path: join(out, 'editor-mobile.png') });
  await page.mouse.wheel(0, 500);
  await sleep(400);
  await page.screenshot({ path: join(out, 'editor-mobile-panel.png') });

  check(errors.length === 0, `editor: no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}

// ---------- standalone runtime + packed video ----------
{
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cfg = { layers: { top: { src: `${base}/test/output/packed.webm`, crop: 'top-half' }, bottom: { src: `${base}/test/output/packed.webm`, crop: 'bottom-half' } }, settings: { hold: 0.2, fade: 0.3, smoothing: 0, edgeNoise: 0, ripple: 0 } };
  await page.setContent(`<!doctype html><body style="margin:0;background:#111">
    <div id="hero" data-scene-reveal style="position:relative;width:100%;height:100vh;overflow:hidden">
      <script type="application/json">${JSON.stringify(cfg)}</script>
      <h1 style="position:absolute;left:40px;top:40px;color:#fff;z-index:1;font:600 40px system-ui">Overlay text above the canvas</h1>
    </div>
    <script src="${base}/dist/scene-reveal.min.js"></script></body>`);
  await page.waitForFunction(() => document.getElementById('hero').sceneReveal && [...document.getElementById('hero').sceneReveal.media.values()].every((m) => m.ready), null, { timeout: 15000 });
  const fxReady = await page.evaluate(() => document.getElementById('hero').sceneReveal.media.size);
  check(fxReady === 1, 'runtime: packed video loaded once for both layers');
  await sleep(300);
  const shot = async (name) => {
    const buf = await page.screenshot({ path: join(out, name) });
    return buf;
  };
  // sample via screenshot -> canvas
  const sample = async (x, y) => {
    const b64 = (await page.screenshot()).toString('base64');
    return page.evaluate(async ([b64, x, y]) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      return [...g.getImageData(x, y, 1, 1).data];
    }, [b64, x, y]);
  };
  const idle = await sample(450, 400);
  check(idle[2] > idle[0], `runtime: top half (blue) shows by default ${idle}`);
  await page.mouse.move(100, 400);
  await page.mouse.move(450, 400, { steps: 10 });
  await sleep(150);
  const hover = await sample(450, 400);
  await shot('runtime-reveal.png');
  check(hover[0] > hover[2], `runtime: cursor reveals bottom half (orange) ${hover}`);
  // cursor over the overlay text still drives the effect
  await page.mouse.move(200, 60, { steps: 5 });
  await waitEffectTime(page, () => document.getElementById('hero').sceneReveal, 0.15);
  const overText = await sample(200, 62);
  check(overText[0] > overText[2], `runtime: works under overlay elements ${overText}`);
  check(errors.length === 0, `runtime: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
