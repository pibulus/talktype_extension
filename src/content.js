// Main content script for the Audio to Text extension

// Import services from other scripts
// Note: These scripts need to be included in the manifest.json before this script

let audioService = null;
let apiService = null;
let isRecording = false;
let activeInput = null;

/**
 * Display a status notification
 * @param {string} message - The message to display
 * @param {string} type - Notification type ('info', 'error', 'success', 'warning', 'recording', 'processing')
 * @returns {HTMLElement|null} - The notification element
 */
function showStatusNotification(message, type = "info") {
  if (!message) return null;

  try {
    // Use the global NotificationService object
    return window.NotificationService.showStatusNotification(message, type);
  } catch (error) {
    console.error(`TalkType: Notification error - ${error}`);
    // Simple fallback for critical errors
    if (type === "error") {
      console.error(`TalkType ERROR: ${message}`);
    }
    return null;
  }
}
let apiKey = ""; // This should be set through extension options

// Initialize immediately AND ensure it runs on all DOM changes
console.log(`TalkType: Content script loading...`);
// Force immediate initialization
initializeExtension();

// Set an immediate timeout to ensure it runs after DOM is loaded
setTimeout(() => {
  console.log("TalkType running delayed initialization...");
  initializeExtension();
}, 500);

// Function to initialize the extension with robust error handling
function initializeExtension() {
  console.log("TalkType: Extension initializing...");

  // Ensure script execution environment is ready
  if (document.readyState === "loading") {
    console.log("TalkType: Document still loading, deferring initialization");
    document.addEventListener("DOMContentLoaded", () => {
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
  if (typeof window.AudioRecordingService === "undefined") {
    console.error(
      "TalkType: AudioRecordingService is not defined! Check that audio-service.js is loaded."
    );
    console.log(
      "TalkType: Available global objects:",
      Object.keys(window).filter((k) => k.includes("Service"))
    );

    // Try to use notification service or fallback to alert
    if (window.NotificationService) {
      window.NotificationService.showStatusNotification(
        "TalkType initialization error: Required scripts missing",
        "error"
      );
    } else {
      alert("TalkType initialization error: Required scripts missing");
    }

    // Inject script directly as a fallback
    injectServiceScripts();
    return;
  }

  if (typeof window.GeminiApiService === "undefined") {
    console.error(
      "TalkType: GeminiApiService is not defined! Check that api-service.js is loaded."
    );
    console.log(
      "TalkType: Available global objects:",
      Object.keys(window).filter((k) => k.includes("Service"))
    );

    // Try to use notification service or fallback to alert
    if (window.NotificationService) {
      window.NotificationService.showStatusNotification(
        "TalkType initialization error: Required scripts missing",
        "error"
      );
    } else {
      alert("TalkType initialization error: Required scripts missing");
    }

    // Inject script directly as a fallback
    injectServiceScripts();
    return;
  }

  // Log notification service initialization
  if (window.NotificationService) {
    console.log(`TalkType: NotificationService initialized and ready`);
  } else {
    console.error(`TalkType: NotificationService initialization failed!`);
    // We'll use the fallback showStatusNotification implementation
  }

  // Check that chrome API is available
  if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    console.error(`TalkType: chrome.runtime.sendMessage not available!`);
    showStatusNotification(
      "TalkType initialization error: Chrome API unavailable",
      "error"
    );
    return;
  }

  // Get API key directly from storage for more reliable access
  chrome.storage.sync.get(["apiKey"], function (result) {
    if (chrome.runtime.lastError) {
      console.error(
        `TalkType: Error accessing storage - ${chrome.runtime.lastError}`
      );
      showStatusNotification(
        "Error accessing extension storage. Try reloading the page.",
        "error"
      );
      return;
    }

    console.log(
      `TalkType: Got API key from storage - ${
        result.apiKey ? "Valid key" : "Empty key"
      }`
    );
    apiKey = result.apiKey || "";

    // Initialize services - even with empty API key to allow detection of inputs
    try {
      console.log("TalkType: Creating AudioRecordingService instance");
      audioService = new window.AudioRecordingService();

      console.log("TalkType: Creating GeminiApiService instance with API key");
      apiService = new window.GeminiApiService(apiKey);

      // Check if services initialized correctly
      if (!audioService || !apiService) {
        console.error("TalkType: Service initialization failed!");
        showStatusNotification("Error initializing TalkType services", "error");
        return;
      }

      // Initialize input detection - do this regardless of API key status
      console.log("TalkType: Initializing input detection");
      initializeInputDetection();

      // Add observer to detect dynamically added inputs
      console.log("TalkType: Setting up DOM mutation observer");
      observeDynamicInputs();

      // Initialize focus tracking for contextual transcription
      console.log("TalkType: Initializing focus tracking for contextual mode");
      initializeFocusTracking();

      console.log("TalkType: Extension initialized successfully");

      // Check for browser mic support as an early diagnostic
      if (audioService.isRecordingSupported()) {
        console.log("TalkType: Browser supports recording");
      } else {
        console.warn("TalkType: Browser may not support recording!");
        showStatusNotification(
          "Your browser may not support recording. Chrome is recommended.",
          "info"
        );
      }

      // If no API key, show prompt but still allow initialization
      if (!apiKey) {
        console.warn("TalkType: No API key found in storage.");
        showStatusNotification(
          "Please set your API key in the extension options.",
          "warning"
        );
      }

      // Initialize focus tracking for contextual transcription
      initializeFocusTracking();
    } catch (initError) {
      console.error(
        "TalkType: Error during service initialization:",
        initError
      );
      showStatusNotification(
        "Error initializing speech services: " + initError.message,
        "error"
      );
    }
  });
}

// Inject service scripts as a fallback
function injectServiceScripts() {
  console.log("TalkType: Attempting to inject service scripts as fallback");

  // Create and inject the audio service script
  const audioScript = document.createElement("script");
  audioScript.src = chrome.runtime.getURL("audio-service.js");
  audioScript.onload = function () {
    console.log("TalkType: Successfully injected audio-service.js");

    // Now inject the API service script
    const apiScript = document.createElement("script");
    apiScript.src = chrome.runtime.getURL("api-service.js");
    apiScript.onload = function () {
      console.log("TalkType: Successfully injected api-service.js");

      // Try initialization again after scripts are loaded
      setTimeout(initializeExtensionCore, 100);
    };
    apiScript.onerror = function (e) {
      console.error("TalkType: Failed to inject api-service.js:", e);
    };
    document.head.appendChild(apiScript);
  };
  audioScript.onerror = function (e) {
    console.error("TalkType: Failed to inject audio-service.js:", e);
  };
  document.head.appendChild(audioScript);
}

// Also initialize on DOM content loaded and load events to ensure it works in all scenarios
document.addEventListener("DOMContentLoaded", () => {
  console.log("TalkType: DOMContentLoaded event fired");
  if (!audioService || !apiService) {
    initializeExtension();
  }
});

// Function to detect and handle shadow DOM elements
function getTextInputsInShadowDom(shadowRoot) {
  if (!shadowRoot) return [];

  const inputs = [];

  // Query for potential text inputs within the shadow root
  // First, look for standard inputs
  const standardInputs = shadowRoot.querySelectorAll(
    'input[type="text"], input[type="search"], input:not([type]), textarea'
  );
  standardInputs.forEach((input) => {
    if (isValidTextInputElement(input)) {
      inputs.push(input);
    }
  });

  // Then look for contentEditable elements
  const editableElements = shadowRoot.querySelectorAll(
    '[contenteditable="true"]'
  );
  editableElements.forEach((editable) => {
    if (isValidTextInputElement(editable)) {
      inputs.push(editable);
    }
  });

  // Look for rich text editors and special cases
  const richEditors = shadowRoot.querySelectorAll(
    '.ql-editor, .ProseMirror, .public-DraftEditor-content, [role="textbox"]'
  );
  richEditors.forEach((editor) => {
    if (isValidTextInputElement(editor)) {
      inputs.push(editor);
    }
  });

  // Recursively check for nested shadow roots
  shadowRoot.querySelectorAll("*").forEach((element) => {
    if (element.shadowRoot) {
      const nestedInputs = getTextInputsInShadowDom(element.shadowRoot);
      inputs.push(...nestedInputs);
    }
  });

  return inputs;
}

// Function to get the active element including shadow DOM traversal
function getDeepActiveElement() {
  let active = document.activeElement;

  // Traverse shadow DOM trees to find the deepest active element
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }

  return active;
}

// Check iframes for text inputs (same-origin only)
function setupIframeTracking() {
  // Find all iframes in the document
  const iframes = document.querySelectorAll("iframe");

  iframes.forEach((iframe) => {
    try {
      // This will throw an error for cross-origin iframes
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

      // Set up focus tracking in the iframe
      if (iframeDoc) {
        // Track focus events inside the iframe
        iframeDoc.addEventListener("focusin", (event) => {
          if (isValidTextInputElement(event.target)) {
            console.log(
              "TalkType: Text input focused in iframe:",
              event.target
            );
            activeInput = event.target;

            // Notify popup about active input change
            if (smartModeEnabled) {
              chrome.runtime.sendMessage({
                action: "activeInputChanged",
                hasActiveInput: true,
                inputInfo: {
                  type: activeInput.tagName,
                  id: activeInput.id || "(no id)",
                  className: activeInput.className || "(no class)",
                  inIframe: true,
                },
              });
            }
          }
        });
      }
    } catch (e) {
      // Cross-origin iframe - can't access content
      console.log(
        "TalkType: Cannot access iframe content (likely cross-origin):",
        e
      );
    }
  });

  // Set up a MutationObserver to detect dynamically added iframes
  const iframeObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === "IFRAME") {
          try {
            const iframeDoc =
              node.contentDocument || node.contentWindow.document;

            if (iframeDoc) {
              iframeDoc.addEventListener("focusin", (event) => {
                if (isValidTextInputElement(event.target)) {
                  console.log(
                    "TalkType: Text input focused in new iframe:",
                    event.target
                  );
                  activeInput = event.target;

                  if (smartModeEnabled) {
                    chrome.runtime.sendMessage({
                      action: "activeInputChanged",
                      hasActiveInput: true,
                      inputInfo: {
                        type: activeInput.tagName,
                        id: activeInput.id || "(no id)",
                        className: activeInput.className || "(no class)",
                        inIframe: true,
                      },
                    });
                  }
                }
              });
            }
          } catch (e) {
            // Cross-origin iframe - can't access
            console.log(
              "TalkType: Cannot access new iframe content (likely cross-origin):",
              e
            );
          }
        }
      });
    });
  });

  iframeObserver.observe(document.body, { childList: true, subtree: true });
}

