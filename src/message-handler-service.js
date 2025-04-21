/**
 * Message Handler Service for TalkType Extension
 * 
 * A standalone service that manages message communication between
 * extension components, including handling insertion of transcribed text.
 */

// Create the service as a global object
const MessageHandlerService = {
  // Keep track of processed request IDs to avoid duplication
  processedRequests: new Set(),

  /**
   * Initialize the message handler and set up listeners
   */
  initialize() {
    console.log("TalkType: Initializing MessageHandlerService");
    
    // Set up message listener if not already added
    if (!window.talkTypeMessageListenerAdded) {
      window.talkTypeMessageListenerAdded = true;
      this.setupMessageListener();
    }
  },
  
  /**
   * Set up the primary message listener
   */
  setupMessageListener() {
    // Listen for messages from the extension popup and background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("TalkType: Received message:", request);
      
      try {
        // EXCLUSIVE HANDLING: Context menu messages handled only by ContextMenuService
        if (request.action === "startTranscriptionFromContextMenu") {
          console.log("TalkType: Bypassing context menu message - ContextMenuService will handle it");
          
          // Just log receipt but DO NOT process further
          return false; // Exit immediately, allowing ContextMenuService to handle it exclusively
        }
        
        // EXCLUSIVE HANDLING: Context menu verification handled only by background script
        if (request.action === "verifyContextMenuExists") {
          console.log("TalkType: Bypassing context menu verification - background.js will handle it");
          return false; // Exit immediately, letting background.js handle it exclusively
        }
        
        // Handle other message types (non-context-menu related)
        switch(request.action) {
          case "insertTranscription":
            return this.handleInsertTranscription(request, sendResponse);
          
          case "confirmStopRecording":
            return this.handleConfirmStopRecording(request, sendResponse);
            
          case "stopRecording":
            return this.handleStopRecording(request, sendResponse);
            
          case "getActiveInput":
            return this.handleGetActiveInput(request, sendResponse);
            
          default:
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
  },

  /**
   * Handle request to insert transcription text into the focused input
   * @param {Object} request - The message request object
   * @param {Function} sendResponse - Function to send response back
   * @returns {boolean} - True to keep message port open
   */
  handleInsertTranscription(request, sendResponse) {
    // Check if this is a duplicate request we've already processed
    const requestId = request.requestId || "no-id";

    if (this.processedRequests.has(requestId)) {
      console.log("TalkType: Ignoring duplicate request:", requestId);
      sendResponse({
        success: false,
        error: "Duplicate request",
        isDuplicate: true,
      });
      return true;
    }

    // Add this request to our processed set
    this.processedRequests.add(requestId);

    // Cleanup old request IDs to prevent memory leaks (keep only last 10)
    if (this.processedRequests.size > 10) {
      const toRemove = Array.from(this.processedRequests).slice(
        0,
        this.processedRequests.size - 10
      );
      toRemove.forEach((id) => this.processedRequests.delete(id));
    }

    // Use our enhanced insertTextIntoField function for more robust insertion
    const result = this.insertTextIntoField(request.text, requestId);

    // Send response with detailed information
    sendResponse(result);
    return true; // Ensure we return true for async response
  },
  
  /**
   * Handle request to confirm stopping recording
   * @param {Object} request - The message request object
   * @param {Function} sendResponse - Function to send response back
   * @returns {boolean} - True to keep message port open
   */
  handleConfirmStopRecording(request, sendResponse) {
    // Background script is requesting confirmation for stopping recording
    const message = request.message || "Stop recording and transcribe the captured audio?";

    // Create a more descriptive confirmation dialog
    const confirmed = confirm(
      message + '\n\nSelecting "OK" will stop recording and transcribe what has been recorded so far.'
    );
    sendResponse(confirmed);
    return true;
  },
  
  /**
   * Handle request to stop recording
   * @param {Object} request - The message request object
   * @param {Function} sendResponse - Function to send response back
   * @returns {boolean} - True to keep message port open
   */
  handleStopRecording(request, sendResponse) {
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
  },
  
  /**
   * Handle request for the current active input element info
   * @param {Object} request - The message request object
   * @param {Function} sendResponse - Function to send response back
   * @returns {boolean} - True to keep message port open
   */
  handleGetActiveInput(request, sendResponse) {
    // Use FocusTrackingService if available, otherwise use global activeInput
    const activeInput = window.FocusTrackingService ? 
                        window.FocusTrackingService.getActiveInput() : 
                        window.activeInput;
                        
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
  },

  /**
   * Improved function for smart text insertion into any input
   * @param {string} text - The text to insert
   * @param {string} requestId - Unique ID to prevent duplicate processing
   * @returns {Object} - Result of the insertion operation
   */
  insertTextIntoField(text, requestId = "manual") {
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
        insertionHandled = this.insertIntoGoogleDocs(text);
        if (insertionHandled) insertionMethod = "google-docs";
      }

      // Gmail specific handler
      else if (
        window.location.hostname.includes("mail.google.com") ||
        window.location.hostname.includes("gmail")
      ) {
        insertionHandled = this.insertIntoGmail(text);
        if (insertionHandled) insertionMethod = "gmail";
      }
    }

    // Step 2: Try special web app inputs
    if (!insertionHandled) {
      const specialInputs = this.getSpecialWebAppInputs();
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
          if (this.insertIntoShadowDomInput(input, text)) {
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
      window.activeInput &&
      this.isValidAndAccessibleInput(window.activeInput)
    ) {
      try {
        window.activeInput.focus();

        if (
          window.activeInput.tagName === "TEXTAREA" ||
          (window.activeInput.tagName === "INPUT" &&
            (window.activeInput.type === "text" ||
              window.activeInput.type === "search" ||
              !window.activeInput.type))
        ) {
          // Standard inputs - use direct value insertion with cursor position awareness
          const currentValue = window.activeInput.value || "";
          const selStart = window.activeInput.selectionStart || currentValue.length;
          const selEnd = window.activeInput.selectionEnd || selStart;

          // Insert text at cursor position
          window.activeInput.value =
            currentValue.substring(0, selStart) +
            text +
            currentValue.substring(selEnd);

          // Move cursor to end of inserted text
          const newPosition = selStart + text.length;
          window.activeInput.setSelectionRange(newPosition, newPosition);

          window.activeInput.dispatchEvent(new Event("input", { bubbles: true }));

          insertionHandled = true;
          insertionMethod = "active-input-value";
        } else if (
          window.activeInput.isContentEditable ||
          window.activeInput.getAttribute("contenteditable") === "true"
        ) {
          // Try multiple methods for contentEditable
          // 1. execCommand
          if (document.execCommand("insertText", false, text)) {
            insertionHandled = true;
            insertionMethod = "active-input-execcommand";
          }
          // 2. Shadow DOM strategies if #1 fails
          else if (this.insertIntoShadowDomInput(window.activeInput, text)) {
            insertionHandled = true;
            insertionMethod = "active-input-shadow";
          }
        }
        // Handle iframe-based editors
        else if (window.activeInput.tagName === "IFRAME") {
          if (this.insertIntoIframe(window.activeInput, text)) {
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
      const fallbackInput = this.getDeepActiveElement(); // Use our enhanced function to get element from shadow DOM

      if (
        fallbackInput &&
        fallbackInput !== window.activeInput &&
        this.isValidAndAccessibleInput(fallbackInput)
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
            } else if (this.insertIntoShadowDomInput(fallbackInput, text)) {
              insertionHandled = true;
              insertionMethod = "fallback-input-shadow";
            }
          }
          // Handle iframe-based editors
          else if (fallbackInput.tagName === "IFRAME") {
            if (this.insertIntoIframe(fallbackInput, text)) {
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
            if (this.insertIntoIframe(editor, text)) {
              insertionHandled = true;
              insertionMethod = "last-resort-iframe";
            }
          } else if (document.execCommand("insertText", false, text)) {
            insertionHandled = true;
            insertionMethod = "last-resort-execcommand";
          } else if (this.insertIntoShadowDomInput(editor, text)) {
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
  },

  /**
   * Enhanced input validation that checks if the input is usable
   * @param {Element} element - The element to check
   * @returns {boolean} - Whether the element is valid and accessible
   */
  isValidAndAccessibleInput(element) {
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
  },

  /**
   * Helper function to get the deepest active element (traversing shadow DOM)
   * @returns {Element} - The deepest active element
   */
  getDeepActiveElement() {
    // Use FocusTrackingService if available
    if (window.FocusTrackingService) {
      return window.FocusTrackingService.getDeepActiveElement();
    }
    
    // Fallback to simple document.activeElement if FocusTrackingService not available
    return document.activeElement;
  },

  /**
   * Enhanced Shadow DOM handling function
   * @param {Element} input - The input element in shadow DOM
   * @param {string} text - Text to insert
   * @returns {boolean} - Whether insertion was successful
   */
  insertIntoShadowDomInput(input, text) {
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
  },

  /**
   * Special handler for iframe-based editors
   * @param {HTMLIFrameElement} iframe - The iframe element
   * @param {string} text - Text to insert
   * @returns {boolean} - Whether insertion was successful
   */
  insertIntoIframe(iframe, text) {
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
  },

  /**
   * Special handler for Google Docs
   * @param {string} text - Text to insert
   * @returns {boolean} - Whether insertion was successful
   */
  insertIntoGoogleDocs(text) {
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
  },

  /**
   * Special handler for Gmail
   * @param {string} text - Text to insert
   * @returns {boolean} - Whether insertion was successful
   */
  insertIntoGmail(text) {
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
  },

  /**
   * Function to get special web app inputs
   * @returns {NodeList} - Collection of special web app inputs
   */
  getSpecialWebAppInputs() {
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
};

// Expose the service as a global variable like other services
window.MessageHandlerService = MessageHandlerService;