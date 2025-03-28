// Main content script for the Audio to Text extension

// Import services from other scripts
// Note: These scripts need to be included in the manifest.json before this script

let audioService = null;
let apiService = null;
let isRecording = false;
let activeInput = null;
let apiKey = ''; // This should be set through extension options

// Initialize immediately AND ensure it runs on all DOM changes
console.log('TalkType content script loading...');
// Force immediate initialization
initializeExtension();

// Set an immediate timeout to ensure it runs after DOM is loaded
setTimeout(() => {
  console.log('TalkType running delayed initialization...');
  initializeExtension();
}, 500);

// Function to initialize the extension with robust error handling
function initializeExtension() {
  console.log('TalkType: Extension initializing...');
  
  // Ensure script execution environment is ready
  if (document.readyState === 'loading') {
    console.log('TalkType: Document still loading, deferring initialization');
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initializeExtensionCore, 100);
    });
    return;
  }
  
  // If document is already loaded, proceed with initialization
  initializeExtensionCore();
}

// Core initialization logic, separated for clarity
function initializeExtensionCore() {
  // Verify that required objects are available in the page context
  if (typeof window.AudioRecordingService === 'undefined') {
    console.error('TalkType: AudioRecordingService is not defined! Check that audio-service.js is loaded.');
    console.log('TalkType: Available global objects:', Object.keys(window).filter(k => k.includes('Service')));
    showStatusNotification('TalkType initialization error: Required scripts missing', 'error');
    
    // Inject script directly as a fallback
    injectServiceScripts();
    return;
  }
  
  if (typeof window.GeminiApiService === 'undefined') {
    console.error('TalkType: GeminiApiService is not defined! Check that api-service.js is loaded.');
    console.log('TalkType: Available global objects:', Object.keys(window).filter(k => k.includes('Service')));
    showStatusNotification('TalkType initialization error: Required scripts missing', 'error');
    
    // Inject script directly as a fallback
    injectServiceScripts();
    return;
  }
  
  // Check that chrome API is available
  if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    console.error('TalkType: chrome.runtime.sendMessage not available!');
    showStatusNotification('TalkType initialization error: Chrome API unavailable', 'error');
    return;
  }
  
  // Get API key directly from storage for more reliable access
  chrome.storage.sync.get(['apiKey'], function(result) {
    if (chrome.runtime.lastError) {
      console.error('TalkType: Error accessing storage:', chrome.runtime.lastError);
      showStatusNotification('Error accessing extension storage. Try reloading the page.', 'error');
      return;
    }
    
    console.log('TalkType: Got API key from storage:', result.apiKey ? 'Valid key' : 'Empty key');
    apiKey = result.apiKey || '';
    
    // Initialize services - even with empty API key to allow detection of inputs
    try {
      console.log('TalkType: Creating AudioRecordingService instance');
      audioService = new window.AudioRecordingService();
      
      console.log('TalkType: Creating GeminiApiService instance with API key');
      apiService = new window.GeminiApiService(apiKey);
      
      // Check if services initialized correctly
      if (!audioService || !apiService) {
        console.error('TalkType: Service initialization failed!');
        showStatusNotification('Error initializing TalkType services', 'error');
        return;
      }
      
      // Initialize input detection - do this regardless of API key status
      console.log('TalkType: Initializing input detection');
      initializeInputDetection();
      
      // Add observer to detect dynamically added inputs
      console.log('TalkType: Setting up DOM mutation observer');
      observeDynamicInputs();
      
      console.log('TalkType: Extension initialized successfully');
      
      // Check for browser mic support as an early diagnostic
      if (audioService.isRecordingSupported()) {
        console.log('TalkType: Browser supports recording');
      } else {
        console.warn('TalkType: Browser may not support recording!');
        showStatusNotification('Your browser may not support recording. Chrome is recommended.', 'info');
      }
      
      // If no API key, show prompt but still allow initialization
      if (!apiKey) {
        console.warn('TalkType: No API key found in storage.');
        showStatusNotification('Please set your API key in the extension options.', 'warning');
      }
    } catch (initError) {
      console.error('TalkType: Error during service initialization:', initError);
      showStatusNotification('Error initializing speech services: ' + initError.message, 'error');
    }
  });
}

// Inject service scripts as a fallback
function injectServiceScripts() {
  console.log('TalkType: Attempting to inject service scripts as fallback');
  
  // Create and inject the audio service script
  const audioScript = document.createElement('script');
  audioScript.src = chrome.runtime.getURL('audio-service.js');
  audioScript.onload = function() {
    console.log('TalkType: Successfully injected audio-service.js');
    
    // Now inject the API service script
    const apiScript = document.createElement('script');
    apiScript.src = chrome.runtime.getURL('api-service.js');
    apiScript.onload = function() {
      console.log('TalkType: Successfully injected api-service.js');
      
      // Try initialization again after scripts are loaded
      setTimeout(initializeExtensionCore, 100);
    };
    apiScript.onerror = function(e) {
      console.error('TalkType: Failed to inject api-service.js:', e);
    };
    document.head.appendChild(apiScript);
  };
  audioScript.onerror = function(e) {
    console.error('TalkType: Failed to inject audio-service.js:', e);
  };
  document.head.appendChild(audioScript);
}

// Also initialize on DOM content loaded and load events to ensure it works in all scenarios
document.addEventListener('DOMContentLoaded', () => {
  console.log('TalkType: DOMContentLoaded event fired');
  if (!audioService || !apiService) {
    initializeExtension();
  }
});

// Also try on window load
window.addEventListener('load', () => {
  console.log('TalkType: Window load event fired');
  if (!audioService || !apiService) {
    initializeExtension();
  }
  
  // Double check after a slight delay to catch any late-loading elements
  setTimeout(() => {
    console.log('TalkType: Final initialization check');
    initializeInputDetection();
  }, 1000);
});

// Function to initialize input detection
function initializeInputDetection() {
  console.log('TalkType: Initializing input detection for mic buttons...');
  
  // Focus on standard inputs first - these are most reliable
  const standardInputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea');
  console.log(`TalkType: Found ${standardInputs.length} standard input elements`);
  
  // Process standard inputs first - these are the most reliable
  standardInputs.forEach(input => {
    if (!input.dataset.hasMicButton) {
      addMicrophoneToInput(input);
    }
  });
  
  // Then handle specific known text editor types with careful selection
  const knownEditors = document.querySelectorAll(`
    /* Gmail compose area - enhanced for better detection */
    .Am.Al.editable, 
    [g_editable="true"],
    div[aria-label="Message Body"],
    div[aria-label="Message Text"],
    div[aria-label="Compose email"],
    div[role="textbox"][contenteditable="true"][aria-label*="Compose"],
    div[role="textbox"][contenteditable="true"][aria-label*="compose"],
    div[aria-multiline="true"][contenteditable="true"],
    
    /* Facebook comment box - broader selection for better detection */
    [contenteditable="true"][data-lexical-editor="true"],
    [contenteditable="true"][spellcheck="true"][role="textbox"],
    form[role="presentation"] [contenteditable="true"],
    .notranslate[role="textbox"][spellcheck="true"],
    div[contenteditable="true"][role="textbox"][spellcheck="true"],
    
    /* Reddit comment areas */
    .public-DraftEditor-content[contenteditable="true"],
    .DraftEditor-root [contenteditable="true"],
    .RichTextJSON-root [contenteditable="true"],
    
    /* Messaging platforms */
    [contenteditable="true"][data-slate-editor="true"],
    div[role="textbox"][contenteditable="true"],
    div[role="textbox"][aria-label*="message"],
    div[role="textbox"][aria-label*="comment"],
    div[role="textbox"][aria-label*="post"],
    div[role="textbox"][aria-label*="reply"],
    
    /* Major known rich text editors */
    .ql-editor[contenteditable="true"], 
    .ProseMirror[contenteditable="true"], 
    .public-DraftEditor-content,
    .CodeMirror-code,
    .monaco-editor .view-lines
  `);
  
  console.log(`TalkType: Found ${knownEditors.length} known rich text editors`);
  
  // Process specific known editors
  knownEditors.forEach(editor => {
    if (!editor.dataset.hasMicButton) {
      addMicrophoneToInput(editor);
    }
  });
  
  // Finally, look for elements with specific attributes that strongly suggest they are text inputs
  const clearTextInputs = document.querySelectorAll(`
    /* Elements with explicit textbox role */
    [role="textbox"]:not([aria-readonly="true"]):not([aria-disabled="true"]),
    
    /* Elements with clear text input attributes - expanded for better coverage */
    [contenteditable="true"][aria-label*="comment"],
    [contenteditable="true"][aria-label*="Comment"],
    [contenteditable="true"][aria-label*="message"],
    [contenteditable="true"][aria-label*="Message"],
    [contenteditable="true"][aria-label*="write"],
    [contenteditable="true"][aria-label*="Write"],
    [contenteditable="true"][aria-label*="text"],
    [contenteditable="true"][aria-label*="Text"],
    [contenteditable="true"][aria-label*="post"],
    [contenteditable="true"][aria-label*="Post"],
    [contenteditable="true"][aria-label*="reply"],
    [contenteditable="true"][aria-label*="Reply"],
    
    /* Elements with placeholder text for input */
    [contenteditable="true"][placeholder],
    [contenteditable="true"][data-placeholder],
    
    /* Facebook-specific selectors */
    div[contenteditable="true"][data-lexical-editor="true"],
    div[role="textbox"][aria-label*="Write a comment"],
    div[role="textbox"][aria-label*="What's on your mind"],
    div[contenteditable="true"][spellcheck="true"],
    
    /* Gmail-specific selectors */
    div[contenteditable="true"][aria-label*="compose"],
    div[contenteditable="true"][role="textbox"][spellcheck="true"]
  `);
  
  console.log(`TalkType: Found ${clearTextInputs.length} additional text inputs with specific attributes`);
  
  // Process these as well
  clearTextInputs.forEach(element => {
    if (!element.dataset.hasMicButton && isValidTextInputElement(element)) {
      addMicrophoneToInput(element);
    }
  });
  
  // Special case for Messenger and other chat inputs which often have special classes
  const chatInputs = document.querySelectorAll(`
    [aria-label*="Type a message"],
    [aria-label*="Send a message"],
    [placeholder*="message"],
    [placeholder*="chat"],
    [data-testid*="message-composer"]
  `);
  
  console.log(`TalkType: Found ${chatInputs.length} chat input elements`);
  
  chatInputs.forEach(input => {
    if (!input.dataset.hasMicButton && isValidTextInputElement(input)) {
      addMicrophoneToInput(input);
    }
  });
  
  // Clean up log messages
  console.log('TalkType: Input detection completed');
}

