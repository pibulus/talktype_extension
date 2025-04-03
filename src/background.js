// Background script for Audio to Text extension

// Function to set the icon based on system theme
const setIconBasedOnTheme = () => {
  // Check if system is using dark mode
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Set appropriate icon paths based on theme
  const iconPath = isDark
    ? {
        16: "icons/icon_white/favicon-16x16.png",
        32: "icons/icon_white/favicon-32x32.png",
        48: "icons/icon_white/android-icon-48x48.png",
        96: "icons/icon_white/favicon-96x96.png",
        128: "icons/icon_white/android-icon-192x192.png",
        144: "icons/icon_white/android-icon-144x144.png",
        192: "icons/icon_white/android-icon-192x192.png"
      }
    : {
        16: "icons/icon_black/favicon-16x16.png",
        32: "icons/icon_black/favicon-32x32.png",
        48: "icons/icon_black/android-icon-48x48.png",
        96: "icons/icon_black/favicon-96x96.png",
        128: "icons/icon_black/android-icon-192x192.png",
        144: "icons/icon_black/android-icon-144x144.png",
        192: "icons/icon_black/android-icon-192x192.png"
      };

  // Update the icon
  chrome.action.setIcon({ path: iconPath });
};

// Listen for changes in color scheme
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setIconBasedOnTheme);

// Pre-load popup resources
function preloadPopupResources() {
  // Pre-load the popup page to keep it in the cache
  fetch(chrome.runtime.getURL('popup.html'))
    .then(response => response.text())
    .catch(error => console.error('Error preloading popup:', error));
    
  // Pre-load key scripts
  const scriptsToPreload = [
    'audio-service.js',
    'api-service.js', 
    'popup.js'
  ];
  
  scriptsToPreload.forEach(script => {
    fetch(chrome.runtime.getURL(script))
      .then(response => response.text())
      .catch(error => console.error(`Error preloading ${script}:`, error));
  });
  
  // Pre-load icon
  const imageToPreload = new Image();
  imageToPreload.src = chrome.runtime.getURL('icons/favicon-32x32.png');
}

// Initialize extension when installed
chrome.runtime.onInstalled.addListener(async () => {
  console.log('TalkType extension installed');
  
  // Set icon based on current system theme
  setIconBasedOnTheme();
  
  // Preload resources for faster popup display
  preloadPopupResources();
  
  // Set default settings if not already set
  const settings = await chrome.storage.sync.get(['apiKey', 'smartModeEnabled']);
  if (!settings.apiKey) {
    await chrome.storage.sync.set({
      apiKey: '',
      enabledSites: ['*'], // Enable on all sites by default
      smartModeEnabled: true // Enable smart mode by default
    });
    
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  } else if (settings.smartModeEnabled === undefined) {
    // Ensure smartModeEnabled is set if apiKey exists but smartModeEnabled doesn't
    await chrome.storage.sync.set({
      smartModeEnabled: true // Enable smart mode by default
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getApiKey') {
    // Get API key from storage and ensure immediate response
    chrome.storage.sync.get(['apiKey'], (result) => {
      console.log('Sending API key to content script:', result.apiKey ? 'API key found' : 'No API key');
      
      // Make sure we're sending a response even if there's an error
      try {
        sendResponse({ apiKey: result.apiKey || '' });
      } catch (error) {
        console.error('Error sending API key response:', error);
        
        // Try to send a response again if the first attempt failed
        try {
          sendResponse({ apiKey: result.apiKey || '', error: 'Retry after error' });
        } catch (retryError) {
          console.error('Failed to send API key response even after retry:', retryError);
        }
      }
    });
    return true; // Indicates async response is coming
  }
  
  // Forward active input status from content script to popup
  if (message.action === 'activeInputChanged') {
    console.log('Active input changed in content script, forwarding to popup');
    
    // Forward message to popup if it's open
    chrome.runtime.sendMessage({
      action: 'updateSmartModeStatus',
      hasActiveInput: message.hasActiveInput,
      inputInfo: message.inputInfo
    }).catch(error => {
      // This likely means the popup isn't open, which is fine
      if (!error.message.includes('receiving end does not exist')) {
        console.error('Error forwarding active input status:', error);
      }
    });
    
    return true;
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
    // Open our dedicated permission fix page instead of the options page
    chrome.windows.create({
      url: chrome.runtime.getURL('permission-fix.html'),
      type: 'popup',
      width: 400,
      height: 420
    }, () => {
      sendResponse({ success: true });
    });
    return true; // Indicates async response
  }
  
  if (message.action === 'openOptions') {
    // Open the options page
    chrome.runtime.openOptionsPage(() => {
      sendResponse({ success: true });
    });
    return true; // Indicates async response
  }
});

// Preload popup when browser starts
chrome.runtime.onStartup.addListener(() => {
  // Set icon based on current system theme
  setIconBasedOnTheme();
  
  // Delay preloading slightly to prioritize browser startup
  setTimeout(preloadPopupResources, 1000);
});

// Periodically preload popup resources to keep them warm in cache
setInterval(preloadPopupResources, 60 * 60 * 1000); // Refresh cache every hour