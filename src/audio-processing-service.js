/**
 * Audio Processing Service for TalkType Extension
 * 
 * Handles the processing of audio data and transcription coordination,
 * working alongside the AudioRecordingService and GeminiApiService.
 */

class AudioProcessingService {
  constructor() {
    this.isProcessing = false;
    this.isRecording = false;
    this.activeInput = null;
    this.apiKey = "";
    
    // Register with ServiceRegistry if available
    this.registerWithServiceRegistry();
  }
  
  // Separate method for registration to ensure it runs both in constructor and on script load
  registerWithServiceRegistry() {
    if (window.ServiceRegistry) {
      console.log("TalkType: AudioProcessingService registering with ServiceRegistry");
      window.ServiceRegistry.register('AudioProcessingService', {
        factory: () => this,
        dependencies: ['AudioRecordingService', 'GeminiApiService', 'NotificationService'],
        lazy: false
      });
    } else {
      // Try again after a short delay if ServiceRegistry isn't available yet
      setTimeout(() => {
        if (window.ServiceRegistry) {
          console.log("TalkType: AudioProcessingService registering with ServiceRegistry (delayed)");
          window.ServiceRegistry.register('AudioProcessingService', {
            factory: () => this,
            dependencies: ['AudioRecordingService', 'GeminiApiService', 'NotificationService'],
            lazy: false
          });
        }
      }, 100);
    }
  }