// Function to initialize focus tracking for smart mode with enhanced detection
function initializeFocusTracking() {
  console.log(
    "TalkType: Initializing enhanced focus tracking for contextual transcription"
  );

  // Initial check - see if any element is already focused
  const currentActive = getDeepActiveElement();
  if (currentActive && isValidTextInputElement(currentActive)) {
    console.log("TalkType: Found already focused element:", currentActive);
    activeInput = currentActive;

    // Notify popup about the initially active input
    if (smartModeEnabled) {
      chrome.runtime.sendMessage({
        action: "activeInputChanged",
        hasActiveInput: true,
        inputInfo: {
          type: activeInput.tagName,
          id: activeInput.id || "(no id)",
          className: activeInput.className || "(no class)",
        },
      });
    }
  }

  // Set up shadow DOM detection - find all shadow roots first
  const shadowRoots = [];

  // Function to recursively find shadow roots
  const findShadowRoots = (node) => {
    if (node.shadowRoot) {
      shadowRoots.push(node.shadowRoot);

      // Attach focus event listeners to this shadow root
      node.shadowRoot.addEventListener("focusin", (event) => {
        if (isValidTextInputElement(event.target)) {
          console.log(
            "TalkType: Text input focused in shadow DOM:",
            event.target
          );
          activeInput = event.target;

          // Notify popup about active input change
          if (smartModeEnabled) {
            chrome.runtime.sendMessage({
              action: "activeInputChanged",
              hasActiveInput: true,
              inputInfo: {
                type: activeInput.tagName,
                id: activeInput.id || "(no id)",
                className: activeInput.className || "(no class)",
                inShadowDom: true,
              },
            });
          }
        }
      });

      // Look for shadow roots in the shadow DOM
      Array.from(node.shadowRoot.querySelectorAll("*")).forEach(
        findShadowRoots
      );
    }

    // Check all child elements
    Array.from(node.querySelectorAll("*")).forEach(findShadowRoots);
  };

  // Start the shadow root search
  findShadowRoots(document.documentElement);

  // Set up iframe tracking
  setupIframeTracking();

  // Track focus events on the main document
  document.addEventListener("focusin", (event) => {
    // Check if the focused element is a text input
    if (isValidTextInputElement(event.target)) {
      console.log("TalkType: Text input focused:", event.target);
      activeInput = event.target;

      // For debugging
      console.log("TalkType: Active input set with properties:", {
        tagName: activeInput.tagName,
        id: activeInput.id || "(no id)",
        class: activeInput.className || "(no class)",
      });

      // Notify popup about active input change if smart mode is enabled
      if (smartModeEnabled) {
        chrome.runtime.sendMessage({
          action: "activeInputChanged",
          hasActiveInput: true,
          inputInfo: {
            type: activeInput.tagName,
            id: activeInput.id || "(no id)",
            className: activeInput.className || "(no class)",
          },
        });
      }
    }
  });

  // Track when inputs lose focus
  document.addEventListener("focusout", (event) => {
    // Only clear if this is the active input losing focus
    if (activeInput === event.target) {
      // Use a small delay to allow for clicking within the same input
      // or switching quickly between inputs
      setTimeout(() => {
        // Check if a new focus event happened during the delay
        // or if there's a focused element in shadow DOM or iframe
        const deepActive = getDeepActiveElement();

        if (
          activeInput === event.target &&
          (!deepActive || !isValidTextInputElement(deepActive))
        ) {
          console.log("TalkType: Active input lost focus, clearing");
          activeInput = null;

          // Notify popup that no input is active
          if (smartModeEnabled) {
            chrome.runtime.sendMessage({
              action: "activeInputChanged",
              hasActiveInput: false,
            });
          }
        }
      }, 100);
    }
  });

  // Monitor documentElement for dynamically added shadow roots
  const shadowObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if the new node or any of its children have shadow roots
          findShadowRoots(node);
        }
      });
    });
  });

  shadowObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Regularly check document.activeElement as a fallback
  setInterval(() => {
    const deepActive = getDeepActiveElement();

    // If we have no active input but there is a focused text input element
    if (!activeInput && deepActive && isValidTextInputElement(deepActive)) {
      console.log(
        "TalkType: Detected focused element via interval check:",
        deepActive
      );
      activeInput = deepActive;

      // Notify popup about newly detected active input
      if (smartModeEnabled) {
        chrome.runtime.sendMessage({
          action: "activeInputChanged",
          hasActiveInput: true,
          inputInfo: {
            type: activeInput.tagName,
            id: activeInput.id || "(no id)",
            className: activeInput.className || "(no class)",
            detectionMethod: "interval",
          },
        });
      }
    }
  }, 1000); // Check every second as a fallback mechanism
}

// Function to find inputs in Google specific implementations
function detectGoogleInputs() {
  // Detect Gmail specific editors
  const gmailSelectors = [
    // Gmail compose box
    'div[aria-label="Message Body"]',
    'div[aria-label="Message Text"]',
    'div[aria-label="Compose email"]',
    'div[g_editable="true"]',
    'div[contenteditable="true"][role="textbox"][aria-label*="compose"]',
    'div[contenteditable="true"][role="textbox"][aria-multiline="true"]',

    // Gmail reply box
    'div[aria-label*="Reply"]',
    'div[aria-label*="reply"]',
    'div[aria-label*="Forward"]',
    '.Am.Al.editable[role="textbox"]',

    // Google Docs editor
    ".kix-appview-editor",
    ".docs-texteventtarget-iframe",
    ".kix-lineview",

    // YouTube comments
    'div[contenteditable="true"][aria-label*="Add a comment"]',
    'div[contenteditable="true"][aria-label*="Reply"]',
  ];

  // Try standard query first
  let googleInputs = document.querySelectorAll(gmailSelectors.join(","));
  console.log(
    `TalkType: Found ${googleInputs.length} Google-specific editor fields`
  );

  // Process found inputs
  googleInputs.forEach((input) => {
    if (isValidTextInputElement(input)) {
      console.log("TalkType: Found valid Google input:", input);

      // If this is currently focused, set it as active input
      if (document.activeElement === input) {
        activeInput = input;
        console.log("TalkType: Setting active input to Google editor:", input);

        // Notify popup
        if (smartModeEnabled) {
          chrome.runtime.sendMessage({
            action: "activeInputChanged",
            hasActiveInput: true,
            inputInfo: {
              type: activeInput.tagName,
              id: activeInput.id || "(no id)",
              className: activeInput.className || "(no class)",
              isGoogleEditor: true,
            },
          });
        }
      }
    }
  });

  // Special handling for Gmail's complex rich text editor
  const gmailEditor = document.querySelector(".editable");
  if (gmailEditor && gmailEditor.getAttribute("contenteditable") === "true") {
    console.log("TalkType: Found Gmail editor directly:", gmailEditor);

    // Listen for focus events on this element
    gmailEditor.addEventListener("focus", () => {
      activeInput = gmailEditor;
      console.log("TalkType: Gmail editor focused");

      // Notify popup
      if (smartModeEnabled) {
        chrome.runtime.sendMessage({
          action: "activeInputChanged",
          hasActiveInput: true,
          inputInfo: {
            type: "div",
            isGmailEditor: true,
            className: gmailEditor.className,
          },
        });
      }
    });
  }
}

// Also try on window load
window.addEventListener("load", () => {
  console.log("TalkType: Window load event fired");
  if (!audioService || !apiService) {
    initializeExtension();
  }

  // Initialize enhanced focus tracking
  initializeFocusTracking();

  // Special handling for Google products
  detectGoogleInputs();

  // Double check after a slight delay to catch any late-loading elements
  setTimeout(() => {
    console.log("TalkType: Final initialization check");
    initializeInputDetection();
  }, 1000);
});

// Function to initialize input detection
/**
 * Sets up a MutationObserver to detect and handle dynamically added input elements
 * @deprecated Use InputDetectionService.observeDynamicInputs() instead
 */
function observeDynamicInputs() {
  return window.InputDetectionService.observeDynamicInputs();
}

/**
 * Initialize input detection to find all text input elements on the page
 * @deprecated Use InputDetectionService.initializeInputDetection() instead
 */
