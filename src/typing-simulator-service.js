/**
 * Typing Simulator Service
 *
 * Provides realistic keyboard typing simulation with visual feedback
 * for complex rich text editors like Facebook's Lexical editor.
 */

class TypingSimulatorService {
  constructor() {
    // Singleton protection
    if (window._typingSimulatorInstance) {
      return window._typingSimulatorInstance;
    }

    window._typingSimulatorInstance = this;

    // Register with ServiceRegistry if available
    this.registerWithServiceRegistry();

    console.log("TalkType: ✅ TypingSimulatorService initialized");
  }

  // Register with ServiceRegistry to ensure service is available
  registerWithServiceRegistry() {
    if (window.ServiceRegistry) {
      console.log(
        "TalkType: TypingSimulatorService registering with ServiceRegistry"
      );
      window.ServiceRegistry.register("TypingSimulatorService", {
        factory: () => this,
        dependencies: ["NotificationService"],
        lazy: false,
      });
    }
  }

  /**
   * Simulate keyboard typing with visual effects for rich text editors
   * @param {HTMLElement} element - The element to insert text into
   * @param {string} text - The text to insert
   * @param {Object} options - Optional configuration options
   * @returns {Promise<boolean>} - Whether insertion was successful
   */
  async simulateTyping(element, text, options = {}) {
    if (!element || !text) return false;

    const defaults = {
      showVisualFeedback: true,
      minDelay: 3, // milliseconds between characters (minimum)
      maxDelay: 9, // milliseconds between characters (maximum)
      initialDelay: 300, // milliseconds before typing starts
      finalDelay: 500, // milliseconds after typing completes
    };

    const config = { ...defaults, ...options };
    let typingIndicator = null;

    try {
      // Show typing indicator if visual feedback is enabled
      if (config.showVisualFeedback) {
        typingIndicator = this.createTypingIndicator();
      }

      // Make sure element is focused before typing
      element.focus();
      element.click();

      // Wait for initial delay
      await new Promise((resolve) => setTimeout(resolve, config.initialDelay));

      // Process each character with a realistic delay
      for (let i = 0; i < text.length; i++) {
        const char = text[i];

        // Update the typing indicator with current character
        if (typingIndicator) {
          this.updateTypingIndicator(typingIndicator, char);
        }

        // Generate the key information
        const keyInfo = this.getKeyInfoForChar(char);

        // Dispatch a sequence of events for each character
        await this.typeCharacter(element, char, keyInfo);

        // Calculate random delay for realistic typing speed
        const delay =
          Math.floor(Math.random() * (config.maxDelay - config.minDelay + 1)) +
          config.minDelay;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Dispatch final events after all characters
      element.dispatchEvent(new Event("change", { bubbles: true }));

      // Wait for final delay
      await new Promise((resolve) => setTimeout(resolve, config.finalDelay));

      // Remove the typing indicator
      if (typingIndicator) {
        this.removeTypingIndicator(typingIndicator);
      }

      return true;
    } catch (e) {
      console.error("TalkType: Typing simulation failed:", e);

      // Remove the typing indicator if there was an error
      if (typingIndicator) {
        this.removeTypingIndicator(typingIndicator);
      }

      return false;
    }
  }

  /**
   * Type a single character with all associated events
   * @param {HTMLElement} element - The element to type into
   * @param {string} char - The character to type
   * @param {Object} keyInfo - Key information for the character
   */
  async typeCharacter(element, char, keyInfo) {
    // 1. KeyDown Event
    const keyDownEvent = new KeyboardEvent("keydown", {
      key: keyInfo.key,
      code: keyInfo.code,
      keyCode: keyInfo.keyCode,
      which: keyInfo.keyCode,
      bubbles: true,
      cancelable: true,
      view: window,
      composed: true,
    });
    element.dispatchEvent(keyDownEvent);

    // 2. BeforeInput Event (modern editors use this)
    const beforeInputEvent = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: char,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    element.dispatchEvent(beforeInputEvent);

    // 3. For contenteditable, use execCommand which many editors support
    if (element.isContentEditable) {
      document.execCommand("insertText", false, char);
    } else if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      // For standard form elements, insert at current selection
      const start = element.selectionStart || 0;
      const end = element.selectionEnd || start;
      const value = element.value || "";

      // Update the value
      element.value = value.substring(0, start) + char + value.substring(end);

      // Move the selection
      element.selectionStart = element.selectionEnd = start + 1;
    }

    // 4. Input Event
    const inputEvent = new InputEvent("input", {
      inputType: "insertText",
      data: char,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    element.dispatchEvent(inputEvent);

    // 5. KeyUp Event
    const keyUpEvent = new KeyboardEvent("keyup", {
      key: keyInfo.key,
      code: keyInfo.code,
      keyCode: keyInfo.keyCode,
      which: keyInfo.keyCode,
      bubbles: true,
      cancelable: true,
      view: window,
      composed: true,
    });
    element.dispatchEvent(keyUpEvent);
  }

  /**
   * Create a visual typing indicator overlay
   * @returns {HTMLElement} The created indicator element
   */
  createTypingIndicator() {
    // Remove any existing indicators
    const existingIndicator = document.getElementById(
      "talktype-typing-indicator"
    );
    if (existingIndicator && existingIndicator.parentNode) {
      existingIndicator.parentNode.removeChild(existingIndicator);
    }

    // Create container for the typing indicator
    const indicator = document.createElement("div");
    indicator.id = "talktype-typing-indicator";
    indicator.style.cssText = `
      position: fixed;
      bottom: 120px;
      right: 40px;
      z-index: 2147483646;
      background: linear-gradient(135deg, rgba(111, 66, 193, 0.85), rgba(70, 174, 247, 0.75));
      color: white;
      padding: 12px 20px;
      border-radius: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      transition: all 0.3s ease;
      opacity: 0;
      transform: translateY(20px);
    `;

    // Add keyboard icon
    const keyboardIcon = document.createElement("div");
    keyboardIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="6" width="20" height="12" rx="2" stroke="white" stroke-width="2"/>
      <rect x="6" y="10" width="2" height="2" rx="0.5" fill="white"/>
      <rect x="10" y="10" width="2" height="2" rx="0.5" fill="white"/>
      <rect x="14" y="10" width="2" height="2" rx="0.5" fill="white"/>
      <rect x="6" y="14" width="12" height="2" rx="0.5" fill="white"/>
    </svg>`;
    indicator.appendChild(keyboardIcon);

    // Add text container
    const textContainer = document.createElement("div");
    textContainer.style.cssText = `
      margin-left: 12px;
      display: flex;
      flex-direction: column;
    `;

    // Add label
    const label = document.createElement("div");
    label.textContent = "TalkType is typing";
    label.style.fontWeight = "600";
    textContainer.appendChild(label);

    // Add character display
    const charDisplay = document.createElement("div");
    charDisplay.id = "talktype-typing-char";
    charDisplay.style.cssText = `
      font-family: monospace;
      font-size: 16px;
      height: 20px;
      opacity: 0.9;
    `;
    textContainer.appendChild(charDisplay);

    indicator.appendChild(textContainer);
    document.body.appendChild(indicator);

    // Animate in
    setTimeout(() => {
      indicator.style.opacity = "1";
      indicator.style.transform = "translateY(0)";
    }, 10);

    return indicator;
  }

  /**
   * Update the typing indicator with the current character
   * @param {HTMLElement} indicator - The typing indicator element
   * @param {string} char - The character being typed
   */
  updateTypingIndicator(indicator, char) {
    if (!indicator) return;

    const charDisplay = indicator.querySelector("#talktype-typing-char");
    if (!charDisplay) return;

    // Display special characters in a readable way
    let displayChar = char;
    if (char === " ") displayChar = "␣";
    if (char === "\n") displayChar = "↵";
    if (char === "\t") displayChar = "⇥";

    // Add pulse animation
    charDisplay.textContent = displayChar;
    charDisplay.animate(
      [
        { transform: "scale(1.4)", opacity: "1" },
        { transform: "scale(1)", opacity: "0.8" },
      ],
      {
        duration: 150,
        easing: "ease-out",
      }
    );

    // Also pulse the whole indicator subtly
    indicator.animate(
      [
        { boxShadow: "0 4px 25px rgba(111, 66, 193, 0.5)" },
        { boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)" },
      ],
      {
        duration: 200,
        easing: "ease-out",
      }
    );
  }

  /**
   * Remove the typing indicator
   * @param {HTMLElement} indicator - The typing indicator to remove
   */
  removeTypingIndicator(indicator) {
    if (!indicator) return;

    // Animate out and then remove
    indicator.style.opacity = "0";
    indicator.style.transform = "translateY(20px)";

    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 300);
  }

  /**
   * Get key information for a character
   * @param {string} char - The character to get key info for
   * @returns {Object} Key information including key, code and keyCode
   */
  getKeyInfoForChar(char) {
    // Default key information
    let key = char;
    let code = `Key${char.toUpperCase()}`;
    let keyCode = char.charCodeAt(0);

    // Handle special cases
    if (char === " ") {
      key = " ";
      code = "Space";
      keyCode = 32;
    } else if (char === "\n") {
      key = "Enter";
      code = "Enter";
      keyCode = 13;
    } else if (char === "\t") {
      key = "Tab";
      code = "Tab";
      keyCode = 9;
    } else if (char.match(/[0-9]/)) {
      code = `Digit${char}`;
    } else if (char.match(/[^a-zA-Z0-9]/)) {
      // Special characters have various codes
      code = "Unidentified";
    }

    return { key, code, keyCode };
  }

  /**
   * Detect if an element is a Lexical editor
   * @param {HTMLElement} element - The element to check
   * @returns {boolean} - Whether the element is a Lexical editor
   */
  isLexicalEditor(element) {
    if (!element) return false;
    return element.getAttribute("data-lexical-editor") === "true";
  }
}

// Expose the service globally
window.TypingSimulatorService = TypingSimulatorService;

// Create an instance for immediate availability
window.typingSimulator = new TypingSimulatorService();