// Create a stylish progress notification
function createProgressNotification(message) {
  // Remove any existing notifications first
  document.querySelectorAll('.audio-to-text-notification, .audio-to-text-progress-notification').forEach(notification => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  });
  
  // Create progress notification styles if they don't exist
  if (!document.getElementById('progress-notification-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'progress-notification-styles';
    styleEl.textContent = `
      .audio-to-text-progress-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 16px;
        font-size: 14px;
        font-weight: 500;
        color: white;
        background: linear-gradient(135deg, #6f42c1, #7a5dcb);
        box-shadow: 0 5px 20px rgba(111, 66, 193, 0.3);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        min-width: 240px;
        max-width: 300px;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .progress-bar-container {
        margin-top: 10px;
        width: 100%;
        height: 6px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        overflow: hidden;
      }
      
      .progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 1));
        border-radius: 6px;
        transition: width 0.5s cubic-bezier(0.44, 0.89, 0.56, 0.94);
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
      }
      
      .progress-status {
        display: flex;
        justify-content: space-between;
        width: 100%;
        margin-top: 6px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.8);
      }
      
      .progress-message {
        display: flex;
        align-items: center;
      }
      
      .progress-icon {
        margin-right: 10px;
        animation: pulse 1.5s infinite;
      }
      
      @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
      }
      
      .progress-percentage {
        font-weight: 600;
      }
      
      .progress-complete {
        background: linear-gradient(135deg, #52c41a, #85e255);
      }
      
      .progress-complete .progress-bar {
        background: linear-gradient(90deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 1));
      }
    `;
    document.head.appendChild(styleEl);
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'audio-to-text-progress-notification';
  
  // Create content
  notification.innerHTML = `
    <div class="progress-message">
      <span class="progress-icon">🎙️</span>
      <span>${message}</span>
    </div>
    <div class="progress-bar-container">
      <div class="progress-bar"></div>
    </div>
    <div class="progress-status">
      <span class="progress-status-text">Processing...</span>
      <span class="progress-percentage">0%</span>
    </div>
  `;
  
  // Add to DOM
  document.body.appendChild(notification);
  
  // Start initial animation
  updateProgressNotification(notification, 0);
  animateIndeterminateProgress(notification);
  
  return notification;
}

// Function to update progress notification
function updateProgressNotification(notification, percentage) {
  if (!notification || !document.body.contains(notification)) return;
  
  // Get progress elements
  const progressBar = notification.querySelector('.progress-bar');
  const progressPercentage = notification.querySelector('.progress-percentage');
  const progressStatus = notification.querySelector('.progress-status-text');
  
  // Ensure percentage is valid
  const validPercentage = Math.max(0, Math.min(100, percentage));
  
  // Update progress bar width
  if (progressBar) {
    progressBar.style.width = `${validPercentage}%`;
  }
  
  // Update percentage text
  if (progressPercentage) {
    progressPercentage.textContent = `${Math.round(validPercentage)}%`;
  }
  
  // Update status text based on percentage
  if (progressStatus) {
    if (validPercentage < 20) {
      progressStatus.textContent = 'Processing...';
    } else if (validPercentage < 50) {
      progressStatus.textContent = 'Uploading...';
    } else if (validPercentage < 80) {
      progressStatus.textContent = 'Analyzing...';
    } else if (validPercentage < 100) {
      progressStatus.textContent = 'Finishing...';
    } else {
      progressStatus.textContent = 'Complete!';
      notification.classList.add('progress-complete');
      
      // Change icon to checkmark
      const progressIcon = notification.querySelector('.progress-icon');
      if (progressIcon) {
        progressIcon.textContent = '✓';
      }
    }
  }
  
  // If we have an actual percentage, stop indeterminate animation
  if (percentage > 0) {
    stopIndeterminateProgress(notification);
  }
}

// For initial indeterminate progress animation
function animateIndeterminateProgress(notification) {
  if (!notification) return;
  
  notification._indeterminateInterval = setInterval(() => {
    const progressBar = notification.querySelector('.progress-bar');
    if (progressBar) {
      const currentWidth = parseFloat(progressBar.style.width || '0');
      
      // Create a "bouncing" effect between 10% and 30%
      if (currentWidth >= 30) {
        progressBar.style.width = '10%';
      } else {
        progressBar.style.width = `${currentWidth + 1}%`;
      }
    }
  }, 50);
}

// Stop indeterminate animation
function stopIndeterminateProgress(notification) {
  if (notification && notification._indeterminateInterval) {
    clearInterval(notification._indeterminateInterval);
    notification._indeterminateInterval = null;
  }
}

// Function to observe for dynamically added inputs
function observeDynamicInputs() {
  console.log('TalkType: Setting up MutationObserver...');
  
  // Create a focused scan function that only looks for actual text inputs
  const scanAndAttachMic = (root) => {
    // Limit console output to reduce spam
    const startTime = performance.now();
    
    // Focus on standard inputs first - these are most reliable
    const standardInputs = root.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea');
    
    // Process standard inputs first - these are the most reliable
    standardInputs.forEach(input => {
      if (!input.dataset.hasMicButton) {
        addMicrophoneToInput(input);
      }
    });
    
    // Then handle specific known text editor types with careful selection
    const knownEditors = root.querySelectorAll(`
      /* Gmail compose area */
      .Am.Al.editable, 
      [g_editable="true"],
      div[aria-label="Message Body"],
      div[aria-label="Message Text"],
      
      /* Facebook comment box - real text areas only */
      [contenteditable="true"][data-lexical-editor="true"],
      [contenteditable="true"][spellcheck="true"][role="textbox"],
      
      /* Messaging platforms */
      [contenteditable="true"][data-slate-editor="true"],
      div[role="textbox"][contenteditable="true"],
      div[role="textbox"][aria-label*="message"],
      
      /* Major known rich text editors */
      .ql-editor[contenteditable="true"], 
      .ProseMirror[contenteditable="true"], 
      .public-DraftEditor-content
    `);
    
    // Process specific known editors
    knownEditors.forEach(editor => {
      if (!editor.dataset.hasMicButton) {
        addMicrophoneToInput(editor);
      }
    });
    
    // Finally, look for elements with specific attributes that strongly suggest they are text inputs
    const clearTextInputs = root.querySelectorAll(`
      /* Elements with explicit textbox role */
      [role="textbox"]:not([aria-readonly="true"]):not([aria-disabled="true"]),
      
      /* Elements with clear text input attributes */
      [contenteditable="true"][aria-label*="comment"],
      [contenteditable="true"][aria-label*="message"],
      [contenteditable="true"][aria-label*="write"],
      [contenteditable="true"][aria-label*="text"],
      
      /* Elements with placeholder text for input */
      [contenteditable="true"][placeholder],
      [contenteditable="true"][data-placeholder]
    `);
    
    // Process these as well
    clearTextInputs.forEach(element => {
      if (!element.dataset.hasMicButton && isValidTextInputElement(element)) {
        addMicrophoneToInput(element);
      }
    });
    
    // Special case for Messenger and other chat inputs which often have special classes
    const chatInputs = root.querySelectorAll(`
      [aria-label*="Type a message"],
      [aria-label*="Send a message"],
      [placeholder*="message"],
      [placeholder*="chat"],
      [data-testid*="message-composer"]
    `);
    
    chatInputs.forEach(input => {
      if (!input.dataset.hasMicButton && isValidTextInputElement(input)) {
        addMicrophoneToInput(input);
      }
    });
    
    // Only log if it took more than 50ms to avoid spam
    const duration = performance.now() - startTime;
    if (duration > 50) {
      console.log(`TalkType: Scan completed in ${Math.round(duration)}ms`);
    }
  };
  
  // Track last scan time to throttle scans
  let lastScanTime = 0;
  const THROTTLE_INTERVAL = 1000; // Don't scan more than once per second
  
  // Create an observer that watches for DOM changes
  const observer = new MutationObserver((mutations) => {
    // Check if we should throttle the scan
    const now = Date.now();
    if (now - lastScanTime < THROTTLE_INTERVAL) {
      return; // Skip this scan due to throttling
    }
    
    let shouldScan = false;
    
    // Check if any mutations are relevant
    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      
      // If nodes were added
      if (mutation.addedNodes.length) {
        // Check if the added nodes could contain text inputs
        for (let j = 0; j < mutation.addedNodes.length; j++) {
          const node = mutation.addedNodes[j];
          
          // Skip text nodes, comments, etc.
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          
          // Check if the node is an input or contains inputs
          if (node.nodeName === 'INPUT' || node.nodeName === 'TEXTAREA' ||
              (node.hasAttribute && node.hasAttribute('contenteditable')) ||
              node.querySelector && (
                node.querySelector('input, textarea, [contenteditable="true"], [role="textbox"]')
              )) {
            shouldScan = true;
            break;
          }
        }
        
        if (shouldScan) break;
      }
      
      // If attributes changed, check if it's a relevant attribute
      if (!shouldScan && mutation.type === 'attributes') {
        const target = mutation.target;
        if (target && target.nodeType === Node.ELEMENT_NODE) {
          if (mutation.attributeName === 'contenteditable' || 
              mutation.attributeName === 'type' || 
              mutation.attributeName === 'role' || 
              mutation.attributeName === 'aria-label') {
            shouldScan = true;
            break;
          }
        }
      }
    }
    
    // If relevant changes were detected, scan the document
    if (shouldScan) {
      // Use a small delay to let the DOM settle
      setTimeout(() => {
        lastScanTime = Date.now(); // Update last scan time
        scanAndAttachMic(document.body);
      }, 100);
    }
  });
  
  // Start observing with focused mutation types
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['contenteditable', 'type', 'role', 'aria-label', 'placeholder'],
    characterData: false
  });
  
  // Initial scan of the page
  scanAndAttachMic(document.body);
}

