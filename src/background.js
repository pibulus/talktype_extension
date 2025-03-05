// Background script for Audio to Text extension

// Initialize extension when installed
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Audio to Text extension installed');
  
  // Set default settings if not already set
  const settings = await chrome.storage.sync.get(['apiKey']);
  if (!settings.apiKey) {
    await chrome.storage.sync.set({
      apiKey: '',
      enabledSites: ['*'] // Enable on all sites by default
    });
    
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getApiKey') {
    // Get API key from storage
    chrome.storage.sync.get(['apiKey'], (result) => {
      console.log('Sending API key to content script:', result.apiKey ? 'API key found' : 'No API key');
      sendResponse({ apiKey: result.apiKey || '' });
    });
    return true; // Indicates async response is coming
  }
  
  if (message.action === 'checkSiteEnabled') {
    // Check if extension is enabled for the current site
    const url = new URL(sender.tab.url);
    const hostname = url.hostname;
    
    chrome.storage.sync.get(['enabledSites'], (result) => {
      const enabledSites = result.enabledSites || ['*'];
      const isEnabled = enabledSites.includes('*') || enabledSites.includes(hostname);
      sendResponse({ isEnabled });
    });
    return true; // Indicates async response
  }
  
  if (message.action === 'requestMicrophonePermission') {
    // Let's try a simpler approach by just opening the options page
    // instead of a custom permission page
    chrome.runtime.openOptionsPage(() => {
      sendResponse({ success: true });
    });
    return true; // Indicates async response
  }
});