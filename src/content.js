// Main content script for the Audio to Text extension

// Import services from other scripts
// Note: These scripts need to be included in the manifest.json before this script

let audioService = null;
let apiService = null;
let isRecording = false;
let isStartingRecording = false; // Synchronous lock — set before any await in the start flow
let maxRecordingTimer = null;
let activeInput = null;
let smartModeEnabled = true; // Default to enabled
let liveSession = null; // Active TalkTypeLiveSession when the live engine is recording
const MAX_RECORDING_MS = 5 * 60 * 1000; // Auto-stop long recordings before the inline Gemini payload gets too big
const TALKTYPE_DEBUG = false;
const debugLog = (...args) => {
  if (TALKTYPE_DEBUG) console.log(...args);
};

function getActiveInput() {
  if (!activeInput || activeInput.isConnected === false) {
    activeInput = null;
    return null;
  }

  return activeInput;
}

// Initialize - document_idle guarantees DOM is ready
debugLog('TalkType content script loading...');
initializeExtensionCore();


// Core initialization logic, separated for clarity
function initializeExtensionCore() {
  // Verify that required objects are available in the page context
  if (typeof window.AudioRecordingService === 'undefined') {
    console.error('TalkType: AudioRecordingService is not defined! Check that audio-service.js is loaded.');
    debugLog('TalkType: Available global objects:', Object.keys(window).filter(k => k.includes('Service')));
    showStatusNotification('TalkType initialization error: Required scripts missing', 'error');
    return;
  }

  if (typeof window.GeminiApiService === 'undefined') {
    console.error('TalkType: GeminiApiService is not defined! Check that api-service.js is loaded.');
    showStatusNotification('TalkType initialization error: Required scripts missing', 'error');
    return;
  }

  // Check that chrome API is available
  if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    console.error('TalkType: chrome.runtime.sendMessage not available!');
    showStatusNotification('TalkType initialization error: Chrome API unavailable', 'error');
    return;
  }

  // Preferences come from sync storage; the API key stays in the background
  // worker and never enters this content-script world.
  chrome.storage.sync.get(['smartModeEnabled', 'transcriptionStyle']).then(function(result) {
    // Get smart mode setting if available
    if (result.smartModeEnabled !== undefined) {
      smartModeEnabled = result.smartModeEnabled;
      debugLog('TalkType: Smart Mode setting loaded:', smartModeEnabled);
    }

    // Initialize services
    try {
      debugLog('TalkType: Creating AudioRecordingService instance');
      audioService = new window.AudioRecordingService();

      debugLog('TalkType: Creating GeminiApiService client');
      apiService = new window.GeminiApiService();
      if (result.transcriptionStyle) {
        apiService.setStyle(result.transcriptionStyle);
        debugLog('TalkType: Transcription style set to:', result.transcriptionStyle);
      }

      // Check if services initialized correctly
      if (!audioService || !apiService) {
        console.error('TalkType: Service initialization failed!');
        showStatusNotification('Error initializing TalkType services', 'error');
        return;
      }

      // Initialize input detection - do this regardless of API key status
      debugLog('TalkType: Initializing input detection');
      initializeInputDetection();

      // Initialize focus tracking for smart mode
      debugLog('TalkType: Initializing focus tracking for smart mode');
      initializeFocusTracking();

      // Add observer to detect dynamically added inputs
      debugLog('TalkType: Setting up DOM mutation observer');
      observeDynamicInputs();

      // Keep buttons positioned on scroll/resize and sweep orphans
      initializeButtonTracking();

      debugLog('TalkType: Extension initialized successfully');

      // Check for browser mic support as an early diagnostic
      if (audioService.isRecordingSupported()) {
        debugLog('TalkType: Browser supports recording');
      } else {
        console.warn('TalkType: Browser may not support recording!');
        showStatusNotification('Your browser may not support recording. Chrome is recommended.', 'info');
      }

      // If no API key is configured, show a setup prompt (the background
      // worker checks — we only learn a boolean here, never the key)
      chrome.runtime.sendMessage({ action: 'getSetupState' }).then((setup) => {
        if (setup && !setup.hasApiKey) {
          console.warn('TalkType: No API key configured.');
          showStatusNotification('Please set your API key in the extension options.', 'warning');
        }
      }).catch(() => {});
    } catch (initError) {
      console.error('TalkType: Error during service initialization:', initError);
      showStatusNotification('Error initializing speech services: ' + initError.message, 'error');
    }
  }).catch((error) => {
    console.error('TalkType: Error accessing storage:', error);
    showStatusNotification('Error accessing extension storage. Try reloading the page.', 'error');
  });
}