  /**
   * Start recording with a target input
   * @param {HTMLElement} targetInput - The input element to record for
   * @returns {Promise<void>}
   */
  async startRecording(targetInput) {
    console.log(
      "TalkType: Starting recording with services:",
      !!window.audioService,
      !!window.apiService
    );

    // If services aren't initialized, show a helpful error and try to initialize again
    if (!window.audioService || !window.apiService) {
      console.error("TalkType: Services not initialized!");

      // Show error notification
      window.NotificationService.showStatusNotification(
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
            window.NotificationService.showStatusNotification(
              "Services reconnected! Trying again...",
              "info"
            );

            // Now try recording again after a short delay
            setTimeout(() => {
              if (window.audioService && window.apiService && targetInput) {
                console.log(
                  "TalkType: Retrying recording with reconnected services"
                );
                this.startRecordingCore(targetInput);
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
      window.NotificationService.showStatusNotification(
        "Could not initialize TalkType. Please refresh the page or check your API key in options.",
        "error"
      );
      return;
    }

    // Continue with the core recording logic
    await this.startRecordingCore(targetInput);
  }

  /**
   * Core recording logic separated for reuse
   * @param {HTMLElement} targetInput - The input element to record for
   * @returns {Promise<void>}
   */
  async startRecordingCore(targetInput) {
    // Check if already recording with validation of actual recorder state
    if (this.isRecording && window.audioService && window.audioService.mediaRecorder) {
      console.log("TalkType: Already recording, ignoring start request");
      return;
    }
    
    // Reset potentially incorrect recording state
    if (window.isRecording && (!window.audioService || !window.audioService.mediaRecorder)) {
      console.log("TalkType: Detected inconsistent recording state, resetting");
      window.isRecording = false;
      this.isRecording = false;
    }

    try {
      // Comprehensive browser API debugging
      console.log("TalkType: Checking browser API support...");

      if (!navigator.mediaDevices) {
        console.error("TalkType: navigator.mediaDevices not available!");
        window.NotificationService.showStatusNotification(
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
        window.NotificationService.showStatusNotification(
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
            window.NotificationService.showStatusNotification(
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

      // Update state - both instance and global
      this.isRecording = true;
      window.isRecording = true;
      // Set active input through the FocusTrackingService if available
      if (window.FocusTrackingService) {
        window.FocusTrackingService.setActiveInput(targetInput);
      } else {
        window.activeInput = targetInput; // Fallback for backward compatibility
      }
      console.log("TalkType: Set isRecording=true (instance and global), activeInput=", targetInput);

      // No longer showing recording indicator with mic buttons

      // Show enhanced listening notification - shorter text
      window.NotificationService.showStatusNotification("Recording... Click to stop", "recording");

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
        window.NotificationService.showStatusNotification(
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
            window.NotificationService.showStatusNotification(
              "Mac users: Also check System Preferences → Security & Privacy → Microphone",
              "info"
            );
          }, 3000);
        }
      } else if (error.name === "NotFoundError") {
        window.NotificationService.showStatusNotification(
          "No microphone found. Please connect a microphone and try again.",
          "error"
        );
      } else if (
        error.name === "TypeError" &&
        error.message.includes("MediaRecorder")
      ) {
        window.NotificationService.showStatusNotification(
          "Your browser doesn't support audio recording. Try using Chrome or Edge.",
          "error"
        );
      } else {
        // Generic error with more details
        console.log("TalkType: General recording error:", error);
        window.NotificationService.showStatusNotification(`Recording error: ${error.message}`, "error");
      }

      // Reset state - both instance and global
      this.isRecording = false;
      window.isRecording = false;
      // Clear active input through the FocusTrackingService if available
      if (window.FocusTrackingService) {
        window.FocusTrackingService.clearActiveInput();
      } else {
        window.activeInput = null; // Fallback for backward compatibility
      }
      console.log("TalkType: Reset recording state after error (instance and global)")

      // No longer using recording indicators or mic buttons

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
   * Insert text via clipboard - works with complex editors like Messenger's Lexical
   * @param {HTMLElement} element - The element to insert text into
   * @param {string} text - The text to insert
   * @returns {Promise<boolean>} - Whether insertion was successful
   */
  async insertTextViaClipboard(element, text) {
    if (!element || !text) return false;
    
    try {
      // Store the original clipboard content
      const originalClipboard = await navigator.clipboard.readText().catch(() => "");
      
      // Write the transcription to clipboard
      await navigator.clipboard.writeText(text);
      
      // Focus the element before pasting
      element.focus();
      
      // Try to select all content if it's an input or textarea
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.select();
      }
      
      // Execute paste command - this triggers the editor's native paste handler
      const pasteSuccess = document.execCommand('paste');
      
      // If execCommand paste failed, try triggering paste event with keyboard shortcut
      if (!pasteSuccess) {
        // Determine if Mac or Windows/Linux for the correct modifier key
        const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
        const ctrlKey = isMac ? false : true;
        const metaKey = isMac ? true : false;
        
        // Create and dispatch keydown events for Ctrl/Cmd+V
        element.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'v',
          code: 'KeyV',
          ctrlKey: ctrlKey,
          metaKey: metaKey,
          bubbles: true
        }));
        
        // A slight delay before keyup
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Create and dispatch keyup events
        element.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'v',
          code: 'KeyV',
          ctrlKey: ctrlKey,
          metaKey: metaKey,
          bubbles: true
        }));
      }
      
      // Dispatch input event to ensure React and other frameworks update
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Restore original clipboard after a short delay
      setTimeout(async () => {
        try {
          await navigator.clipboard.writeText(originalClipboard);
        } catch (e) {
          console.log("TalkType: Could not restore clipboard:", e);
        }
      }, 100);
      
      return true;
    } catch (e) {
      console.error("TalkType: Clipboard insertion failed:", e);
      return false;
    }
  }

