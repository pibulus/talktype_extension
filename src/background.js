// Background service worker for TalkType extension
importScripts('storage-service.js', 'gemini-service.js', 'deepgram-live.js');

// "Ghost is alive" signal — a pink dot on the toolbar icon while recording,
// matching the live state in the webapp and Mac app.
function setRecordingBadge(active) {
  if (active) {
    chrome.action.setBadgeText({ text: '●' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff82ca' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Initialize extension when installed
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('TalkType extension installed');
  await globalThis.TalkTypeStorage.migrateApiKeyToLocal();

  if (details.reason === 'install') {
    await chrome.storage.sync.set({
      smartModeEnabled: true,
      transcriptionStyle: 'standard'
    });

    chrome.runtime.openOptionsPage();
    return;
  }

  // Ensure newer settings exist for upgrades without treating a missing API key as a reinstall.
  const settings = await chrome.storage.sync.get(['smartModeEnabled', 'transcriptionStyle']);
  const updates = {};
  if (settings.smartModeEnabled === undefined) updates.smartModeEnabled = true;
  if (settings.transcriptionStyle === undefined) updates.transcriptionStyle = 'standard';
  if (Object.keys(updates).length) await chrome.storage.sync.set(updates);
});

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

  // 'cloud' and 'live' both land here for batch requests (the popup always
  // records in batch mode, so live falls back to Gemini for it)
  return globalThis.TalkTypeGemini.transcribe(message);
}

// Keyboard shortcut (Alt+Shift+D by default) → toggle dictation in the active tab
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-recording') return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleRecording' }).catch(() => {
      // No content script on this page (chrome://, web store) — nothing to toggle.
    });
  });
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "verifyContextMenuExists") {
    if (!contextMenuCreated) createContextMenu();
    sendResponse({ status: "verified", contextMenuExists: contextMenuCreated });
    return true;
  }

  // Validate sender is our own extension
  if (sender.id !== chrome.runtime.id) return;

  if (message.action === 'recordingStateChanged') {
    setRecordingBadge(!!message.isRecording);
    sendResponse({ success: true });
    return;
  }

  if (message.action === 'transcribeAudio') {
    // All batch transcription routes through here: keys stay in this worker,
    // and the engine setting decides Gemini (cloud) vs the offscreen model.
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
    // Lets content scripts show setup hints without ever touching the key itself.
    Promise.all([
      globalThis.TalkTypeStorage.getApiKey(),
      globalThis.TalkTypeStorage.getDeepgramApiKey()
    ])
      .then(([geminiKey, deepgramKey]) =>
        sendResponse({ hasApiKey: Boolean(geminiKey), hasDeepgramKey: Boolean(deepgramKey) })
      )
      .catch(() => sendResponse({ hasApiKey: false, hasDeepgramKey: false }));
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
      height: 420
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
});



// Flag to track context menu creation status
let contextMenuCreated = false;

// Create context menu
function createContextMenu() {
  if (contextMenuCreated) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "talktype-transcribe",
      title: "Transcribe with TalkType",
      contexts: ["editable", "selection"]
    }, () => {
      if (chrome.runtime.lastError) {
        if (chrome.runtime.lastError.message.includes("duplicate id")) {
          contextMenuCreated = true;
        }
      } else {
        contextMenuCreated = true;
      }
    });
  });
}

chrome.storage.sync.get({ contextMenu: true }, (result) => {
  if (result.contextMenu) createContextMenu();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.contextMenu) {
    if (changes.contextMenu.newValue) createContextMenu();
    else chrome.contextMenus.removeAll();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "talktype-transcribe") {
    if (!tab || !tab.id || tab.id === -1) return;
    chrome.tabs.sendMessage(tab.id, {
      action: "startTranscriptionFromContextMenu",
      info: info,
      targetElementInfo: {
        editable: info.editable || false,
        isInput: info.editable || false,
        selectionText: info.selectionText || "",
        pageUrl: info.pageUrl || ""
      }
    }).catch(error => {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon_white/android-icon-96x96.png',
        title: 'TalkType Error',
        message: 'Could not start transcription. Please reload the page.'
      });
    });
  }
});
