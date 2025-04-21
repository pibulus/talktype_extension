// Background script for TalkType extension
console.log("TalkType: Background script loaded");

// Create context menu
function createContextMenu() {
  console.log('TalkType: Creating context menu');
  
  // Remove any existing items to prevent duplicates
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "talktype-transcribe",
      title: "Transcribe with TalkType",
      contexts: ["editable", "selection"]
    }, () => {
      // Check for creation errors
      if (chrome.runtime.lastError) {
        console.error('TalkType: Error creating context menu:', chrome.runtime.lastError);
      } else {
        console.log('TalkType: Context menu created successfully');
      }
    });
  });
}

// Check context menu preference at startup
chrome.storage.sync.get({ contextMenu: true }, (result) => {
  if (result.contextMenu) {
    createContextMenu();
  } else {
    chrome.contextMenus.removeAll();
    console.log('TalkType: Context menu disabled by user preference');
  }
});

// Listen for changes to the contextMenu setting
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.contextMenu) {
    if (changes.contextMenu.newValue) {
      createContextMenu();
      console.log('TalkType: Context menu enabled by user preference');
    } else {
      chrome.contextMenus.removeAll();
      console.log('TalkType: Context menu disabled by user preference');
    }
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('TalkType: 🔄 COMMUNICATION TEST - Context menu clicked:', info.menuItemId);
  
  // Log detailed click information for debugging
  console.log('TalkType: 🔄 Context menu info:', {
    menuItemId: info.menuItemId,
    editable: info.editable,
    hasSelection: !!info.selectionText,
    selectionText: info.selectionText ? info.selectionText.substring(0, 20) + '...' : '',
    frameId: info.frameId,
    pageUrl: info.pageUrl
  });
  
  if (info.menuItemId === "talktype-transcribe") {
    console.log('TalkType: 🚀 Sending transcription request to tab:', tab.id);
    
    // Check if tab and tab ID are valid
    if (!tab || !tab.id || tab.id === -1) {
      console.error('TalkType: ❌ Invalid tab for context menu action');
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon_white/android-icon-96x96.png',
        title: 'TalkType Error',
        message: 'Cannot start transcription on this page. Try a standard web page instead.'
      });
      return;
    }
    
    console.log('TalkType: 📝 Tab details:', {
      tabId: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active
    });
    
    // Send message to content script with enhanced target element info
    chrome.tabs.sendMessage(tab.id, {
      action: "startTranscriptionFromContextMenu",
      info: info,
      targetElementInfo: {
        editable: info.editable || false,
        isInput: info.editable || false,
        selectionText: info.selectionText || "",
        pageUrl: info.pageUrl || ""
      },
      timestamp: Date.now(), // Add timestamp for tracking
      testMode: true // Flag to indicate this is part of our communication test
    }).then(response => {
      console.log('TalkType: ✅ Content script responded:', response);
      
      // Check if the response indicates a problem
      if (response && response.error) {
        console.error('TalkType: ❌ Error from content script:', response.error);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon_white/android-icon-96x96.png',
          title: 'TalkType Error',
          message: response.error || 'Error starting transcription'
        });
      } else {
        console.log('TalkType: ✅ Communication test successful!');
      }
    }).catch(error => {
      console.error('TalkType: ❌ Error sending message to content script:', error);
      
      // Check if it's a missing content script error
      const isMissingContentScript = error.message && error.message.includes("Could not establish connection");
      
      console.log('TalkType: 🔍 Error details:', {
        message: error.message,
        isMissingContentScript: isMissingContentScript,
        stack: error.stack
      });
      
      // Show notification for error
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

// Handle verification requests from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "verifyContextMenuExists") {
    console.log('TalkType: Verifying context menu exists');
    
    // Recreate the menu to ensure it exists
    createContextMenu();
    
    sendResponse({ status: "verified", timestamp: Date.now() });
    return true; // Keep channel open for async response
  }
  
  return false; // Let other handlers process other message types
});