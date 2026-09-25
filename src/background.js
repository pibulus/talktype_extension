// Background service worker for TalkType extension
importScripts('storage-service.js', 'gemini-service.js', 'deepgram-live.js');

const ONBOARDING_URL = 'onboarding.html';

// Initialize extension when installed
chrome.runtime.onInstalled.addListener(async (details) => {
  await globalThis.TalkTypeStorage.migrateApiKeyToLocal();

  if (details.reason === 'install') {
    // Quick (Chrome's built-in recognition) needs no key, so a fresh install
    // works before anyone reads a word of the tour.
    await chrome.storage.sync.set({
      smartModeEnabled: true,
      transcriptionStyle: 'standard',
      transcriptionEngine: 'browser'
    });

    chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING_URL) });
    return;
  }

  // Ensure newer settings exist for upgrades without treating a missing API key as a reinstall.
  const settings = await chrome.storage.sync.get(['smartModeEnabled', 'transcriptionStyle', 'transcriptionEngine']);
  const updates = {};
  if (settings.smartModeEnabled === undefined) updates.smartModeEnabled = true;
  if (settings.transcriptionStyle === undefined) updates.transcriptionStyle = 'standard';
  if (settings.transcriptionEngine === undefined) updates.transcriptionEngine = 'cloud';
  if (Object.keys(updates).length) await chrome.storage.sync.set(updates);
});

// ===================================================================
// KEYBOARD SHORTCUT — the actual binding, not the suggested one
// Chrome silently leaves a command unbound when the suggested key clashes
// with another extension, so everything user-facing asks for the real value.
// ===================================================================

async function getShortcutBinding() {
  try {
    const commands = await chrome.commands.getAll();
    const toggle = commands.find((c) => c.name === 'toggle-recording');
    return toggle?.shortcut || '';
  } catch (e) {
    return '';
  }
}

// ===================================================================
// CONTENT SCRIPT ON DEMAND
// Right after install/update, tabs that were already open have no content
// script. Instead of asking people to reload every tab, inject it when the
// shortcut or popup needs it (activeTab + scripting; no new install warning).
// ===================================================================

const CONTENT_SCRIPT_FILES = [
  'storage-service.js',
  'sound-service.js',
  'audio-service.js',
  'api-service.js',
  'live-service.js',
  'content.js'
];

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (firstError) {
    // No listener — try injecting, then one retry. chrome://, the Web Store
    // and other restricted pages reject executeScript; we give up quietly.
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
      await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
    } catch (injectError) {
      return null;
    }
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (secondError) {
      return null;
    }
  }
}

// ===================================================================
// ENGINE ROUTER + OFFSCREEN DOCUMENT (offline model host)
// ===================================================================

let offscreenCreationPromise = null;

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length > 0) return;

  // Latch so concurrent transcriptions don't race two createDocument calls
  if (!offscreenCreationPromise) {
    offscreenCreationPromise = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification:
          'Runs the offline speech-recognition model (WASM) so audio never leaves the device.'
      })
      .finally(() => {
        offscreenCreationPromise = null;
      });
  }
  await offscreenCreationPromise;
}

// Runaway-loop brake: a bug or stuck retry shouldn't burn through a user's
// API quota. Sliding one-minute window, in-memory (resets if the worker
// sleeps — it's a soft brake, not a bouncer).
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 10;
const recentTranscriptions = [];

function enforceTranscriptionRateLimit() {
  const now = Date.now();
  while (recentTranscriptions.length && now - recentTranscriptions[0] > RATE_LIMIT_WINDOW_MS) {
    recentTranscriptions.shift();
  }
  if (recentTranscriptions.length >= RATE_LIMIT_MAX_PER_WINDOW) {
    throw new Error('Easy there — over 10 transcriptions in a minute. Take a breath and try again shortly.');
  }
  recentTranscriptions.push(now);
}

