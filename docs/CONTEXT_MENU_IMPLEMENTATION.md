# TalkType Context Menu Implementation Plan

## Current Implementation Analysis

After reviewing the TalkType extension codebase, I've identified several issues with the current context menu implementation that could affect its reliability across platforms:

### What's Working
- The extension correctly declares the `contextMenus` permission in manifest.json
- Context menu creation during installation
- Basic click handling in background.js
- Response handling in content.js

### Issues Identified
1. **Incomplete Context Types**: Using mixed context types including some non-standard ones
2. **Inconsistent Menu Creation**: Only created on install, not on browser startup
3. **Error Handling**: Limited error handling for messaging failures
4. **Platform-Specific Testing**: Lack of cross-platform verification
5. **Redundant Context Types**: Some specified context types are redundant or unsupported

## Implementation Plan

### 1. Update Manifest.json Permissions

The current permissions section appears correct, but should be verified to ensure it contains:

```json
"permissions": [
  "contextMenus",
  "storage",
  "activeTab",
  "scripting",
  "notifications"
],
```

- **Status**: ✅ Verified in current code
- **Action Needed**: None, permissions are correct

### 2. Standardize Context Menu Creation

Update `background.js` to ensure reliable context menu creation across all platforms:

```javascript
// Function to create context menu
function createContextMenu() {
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
        });
        console.log('TalkType: Context menu created successfully');
      } else {
        console.log('TalkType: Context menu disabled by user preference');
      }
    });
  });
}

// Create menu on various events to ensure it's always available
chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);

// Create immediately as a fallback
createContextMenu();
```

- **Status**: ⚠️ Current implementation has issues
- **Action Needed**: 
  - Replace current context menu creation code
  - Add `onStartup` listener
  - Add immediate creation as fallback
  - Simplify to use only standard context types

### 3. Improve Context Menu Click Handling

Enhance the context menu click handler in `background.js`:

```javascript
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('TalkType: Context menu clicked:', info.menuItemId);
  
  if (info.menuItemId === "talktype-transcribe") {
    console.log('TalkType: Sending message to content script for tab:', tab.id);
    console.log('TalkType: Context info:', JSON.stringify(info));
    
    // Send message to content script with enhanced error handling
    chrome.tabs.sendMessage(tab.id, {
      action: "startTranscriptionFromContextMenu",
      info: info // Pass the context info to help with debugging
    }).then(response => {
      console.log('TalkType: Content script responded:', response);
    }).catch(error => {
      console.error('TalkType: Error sending message to content script:', error);
      
      // Show notification to user
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon_white/android-icon-96x96.png',
        title: 'TalkType Error',
        message: 'Could not start transcription. Please try again or reload the page.'
      });
    });
  }
});
```

- **Status**: ⚠️ Current implementation needs enhancement
- **Action Needed**: 
  - Add improved error handling
  - Enhance logging for better debugging
  - Ensure proper notifications on failure

### 4. Enhance Content Script Message Handling

Update the message handling in `content.js` to be more robust:

```javascript
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('TalkType: Message received in content script:', request.action);
  
  // Send immediate response to prevent connection issues
  sendResponse({ received: true, status: "processing" });
  
  if (request.action === "startTranscriptionFromContextMenu") {
    console.log('TalkType: Processing context menu action with info:', request.info);
    
    // First check if the context menu feature is enabled
    chrome.storage.sync.get(['contextMenu'], function(result) {
      // If contextMenu setting is explicitly false, don't proceed
      if (result.contextMenu === false) {
        console.log('TalkType: Context menu feature is disabled in settings');
        showStatusNotification('Context menu feature is disabled. Enable it in options.', 'warning');
        return;
      }
      
      // Get the active element (where the user right-clicked)
      const targetInputElement = document.activeElement;
      console.log('TalkType: Active element is:', targetInputElement);
      
      // Additional logging for debugging
      if (request.info) {
        console.log('TalkType: Context info editable:', request.info.editable);
        console.log('TalkType: Context info selectionText:', request.info.selectionText);
      }
      
      // Validate if it's a proper input element
      if (!isValidTextInputElement(targetInputElement)) {
        console.error('TalkType: Context menu target is not a valid text input element');
        showStatusNotification('Cannot transcribe: Invalid input element', 'error');
        return;
      }
      
      console.log('TalkType: Starting context menu transcription for:', targetInputElement);
      
      // Start the recording process
      startContextMenuRecording(targetInputElement);
    });
    
    return true; // Indicates we'll handle this asynchronously
  }
  
  return false;
});
```

