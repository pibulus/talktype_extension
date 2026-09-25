// Regenerates the Chrome Web Store screenshots (1280×800) in store/.
// Needs playwright + its Chromium: `npm i -g playwright && npx playwright install chromium`
// Run: node scripts/screenshots.mjs
import { chromium } from 'playwright';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ext = path.join(root, 'src');
const out = path.join(root, 'store');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'talktype-shots-'));
const SIZE = { width: 1280, height: 800 };

const demoPage = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7fb;color:#202124}
  .top{height:56px;background:#fff;border-bottom:1px solid #e3e3e8;display:flex;align-items:center;padding:0 24px;font-weight:700;gap:12px}
  .top span{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#ff5c9f,#f6b43d)}
  .compose{max-width:720px;margin:48px auto;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.08);padding:28px}
  .compose h2{margin:0 0 18px;font-size:20px}
  input,textarea{width:100%;box-sizing:border-box;border:1px solid #d9dbe3;border-radius:10px;padding:12px 14px;font:15px inherit;margin-bottom:14px}
  textarea{height:190px;resize:none;line-height:1.5}
  .send{display:inline-block;padding:10px 20px;border-radius:999px;background:#202432;color:#fff;font-weight:700}
</style></head><body>
<div class="top"><span></span> Mail</div>
<div class="compose"><h2>New message</h2>
<input placeholder="To"><input placeholder="Subject" value="Re: Friday">
<textarea id="body">Hey — just talked this in with TalkType. Friday works, I'll bring the good coffee and the questionable playlist. </textarea>
<span class="send">Send</span></div></body></html>`;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(demoPage);
}).listen(8766);

const ctx = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium',
  viewport: SIZE,
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker', { timeout: 15000 }));
const id = sw.url().split('/')[2];
await new Promise((r) => setTimeout(r, 1200));
for (const p of ctx.pages()) if (p.url().includes('onboarding')) await p.close();

// Seed a fake key so pages render in their "ready" state
const seed = await ctx.newPage();
await seed.goto(`chrome-extension://${id}/options.html`);
await seed.evaluate(() => window.TalkTypeStorage.setApiKey('screenshot-key'));
await seed.close();

const shot = async (name, url, prep) => {
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(900);
  if (prep) await prep(page);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.close();
};

// 1. Mic button + live toast on a mail-like page
await shot('screenshot-1-inline', 'http://localhost:8766/', async (page) => {
  await page.focus('#body');
  const [tab] = (await sw.evaluate(async () => (await chrome.tabs.query({})).slice(-1)));
  await sw.evaluate(async (tabId) => {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        lastKnownShortcut = 'Alt+Shift+D';
        showStatusNotification('Listening — words land as you talk', 'recording', {
          hint: stopHint(),
          caption: "…and the questionable playlist",
          action: { label: 'Done', onClick: () => {} }
        });
      }
    });
  }, tab.id);
  await page.waitForTimeout(600);
});

// 2. Onboarding tour
await shot('screenshot-2-onboarding', `chrome-extension://${id}/onboarding.html`);

// 3. Settings
await shot('screenshot-3-settings', `chrome-extension://${id}/options.html`);

// 4. Popup, framed large on a brand background (captured first — a plain
// page can't iframe an extension page)
{
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 340, height: 214 });
  await pop.goto(`chrome-extension://${id}/popup.html`);
  await pop.waitForTimeout(900);
  const png = (await pop.screenshot({ type: 'png' })).toString('base64');
  await pop.close();

  const page = await ctx.newPage();
  await page.setViewportSize(SIZE);
  await page.setContent(`<html><body style="margin:0;width:1280px;height:800px;display:flex;align-items:center;justify-content:center;gap:72px;
    background:radial-gradient(circle at 50% 0%, rgba(255,214,229,.9), transparent 40%),linear-gradient(145deg,#fff8eb 0%,#fff1f7 44%,#fff9ec 100%);font-family:-apple-system,Segoe UI,Roboto,sans-serif">
    <div style="max-width:440px"><div style="font-size:48px;font-weight:800;color:#202432;letter-spacing:-1px;line-height:1.05">One button.<br>Any text box.</div>
    <div style="font-size:19px;color:rgba(56,61,77,.8);margin-top:16px;line-height:1.45">Click the ghost or press <b>Alt+Shift+D</b>. Say your thing. It lands where your cursor is — and on your clipboard, just in case.</div></div>
    <img src="data:image/png;base64,${png}" style="width:459px;border-radius:26px;box-shadow:0 30px 70px rgba(255,92,159,.3);border:1.5px solid rgba(255,176,210,.6)">
  </body></html>`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'screenshot-4-popup.png') });
  await page.close();
}

await ctx.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });
console.log('Screenshots written to', out);