// Function to initialize focus tracking for smart mode
function initializeFocusTracking() {
  debugLog('TalkType: Initializing focus tracking for contextual transcription');

  // Track focus events on the entire document
  document.addEventListener('focusin', (event) => {
    // Check if the focused element is a text input
    if (isValidTextInputElement(event.target)) {
      debugLog('TalkType: Text input focused');
      activeInput = event.target;

      // For debugging
      debugLog('TalkType: Active input set with properties:', {
        tagName: activeInput.tagName,
        id: activeInput.id || '(no id)',
        class: activeInput.className || '(no class)'
      });

      // Notify popup about active input change if smart mode is enabled
      if (smartModeEnabled) {
        chrome.runtime.sendMessage({
          action: 'activeInputChanged',
          hasActiveInput: true,
          inputInfo: {
            type: activeInput.tagName,
            id: activeInput.id || '(no id)',
            className: activeInput.className || '(no class)'
          }
        });
      }
    }
  });

  // Track when inputs lose focus
  document.addEventListener('focusout', (event) => {
    // Only clear if this is the active input losing focus
    if (activeInput === event.target) {
      // Use a small delay to allow for clicking within the same input
      // or switching quickly between inputs
      setTimeout(() => {
        // Check if a new focus event happened during the delay
        if (activeInput !== event.target) return;

        if (!event.target.isConnected) {
          activeInput = null;
        } else if (!document.hasFocus()) {
          // Opening the extension popup blurs the page. Keep this target so
          // Smart Mode can still insert into the field the user picked.
          return;
        } else {
          const focusedElement = document.activeElement;
          const focusStillInsideInput =
            focusedElement === event.target ||
            (typeof event.target.contains === 'function' &&
              event.target.contains(focusedElement));

          if (focusStillInsideInput) return;

          debugLog('TalkType: Active input lost focus, clearing');
          activeInput = null;
        }

        // Notify popup that no input is active
        if (!activeInput && smartModeEnabled) {
          chrome.runtime.sendMessage({
            action: 'activeInputChanged',
            hasActiveInput: false
          });
        }
      }, 100);
    }
  });
}