  /**
   * Process raw audio data with direct API handling
   * @param {Blob} audioBlob - The audio blob to process
   * @param {HTMLElement} targetInput - The input element to insert transcription into
   * @returns {Promise<string>} - The transcription text
   */
  async processAudioData(audioBlob, targetInput) {
    if (!targetInput) {
      console.error("TalkType: No active input element provided");
      window.NotificationService.showStatusNotification("Error: No active input element", "error");
      return;
    }

    try {
      // Show processing indicator
      targetInput.classList.add("audio-to-text-processing");

      // Create a processing notification with glass morphism
      const processingNotification = window.NotificationService.showStatusNotification(
        "Transcribing...",
        "processing"
      );

      // Ensure we have a fresh API service with the latest key
      console.log("TalkType: Getting fresh API key for transcription");

      let apiKeyResponse;
      try {
        apiKeyResponse = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: "getApiKey" }, (response) => {
            if (chrome.runtime.lastError) {
              reject(
                new Error(
                  `Failed to get API key: ${chrome.runtime.lastError.message}`
                )
              );
              return;
            }
            resolve(response);
          });
        });
      } catch (keyError) {
        console.error("TalkType: Failed to get API key for transcription:", keyError);
        throw new Error("Failed to get API key. Please refresh the page and try again.");
      }

      if (!apiKeyResponse || !apiKeyResponse.apiKey) {
        console.error("TalkType: No API key found in background response");
        throw new Error("API key not found. Please set your API key in extension options.");
      }

      // Create a fresh API service with the latest key
      console.log("TalkType: Creating fresh API service for transcription");
      const freshApiService = new window.GeminiApiService(apiKeyResponse.apiKey);

      // Verify API key is valid
      console.log("TalkType: Verifying API key for transcription");
      const isValid = await freshApiService.verifyApiKey();
      if (!isValid) {
        console.error("TalkType: API key validation failed during transcription");
        throw new Error("Invalid API key. Please check settings.");
      }

      // Send audio to API for transcription
      console.log("TalkType: Starting transcription with verified API key");
      const transcription = await freshApiService.transcribeAudio(audioBlob);

      // Insert transcribed text based on element type
      if (targetInput.isContentEditable) {
        // For contentEditable elements
        targetInput.textContent = transcription;

        // Trigger input event for reactive frameworks
        targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (
        targetInput.tagName === "INPUT" ||
        targetInput.tagName === "TEXTAREA"
      ) {
        // For standard input/textarea elements
        targetInput.value = transcription;

        // Trigger input events to make sure any listeners are notified
        // This ensures that frameworks like React, Angular, etc. detect the change
        targetInput.dispatchEvent(new Event("input", { bubbles: true }));
        targetInput.dispatchEvent(new Event("change", { bubbles: true }));

        // If it's a textarea, resize appropriately
        if (
          targetInput.tagName.toLowerCase() === "textarea" &&
          targetInput.scrollHeight > targetInput.clientHeight
        ) {
          const originalHeight = targetInput.style.height;
          targetInput.style.height = "auto";
          targetInput.style.height = targetInput.scrollHeight + "px";

          // Reset after 1s to allow for any auto-resize scripts
          setTimeout(() => {
            if (originalHeight) {
              targetInput.style.height = originalHeight;
            }
          }, 1000);
        }

        // Focus the input and place cursor at the end
        targetInput.focus();

        // Set selection range if supported by this element
        if (typeof targetInput.setSelectionRange === "function") {
          targetInput.setSelectionRange(
            transcription.length,
            transcription.length
          );
        }
      } else {
        // Fallback for other elements - try innerText
        try {
          targetInput.innerText = transcription;
          targetInput.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (e) {
          console.error("TalkType: Unable to set text on element:", e);
        }
      }

      // Show simple success notification
      window.NotificationService.showStatusNotification("Transcription complete", "success");

      console.log("TalkType: Transcription complete:", transcription);
      return transcription;
    } catch (error) {
      console.error("TalkType: Transcription failed:", error);

      // Show error notification
      window.NotificationService.showStatusNotification(
        `❌ Transcription failed: ${error.message}`,
        "error"
      );
      throw error;
    } finally {
      // Remove processing indicator
      if (targetInput) {
        targetInput.classList.remove("audio-to-text-processing");
      }
    }
  }

  /**
   * Stop recording and process audio
   * @returns {Promise<void>}
   */
  async stopRecording() {
    console.log(
      "TalkType: stopRecording called, isRecording (instance):",
      this.isRecording,
      "isRecording (global):",
      window.isRecording,
      "activeInput:",
      !!window.activeInput
    );

    if (!window.audioService) {
      console.error(
        "TalkType: Cannot stop recording - audioService is not initialized"
      );
      window.NotificationService.showStatusNotification("Error: Audio service not initialized", "error");
      // Reset recording state to recover from errors
      this.isRecording = false;
      window.isRecording = false;
      return;
    }

    // Check for inconsistent state between recording flag and actual recorder
    if (window.isRecording && (!window.audioService.mediaRecorder)) {
      console.error("TalkType: Detected inconsistent recording state - flag is true but no active recorder");
      window.NotificationService.showStatusNotification("Resetting recording state", "warning");
      // Reset recording state
      this.isRecording = false;
      window.isRecording = false;
      return;
    }

    if (!this.isRecording && !window.isRecording) {
      console.error("TalkType: Cannot stop recording - not currently recording");
      window.NotificationService.showStatusNotification("Error: Not currently recording", "error");
      return;
    }

    // Get active input from the FocusTrackingService if available
    const activeInput = window.FocusTrackingService ? 
                        window.FocusTrackingService.getActiveInput() : 
                        window.activeInput;
                        
    if (!activeInput) {
      console.error("TalkType: Cannot stop recording - no active input");
      window.NotificationService.showStatusNotification("Error: No active input element", "error");
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
      window.NotificationService.showStatusNotification("Processing audio...", "processing");

      // Stop recording and get audio blob
      const audioBlob = await window.audioService.stopRecording();
      console.log(
        "TalkType: Recording stopped successfully, got audio blob:",
        !!audioBlob
      );

      // Update recording state immediately - both instance and global
      this.isRecording = false;
      window.isRecording = false;

      // Get the active input from FocusTrackingService if available
      const currentInput = window.FocusTrackingService ? 
                          window.FocusTrackingService.getActiveInput() : 
                          window.activeInput;

      // Get info about the current input element for debugging
      console.log("TalkType: Current activeInput:", currentInput);
      console.log("TalkType: activeInput type:", currentInput.tagName);
      if (currentInput.id)
        console.log("TalkType: activeInput id:", currentInput.id);

      // No longer using mic buttons or recording indicators

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

        // Get or create a transcription service using ServiceRegistry when available
        let transcriptionService;
        
        if (window.ServiceRegistry) {
          console.log("TalkType: Getting GeminiApiService from ServiceRegistry");
          transcriptionService = await Promise.resolve(window.ServiceRegistry.get('GeminiApiService'));
          
          // Update the API key with the fresh one
          if (transcriptionService) {
            transcriptionService.apiKey = apiKeyResult.apiKey;
          }
        } else if (window.apiService) {
          // Fallback to existing global instance
          console.log("TalkType: Using existing global apiService");
          transcriptionService = window.apiService;
          transcriptionService.apiKey = apiKeyResult.apiKey;
        } else if (typeof window.GeminiApiService === 'function') {
          // Last resort: direct instantiation if constructor is available
          console.log("TalkType: Creating GeminiApiService directly");
          transcriptionService = new window.GeminiApiService(apiKeyResult.apiKey);
        } else {
          throw new Error("GeminiApiService not available - cannot transcribe audio");
        }
        
        // Make sure the service is valid
        if (!transcriptionService) {
          throw new Error("Could not obtain transcription service");
        }

        // Show transcribing notification with progress bar
        const progressNotification = window.NotificationService.createProgressNotification(
          "Transcribing audio..."
        );

        // Process the audio and get the transcription
        // Add callback to update progress bar during transcription
        const transcription = await transcriptionService.transcribeAudio(
          audioBlob,
          (status, percentage) => {
            if (progressNotification) {
              window.NotificationService.updateProgressNotification(progressNotification, percentage);
            }
          }
        );
        console.log("TalkType: Transcription received:", transcription);

        // Complete progress animation and show success notification
        if (progressNotification) {
          window.NotificationService.updateProgressNotification(progressNotification, 100);
          setTimeout(() => {
            if (document.body.contains(progressNotification)) {
              document.body.removeChild(progressNotification);
              window.NotificationService.showStatusNotification("Transcription complete!", "success");
            }
          }, 500);
        } else {
          window.NotificationService.showStatusNotification("Transcription complete!", "success");
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

              // Special handling for Messenger's Lexical editor
              if (currentInput.getAttribute("data-lexical-editor") === "true") {
                console.log("TalkType: Detected Facebook Lexical editor, using typing simulation");
                
                // Get typing simulator through service registry if available
                let typingSimulator;
                if (window.ServiceRegistry) {
                  typingSimulator = await Promise.resolve(window.ServiceRegistry.get('TypingSimulatorService'));
                } else {
                  typingSimulator = window.typingSimulator;
                }
                
                if (typingSimulator) {
                  const typingSuccess = await typingSimulator.simulateTyping(currentInput, transcription, {
                    showVisualFeedback: true,
                    minDelay: 20,  // faster typing for better UX
                    maxDelay: 60
                  });
                  
                  if (typingSuccess) {
                    console.log("TalkType: Typing simulation successful for Lexical editor");
                    // Skip the standard events since typing simulation already fires them
                    return;
                  } else {
                    console.log("TalkType: Typing simulation failed, falling back to standard method");
                  }
                }
                
                // If typing simulation is not available or failed, try to focus
                currentInput.focus();
                currentInput.click();
              }

              // Dispatch events to notify frameworks of content changes
              currentInput.dispatchEvent(new Event("input", { bubbles: true }));
              currentInput.dispatchEvent(new Event("change", { bubbles: true }));

              console.log("TalkType: Inserted text into contenteditable element");
            } catch (e) {
              console.error("TalkType: Error inserting into contenteditable:", e);
              
              // Try typing simulation as a fallback
              console.log("TalkType: Trying typing simulation as fallback for contenteditable");
              
              // Get typing simulator through service registry if available
              let typingSimulator;
              if (window.ServiceRegistry) {
                typingSimulator = await Promise.resolve(window.ServiceRegistry.get('TypingSimulatorService'));
              } else {
                typingSimulator = window.typingSimulator;
              }
              
              if (typingSimulator) {
                const typingSuccess = await typingSimulator.simulateTyping(currentInput, transcription, {
                  showVisualFeedback: true,
                  minDelay: 15,  // faster for fallback case
                  maxDelay: 40
                });
                
                if (typingSuccess) {
                  console.log("TalkType: Typing simulation fallback successful");
                  return;
                }
              }
              
              // Last resort fallback to simple approach
              console.log("TalkType: All insertion methods failed, using textContent");
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
        window.NotificationService.showStatusNotification(
          "Error processing audio: " + processingError.message,
          "error"
        );
      }
    } catch (error) {
      console.error("TalkType: Error stopping recording:", error);
      window.NotificationService.showStatusNotification("Error stopping recording: " + error.message, "error");
    }
  }
}

// Expose the service as a global variable
window.AudioProcessingService = AudioProcessingService;

// Create an instance and register it to ensure it's available
window.audioProcessingService = new AudioProcessingService();

// Ensure registration happens after the script is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  if (window.audioProcessingService && typeof window.audioProcessingService.registerWithServiceRegistry === 'function') {
    console.log("TalkType: Ensuring AudioProcessingService is registered on DOMContentLoaded");
    window.audioProcessingService.registerWithServiceRegistry();
  }
});

// Also register on window load as a fallback
window.addEventListener('load', () => {
  if (window.audioProcessingService && typeof window.audioProcessingService.registerWithServiceRegistry === 'function') {
    console.log("TalkType: Ensuring AudioProcessingService is registered on window load");
    window.audioProcessingService.registerWithServiceRegistry();
  }
});