function initializeInputDetection() {
  return window.InputDetectionService.initializeInputDetection();

  // Finally, look for elements with specific attributes that strongly suggest they are text inputs
  // NOTE: We're no longer adding mic buttons to these but still tracking them for context menu support
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

  console.log(
    `TalkType: Found ${clearTextInputs.length} additional text inputs with specific attributes (for tracking only)`
  );

  // DISABLED: No longer adding mic buttons to these elements
  // We now use the context menu instead for a more reliable experience
  clearTextInputs.forEach((element) => {
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

  console.log(
    `TalkType: Found ${chatInputs.length} chat input elements (for tracking only)`
  );

  // Clean up log messages
  console.log("TalkType: Input detection completed");
}

/**
 * Create a progress notification with a progress bar
 * @param {string} message - The message to display
 * @returns {HTMLElement|null} - The notification element
 */
function createProgressNotification(message) {
  if (!message) return null;

  try {
    return notificationService.createProgressNotification(message);
  } catch (error) {
    console.error(`TalkType: Progress notification error - ${error}`);
    return null;
  }
}

/**
 * Update a progress notification with a new percentage
 * @param {HTMLElement} notification - The notification element
 * @param {number} percentage - Progress value (0-100)
 */
function updateProgressNotification(notification, percentage) {
  if (!notification) return;

  try {
    notificationService.updateProgressNotification(notification, percentage);
  } catch (error) {
    console.error(`TalkType: Progress update error - ${error}`);
  }
}

/**
 * Start indeterminate progress animation
 * @param {HTMLElement} notification - The notification element
 */
function animateIndeterminateProgress(notification) {
  if (!notification) return;

  try {
    notificationService.animateIndeterminateProgress(notification);
  } catch (error) {
    console.error(`TalkType: Animation error - ${error}`);
  }
}

/**
 * Stop indeterminate progress animation
 * @param {HTMLElement} notification - The notification element
 */
function stopIndeterminateProgress(notification) {
  if (!notification) return;

  try {
    notificationService.stopIndeterminateProgress(notification);
  } catch (error) {
    console.error(`TalkType: Animation stop error - ${error}`);
  }
}

// Function to add microphone icon to an input element
function addMicrophoneToInput(inputElement) {
  // Reduce console logging to avoid spam
  // console.log('TalkType: Adding microphone to input element:', inputElement);

  // CRITICAL: Perform strict validation to ensure this is really a text input element
  if (!isValidTextInputElement(inputElement)) {
    console.log(
      "TalkType: Element is not a valid text input, skipping:",
      inputElement
    );
    return;
  }

  // Check if this input already has a microphone button
  if (inputElement.dataset.hasMicButton) {
    console.log("TalkType: Input already has mic button, skipping");
    return;
  }

  // Mark this input as having a mic button
  inputElement.dataset.hasMicButton = "true";

  // Create a hardcoded microphone emoji as fallback
  const micEmoji = "🎤";

  // Try to get the SVG icon URL
  let micIconUrl = chrome.runtime.getURL("icons/mic.svg");
  console.log("TalkType: Microphone icon URL:", micIconUrl);

  // Whether we have a valid icon URL
  const hasValidIcon =
    micIconUrl &&
    !micIconUrl.includes("undefined") &&
    !micIconUrl.includes("chrome-extension://null");

  // Check if system is using dark mode
  const isDarkMode =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  // Create microphone button with TalkType branding
  const micButton = document.createElement("button");
  micButton.className = "audio-to-text-mic-button";
  micButton.title = "TalkType: Click to dictate";
  micButton.style.position = "absolute";
  micButton.style.zIndex = "5"; // Lower z-index to work better with page content

  // Set background based on dark mode
  if (isDarkMode) {
    micButton.style.background = "rgba(111, 66, 193, 0.2)"; // Slightly more visible in dark mode
    micButton.style.border = "1px solid rgba(111, 66, 193, 0.4)";
    micButton.dataset.darkMode = "true"; // Mark as dark mode for later reference
  } else {
    micButton.style.background = "rgba(111, 66, 193, 0.15)";
    micButton.style.border = "1px solid rgba(111, 66, 193, 0.3)";
  }

  micButton.style.borderRadius = "50%";
  micButton.style.cursor = "pointer";
  micButton.style.width = "28px"; // Slightly larger
  micButton.style.height = "28px"; // Slightly larger
  micButton.style.padding = "2px";
  micButton.style.opacity = "1"; // Fully visible
  micButton.style.transform = "scale(1)";
  micButton.style.transition =
    "transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28), opacity 0.3s ease, background 0.2s ease, box-shadow 0.2s ease";
  micButton.style.boxShadow = "0 1px 3px rgba(111, 66, 193, 0.3)"; // More subtle shadow
  micButton.style.backdropFilter = "blur(2px)";
  micButton.style.webkitBackdropFilter = "blur(2px)";
  micButton.style.display = "block"; // Always visible

  // No animation by default - only on hover and recording
  micButton.style.animation = "none";

  // Store a reference to the input element this button belongs to
  micButton.talkTypeInputElement = inputElement;

  // Add this animation if it doesn't exist yet
  if (!document.getElementById("talk-type-animations")) {
    const styleEl = document.createElement("style");
    styleEl.id = "talk-type-animations";
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

  console.log("TalkType: Created mic button for input:", inputElement);

  // Create the icon (either image or text)
  if (hasValidIcon) {
    // Create SVG icon image
    const micIcon = document.createElement("img");
    micIcon.src = micIconUrl;

    // Apply dark mode filter for light icon on dark backgrounds
    if (isDarkMode) {
      micIcon.style.filter = "brightness(0) invert(1)"; // Makes the icon white
    }

    micIcon.style.width = "100%";
    micIcon.style.height = "100%";
    micIcon.style.transition = "transform 0.2s ease";

    // Handle image loading error
    micIcon.onerror = () => {
      console.error(
        "TalkType: Failed to load microphone icon, using emoji fallback"
      );
      micIcon.style.display = "none";
      createEmojiIcon();
    };

    // Log successful load
    micIcon.onload = () => {
      console.log("TalkType: Successfully loaded microphone icon!");
    };

    micButton.appendChild(micIcon);
  } else {
    // Use emoji fallback immediately
    createEmojiIcon();
  }

  // Function to create emoji fallback
  function createEmojiIcon() {
    const textIcon = document.createElement("div");
    textIcon.innerText = micEmoji;
    textIcon.style.fontSize = "14px";
    textIcon.style.textAlign = "center";
    textIcon.style.lineHeight = "20px";
    textIcon.style.color = "#6F42C1"; // Use purple TalkType brand color
    micButton.appendChild(textIcon);
  }

  // Add recording indicator
  const recordingIndicator = document.createElement("span");
  recordingIndicator.className = "audio-to-text-recording-indicator";
  recordingIndicator.style.display = "none";
  recordingIndicator.style.width = "8px"; // Slightly smaller
  recordingIndicator.style.height = "8px"; // Slightly smaller
  recordingIndicator.style.borderRadius = "50%";
  recordingIndicator.style.background = "#e991a9"; // Even softer, less urgent pink color
  recordingIndicator.style.position = "absolute";
  recordingIndicator.style.top = "-2px";
  recordingIndicator.style.right = "-2px";
  recordingIndicator.style.boxShadow = "0 0 3px rgba(233, 145, 169, 0.4)"; // Softer, more subtle glow
  // Don't set animation directly to avoid CSP issues
  recordingIndicator.style.border = "1px solid rgba(255, 255, 255, 0.2)";

  // Add animations safely via extension's CSS instead of inline JavaScript
  // This avoids Content Security Policy violations
  if (!document.getElementById("audio-to-text-animations")) {
    // Create a link to the stylesheet instead of inline styles
    const link = document.createElement("link");
    link.id = "audio-to-text-animations";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("styles.css");

    // Append to document
    (document.head || document.documentElement).appendChild(link);

    // Set class names for animations instead of inline styles
    recordingIndicator.classList.add("pulse-animation");
  }

  micButton.appendChild(recordingIndicator);

  // Add more subtle TalkType branded hover effects
  micButton.addEventListener("mouseenter", () => {
    micButton.style.opacity = "1";
    micButton.style.transform = "scale(1.1)";
    micButton.style.animation = "subtle-glow 2s infinite";

    if (isDarkMode) {
      micButton.style.background = "rgba(111, 66, 193, 0.25)";
      micButton.style.border = "1px solid rgba(111, 66, 193, 0.5)";
      // No glow effect for dark mode - it's too harsh
    } else {
      micButton.style.background = "rgba(111, 66, 193, 0.2)";
      micButton.style.border = "1px solid rgba(111, 66, 193, 0.4)";
      // Subtle glow for light mode only
      micButton.style.boxShadow = "0 1px 4px rgba(111, 66, 193, 0.3)";
    }
  });

  micButton.addEventListener("mouseleave", () => {
    // Only change styling if not recording
    if (!isRecording || activeInput !== inputElement) {
      micButton.style.opacity = "1";
      micButton.style.transform = "scale(1)";
      micButton.style.animation = "none";

      if (isDarkMode) {
        micButton.style.background = "rgba(111, 66, 193, 0.2)";
        micButton.style.border = "1px solid rgba(111, 66, 193, 0.4)";
      } else {
        micButton.style.background = "rgba(111, 66, 193, 0.15)";
        micButton.style.border = "1px solid rgba(111, 66, 193, 0.3)";
      }

      micButton.style.boxShadow = "0 1px 3px rgba(111, 66, 193, 0.3)";
      // We keep the button visible at all times
    }
  });

  micButton.addEventListener("mousedown", () => {
    micButton.style.transform = "scale(0.95)";
    micButton.style.boxShadow = "0 0 2px rgba(0,0,0,0.1)";
  });

  micButton.addEventListener("mouseup", () => {
    micButton.style.transform = "scale(1.1)";
    micButton.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
  });

  // Add click event to microphone button - simplified but robust
  micButton.onclick = async function (event) {
    // Prevent any default behavior and event bubbling
    event.preventDefault();
    event.stopPropagation();

    console.log(
      "TalkType: Mic button clicked!",
      inputElement,
      "isRecording:",
      isRecording
    );

    // Visual feedback - always show something when clicked
    micButton.style.transform = "scale(1.1)";

    try {
      // SIMPLIFIED LOGIC: Just toggle based on recording state
      if (isRecording) {
        // We're recording, so stop it and process
        console.log("TalkType: Stopping recording...");
        showStatusNotification("Processing recording...", "info");

        // Update button appearance to processing state - more subtle
        micButton.style.animation = "subtle-glow 2s infinite";

        if (micButton.dataset.darkMode === "true") {
          micButton.style.background = "rgba(52, 168, 83, 0.25)"; // Green processing color for dark mode
          micButton.style.border = "1px solid rgba(52, 168, 83, 0.4)";
        } else {
          micButton.style.background = "rgba(52, 168, 83, 0.2)"; // Green processing color for light mode
          micButton.style.border = "1px solid rgba(52, 168, 83, 0.35)";
        }

        micButton.style.boxShadow = "0 1px 4px rgba(52, 168, 83, 0.3)";

        // Get the recording indicator
        const recordingIndicator = micButton.querySelector(
          ".audio-to-text-recording-indicator"
        );
        if (recordingIndicator) {
          recordingIndicator.style.display = "none"; // Hide the recording indicator
        }

        // Stop recording and process the audio
        await stopRecording(); // Make sure we await this
      } else {
        // Not recording, start a new recording
        console.log("TalkType: Starting new recording...");
        showStatusNotification("Recording", "recording");

        // Set active input element as a global target
        activeInput = inputElement;

        // Update visual state - more subtle when recording
        micButton.style.animation = "subtle-glow 1.5s infinite";

        if (isDarkMode) {
          micButton.style.background = "rgba(233, 145, 169, 0.25)"; // Even softer pink for dark mode
          micButton.style.border = "1px solid rgba(233, 145, 169, 0.4)";
        } else {
          micButton.style.background = "rgba(233, 145, 169, 0.2)"; // Even softer pink for light mode
          micButton.style.border = "1px solid rgba(233, 145, 169, 0.35)";
        }

        micButton.style.boxShadow = "0 1px 4px rgba(233, 145, 169, 0.3)";

        // Get the recording indicator and show it
        const recordingIndicator = micButton.querySelector(
          ".audio-to-text-recording-indicator"
        );
        if (recordingIndicator) {
          recordingIndicator.style.display = "block"; // Show the recording indicator
          recordingIndicator.classList.add("pulse-animation");
        }

        // Start the recording process
        await startSimpleRecording();
      }

      // Simplified function for starting recording - more direct
      async function startSimpleRecording() {
        try {
          // First make sure we have the services initialized
          if (!audioService || !apiService) {
            console.log(
              "TalkType: Services not initialized, initializing now..."
            );
            showStatusNotification("Initializing TalkType...", "processing");

            // Initialize directly with storage API key
            await new Promise((resolve) => {
              chrome.storage.sync.get(["apiKey"], function (result) {
                if (result && result.apiKey) {
                  apiKey = result.apiKey;

                  // Create services directly
                  audioService = new window.AudioRecordingService();
                  apiService = new window.GeminiApiService(apiKey);

                  console.log("TalkType: Services initialized directly");
                  resolve();
                } else {
                  console.error("TalkType: No API key found in storage");
                  showStatusNotification(
                    "Please set your API key in extension options",
                    "error"
                  );
                  resolve(); // Resolve anyway to continue
                }
              });
            });

            // Verify services were created
            if (!audioService || !apiService) {
              console.error("TalkType: Failed to initialize services!");
              showStatusNotification(
                "Failed to initialize TalkType services. Please check options.",
                "error"
              );
              return;
            }
          }

          // Simple animation using class-based approach
          const micIcon = micButton.querySelector("img");
          if (micIcon) {
            micIcon.classList.add("wiggle-animation");
            setTimeout(() => {
              micIcon.classList.remove("wiggle-animation");
            }, 500);
          }

          // Now start the actual recording
          console.log("TalkType: Calling startRecording directly...");
          await startRecording(inputElement, recordingIndicator);

          console.log("TalkType: Recording started successfully");
        } catch (error) {
          console.error("TalkType: Error starting recording:", error);
          showStatusNotification(
            "Error starting recording: " + error.message,
            "error"
          );

          // Reset button appearance
          if (micButton.dataset.darkMode === "true") {
            micButton.style.background = "rgba(111, 66, 193, 0.2)";
            micButton.style.border = "1px solid rgba(111, 66, 193, 0.4)";
          } else {
            micButton.style.background = "rgba(111, 66, 193, 0.15)";
            micButton.style.border = "1px solid rgba(111, 66, 193, 0.3)";
          }

          // Hide the recording indicator
          const recordingIndicator = micButton.querySelector(
            ".audio-to-text-recording-indicator"
          );
          if (recordingIndicator) {
            recordingIndicator.style.display = "none";
          }
        }
      }
    } catch (error) {
      console.error("TalkType: Error handling click:", error);
      showStatusNotification("Error: " + error.message, "error");

      // Reset button appearance
      setTimeout(() => {
        micButton.style.transform = "scale(1)";
        micButton.style.animation = "none";

        if (micButton.dataset.darkMode === "true") {
          micButton.style.background = "rgba(111, 66, 193, 0.2)";
          micButton.style.border = "1px solid rgba(111, 66, 193, 0.4)";
        } else {
          micButton.style.background = "rgba(111, 66, 193, 0.15)";
          micButton.style.border = "1px solid rgba(111, 66, 193, 0.3)";
        }

        micButton.style.boxShadow = "0 1px 3px rgba(111, 66, 193, 0.3)";
      }, 500);
    }
  };

  // Always show mic button, but update position on focus
  inputElement.addEventListener("focus", () => {
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
  window.addEventListener("resize", () => {
    positionMicButton(inputElement, micButton);
  });

  // Update position when input changes visibility
  const observer = new MutationObserver(() => {
    positionMicButton(inputElement, micButton);
  });
  observer.observe(inputElement, {
    attributes: true,
    attributeFilter: ["style", "class"],
  });
}

// Helper function to strictly validate if an element is a proper text input
/**
 * Check if an element is a valid text input that can receive transcribed text
 * @param {Element} element - The element to check
 * @returns {boolean} True if the element is a valid text input
 * @deprecated Use InputDetectionService.isValidTextInputElement() instead
 */
function isValidTextInputElement(element) {
  return window.InputDetectionService.isValidTextInputElement(element);
}

// Function to position microphone button correctly relative to input
function positionMicButton(inputElement, micButton) {
  // Reduce logging to avoid console spam
  // console.log('TalkType: Positioning mic button for input:', inputElement);
  const inputRect = inputElement.getBoundingClientRect();
  // console.log('TalkType: Input element rect:', inputRect);

  // Determine the type of input element
  const elementType = inputElement.tagName.toLowerCase();
  const isTextArea = elementType === "textarea";
  const isContentEditable = inputElement.isContentEditable;
  const isLargeElement =
    isTextArea ||
    isContentEditable ||
    inputRect.height > 40 ||
    (elementType !== "input" && elementType !== "textarea");

  // IMPROVED POSITIONING: Create a wrapper element that will be positioned absolutely
  // relative to the input. This provides better alignment in all scenarios.

  // Check if we already have a wrapper for this button
  let wrapper = micButton.parentElement;
  if (!wrapper || !wrapper.classList.contains("talktype-button-wrapper")) {
    // Create a wrapper for absolute positioning
    wrapper = document.createElement("div");
    wrapper.className = "talktype-button-wrapper";
    wrapper.style.position = "absolute";
    wrapper.style.zIndex = "99999";
    wrapper.style.pointerEvents = "none"; // Let clicks go through to the button

    // Move button into the wrapper
    if (micButton.parentElement) {
      micButton.parentElement.removeChild(micButton);
    }
    wrapper.appendChild(micButton);

    // Make sure the button itself can receive clicks
    micButton.style.pointerEvents = "auto";

    // Add wrapper directly to the document body for best positioning
    document.body.appendChild(wrapper);
  }

  // If input is not visible, hidden, disabled, or has zero dimensions, hide the wrapper
  const computedStyle = window.getComputedStyle(inputElement);
  if (
    inputRect.width === 0 ||
    inputRect.height === 0 ||
    inputElement.offsetParent === null ||
    computedStyle.display === "none" ||
    computedStyle.visibility === "hidden" ||
    inputElement.disabled === true ||
    inputElement.readOnly === true ||
    // Check for opacity - if opacity is 0 or near 0, consider it hidden
    parseFloat(computedStyle.opacity) < 0.1
  ) {
    wrapper.style.display = "none";
    return;
  }

  // Check if the element is part of the page and not in an iframe or overlay
  let isInPage = true;
  let parent = inputElement.parentElement;

  while (parent !== null) {
    const parentStyle = window.getComputedStyle(parent);
    // Check if parent is invisible or detached from the main document
    if (
      parentStyle.display === "none" ||
      parentStyle.visibility === "hidden" ||
      parseFloat(parentStyle.opacity) < 0.1
    ) {
      isInPage = false;
      break;
    }
    parent = parent.parentElement;
  }

  if (!isInPage) {
    wrapper.style.display = "none";
    return;
  }

  // Show the wrapper
  wrapper.style.display = "block";

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
    if (
      inputRect.bottom > window.innerHeight - 100 &&
      inputRect.width > inputRect.height * 3
    ) {
      // This is likely a chat input at the bottom of the screen
      // Position the button higher up to avoid being cut off
      top = inputRect.top - 2; // Position at the top of the input
    }
  }

  // Apply the calculated position to the wrapper
  wrapper.style.top = `${top}px`;
  wrapper.style.right = `${right}px`;
  wrapper.style.left = "auto"; // Clear any previous left value

  // Only adjust padding for standard input elements
  if (elementType === "input" || elementType === "textarea") {
    // If input has a right padding of less than 30px, add padding to make room for the button
    const rightPadding = parseInt(computedStyle.paddingRight, 10) || 0;

    if (rightPadding < 25 && !inputElement.dataset.originalPadding) {
      // Store original padding
      inputElement.dataset.originalPadding = rightPadding;
      inputElement.style.paddingRight = "35px"; // Increased padding for better visibility
    }
  }
}

// Function to start recording
async function startRecording(targetInput, indicator) {
  console.log(
    "TalkType: Starting recording with services:",
    !!audioService,
    !!apiService
  );

  // If services aren't initialized, show a helpful error and try to initialize again
  if (!audioService || !apiService) {
    console.error("TalkType: Services not initialized!");

    // Show error notification
    showStatusNotification(
      "TalkType services not initialized. Reconnecting...",
      "error"
    );

    // Try to initialize directly with the simplified approach
    try {
      console.log("TalkType: Attempting to create services directly");

      // Create services directly if classes are available globally
      if (typeof window.AudioRecordingService !== "undefined") {
        audioService = new window.AudioRecordingService();
        console.log("TalkType: AudioRecordingService created directly");
      }

      if (typeof window.GeminiApiService !== "undefined") {
        // Get API key from storage synchronously to avoid async issues
        chrome.storage.sync.get(["apiKey"], function (result) {
          apiKey = result.apiKey || "";

          console.log(
            "TalkType: Creating API service with key:",
            apiKey ? "Valid key" : "Empty key"
          );
          apiService = new window.GeminiApiService(apiKey);

          console.log("TalkType: Services restored, retrying recording");
          showStatusNotification(
            "Services reconnected! Trying again...",
            "info"
          );

          // Now try recording again after a short delay
          setTimeout(() => {
            if (audioService && apiService && targetInput && indicator) {
              console.log(
                "TalkType: Retrying recording with reconnected services"
              );
              startRecordingCore(targetInput, indicator);
            }
          }, 500);
        });
        return;
      }
    } catch (directInitError) {
      console.error(
        "TalkType: Failed to create services directly:",
        directInitError
      );
    }

    // As a last resort, try a full reinitialization
    console.log("TalkType: Falling back to full reinitialization");
    injectServiceScripts();

    // Show error message
    showStatusNotification(
      "Could not initialize TalkType. Please refresh the page or check your API key in options.",
      "error"
    );
    return;
  }

  // Continue with the core recording logic
  await startRecordingCore(targetInput, indicator);
}

// Core recording logic separated for reuse
async function startRecordingCore(targetInput, indicator) {
  // Check if already recording
  if (isRecording) {
    console.log("TalkType: Already recording, ignoring start request");
    return;
  }

  try {
    // Comprehensive browser API debugging
    console.log("TalkType: Checking browser API support...");

    if (!navigator.mediaDevices) {
      console.error("TalkType: navigator.mediaDevices not available!");
      showStatusNotification(
        "Your browser does not support media recording",
        "error"
      );
      return;
    }

    console.log(
      "TalkType: mediaDevices API available:",
      !!navigator.mediaDevices
    );
    console.log(
      "TalkType: getUserMedia available:",
      !!navigator.mediaDevices.getUserMedia
    );
    console.log(
      "TalkType: MediaRecorder available:",
      typeof MediaRecorder !== "undefined"
    );

    // Check if recording is supported by audioService
    if (!audioService.isRecordingSupported()) {
      console.error(
        "TalkType: Recording not supported according to audioService"
      );
      showStatusNotification(
        "Your browser does not support audio recording",
        "error"
      );
      return;
    }

    // Check permissions directly
    console.log("TalkType: Checking permissions...");
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permissionStatus = await navigator.permissions.query({
          name: "microphone",
        });
        console.log(
          "TalkType: Microphone permission status:",
          permissionStatus.state
        );

        if (permissionStatus.state === "denied") {
          showStatusNotification(
            "Microphone permission denied. Please enable in your browser settings.",
            "error"
          );
          return;
        }
      } catch (permError) {
        console.log(
          "TalkType: Permission check error (this is normal in some browsers):",
          permError
        );
      }
    }

    // Update state
    isRecording = true;
    activeInput = targetInput;
    console.log("TalkType: Set isRecording=true, activeInput=", targetInput);

    // Show recording indicator with animations using classes
    if (indicator) {
      console.log("TalkType: Showing recording indicator");
      indicator.style.display = "block";

      // Add pulse animation class
      indicator.classList.add("pulse-animation");

      // Find the mic button (parent of the indicator)
      const micButton = indicator.parentElement;
      if (micButton) {
        // Add wiggle animation to the mic icon using class
        const micIcon = micButton.querySelector("img");
        if (micIcon) {
          // Remove old classes first
          micIcon.classList.remove(
            "wiggle-animation",
            "wiggle-reverse-animation"
          );
          // Add animation class
          micIcon.classList.add("wiggle-animation");
          // Remove class after animation completes
          setTimeout(() => {
            micIcon.classList.remove("wiggle-animation");
          }, 500);
        }

        // Add more prominent TalkType branded recording state
        micButton.style.opacity = "1";
        micButton.style.background = "rgba(255, 64, 129, 0.2)";
        micButton.style.border = "1px solid rgba(255, 64, 129, 0.4)";
        micButton.style.boxShadow = "0 2px 8px rgba(255, 64, 129, 0.35)";
        micButton.style.filter = "drop-shadow(0 0 4px rgba(255, 64, 129, 0.4))";
      }
    }

    // Show enhanced listening notification - shorter text
    showStatusNotification("Recording... Click to stop", "recording");

    // Start recording with thorough error handling
    console.log("TalkType: Calling audioService.startRecording()...");
    try {
      await audioService.startRecording();
      console.log("TalkType: Recording started successfully for", targetInput);
    } catch (recError) {
      // This detailed error is handled below in the main catch block
      throw recError;
    }

    console.log("TalkType: Recording active for", targetInput);
  } catch (error) {
    console.error("TalkType: Failed to start recording:", error);

    // Handle different error types with user-friendly notifications instead of alerts
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      console.log("TalkType: Permission error detected:", error.name);

      // Create a detailed but friendly notification
      showStatusNotification(
        "Microphone permission needed. Click the lock icon in your address bar and allow microphone access.",
        "error"
      );

      // Try to check system permissions too
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions
          .query({ name: "microphone" })
          .then((permStatus) => {
            console.log(
              "TalkType: System permission status:",
              permStatus.state
            );
          })
          .catch((permErr) => {
            console.log("TalkType: System permission check failed:", permErr);
          });
      }

      // On Mac, show a special notification
      if (navigator.platform.toUpperCase().indexOf("MAC") >= 0) {
        console.log("TalkType: Mac detected, showing special message");
        setTimeout(() => {
          showStatusNotification(
            "Mac users: Also check System Preferences → Security & Privacy → Microphone",
            "info"
          );
        }, 3000);
      }
    } else if (error.name === "NotFoundError") {
      showStatusNotification(
        "No microphone found. Please connect a microphone and try again.",
        "error"
      );
    } else if (
      error.name === "TypeError" &&
      error.message.includes("MediaRecorder")
    ) {
      showStatusNotification(
        "Your browser doesn't support audio recording. Try using Chrome or Edge.",
        "error"
      );
    } else {
      // Generic error with more details
      console.log("TalkType: General recording error:", error);
      showStatusNotification(`Recording error: ${error.message}`, "error");
    }

    // Reset state
    isRecording = false;
    activeInput = null;
    console.log("TalkType: Reset recording state after error");

    // Hide recording indicator and update button state
    if (indicator) {
      indicator.style.display = "none";

      // Reset button appearance
      const micButton = indicator.parentElement;
      if (micButton) {
        micButton.style.animation = "";
        micButton.style.opacity = "1";
        micButton.style.background = "rgba(111, 66, 193, 0.15)";
        micButton.style.border = "1px solid rgba(111, 66, 193, 0.3)";
        micButton.style.boxShadow = "0 2px 6px rgba(111, 66, 193, 0.4)";
        micButton.style.filter = "none";
      }
    }

    // Remove any recording notifications
    document
      .querySelectorAll(".audio-to-text-notification-recording")
      .forEach((notification) => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      });
  }
}