async function routeTranscription(message) {
  enforceTranscriptionRateLimit();

  const { transcriptionEngine } = await chrome.storage.sync.get({ transcriptionEngine: 'cloud' });

  if (transcriptionEngine === 'offline') {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      action: 'offscreenTranscribe',
      audioBase64: message.audioBase64,
      mimeType: message.mimeType
    });
    if (!response) throw new Error('Offline engine did not respond. Try again.');
    if (response.error) throw new Error(response.error);
    return response.text;
  }

  if (transcriptionEngine === 'browser') {
    throw new Error('The Quick engine transcribes in the page itself. Switch engines in settings to use batch transcription.');
  }

  if (transcriptionEngine === 'live') {
    // Batch requests (the popup, or a page where streaming isn't possible)
    // still use the Deepgram key, via its prerecorded endpoint — so the Live
    // engine never needs a second key.
    return globalThis.TalkTypeDeepgram.transcribePrerecorded(message);
  }

  return globalThis.TalkTypeGemini.transcribe(message);
}

// Keyboard shortcut (Alt+Shift+D by default) → toggle dictation in the active tab
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-recording') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const shortcut = await getShortcutBinding();
  await sendToTab(tab.id, { action: 'toggleRecording', shortcut });
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender is our own extension
  if (sender.id !== chrome.runtime.id) return;

  if (message.action === 'transcribeAudio') {
    // All batch transcription routes through here: keys stay in this worker,
    // and the engine setting decides Gemini (cloud) vs Deepgram vs the
    // offscreen model.
    routeTranscription(message)
      .then((text) => sendResponse({ text }))
      .catch((error) => sendResponse({ error: error.message || 'Transcription failed.' }));
    return true;
  }

  if (message.action === 'prepareOfflineModel') {
    ensureOffscreenDocument()
      .then(() => chrome.runtime.sendMessage({ action: 'offscreenPrepareModel' }))
      .then((response) => sendResponse(response || { error: 'Offline engine did not respond.' }))
      .catch((error) => sendResponse({ error: error.message || 'Could not start the offline engine.' }));
    return true;
  }

  if (message.action === 'offlineHeartbeat' || message.action === 'offlineModelProgress') {
    // Heartbeats/progress from the offscreen document exist to reset this
    // worker's idle timer during long model loads; progress also relays to
    // any open options page directly. Nothing to do here.
    return;
  }

  if (message.action === 'getSetupState') {
    // Lets content scripts and extension pages show setup hints without ever
    // touching the keys themselves.
    Promise.all([
      globalThis.TalkTypeStorage.getApiKey(),
      globalThis.TalkTypeStorage.getDeepgramApiKey(),
      chrome.storage.sync.get({ transcriptionEngine: 'cloud' }),
      getShortcutBinding()
    ])
      .then(([geminiKey, deepgramKey, { transcriptionEngine }, shortcut]) => {
        const engine = transcriptionEngine || 'cloud';
        const engineReady =
          engine === 'browser' ||
          engine === 'offline' ||
          (engine === 'live' && Boolean(deepgramKey)) ||
          (engine === 'cloud' && Boolean(geminiKey));
        sendResponse({
          engine,
          engineReady,
          hasApiKey: Boolean(geminiKey),
          hasDeepgramKey: Boolean(deepgramKey),
          shortcut
        });
      })
      .catch(() =>
        sendResponse({ engine: 'cloud', engineReady: false, hasApiKey: false, hasDeepgramKey: false, shortcut: '' })
      );
    return true;
  }

  if (message.action === 'sendToActiveTab') {
    // Popup → content script, injecting the script first if the tab predates
    // the install. Returns null when the page can't host it (chrome:// etc).
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => (tab?.id ? sendToTab(tab.id, message.payload) : null))
      .then((response) => sendResponse(response ?? null))
      .catch(() => sendResponse(null));
    return true;
  }

  if (message.action === 'activeInputChanged') {
    // Forward to popup if it's open
    chrome.runtime.sendMessage({
      action: 'updateSmartModeStatus',
      hasActiveInput: message.hasActiveInput,
      inputInfo: message.inputInfo
    }).catch(() => {
      // Popup not open — that's fine
    });
    return true;
  }

  if (message.action === 'requestMicrophonePermission') {
    chrome.windows.create({
      url: chrome.runtime.getURL('permission-fix.html'),
      type: 'popup',
      width: 400,
      height: 460
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'openOptions') {
    chrome.runtime.openOptionsPage(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'openOnboarding') {
    chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING_URL) }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'openShortcutSettings') {
    // chrome:// URLs can't be opened by web pages, only from extension contexts
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
