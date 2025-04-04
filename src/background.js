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

// Function to create context menu - centralized for reuse
function createContextMenu() {
  console.log('TalkType: Creating context menu');
  
  // First remove any existing items to prevent duplicates
  chrome.contextMenus.removeAll(() => {
    // Check if feature is enabled in settings
    chrome.storage.sync.get(['contextMenu'], (result) => {
      // Default to enabled if setting doesn't exist
      const contextMenuEnabled = result.contextMenu !== false;
      
      if (contextMenuEnabled) {
        chrome.contextMenus.create({
          id: "talktype-transcribe",
          title: "Transcribe with TalkType",
          contexts: ["editable", "selection"] // Use only standard, supported types
        }, () => {
          // Check for creation errors
          if (chrome.runtime.lastError) {
            console.error('TalkType: Error creating context menu:', chrome.runtime.lastError);
          } else {
            console.log('TalkType: Context menu created successfully');
          }
        });
      } else {
        console.log('TalkType: Context menu disabled by user preference');
      }
    });
  });
}

// Initialize extension when installed
chrome.runtime.onInstalled.addListener(async () => {
  console.log('TalkType extension installed');
  
  // Set icon based on current system theme
  setIconBasedOnTheme();
  
  // Preload resources for faster popup display
  preloadPopupResources();
  
  // Set default settings if not already set
  const settings = await chrome.storage.sync.get(['apiKey', 'contextMenu']);
  if (!settings.apiKey) {
    await chrome.storage.sync.set({
      apiKey: '',
      autoRecord: false,
      contextMenu: true, // Enable context menu by default
      enabledSites: ['*'] // Enable on all sites by default
    });
    
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }
  
  // Create context menu
  createContextMenu();
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
  console.log('TalkType: Browser started');
  
  // Set icon based on current system theme
  setIconBasedOnTheme();
  
  // Create context menu
  createContextMenu();
  
  // Delay preloading slightly to prioritize browser startup
  setTimeout(preloadPopupResources, 1000);
});

// Periodically preload popup resources to keep them warm in cache
setInterval(preloadPopupResources, 60 * 60 * 1000); // Refresh cache every hour

// Global state to track current recording status
let isRecording = false;
let autoRecordEnabled = false;

// Create context menu immediately as a fallback in case neither onStartup nor onInstalled is triggered
// This happens during development or after service worker updates
setTimeout(createContextMenu, 500);

// Extension icon states
const ICON_STATE = {
  IDLE: 'idle',        // Default state
  RECORDING: 'recording', // When actively recording
  AUTO_RECORD: 'auto_record' // When auto-record is enabled
};

// Function to update extension icon based on state
function updateExtensionIcon(state = ICON_STATE.IDLE) {
  try {
    let iconPath = {};
    let badgeText = '';
    let badgeColor = '#FFFFFF';
    
    switch(state) {
      case ICON_STATE.RECORDING:
        // Red icon for recording state
        iconPath = {
          "16": "icons/icon_white/favicon-16x16.png", // Fallback to white icons
          "32": "icons/icon_white/favicon-32x32.png",
          "48": "icons/icon_white/android-icon-48x48.png",
          "128": "icons/icon_white/android-icon-144x144.png"
        };
        badgeText = '●';
        badgeColor = '#d32f2f'; // Red badge for recording
        break;
        
      case ICON_STATE.AUTO_RECORD:
        // Blue badge for auto-record mode
        iconPath = {
          "16": "icons/icon_white/favicon-16x16.png",
          "32": "icons/icon_white/favicon-32x32.png",
          "48": "icons/icon_white/android-icon-48x48.png",
          "128": "icons/icon_white/android-icon-144x144.png"
        };
        badgeText = 'A';
        badgeColor = '#2196F3'; // Blue badge
        break;
        
      default: // ICON_STATE.IDLE
        // Use system theme detection for idle state
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        iconPath = isDark
          ? {
              "16": "icons/icon_white/favicon-16x16.png",
              "32": "icons/icon_white/favicon-32x32.png",
              "48": "icons/icon_white/android-icon-48x48.png",
              "128": "icons/icon_white/android-icon-144x144.png"
            }
          : {
              "16": "icons/icon_black/favicon-16x16.png",
              "32": "icons/icon_black/favicon-32x32.png",
              "48": "icons/icon_black/android-icon-48x48.png",
              "128": "icons/icon_black/android-icon-144x144.png"
            };
        badgeText = '';
        break;
    }
    
    // Update the extension icon
    chrome.action.setIcon({ path: iconPath });
    
    // Update badge
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    
    console.log(`Extension icon updated to ${state} state`);
  } catch (error) {
    console.error('Error updating extension icon:', error);
  }
}

// Load auto-record setting on startup
chrome.storage.sync.get(['autoRecord'], (result) => {
  autoRecordEnabled = result.autoRecord === true;
  console.log('Auto-record mode loaded:', autoRecordEnabled);
  
  // Set initial icon state based on auto-record setting
  if (autoRecordEnabled) {
    updateExtensionIcon(ICON_STATE.AUTO_RECORD);
  }
});

