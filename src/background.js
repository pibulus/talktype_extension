// Background service worker for TalkType extension
importScripts('storage-service.js');

// Initialize extension when installed
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('TalkType extension installed');
  await globalThis.TalkTypeStorage.migrateApiKeyToLocal();

  if (details.reason === 'install') {
    await chrome.storage.sync.set({
      enabledSites: ['*'],
      smartModeEnabled: true,
      transcriptionStyle: 'standard'
    });

    chrome.runtime.openOptionsPage();
    return;
  }

  // Ensure newer settings exist for upgrades without treating a missing API key as a reinstall.
  const settings = await chrome.storage.sync.get(['enabledSites', 'smartModeEnabled', 'transcriptionStyle']);
  const updates = {};
  if (settings.enabledSites === undefined) updates.enabledSites = ['*'];
  if (settings.smartModeEnabled === undefined) updates.smartModeEnabled = true;
  if (settings.transcriptionStyle === undefined) updates.transcriptionStyle = 'standard';
  if (Object.keys(updates).length) await chrome.storage.sync.set(updates);
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender is our own extension
  if (sender.id !== chrome.runtime.id) return;

  if (message.action === 'getApiKey') {
    globalThis.TalkTypeStorage.getApiKey()
      .then((apiKey) => sendResponse({ apiKey }))
      .catch(() => sendResponse({ apiKey: '' }));
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

  if (message.action === 'checkSiteEnabled') {
    if (!sender.tab?.url) {
      sendResponse({ isEnabled: false });
      return true;
    }
    const url = new URL(sender.tab.url);
    const hostname = url.hostname;

    chrome.storage.sync.get(['enabledSites'], (result) => {
      const enabledSites = result.enabledSites || ['*'];
      const isEnabled = enabledSites.includes('*') || enabledSites.includes(hostname);
      sendResponse({ isEnabled });
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