// Function to stop recording and process audio
async function stopRecording() {
  console.log(
    "TalkType: stopRecording called, isRecording:",
    isRecording,
    "activeInput:",
    !!activeInput
  );

  if (!audioService) {
    console.error(
      "TalkType: Cannot stop recording - audioService is not initialized"
    );
    showStatusNotification("Error: Audio service not initialized", "error");
    return;
  }

  if (!isRecording) {
    console.error("TalkType: Cannot stop recording - not currently recording");
    showStatusNotification("Error: Not currently recording", "error");
    return;
  }

  if (!activeInput) {
    console.error("TalkType: Cannot stop recording - no active input");
    showStatusNotification("Error: No active input element", "error");
    return;
  }

  try {
    console.log("TalkType: Stopping recording on audioService...");

    // Remove ALL existing notifications first to avoid duplicates
    document
      .querySelectorAll(".audio-to-text-notification")
      .forEach((notification) => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      });

    // Now show a single processing notification
    showStatusNotification("Processing audio...", "processing");

    // Stop recording and get audio blob
    const audioBlob = await audioService.stopRecording();
    console.log(
      "TalkType: Recording stopped successfully, got audio blob:",
      !!audioBlob
    );

    // Update recording state immediately
    isRecording = false;

    // Get info about the current input element for debugging
    console.log("TalkType: Current activeInput:", activeInput);
    console.log("TalkType: activeInput type:", activeInput.tagName);
    if (activeInput.id)
      console.log("TalkType: activeInput id:", activeInput.id);

    // Store currentInput locally for processing
    const currentInput = activeInput;

    // Hide all recording indicators and update button styling
    document
      .querySelectorAll(".audio-to-text-recording-indicator")
      .forEach((indicator) => {
        indicator.style.display = "none";

        // Update the parent button styling to show processing state
        const micButton = indicator.parentElement;
        if (micButton) {
          if (micButton.dataset.darkMode === "true") {
            micButton.style.background = "rgba(52, 168, 83, 0.25)"; // Green processing color for dark mode
            micButton.style.border = "1px solid rgba(52, 168, 83, 0.4)";
          } else {
            micButton.style.background = "rgba(52, 168, 83, 0.2)"; // Green processing color for light mode
            micButton.style.border = "1px solid rgba(52, 168, 83, 0.35)";
          }

          micButton.style.boxShadow = "0 1px 4px rgba(52, 168, 83, 0.3)";

          // Add a subtle pulse animation during processing
          micButton.style.animation = "subtle-glow 1.5s infinite";

          // We're using the subtle-glow animation now which is already defined
        }
      });

    // Process the audio data directly instead of creating another function
    console.log("TalkType: Processing audio data directly...");

    try {
      // Ensure we have fresh API key
      const apiKeyResult = await new Promise((resolve) => {
        chrome.storage.sync.get(["apiKey"], (result) => resolve(result));
      });

      if (!apiKeyResult || !apiKeyResult.apiKey) {
        throw new Error(
          "No API key found. Please set your API key in the extension options."
        );
      }

      // Create a fresh API service
      const transcriptionService = new window.GeminiApiService(
        apiKeyResult.apiKey
      );

      // Make sure the service is valid
      if (!transcriptionService) {
        throw new Error("Could not create transcription service");
      }

      // Show transcribing notification with progress bar
      const progressNotification = createProgressNotification(
        "Transcribing audio..."
      );

      // Process the audio and get the transcription
      // Add callback to update progress bar during transcription
      const transcription = await transcriptionService.transcribeAudio(
        audioBlob,
        (status, percentage) => {
          if (progressNotification) {
            updateProgressNotification(progressNotification, percentage);
          }
        }
      );
      console.log("TalkType: Transcription received:", transcription);

      // Complete progress animation and show success notification
      if (progressNotification) {
        updateProgressNotification(progressNotification, 100);
        setTimeout(() => {
          if (document.body.contains(progressNotification)) {
            document.body.removeChild(progressNotification);
            showStatusNotification("Transcription complete!", "success");
          }
        }, 500);
      } else {
        showStatusNotification("Transcription complete!", "success");
      }

      // Insert the transcription directly into the input element
      if (currentInput) {
        if (currentInput.isContentEditable) {
          try {
            // First check if we should preserve existing content
            const shouldReplace = !currentInput.textContent.trim(); // Replace if empty

            if (shouldReplace) {
              // For empty contentEditable elements
              currentInput.textContent = transcription;
            } else {
              // Try to insert at cursor position if available
              if (window.getSelection && document.createRange) {
                // Get current selection
                const selection = window.getSelection();
                let range;

                // Check if selection is in the current input
                if (
                  (selection.rangeCount > 0 &&
                    selection
                      .getRangeAt(0)
                      .commonAncestorContainer.contains(currentInput)) ||
                  currentInput.contains(
                    selection.getRangeAt(0).commonAncestorContainer
                  )
                ) {
                  range = selection.getRangeAt(0);
                } else {
                  // Otherwise, create a new range at the end
                  range = document.createRange();
                  const lastChild = currentInput.lastChild;
                  if (lastChild) {
                    if (lastChild.nodeType === Node.TEXT_NODE) {
                      range.setStart(lastChild, lastChild.textContent.length);
                    } else {
                      range.setStartAfter(lastChild);
                    }
                  } else {
                    range.setStart(currentInput, 0);
                  }
                  selection.removeAllRanges();
                  selection.addRange(range);
                }

                // Insert text at cursor position
                const textNode = document.createTextNode(transcription);
                range.deleteContents();
                range.insertNode(textNode);

                // Move cursor to end of inserted text
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);
              } else {
                // Fallback for browsers without selection support
                currentInput.textContent += transcription;
              }
            }

            // Special handling for Facebook and Gmail editors
            if (currentInput.getAttribute("data-lexical-editor") === "true") {
              // Facebook lexical editor - trigger input and focus
              currentInput.focus();
              currentInput.click();
            }

            // Dispatch events to notify frameworks of content changes
            currentInput.dispatchEvent(new Event("input", { bubbles: true }));
            currentInput.dispatchEvent(new Event("change", { bubbles: true }));

            console.log("TalkType: Inserted text into contenteditable element");
          } catch (e) {
            console.error("TalkType: Error inserting into contenteditable:", e);
            // Fallback to simple approach
            currentInput.textContent = transcription;
            currentInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
        } else if (
          currentInput.tagName === "INPUT" ||
          currentInput.tagName === "TEXTAREA"
        ) {
          // For standard input/textarea elements
          const originalValue = currentInput.value || "";
          const selStart = currentInput.selectionStart || 0;
          const selEnd = currentInput.selectionEnd || selStart || 0;

          // Insert text at cursor position if there's a selection
          if (typeof selStart === "number" && typeof selEnd === "number") {
            const newValue =
              originalValue.substring(0, selStart) +
              transcription +
              originalValue.substring(selEnd);
            currentInput.value = newValue;

            // Move cursor to the end of inserted text
            const newPosition = selStart + transcription.length;
            currentInput.setSelectionRange(newPosition, newPosition);
          } else {
            // Simple replacement if no selection info
            currentInput.value = transcription;
          }

          // Dispatch events
          currentInput.dispatchEvent(new Event("input", { bubbles: true }));
          currentInput.dispatchEvent(new Event("change", { bubbles: true }));
          console.log("TalkType: Inserted text into input/textarea element");

          // Focus the input
          currentInput.focus();
        } else {
          // Fallback for other elements - try innerText
          try {
            currentInput.innerText = transcription;
            currentInput.dispatchEvent(new Event("input", { bubbles: true }));
            console.log("TalkType: Inserted text using innerText fallback");
          } catch (e) {
            console.error("TalkType: Unable to set text on element:", e);
          }
        }
      } else {
        console.error(
          "TalkType: No input element to insert transcription into"
        );
      }
    } catch (transcriptionError) {
      console.error("TalkType: Transcription failed:", transcriptionError);

      // Hide progress notification if it exists
      if (
        progressNotification &&
        document.body.contains(progressNotification)
      ) {
        document.body.removeChild(progressNotification);
      }

      // Enhanced error handling with more specific messages
      let errorMessage = "Transcription failed";
      let suggestedAction = "";

      // Check for specific error types
      if (transcriptionError.message.includes("API key")) {
        errorMessage = "API key error";
        suggestedAction = "Please check your API key in extension options";
      } else if (transcriptionError.message.includes("upload")) {
        errorMessage = "Failed to upload audio";
        suggestedAction = "Check your internet connection and try again";
      } else if (
        transcriptionError.message.includes("network") ||
        transcriptionError.message.includes("timeout") ||
        transcriptionError.message.includes("connect")
      ) {
        errorMessage = "Network error";
        suggestedAction = "Check your internet connection and try again";
      } else if (
        transcriptionError.message.includes("rate limit") ||
        transcriptionError.message.includes("429")
      ) {
        errorMessage = "Rate limit exceeded";
        suggestedAction = "Please wait a moment and try again";
      } else if (
        transcriptionError.message.includes("500") ||
        transcriptionError.message.includes("server")
      ) {
        errorMessage = "Gemini API server error";
        suggestedAction = "Please try again later";
      } else if (
        transcriptionError.message.includes("no speech") ||
        transcriptionError.message.includes("empty") ||
        transcriptionError.message.includes("silent")
      ) {
        errorMessage = "No speech detected";
        suggestedAction = "Please speak clearly and try again";
      }

      // Show detailed notification with suggested action
      const detailedMessage = suggestedAction
        ? `${errorMessage}: ${suggestedAction}`
        : `${errorMessage}: ${transcriptionError.message}`;

      showStatusNotification(detailedMessage, "error");

      // Log it for debugging
      console.log(`TalkType: Showing detailed error: ${detailedMessage}`);
    }

    // Reset button appearance after processing
    document.querySelectorAll(".audio-to-text-mic-button").forEach((button) => {
      button.style.animation = "none";
      button.style.transform = "scale(1)";
      button.style.opacity = "1";

      if (button.dataset.darkMode === "true") {
        button.style.background = "rgba(111, 66, 193, 0.2)";
        button.style.border = "1px solid rgba(111, 66, 193, 0.4)";
      } else {
        button.style.background = "rgba(111, 66, 193, 0.15)";
        button.style.border = "1px solid rgba(111, 66, 193, 0.3)";
      }

      button.style.boxShadow = "0 1px 3px rgba(111, 66, 193, 0.3)";
      button.style.filter = "none";
    });
  } catch (error) {
    console.error("TalkType: Failed to stop recording:", error);
    showStatusNotification(
      "Error: Failed to stop recording - " + error.message,
      "error"
    );

    // Reset state
    isRecording = false;
    activeInput = null;

    // Hide all recording indicators and reset buttons
    document
      .querySelectorAll(".audio-to-text-recording-indicator")
      .forEach((indicator) => {
        indicator.style.display = "none";

        // Also reset the parent button
        const micButton = indicator.parentElement;
        if (micButton) {
          micButton.style.animation = "none";
          micButton.style.transform = "scale(1)";
          micButton.style.opacity = "1";

          if (micButton.dataset.darkMode === "true") {
            micButton.style.background = "rgba(111, 66, 193, 0.2)";
            micButton.style.border = "1px solid rgba(111, 66, 193, 0.4)";
          } else {
            micButton.style.background = "rgba(111, 66, 193, 0.15)";
            micButton.style.border = "1px solid rgba(111, 66, 193, 0.3)";
          }

          micButton.style.boxShadow = "0 1px 3px rgba(111, 66, 193, 0.3)";
          micButton.style.filter = "none";
        }
      });

    // Also remove any recording notifications on error
    document
      .querySelectorAll(".audio-to-text-notification-recording")
      .forEach((notification) => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      });
  }
}