// Function to add microphone icon to an input element
function addMicrophoneToInput(inputElement) {
  // Reduce console logging to avoid spam
  // console.log('TalkType: Adding microphone to input element:', inputElement);
  
  // CRITICAL: Perform strict validation to ensure this is really a text input element
  if (!isValidTextInputElement(inputElement)) {
    console.log('TalkType: Element is not a valid text input, skipping:', inputElement);
    return;
  }
  
  // Check if this input already has a microphone button
  if (inputElement.dataset.hasMicButton) {
    console.log('TalkType: Input already has mic button, skipping');
    return;
  }
  
  // Mark this input as having a mic button
  inputElement.dataset.hasMicButton = 'true';
  
  // Create a hardcoded microphone emoji as fallback
  const micEmoji = "🎤";
  
  // Try to get the SVG icon URL
  let micIconUrl = chrome.runtime.getURL('icons/mic.svg');
  console.log('TalkType: Microphone icon URL:', micIconUrl);
  
  // Whether we have a valid icon URL
  const hasValidIcon = micIconUrl && !micIconUrl.includes('undefined') && !micIconUrl.includes('chrome-extension://null');
  
  // Check if system is using dark mode
  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // Create microphone button with TalkType branding
  const micButton = document.createElement('button');
  micButton.className = 'audio-to-text-mic-button';
  micButton.title = 'TalkType: Click to dictate';
  micButton.style.position = 'absolute';
  micButton.style.zIndex = '5'; // Lower z-index to work better with page content
  
  // Set background based on dark mode
  if (isDarkMode) {
    micButton.style.background = 'rgba(111, 66, 193, 0.2)'; // Slightly more visible in dark mode
    micButton.style.border = '1px solid rgba(111, 66, 193, 0.4)';
    micButton.dataset.darkMode = 'true'; // Mark as dark mode for later reference
  } else {
    micButton.style.background = 'rgba(111, 66, 193, 0.15)';
    micButton.style.border = '1px solid rgba(111, 66, 193, 0.3)';
  }
  
  micButton.style.borderRadius = '50%';
  micButton.style.cursor = 'pointer';
  micButton.style.width = '28px'; // Slightly larger
  micButton.style.height = '28px'; // Slightly larger
  micButton.style.padding = '2px';
  micButton.style.opacity = '1'; // Fully visible
  micButton.style.transform = 'scale(1)';
  micButton.style.transition = 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28), opacity 0.3s ease, background 0.2s ease, box-shadow 0.2s ease';
  micButton.style.boxShadow = '0 1px 3px rgba(111, 66, 193, 0.3)'; // More subtle shadow
  micButton.style.backdropFilter = 'blur(2px)';
  micButton.style.webkitBackdropFilter = 'blur(2px)';
  micButton.style.display = 'block'; // Always visible
  
  // No animation by default - only on hover and recording
  micButton.style.animation = 'none';
  
  // Store a reference to the input element this button belongs to
  micButton.talkTypeInputElement = inputElement;
  
  // Add this animation if it doesn't exist yet
  if (!document.getElementById('talk-type-animations')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'talk-type-animations';
    styleEl.textContent = `
      @keyframes gentle-pulse {
        0% { transform: scale(1); box-shadow: 0 2px 6px rgba(111, 66, 193, 0.4); }
        50% { transform: scale(1.05); box-shadow: 0 2px 10px rgba(111, 66, 193, 0.6); }
        100% { transform: scale(1); box-shadow: 0 2px 6px rgba(111, 66, 193, 0.4); }
      }
      
      @keyframes subtle-glow {
        0% { box-shadow: 0 0 3px rgba(111, 66, 193, 0.3); }
        50% { box-shadow: 0 0 5px rgba(111, 66, 193, 0.4); }
        100% { box-shadow: 0 0 3px rgba(111, 66, 193, 0.3); }
      }
    `;
    document.head.appendChild(styleEl);
  }
  
  console.log('TalkType: Created mic button for input:', inputElement);
  
  // Create the icon (either image or text)
  if (hasValidIcon) {
    // Create SVG icon image
    const micIcon = document.createElement('img');
    micIcon.src = micIconUrl;
    
    // Apply dark mode filter for light icon on dark backgrounds
    if (isDarkMode) {
      micIcon.style.filter = 'brightness(0) invert(1)'; // Makes the icon white
    }
    
    micIcon.style.width = '100%';
    micIcon.style.height = '100%';
    micIcon.style.transition = 'transform 0.2s ease';
    
    // Handle image loading error
    micIcon.onerror = () => {
      console.error('TalkType: Failed to load microphone icon, using emoji fallback');
      micIcon.style.display = 'none';
      createEmojiIcon();
    };
    
    // Log successful load
    micIcon.onload = () => {
      console.log('TalkType: Successfully loaded microphone icon!');
    };
    
    micButton.appendChild(micIcon);
  } else {
    // Use emoji fallback immediately
    createEmojiIcon();
  }
  
  // Function to create emoji fallback
  function createEmojiIcon() {
    const textIcon = document.createElement('div');
    textIcon.innerText = micEmoji;
    textIcon.style.fontSize = '14px';
    textIcon.style.textAlign = 'center';
    textIcon.style.lineHeight = '20px';
    textIcon.style.color = '#6F42C1'; // Use purple TalkType brand color
    micButton.appendChild(textIcon);
  }
  
  // Add recording indicator
  const recordingIndicator = document.createElement('span');
  recordingIndicator.className = 'audio-to-text-recording-indicator';
  recordingIndicator.style.display = 'none';
  recordingIndicator.style.width = '8px'; // Slightly smaller
  recordingIndicator.style.height = '8px'; // Slightly smaller
  recordingIndicator.style.borderRadius = '50%';
  recordingIndicator.style.background = '#ff5c8a'; // Softer pink color
  recordingIndicator.style.position = 'absolute';
  recordingIndicator.style.top = '-2px';
  recordingIndicator.style.right = '-2px';
  recordingIndicator.style.boxShadow = '0 0 3px rgba(255, 92, 138, 0.5)'; // Softer glow
  // Don't set animation directly to avoid CSP issues
  recordingIndicator.style.border = '1px solid rgba(255, 255, 255, 0.2)';
  
  // Add animations safely via extension's CSS instead of inline JavaScript
  // This avoids Content Security Policy violations
  if (!document.getElementById('audio-to-text-animations')) {
    // Create a link to the stylesheet instead of inline styles
    const link = document.createElement('link');
    link.id = 'audio-to-text-animations';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('styles.css');
    
    // Append to document
    (document.head || document.documentElement).appendChild(link);
    
    // Set class names for animations instead of inline styles
    recordingIndicator.classList.add('pulse-animation');
  }
  
  micButton.appendChild(recordingIndicator);
  
  // Add more subtle TalkType branded hover effects
  micButton.addEventListener('mouseenter', () => {
    micButton.style.opacity = '1';
    micButton.style.transform = 'scale(1.1)';
    micButton.style.animation = 'subtle-glow 2s infinite';
    
    if (isDarkMode) {
      micButton.style.background = 'rgba(111, 66, 193, 0.25)';
      micButton.style.border = '1px solid rgba(111, 66, 193, 0.5)';
      // No glow effect for dark mode - it's too harsh
    } else {
      micButton.style.background = 'rgba(111, 66, 193, 0.2)';
      micButton.style.border = '1px solid rgba(111, 66, 193, 0.4)';
      // Subtle glow for light mode only
      micButton.style.boxShadow = '0 1px 4px rgba(111, 66, 193, 0.3)';
    }
  });
  
  micButton.addEventListener('mouseleave', () => {
    // Only change styling if not recording
    if (!isRecording || activeInput !== inputElement) {
      micButton.style.opacity = '1';
      micButton.style.transform = 'scale(1)';
      micButton.style.animation = 'none';
      
      if (isDarkMode) {
        micButton.style.background = 'rgba(111, 66, 193, 0.2)';
        micButton.style.border = '1px solid rgba(111, 66, 193, 0.4)';
      } else {
        micButton.style.background = 'rgba(111, 66, 193, 0.15)';
        micButton.style.border = '1px solid rgba(111, 66, 193, 0.3)';
      }
      
      micButton.style.boxShadow = '0 1px 3px rgba(111, 66, 193, 0.3)';
      // We keep the button visible at all times
    }
  });
  
  micButton.addEventListener('mousedown', () => {
    micButton.style.transform = 'scale(0.95)';
    micButton.style.boxShadow = '0 0 2px rgba(0,0,0,0.1)';
  });
  
  micButton.addEventListener('mouseup', () => {
    micButton.style.transform = 'scale(1.1)';
    micButton.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
  });
  
  // Add click event to microphone button - simplified but robust
  micButton.onclick = async function(event) {
    // Prevent any default behavior and event bubbling
    event.preventDefault();
    event.stopPropagation();
    
    console.log('TalkType: Mic button clicked!', inputElement, 'isRecording:', isRecording);
    
    // Visual feedback - always show something when clicked
    micButton.style.transform = 'scale(1.1)';
    
    try {
      // SIMPLIFIED LOGIC: Just toggle based on recording state
      if (isRecording) {
        // We're recording, so stop it and process
        console.log('TalkType: Stopping recording...');
        showStatusNotification('Processing recording...', 'info');
        
        // Update button appearance to processing state - more subtle
        micButton.style.animation = 'subtle-glow 2s infinite';
        
        if (micButton.dataset.darkMode === 'true') {
          micButton.style.background = 'rgba(52, 168, 83, 0.25)'; // Green processing color for dark mode
          micButton.style.border = '1px solid rgba(52, 168, 83, 0.4)';
        } else {
          micButton.style.background = 'rgba(52, 168, 83, 0.2)'; // Green processing color for light mode
          micButton.style.border = '1px solid rgba(52, 168, 83, 0.35)';
        }
        
        micButton.style.boxShadow = '0 1px 4px rgba(52, 168, 83, 0.3)';
        
        // Get the recording indicator
        const recordingIndicator = micButton.querySelector('.audio-to-text-recording-indicator');
        if (recordingIndicator) {
          recordingIndicator.style.display = 'none'; // Hide the recording indicator
        }
        
        // Stop recording and process the audio
        await stopRecording(); // Make sure we await this
      } 
      else {
        // Not recording, start a new recording
        console.log('TalkType: Starting new recording...');
        showStatusNotification('Recording... Click to stop', 'recording');
        
        // Set active input element as a global target
        activeInput = inputElement;
        
        // Update visual state - more subtle when recording
        micButton.style.animation = 'subtle-glow 1.5s infinite';
        
        if (isDarkMode) {
          micButton.style.background = 'rgba(255, 92, 138, 0.25)'; // Softer pink for dark mode
          micButton.style.border = '1px solid rgba(255, 92, 138, 0.4)';
        } else {
          micButton.style.background = 'rgba(255, 92, 138, 0.2)'; // Softer pink for light mode
          micButton.style.border = '1px solid rgba(255, 92, 138, 0.35)';
        }
        
        micButton.style.boxShadow = '0 1px 4px rgba(255, 92, 138, 0.3)';
        
        // Get the recording indicator and show it
        const recordingIndicator = micButton.querySelector('.audio-to-text-recording-indicator');
        if (recordingIndicator) {
          recordingIndicator.style.display = 'block'; // Show the recording indicator
          recordingIndicator.classList.add('pulse-animation');
        }
        
        // Start the recording process
        await startSimpleRecording();
      }
      
      // Simplified function for starting recording - more direct
      async function startSimpleRecording() {
        try {
          // First make sure we have the services initialized
          if (!audioService || !apiService) {
            console.log('TalkType: Services not initialized, initializing now...');
            showStatusNotification('Initializing TalkType...', 'processing');
            
            // Initialize directly with storage API key
            await new Promise((resolve) => {
              chrome.storage.sync.get(['apiKey'], function(result) {
                if (result && result.apiKey) {
                  apiKey = result.apiKey;
                  
                  // Create services directly
                  audioService = new window.AudioRecordingService();
                  apiService = new window.GeminiApiService(apiKey);
                  
                  console.log('TalkType: Services initialized directly');
                  resolve();
                } else {
                  console.error('TalkType: No API key found in storage');
                  showStatusNotification('Please set your API key in extension options', 'error');
                  resolve(); // Resolve anyway to continue
                }
              });
            });
            
            // Verify services were created
            if (!audioService || !apiService) {
              console.error('TalkType: Failed to initialize services!');
              showStatusNotification('Failed to initialize TalkType services. Please check options.', 'error');
              return;
            }
          }
          
          // Simple animation using class-based approach
          const micIcon = micButton.querySelector('img');
          if (micIcon) {
            micIcon.classList.add('wiggle-animation');
            setTimeout(() => {
              micIcon.classList.remove('wiggle-animation');
            }, 500);
          }
          
          // Now start the actual recording
          console.log('TalkType: Calling startRecording directly...');
          await startRecording(inputElement, recordingIndicator);
          
          console.log('TalkType: Recording started successfully');
        } catch (error) {
          console.error('TalkType: Error starting recording:', error);
          showStatusNotification('Error starting recording: ' + error.message, 'error');
          
          // Reset button appearance
          if (micButton.dataset.darkMode === 'true') {
            micButton.style.background = 'rgba(111, 66, 193, 0.2)';
            micButton.style.border = '1px solid rgba(111, 66, 193, 0.4)';
          } else {
            micButton.style.background = 'rgba(111, 66, 193, 0.15)';
            micButton.style.border = '1px solid rgba(111, 66, 193, 0.3)';
          }
          
          // Hide the recording indicator
          const recordingIndicator = micButton.querySelector('.audio-to-text-recording-indicator');
          if (recordingIndicator) {
            recordingIndicator.style.display = 'none';
          }
        }
      }
    } catch (error) {
      console.error('TalkType: Error handling click:', error);
      showStatusNotification('Error: ' + error.message, 'error');
      
      // Reset button appearance
      setTimeout(() => {
        micButton.style.transform = 'scale(1)';
        micButton.style.animation = 'none';
        
        if (micButton.dataset.darkMode === 'true') {
          micButton.style.background = 'rgba(111, 66, 193, 0.2)';
          micButton.style.border = '1px solid rgba(111, 66, 193, 0.4)';
        } else {
          micButton.style.background = 'rgba(111, 66, 193, 0.15)';
          micButton.style.border = '1px solid rgba(111, 66, 193, 0.3)';
        }
        
        micButton.style.boxShadow = '0 1px 3px rgba(111, 66, 193, 0.3)';
      }, 500);
    }
  };
  
  // Always show mic button, but update position on focus
  inputElement.addEventListener('focus', () => {
    positionMicButton(inputElement, micButton);
  });
  
  // No need to hide on blur anymore, we keep it visible
  
  // Position the button appropriately based on the input element
  positionMicButton(inputElement, micButton);
  
  // Listen for input resize (if ResizeObserver is available)
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      positionMicButton(inputElement, micButton);
    });
    resizeObserver.observe(inputElement);
  }
  
  // Listen for input position changes
  window.addEventListener('resize', () => {
    positionMicButton(inputElement, micButton);
  });
  
  // Update position when input changes visibility
  const observer = new MutationObserver(() => {
    positionMicButton(inputElement, micButton);
  });
  observer.observe(inputElement, { attributes: true, attributeFilter: ['style', 'class'] });
}

