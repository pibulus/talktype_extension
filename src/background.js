// Background service worker for TalkType extension
importScripts('storage-service.js', 'gemini-service.js', 'deepgram-live.js');

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
  // Validate sender is our own extension
  if (sender.id !== chrome.runtime.id) return;

  if (message.action === 'transcribeAudio') {
    // All Gemini calls route through here so the API key stays in this worker.
    globalThis.TalkTypeGemini.transcribe(message)
      .then((text) => sendResponse({ text }))
      .catch((error) => sendResponse({ error: error.message || 'Transcription failed.' }));
    return true;
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
