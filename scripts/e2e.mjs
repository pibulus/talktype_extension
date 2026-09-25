// End-to-end smoke: loads the extension in headless Chromium with a fake mic
// and a stubbed provider, then drives shortcut / Esc / mic click / popup paths.
// Needs playwright: `npm i -g playwright && npx playwright install chromium`.
// Run: node scripts/e2e.mjs
// End-to-end with Chromium's fake mic + a stubbed transcription provider.
import fs from 'fs'; import os from 'os'; import path from 'path';
import { chromium } from 'playwright';
import http from 'http';
const ext = new URL('../src', import.meta.url).pathname;
const server = http.createServer((req, res) => { res.setHeader('Content-Type','text/html');
  res.end(`<html><body><textarea id="t" style="width:400px;height:100px"></textarea><input id="i" type="text" style="width:300px"></body></html>`); }).listen(8767);
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'talktype-e2e-')), { headless: true, channel: 'chromium',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const id = sw.url().split('/')[2];
await new Promise(r => setTimeout(r, 1000));
for (const p of ctx.pages()) if (p.url().includes('onboarding')) await p.close();
const errs = [];
sw.on('console', m => { if (m.type()==='error') errs.push('[sw] '+m.text()); });

// Stub the provider inside the worker; record what it receives.
await sw.evaluate(() => {
  globalThis.__calls = [];
  globalThis.TalkTypeGemini.transcribe = async (msg) => { globalThis.__calls.push({ mime: msg.mimeType, bytes: msg.audioBase64.length, style: msg.style }); return 'hello from the fake mic'; };
});
const seed = await ctx.newPage(); await seed.goto(`chrome-extension://${id}/options.html`);
// The stubbed provider sits behind the Cloud engine; Quick (the install default) can't run headless
await seed.evaluate(async () => { await window.TalkTypeStorage.setApiKey('stub'); await chrome.storage.sync.set({ transcriptionEngine: 'cloud' }); }); await seed.close();

// 1. Page: shortcut start → wait → shortcut stop → text lands in textarea
const page = await ctx.newPage();
page.on('pageerror', e => errs.push('[page] '+e.message));
await page.goto('http://localhost:8767/'); await page.waitForTimeout(800);
await page.focus('#t');
const tabId = await sw.evaluate(async () => (await chrome.tabs.query({})).slice(-1)[0].id);
await sw.evaluate((tabId) => sendToTab(tabId, { action: 'toggleRecording', shortcut: 'Alt+Shift+D' }), tabId);
await page.waitForTimeout(1500);
const recording = await sw.evaluate((tabId) => chrome.scripting.executeScript({ target:{tabId}, func: () => isRecording }).then(r => r[0].result), tabId);
await sw.evaluate((tabId) => sendToTab(tabId, { action: 'toggleRecording', shortcut: 'Alt+Shift+D' }), tabId);
await page.waitForTimeout(2500);
const textareaValue = await page.inputValue('#t');
console.log('shortcut: recording flag =', recording, '| textarea =', JSON.stringify(textareaValue));

// 2. Page: Esc discards → no second call
await sw.evaluate((tabId) => sendToTab(tabId, { action: 'toggleRecording', shortcut: 'Alt+Shift+D' }), tabId);
await page.waitForTimeout(800);
await page.keyboard.press('Escape'); await page.waitForTimeout(600);
const callsAfterEsc = await sw.evaluate(() => globalThis.__calls.length);
console.log('esc: provider calls =', callsAfterEsc, '(expect 1)');

// 3. Real (trusted) click on the mic button that belongs to #i
await page.focus('#i');
const btnBox = await sw.evaluate((tabId) => chrome.scripting.executeScript({ target:{tabId}, func: () => { const b=[...document.querySelectorAll('.audio-to-text-mic-button')].find(x=>x.talkTypeInputElement.id==='i'); const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; } }).then(r=>r[0].result), tabId);
await page.mouse.click(btnBox.x, btnBox.y); await page.waitForTimeout(1200);
await page.mouse.click(btnBox.x, btnBox.y); await page.waitForTimeout(2500);
const micValue = await page.inputValue('#i');
console.log('mic click: input =', JSON.stringify(micValue));

// 4. Popup: record → insert into focused page field (smart mode).
// The worker's "active tab" must be the page, not the popup tab this harness opens.
await page.focus('#t'); await page.fill('#t', 'before ');
await page.evaluate(() => { const t=document.getElementById('t'); t.setSelectionRange(t.value.length,t.value.length); });
await sw.evaluate((tabId) => { chrome.tabs.query = async () => [{ id: tabId, url: 'http://localhost:8767/' }]; }, tabId);
const popup = await ctx.newPage();
popup.on('pageerror', e => errs.push('[popup] '+e.message));
await popup.addInitScript((tabId) => { const q = () => Promise.resolve([{ id: tabId, url: 'http://localhost:8767/' }]); Object.defineProperty(chrome.tabs, 'query', { value: q }); }, tabId);
await popup.goto(`chrome-extension://${id}/popup.html`); await popup.waitForTimeout(1000);
console.log('popup target line:', JSON.stringify(await popup.textContent('#target')));
await popup.click('#record'); await popup.waitForTimeout(1200); await popup.click('#record'); await popup.waitForTimeout(2500);
console.log('popup: result =', JSON.stringify(await popup.textContent('#result-text')), '| status =', await popup.textContent('#status-text'));
const popupValue = await page.inputValue('#t');
console.log('popup: textarea now =', JSON.stringify(popupValue));
// 5. Smart Mode toggled in settings reaches the already-open tab without a reload
const opt = await ctx.newPage(); await opt.goto(`chrome-extension://${id}/options.html`);
await opt.evaluate(() => chrome.storage.sync.set({ smartModeEnabled: false })); await opt.waitForTimeout(400); await opt.close();
await page.focus('#t');
const smartOff = await sw.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { action: 'checkActiveInput' }), tabId);
console.log('smart mode off, live: hasActiveInput =', smartOff.hasActiveInput, '(expect false)');