// Helper function to strictly validate if an element is a proper text input
function isValidTextInputElement(element) {
  if (!element) return false;
  
  // Get the computed style to check actual visibility
  const computedStyle = window.getComputedStyle(element);
  
  // Basic visibility checks
  if (computedStyle.display === 'none' || 
      computedStyle.visibility === 'hidden' || 
      parseFloat(computedStyle.opacity) < 0.1 ||
      element.offsetHeight === 0 || 
      element.offsetWidth === 0) {
    return false;
  }
  
  // Check element type and attributes
  const tagName = element.tagName.toLowerCase();
  
  // Check for <input> with valid text types
  if (tagName === 'input') {
    const inputType = (element.getAttribute('type') || 'text').toLowerCase();
    const validTypes = ['text', 'search', 'email', 'url', 'tel', 'number', 'password', 
                        'date', 'datetime-local', 'time', 'month', 'week'];
    
    // Only allow specific input types
    return validTypes.includes(inputType) && !element.disabled && !element.readOnly;
  }
  
  // Check for <textarea>
  if (tagName === 'textarea') {
    return !element.disabled && !element.readOnly;
  }
  
  // Check for contentEditable divs, spans, etc.
  if (element.isContentEditable) {
    // Make sure it's not a control panel, button, or link
    // By checking for interactive elements inside
    const hasButtons = element.querySelectorAll('button, a, [role="button"]').length > 0;
    const hasClicks = element.onclick !== null;
    
    // Check if it's intended to be a textbox by role or aria attributes
    const isTextbox = element.getAttribute('role') === 'textbox' || 
                      element.getAttribute('aria-multiline') === 'true';
                      
    // Check dimensions - text inputs are typically larger than icon buttons
    const isLargeEnough = element.offsetWidth > 50 && element.offsetHeight > 20;
    
    // Look for common text input classes and placeholders
    const hasTextClasses = element.className.toLowerCase().match(/input|text|edit|field|area|compose|comment/);
    const hasPlaceholder = element.getAttribute('placeholder') !== null;
    
    // Look for element descendants that suggest it's not a text input
    const hasInteractiveDescendants = element.querySelector('button, select, [role="button"], [role="menuitem"], [role="tab"]') !== null;
    
    // Check for explicit aria-label suggesting this is a text field
    const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
    const hasTextLabel = ariaLabel.match(/comment|text|write|input|compose|editor|post|message|reply|search/) !== null;
    
    // Combine all checks - must have positive indicators and no disqualifying attributes
    return (isTextbox || hasTextClasses || hasTextLabel || hasPlaceholder || isLargeEnough) && 
           !hasButtons && !hasClicks && !hasInteractiveDescendants;
  }
  
  // Special case for specific rich text editors - expanded list
  if (element.classList.contains('ql-editor') || 
      element.classList.contains('ProseMirror') ||
      element.classList.contains('public-DraftEditor-content') ||
      element.classList.contains('richTextArea') ||
      element.classList.contains('CodeMirror-code') ||
      element.classList.contains('notranslate') ||
      (element.getAttribute('data-lexical-editor') === 'true') ||
      (element.contentEditable === 'true' && element.getAttribute('data-slate-editor') === 'true') ||
      (element.getAttribute('data-testid')?.includes('rich-text'))) {
    return true;
  }
  
  // Special case for iframes that are editors
  if (tagName === 'iframe' && 
      (element.id.includes('editor') || element.name.includes('editor'))) {
    return true;
  }
  
  // Special case for common editor containers - expanded for better detection
  if (element.getAttribute('role') === 'textbox' || 
      element.getAttribute('data-testid')?.includes('input') || 
      element.getAttribute('data-testid')?.includes('editor') ||
      element.getAttribute('data-testid')?.includes('composer') ||
      element.getAttribute('aria-label')?.includes('ompose') || // Catches "Compose", "compose", etc.
      element.getAttribute('g_editable') === 'true' ||
      (element.isContentEditable && element.getAttribute('aria-multiline') === 'true')) {
    return true;
  }
  
  // If we get here, it's not a valid text input
  return false;
}