// Function to process audio data and get transcription
async function processAudioData(audioBlob) {
  if (!activeInput) {
    console.error("TalkType: No active input element found");
    showStatusNotification("Error: No active input element", "error");
    return;
  }

  try {
    // Show processing indicator
    activeInput.classList.add("audio-to-text-processing");

    // Create a vaporwave processing notification with glass morphism
    const processingNotification = showStatusNotification(
      "Transcribing...",
      "processing"
    );

    // Ensure we have a fresh API service with the latest key
    // Get fresh API key from background script
    console.log("TalkType: Getting fresh API key for transcription");

    let apiKeyResponse;
    try {
      apiKeyResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "getApiKey" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                `Failed to get API key: ${chrome.runtime.lastError.message}`
              )
            );
            return;
          }
          resolve(response);
        });
      });
    } catch (keyError) {
      console.error(
        "TalkType: Failed to get API key for transcription:",
        keyError
      );
      throw new Error(
        "Failed to get API key. Please refresh the page and try again."
      );
    }

    if (!apiKeyResponse || !apiKeyResponse.apiKey) {
      console.error("TalkType: No API key found in background response");
      throw new Error(
        "API key not found. Please set your API key in extension options."
      );
    }

    // Create a fresh API service with the latest key
    console.log("TalkType: Creating fresh API service for transcription");
    const freshApiService = new GeminiApiService(apiKeyResponse.apiKey);

    // Verify API key is valid
    console.log("TalkType: Verifying API key for transcription");
    const isValid = await freshApiService.verifyApiKey();
    if (!isValid) {
      console.error("TalkType: API key validation failed during transcription");
      throw new Error("Invalid API key. Please check settings.");
    }

    // Send audio to API for transcription
    console.log("TalkType: Starting transcription with verified API key");
    const transcription = await freshApiService.transcribeAudio(audioBlob);

    // Insert transcribed text based on element type
    if (activeInput.isContentEditable) {
      // For contentEditable elements
      activeInput.textContent = transcription;

      // Trigger input event for reactive frameworks
      activeInput.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (
      activeInput.tagName === "INPUT" ||
      activeInput.tagName === "TEXTAREA"
    ) {
      // For standard input/textarea elements
      activeInput.value = transcription;

      // Trigger input events to make sure any listeners are notified
      // This ensures that frameworks like React, Angular, etc. detect the change
      activeInput.dispatchEvent(new Event("input", { bubbles: true }));
      activeInput.dispatchEvent(new Event("change", { bubbles: true }));

      // If it's a textarea, resize appropriately
      if (
        activeInput.tagName.toLowerCase() === "textarea" &&
        activeInput.scrollHeight > activeInput.clientHeight
      ) {
        const originalHeight = activeInput.style.height;
        activeInput.style.height = "auto";
        activeInput.style.height = activeInput.scrollHeight + "px";

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
      if (typeof activeInput.setSelectionRange === "function") {
        activeInput.setSelectionRange(
          transcription.length,
          transcription.length
        );
      }
    } else {
      // Fallback for other elements - try innerText
      try {
        activeInput.innerText = transcription;
        activeInput.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (e) {
        console.error("TalkType: Unable to set text on element:", e);
      }
    }

    // Show simple success notification
    showStatusNotification("Transcription complete", "success");

    console.log("TalkType: Transcription complete:", transcription);
  } catch (error) {
    console.error("TalkType: Transcription failed:", error);

    // Show error notification instead of alert
    showStatusNotification(
      `❌ Transcription failed: ${error.message}`,
      "error"
    );
  } finally {
    // Remove processing indicator
    if (activeInput) {
      activeInput.classList.remove("audio-to-text-processing");
    }

    // Reset active input
    activeInput = null;
  }
}

// Keep track of processed request IDs to avoid duplication
const processedRequests = new Set();

// Enhanced input validation that checks if the input is usable
function isValidAndAccessibleInput(element) {
  // First check if it's a valid text input type
  if (!isValidTextInputElement(element)) {
    console.log("TalkType: Element is not a valid text input type");
    return false;
  }

  // Make sure element still exists in the DOM
  if (!document.contains(element)) {
    console.log("TalkType: Element is no longer in the DOM");
    return false;
  }

  // Check if the element is visible
  if (
    element.offsetParent === null &&
    getComputedStyle(element).display !== "contents"
  ) {
    // Note: offsetParent is null for elements with display:none, fixed, or hidden parents
    // We make an exception for display:contents which is a legitimate case
    console.log("TalkType: Element is not visible");
    return false;
  }

  // Check if the element is enabled and not read-only
  if (element.disabled || element.readOnly) {
    console.log("TalkType: Element is disabled or read-only");
    return false;
  }

  // If it has a form, check if the form is disabled
  if (element.form && element.form.disabled) {
    console.log("TalkType: Element form is disabled");
    return false;
  }

  // For inputs and textareas, ensure they're not hidden by type
  if (element.tagName === "INPUT" && element.type === "hidden") {
    console.log("TalkType: Input is of type hidden");
    return false;
  }

  // Check if element is in a modal or on top layer
  // This is a heuristic and may need adjustment for specific sites
  const zIndex = parseInt(getComputedStyle(element).zIndex) || 0;
  const parentElements = [];
  let parent = element.parentElement;

  // Build array of parent elements
  while (parent) {
    parentElements.push(parent);
    parent = parent.parentElement;
  }

  // Check if any parent has a very high z-index, indicating a modal
  const isInModal = parentElements.some((p) => {
    const pZIndex = parseInt(getComputedStyle(p).zIndex) || 0;
    return pZIndex > 100; // Arbitrary threshold
  });

  console.log("TalkType: Element z-index:", zIndex, "isInModal:", isInModal);

  return true; // If we've made it here, the input is valid and accessible
}

// Helper function to get the deepest active element (traversing shadow DOM)
function getDeepActiveElement() {
  let active = document.activeElement;

  // Traverse shadow DOM trees to find the deepest active element
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }

  // Handle the case where the active element is an iframe
  if (active && active.tagName === "IFRAME") {
    try {
      // Try to access iframe document (may fail due to cross-origin restrictions)
      const iframeDoc =
        active.contentDocument || active.contentWindow?.document;
      if (iframeDoc && iframeDoc.activeElement) {
        // Only use the iframe's active element if it's not the body (meaning nothing is focused)
        if (iframeDoc.activeElement !== iframeDoc.body) {
          active = iframeDoc.activeElement;

          // Also traverse shadow DOM inside the iframe if present
          while (
            active &&
            active.shadowRoot &&
            active.shadowRoot.activeElement
          ) {
            active = active.shadowRoot.activeElement;
          }
        }
      }
    } catch (error) {
      // Silently fail for cross-origin iframes
      console.log("TalkType: Cannot access iframe content (cross-origin)");
    }
  }

  // Special case for Google Docs - if we're on a Google Docs page
  if (window.location.hostname.includes("docs.google.com")) {
    // If the activeElement is outside the editor but we're on Google Docs
    // consider the editor as the target
    const editor = document.querySelector(".kix-appview-editor");
    if (editor) {
      const isInsideEditor = active === editor || editor.contains(active);
      if (!isInsideEditor) {
        // If the active element is not inside the editor, default to the editor
        console.log("TalkType: Google Docs detected - using editor as target");
        active = editor;
      }
    }
  }

  // Special case for Gmail - if we're on a Gmail page
  if (
    window.location.hostname.includes("mail.google.com") ||
    window.location.hostname.includes("gmail")
  ) {
    // Check if the active element is not a text input but we have a compose box
    if (!isValidTextInputElement(active)) {
      const gmailComposer = document.querySelector(
        'div[role="textbox"][aria-label*="compose"], div[g_editable="true"], div.Am.Al.editable[role="textbox"]'
      );
      if (gmailComposer) {
        console.log(
          "TalkType: Gmail compose detected - using composer as target"
        );
        active = gmailComposer;
      }
    }
  }

  return active;
}

