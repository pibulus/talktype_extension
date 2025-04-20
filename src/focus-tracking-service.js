/**
 * Focus Tracking Service for TalkType Extension
 * 
 * A standalone service that manages focus tracking for text input elements,
 * including special handling for shadow DOM and iframes.
 */

// Create the service as a global object
const FocusTrackingService = {
  // Current active input element that has focus
  activeInput: null,
  
  // Tracks if smart mode is enabled for notifications
  smartModeEnabled: false,

  /**
   * Initialize focus tracking for contextual transcription
   */
  initialize() {
    console.log("TalkType: Initializing enhanced focus tracking");
    
    // Initial check - see if any element is already focused
    const currentActive = this.getDeepActiveElement();
    if (currentActive && window.InputDetectionService.isValidTextInputElement(currentActive)) {
      console.log("TalkType: Found already focused element:", currentActive);
      this.activeInput = currentActive;
      
      // Notify popup about the initially active input
      if (this.smartModeEnabled) {
        this.notifyActiveInputChanged(true, {
          type: this.activeInput.tagName,
          id: this.activeInput.id || "(no id)",
          className: this.activeInput.className || "(no class)",
        });
      }
    }

    // Set up shadow DOM detection and listening
    this.setupShadowDomTracking();
    
    // Set up iframe tracking
    this.setupIframeTracking();
    
    // Track focus events on the main document
    this.setupDocumentFocusListeners();
    
    // Set up interval check as fallback detection mechanism
    this.setupIntervalChecking();
    
    // Special handling for Google products
    this.setupGoogleInputDetection();
  },
  
  /**
   * Get the active element including shadow DOM traversal
   * @returns {Element} The deepest active element
   */
  getDeepActiveElement() {
    let active = document.activeElement;
    
    // Traverse shadow DOM trees to find the deepest active element
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    
    // Handle the case where the active element is an iframe
    if (active && active.tagName === "IFRAME") {
      try {
        // Try to access iframe document (may fail due to cross-origin restrictions)
        const iframeDoc = active.contentDocument || active.contentWindow?.document;
        if (iframeDoc && iframeDoc.activeElement) {
          // Only use the iframe's active element if it's not the body (meaning nothing is focused)
          if (iframeDoc.activeElement !== iframeDoc.body) {
            active = iframeDoc.activeElement;
            
            // Also traverse shadow DOM inside the iframe if present
            while (active && active.shadowRoot && active.shadowRoot.activeElement) {
              active = active.shadowRoot.activeElement;
            }
          }
        }
      } catch (error) {
        // Silently fail for cross-origin iframes
        console.log("TalkType: Cannot access iframe content (cross-origin)");
      }
    }
    
    // Special case for Google Docs
    if (window.location.hostname.includes("docs.google.com")) {
      const editor = document.querySelector(".kix-appview-editor");
      if (editor) {
        const isInsideEditor = active === editor || editor.contains(active);
        if (!isInsideEditor) {
          console.log("TalkType: Google Docs detected - using editor as target");
          active = editor;
        }
      }
    }
    
    // Special case for Gmail
    if (window.location.hostname.includes("mail.google.com") || window.location.hostname.includes("gmail")) {
      if (!window.InputDetectionService.isValidTextInputElement(active)) {
        const gmailComposer = document.querySelector(
          'div[role="textbox"][aria-label*="compose"], div[g_editable="true"], div.Am.Al.editable[role="textbox"]'
        );
        if (gmailComposer) {
          console.log("TalkType: Gmail compose detected - using composer as target");
          active = gmailComposer;
        }
      }
    }
    
    return active;
  },
  
  /**
   * Set up tracking for shadow DOM elements
   */
  setupShadowDomTracking() {
    const shadowRoots = [];
    
    // Function to recursively find shadow roots
    const findShadowRoots = (node) => {
      if (node.shadowRoot) {
        shadowRoots.push(node.shadowRoot);
        
        // Attach focus event listeners to this shadow root
        node.shadowRoot.addEventListener("focusin", (event) => {
          if (window.InputDetectionService.isValidTextInputElement(event.target)) {
            console.log("TalkType: Text input focused in shadow DOM:", event.target);
            this.setActiveInput(event.target, { inShadowDom: true });
          }
        });
        
        // Look for shadow roots in the shadow DOM
        Array.from(node.shadowRoot.querySelectorAll("*")).forEach(findShadowRoots);
      }
      
      // Check all child elements
      if (node.querySelectorAll) {
        Array.from(node.querySelectorAll("*")).forEach(findShadowRoots);
      }
    };
    
    // Start the shadow root search
    findShadowRoots(document.documentElement);
    
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
  },
  
  /**
   * Set up tracking for iframe elements
   */
  setupIframeTracking() {
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
            if (window.InputDetectionService.isValidTextInputElement(event.target)) {
              console.log("TalkType: Text input focused in iframe:", event.target);
              this.setActiveInput(event.target, { inIframe: true });
            }
          });
        }
      } catch (e) {
        // Cross-origin iframe - can't access content
        console.log("TalkType: Cannot access iframe content (likely cross-origin):", e);
      }
    });
    
    // Set up a MutationObserver to detect dynamically added iframes
    const iframeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === "IFRAME") {
            try {
              const iframeDoc = node.contentDocument || node.contentWindow.document;
              
              if (iframeDoc) {
                iframeDoc.addEventListener("focusin", (event) => {
                  if (window.InputDetectionService.isValidTextInputElement(event.target)) {
                    console.log("TalkType: Text input focused in new iframe:", event.target);
                    this.setActiveInput(event.target, { inIframe: true });
                  }
                });
              }
            } catch (e) {
              // Cross-origin iframe - can't access
              console.log("TalkType: Cannot access new iframe content (likely cross-origin):", e);
            }
          }
        });
      });
    });
    
    iframeObserver.observe(document.body, { childList: true, subtree: true });
  },
  
  /**
   * Set up document-level focus event listeners
   */
  setupDocumentFocusListeners() {
    // Track focus events on the main document
    document.addEventListener("focusin", (event) => {
      // Check if the focused element is a text input
      if (window.InputDetectionService.isValidTextInputElement(event.target)) {
        console.log("TalkType: Text input focused:", event.target);
        this.setActiveInput(event.target);
      }
    });
    
    // Track when inputs lose focus
    document.addEventListener("focusout", (event) => {
      // Only clear if this is the active input losing focus
      if (this.activeInput === event.target) {
        // Use a small delay to allow for clicking within the same input
        // or switching quickly between inputs
        setTimeout(() => {
          // Check if a new focus event happened during the delay
          // or if there's a focused element in shadow DOM or iframe
          const deepActive = this.getDeepActiveElement();
          
          if (
            this.activeInput === event.target &&
            (!deepActive || !window.InputDetectionService.isValidTextInputElement(deepActive))
          ) {
            console.log("TalkType: Active input lost focus, clearing");
            this.clearActiveInput();
          }
        }, 100);
      }
    });
  },
  
  /**
   * Set up interval-based checking for active inputs
   */
  setupIntervalChecking() {
    // Regularly check document.activeElement as a fallback
    setInterval(() => {
      const deepActive = this.getDeepActiveElement();
      
      // If we have no active input but there is a focused text input element
      if (
        !this.activeInput &&
        deepActive &&
        window.InputDetectionService.isValidTextInputElement(deepActive)
      ) {
        console.log("TalkType: Detected focused element via interval check:", deepActive);
        this.setActiveInput(deepActive, { detectionMethod: "interval" });
      }
    }, 1000); // Check every second as a fallback mechanism
  },
  
  /**
   * Set up special detection for Google-specific inputs
   */
  setupGoogleInputDetection() {
    // Only run if we're on a Google domain
    if (!window.location.hostname.includes("google.com")) {
      return;
    }
    
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
    console.log(`TalkType: Found ${googleInputs.length} Google-specific editor fields`);
    
    // Process found inputs
    googleInputs.forEach((input) => {
      if (window.InputDetectionService.isValidTextInputElement(input)) {
        console.log("TalkType: Found valid Google input:", input);
        
        // If this is currently focused, set it as active input
        if (document.activeElement === input) {
          this.setActiveInput(input, { isGoogleEditor: true });
        }
      }
    });
    
    // Special handling for Gmail's complex rich text editor
    const gmailEditor = document.querySelector(".editable");
    if (gmailEditor && gmailEditor.getAttribute("contenteditable") === "true") {
      console.log("TalkType: Found Gmail editor directly:", gmailEditor);
      
      // Listen for focus events on this element
      gmailEditor.addEventListener("focus", () => {
        this.setActiveInput(gmailEditor, { isGmailEditor: true });
      });
    }
  },
  
  /**
   * Get text inputs in a shadow DOM element
   * @param {ShadowRoot} shadowRoot - The shadow root to search
   * @returns {Element[]} Array of text input elements found
   */
  getTextInputsInShadowDom(shadowRoot) {
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
        const nestedInputs = this.getTextInputsInShadowDom(element.shadowRoot);
        inputs.push(...nestedInputs);
      }
    });
    
    return inputs;
  },
  
  /**
   * Set the active input element
   * @param {Element} element - The input element to track
   * @param {Object} additionalInfo - Optional additional information about the input
   */
  setActiveInput(element, additionalInfo = {}) {
    if (!element || !window.InputDetectionService.isValidTextInputElement(element)) {
      console.warn("TalkType: Attempted to set invalid element as active input");
      return;
    }
    
    this.activeInput = element;
    
    // For debugging
    console.log("TalkType: Active input set with properties:", {
      tagName: element.tagName,
      id: element.id || "(no id)",
      class: element.className || "(no class)",
      ...additionalInfo
    });
    
    // Expose active input as a window variable for backward compatibility
    window.activeInput = element;
    
    // Notify popup about active input change if smart mode is enabled
    if (this.smartModeEnabled) {
      this.notifyActiveInputChanged(true, {
        type: element.tagName,
        id: element.id || "(no id)",
        className: element.className || "(no class)",
        ...additionalInfo
      });
    }
  },
  
  /**
   * Clear the active input tracking
   */
  clearActiveInput() {
    this.activeInput = null;
    window.activeInput = null;
    
    // Notify popup that no input is active
    if (this.smartModeEnabled) {
      this.notifyActiveInputChanged(false);
    }
  },
  
  /**
   * Get the current active input element
   * @returns {Element|null} The active input element or null
   */
  getActiveInput() {
    return this.activeInput;
  },
  
  /**
   * Check if there is a currently active input
   * @returns {boolean} True if there is an active input
   */
  hasActiveInput() {
    return this.activeInput !== null;
  },
  
  /**
   * Set whether smart mode is enabled
   * @param {boolean} enabled - Whether smart mode is enabled
   */
  setSmartModeEnabled(enabled) {
    this.smartModeEnabled = !!enabled;
  },
  
  /**
   * Send a message to the popup about active input changes
   * @param {boolean} hasActiveInput - Whether there is an active input
   * @param {Object} inputInfo - Information about the active input
   */
  notifyActiveInputChanged(hasActiveInput, inputInfo = null) {
    chrome.runtime.sendMessage({
      action: "activeInputChanged",
      hasActiveInput,
      inputInfo
    });
  }
};

// Expose the service as a global variable like other services
window.FocusTrackingService = FocusTrackingService;