// Function to position microphone button correctly relative to input
function positionMicButton(inputElement, micButton) {
  // Reduce logging to avoid console spam
  // console.log('TalkType: Positioning mic button for input:', inputElement);
  const inputRect = inputElement.getBoundingClientRect();
  // console.log('TalkType: Input element rect:', inputRect);
  
  // Determine the type of input element
  const elementType = inputElement.tagName.toLowerCase();
  const isTextArea = elementType === 'textarea';
  const isContentEditable = inputElement.isContentEditable;
  const isLargeElement = isTextArea || isContentEditable || 
                        (inputRect.height > 40) || 
                        (elementType !== 'input' && elementType !== 'textarea');
  
  // IMPROVED POSITIONING: Create a wrapper element that will be positioned absolutely
  // relative to the input. This provides better alignment in all scenarios.
  
  // Check if we already have a wrapper for this button
  let wrapper = micButton.parentElement;
  if (!wrapper || !wrapper.classList.contains('talktype-button-wrapper')) {
    // Create a wrapper for absolute positioning
    wrapper = document.createElement('div');
    wrapper.className = 'talktype-button-wrapper';
    wrapper.style.position = 'absolute';
    wrapper.style.zIndex = '99999';
    wrapper.style.pointerEvents = 'none'; // Let clicks go through to the button
    
    // Move button into the wrapper
    if (micButton.parentElement) {
      micButton.parentElement.removeChild(micButton);
    }
    wrapper.appendChild(micButton);
    
    // Make sure the button itself can receive clicks
    micButton.style.pointerEvents = 'auto';
    
    // Add wrapper directly to the document body for best positioning
    document.body.appendChild(wrapper);
  }
  
  // If input is not visible, hidden, disabled, or has zero dimensions, hide the wrapper
  const computedStyle = window.getComputedStyle(inputElement);
  if (inputRect.width === 0 || inputRect.height === 0 || 
      inputElement.offsetParent === null || 
      computedStyle.display === 'none' || 
      computedStyle.visibility === 'hidden' ||
      (inputElement.disabled === true) ||
      (inputElement.readOnly === true) ||
      // Check for opacity - if opacity is 0 or near 0, consider it hidden
      (parseFloat(computedStyle.opacity) < 0.1)) {
    wrapper.style.display = 'none';
    return;
  }
  
  // Check if the element is part of the page and not in an iframe or overlay
  let isInPage = true;
  let parent = inputElement.parentElement;
  
  while (parent !== null) {
    const parentStyle = window.getComputedStyle(parent);
    // Check if parent is invisible or detached from the main document
    if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || 
        parseFloat(parentStyle.opacity) < 0.1) {
      isInPage = false;
      break;
    }
    parent = parent.parentElement;
  }
  
  if (!isInPage) {
    wrapper.style.display = 'none';
    return;
  }
  
  // Show the wrapper
  wrapper.style.display = 'block';
  
  // Position calculation based on element type and viewport position
  // Use absolute positioning relative to viewport, then adjust for scroll
  
  // Calculate position to ensure mic is properly placed
  const padding = 8; // Minimum padding from edge
  
  // Get position relative to viewport
  let top, right;
  
  if (isLargeElement) {
    // For large elements (textareas, contenteditable)
    // Place in top-right corner
    top = inputRect.top + padding;
    right = window.innerWidth - (inputRect.right - padding);
  } else {
    // For regular inputs, position at vertically centered on right side
    top = inputRect.top + (inputRect.height - 28) / 2; // Center vertically (button is 28px)
    right = window.innerWidth - (inputRect.right - padding);
    
    // For small inputs, ensure the button doesn't overflow
    if (inputRect.height < 28) {
      // Adjust to be centered on the input's height
      top = inputRect.top + (inputRect.height - 28) / 2;
    }
    
    // For messaging apps with chat boxes (often at bottom of screen)
    // Check if this is likely a chat input (bottom of viewport, wider than tall)
    if (inputRect.bottom > window.innerHeight - 100 && 
        inputRect.width > inputRect.height * 3) {
      // This is likely a chat input at the bottom of the screen
      // Position the button higher up to avoid being cut off
      top = inputRect.top - 2; // Position at the top of the input
    }
  }
  
  // Apply the calculated position to the wrapper
  wrapper.style.top = `${top}px`;
  wrapper.style.right = `${right}px`;
  wrapper.style.left = 'auto'; // Clear any previous left value
  
  // Only adjust padding for standard input elements
  if (elementType === 'input' || elementType === 'textarea') {
    // If input has a right padding of less than 30px, add padding to make room for the button
    const rightPadding = parseInt(computedStyle.paddingRight, 10) || 0;
    
    if (rightPadding < 25 && !inputElement.dataset.originalPadding) {
      // Store original padding
      inputElement.dataset.originalPadding = rightPadding;
      inputElement.style.paddingRight = '35px'; // Increased padding for better visibility
    }
  }
}