// Listen for changes to storage
chrome.storage.onChanged.addListener((changes) => {
  if (changes.autoRecord) {
    autoRecordEnabled = changes.autoRecord.newValue === true;
    console.log('Auto-record mode updated:', autoRecordEnabled);
    
    // Update icon if not currently recording
    if (!isRecording) {
      updateExtensionIcon(autoRecordEnabled ? ICON_STATE.AUTO_RECORD : ICON_STATE.IDLE);
    }
  }
  
  // Handle context menu toggle changes
  if (changes.contextMenu) {
    console.log('TalkType: Context menu setting updated:', changes.contextMenu.newValue);
    
    // Use the centralized function to update the context menu
    createContextMenu();
  }
});

// Message from popup about recording state
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateRecordingState') {
    isRecording = message.isRecording === true;
    console.log('Recording state updated:', isRecording);
    
    // Update icon based on recording state
    if (isRecording) {
      updateExtensionIcon(ICON_STATE.RECORDING);
    } else {
      updateExtensionIcon(autoRecordEnabled ? ICON_STATE.AUTO_RECORD : ICON_STATE.IDLE);
    }
    
    sendResponse({ success: true });
    return true;
  }
});

// Add action icon click handler for toggle functionality
chrome.action.onClicked.addListener(async (tab) => {
  // If this is triggered, it means the popup didn't open (user clicked extension button while recording)
  // Only handle clicks when auto-record is enabled or when already recording
  console.log('Extension icon clicked. Current state:', { isRecording, autoRecordEnabled });
  
  // We only want to handle the click if we're in a state where the popup won't open
  if (isRecording) {
    try {
      // Check if the current tab has the popup open
      const views = chrome.extension.getViews({ type: 'popup' });
      
      // If popup is not open, send message to the tab to stop recording
      if (views.length === 0) {
        console.log('Sending stop recording message to tab');
        
        // Show confirmation dialog via content script
        const confirmed = await chrome.tabs.sendMessage(tab.id, {
          action: 'confirmStopRecording',
          message: 'Are you sure you want to stop recording?'
        });
        
        if (confirmed) {
          console.log('User confirmed stopping recording');
          
          // Send stop recording message to all tabs (since we don't know which has the recording)
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, {
                action: 'stopRecording'
              }).catch(err => {
                // Ignore errors from tabs that don't have content script
                console.log('Error sending message to tab:', err);
              });
            });
          });
          
          // Update state
          isRecording = false;
          
          // Update icon to reflect the current state
          updateExtensionIcon(autoRecordEnabled ? ICON_STATE.AUTO_RECORD : ICON_STATE.IDLE);
        } else {
          console.log('User cancelled stopping recording');
        }
      }
    } catch (error) {
      console.error('Error in action click handler:', error);
    }
  } else if (autoRecordEnabled) {
    // If auto-record is enabled but we're not recording, try to start recording
    try {
      console.log('Auto-record enabled, attempting to start recording');
      // Open the popup which will auto-record
      chrome.action.openPopup();
    } catch (error) {
      console.error('Error starting auto-record:', error);
    }
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('TalkType: Context menu clicked:', info.menuItemId);
  console.log('TalkType: Context info:', JSON.stringify(info));
  
  if (info.menuItemId === "talktype-transcribe") {
    console.log('TalkType: Sending message to content script for tab:', tab.id);
    
    // Check if tab and tab ID are valid
    if (!tab || !tab.id || tab.id === -1) {
      console.error('TalkType: Invalid tab for context menu action');
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon_white/android-icon-96x96.png',
        title: 'TalkType Error',
        message: 'Cannot start transcription on this page. Try a standard web page instead.'
      });
      return;
    }
    
    // Send message to content script to start recording with enhanced error handling
    chrome.tabs.sendMessage(tab.id, {
      action: "startTranscriptionFromContextMenu",
      info: info // Pass the context info to help with debugging
    }).then(response => {
      console.log('TalkType: Content script responded:', response);
      
      // Check if the response indicates a problem
      if (response && response.error) {
        console.error('TalkType: Error from content script:', response.error);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon_white/android-icon-96x96.png',
          title: 'TalkType Error',
          message: response.error || 'Error starting transcription'
        });
      }
    }).catch(error => {
      console.error('TalkType: Error sending message to content script:', error);
      
      // Check if it's a missing content script error
      const isMissingContentScript = error.message && error.message.includes("Could not establish connection");
      
      // If content script messaging fails, show notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon_white/android-icon-96x96.png',
        title: 'TalkType Error',
        message: isMissingContentScript 
          ? 'Content script not loaded. Please reload the page and try again.'
          : 'Could not start transcription. Please try again or reload the page.'
      });
    });
  }
});