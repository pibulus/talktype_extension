/**
 * Input Detection Service for TalkType Extension
 * 
 * A standalone service that finds, tracks, and observes text input elements
 * on web pages for the TalkType voice-to-text extension.
 */

// Create the service as a global object
const InputDetectionService = {
  /**
   * Initialize input detection to find all text input elements on the page
   */
  initializeInputDetection() {
    // Prevent duplicate initialization
    if (window.TalkTypeServices && window.TalkTypeServices.initStatus.input) {
      console.log("TalkType: Input detection already initialized, skipping");
      return;
    }
    
    console.log("TalkType: Initializing input detection (lazy mode)...");
    
    // Check if we're on Messenger to apply special handling
    const isMessenger = window.TalkTypeServices?.isMessenger || 
                      window.location.hostname.includes('messenger.com') || 
                      (window.location.hostname.includes('facebook.com') && 
                       window.location.pathname.includes('/messages'));
                       
    // For Messenger, be extra careful and use minimal detection
    if (isMessenger) {
      console.log("TalkType: Using minimal input detection for Messenger");
      
      // Just find basic inputs without extensive querying
      const standardInputs = document.querySelectorAll(
        'input[type="text"], textarea'
      );
      console.log(
        `TalkType: Found ${standardInputs.length} standard input elements on Messenger`
      );
      
      // Mark as initialized and return early for Messenger
      if (window.TalkTypeServices) {
        window.TalkTypeServices.initStatus.input = true;
      }
      
      return {
        standardInputs,
        clearTextInputs: [],
        chatInputs: []
      };
    }
    
    // For non-Messenger sites, do normal detection
    const standardInputs = document.querySelectorAll(
      'input[type="text"], input[type="search"], input:not([type]), textarea'
    );
    console.log(
      `TalkType: Found ${standardInputs.length} standard input elements`
    );

    // Look for elements with specific attributes that strongly suggest they are text inputs
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

    // No longer adding mic buttons to inputs, just tracking them for context menu support

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
    
    // Mark as initialized
    if (window.TalkTypeServices) {
      window.TalkTypeServices.initStatus.input = true;
    }
    
    return {
      standardInputs,
      clearTextInputs,
      chatInputs
    };
  },
  
  /**
   * Sets up a more targeted MutationObserver for input elements
   * with an improved performance approach for complex pages
   */
  observeDynamicInputs() {
    console.log("TalkType: Setting up targeted MutationObserver for dynamic inputs");
    
    // Prevent duplicate observers
    if (window.TalkTypeServices && window.TalkTypeServices.inputObserver) {
      console.log("TalkType: Using existing input observer");
      return window.TalkTypeServices.inputObserver;
    }
    
    // Create observer instance with more limited scope
    const inputObserver = new MutationObserver((mutations) => {
      // Skip processing if user isn't interacting with the page
      if (!document.hasFocus()) return;
      
      // Heavy debouncing for performance - only process mutations every 2 seconds on complex pages
      if (this._processingMutations) {
        return; // Skip if already processing mutations
      }
      
      // Set processing lock with longer timeout
      this._processingMutations = true;
      setTimeout(() => {
        this._processingMutations = false;
      }, 2000);
      
      // Check if this could be a messenger.com page which needs special handling
      const isMessenger = window.location.hostname.includes('messenger.com') || 
                         (window.location.hostname.includes('facebook.com') && 
                          window.location.pathname.includes('/messages'));
      
      // For Messenger, we'll use an even more conservative approach
      if (isMessenger) {
        // For Messenger, we'll rely primarily on focus events rather than mutation detection
        // This gives Messenger more room to initialize its own components
        return;
      }
      
      // Count how many nodes we process to avoid excessive CPU usage
      let nodesProcessed = 0;
      const MAX_NODES = 50; // Limit how many nodes we'll check per batch
      
      // Flag to track if we found any inputs
      let inputsAdded = false;
      
      // Process a limited number of mutations
      for (let i = 0; i < Math.min(mutations.length, 10); i++) {
        const mutation = mutations[i];
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          // Only process a limited number of added nodes
          for (let j = 0; j < Math.min(mutation.addedNodes.length, 5); j++) {
            const node = mutation.addedNodes[j];
            
            // Skip non-element nodes and limit total processed
            if (node.nodeType !== Node.ELEMENT_NODE || nodesProcessed++ > MAX_NODES) continue;
            
            // Check if the node itself is an input element - quick check
            if (node.matches && (
                node.matches('input[type="text"], textarea') ||
                node.matches('[role="textbox"], [contenteditable="true"]')
            )) {
              inputsAdded = true;
              break;
            }
            
            // Only check immediate children to reduce processing - one level deep
            if (node.children && node.children.length < 10) {  // Only if not too many children
              try {
                for (let k = 0; k < node.children.length; k++) {
                  const child = node.children[k];
                  if (child.matches && (
                    child.matches('input[type="text"], textarea') ||
                    child.matches('[role="textbox"], [contenteditable="true"]')
                  )) {
                    inputsAdded = true;
                    break;
                  }
                }
              } catch (e) {
                // Silently ignore errors during checking
              }
            }
            
            if (inputsAdded) break;
          }
        }
        if (inputsAdded) break;
      }
      
      // If new inputs were found, schedule a very delayed detection to not interfere with page load
      if (inputsAdded) {
        console.log("TalkType: New input elements detected, scheduling refresh");
        
        // Use a much longer delay for the initialization
        setTimeout(() => {
          // Only initialize if the document still has focus
          if (document.hasFocus()) {
            this.initializeInputDetection();
          }
        }, 1000);
      }
    });
    
    // Start observing a more limited part of the document
    // Prefer observing the body instead of documentElement for better performance
    const observeTarget = document.body || document.documentElement;
    inputObserver.observe(observeTarget, {
      childList: true,
      subtree: true
    });
    
    console.log("TalkType: Targeted dynamic input observation activated");
    
    // Store observer reference to prevent duplicates
    if (window.TalkTypeServices) {
      window.TalkTypeServices.inputObserver = inputObserver;
    }
    
    return inputObserver;
  },
  
  // Flag to prevent multiple simultaneous mutation processing
  _processingMutations: false,
  
  /**
   * Check if an element is a valid text input that can receive transcribed text
   * @param {Element} element - The element to check
   * @returns {boolean} True if the element is a valid text input
   */
  isValidTextInputElement(element) {
    if (!element) return false;

    // Get the computed style to check actual visibility
    const computedStyle = window.getComputedStyle(element);

    // Basic visibility checks
    if (
      computedStyle.display === "none" ||
      computedStyle.visibility === "hidden" ||
      parseFloat(computedStyle.opacity) < 0.1 ||
      element.offsetHeight === 0 ||
      element.offsetWidth === 0
    ) {
      return false;
    }

    // Check element type and attributes
    const tagName = element.tagName.toLowerCase();

    // Check for <input> with valid text types
    if (tagName === "input") {
      const inputType = (element.getAttribute("type") || "text").toLowerCase();
      const validTypes = [
        "text",
        "search",
        "email",
        "url",
        "tel",
        "number",
        "password",
        "date",
        "datetime-local",
        "time",
        "month",
        "week",
      ];

      // Only allow specific input types
      return (
        validTypes.includes(inputType) && !element.disabled && !element.readOnly
      );
    }

    // Check for <textarea>
    if (tagName === "textarea") {
      return !element.disabled && !element.readOnly;
    }

    // Check for contentEditable elements
    if (element.isContentEditable) {
      return true;
    }

    // Check for elements with role="textbox"
    if (
      element.getAttribute("role") === "textbox" &&
      element.getAttribute("aria-readonly") !== "true" &&
      element.getAttribute("aria-disabled") !== "true"
    ) {
      return true;
    }

    return false;
  },
  
  /**
   * Find special input fields for specific websites
   * @returns {NodeList} Collection of special input fields
   */
  findSpecialInputFields() {
    // Special selectors for site-specific inputs
    const specialInputSelectors = {
      gmail: [
        // Gmail compose box
        'div[contenteditable="true"][aria-label*="Message Body"]',
        'div[contenteditable="true"][aria-label*="compose"]',
      ],
      googleDocs: [
        // Google Docs main editor
        '.kix-appview-editor',
        '.docs-texteventtarget-iframe',
      ],
      slack: [
        // Slack message composer
        'div[contenteditable="true"][data-message-input="true"]',
        'div[role="textbox"][contenteditable="true"]',
      ],
      notion: [
        // Notion editor blocks
        'div[contenteditable="true"][placeholder="Type '/' for commands"]',
        'div[contenteditable="true"][spellcheck="true"]',
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
};

// Expose the service as a global variable like other services
window.InputDetectionService = InputDetectionService;