// Function to start recording
async function startRecording(targetInput, indicator) {
  console.log('TalkType: Starting recording with services:', !!audioService, !!apiService);
  
  // If services aren't initialized, show a helpful error and try to initialize again
  if (!audioService || !apiService) {
    console.error('TalkType: Services not initialized!');
    
    // Show error notification
    showStatusNotification('TalkType services not initialized. Reconnecting...', 'error');
    
    // Try to initialize directly with the simplified approach
    try {
      console.log('TalkType: Attempting to create services directly');
      
      // Create services directly if classes are available globally
      if (typeof window.AudioRecordingService !== 'undefined') {
        audioService = new window.AudioRecordingService();
        console.log('TalkType: AudioRecordingService created directly');
      }
      
      if (typeof window.GeminiApiService !== 'undefined') {
        // Get API key from storage synchronously to avoid async issues
        chrome.storage.sync.get(['apiKey'], function(result) {
          apiKey = result.apiKey || '';
          
          console.log('TalkType: Creating API service with key:', apiKey ? 'Valid key' : 'Empty key');
          apiService = new window.GeminiApiService(apiKey);
          
          console.log('TalkType: Services restored, retrying recording');
          showStatusNotification('Services reconnected! Trying again...', 'info');
          
          // Now try recording again after a short delay
          setTimeout(() => {
            if (audioService && apiService && targetInput && indicator) {
              console.log('TalkType: Retrying recording with reconnected services');
              startRecordingCore(targetInput, indicator);
            }
          }, 500);
        });
        return;
      }
    } catch (directInitError) {
      console.error('TalkType: Failed to create services directly:', directInitError);
    }
    
    // As a last resort, try a full reinitialization
    console.log('TalkType: Falling back to full reinitialization');
    injectServiceScripts();
    
    // Show error message
    showStatusNotification('Could not initialize TalkType. Please refresh the page or check your API key in options.', 'error');
    return;
  }
  
  // Continue with the core recording logic
  await startRecordingCore(targetInput, indicator);
}

// Core recording logic separated for reuse
async function startRecordingCore(targetInput, indicator) {
  // Check if already recording
  if (isRecording) {
    console.log('TalkType: Already recording, ignoring start request');
    return;
  }
  
  try {
    // Comprehensive browser API debugging
    console.log('TalkType: Checking browser API support...');
    
    if (!navigator.mediaDevices) {
      console.error('TalkType: navigator.mediaDevices not available!');
      showStatusNotification('Your browser does not support media recording', 'error');
      return;
    }
    
    console.log('TalkType: mediaDevices API available:', !!navigator.mediaDevices);
    console.log('TalkType: getUserMedia available:', !!navigator.mediaDevices.getUserMedia);
    console.log('TalkType: MediaRecorder available:', typeof MediaRecorder !== 'undefined');
    
    // Check if recording is supported by audioService
    if (!audioService.isRecordingSupported()) {
      console.error('TalkType: Recording not supported according to audioService');
      showStatusNotification('Your browser does not support audio recording', 'error');
      return;
    }
    
    // Check permissions directly
    console.log('TalkType: Checking permissions...');
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        console.log('TalkType: Microphone permission status:', permissionStatus.state);
        
        if (permissionStatus.state === 'denied') {
          showStatusNotification('Microphone permission denied. Please enable in your browser settings.', 'error');
          return;
        }
      } catch (permError) {
        console.log('TalkType: Permission check error (this is normal in some browsers):', permError);
      }
    }
    
    // Update state
    isRecording = true;
    activeInput = targetInput;
    console.log('TalkType: Set isRecording=true, activeInput=', targetInput);
    
    // Show recording indicator with animations using classes
    if (indicator) {
      console.log('TalkType: Showing recording indicator');
      indicator.style.display = 'block';
      
      // Add pulse animation class
      indicator.classList.add('pulse-animation');
      
      // Find the mic button (parent of the indicator)
      const micButton = indicator.parentElement;
      if (micButton) {
        // Add wiggle animation to the mic icon using class
        const micIcon = micButton.querySelector('img');
        if (micIcon) {
          // Remove old classes first
          micIcon.classList.remove('wiggle-animation', 'wiggle-reverse-animation');
          // Add animation class
          micIcon.classList.add('wiggle-animation');
          // Remove class after animation completes
          setTimeout(() => {
            micIcon.classList.remove('wiggle-animation');
          }, 500);
        }
        
        // Add more prominent TalkType branded recording state
        micButton.style.opacity = '1';
        micButton.style.background = 'rgba(255, 64, 129, 0.2)';
        micButton.style.border = '1px solid rgba(255, 64, 129, 0.4)';
        micButton.style.boxShadow = '0 2px 8px rgba(255, 64, 129, 0.35)';
        micButton.style.filter = 'drop-shadow(0 0 4px rgba(255, 64, 129, 0.4))';
      }
    }
    
    // Show enhanced listening notification - shorter text
    showStatusNotification('Recording... Click to stop', 'recording');
    
    // Start recording with thorough error handling
    console.log('TalkType: Calling audioService.startRecording()...');
    try {
      await audioService.startRecording();
      console.log('TalkType: Recording started successfully for', targetInput);
    } catch (recError) {
      // This detailed error is handled below in the main catch block
      throw recError;
    }
    
    console.log('TalkType: Recording active for', targetInput);
  } catch (error) {
    console.error('TalkType: Failed to start recording:', error);
    
    // Handle different error types with user-friendly notifications instead of alerts
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      console.log('TalkType: Permission error detected:', error.name);
      
      // Create a detailed but friendly notification
      showStatusNotification('Microphone permission needed. Click the lock icon in your address bar and allow microphone access.', 'error');
      
      // Try to check system permissions too
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'microphone' })
          .then(permStatus => {
            console.log('TalkType: System permission status:', permStatus.state);
          })
          .catch(permErr => {
            console.log('TalkType: System permission check failed:', permErr);
          });
      }
      
      // On Mac, show a special notification
      if (navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
        console.log('TalkType: Mac detected, showing special message');
        setTimeout(() => {
          showStatusNotification('Mac users: Also check System Preferences → Security & Privacy → Microphone', 'info');
        }, 3000);
      }
    } else if (error.name === 'NotFoundError') {
      showStatusNotification('No microphone found. Please connect a microphone and try again.', 'error');
    } else if (error.name === 'TypeError' && error.message.includes('MediaRecorder')) {
      showStatusNotification('Your browser doesn\'t support audio recording. Try using Chrome or Edge.', 'error');
    } else {
      // Generic error with more details
      console.log('TalkType: General recording error:', error);
      showStatusNotification(`Recording error: ${error.message}`, 'error');
    }
    
    // Reset state
    isRecording = false;
    activeInput = null;
    console.log('TalkType: Reset recording state after error');
    
    // Hide recording indicator and update button state
    if (indicator) {
      indicator.style.display = 'none';
      
      // Reset button appearance
      const micButton = indicator.parentElement;
      if (micButton) {
        micButton.style.animation = '';
        micButton.style.opacity = '1';
        micButton.style.background = 'rgba(111, 66, 193, 0.15)';
        micButton.style.border = '1px solid rgba(111, 66, 193, 0.3)';
        micButton.style.boxShadow = '0 2px 6px rgba(111, 66, 193, 0.4)';
        micButton.style.filter = 'none';
      }
    }
    
    // Remove any recording notifications
    document.querySelectorAll('.audio-to-text-notification-recording').forEach(notification => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    });
  }
}