// 6. A fresh copy injected over an old one adopts the page's mic buttons
await sw.evaluate((tabId) => chrome.scripting.executeScript({ target: { tabId }, func: () => {
  document.querySelectorAll('.talktype-button-wrapper').forEach((w) => w.classList.add('stale'));
} }), tabId);
await sw.evaluate((tabId) => chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', func: () => adoptOrphanedButtons() }), tabId);
const stale = await page.evaluate(() => document.querySelectorAll('.talktype-button-wrapper.stale').length);
const markers = await page.evaluate(() => document.querySelectorAll('[data-has-mic-button]').length);
console.log('adopt orphaned: stale wrappers =', stale, '| markers =', markers, '(expect 0 / 0)');

const calls = await sw.evaluate(() => globalThis.__calls);
console.log('provider calls:', JSON.stringify(calls));
await ctx.close(); server.close();
console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');

// Hard pass/fail for CI
const failures = [];
if (errs.length) failures.push('console/page errors');
if (!recording) failures.push('shortcut did not start recording');
if (textareaValue !== 'hello from the fake mic') failures.push('shortcut text not inserted');
if (callsAfterEsc !== 1) failures.push('Esc still called the provider');
if (micValue !== 'hello from the fake mic') failures.push('mic button click did not insert');
if (popupValue !== 'before hello from the fake mic') failures.push('popup did not insert at the cursor');
if (smartOff.hasActiveInput !== false) failures.push('Smart Mode change did not reach the tab');
if (stale !== 0 || markers !== 0) failures.push('orphaned buttons not adopted');
if (failures.length) {
  console.error('FAILED:', failures.join('; '));
  process.exit(1);
}
console.log('PASS');
