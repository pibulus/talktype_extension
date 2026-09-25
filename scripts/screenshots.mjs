// Regenerates every marketing asset in store/ from the live extension UI:
//   screenshot-1..5.png   1280×800  Chrome Web Store screenshots (captioned)
//   promo-small.png        440×280  store small tile
//   promo-marquee.png     1400×560  store marquee tile
//   og-image.png          1200×630  OpenGraph / Twitter card for talktype.app
//   github-social.png     1280×640  GitHub repo social preview
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
const ghost = fs.readFileSync(path.join(ext, 'icons/mic.svg'), 'utf8');

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif";
const BG = `radial-gradient(circle at 50% 0%, rgba(255,214,229,.9), transparent 42%), linear-gradient(145deg,#fff8eb 0%,#fff1f7 44%,#fff9ec 100%)`;

const demoPage = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:${FONT};background:#f6f7fb;color:#202124}
  .top{height:56px;background:#fff;border-bottom:1px solid #e3e3e8;display:flex;align-items:center;padding:0 24px;font-weight:700;gap:12px}
  .top span{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#ff5c9f,#f6b43d)}
  .compose{max-width:720px;margin:40px auto;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.08);padding:28px}
  .compose h2{margin:0 0 18px;font-size:20px}
  input,textarea{width:100%;box-sizing:border-box;border:1px solid #d9dbe3;border-radius:10px;padding:12px 14px;font:15px ${FONT};margin-bottom:14px}
  textarea{height:170px;resize:none;line-height:1.5}
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
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker', { timeout: 15000 }));
const id = sw.url().split('/')[2];
await new Promise((r) => setTimeout(r, 1200));
for (const p of ctx.pages()) if (p.url().includes('onboarding')) await p.close();

// Seed: a Cloud key so the styles look live, history on so the popup has a Recent card
const seed = await ctx.newPage();
await seed.goto(`chrome-extension://${id}/options.html`);
await seed.evaluate(async () => {
  await window.TalkTypeStorage.setApiKey('screenshot-key');
  await chrome.storage.sync.set({ transcriptionEngine: 'cloud' });
});
await seed.close();

// Capture a page region as base64 PNG
async function capture(url, { width, height, prep, clip, fullPage = false } = {}) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await page.waitForTimeout(900);
  if (prep) await prep(page);
  const png = await page.screenshot({ type: 'png', clip, fullPage });
  await page.close();
  return png.toString('base64');
}

// Compose: brand background, headline, and the UI capture in a soft frame
async function compose(file, { size, headline, sub, image, imageWidth, layout = 'right', imageStyle = '' }) {
  const page = await ctx.newPage();
  await page.setViewportSize(size);
  const frame = `border-radius:22px;box-shadow:0 30px 70px rgba(255,92,159,.28), 0 0 0 1.5px rgba(255,176,210,.7);${imageStyle}`;
  const text = `<div style="max-width:${layout === 'top' ? '900px' : '440px'};${layout === 'top' ? 'text-align:center' : ''}">
      <div style="font-size:${layout === 'top' ? 44 : 50}px;font-weight:900;color:#202432;letter-spacing:-1.4px;line-height:1.02">${headline}</div>
      ${sub ? `<div style="font-size:${layout === 'top' ? 19 : 20}px;color:rgba(56,61,77,.82);margin-top:14px;line-height:1.45;font-weight:500">${sub}</div>` : ''}
    </div>`;
  const img = image ? `<img src="data:image/png;base64,${image}" style="width:${imageWidth}px;${frame}">` : '';
  const body =
    layout === 'top'
      ? `<div style="display:flex;flex-direction:column;align-items:center;gap:30px;padding-top:44px">${text}${img}</div>`
      : `<div style="display:flex;align-items:center;justify-content:center;gap:64px;height:100%;padding:0 60px">${layout === 'left' ? img + text : text + img}</div>`;
  await page.setContent(
    `<html><body style="margin:0;width:${size.width}px;height:${size.height}px;overflow:hidden;font-family:${FONT};background:${BG}">${body}</body></html>`
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, file) });
  await page.close();
}

const tabIdOf = async () => (await sw.evaluate(async () => (await chrome.tabs.query({})).slice(-1)[0].id));

// ---- 1. Inline ghost + live toast on a mail-like page ----
const inline = await capture('http://localhost:8766/', {
  width: 1000,
  height: 640,
  prep: async (page) => {
    await page.focus('#body');
    const tabId = await tabIdOf();
    await sw.evaluate(async (tabId) => {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          lastKnownShortcut = 'Alt+Shift+D';
          showStatusNotification('Listening — words land as you talk', 'recording', {
            hint: stopHint(),
            caption: '…and the questionable playlist',
            action: { label: 'Done', onClick: () => {} }
          });
        }
      });
    }, tabId);
    await page.waitForTimeout(600);
  }
});
await compose('screenshot-1-inline.png', {
  size: { width: 1280, height: 800 },
  layout: 'top',
  headline: 'Talk into any text box.',
  sub: 'A little ghost appears next to every text field on the web. Click it, say your thing, done.',
  image: inline,
  imageWidth: 940
});

