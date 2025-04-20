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

  // Initialize the message handler service if available
  if (window.MessageHandlerService) {
    console.log("TalkType: Initializing MessageHandlerService");
    window.MessageHandlerService.initialize();
  } else {
    console.warn(
      "TalkType: MessageHandlerService not available, using legacy message handling"
    );
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

      console.log("TalkType: Creating AudioProcessingService instance");
      window.audioProcessingService = new window.AudioProcessingService();

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
    if (window.InputDetectionService.isValidTextInputElement(input)) {
      inputs.push(input);
    }
  });

  // Then look for contentEditable elements
  const editableElements = shadowRoot.querySelectorAll(
    '[contenteditable="true"]'
  );
  editableElements.forEach((editable) => {
    if (window.InputDetectionService.isValidTextInputElement(editable)) {
      inputs.push(editable);
    }
  });

  // Look for rich text editors and special cases
  const richEditors = shadowRoot.querySelectorAll(
    '.ql-editor, .ProseMirror, .public-DraftEditor-content, [role="textbox"]'
  );
  richEditors.forEach((editor) => {
    if (window.InputDetectionService.isValidTextInputElement(editor)) {
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
          if (
            window.InputDetectionService.isValidTextInputElement(event.target)
          ) {
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
                if (
                  window.InputDetectionService.isValidTextInputElement(
                    event.target
                  )
                ) {
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
  const currentActive = window.MessageHandlerService ? 
    window.MessageHandlerService.getDeepActiveElement() : 
    document.activeElement; // Fallback to basic method if service not available
  if (
    currentActive &&
    window.InputDetectionService.isValidTextInputElement(currentActive)
  ) {
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
        if (
          window.InputDetectionService.isValidTextInputElement(event.target)
        ) {
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
    if (window.InputDetectionService.isValidTextInputElement(event.target)) {
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
        const deepActive = window.MessageHandlerService ? 
          window.MessageHandlerService.getDeepActiveElement() : 
          document.activeElement;

        if (
          activeInput === event.target &&
          (!deepActive ||
            !window.InputDetectionService.isValidTextInputElement(deepActive))
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
    const deepActive = window.MessageHandlerService ? 
      window.MessageHandlerService.getDeepActiveElement() : 
      document.activeElement;

    // If we have no active input but there is a focused text input element
    if (
      !activeInput &&
      deepActive &&
      window.InputDetectionService.isValidTextInputElement(deepActive)
    ) {
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
    if (window.InputDetectionService.isValidTextInputElement(input)) {
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
    if (
      !element.dataset.hasMicButton &&
      window.InputDetectionService.isValidTextInputElement(element)
    ) {
      window.MicButtonManager.addMicrophoneToInput(element);
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

// Message handling is now done by MessageHandlerService

// Function to track focused input elements for contextual transcription
function initializeFocusTracking() {
  console.log(
    "TalkType: Initializing focus tracking for contextual transcription"
  );

  // Track focus events on the entire document
  document.addEventListener("focusin", (event) => {
    // Check if the focused element is a text input
    if (window.InputDetectionService.isValidTextInputElement(event.target)) {
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
          !window.InputDetectionService.isValidTextInputElement(
            document.activeElement
          )
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

  // MessageHandlerService now handles all message communication
  // No additional setup needed here since we initialize it in initializeExtensionCore
}
