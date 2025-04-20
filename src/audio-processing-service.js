/**
 * Audio Processing Service for TalkType Extension
 * 
 * Handles the processing of audio data and transcription coordination,
 * working alongside the AudioRecordingService and GeminiApiService.
 */

class AudioProcessingService {
  constructor() {
    this.isProcessing = false;
    this.activeInput = null;
    this.recordingIndicator = null;
    this.apiKey = "";
  }

  /**
   * Start recording with a target input
   * @param {HTMLElement} targetInput - The input element to record for
   * @param {HTMLElement} indicator - Optional recording indicator element
   * @returns {Promise<void>}
   */
  async startRecording(targetInput, indicator) {
    console.log(
      "TalkType: Starting recording with services:",
      !!window.audioService,
      !!window.apiService
    );

    // If services aren't initialized, show a helpful error and try to initialize again
    if (!window.audioService || !window.apiService) {
      console.error("TalkType: Services not initialized!");

      // Show error notification
      window.showStatusNotification(
        "TalkType services not initialized. Reconnecting...",
        "error"
      );

      // Try to initialize directly with the simplified approach
      try {
        console.log("TalkType: Attempting to create services directly");

        // Create services directly if classes are available globally
        if (typeof window.AudioRecordingService !== "undefined") {
          window.audioService = new window.AudioRecordingService();
          console.log("TalkType: AudioRecordingService created directly");
        }

        if (typeof window.GeminiApiService !== "undefined") {
          // Get API key from storage synchronously to avoid async issues
          chrome.storage.sync.get(["apiKey"], (result) => {
            this.apiKey = result.apiKey || "";

            console.log(
              "TalkType: Creating API service with key:",
              this.apiKey ? "Valid key" : "Empty key"
            );
            window.apiService = new window.GeminiApiService(this.apiKey);

            console.log("TalkType: Services restored, retrying recording");
            window.showStatusNotification(
              "Services reconnected! Trying again...",
              "info"
            );

            // Now try recording again after a short delay
            setTimeout(() => {
              if (window.audioService && window.apiService && targetInput && indicator) {
                console.log(
                  "TalkType: Retrying recording with reconnected services"
                );
                this.startRecordingCore(targetInput, indicator);
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
      window.injectServiceScripts();

      // Show error message
      window.showStatusNotification(
        "Could not initialize TalkType. Please refresh the page or check your API key in options.",
        "error"
      );
      return;
    }

    // Continue with the core recording logic
    await this.startRecordingCore(targetInput, indicator);
  }

  /**
   * Core recording logic separated for reuse
   * @param {HTMLElement} targetInput - The input element to record for
   * @param {HTMLElement} indicator - Optional recording indicator element
   * @returns {Promise<void>}
   */
  async startRecordingCore(targetInput, indicator) {
    // Check if already recording
    if (window.isRecording) {
      console.log("TalkType: Already recording, ignoring start request");
      return;
    }

    try {
      // Comprehensive browser API debugging
      console.log("TalkType: Checking browser API support...");

      if (!navigator.mediaDevices) {
        console.error("TalkType: navigator.mediaDevices not available!");
        window.showStatusNotification(
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
      if (!window.audioService.isRecordingSupported()) {
        console.error(
          "TalkType: Recording not supported according to audioService"
        );
        window.showStatusNotification(
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
            window.showStatusNotification(
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
      window.isRecording = true;
      window.activeInput = targetInput;
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
      window.showStatusNotification("Recording... Click to stop", "recording");

      // Start recording with thorough error handling
      console.log("TalkType: Calling audioService.startRecording()...");
      try {
        await window.audioService.startRecording();
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
        window.showStatusNotification(
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
            window.showStatusNotification(
              "Mac users: Also check System Preferences → Security & Privacy → Microphone",
              "info"
            );
          }, 3000);
        }
      } else if (error.name === "NotFoundError") {
        window.showStatusNotification(
          "No microphone found. Please connect a microphone and try again.",
          "error"
        );
      } else if (
        error.name === "TypeError" &&
        error.message.includes("MediaRecorder")
      ) {
        window.showStatusNotification(
          "Your browser doesn't support audio recording. Try using Chrome or Edge.",
          "error"
        );
      } else {
        // Generic error with more details
        console.log("TalkType: General recording error:", error);
        window.showStatusNotification(`Recording error: ${error.message}`, "error");
      }

      // Reset state
      window.isRecording = false;
      window.activeInput = null;
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

  /**
   * Stop recording and process audio
   * @returns {Promise<void>}
   */
  async stopRecording() {
    console.log(
      "TalkType: stopRecording called, isRecording:",
      window.isRecording,
      "activeInput:",
      !!window.activeInput
    );

    if (!window.audioService) {
      console.error(
        "TalkType: Cannot stop recording - audioService is not initialized"
      );
      window.showStatusNotification("Error: Audio service not initialized", "error");
      return;
    }

    if (!window.isRecording) {
      console.error("TalkType: Cannot stop recording - not currently recording");
      window.showStatusNotification("Error: Not currently recording", "error");
      return;
    }

    if (!window.activeInput) {
      console.error("TalkType: Cannot stop recording - no active input");
      window.showStatusNotification("Error: No active input element", "error");
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
      window.showStatusNotification("Processing audio...", "processing");

      // Stop recording and get audio blob
      const audioBlob = await window.audioService.stopRecording();
      console.log(
        "TalkType: Recording stopped successfully, got audio blob:",
        !!audioBlob
      );

      // Update recording state immediately
      window.isRecording = false;

      // Get info about the current input element for debugging
      console.log("TalkType: Current activeInput:", window.activeInput);
      console.log("TalkType: activeInput type:", window.activeInput.tagName);
      if (window.activeInput.id)
        console.log("TalkType: activeInput id:", window.activeInput.id);

      // Store currentInput locally for processing
      const currentInput = window.activeInput;

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
        const progressNotification = window.createProgressNotification(
          "Transcribing audio..."
        );

        // Process the audio and get the transcription
        // Add callback to update progress bar during transcription
        const transcription = await transcriptionService.transcribeAudio(
          audioBlob,
          (status, percentage) => {
            if (progressNotification) {
              window.updateProgressNotification(progressNotification, percentage);
            }
          }
        );
        console.log("TalkType: Transcription received:", transcription);

        // Complete progress animation and show success notification
        if (progressNotification) {
          window.updateProgressNotification(progressNotification, 100);
          setTimeout(() => {
            if (document.body.contains(progressNotification)) {
              document.body.removeChild(progressNotification);
              window.showStatusNotification("Transcription complete!", "success");
            }
          }, 500);
        } else {
          window.showStatusNotification("Transcription complete!", "success");
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
      } catch (processingError) {
        console.error("TalkType: Error during audio processing:", processingError);
        window.showStatusNotification(
          "Error processing audio: " + processingError.message,
          "error"
        );
      }
    } catch (error) {
      console.error("TalkType: Error stopping recording:", error);
      window.showStatusNotification("Error stopping recording: " + error.message, "error");
    }
  }
}

// Expose the service as a global variable
window.AudioProcessingService = AudioProcessingService;