- **Status**: ⚠️ Current implementation can be improved
- **Action Needed**: 
  - Enhance logging
  - Add validation for active element
  - Improve error handling and user feedback
  - Handle selection text if present

### 5. Create Test Page

Create a test page for consistent verification across platforms:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TalkType Context Menu Test</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
    }
    .test-container {
      margin: 20px 0;
      padding: 15px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background-color: #f9f9f9;
    }
    h1 {
      color: #6f42c1;
    }
    h2 {
      margin-top: 30px;
      color: #555;
    }
    textarea, input {
      width: 100%;
      padding: 10px;
      margin: 10px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .editable {
      border: 1px solid #ddd;
      padding: 10px;
      min-height: 100px;
      border-radius: 4px;
      background-color: white;
    }
    .instructions {
      background-color: #f0f0f7;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .platform {
      display: inline-block;
      background-color: #6f42c1;
      color: white;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 14px;
      margin-right: 5px;
    }
  </style>
</head>
<body>
  <h1>TalkType Context Menu Test Page</h1>
  
  <div class="instructions">
    <p>This page helps verify the TalkType extension context menu across different platforms.</p>
    <p>Instructions:</p>
    <ol>
      <li>Right-click on each input type below</li>
      <li>The "Transcribe with TalkType" menu item should appear</li>
      <li>Click the menu item to test transcription</li>
      <li>Verify the transcript appears in the input field</li>
    </ol>
  </div>

  <h2>Test 1: Standard Input Field</h2>
  <div class="test-container">
    <label for="test-input">Input type="text" (right-click here):</label>
    <input type="text" id="test-input" placeholder="Right-click here to test context menu">
  </div>

  <h2>Test 2: Textarea</h2>
  <div class="test-container">
    <label for="test-textarea">Textarea (right-click here):</label>
    <textarea id="test-textarea" rows="5" placeholder="Right-click here to test context menu"></textarea>
  </div>

  <h2>Test 3: Contenteditable Div</h2>
  <div class="test-container">
    <label>Contenteditable div (right-click here):</label>
    <div class="editable" contenteditable="true">This is a contenteditable div. Right-click here to test the context menu.</div>
  </div>

  <h2>Test 4: Selected Text</h2>
  <div class="test-container">
    <p>Select this text and right-click to test the "selection" context.</p>
  </div>

  <h2>Platform-Specific Notes</h2>
  <div class="test-container">
    <p><span class="platform">Windows</span> Context menus typically appear immediately where you click</p>
    <p><span class="platform">macOS</span> Context menus might have slight visual differences</p>
    <p><span class="platform">Linux</span> Context menu behavior may vary by distribution</p>
  </div>

  <footer style="margin-top: 40px; color: #777; font-size: 14px; text-align: center;">
    TalkType Extension Testing Tool &copy; 2025
  </footer>
</body>
</html>
```

- **Status**: ❌ Missing from current implementation
- **Action Needed**: 
  - Create this test page and save it as test-context-menu.html
  - Use for testing across different platforms

### 6. Testing and Verification Procedure

After implementing the changes, follow this testing procedure:

1. **Development Mode Testing**:
   - Visit chrome://extensions
   - Enable Developer mode
   - Load the extension unpacked
   - Click "Inspect views: service worker"
   - Check console for errors or warnings

2. **Basic Functionality Test**:
   - Open the test-context-menu.html page
   - Right-click on each input type
   - Verify the "Transcribe with TalkType" menu item appears
   - Click the menu item and verify the transcription process starts

3. **Cross-Platform Testing**:
   - Test on Windows, macOS, and Linux if possible
   - Check for visual or behavioral differences
   - Verify functionality works the same across platforms

4. **Edge Cases**:
   - Test on dynamically loaded inputs
   - Test in iframes if supported
   - Test with inputs in shadow DOM
   - Test on inputs that appear after page load

## Implementation Checklist

- [ ] Update `background.js` with standardized menu creation
- [ ] Enhance context menu click handling in `background.js`
- [ ] Improve message handling in `content.js`
- [ ] Create test-context-menu.html for testing
- [ ] Test on multiple platforms
- [ ] Document any platform-specific issues or workarounds

## Current Code Assessment

Based on my analysis of the current code in `background.js`:

```javascript
// From current background.js
chrome.runtime.onInstalled.addListener(async () => {
  // Remove existing context menu items first to prevent duplicates
  chrome.contextMenus.removeAll();
  
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
  
  // Create context menu items if enabled (default to true if setting doesn't exist)
  if (settings.contextMenu !== false) {
    chrome.contextMenus.create({
      id: "talktype-transcribe",
      title: "Transcribe with TalkType",
      contexts: ["editable", "frame", "selection", "input", "textarea"]
    });
    
    console.log('TalkType: Context menu item created');
  } else {
    console.log('TalkType: Context menu disabled by user preference');
  }
});
```

**Issues with Current Implementation**:

1. Context menu creation only happens on install, not on browser startup
2. Using non-standard context types like "input" and "textarea" (redundant with "editable")
3. No fallback for service worker restarts
4. Missing handling for menu changes in chrome.storage.onChanged listener

The current code in `content.js` for handling context menu actions also needs improvement:

```javascript
// From current content.js
if (request.action === "startTranscriptionFromContextMenu") {
  // First check if the context menu feature is enabled
  chrome.storage.sync.get(['contextMenu'], function(result) {
    // If contextMenu setting is explicitly false, don't proceed
    if (result.contextMenu === false) {
      console.log('TalkType: Context menu feature is disabled in settings');
      showStatusNotification('Context menu feature is disabled. Enable it in options.', 'warning');
      return;
    }
    
    // Show notification that we received the message
    showStatusNotification('Context menu action received!', 'info');
    
    // Get the active element (where the user right-clicked)
    targetInputElement = document.activeElement;
    console.log('TalkType: Active element is:', targetInputElement);
    
    // Add debug information
    if (request.info && request.info.editable) {
      console.log('TalkType: Context menu was triggered on an editable element according to Chrome');
    }
    
    // Validate if it's a proper input element
    if (!isValidTextInputElement(targetInputElement)) {
      console.error('TalkType: Context menu target is not a valid text input element');
      showStatusNotification('Cannot transcribe: Invalid input element', 'error');
      return;
    }
    
    console.log('TalkType: Starting context menu transcription for:', targetInputElement);
    
    // Start the recording process
    startContextMenuRecording();
  });
  
  return true; // Indicates we'll handle this asynchronously
}
```

**Issues with Current Message Handling**:
1. Limited error handling for edge cases
2. Could improve debugging information
3. No support for handling selection text when using selection context

## Conclusion

The current implementation of the context menu feature in TalkType is functional but has several issues that could affect its reliability across platforms. By implementing the changes outlined in this plan, the context menu functionality will be more robust, reliable, and consistent across all platforms.

The most critical changes are:
1. Adding the `onStartup` event listener for menu creation
2. Simplifying to only use standard context types
3. Adding more comprehensive error handling
4. Creating a test page for consistent verification

These changes will significantly improve the user experience and reduce potential support issues related to the context menu functionality.