// Function to stop recording and process audio
async function stopRecording() {
  console.log('TalkType: stopRecording called, isRecording:', isRecording, 'activeInput:', !!activeInput);
  
  if (!audioService) {
    console.error('TalkType: Cannot stop recording - audioService is not initialized');
    showStatusNotification('Error: Audio service not initialized', 'error');
    return;
  }
  
  if (!isRecording) {
    console.error('TalkType: Cannot stop recording - not currently recording');
    showStatusNotification('Error: Not currently recording', 'error');
    return;
  }
  
  if (!activeInput) {
    console.error('TalkType: Cannot stop recording - no active input');
    showStatusNotification('Error: No active input element', 'error');
    return;
  }
  
  try {
    console.log('TalkType: Stopping recording on audioService...');
    
    // Remove ALL existing notifications first to avoid duplicates
    document.querySelectorAll('.audio-to-text-notification').forEach(notification => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    });
    
    // Now show a single processing notification
    showStatusNotification('Processing audio...', 'processing');
    
    // Stop recording and get audio blob
    const audioBlob = await audioService.stopRecording();
    console.log('TalkType: Recording stopped successfully, got audio blob:', !!audioBlob);
    
    // Update recording state immediately
    isRecording = false;
    
    // Get info about the current input element for debugging
    console.log('TalkType: Current activeInput:', activeInput);
    console.log('TalkType: activeInput type:', activeInput.tagName);
    if (activeInput.id) console.log('TalkType: activeInput id:', activeInput.id);
    
    // Store currentInput locally for processing
    const currentInput = activeInput;
    
    // Hide all recording indicators and update button styling
    document.querySelectorAll('.audio-to-text-recording-indicator').forEach(indicator => {
      indicator.style.display = 'none';
      
      // Update the parent button styling to show processing state
      const micButton = indicator.parentElement;
      if (micButton) {
        if (micButton.dataset.darkMode === 'true') {
          micButton.style.background = 'rgba(52, 168, 83, 0.25)'; // Green processing color for dark mode
          micButton.style.border = '1px solid rgba(52, 168, 83, 0.4)';
        } else {
          micButton.style.background = 'rgba(52, 168, 83, 0.2)'; // Green processing color for light mode
          micButton.style.border = '1px solid rgba(52, 168, 83, 0.35)';
        }
        
        micButton.style.boxShadow = '0 1px 4px rgba(52, 168, 83, 0.3)';
        
        // Add a subtle pulse animation during processing
        micButton.style.animation = 'subtle-glow 1.5s infinite';
        
        // We're using the subtle-glow animation now which is already defined
      }
    });
    
    // Process the audio data directly instead of creating another function
    console.log('TalkType: Processing audio data directly...');
    
    try {
      // Ensure we have fresh API key
      const apiKeyResult = await new Promise((resolve) => {
        chrome.storage.sync.get(['apiKey'], result => resolve(result));
      });
      
      if (!apiKeyResult || !apiKeyResult.apiKey) {
        throw new Error('No API key found. Please set your API key in the extension options.');
      }
      
      // Create a fresh API service
      const transcriptionService = new window.GeminiApiService(apiKeyResult.apiKey);
      
      // Make sure the service is valid
      if (!transcriptionService) {
        throw new Error('Could not create transcription service');
      }
      
      // Show transcribing notification with progress bar
      const progressNotification = createProgressNotification('Transcribing audio...');
      
      // Process the audio and get the transcription
      // Add callback to update progress bar during transcription
      const transcription = await transcriptionService.transcribeAudio(audioBlob, (status, percentage) => {
        if (progressNotification) {
          updateProgressNotification(progressNotification, percentage);
        }
      });
      console.log('TalkType: Transcription received:', transcription);
      
      // Complete progress animation and show success notification
      if (progressNotification) {
        updateProgressNotification(progressNotification, 100);
        setTimeout(() => {
          if (document.body.contains(progressNotification)) {
            document.body.removeChild(progressNotification);
            showStatusNotification('Transcription complete!', 'success');
          }
        }, 500);
      } else {
        showStatusNotification('Transcription complete!', 'success');
      }
      
      // Insert the transcription directly into the input element
      if (currentInput) {
        if (currentInput.isContentEditable) {
          // For contentEditable elements
          currentInput.textContent = transcription;
          currentInput.dispatchEvent(new Event('input', { bubbles: true }));
          console.log('TalkType: Inserted text into contenteditable element');
        } 
        else if (currentInput.tagName === 'INPUT' || currentInput.tagName === 'TEXTAREA') {
          // For standard input/textarea elements
          currentInput.value = transcription;
          currentInput.dispatchEvent(new Event('input', { bubbles: true }));
          currentInput.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('TalkType: Inserted text into input/textarea element');
          
          // Focus the input and place cursor at the end
          currentInput.focus();
          
          // Set selection range if supported
          if (typeof currentInput.setSelectionRange === 'function') {
            currentInput.setSelectionRange(transcription.length, transcription.length);
          }
        } 
        else {
          // Fallback for other elements - try innerText
          try {
            currentInput.innerText = transcription;
            currentInput.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('TalkType: Inserted text using innerText fallback');
          } catch (e) {
            console.error('TalkType: Unable to set text on element:', e);
          }
        }
      } else {
        console.error('TalkType: No input element to insert transcription into');
      }
    } catch (transcriptionError) {
      console.error('TalkType: Transcription failed:', transcriptionError);
      
      // Hide progress notification if it exists
      if (progressNotification && document.body.contains(progressNotification)) {
        document.body.removeChild(progressNotification);
      }
      
      showStatusNotification(`Transcription failed: ${transcriptionError.message}`, 'error');
    }
    
    // Reset button appearance after processing
    document.querySelectorAll('.audio-to-text-mic-button').forEach(button => {
      button.style.animation = 'none';
      button.style.transform = 'scale(1)';
      button.style.opacity = '1';
      
      if (button.dataset.darkMode === 'true') {
        button.style.background = 'rgba(111, 66, 193, 0.2)';
        button.style.border = '1px solid rgba(111, 66, 193, 0.4)';
      } else {
        button.style.background = 'rgba(111, 66, 193, 0.15)';
        button.style.border = '1px solid rgba(111, 66, 193, 0.3)';
      }
      
      button.style.boxShadow = '0 1px 3px rgba(111, 66, 193, 0.3)';
      button.style.filter = 'none';
    });
    
  } catch (error) {
    console.error('TalkType: Failed to stop recording:', error);
    showStatusNotification('Error: Failed to stop recording - ' + error.message, 'error');
    
    // Reset state
    isRecording = false;
    activeInput = null;
    
    // Hide all recording indicators and reset buttons
    document.querySelectorAll('.audio-to-text-recording-indicator').forEach(indicator => {
      indicator.style.display = 'none';
      
      // Also reset the parent button
      const micButton = indicator.parentElement;
      if (micButton) {
        micButton.style.animation = 'none';
        micButton.style.transform = 'scale(1)';
        micButton.style.opacity = '1';
        
        if (micButton.dataset.darkMode === 'true') {
          micButton.style.background = 'rgba(111, 66, 193, 0.2)';
          micButton.style.border = '1px solid rgba(111, 66, 193, 0.4)';
        } else {
          micButton.style.background = 'rgba(111, 66, 193, 0.15)';
          micButton.style.border = '1px solid rgba(111, 66, 193, 0.3)';
        }
        
        micButton.style.boxShadow = '0 1px 3px rgba(111, 66, 193, 0.3)';
        micButton.style.filter = 'none';
      }
    });
    
    // Also remove any recording notifications on error
    document.querySelectorAll('.audio-to-text-notification-recording').forEach(notification => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    });
  }
}

