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
    console.log("TalkType: Initializing input detection...");

    // Track inputs for contextual features, but don't add mic buttons
    const standardInputs = document.querySelectorAll(
      'input[type="text"], input[type="search"], input:not([type]), textarea'
    );
    console.log(
      `TalkType: Found ${standardInputs.length} standard input elements`
    );

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
    
    return {
      standardInputs,
      clearTextInputs,
      chatInputs
    };
  },
  
  /**
   * Sets up a MutationObserver to detect and handle dynamically added input elements
   */
  observeDynamicInputs() {
    console.log("TalkType: Setting up MutationObserver for dynamic inputs");
    
    // Create observer instance to watch for new inputs
    const inputObserver = new MutationObserver((mutations) => {
      let inputsAdded = false;
      
      // Process DOM mutations
      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          // Check each added node for inputs or containers that might have inputs
          mutation.addedNodes.forEach((node) => {
            // Skip non-element nodes
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            
            // Check if the node itself is an input element
            if (node.matches && (
                node.matches('input[type="text"], input[type="search"], input:not([type]), textarea') ||
                node.matches('[role="textbox"], [contenteditable="true"]')
            )) {
              inputsAdded = true;
              return;
            }
            
            // Check for inputs inside the added node
            if (node.querySelectorAll) {
              const hasInputs = node.querySelectorAll(
                'input[type="text"], input[type="search"], input:not([type]), textarea, [role="textbox"], [contenteditable="true"]'
              ).length > 0;
              
              if (hasInputs) {
                inputsAdded = true;
              }
            }
          });
        }
      });
      
      // If new inputs were added, reinitialize input detection
      if (inputsAdded) {
        console.log("TalkType: New input elements detected, refreshing detection");
        this.initializeInputDetection();
      }
    });
    
    // Start observing the entire document with configured parameters
    inputObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    
    console.log("TalkType: Dynamic input observation activated");
    
    return inputObserver;
  },
  
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