// Enhanced Shadow DOM handling function
function insertIntoShadowDomInput(input, text) {
  // First try to focus the element
  input.focus();

  // Try multiple insertion methods for Shadow DOM content
  try {
    // Method 1: Try direct insertion using execCommand
    if (document.execCommand("insertText", false, text)) {
      return true;
    }

    // Method 2: Simulate keyboard event (for frameworks that intercept them)
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", text);

    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer,
    });

    input.dispatchEvent(pasteEvent);

    // Check if content was updated
    if (input.textContent.includes(text)) {
      return true;
    }

    // Method 3: Use selection API
    const selection = window.getSelection();
    const range = document.createRange();

    // Find where to insert (current cursor or end)
    if (
      selection.rangeCount > 0 &&
      (selection.getRangeAt(0).commonAncestorContainer === input ||
        input.contains(selection.getRangeAt(0).commonAncestorContainer))
    ) {
      range.setStart(
        selection.getRangeAt(0).startContainer,
        selection.getRangeAt(0).startOffset
      );
    } else {
      // Insert at end if no selection in the element
      if (input.lastChild && input.lastChild.nodeType === Node.TEXT_NODE) {
        range.setStart(input.lastChild, input.lastChild.textContent.length);
      } else {
        range.setStart(input, input.childNodes.length);
      }
    }

    range.collapse(true);

    // Insert the text
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // Move cursor to end of inserted text
    range.setStartAfter(textNode);
    range.collapse(true);

    // Update selection
    selection.removeAllRanges();
    selection.addRange(range);

    // Trigger input event to notify frameworks
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    return true;
  } catch (error) {
    console.error("TalkType: Error inserting into Shadow DOM element:", error);
    return false;
  }
}

// Special handler for iframe-based editors
function insertIntoIframe(iframe, text) {
  try {
    // Try to access iframe content
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

    if (!iframeDoc) {
      console.log(
        "TalkType: Cannot access iframe content (possible cross-origin restriction)"
      );
      return false;
    }

    // Try to find active element in the iframe
    const iframeActive = iframeDoc.activeElement;

    if (
      iframeActive &&
      (iframeActive.isContentEditable ||
        iframeActive.tagName === "TEXTAREA" ||
        iframeActive.tagName === "INPUT")
    ) {
      if (iframeActive.isContentEditable) {
        // For contentEditable elements in iframe
        iframeActive.focus();
        iframeDoc.execCommand("insertText", false, text);
        console.log("TalkType: Text inserted via iframe execCommand");
        return true;
      } else {
        // For form elements in iframe
        const currentValue = iframeActive.value || "";
        iframeActive.value = currentValue + text;
        iframeActive.dispatchEvent(new Event("input", { bubbles: true }));
        console.log("TalkType: Text inserted via iframe input value");
        return true;
      }
    }

    // If no active element found but body is contentEditable (like in Google Docs)
    if (iframeDoc.body && iframeDoc.body.isContentEditable) {
      iframeDoc.body.focus();
      iframeDoc.execCommand("insertText", false, text);
      console.log("TalkType: Text inserted via iframe body execCommand");
      return true;
    }

    return false;
  } catch (iframeError) {
    console.log("TalkType: Error accessing iframe:", iframeError);
    return false;
  }
}

// Special handler for Google Docs
function insertIntoGoogleDocs(text) {
  // Find Google Docs editor
  const editor = document.querySelector(".kix-appview-editor");
  if (!editor) return false;

  try {
    // Focus the editor
    editor.focus();

    // Method 1: Try clipboard insertion
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", text);

    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer,
    });

    editor.dispatchEvent(pasteEvent);

    // Method 2: If that fails, try to find and use the hidden textarea
    if (!document.execCommand("insertText", false, text)) {
      const hiddenTextarea = document.querySelector(
        ".docs-texteventtarget-iframe"
      );
      if (hiddenTextarea) {
        hiddenTextarea.focus();
        document.execCommand("insertText", false, text);
      }
    }

    return true;
  } catch (error) {
    console.error("TalkType: Error inserting into Google Docs:", error);
    return false;
  }
}

// Special handler for Gmail
function insertIntoGmail(text) {
  // Try to find Gmail compose box
  const gmailComposers = document.querySelectorAll(
    [
      'div[aria-label="Message Body"]',
      'div[aria-label="Message Text"]',
      'div[g_editable="true"]',
      'div.Am.Al.editable[role="textbox"]',
      'div[role="textbox"][aria-label*="compose"]',
      'div[role="textbox"][aria-multiline="true"]',
    ].join(",")
  );

  if (gmailComposers.length === 0) return false;

  // Use the first composer found
  const composer = gmailComposers[0];

  try {
    // Focus the composer
    composer.focus();

    // First try execCommand
    if (document.execCommand("insertText", false, text)) {
      return true;
    }

    // If that fails, try creating a text node
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));

      // Move cursor to end
      range.setStartAfter(range.endContainer);
      selection.removeAllRanges();
      selection.addRange(range);

      // Trigger events to notify Gmail
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));

      return true;
    }

    return false;
  } catch (error) {
    console.error("TalkType: Error inserting into Gmail:", error);
    return false;
  }
}

// Function to get special web app inputs
function getSpecialWebAppInputs() {
  const specialInputSelectors = {
    gmail: [
      // Gmail compose box - enhanced selectors
      'div[aria-label="Message Body"]',
      'div[aria-label="Message Text"]',
      'div[role="textbox"][aria-multiline="true"]',
      'div[g_editable="true"]',
      // Gmail specific editor
      'table[class="aoP"] div[role="textbox"]',
      'div.Am.Al.editable[role="textbox"]',
    ],
    googleDocs: [
      // Google Docs editor - improved detection
      ".kix-appview-editor",
      ".docs-texteventtarget-iframe",
      ".kix-lineview-text-block",
    ],
    slack: [
      // Slack message composer
      'div[data-qa="message_input"]',
      'div[contenteditable="true"][role="textbox"][data-ms-editor="true"]',
    ],
    notion: [
      // Notion editor
      'div[contenteditable="true"][placeholder="Type \'/\' for commands"]',
      'div[role="textbox"][spellcheck="true"]',
    ],
    facebook: [
      // Facebook/Meta composer
      'div[contenteditable="true"][aria-label*="write"]',
      'div[contenteditable="true"][aria-label*="post"]',
      'div[contenteditable="true"][aria-label*="comment"]',
      'div[contenteditable="true"][data-lexical-editor="true"]',
    ],
    twitter: [
      // Twitter/X composer
      'div[data-testid="tweetTextarea_0"]',
      'div[contenteditable="true"][role="textbox"][data-testid="tweetTextarea"]',
    ],
  };

  // Detect site to use appropriate selectors
  const host = window.location.hostname;
  const inputSelectors = [];

  if (host.includes("mail.google.com")) {
    inputSelectors.push(...specialInputSelectors.gmail);
  } else if (host.includes("docs.google.com")) {
    inputSelectors.push(...specialInputSelectors.googleDocs);
  } else if (host.includes("slack.com")) {
    inputSelectors.push(...specialInputSelectors.slack);
  } else if (host.includes("notion.so")) {
    inputSelectors.push(...specialInputSelectors.notion);
  } else if (
    host.includes("facebook.com") ||
    host.includes("instagram.com") ||
    host.includes("messenger.com")
  ) {
    inputSelectors.push(...specialInputSelectors.facebook);
  } else if (host.includes("twitter.com") || host.includes("x.com")) {
    inputSelectors.push(...specialInputSelectors.twitter);
  }

  // Try all special selectors
  if (inputSelectors.length > 0) {
    const selector = inputSelectors.join(",");
    return document.querySelectorAll(selector);
  }

  return [];
}

