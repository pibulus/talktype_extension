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
   * Initialize focus tracking for contextual transcription with global initialization tracking
   */
  initialize() {
    // Check for existing initialization to prevent duplicates
    if (window.TalkTypeServices && window.TalkTypeServices.initStatus.focus) {
      console.log("TalkType: Focus tracking already initialized, skipping");
      return;
    }
    
    console.log("TalkType: Initializing enhanced focus tracking");
    
    // Detect if we're in Messenger and set global flag
    const isMessenger = window.location.hostname.includes('messenger.com') || 
                     (window.location.hostname.includes('facebook.com') && 
                      window.location.pathname.includes('/messages'));
    
    if (isMessenger) {
      console.log("TalkType: Messenger detected - using minimal focus tracking");
      if (window.TalkTypeServices) {
        window.TalkTypeServices.isMessenger = true;
      }
    }
    
    // Initial check - see if any element is already focused, with safe traversal
    try {
      const currentActive = this.getDeepActiveElement();
      
      // Only process if InputDetectionService is available
      if (currentActive && window.InputDetectionService && 
          window.InputDetectionService.isValidTextInputElement(currentActive)) {
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
    } catch (e) {
      console.log("TalkType: Error during initial focus check:", e);
    }

    // For Messenger, use only minimal essential tracking
    if (isMessenger) {
      // Just set up basic document focus listeners without shadow DOM or interval checking
      this.setupDocumentFocusListeners();
    } else {
      // For non-Messenger, use the full tracking suite
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
    }
    
    // Mark focus tracking as initialized
    if (window.TalkTypeServices) {
      window.TalkTypeServices.initStatus.focus = true;
    }
  },
  
  /**
   * Get the active element including shadow DOM traversal with safety limits
   * @returns {Element} The deepest active element
   */
  getDeepActiveElement() {
    // If we're in Messenger, use a very minimal approach to avoid interference
    const isMessenger = window.location.hostname.includes('messenger.com') || 
                       (window.location.hostname.includes('facebook.com') && 
                        window.location.pathname.includes('/messages'));
    
    // For Messenger, just return document.activeElement without traversal
    if (isMessenger) {
      return document.activeElement;
    }
    
    // For all other sites, use a safe approach with depth limiting
    let active = document.activeElement;
    
    // Set a safety counter to prevent potential infinite loops
    let maxDepth = 3; // Maximum shadow DOM nesting to check
    let currentDepth = 0;
    
    // Safely traverse shadow DOM trees with depth limiting
    try {
      while (active && active.shadowRoot && active.shadowRoot.activeElement && currentDepth < maxDepth) {
        active = active.shadowRoot.activeElement;
        currentDepth++;
      }
    } catch (e) {
      // If any error occurs during traversal, just return what we have so far
      console.log("TalkType: Error in shadow DOM traversal, using current element");
      return active;
    }
    
    // Handle the case where the active element is an iframe
    if (active && active.tagName === "IFRAME") {
      try {
        // Try to access iframe document (may fail due to cross-origin restrictions)
        const iframeDoc = active.contentDocument || active.contentWindow?.document;
        if (iframeDoc && iframeDoc.activeElement) {
          // Only use the iframe's active element if it's not the body
          if (iframeDoc.activeElement !== iframeDoc.body) {
            active = iframeDoc.activeElement;
          }
        }
      } catch (error) {
        // Silently fail for cross-origin iframes
        console.log("TalkType: Cannot access iframe content (cross-origin)");
      }
    }
    
    // Site-specific handling (without recursive checking)
    const hostname = window.location.hostname;
    
    // Special case for Google Docs
    if (hostname.includes("docs.google.com")) {
      const editor = document.querySelector(".kix-appview-editor");
      if (editor && active && !editor.contains(active)) {
        console.log("TalkType: Google Docs detected - using editor as target");
        active = editor;
      }
    }
    
    // Special case for Gmail - only if we're not already on a valid input
    if (hostname.includes("mail.google.com") || hostname.includes("gmail")) {
      // Only check if needed
      if (active === document.body || active === document.documentElement) {
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
   * Set up lightweight tracking for shadow DOM elements on demand with proper tracking
   */
  setupShadowDomTracking() {
    // Check if already initialized
    if (window.TalkTypeServices && window.TalkTypeServices.initStatus.shadowDOM) {
      console.log("TalkType: Shadow DOM tracking already initialized");
      return;
    }
    
    console.log("TalkType: Setting up on-demand shadow DOM tracking");
    
    // We're using a minimal approach that doesn't require heavy traversal
    // The getDeepActiveElement method now safely handles shadow DOM traversal
    // when it's actually needed
    
    // Mark as initialized to prevent duplicate setup
    if (window.TalkTypeServices) {
      window.TalkTypeServices.initStatus.shadowDOM = true;
    }
  },
  
  /**
   * Set up lightweight tracking for iframe elements with proper tracking
   */
  setupIframeTracking() {
    // Check for an existing event handler using a global flag
    if (window.TalkTypeServices && window.TalkTypeServices.iframeTrackerInitialized) {
      console.log("TalkType: Iframe tracking already initialized");
      return;
    }
    
    console.log("TalkType: Setting up on-demand iframe tracking");
    
    // For Messenger, reduce to minimal tracking
    const isMessenger = window.location.hostname.includes('messenger.com') || 
                      (window.location.hostname.includes('facebook.com') && 
                       window.location.pathname.includes('/messages'));
    
    if (!isMessenger) {
      // Only add click handler for non-Messenger sites
      // We'll rely on the getDeepActiveElement method to check iframes when needed
      const clickHandler = (event) => {
        // After a click, check if an iframe was clicked
        setTimeout(() => {
          try {
            const deepActive = this.getDeepActiveElement();
            if (deepActive && window.InputDetectionService && 
                window.InputDetectionService.isValidTextInputElement(deepActive)) {
              console.log("TalkType: Detecting text input after click (possible iframe):", deepActive);
              this.setActiveInput(deepActive);
            }
          } catch (e) {
            console.log("TalkType: Error in iframe click handler:", e);
          }
        }, 100);
      };
      
      // Add the handler and store it for potential cleanup
      document.addEventListener("click", clickHandler);
      
      // Store the handler reference
      if (window.TalkTypeServices) {
        window.TalkTypeServices.iframeClickHandler = clickHandler;
      }
    }
    
    // Mark as initialized to prevent duplicate setup
    if (window.TalkTypeServices) {
      window.TalkTypeServices.iframeTrackerInitialized = true;
    }
  },
  
  /**
   * Set up enhanced document-level focus event listeners
   */
  setupDocumentFocusListeners() {
    // Track focus events on the main document
    document.addEventListener("focusin", (event) => {
      // Get the deepest active element, which handles shadow DOM and iframes
      const deepActive = this.getDeepActiveElement();
      
      // Check if the deep active element is a valid text input
      if (deepActive && window.InputDetectionService.isValidTextInputElement(deepActive)) {
        console.log("TalkType: Text input focused (deep checking):", deepActive);
        this.setActiveInput(deepActive);
      } 
      // Fallback to the direct event target if needed
      else if (window.InputDetectionService.isValidTextInputElement(event.target)) {
        console.log("TalkType: Text input focused (event target):", event.target);
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
          // using getDeepActiveElement to handle shadow DOM and iframes
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
   * Set up reduced interval-based checking for active inputs with shared interval
   */
  setupIntervalChecking() {
    // Use a shared interval if possible
    if (window.TalkTypeServices && window.TalkTypeServices.focusCheckInterval) {
      console.log("TalkType: Using existing focus check interval");
      return;
    }
    
    // Create a lightweight interval with reduced frequency
    const checkInterval = setInterval(() => {
      // Only check if we don't already have an active input
      if (!this.activeInput) {
        const deepActive = this.getDeepActiveElement();
        
        // Only process if we found a valid text input
        if (deepActive && window.InputDetectionService.isValidTextInputElement(deepActive)) {
          console.log("TalkType: Detected focused element via interval check:", deepActive);
          this.setActiveInput(deepActive, { detectionMethod: "interval" });
        }
      }
    }, 3000); // Reduced frequency - check every 3 seconds instead of every second
    
    // Store the interval ID globally to prevent duplicates
    if (window.TalkTypeServices) {
      window.TalkTypeServices.focusCheckInterval = checkInterval;
    }
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