// Function to initialize input detection
function initializeInputDetection() {
  debugLog('TalkType: Initializing input detection for mic buttons...');

  // Focus on standard inputs first - these are most reliable
  const standardInputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea');
  debugLog(`TalkType: Found ${standardInputs.length} standard input elements`);

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

  debugLog(`TalkType: Found ${chatInputs.length} chat input elements`);

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
        background: linear-gradient(135deg, #ff5c9f, #7a5dcb);
        box-shadow: 0 5px 20px rgba(255, 92, 159, 0.3);
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
        queueMicButtonReposition(); // Also sweeps orphaned buttons after DOM churn
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
    debugLog('TalkType: Element is not a valid text input, skipping');
    return;
  }

  // Check if this input already has a microphone button
  if (inputElement.dataset.hasMicButton) {
    debugLog('TalkType: Input already has mic button, skipping');
    return;
  }

  // Mark this input as having a mic button
  inputElement.dataset.hasMicButton = 'true';

  // Create a hardcoded microphone emoji as fallback
  const micEmoji = "🎤";

  // Try to get the SVG icon URL
  let micIconUrl = chrome.runtime.getURL('icons/mic.svg');
  debugLog('TalkType: Microphone icon URL:', micIconUrl);

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
    micButton.style.background = 'rgba(255, 92, 159, 0.2)'; // Slightly more visible in dark mode
    micButton.style.border = '1px solid rgba(255, 92, 159, 0.4)';
    micButton.dataset.darkMode = 'true'; // Mark as dark mode for later reference
  } else {
    micButton.style.background = 'rgba(255, 92, 159, 0.15)';
    micButton.style.border = '1px solid rgba(255, 92, 159, 0.3)';
  }

  micButton.style.borderRadius = '50%';
  micButton.style.cursor = 'pointer';
  micButton.style.width = '32px';
  micButton.style.height = '32px';
  micButton.style.padding = '3px';
  micButton.style.opacity = '1'; // Fully visible
  micButton.style.transform = 'scale(1)';
  micButton.style.transition = 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28), opacity 0.3s ease, background 0.2s ease, box-shadow 0.2s ease';
  micButton.style.boxShadow = '0 1px 3px rgba(255, 92, 159, 0.3)'; // More subtle shadow
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
        0% { transform: scale(1); box-shadow: 0 2px 6px rgba(255, 92, 159, 0.4); }
        50% { transform: scale(1.05); box-shadow: 0 2px 10px rgba(255, 92, 159, 0.6); }
        100% { transform: scale(1); box-shadow: 0 2px 6px rgba(255, 92, 159, 0.4); }
      }

      @keyframes subtle-glow {
        0% { box-shadow: 0 0 3px rgba(255, 92, 159, 0.3); }
        50% { box-shadow: 0 0 5px rgba(255, 92, 159, 0.4); }
        100% { box-shadow: 0 0 3px rgba(255, 92, 159, 0.3); }
      }
    `;
    document.head.appendChild(styleEl);
  }

  debugLog('TalkType: Created mic button for input');

  // Create the icon (either image or text)
  if (hasValidIcon) {
    // Create SVG icon image
    const micIcon = document.createElement('img');
    micIcon.src = micIconUrl;

    micIcon.style.filter = 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18))';

    micIcon.style.width = '100%';
    micIcon.style.height = '100%';
    micIcon.style.transition = 'transform 0.2s ease';

    // Handle image loading error
    micIcon.onerror = () => {
      console.error('TalkType: Failed to load microphone icon, using emoji fallback');
      micIcon.style.display = 'none';
      createEmojiIcon();
    };

    micIcon.onload = () => {
      debugLog('TalkType: Successfully loaded microphone icon');
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
    textIcon.style.color = '#ff5c9f'; // Use purple TalkType brand color
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
      micButton.style.background = 'rgba(255, 92, 159, 0.25)';
      micButton.style.border = '1px solid rgba(255, 92, 159, 0.5)';
      // No glow effect for dark mode - it's too harsh
    } else {
      micButton.style.background = 'rgba(255, 92, 159, 0.2)';
      micButton.style.border = '1px solid rgba(255, 92, 159, 0.4)';
      // Subtle glow for light mode only
      micButton.style.boxShadow = '0 1px 4px rgba(255, 92, 159, 0.3)';
    }
  });

  micButton.addEventListener('mouseleave', () => {
    // Only change styling if not recording
    if (!isRecording || activeInput !== inputElement) {
      micButton.style.opacity = '1';
      micButton.style.transform = 'scale(1)';
      micButton.style.animation = 'none';

      if (isDarkMode) {
        micButton.style.background = 'rgba(255, 92, 159, 0.2)';
        micButton.style.border = '1px solid rgba(255, 92, 159, 0.4)';
      } else {
        micButton.style.background = 'rgba(255, 92, 159, 0.15)';
        micButton.style.border = '1px solid rgba(255, 92, 159, 0.3)';
      }

      micButton.style.boxShadow = '0 1px 3px rgba(255, 92, 159, 0.3)';
      // We keep the button visible at all times
    }
  });

  micButton.addEventListener('mousedown', (event) => {
    event.preventDefault();
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

    if (!event.isTrusted) {
      return;
    }

    // A start is already in flight (getUserMedia prompt, service init) —
    // ignore extra clicks until it settles so we never open two mic streams.
    if (isStartingRecording) {
      return;
    }

    const focusedElement = document.activeElement;
    const inputHasFocus =
      focusedElement === inputElement ||
      (typeof inputElement.contains === 'function' && inputElement.contains(focusedElement));

    if (!isRecording && !inputHasFocus) {
      inputElement.focus();
      showStatusNotification('Click in the text field first, then record.', 'info');
      return;
    }

    debugLog('TalkType: Mic button clicked, isRecording:', isRecording);

    // Visual feedback - always show something when clicked
    micButton.style.transform = 'scale(1.1)';

    try {
      // SIMPLIFIED LOGIC: Just toggle based on recording state
      if (isRecording) {
        // We're recording, so stop it and process
        debugLog('TalkType: Stopping recording...');
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
        debugLog('TalkType: Starting new recording...');
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
        isStartingRecording = true;
        try {
          await startSimpleRecording();
        } finally {
          isStartingRecording = false;
        }
      }

      // Simplified function for starting recording - more direct
      async function startSimpleRecording() {
        try {
          // First make sure we have the services initialized (no key needed —
          // the background worker holds it)
          if (!audioService || !apiService) {
            debugLog('TalkType: Services not initialized, initializing now...');
            audioService = new window.AudioRecordingService();
            apiService = new window.GeminiApiService();
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
          debugLog('TalkType: Calling startRecording directly...');
          await startRecording(inputElement, recordingIndicator);

          debugLog('TalkType: Recording started successfully');
        } catch (error) {
          console.error('TalkType: Error starting recording:', error);
          showStatusNotification('Error starting recording: ' + error.message, 'error');

          // Reset button appearance
          if (micButton.dataset.darkMode === 'true') {
            micButton.style.background = 'rgba(255, 92, 159, 0.2)';
            micButton.style.border = '1px solid rgba(255, 92, 159, 0.4)';
          } else {
            micButton.style.background = 'rgba(255, 92, 159, 0.15)';
            micButton.style.border = '1px solid rgba(255, 92, 159, 0.3)';
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
          micButton.style.background = 'rgba(255, 92, 159, 0.2)';
          micButton.style.border = '1px solid rgba(255, 92, 159, 0.4)';
        } else {
          micButton.style.background = 'rgba(255, 92, 159, 0.15)';
          micButton.style.border = '1px solid rgba(255, 92, 159, 0.3)';
        }

        micButton.style.boxShadow = '0 1px 3px rgba(255, 92, 159, 0.3)';
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

  // Listen for input resize (if ResizeObserver is available).
  // Observers are stored on the button so the orphan sweep can disconnect them.
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      positionMicButton(inputElement, micButton);
    });
    resizeObserver.observe(inputElement);
    micButton.talkTypeResizeObserver = resizeObserver;
  }

  // Update position when input changes visibility
  const visibilityObserver = new MutationObserver(() => {
    positionMicButton(inputElement, micButton);
  });
  visibilityObserver.observe(inputElement, { attributes: true, attributeFilter: ['style', 'class'] });
  micButton.talkTypeMutationObserver = visibilityObserver;
}

// ===================================================================
// BUTTON TRACKING - keep mic buttons glued to their inputs on scroll,
// and sweep away buttons whose inputs left the DOM (SPA rerenders)
// ===================================================================

let repositionQueued = false;

function repositionAllMicButtons() {
  repositionQueued = false;

  document.querySelectorAll('.talktype-button-wrapper').forEach((wrapper) => {
    const micButton = wrapper.querySelector('.audio-to-text-mic-button');
    const input = micButton && micButton.talkTypeInputElement;

    if (!input || !input.isConnected) {
      // Input is gone — tear down the button, its observers, and the wrapper
      // so long-lived SPAs (Gmail, Slack) don't accumulate orphans.
      if (micButton) {
        micButton.talkTypeResizeObserver?.disconnect();
        micButton.talkTypeMutationObserver?.disconnect();
      }
      wrapper.remove();
      return;
    }

    positionMicButton(input, micButton);
  });
}

function queueMicButtonReposition() {
  if (repositionQueued) return;
  repositionQueued = true;
  requestAnimationFrame(repositionAllMicButtons);
}

function initializeButtonTracking() {
  // Capture phase catches scrolling inside nested containers, not just the page.
  window.addEventListener('scroll', queueMicButtonReposition, { capture: true, passive: true });
  window.addEventListener('resize', queueMicButtonReposition, { passive: true });

  // Esc bails out of a recording without transcribing (capture phase so the
  // page doesn't also react, e.g. Gmail closing its compose window).
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && isRecording) {
        event.preventDefault();
        event.stopPropagation();
        cancelRecording();
      }
    },
    true
  );
}

// Find the mic button indicator that belongs to a given input (used by the
// keyboard shortcut, which starts recording without a button click)
function findRecordingIndicatorFor(inputElement) {
  const buttons = document.querySelectorAll('.audio-to-text-mic-button');
  for (const button of buttons) {
    if (button.talkTypeInputElement === inputElement) {
      return button.querySelector('.audio-to-text-recording-indicator');
    }
  }
  return null;
}

// Reset every mic button + indicator back to the idle look
function resetRecordingIndicators() {
  document.querySelectorAll('.audio-to-text-recording-indicator').forEach((indicator) => {
    indicator.style.display = 'none';
    const micButton = indicator.parentElement;
    if (micButton) {
      micButton.style.animation = 'none';
      micButton.style.transform = 'scale(1)';
      if (micButton.dataset.darkMode === 'true') {
        micButton.style.background = 'rgba(255, 92, 159, 0.2)';
        micButton.style.border = '1px solid rgba(255, 92, 159, 0.4)';
      } else {
        micButton.style.background = 'rgba(255, 92, 159, 0.15)';
        micButton.style.border = '1px solid rgba(255, 92, 159, 0.3)';
      }
      micButton.style.boxShadow = '0 1px 3px rgba(255, 92, 159, 0.3)';
      micButton.style.filter = 'none';
    }
  });
}

// Stop and throw away the current recording — no transcription, no API call
async function cancelRecording() {
  if (!isRecording) return;

  isRecording = false;
  if (maxRecordingTimer) {
    clearTimeout(maxRecordingTimer);
    maxRecordingTimer = null;
  }

  if (liveSession) {
    const current = liveSession;
    liveSession = null;
    try {
      current.session.cancel();
    } catch (e) {
      // Already gone.
    }
  } else {
    try {
      await audioService.stopRecording();
    } catch (e) {
      // Nothing captured — that's fine, we're discarding anyway.
    }
  }

  resetRecordingIndicators();
  window.TalkTypeSounds?.play('stop');
  showStatusNotification('Recording discarded', 'info');
}

// ===================================================================
// LIVE ENGINE (Deepgram) - words land in the field while you talk.
// Audio streams through the background worker, which holds the key.
// ===================================================================

async function startLiveRecording(targetInput, indicator) {
  if (isRecording) return;

  if (typeof window.TalkTypeLiveSession === 'undefined') {
    showStatusNotification('Live mode failed to load. Try reloading the page.', 'error');
    return;
  }

  const setup = await chrome.runtime.sendMessage({ action: 'getSetupState' }).catch(() => null);
  if (!setup?.hasDeepgramKey) {
    showStatusNotification('Live mode needs a Deepgram API key — add it in the extension options.', 'error');
    return;
  }

  isRecording = true;
  activeInput = targetInput;

  if (indicator) {
    indicator.style.display = 'block';
    indicator.classList.add('pulse-animation');
  }

  const liveNotification = showStatusNotification('Listening — your words land as you talk', 'recording');
  const updateInterim = (text) => {
    const messageEl = liveNotification?.querySelector('.talktype-notification-message');
    if (messageEl && text) {
      messageEl.textContent = text.length > 90 ? '…' + text.slice(-90) : text;
    }
  };

  let fullTranscript = '';

  const session = new window.TalkTypeLiveSession({
    onInterim: updateInterim,
    onFinal: (text) => {
      fullTranscript = fullTranscript ? `${fullTranscript} ${text}` : text;
      const target = targetInput.isConnected ? targetInput : getActiveInput();
      if (target) {
        try {
          insertTextIntoInput(target, text + ' ');
        } catch (e) {
          debugLog('TalkType: live insert failed', e);
        }
      } else {
        // Field vanished mid-dictation — tell the user we're still capturing
        updateInterim('Text field lost — still listening, your words will be copied at the end');
      }
    },
    onError: (message) => {
      window.TalkTypeSounds?.play('error');
      showStatusNotification(message, 'error');
      abortLiveSession();
    }
  });

  liveSession = { session, targetInput, getTranscript: () => fullTranscript };

  try {
    const started = await session.start();
    if (!started) {
      // Cancelled while the mic prompt was open — session already tore down.
      return;
    }
    window.TalkTypeSounds?.play('start');

    if (maxRecordingTimer) clearTimeout(maxRecordingTimer);
    maxRecordingTimer = setTimeout(() => {
      if (isRecording) {
        showStatusNotification('Recording hit the 5 minute limit — wrapping up', 'info');
        stopRecording();
      }
    }, MAX_RECORDING_MS);
  } catch (error) {
    if (session.cancelled) {
      // User bailed during the prompt and then it failed — nothing to report.
      abortLiveSession();
      return;
    }
    console.error('TalkType: Failed to start live session:', error);
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      showStatusNotification('Microphone permission needed. Click the lock icon in your address bar and allow microphone access.', 'error');
    } else {
      showStatusNotification('Could not start live transcription: ' + error.message, 'error');
    }
    abortLiveSession();
  }
}

function abortLiveSession() {
  const current = liveSession;
  liveSession = null;
  isRecording = false;
  if (maxRecordingTimer) {
    clearTimeout(maxRecordingTimer);
    maxRecordingTimer = null;
  }
  if (current) {
    try {
      current.session.cancel();
    } catch (e) {
      // Already gone.
    }
  }
  resetRecordingIndicators();
}

async function finishLiveRecording() {
  const current = liveSession;
  liveSession = null;
  if (!current) return;

  window.TalkTypeSounds?.play('stop');
  showStatusNotification('Finishing up...', 'processing');

  try {
    // Finals still arriving during the flush grace keep inserting via onFinal
    await current.session.stop();
  } catch (e) {
    debugLog('TalkType: live stop error', e);
  }

  resetRecordingIndicators();

  const transcript = current.getTranscript();
  if (transcript) {
    window.TalkTypeSounds?.play('success');

    if (current.targetInput && current.targetInput.isConnected) {
      showStatusNotification('Transcription complete!', 'success');
    } else {
      // The field the user dictated into is gone — park the words on the
      // clipboard like batch mode does.
      try {
        await navigator.clipboard.writeText(transcript);
        showStatusNotification('Text field disappeared — transcript copied to clipboard', 'info');
      } catch (clipError) {
        showStatusNotification('Text field disappeared and clipboard copy failed', 'error');
      }
    }

    window.TalkTypeStorage.appendTranscriptToHistory({
      text: transcript,
      style: 'standard',
      host: location.hostname
    }).catch(() => {});
  } else {
    showStatusNotification('No speech detected', 'info');
  }
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
    const validTypes = ['text', 'search', 'email', 'url', 'tel'];

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
    // Fixed positioning: getBoundingClientRect gives viewport coordinates, and
    // position:fixed consumes viewport coordinates — no scroll math needed.
    wrapper = document.createElement('div');
    wrapper.className = 'talktype-button-wrapper';
    wrapper.style.position = 'fixed';
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

  // Calculate position to ensure mic is properly placed (viewport coordinates,
  // consumed by the fixed-position wrapper)
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

  // Live engine takes a completely different path: streaming instead of batch
  const { transcriptionEngine } = await chrome.storage.sync.get({ transcriptionEngine: 'cloud' });
  if (transcriptionEngine === 'live') {
    await startLiveRecording(targetInput, indicator);
    return;
  }

  // If services aren't initialized, create them directly — no key needed,
  // the background worker holds it
  if (!audioService || !apiService) {
    debugLog('TalkType: Services not initialized, creating directly');
    if (typeof window.AudioRecordingService !== 'undefined') {
      audioService = new window.AudioRecordingService();
    }
    if (typeof window.GeminiApiService !== 'undefined') {
      apiService = new window.GeminiApiService();
    }
    if (!audioService || !apiService) {
      showStatusNotification('Could not initialize TalkType. Please refresh the page.', 'error');
      return;
    }
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
    debugLog('TalkType: Set isRecording=true');

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
      debugLog('TalkType: Recording started successfully');
    } catch (recError) {
      // This detailed error is handled below in the main catch block
      throw recError;
    }

    window.TalkTypeSounds?.play('start');

    // Safety net: auto-stop before the recording outgrows Gemini's inline
    // request limit, and so a forgotten recording can't run forever.
    if (maxRecordingTimer) clearTimeout(maxRecordingTimer);
    maxRecordingTimer = setTimeout(() => {
      if (isRecording) {
        showStatusNotification('Recording hit the 5 minute limit — transcribing now', 'info');
        stopRecording();
      }
    }, MAX_RECORDING_MS);

    debugLog('TalkType: Recording active');
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
        micButton.style.background = 'rgba(255, 92, 159, 0.15)';
        micButton.style.border = '1px solid rgba(255, 92, 159, 0.3)';
        micButton.style.boxShadow = '0 2px 6px rgba(255, 92, 159, 0.4)';
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
  debugLog('TalkType: stopRecording called, isRecording:', isRecording, 'activeInput:', !!activeInput);

  if (!isRecording) {
    debugLog('TalkType: stopRecording called while not recording, ignoring');
    return;
  }

  // Flip state synchronously so a racing second stop (double click, auto-stop
  // timer) can't transcribe and bill the same audio twice.
  isRecording = false;
  if (maxRecordingTimer) {
    clearTimeout(maxRecordingTimer);
    maxRecordingTimer = null;
  }

  // Live engine: flush the remaining finals and wrap up — no batch step
  if (liveSession) {
    await finishLiveRecording();
    return;
  }

  if (!audioService) {
    console.error('TalkType: Cannot stop recording - audioService is not initialized');
    showStatusNotification('Error: Audio service not initialized', 'error');
    return;
  }

  try {
    debugLog('TalkType: Stopping recording on audioService...');

    // Remove ALL existing notifications first to avoid duplicates
    document.querySelectorAll('.audio-to-text-notification').forEach(notification => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    });

    // Now show a single processing notification
    window.TalkTypeSounds?.play('stop');
    showStatusNotification('Processing audio...', 'processing');

    // Stop recording and get audio blob
    const audioBlob = await audioService.stopRecording();
    debugLog('TalkType: Recording stopped successfully, got audio blob:', !!audioBlob);

    // Store currentInput locally for processing (may be null if the field
    // disappeared mid-recording — we still transcribe and fall back to clipboard)
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
    debugLog('TalkType: Processing audio data directly...');

    let progressNotification = null;

    try {
      // Read the current style; the API key lives in the background worker
      const prefs = await chrome.storage.sync.get({ transcriptionStyle: 'standard' });

      // Create a fresh client with the current style
      const transcriptionService = new window.GeminiApiService();
      transcriptionService.setStyle(prefs.transcriptionStyle);

      // Show transcribing notification with progress bar
      progressNotification = createProgressNotification('Transcribing audio...');

      // Process the audio and get the transcription
      // Add callback to update progress bar during transcription
      const transcription = await transcriptionService.transcribeAudio(audioBlob, (status, percentage) => {
        if (progressNotification) {
          updateProgressNotification(progressNotification, percentage);
        }
      });
      debugLog('TalkType: Transcription received');

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

      // Keep an on-device copy if the user opted into history
      window.TalkTypeStorage.appendTranscriptToHistory({
        text: transcription,
        style: prefs.transcriptionStyle || 'standard',
        host: location.hostname
      }).catch(() => {});

      // Insert the transcription at cursor position (append if no selection)
      if (currentInput && currentInput.isConnected) {
        insertTextIntoInput(currentInput, transcription);
        window.TalkTypeSounds?.play('success');
      } else {
        // The field was removed (SPA rerender) or focus was lost — don't drop
        // the user's words, park them on the clipboard instead.
        try {
          await navigator.clipboard.writeText(transcription);
          window.TalkTypeSounds?.play('success');
          showStatusNotification('Text field disappeared — transcript copied to clipboard', 'info');
        } catch (clipError) {
          console.error('TalkType: Clipboard fallback failed:', clipError);
          showStatusNotification('Could not find the text field to insert into', 'error');
        }
      }
    } catch (transcriptionError) {
      console.error('TalkType: Transcription failed:', transcriptionError);

      // Hide progress notification if it exists
      if (progressNotification && document.body.contains(progressNotification)) {
        document.body.removeChild(progressNotification);
      }

      window.TalkTypeSounds?.play('error');
      showStatusNotification(`Transcription failed: ${transcriptionError.message}`, 'error');
    }

    // Reset button appearance after processing
    document.querySelectorAll('.audio-to-text-mic-button').forEach(button => {
      button.style.animation = 'none';
      button.style.transform = 'scale(1)';
      button.style.opacity = '1';

      if (button.dataset.darkMode === 'true') {
        button.style.background = 'rgba(255, 92, 159, 0.2)';
        button.style.border = '1px solid rgba(255, 92, 159, 0.4)';
      } else {
        button.style.background = 'rgba(255, 92, 159, 0.15)';
        button.style.border = '1px solid rgba(255, 92, 159, 0.3)';
      }

      button.style.boxShadow = '0 1px 3px rgba(255, 92, 159, 0.3)';
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
          micButton.style.background = 'rgba(255, 92, 159, 0.2)';
          micButton.style.border = '1px solid rgba(255, 92, 159, 0.4)';
        } else {
          micButton.style.background = 'rgba(255, 92, 159, 0.15)';
          micButton.style.border = '1px solid rgba(255, 92, 159, 0.3)';
        }

        micButton.style.boxShadow = '0 1px 3px rgba(255, 92, 159, 0.3)';
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


// Function to show status notifications with enhanced visual appeal
function showStatusNotification(message, type = 'info') {
  debugLog('TalkType: Showing notification', type);


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
        background: linear-gradient(90deg, #4568DC, #7474BF, #348AC7, #54d6bb);
        background-size: 300% 100%;
        animation: talktype-gradientBg 3s ease infinite;
      }

      .talktype-recording-notification {
        background: linear-gradient(135deg, rgba(255, 92, 159, 0.85), rgba(70, 174, 247, 0.8));
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

  // Create message text element (classed so live mode can update it in place)
  const messageElement = document.createElement('span');
  messageElement.className = 'talktype-notification-message';
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

// Add message listener for smart mode functionality
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === 'checkActiveInput') {
      // Return info about the currently focused input element
      const selectedInput = getActiveInput();
      const hasActiveInput = selectedInput !== null && smartModeEnabled;
      debugLog('TalkType: Popup requested active input status:', hasActiveInput);

      let response = {
        hasActiveInput: hasActiveInput,
        inputInfo: null
      };

      if (hasActiveInput) {
        response.inputInfo = {
          type: selectedInput.tagName,
          id: selectedInput.id || '(no id)',
          className: selectedInput.className || '(no class)'
        };
      }

      debugLog('TalkType: Sending response:', response);
      sendResponse(response);
      return true;
    }
    else if (request.action === 'insertTranscription') {
      // Popup is requesting to insert transcription text into the focused input
      const text = request.text || '';
      debugLog('TalkType: Received request to insert transcription');
      const success = insertTranscriptionIntoActiveInput(text);
      sendResponse({ success });
      return true;
    }
    else if (request.action === 'toggleRecording') {
      // Keyboard shortcut (Alt+Shift+D) relayed from the background worker
      if (isRecording) {
        stopRecording();
        sendResponse({ success: true, state: 'stopping' });
      } else if (isStartingRecording) {
        sendResponse({ success: false, state: 'starting' });
      } else {
        const focused = document.activeElement;
        const target =
          getActiveInput() || (isValidTextInputElement(focused) ? focused : null);

        if (!target) {
          showStatusNotification('Click into a text field first, then hit the shortcut.', 'info');
          sendResponse({ success: false, state: 'no-input' });
        } else {
          activeInput = target;
          isStartingRecording = true;
          startRecording(target, findRecordingIndicatorFor(target)).finally(() => {
            isStartingRecording = false;
          });
          sendResponse({ success: true, state: 'starting' });
        }
      }
      return true;
    }
    else if (request.action === 'toggleSmartMode') {
      // Update smart mode setting
      smartModeEnabled = request.enabled;
      // Save to storage for persistence
      chrome.storage.sync.set({ smartModeEnabled: smartModeEnabled });
      debugLog('TalkType: Smart mode toggled to:', smartModeEnabled);
      sendResponse({ success: true });
      return true;
    }
  } catch (error) {
    console.error('TalkType: Error processing message:', error);
    sendResponse({
      success: false,
      error: 'Error processing message: ' + error.message
    });
  }

  // Return true to indicate we'll respond asynchronously
  return true;
});

function insertTextIntoInput(targetInput, text) {
  if (!targetInput.isConnected) {
    throw new Error('The text field is no longer on the page.');
  }

  targetInput.focus();

  if (targetInput.isContentEditable) {
    document.execCommand('insertText', false, text);
    targetInput.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })
    );
    debugLog('TalkType: Inserted text into contenteditable element');
    return;
  }

  if (targetInput.tagName === 'INPUT' || targetInput.tagName === 'TEXTAREA') {
    const start = targetInput.selectionStart ?? targetInput.value.length;
    const end = targetInput.selectionEnd ?? targetInput.value.length;
    const before = targetInput.value.substring(0, start);
    const after = targetInput.value.substring(end);
    const spacer =
      start === end && before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n')
        ? ' '
        : '';
    const nextValue = before + spacer + text + after;

    // React/Vue instrument the element's own `value` property to track changes;
    // only a write through the native prototype setter is seen by their state.
    const proto =
      targetInput.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(targetInput, nextValue);
    } else {
      targetInput.value = nextValue;
    }

    const newPos = before.length + spacer.length + text.length;

    targetInput.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })
    );
    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    debugLog('TalkType: Inserted text into input/textarea element');

    if (typeof targetInput.setSelectionRange === 'function') {
      targetInput.setSelectionRange(newPos, newPos);
    }
    return;
  }

  document.execCommand('insertText', false, text);
  targetInput.dispatchEvent(new Event('input', { bubbles: true }));
  debugLog('TalkType: Inserted text using execCommand fallback');
}

// Function to insert transcription into active input element
function insertTranscriptionIntoActiveInput(text) {
  const targetInput = getActiveInput();

  if (!targetInput) {
    console.error('TalkType: No active input to insert transcription into');
    showStatusNotification('Error: No active input element', 'error');
    return false;
  }

  try {
    insertTextIntoInput(targetInput, text);

    // Show success notification
    showStatusNotification('Text inserted successfully', 'success');
    return true;
  } catch (e) {
    console.error('TalkType: Unable to set text on element:', e);
    showStatusNotification('Failed to insert text: ' + e.message, 'error');
    return false;
  }
}
