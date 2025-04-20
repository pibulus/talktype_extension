/**
 * Microphone Button Manager Service for TalkType Extension
 * 
 * A standalone service that handles creation, positioning, styling, and interaction
 * of microphone buttons for the TalkType voice-to-text extension.
 */

// Create the service as a global object
const MicButtonManager = {
  /**
   * Add microphone icon to an input element
   * @param {HTMLElement} inputElement - The input element to add a mic button to
   * @returns {HTMLElement} The created microphone button
   */
  addMicrophoneToInput(inputElement) {
    // Reduce console logging to avoid spam
    // console.log('TalkType: Adding microphone to input element:', inputElement);

    // CRITICAL: Perform strict validation to ensure this is really a text input element
    if (!window.InputDetectionService.isValidTextInputElement(inputElement)) {
      console.log(
        "TalkType: Element is not a valid text input, skipping:",
        inputElement
      );
      return null;
    }

    // Check if this input already has a microphone button
    if (inputElement.dataset.hasMicButton) {
      console.log("TalkType: Input already has mic button, skipping");
      return null;
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
      if (!window.isRecording || window.activeInput !== inputElement) {
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
        window.isRecording
      );

      // Visual feedback - always show something when clicked
      micButton.style.transform = "scale(1.1)";

      try {
        // SIMPLIFIED LOGIC: Just toggle based on recording state
        if (window.isRecording) {
          // We're recording, so stop it and process
          console.log("TalkType: Stopping recording...");
          window.showStatusNotification("Processing recording...", "info");

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
          await window.stopRecording(); // Make sure we await this
        } else {
          // Not recording, start a new recording
          console.log("TalkType: Starting new recording...");
          window.showStatusNotification("Recording", "recording");

          // Set active input element as a global target
          window.activeInput = inputElement;

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
            if (!window.audioService || !window.apiService) {
              console.log(
                "TalkType: Services not initialized, initializing now..."
              );
              window.showStatusNotification("Initializing TalkType...", "processing");

              // Initialize directly with storage API key
              await new Promise((resolve) => {
                chrome.storage.sync.get(["apiKey"], function (result) {
                  if (result && result.apiKey) {
                    window.apiKey = result.apiKey;

                    // Create services directly
                    window.audioService = new window.AudioRecordingService();
                    window.apiService = new window.GeminiApiService(window.apiKey);

                    console.log("TalkType: Services initialized directly");
                    resolve();
                  } else {
                    console.error("TalkType: No API key found in storage");
                    window.showStatusNotification(
                      "Please set your API key in extension options",
                      "error"
                    );
                    resolve(); // Resolve anyway to continue
                  }
                });
              });

              // Verify services were created
              if (!window.audioService || !window.apiService) {
                console.error("TalkType: Failed to initialize services!");
                window.showStatusNotification(
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
            await window.startRecording(inputElement, recordingIndicator);

            console.log("TalkType: Recording started successfully");
          } catch (error) {
            console.error("TalkType: Error starting recording:", error);
            window.showStatusNotification(
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
        window.showStatusNotification("Error: " + error.message, "error");

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
      this.positionMicButton(inputElement, micButton);
    });

    // No need to hide on blur anymore, we keep it visible

    // Position the button appropriately based on the input element
    this.positionMicButton(inputElement, micButton);

    // Listen for input resize (if ResizeObserver is available)
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        this.positionMicButton(inputElement, micButton);
      });
      resizeObserver.observe(inputElement);
    }

    // Listen for input position changes
    window.addEventListener("resize", () => {
      this.positionMicButton(inputElement, micButton);
    });

    // Update position when input changes visibility
    const observer = new MutationObserver(() => {
      this.positionMicButton(inputElement, micButton);
    });
    observer.observe(inputElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    return micButton;
  },

  /**
   * Position microphone button correctly relative to input
   * @param {HTMLElement} inputElement - The input element
   * @param {HTMLElement} micButton - The microphone button
   */
  positionMicButton(inputElement, micButton) {
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
};

// Expose the service as a global variable like other services
window.MicButtonManager = MicButtonManager;