// Improved function for smart text insertion into any input
function insertTextIntoField(text, requestId = "manual") {
  console.log(
    "TalkType: Smart insertion requested (ID:",
    requestId,
    "):",
    text?.substring(0, 20) + "..."
  );

  // Initialize variables for tracking insertion status
  let insertionHandled = false;
  let insertionMethod = "unknown";

  // Step 1: Try site-specific handlers first
  if (!insertionHandled) {
    // Google Docs specific handler
    if (window.location.hostname.includes("docs.google.com")) {
      insertionHandled = insertIntoGoogleDocs(text);
      if (insertionHandled) insertionMethod = "google-docs";
    }

    // Gmail specific handler
    else if (
      window.location.hostname.includes("mail.google.com") ||
      window.location.hostname.includes("gmail")
    ) {
      insertionHandled = insertIntoGmail(text);
      if (insertionHandled) insertionMethod = "gmail";
    }
  }

  // Step 2: Try special web app inputs
  if (!insertionHandled) {
    const specialInputs = getSpecialWebAppInputs();
    if (specialInputs.length > 0) {
      for (const input of specialInputs) {
        input.focus();

        // Try execCommand first (works in most cases)
        if (document.execCommand("insertText", false, text)) {
          insertionHandled = true;
          insertionMethod = "special-webapp-execcommand";
          break;
        }

        // If that fails, try Shadow DOM strategies
        if (insertIntoShadowDomInput(input, text)) {
          insertionHandled = true;
          insertionMethod = "special-webapp-shadow";
          break;
        }
      }
    }
  }

  // Step 3: Try activeInput that we've been tracking with focus events
  if (
    !insertionHandled &&
    activeInput &&
    isValidAndAccessibleInput(activeInput)
  ) {
    try {
      activeInput.focus();

      if (
        activeInput.tagName === "TEXTAREA" ||
        (activeInput.tagName === "INPUT" &&
          (activeInput.type === "text" ||
            activeInput.type === "search" ||
            !activeInput.type))
      ) {
        // Standard inputs - use direct value insertion with cursor position awareness
        const currentValue = activeInput.value || "";
        const selStart = activeInput.selectionStart || currentValue.length;
        const selEnd = activeInput.selectionEnd || selStart;

        // Insert text at cursor position
        activeInput.value =
          currentValue.substring(0, selStart) +
          text +
          currentValue.substring(selEnd);

        // Move cursor to end of inserted text
        const newPosition = selStart + text.length;
        activeInput.setSelectionRange(newPosition, newPosition);

        activeInput.dispatchEvent(new Event("input", { bubbles: true }));

        insertionHandled = true;
        insertionMethod = "active-input-value";
      } else if (
        activeInput.isContentEditable ||
        activeInput.getAttribute("contenteditable") === "true"
      ) {
        // Try multiple methods for contentEditable
        // 1. execCommand
        if (document.execCommand("insertText", false, text)) {
          insertionHandled = true;
          insertionMethod = "active-input-execcommand";
        }
        // 2. Shadow DOM strategies if #1 fails
        else if (insertIntoShadowDomInput(activeInput, text)) {
          insertionHandled = true;
          insertionMethod = "active-input-shadow";
        }
      }
      // Handle iframe-based editors
      else if (activeInput.tagName === "IFRAME") {
        if (insertIntoIframe(activeInput, text)) {
          insertionHandled = true;
          insertionMethod = "active-input-iframe";
        }
      }
    } catch (error) {
      console.error("TalkType: Error inserting into active input:", error);
    }
  }

  // Step 4: Try document.activeElement as fallback, with Shadow DOM traversal
  if (!insertionHandled) {
    const fallbackInput = getDeepActiveElement(); // Use our enhanced function to get element from shadow DOM

    if (
      fallbackInput &&
      fallbackInput !== activeInput &&
      isValidAndAccessibleInput(fallbackInput)
    ) {
      console.log(
        "TalkType: Using document.activeElement as fallback (including Shadow DOM)"
      );

      try {
        if (
          fallbackInput.tagName === "TEXTAREA" ||
          (fallbackInput.tagName === "INPUT" &&
            (fallbackInput.type === "text" ||
              fallbackInput.type === "search" ||
              !fallbackInput.type))
        ) {
          // For standard inputs with cursor position awareness
          const currentValue = fallbackInput.value || "";
          const selStart = fallbackInput.selectionStart || currentValue.length;
          const selEnd = fallbackInput.selectionEnd || selStart;

          fallbackInput.value =
            currentValue.substring(0, selStart) +
            text +
            currentValue.substring(selEnd);

          // Move cursor
          const newPosition = selStart + text.length;
          fallbackInput.setSelectionRange(newPosition, newPosition);

          fallbackInput.dispatchEvent(new Event("input", { bubbles: true }));

          insertionHandled = true;
          insertionMethod = "fallback-input-value";
        } else if (
          fallbackInput.isContentEditable ||
          fallbackInput.getAttribute("contenteditable") === "true"
        ) {
          // For contentEditable
          if (document.execCommand("insertText", false, text)) {
            insertionHandled = true;
            insertionMethod = "fallback-input-execcommand";
          } else if (insertIntoShadowDomInput(fallbackInput, text)) {
            insertionHandled = true;
            insertionMethod = "fallback-input-shadow";
          }
        }
        // Handle iframe-based editors
        else if (fallbackInput.tagName === "IFRAME") {
          if (insertIntoIframe(fallbackInput, text)) {
            insertionHandled = true;
            insertionMethod = "fallback-input-iframe";
          }
        }
      } catch (error) {
        console.error("TalkType: Error inserting into fallback input:", error);
      }
    }
  }

  // Step 5: As a last resort, try a direct document query for known editors
  if (!insertionHandled) {
    try {
      // Check for common rich text editors
      const richTextEditors = document.querySelectorAll(
        [
          '[contenteditable="true"]',
          '[role="textbox"]',
          ".ql-editor", // Quill
          ".ProseMirror", // ProseMirror
          ".public-DraftEditor-content", // Draft.js
          '[data-lexical-editor="true"]', // Facebook/Lexical
          '[data-slate-editor="true"]', // Slate
          ".CodeMirror-code", // CodeMirror
          'div.notranslate[contenteditable="true"]',
          'iframe[title*="Rich Text Editor"]',
          'iframe[title*="editor"]',
        ].join(",")
      );

      if (richTextEditors.length > 0) {
        const editor = richTextEditors[0]; // Use the first editor found
        editor.focus();

        if (editor.tagName === "IFRAME") {
          if (insertIntoIframe(editor, text)) {
            insertionHandled = true;
            insertionMethod = "last-resort-iframe";
          }
        } else if (document.execCommand("insertText", false, text)) {
          insertionHandled = true;
          insertionMethod = "last-resort-execcommand";
        } else if (insertIntoShadowDomInput(editor, text)) {
          insertionHandled = true;
          insertionMethod = "last-resort-shadow";
        }
      }
    } catch (lastResortError) {
      console.error(
        "TalkType: Error in last resort insertion:",
        lastResortError
      );
    }
  }

  // Return insertion result
  return {
    success: insertionHandled,
    method: insertionMethod,
    message: insertionHandled
      ? "Text inserted successfully"
      : "Could not find valid input for insertion",
  };
}

// Set up new message handler for insertTranscription after all helper functions are defined
// This will be registered immediately after definition
const messageHandlerSetup = () => {
  // Listen for messages from the extension popup and background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (request.action === "insertTranscription") {
        // Check if this is a duplicate request we've already processed
        const requestId = request.requestId || "no-id";

        if (processedRequests.has(requestId)) {
          console.log("TalkType: Ignoring duplicate request:", requestId);
          sendResponse({
            success: false,
            error: "Duplicate request",
            isDuplicate: true,
          });
          return true;
        }

        // Add this request to our processed set
        processedRequests.add(requestId);

        // Cleanup old request IDs to prevent memory leaks (keep only last 10)
        if (processedRequests.size > 10) {
          const toRemove = Array.from(processedRequests).slice(
            0,
            processedRequests.size - 10
          );
          toRemove.forEach((id) => processedRequests.delete(id));
        }

        // Use our enhanced insertTextIntoField function for more robust insertion
        const result = insertTextIntoField(request.text, requestId);

        // Send response with detailed information
        sendResponse(result);
        return true; // Ensure we return true for async response
      }
    } catch (error) {
      console.error("TalkType: Error in enhanced message handler:", error);
      sendResponse({
        success: false,
        error: "Error in enhanced message handler: " + error.message,
      });
    }

    return true; // Return true to keep the message channel open for async response
  });
};

// Run the setup
messageHandlerSetup();

// Function to track focused input elements for contextual transcription
function initializeFocusTracking() {
  console.log(
    "TalkType: Initializing focus tracking for contextual transcription"
  );

  // Track focus events on the entire document
  document.addEventListener("focusin", (event) => {
    // Check if the focused element is a text input
    if (isValidTextInputElement(event.target)) {
      console.log("TalkType: Text input focused:", event.target);
      activeInput = event.target;

      // For debugging
      console.log("TalkType: Active input set with properties:", {
        tagName: activeInput.tagName,
        id: activeInput.id || "(no id)",
        class: activeInput.className || "(no class)",
      });
    }
  });

  // Track when inputs lose focus
  document.addEventListener("focusout", (event) => {
    // Only clear if this is the active input
    if (activeInput === event.target) {
      console.log("TalkType: Text input lost focus");
      // Don't immediately clear - keep reference for a short time in case popup activates
      setTimeout(() => {
        // Check if focus moved to another input or is truly gone
        if (
          activeInput === event.target &&
          document.activeElement !== activeInput &&
          !isValidTextInputElement(document.activeElement)
        ) {
          console.log("TalkType: Clearing active input reference after delay");
          activeInput = null;
        } else {
          console.log(
            "TalkType: Focus changed but keeping active input reference"
          );
        }
      }, 1000); // Longer delay to ensure popup has time to process
    }
  });

  // Setup message listener if not already added
  if (!window.talkTypeMessageListenerAdded) {
    window.talkTypeMessageListenerAdded = true;

    // Listen for messages from the extension popup and background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("TalkType: Received message:", request);

      try {
        if (request.action === "confirmStopRecording") {
          // Background script is requesting confirmation for stopping recording
          const message =
            request.message ||
            "Stop recording and transcribe the captured audio?";

          // Create a more descriptive confirmation dialog
          const confirmed = confirm(
            message +
              '\n\nSelecting "OK" will stop recording and transcribe what has been recorded so far.'
          );
          sendResponse(confirmed);
          return true;
        } else if (request.action === "stopRecording") {
          // Background script is requesting to stop recording
          // Forward this message to the popup if it's open
          chrome.runtime
            .sendMessage({ action: "forceStopRecording" })
            .catch((err) => {
              // If the popup isn't open, this will fail, which is fine
              console.log(
                "TalkType: Unable to forward stop recording to popup:",
                err
              );
            });
          sendResponse({ success: true });
          return true;
        } else if (request.action === "getActiveInput") {
          // Return info about the currently focused input element
          const hasActiveInput = activeInput !== null;
          console.log(
            "TalkType: Popup requested active input status:",
            hasActiveInput
          );

          let response = {
            hasActiveInput: hasActiveInput,
            inputInfo: null,
          };

          if (hasActiveInput) {
            response.inputInfo = {
              type: activeInput.tagName,
              id: activeInput.id || "(no id)",
              className: activeInput.className || "(no class)",
            };
          }

          console.log("TalkType: Sending response:", response);
          sendResponse(response);
          return true;
        } else if (request.action === "insertTranscription") {
          // Check if this is a duplicate request we've already processed
          const requestId = request.requestId || "no-id";

          if (processedRequests.has(requestId)) {
            console.log("TalkType: Ignoring duplicate request:", requestId);
            sendResponse({
              success: false,
              error: "Duplicate request",
              isDuplicate: true,
            });
            return true;
          }

          // Add this request to our processed set
          processedRequests.add(requestId);

          // Cleanup old request IDs to prevent memory leaks (keep only last 10)
          if (processedRequests.size > 10) {
            const toRemove = Array.from(processedRequests).slice(
              0,
              processedRequests.size - 10
            );
            toRemove.forEach((id) => processedRequests.delete(id));
          }

          // Popup is requesting to insert transcription text into the focused input
          console.log(
            "TalkType: Processing transcription request (ID:",
            requestId,
            "):",
            request.text?.substring(0, 20) + "..."
          );

          // Use a flag to track if insertion was successful
          let insertionHandled = false;
          let responseData = { success: false, error: "Unknown error" };

          // We're getting multiple insertions, so let's be very deliberate about our approach
          // Only try insertion once, and be very cautious about how we do it

          // Track if we've attempted insertion
          let insertionAttempted = false;

          // First, check if we have an active input and it's valid
          if (
            activeInput &&
            isValidAndAccessibleInput(activeInput) &&
            !insertionHandled &&
            !insertionAttempted
          ) {
            insertionAttempted = true; // Mark that we've tried an insertion
            console.log("TalkType: Using tracked active input for insertion");

            try {
              // Focus the input first to ensure it's ready for insertion
              activeInput.focus();

              // Do the insertion with ONE simple method only - no multiple attempts
              if (
                activeInput.tagName === "TEXTAREA" ||
                (activeInput.tagName === "INPUT" &&
                  (activeInput.type === "text" ||
                    activeInput.type === "search" ||
                    !activeInput.type))
              ) {
                // For standard inputs, use ONLY simple value insertion - nothing else
                const currentValue = activeInput.value || "";
                activeInput.value = currentValue + request.text;
                activeInput.dispatchEvent(
                  new Event("input", { bubbles: true })
                );

                console.log(
                  "TalkType: Text inserted via direct value assignment ONLY"
                );
                insertionHandled = true;
                responseData = { success: true, method: "direct-value" };
              } else if (
                activeInput.isContentEditable ||
                activeInput.getAttribute("contenteditable") === "true"
              ) {
                // For contentEditable elements, use ONLY execCommand - nothing else
                activeInput.focus();
                document.execCommand("insertText", false, request.text);
                console.log(
                  "TalkType: Text inserted via execCommand for contentEditable ONLY"
                );
                insertionHandled = true;
                responseData = { success: true, method: "exec-command" };
              }

              // For all other element types - which should be rare - don't try insertion
              // This avoids the triple text issue by preventing fallback to complex methods
              if (!insertionHandled) {
                console.log(
                  "TalkType: Unsupported input type - not attempting insertion"
                );
                responseData = {
                  success: false,
                  error: "Unsupported input type",
                };
              }
            } catch (insertError) {
              console.error("TalkType: Error inserting text:", insertError);
              responseData = {
                success: false,
                error: "Error inserting text: " + insertError.message,
              };
            }
          }

          // Only try fallback if we haven't already handled insertion and haven't attempted insertion yet
          if (!insertionHandled && !insertionAttempted) {
            insertionAttempted = true; // Mark that we've tried an insertion

            // Try to use document.activeElement as a fallback, but only if different from activeInput
            const fallbackInput = document.activeElement;

            if (
              fallbackInput &&
              fallbackInput !== activeInput &&
              isValidAndAccessibleInput(fallbackInput)
            ) {
              console.log("TalkType: Using document.activeElement as fallback");

              try {
                // Use ONLY the simplest insertion method to avoid duplication - no alternatives
                if (
                  fallbackInput.tagName === "TEXTAREA" ||
                  (fallbackInput.tagName === "INPUT" &&
                    (fallbackInput.type === "text" ||
                      fallbackInput.type === "search" ||
                      !fallbackInput.type))
                ) {
                  // For standard inputs, use ONLY simple value insertion
                  const currentValue = fallbackInput.value || "";
                  fallbackInput.value = currentValue + request.text;
                  fallbackInput.dispatchEvent(
                    new Event("input", { bubbles: true })
                  );

                  console.log(
                    "TalkType: Text inserted via direct fallback value assignment ONLY"
                  );
                  insertionHandled = true;
                  responseData = {
                    success: true,
                    method: "fallback-direct-value",
                  };
                } else if (
                  fallbackInput.isContentEditable ||
                  fallbackInput.getAttribute("contenteditable") === "true"
                ) {
                  // For contentEditable elements, use ONLY execCommand
                  fallbackInput.focus();
                  document.execCommand("insertText", false, request.text);
                  console.log(
                    "TalkType: Text inserted via execCommand for contentEditable fallback ONLY"
                  );
                  insertionHandled = true;
                  responseData = {
                    success: true,
                    method: "fallback-exec-command",
                  };
                } else {
                  // Don't attempt insertion for other types
                  console.log(
                    "TalkType: Unsupported fallback input type - not attempting insertion"
                  );
                  responseData = {
                    success: false,
                    error: "Unsupported fallback input type",
                  };
                }
              } catch (fallbackError) {
                console.error(
                  "TalkType: Error inserting text in fallback:",
                  fallbackError
                );
                responseData = {
                  success: false,
                  error: "Fallback insertion error: " + fallbackError.message,
                };
              }
            } else {
              console.warn(
                "TalkType: No valid fallback input found for insertion"
              );
              responseData = {
                success: false,
                error: "No valid input element found",
              };
            }
          }

          // Send the response
          sendResponse(responseData);
          return true; // Ensure we return true for async response
        } else {
          console.warn("TalkType: Unknown action received:", request.action);
          sendResponse({ success: false, error: "Unknown action" });
        }
      } catch (error) {
        console.error("TalkType: Error processing message:", error);
        sendResponse({
          success: false,
          error: "Error processing message: " + error.message,
        });
      }

      // Return true to indicate we'll respond asynchronously
      return true;
    });
  }
}