// Function to process audio data and get transcription
async function processAudioData(audioBlob) {
  if (!activeInput) {
    console.error('TalkType: No active input element found');
    showStatusNotification('Error: No active input element', 'error');
    return;
  }
  
  try {
    // Show processing indicator
    activeInput.classList.add('audio-to-text-processing');
    
    // Create a vaporwave processing notification with glass morphism
    const processingNotification = showStatusNotification('Transcribing...', 'processing');
    
    // Ensure we have a fresh API service with the latest key
    // Get fresh API key from background script
    console.log('TalkType: Getting fresh API key for transcription');
    
    let apiKeyResponse;
    try {
      apiKeyResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({action: 'getApiKey'}, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Failed to get API key: ${chrome.runtime.lastError.message}`));
            return;
          }
          resolve(response);
        });
      });
    } catch (keyError) {
      console.error('TalkType: Failed to get API key for transcription:', keyError);
      throw new Error('Failed to get API key. Please refresh the page and try again.');
    }
    
    if (!apiKeyResponse || !apiKeyResponse.apiKey) {
      console.error('TalkType: No API key found in background response');
      throw new Error('API key not found. Please set your API key in extension options.');
    }
    
    // Create a fresh API service with the latest key
    console.log('TalkType: Creating fresh API service for transcription');
    const freshApiService = new GeminiApiService(apiKeyResponse.apiKey);
    
    // Verify API key is valid
    console.log('TalkType: Verifying API key for transcription');
    const isValid = await freshApiService.verifyApiKey();
    if (!isValid) {
      console.error('TalkType: API key validation failed during transcription');
      throw new Error('Invalid API key. Please check settings.');
    }
    
    // Send audio to API for transcription
    console.log('TalkType: Starting transcription with verified API key');
    const transcription = await freshApiService.transcribeAudio(audioBlob);
    
    // Insert transcribed text based on element type
    if (activeInput.isContentEditable) {
      // For contentEditable elements
      activeInput.textContent = transcription;
      
      // Trigger input event for reactive frameworks
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (activeInput.tagName === 'INPUT' || activeInput.tagName === 'TEXTAREA') {
      // For standard input/textarea elements
      activeInput.value = transcription;
      
      // Trigger input events to make sure any listeners are notified
      // This ensures that frameworks like React, Angular, etc. detect the change
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      activeInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // If it's a textarea, resize appropriately
      if (activeInput.tagName.toLowerCase() === 'textarea' && activeInput.scrollHeight > activeInput.clientHeight) {
        const originalHeight = activeInput.style.height;
        activeInput.style.height = 'auto';
        activeInput.style.height = (activeInput.scrollHeight) + 'px';
        
        // Reset after 1s to allow for any auto-resize scripts
        setTimeout(() => {
          if (originalHeight) {
            activeInput.style.height = originalHeight;
          }
        }, 1000);
      }
      
      // Focus the input and place cursor at the end
      activeInput.focus();
      
      // Set selection range if supported by this element
      if (typeof activeInput.setSelectionRange === 'function') {
        activeInput.setSelectionRange(transcription.length, transcription.length);
      }
    } else {
      // Fallback for other elements - try innerText
      try {
        activeInput.innerText = transcription;
        activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (e) {
        console.error('TalkType: Unable to set text on element:', e);
      }
    }
    
    // Show simple success notification
    showStatusNotification('Transcription complete', 'success');
    
    console.log('TalkType: Transcription complete:', transcription);
  } catch (error) {
    console.error('TalkType: Transcription failed:', error);
    
    // Show error notification instead of alert
    showStatusNotification(`❌ Transcription failed: ${error.message}`, 'error');
  } finally {
    // Remove processing indicator
    if (activeInput) {
      activeInput.classList.remove('audio-to-text-processing');
    }
    
    // Reset active input
    activeInput = null;
  }
}

// Function to show status notifications with enhanced visual appeal
function showStatusNotification(message, type = 'info') {
  console.log('TalkType: Showing notification -', message, type);
  
  // Don't show notifications if they were recently disabled
  if (window.audioToTextNotificationsDisabled) {
    return;
  }
  
  // Remove ALL existing notifications to avoid duplicates
  const existingNotifications = document.querySelectorAll(`.audio-to-text-notification`);
  existingNotifications.forEach(notification => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  });
  
  // Create notification element with enhanced glass morphism style
  const notification = document.createElement('div');
  notification.className = `audio-to-text-notification audio-to-text-notification-${type}`;
  notification.style.position = 'fixed';
  notification.style.top = '20px';  // Changed from bottom to top
  notification.style.right = '20px';
  notification.style.padding = '16px 20px';
  notification.style.borderRadius = '16px';
  notification.style.boxShadow = '0 10px 40px rgba(31, 38, 135, 0.3)';
  notification.style.zIndex = '99999'; // Very high z-index to ensure visibility
  notification.style.fontSize = '16px';
  notification.style.fontWeight = '600';
  notification.style.maxWidth = '350px';
  notification.style.opacity = '0';
  notification.style.transform = 'translateY(-30px) scale(0.95)';
  notification.style.transition = 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)';
  notification.style.backdropFilter = 'blur(16px)';
  notification.style.webkitBackdropFilter = 'blur(16px)';
  notification.style.border = '2px solid rgba(255, 255, 255, 0.25)';
  notification.style.pointerEvents = 'all';
  
  // Create notification styles with animations if they don't exist yet
  if (!document.getElementById('talktype-notification-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'talktype-notification-styles';
    styleEl.textContent = `
      @keyframes talktype-gentle-pulse {
        0% { box-shadow: 0 8px 25px rgba(255, 255, 255, 0.3); border-color: rgba(255, 255, 255, 0.3); }
        50% { box-shadow: 0 12px 40px rgba(255, 255, 255, 0.5); border-color: rgba(255, 255, 255, 0.5); }
        100% { box-shadow: 0 8px 25px rgba(255, 255, 255, 0.3); border-color: rgba(255, 255, 255, 0.3); }
      }
      
      @keyframes talktype-gradientBg {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      
      @keyframes talktype-float {
        0% { transform: translateY(0px); }
        50% { transform: translateY(-5px); }
        100% { transform: translateY(0px); }
      }
      
      @keyframes talktype-sparkle {
        0%, 100% { opacity: 0; }
        50% { opacity: 1; }
      }
      
      .talktype-gradient-notification {
        background: linear-gradient(90deg, #4568DC, #7474BF, #348AC7, #56CCF2);
        background-size: 300% 100%;
        animation: talktype-gradientBg 3s ease infinite;
      }
      
      .talktype-recording-notification {
        background: linear-gradient(135deg, rgba(111, 66, 193, 0.85), rgba(70, 174, 247, 0.8));
        animation: talktype-gentle-pulse 2s infinite;
      }
      
      .talktype-success-notification {
        background: linear-gradient(135deg, rgba(76, 175, 80, 0.85), rgba(105, 220, 155, 0.8));
      }
      
      .talktype-error-notification {
        background: linear-gradient(135deg, rgba(244, 67, 54, 0.85), rgba(255, 87, 34, 0.8));
      }
      
      .talktype-notification-icon {
        display: inline-block;
        margin-right: 10px;
        vertical-align: middle;
        animation: talktype-float 2s ease-in-out infinite;
      }
      
      .talktype-sparkle {
        position: absolute;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background-color: white;
        opacity: 0;
      }
    `;
    document.head.appendChild(styleEl);
  }
  
  // Create notification content with icon and message
  let notificationIcon = '';
  
  // Set styles based on notification type with enhanced aesthetics
  if (type === 'error') {
    notification.classList.add('talktype-error-notification');
    notificationIcon = '❌';
  } else if (type === 'success') {
    notification.classList.add('talktype-success-notification');
    notificationIcon = '✓';
  } else if (type === 'recording') {
    notification.classList.add('talktype-recording-notification');
    notificationIcon = '🎤';
    
    // Add sparkle effects for recording
    for (let i = 0; i < 3; i++) {
      const sparkle = document.createElement('span');
      sparkle.className = 'talktype-sparkle';
      sparkle.style.top = `${Math.random() * 100}%`;
      sparkle.style.left = `${Math.random() * 100}%`;
      sparkle.style.animation = `talktype-sparkle ${1 + Math.random()}s ease-in-out infinite ${Math.random()}s`;
      notification.appendChild(sparkle);
    }
  } else if (type === 'processing') {
    notification.classList.add('talktype-gradient-notification');
    notificationIcon = '⚙️';
  } else {
    notification.style.background = 'linear-gradient(135deg, rgba(33, 150, 243, 0.85), rgba(3, 169, 244, 0.8))';
    notificationIcon = 'ℹ️';
  }
  
  // Create icon element
  const iconElement = document.createElement('span');
  iconElement.className = 'talktype-notification-icon';
  iconElement.textContent = notificationIcon;
  
  // Create message text element
  const messageElement = document.createElement('span');
  messageElement.textContent = message;
  messageElement.style.verticalAlign = 'middle';
  
  // Add icon and message to notification
  notification.appendChild(iconElement);
  notification.appendChild(messageElement);
  
  // Apply common styles
  notification.style.color = 'white';
  notification.style.display = 'flex';
  notification.style.alignItems = 'center';
  
  // Add close button with improved styling
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.style.background = 'transparent';
  closeButton.style.border = 'none';
  closeButton.style.color = 'white';
  closeButton.style.marginLeft = '15px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '22px';
  closeButton.style.lineHeight = '18px';
  closeButton.style.opacity = '0.8';
  closeButton.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
  closeButton.style.padding = '0 5px';
  closeButton.style.borderRadius = '50%';
  
  // Add hover effects to close button
  closeButton.onmouseenter = () => {
    closeButton.style.opacity = '1';
    closeButton.style.transform = 'scale(1.1)';
  };
  
  closeButton.onmouseleave = () => {
    closeButton.style.opacity = '0.8';
    closeButton.style.transform = 'scale(1)';
  };
  
  closeButton.onclick = () => {
    if (document.body.contains(notification)) {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(30px) scale(0.9)';
      
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 500);
    }
  };
  
  notification.appendChild(closeButton);
  
  // Add to DOM
  document.body.appendChild(notification);
  
  // Trigger enhanced entrance animation (adjusted for top position)
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0) scale(1)';
  }, 10);
  
  // Auto-remove after timeout (except for recording notifications)
  if (type !== 'recording') {
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px) scale(0.95)';
        
        // Remove from DOM after transition
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 500);
      }
    }, 6000);
  }
  
  return notification;
}