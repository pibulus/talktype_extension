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
  const currentActive = getDeepActiveElement();
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
        const deepActive = getDeepActiveElement();

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
    const deepActive = getDeepActiveElement();

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

// Keep track of processed request IDs to avoid duplication
const processedRequests = new Set();

// Enhanced input validation that checks if the input is usable
function isValidAndAccessibleInput(element) {
  // First check if it's a valid text input type
  if (!window.InputDetectionService.isValidTextInputElement(element)) {
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
    if (!window.InputDetectionService.isValidTextInputElement(active)) {
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