// Context Menu Transcription Feature
// -----------------------------------
// This section handles transcription initiated from the context menu

// Variables to track context menu recording state
let contextMenuRecording = false;
let contextMenuRecordingIndicator = null;
let targetInputElement = null;

// Listen for messages from background script for context menu actions
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log("TalkType: Context menu message received:", request);

  // Send an immediate response to ensure the connection is acknowledged
  sendResponse({ received: true, status: "processing" });

  if (request.action === "startTranscriptionFromContextMenu") {
    // Show notification that we received the message
    showStatusNotification("Context menu action received!", "info");

    // Get the active element (where the user right-clicked)
    targetInputElement = document.activeElement;
    console.log("TalkType: Active element is:", targetInputElement);

    // Add debug information
    if (request.info && request.info.editable) {
      console.log(
        "TalkType: Context menu was triggered on an editable element according to Chrome"
      );
    }

    // Validate if it's a proper input element
    if (!isValidTextInputElement(targetInputElement)) {
      console.error(
        "TalkType: Context menu target is not a valid text input element"
      );
      showStatusNotification(
        "Cannot transcribe: Invalid input element",
        "error"
      );
      return true;
    }

    console.log(
      "TalkType: Starting context menu transcription for:",
      targetInputElement
    );

    // Start the recording process
    startContextMenuRecording();

    // Send response
    sendResponse({ success: true });
    return true;
  }

  return false; // Let other handlers process it
});

// Create a visual indicator for context menu recording
function createContextMenuRecordingIndicator() {
  // Remove any existing indicators
  const existingIndicator = document.getElementById(
    "talktype-context-recording"
  );
  if (existingIndicator) {
    document.body.removeChild(existingIndicator);
  }

  // Create new indicator
  const indicator = document.createElement("div");
  indicator.id = "talktype-context-recording";
  indicator.innerHTML = `
    <div class="talktype-context-recording-icon">
      <div class="talktype-context-recording-pulse"></div>
    </div>
    <div class="talktype-context-recording-text">
      Recording... Click anywhere to stop
    </div>
  `;

  // Style the indicator
  indicator.style.position = "fixed";
  indicator.style.bottom = "20px";
  indicator.style.right = "20px";
  indicator.style.padding = "12px 18px";
  indicator.style.background = "rgba(111, 66, 193, 0.9)";
  indicator.style.color = "white";
  indicator.style.borderRadius = "16px";
  indicator.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  indicator.style.fontSize = "14px";
  indicator.style.fontWeight = "500";
  indicator.style.display = "flex";
  indicator.style.alignItems = "center";
  indicator.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.15)";
  indicator.style.zIndex = "2147483647"; // Highest possible z-index
  indicator.style.cursor = "pointer";
  indicator.style.backdropFilter = "blur(8px)";
  indicator.style.webkitBackdropFilter = "blur(8px)";
  indicator.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  indicator.style.transition = "all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)";

  // Style the icon part
  const iconPart = indicator.querySelector(".talktype-context-recording-icon");
  iconPart.style.width = "16px";
  iconPart.style.height = "16px";
  iconPart.style.borderRadius = "50%";
  iconPart.style.background = "#e991a9";
  iconPart.style.marginRight = "12px";
  iconPart.style.position = "relative";

  // Style the pulse animation
  const pulsePart = indicator.querySelector(
    ".talktype-context-recording-pulse"
  );
  pulsePart.style.position = "absolute";
  pulsePart.style.top = "0";
  pulsePart.style.left = "0";
  pulsePart.style.right = "0";
  pulsePart.style.bottom = "0";
  pulsePart.style.borderRadius = "50%";
  pulsePart.style.animation = "talktype-pulse 2s infinite";

  // Add pulse animation if it doesn't exist yet
  if (!document.getElementById("talktype-context-animations")) {
    const styleEl = document.createElement("style");
    styleEl.id = "talktype-context-animations";
    styleEl.textContent = `
      @keyframes talktype-pulse {
        0% { box-shadow: 0 0 0 0 rgba(233, 145, 169, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(233, 145, 169, 0); }
        100% { box-shadow: 0 0 0 0 rgba(233, 145, 169, 0); }
      }
    `;
    document.head.appendChild(styleEl);
  }

  // Add hover effects
  indicator.addEventListener("mouseenter", () => {
    indicator.style.transform = "scale(1.05)";
    indicator.style.boxShadow = "0 6px 25px rgba(0, 0, 0, 0.2)";
  });

  indicator.addEventListener("mouseleave", () => {
    indicator.style.transform = "scale(1)";
    indicator.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.15)";
  });

  // Add click handler to stop recording
  indicator.addEventListener("click", () => {
    stopContextMenuRecording();
  });

  // Add to page
  document.body.appendChild(indicator);
  return indicator;
}

// Start recording from context menu
async function startContextMenuRecording() {
  try {
    // Do nothing if already recording
    if (contextMenuRecording) {
      console.log("TalkType: Already recording from context menu");
      return;
    }

    // Show recording indicator
    contextMenuRecordingIndicator = createContextMenuRecordingIndicator();

    // Set active input for use during transcription
    activeInput = targetInputElement;

    // Initialize audio service if needed
    if (!audioService) {
      console.log(
        "TalkType: Initializing audio service for context menu recording"
      );

      // Get API key from storage
      const { apiKey } = await new Promise((resolve) => {
        chrome.storage.sync.get(["apiKey"], resolve);
      });

      // Create services
      audioService = new window.AudioRecordingService();
      apiService = new window.GeminiApiService(apiKey);

      if (!apiKey) {
        showStatusNotification(
          "Please set your API key in the extension options",
          "error"
        );
        return;
      }
    }

    // Set recording flag
    contextMenuRecording = true;
    isRecording = true;

    // Notify background script about recording state
    chrome.runtime.sendMessage({
      action: "updateRecordingState",
      isRecording: true,
    });

    // Start recording
    await audioService.startRecording();
    console.log("TalkType: Context menu recording started");

    // Add global click handler to stop recording when clicked elsewhere
    setTimeout(() => {
      document.addEventListener("click", documentClickHandler, { once: true });
    }, 500); // Small delay to avoid immediate triggering
  } catch (error) {
    console.error("TalkType: Error starting context menu recording:", error);
    showStatusNotification(`Recording error: ${error.message}`, "error");
    contextMenuRecording = false;
    isRecording = false;

    // Clean up
    if (contextMenuRecordingIndicator) {
      document.body.removeChild(contextMenuRecordingIndicator);
      contextMenuRecordingIndicator = null;
    }
  }
}

// Handle document click to stop recording
function documentClickHandler(event) {
  // Prevent immediate re-triggering
  if (event.target.closest("#talktype-context-recording")) {
    return;
  }

  console.log("TalkType: Document clicked, stopping context menu recording");
  stopContextMenuRecording();
}

// Stop recording from context menu and process audio
async function stopContextMenuRecording() {
  if (!contextMenuRecording) {
    return;
  }

  console.log("TalkType: Stopping context menu recording");

  try {
    // Update indicator to show processing
    if (contextMenuRecordingIndicator) {
      const textElement = contextMenuRecordingIndicator.querySelector(
        ".talktype-context-recording-text"
      );
      if (textElement) {
        textElement.textContent = "Processing transcription...";
      }

      // Change style to indicate processing
      contextMenuRecordingIndicator.style.background =
        "rgba(70, 174, 247, 0.85)";
    }

    // Stop recording and get audio blob
    const audioBlob = await audioService.stopRecording();

    // Reset recording flags
    contextMenuRecording = false;
    isRecording = false;

    // Notify background script
    chrome.runtime.sendMessage({
      action: "updateRecordingState",
      isRecording: false,
    });

    // Get fresh API service for transcription
    const { apiKey } = await new Promise((resolve) => {
      chrome.storage.sync.get(["apiKey"], resolve);
    });

    const freshApiService = new window.GeminiApiService(apiKey);

    // Transcribe audio
    const transcription = await freshApiService.transcribeAudio(audioBlob);
    console.log(
      "TalkType: Context menu transcription complete:",
      transcription
    );

    // Insert transcription into target input
    if (targetInputElement && isValidTextInputElement(targetInputElement)) {
      // Focus the element first
      targetInputElement.focus();

      // Insert text based on element type
      if (targetInputElement.isContentEditable) {
        // For contentEditable elements
        targetInputElement.textContent = transcription;
        targetInputElement.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (
        targetInputElement.tagName === "INPUT" ||
        targetInputElement.tagName === "TEXTAREA"
      ) {
        // For standard input/textarea elements
        targetInputElement.value = transcription;
        targetInputElement.dispatchEvent(new Event("input", { bubbles: true }));
        targetInputElement.dispatchEvent(
          new Event("change", { bubbles: true })
        );
      }

      // Show success notification
      showStatusNotification("Transcription complete", "success");
    } else {
      console.error("TalkType: Target input element no longer valid");
      showStatusNotification(
        "Could not insert transcription: Input not found",
        "error"
      );
    }
  } catch (error) {
    console.error("TalkType: Error during context menu transcription:", error);
    showStatusNotification(`Transcription error: ${error.message}`, "error");
  } finally {
    // Clean up
    if (contextMenuRecordingIndicator) {
      document.body.removeChild(contextMenuRecordingIndicator);
      contextMenuRecordingIndicator = null;
    }

    // Reset state
    targetInputElement = null;
    document.removeEventListener("click", documentClickHandler);
  }
}