// ---- 2. Popup ----
const popup = await capture(`chrome-extension://${id}/popup.html`, { width: 340, height: 214 });
await compose('screenshot-2-popup.png', {
  size: { width: 1280, height: 800 },
  layout: 'right',
  headline: 'One button.<br>Any text box.',
  sub: 'Click the ghost or press <b>Alt+Shift+D</b>. It lands where your cursor is, and on your clipboard just in case.',
  image: popup,
  imageWidth: 470
});

// ---- 3. Engines (onboarding step 1) ----
const engines = await capture(`chrome-extension://${id}/onboarding.html`, {
  width: 760,
  height: 900,
  clip: { x: 60, y: 350, width: 640, height: 500 }
});
await compose('screenshot-3-engines.png', {
  size: { width: 1280, height: 800 },
  layout: 'left',
  headline: 'Four engines.<br>Your call.',
  sub: 'Quick works the second you install. Cloud brings the personality styles. Live streams as you talk. Private never sends a byte anywhere.',
  image: engines,
  imageWidth: 600
});

// ---- 4. Styles (settings) ----
const styles = await capture(`chrome-extension://${id}/options.html`, {
  width: 760,
  height: 1400,
  prep: async (page) => page.evaluate(() => document.getElementById('style-card').scrollIntoView()),
  clip: { x: 60, y: 0, width: 640, height: 466 }
});
await compose('screenshot-4-styles.png', {
  size: { width: 1280, height: 800 },
  layout: 'right',
  headline: 'Six personalities.<br>Or bring your own.',
  sub: 'Clean & Accurate for work. Surly Pirate for Slack. Quill & Ink for the email that deserves it. Or write your own instructions.',
  image: styles,
  imageWidth: 600
});

// ---- 5. Trust ----
await compose('screenshot-5-private.png', {
  size: { width: 1280, height: 800 },
  layout: 'top',
  headline: 'No account. No server in the middle.',
  sub: 'Your key stays on your device and only ever goes to the provider you picked. No analytics, no telemetry. Private mode keeps your voice entirely on your machine.',
  image: await (async () => {
    const pre = await ctx.newPage();
    await pre.goto(`chrome-extension://${id}/options.html`);
    await pre.evaluate(() => chrome.storage.sync.set({ transcriptionEngine: 'offline' }));
    await pre.close();
    return capture(`chrome-extension://${id}/options.html`, {
      width: 760,
      height: 900,
      clip: { x: 60, y: 100, width: 640, height: 500 }
    });
  })(),
  imageWidth: 680
});

// ---- Tiles: ghost + wordmark on brand background ----
async function tile(file, size, { ghostSize, title, tag, titleSize, tagSize, gap = 28 }) {
  const page = await ctx.newPage();
  await page.setViewportSize(size);
  await page.setContent(`<html><body style="margin:0;width:${size.width}px;height:${size.height}px;display:flex;align-items:center;justify-content:center;gap:${gap}px;font-family:${FONT};background:${BG}">
    ${ghost.replace('width="64" height="64"', `width="${ghostSize}" height="${ghostSize}"`)}
    <div><div style="font-size:${titleSize}px;font-weight:900;color:#202432;letter-spacing:-2px;line-height:1">${title}</div>
    <div style="font-size:${tagSize}px;font-weight:700;color:#d73374;margin-top:10px">${tag}</div></div></body></html>`);
  await page.screenshot({ path: path.join(out, file) });
  await page.close();
}
await tile('promo-small.png', { width: 440, height: 280 }, { ghostSize: 120, title: 'TalkType', tag: 'Talk into any text box.', titleSize: 44, tagSize: 17, gap: 22 });
await tile('promo-marquee.png', { width: 1400, height: 560 }, { ghostSize: 300, title: 'TalkType', tag: 'Talk into any text box on the web.', titleSize: 120, tagSize: 34, gap: 60 });
await tile('og-image.png', { width: 1200, height: 630 }, { ghostSize: 280, title: 'TalkType', tag: 'Say it messy, get it clean.<br>Voice to text in any text box.', titleSize: 108, tagSize: 30, gap: 56 });
await tile('github-social.png', { width: 1280, height: 640 }, { ghostSize: 280, title: 'TalkType', tag: 'Chrome extension · voice to text anywhere<br>Cloud, live, or fully offline. Your key, no account.', titleSize: 104, tagSize: 26, gap: 56 });

await ctx.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });
for (const stale of ['promo-small-440x280.png', 'screenshot-2-onboarding.png', 'screenshot-3-settings.png', 'screenshot-4-popup.png']) {
  fs.rmSync(path.join(out, stale), { force: true });
}
console.log('Assets written to', out);
