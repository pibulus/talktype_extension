// Popup script
// Notifications have been refactored to use the NotificationService

// Global variables
let audioService = null;
let apiService = null;
let audioVisualizer = null;
let isRecording = false;
let recordingTimeout = null;
let activeTabInput = null; // Track active input on the current tab
let contextualMode = false; // Flag for contextual transcription mode
let autoRecordEnabled = false; // Flag for auto-record on popup open
let stopRecordingConfirmationNeeded = false; // Flag to control confirmation dialog
const MAX_RECORDING_TIME = 30000; // 30 seconds

// Extension icon states
const ICON_STATE = {
  IDLE: "idle", // Default state
  RECORDING: "recording", // When actively recording
  AUTO_RECORD: "auto_record", // When auto-record is enabled
};

// Check if API key is set
async function checkApiKey() {
  const apiKey = await window.SettingsService.getApiKey();
  const apiKeyError = document.getElementById("apiKeyError");
  const recordButton = document.getElementById("startRecording");

  if (!apiKey) {
    apiKeyError.style.display = "block";
    recordButton.classList.add("disabled");
    recordButton.disabled = true;
    return false;
  } else {
    apiKeyError.style.display = "none";
    recordButton.classList.remove("disabled");
    recordButton.disabled = false;
    return true;
  }
}

// Check if auto-record is enabled
async function checkAutoRecord() {
  try {
    autoRecordEnabled = await window.SettingsService.isAutoRecordEnabled();
    console.log("Auto-record enabled:", autoRecordEnabled);

    // Update UI to reflect current setting
    const autoRecordBadge = document.getElementById("auto-record-badge");
    if (autoRecordBadge) {
      autoRecordBadge.style.display = "flex";
      if (autoRecordEnabled) {
        autoRecordBadge.classList.add("active");
        autoRecordBadge.querySelector(".auto-record-tooltip span").textContent =
          "Auto-record enabled";

        // Update icon if not recording
        if (!isRecording) {
          updateExtensionIcon(ICON_STATE.AUTO_RECORD);
        }
      } else {
        autoRecordBadge.classList.remove("active");
        autoRecordBadge.querySelector(".auto-record-tooltip span").textContent =
          "Auto-record disabled";

        // Update icon if not recording
        if (!isRecording) {
          updateExtensionIcon(ICON_STATE.IDLE);
        }
      }
    }

    return autoRecordEnabled;
  } catch (error) {
    console.error("Error checking auto-record setting:", error);
    return false;
  }
}

// Toggle auto-record setting
async function toggleAutoRecord() {
  try {
    await window.SettingsService.toggleAutoRecord();
    autoRecordEnabled = await window.SettingsService.isAutoRecordEnabled();

    // Update UI
    await checkAutoRecord();

    // Update extension icon based on current state
    if (isRecording) {
      // If we're recording, keep showing recording icon
      updateExtensionIcon(ICON_STATE.RECORDING);
    } else {
      // Otherwise show auto-record or idle icon
      updateExtensionIcon(
        autoRecordEnabled ? ICON_STATE.AUTO_RECORD : ICON_STATE.IDLE
      );
    }

    // Show feedback
    window.NotificationService.showPopupNotification(
      `Auto-record ${autoRecordEnabled ? "enabled" : "disabled"}`,
      "info"
    );

    return autoRecordEnabled;
  } catch (error) {
    console.error("Error toggling auto-record:", error);
    window.NotificationService.showPopupNotification(
      "Failed to update setting",
      "error"
    );
    return false;
  }
}

// Check if context menu is enabled
async function checkContextMenu() {
  try {
    const contextMenuEnabled =
      await window.SettingsService.isContextMenuEnabled();
    console.log("Context menu enabled:", contextMenuEnabled);

    // Update UI to reflect current setting
    const contextMenuBadge = document.getElementById("context-menu-badge");
    if (contextMenuBadge) {
      contextMenuBadge.style.display = "flex";
      if (contextMenuEnabled) {
        contextMenuBadge.classList.add("active");
        contextMenuBadge.querySelector(
          ".context-menu-tooltip span"
        ).textContent = "Right-click menu enabled";
      } else {
        contextMenuBadge.classList.remove("active");
        contextMenuBadge.querySelector(
          ".context-menu-tooltip span"
        ).textContent = "Right-click menu disabled";
      }
    }

    return contextMenuEnabled;
  } catch (error) {
    console.error("Error checking context menu setting:", error);
    return true; // Default to enabled
  }
}

// Toggle context menu setting
async function toggleContextMenu() {
  try {
    await window.SettingsService.toggleContextMenu();
    const contextMenuEnabled =
      await window.SettingsService.isContextMenuEnabled();

    // Update UI
    await checkContextMenu();

    // Show feedback
    window.NotificationService.showPopupNotification(
      `Context menu ${contextMenuEnabled ? "enabled" : "disabled"}`,
      "info"
    );

    return contextMenuEnabled;
  } catch (error) {
    console.error("Error toggling context menu:", error);
    window.NotificationService.showPopupNotification(
      "Failed to update setting",
      "error"
    );
    return false;
  }
}

// Open options page
function openOptions() {
  chrome.runtime.openOptionsPage();
}

// Open about page
function openAbout() {
  chrome.tabs.create({ url: chrome.runtime.getURL("about.html") });
}

// Update extension icon to reflect the current state
function updateExtensionIcon(state = ICON_STATE.IDLE) {
  try {
    let iconPath = {};
    let badgeText = "";
    let badgeColor = "#FFFFFF";

    switch (state) {
      case ICON_STATE.RECORDING:
        // Red icon for recording state
        iconPath = {
          16: "icons/icon_recording/favicon-16x16.png",
          32: "icons/icon_recording/favicon-32x32.png",
          48: "icons/icon_recording/android-icon-48x48.png",
          128: "icons/icon_recording/android-icon-144x144.png",
        };
        badgeText = "●";
        badgeColor = "#d32f2f"; // Red badge
        break;

      case ICON_STATE.AUTO_RECORD:
        // Blue icon for auto-record mode
        // Using standard icons with a blue badge for now
        iconPath = {
          16: "icons/icon_white/favicon-16x16.png",
          32: "icons/icon_white/favicon-32x32.png",
          48: "icons/icon_white/android-icon-48x48.png",
          128: "icons/icon_white/android-icon-144x144.png",
        };
        badgeText = "A";
        badgeColor = "#2196F3"; // Blue badge
        break;

      default: // ICON_STATE.IDLE
        // Default icon (white/black based on theme)
        iconPath = {
          16: "icons/icon_white/favicon-16x16.png",
          32: "icons/icon_white/favicon-32x32.png",
          48: "icons/icon_white/android-icon-48x48.png",
          128: "icons/icon_white/android-icon-144x144.png",
        };
        badgeText = "";
        break;
    }

    // Update the extension icon
    chrome.action.setIcon({ path: iconPath });

    // Update badge
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });

    console.log(`Extension icon updated to ${state} state`);
  } catch (error) {
    console.error("Error updating extension icon:", error);
  }
}

// Start recording immediately
async function startRecording() {
  if (isRecording) return;

  // Show transcription area
  const transcriptionContainer = document.getElementById(
    "transcription-container"
  );
  transcriptionContainer.style.display = "block";
  const transcriptionText = document.getElementById("transcription-text");
  transcriptionText.textContent = "";
  transcriptionText.style.display = "none"; // Hide text container while visualizer is active

  // Reset any previous editable state
  transcriptionText.style.pointerEvents = "none";
  transcriptionText.setAttribute("contenteditable", "false");

  // We no longer need special animation on recording start
  // The original animation looks good as is

  // Start audio visualizer
  if (audioVisualizer) {
    audioVisualizer.start();
  }

  // Hide copy button when starting a new recording
  const copyButtonWrapper = document.getElementById("copy-button-wrapper");
  if (copyButtonWrapper) {
    copyButtonWrapper.style.display = "none";
  }

  // Update status
  const statusElement = document.getElementById("status");
  const recordButton = document.getElementById("startRecording");

  try {
    // Check if API key is set
    const hasApiKey = await checkApiKey();
    if (!hasApiKey) {
      statusElement.innerHTML = `
        <div class="error-message">
          <svg class="icon" style="color: #ff5252" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
          </svg>
          <span>Please set your API key first</span>
        </div>
      `;
      return;
    }

    // Initialize service if not already done
    if (!audioService) {
      audioService = new AudioRecordingService();
    }

    // Check recording support
    if (!audioService.isRecordingSupported()) {
      statusElement.innerHTML = `
        <div class="error-message">
          <svg class="icon" style="color: #ff5252" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
          </svg>
          <span>Browser doesn't support recording</span>
        </div>
      `;
      return;
    }

    // Show animation
    const recordingAnimation = document.getElementById("recording-animation");
    recordingAnimation.classList.add("active");

    // Update button
    recordButton.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
      </svg>
      Stop Recording
    `;

    // Update status
    statusElement.innerHTML = `
      <div class="status-indicator status-recording">
        <span class="pulse-dot"></span>
        <span class="status-text">Recording...</span>
      </div>
    `;

    // Hide settings button while recording
    const settingsButton = document.getElementById("options");
    if (settingsButton) {
      settingsButton.style.display = "none";
    }

    // Start recording
    await audioService.startRecording();
    isRecording = true;
    stopRecordingConfirmationNeeded = true; // Enable confirmation dialog for stopping recording

    // Update extension icon to recording state
    updateExtensionIcon(ICON_STATE.RECORDING);

    // Notify background script about recording state
    chrome.runtime.sendMessage({
      action: "updateRecordingState",
      isRecording: true,
    });

    // Auto-stop after MAX_RECORDING_TIME
    recordingTimeout = setTimeout(() => {
      if (isRecording) {
        stopRecording(false); // Don't need confirmation for auto-stop
      }
    }, MAX_RECORDING_TIME);
  } catch (error) {
    console.error("Error starting recording:", error);
    handleRecordingError(error);
  }
}

// Notification functions have been refactored to use NotificationService

// Stop recording and transcribe
async function stopRecording(showConfirmation = true) {
  // Check if we need to show confirmation
  if (showConfirmation && stopRecordingConfirmationNeeded) {
    // Display confirmation dialog
    if (!confirm("Are you sure you want to stop recording?")) {
      // User clicked cancel, don't stop recording
      console.log("Recording stop cancelled by user");
      return;
    }
  }

  // Reset confirmation flag
  stopRecordingConfirmationNeeded = false;

  if (!isRecording || !audioService) return;

  // Clear timeout
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  const statusElement = document.getElementById("status");
  const recordButton = document.getElementById("startRecording");
  const recordingAnimation = document.getElementById("recording-animation");
  const transcriptionText = document.getElementById("transcription-text");

  // Stop audio visualizer
  if (audioVisualizer) {
    audioVisualizer.stop();
  }

  try {
    // Hide recording animation
    recordingAnimation.classList.remove("active");

    // Update status indicator with a random fun message
    const randomMessage = window.UIProgressManager.getRandomProcessingMessage();
    statusElement.innerHTML = `<div class="status-indicator status-processing"><span class="pulse-dot"></span><span class="status-text">${randomMessage}...</span></div>`;

    // Stop recording and get audio data
    const audioBlob = await audioService.stopRecording();
    isRecording = false;

    // Set icon back to normal or auto-record state
    updateExtensionIcon(
      autoRecordEnabled ? ICON_STATE.AUTO_RECORD : ICON_STATE.IDLE
    );

    // Notify background script about recording state
    chrome.runtime.sendMessage({
      action: "updateRecordingState",
      isRecording: false,
    });

    // Transform recording button into progress bar
    window.UIProgressManager.transformButtonToProgressBar(recordButton);

    // Get API key and create fresh service instance to avoid 404 errors
    const { apiKey } = await chrome.storage.sync.get(["apiKey"]);

    // Create a new API service instance to prevent stale state
    apiService = null;
    apiService = new GeminiApiService(apiKey);

    // Verify API key with our enhanced validation
    const keyValidation = await apiService.verifyApiKey();
    if (!keyValidation.valid) {
      throw new Error(
        keyValidation.displayMessage ||
          "Invalid API key. Please check your key in Options."
      );
    }

    // Update status indicator with random fun messages
    window.UIProgressManager.showTranscribingStatus(statusElement, true);

    // Actually transcribe the audio using retry mechanism
    const transcription = await apiService.transcribeAudioWithRetry(
      audioBlob,
      window.UIProgressManager.updateProgressCallback
    );

    // Complete the progress animation
    window.UIProgressManager.completeProgressAnimation();

    // Handle transcription based on mode
    if (contextualMode && activeTabInput) {
      // In contextual mode, send transcription to the active input in the tab
      try {
        // Get the current active tab
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tabs || tabs.length === 0) throw new Error("No active tab found");

        const currentTab = tabs[0];

        // Only send the message once - this is the first point where we might get duplicate insertion
        console.log("Sending single insertion request to tab");

        // Send message to content script to insert transcription - with timeout to ensure response
        const insertResult = await Promise.race([
          chrome.tabs.sendMessage(currentTab.id, {
            action: "insertTranscription",
            text: transcription,
            requestId: Date.now(), // Add unique request ID to prevent duplicate processing
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Tab message timeout")), 5000)
          ),
        ]);

        console.log("Insertion result:", insertResult);

        // Still copy to clipboard for convenience
        if (transcription && transcription.trim()) {
          try {
            await navigator.clipboard.writeText(transcription);
            // Show a "Text inserted" notification
            window.NotificationService.showClipboardNotification(
              "Text inserted in input field"
            );
          } catch (err) {
            console.error("Failed to copy text: ", err);
          }
        }

        // Update status to show contextual insertion was successful
        statusElement.innerHTML =
          '<div class="status-indicator status-complete"><span class="pulse-dot"></span><span class="status-text">Inserted in field</span></div>';

        // Also show in popup what was transcribed
        transcriptionText.style.opacity = "0";
        transcriptionText.style.transition = "opacity 0.3s ease";
        transcriptionText.textContent = transcription || "No speech detected.";
        transcriptionText.style.display = "block"; // Show text container
        transcriptionText.style.pointerEvents = "auto";
        transcriptionText.style.position = "relative";
        transcriptionText.style.zIndex = "10";
      } catch (error) {
        console.error("Error inserting transcription into input:", error);

        // Show error notification
        window.NotificationService.showPopupNotification(
          "Failed to insert text. Displaying in popup instead.",
          "error"
        );

        // Fall back to standard mode if insertion fails
        contextualMode = false;
        updateContextualModeUI(false);

        // Show in popup
        transcriptionText.style.opacity = "0";
        transcriptionText.style.transition = "opacity 0.3s ease";
        transcriptionText.textContent = transcription || "No speech detected.";
        transcriptionText.style.display = "block";
        transcriptionText.style.pointerEvents = "auto";
        transcriptionText.style.position = "relative";
        transcriptionText.style.zIndex = "10";

        // Force redisplay with animation
        setTimeout(() => {
          transcriptionText.style.opacity = "1";
        }, 10);

        // Update status to show standard mode fallback
        statusElement.innerHTML =
          '<div class="status-indicator status-complete"><span class="pulse-dot"></span><span class="status-text">Complete</span></div>';

        // Copy to clipboard as fallback
        if (transcription && transcription.trim()) {
          try {
            await navigator.clipboard.writeText(transcription);
            window.NotificationService.showClipboardNotification(
              "Copied to clipboard instead"
            );
          } catch (err) {
            console.error("Failed to copy text: ", err);
          }
        }
      }
    } else {
      // Standard mode - show in popup and copy to clipboard
      if (transcription && transcription.trim()) {
        try {
          await navigator.clipboard.writeText(transcription);
          // Clipboard notification will be shown by UIProgressManager.completeProgressAnimation
          // No need to call window.NotificationService.showClipboardNotification() here to avoid duplicate notifications
        } catch (err) {
          console.error("Failed to copy text: ", err);
        }
      }

      // Show the transcription with "Complete" status
      statusElement.innerHTML =
        '<div class="status-indicator status-complete"><span class="pulse-dot"></span><span class="status-text">Complete</span></div>';

      // Animate the transcription text
      transcriptionText.style.opacity = "0";
      transcriptionText.style.transition = "opacity 0.3s ease";
      transcriptionText.textContent = transcription || "No speech detected.";
      transcriptionText.style.display = "block"; // Show text container
      transcriptionText.style.pointerEvents = "auto"; // Ensure it's interactive
      transcriptionText.style.position = "relative"; // Ensure proper stacking
      transcriptionText.style.zIndex = "10"; // Higher than visualizer
    }

    // Reset status to "Ready" after 3 seconds
    setTimeout(() => {
      if (!isRecording) {
        statusElement.innerHTML =
          '<div class="status-indicator status-ready"><span class="pulse-dot"></span><span class="status-text">Ready</span></div>';
      }
    }, 3000);

    // Make the text selectable and editable with no outline
    transcriptionText.setAttribute("contenteditable", "true");
    transcriptionText.style.userSelect = "text";
    transcriptionText.style.cursor = "text";
    transcriptionText.style.outline = "none";
    transcriptionText.style.border = "none";
    transcriptionText.style.boxShadow = "none";

    // Force reflow to ensure animation works
    transcriptionText.offsetHeight;

    // Show with animation
    transcriptionText.style.opacity = "1";

    // Show copy button when transcription is available
    const copyButtonWrapper = document.getElementById("copy-button-wrapper");
    if (copyButtonWrapper) {
      copyButtonWrapper.style.display = "block";
    }
  } catch (error) {
    console.error("Error in recording/transcription:", error);
    statusElement.innerHTML = `
      <div class="error-message">
        <svg class="icon" style="color: #ff5252" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
        </svg>
        <span>Error: ${error.message}</span>
      </div>
    `;
    transcriptionText.textContent = "Transcription failed. Please try again.";

    // Restore button in case of error
    recordButton.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path fill="currentColor" d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      </svg>
      Record & Transcribe
    `;
    recordButton.disabled = false;
    recordButton.classList.remove("button-progress-container");

    // Keep settings button hidden to maintain layout consistency
    // Once recording has been attempted, we don't show settings button again
  }
}

// Handle recording errors
function handleRecordingError(error) {
  const statusElement = document.getElementById("status");
  const recordButton = document.getElementById("startRecording");

  // Reset recording state
  isRecording = false;
  stopRecordingConfirmationNeeded = false;

  // Reset extension icon
  updateExtensionIcon(
    autoRecordEnabled ? ICON_STATE.AUTO_RECORD : ICON_STATE.IDLE
  );

  // Notify background script about recording state
  chrome.runtime.sendMessage({
    action: "updateRecordingState",
    isRecording: false,
  });

  // Reset button state
  recordButton.innerHTML = `
    <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path fill="currentColor" d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    </svg>
    Record & Transcribe
  `;

  // Hide animation
  document.getElementById("recording-animation").classList.remove("active");

  // Handle permission errors specially
  if (
    error.name === "NotAllowedError" ||
    error.name === "PermissionDeniedError"
  ) {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

    if (isMac) {
      statusElement.innerHTML = `
        <div class="error-message">
          <svg class="icon" style="color: #ff5252" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
          </svg>
          <span>Microphone access denied</span>
        </div>
      `;
    } else {
      statusElement.innerHTML = `
        <div class="error-message">
          <svg class="icon" style="color: #ff5252" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
          </svg>
          <span>Microphone access denied</span>
        </div>
      `;
    }

    // Make sure permission button is visible
    const permButton = document.getElementById("fixPermissions");
    if (permButton) {
      permButton.style.display = "block";
    }
  } else {
    // Show other errors
    statusElement.innerHTML = `
      <div class="error-message">
        <svg class="icon" style="color: #ff5252" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
        </svg>
        <span>Error: ${error.message}</span>
      </div>
    `;
  }

  // Add error message styling
  if (!document.getElementById("error-message-style")) {
    const style = document.createElement("style");
    style.id = "error-message-style";
    style.textContent = `
      .error-message {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ff5252;
        font-weight: 500;
        font-size: 14px;
      }
      .error-message .icon {
        margin-right: 6px;
      }
    `;
    document.head.appendChild(style);
  }
}

// Handle microphone permission directly in the popup
function openPermissionFix() {
  // Show the permission dialog with smooth animation
  const permissionDialog = document.getElementById("permissionDialog");
  permissionDialog.style.display = "flex";

  // Force reflow before adding show class to ensure animation works
  permissionDialog.offsetHeight;
  permissionDialog.classList.add("show");

  // Setup permission button
  const permissionBtn = document.getElementById("permissionBtn");
  const permissionStatus = document.getElementById("permission-status");

  // Add click handler for permission button
  permissionBtn.onclick = async () => {
    try {
      // Request microphone access directly
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Stop the stream right away, we just needed permission
      stream.getTracks().forEach((track) => track.stop());

      // Store permission status
      chrome.storage.sync.set({ microphonePermission: "granted" });

      // Show success message
      permissionStatus.textContent = "Microphone access granted!";
      permissionStatus.style.color = "#a0ff9d";

      permissionBtn.textContent = "Access Granted";
      permissionBtn.disabled = true;
      permissionBtn.style.backgroundColor = "rgba(76, 175, 80, 0.7)";

      // Close the dialog after a short delay
      setTimeout(() => {
        permissionDialog.style.display = "none";
        permissionDialog.classList.remove("show");
        // Refresh the status message
        document.getElementById("status").textContent =
          "Ready to transcribe! Microphone access granted.";
      }, 1500);
    } catch (error) {
      console.error("Error requesting microphone permission:", error);

      // Show detailed error message
      permissionStatus.innerHTML = `
        <span style="color: #ff88a9;">Microphone access denied.</span><br>
        <span style="font-size: 14px;">Please check your browser settings:</span>
        <ol style="font-size: 13px; margin-top: 5px; text-align: left;">
          <li>Click the lock/shield icon in the address bar</li>
          <li>Ensure Microphone is set to "Allow"</li>
          <li>If using macOS, also check System Preferences > Security & Privacy > Microphone</li>
        </ol>
      `;
    }
  };

  // Setup close button with smooth animation
  document.getElementById("closeDialog").onclick = () => {
    permissionDialog.classList.remove("show");
    setTimeout(() => {
      permissionDialog.style.display = "none";
    }, 200); // Matches transition time
  };
}

// Check if there's an active input field in the current tab
async function checkForActiveInputInTab() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) return false;

    const currentTab = tabs[0];

    // Send a message to the content script to check for active inputs
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: "getActiveInput",
    });

    if (response && response.hasActiveInput) {
      activeTabInput = response.inputInfo;
      contextualMode = true;

      // Update UI to show contextual mode is active
      updateContextualModeUI(true);

      console.log("Active input found in tab:", activeTabInput);
      return true;
    } else {
      activeTabInput = null;
      contextualMode = false;

      // Update UI to show standard mode
      updateContextualModeUI(false);

      console.log("No active input found in tab");
      return false;
    }
  } catch (error) {
    console.error("Error checking for active input:", error);

    // If error occurs (like content script not loaded), fall back to standard mode
    activeTabInput = null;
    contextualMode = false;
    updateContextualModeUI(false);
    return false;
  }
}

// Update UI to reflect contextual mode status
function updateContextualModeUI(isContextual) {
  const contextBadge = document.getElementById("contextual-mode-badge");
  if (!contextBadge) return;

  // Always make sure badge is visible
  contextBadge.style.display = "flex";

  if (isContextual) {
    contextBadge.classList.add("active");

    // Show tooltip with input info if available
    if (activeTabInput) {
      const tooltip = document.getElementById("contextual-tooltip");
      if (tooltip) {
        tooltip.innerHTML = `
          <strong>Smart mode active</strong>
          <span>Text inserts into selected field</span>
        `;
      }
    }
  } else {
    contextBadge.classList.remove("active");

    // Update tooltip for standard mode
    const tooltip = document.getElementById("contextual-tooltip");
    if (tooltip) {
      tooltip.innerHTML = `
        <strong>Standard mode</strong>
        <span>Text appears in popup</span>
      `;
    }
  }
}

// Pre-load initialization - start without waiting for DOM content
const startInit = () => {
  // Pre-initialize global services
  try {
    audioService = new AudioRecordingService();
  } catch (error) {
    console.error("Error in pre-initialization:", error);
    // We'll handle this later in the DOMContentLoaded event
  }
};

// Run pre-initialization immediately
startInit();

// Initialize the popup
// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message) => {
  console.log("Received message in popup:", message);

  if (message.action === "forceStopRecording" && isRecording) {
    console.log("Received force stop recording command");
    // Stop recording without confirmation (passing false to skip confirmation)
    stopRecording(false);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  // Force immediate rendering
  document.body.style.display = "block";
  document.body.style.opacity = "1";

  // Initialize services first
  await window.SettingsService.initialize();

  // Check API key in parallel with rendering
  const hasApiKey = await checkApiKey();

  // Initialize UI-related services
  window.ThemeManager.initialize();
  window.SettingsDialogManager.initialize();
  window.UIProgressManager.initialize();

  // Check for active input field in the current tab
  try {
    await checkForActiveInputInTab();
  } catch (error) {
    console.error(
      "Error checking for active input during initialization:",
      error
    );
    activeTabInput = null;
    contextualMode = false;
    // No need to show notification on initial load
  }

  // Check for auto-record setting
  const autoRecordBadge = document.getElementById("auto-record-badge");
  if (autoRecordBadge) {
    autoRecordBadge.style.display = "flex";

    // Check auto-record setting
    const isAutoRecordEnabled = await checkAutoRecord();

    // Setup click handler for auto-record badge
    autoRecordBadge.addEventListener("click", toggleAutoRecord);

    // Start recording automatically if enabled and API key is set
    if (isAutoRecordEnabled && hasApiKey && !isRecording) {
      console.log("Auto-recording enabled, starting recording...");
      // Use a small delay to allow UI to initialize first
      setTimeout(() => {
        startRecording();
      }, 300);
    }
  }

  // Check for context menu setting
  const contextMenuBadge = document.getElementById("context-menu-badge");
  if (contextMenuBadge) {
    contextMenuBadge.style.display = "flex";

    // Check context menu setting
    await checkContextMenu();

    // Setup click handler for context menu badge
    contextMenuBadge.addEventListener("click", toggleContextMenu);
  }

  // Setup context badge click handler
  const contextBadge = document.getElementById("contextual-mode-badge");
  if (contextBadge) {
    contextBadge.addEventListener("click", async () => {
      // Toggle contextual mode
      contextualMode = !contextualMode;

      // If turning on contextual mode, check if there's an active input
      if (contextualMode) {
        try {
          const hasActiveInput = await checkForActiveInputInTab();
          if (!hasActiveInput) {
            // If no active input is found, show a notification
            window.NotificationService.showPopupNotification(
              "No text input selected. Focus a text field on the page first.",
              "info"
            );
            contextualMode = false;
          }
        } catch (error) {
          console.error("Error checking for active input:", error);
          window.NotificationService.showPopupNotification(
            "Unable to detect text inputs. Please reload the page.",
            "info"
          );
          contextualMode = false;
        }
      }

      // Update UI
      updateContextualModeUI(contextualMode);
    });
  }

  // Initialize audio visualizer
  audioVisualizer = new AudioVisualizer(
    document.getElementById("transcription-container")
  );

  // Add random blinking to ghost in idle state
  const ghostEyes = document.querySelector(".ghost-eyes");
  if (ghostEyes) {
    // Function to trigger a random blink
    const triggerRandomBlink = () => {
      // Only blink if not recording
      if (!isRecording) {
        ghostEyes.classList.add("idle-blink");

        // Remove class after animation completes
        setTimeout(() => {
          ghostEyes.classList.remove("idle-blink");
        }, 200); // Animation duration

        // Schedule next blink with random delay (between 4-15 seconds)
        const nextBlinkDelay = 4000 + Math.random() * 11000;
        setTimeout(triggerRandomBlink, nextBlinkDelay);
      } else {
        // If recording started, check again in a few seconds
        setTimeout(triggerRandomBlink, 5000);
      }
    };

    // Start the random blinking with initial delay
    setTimeout(triggerRandomBlink, 2000 + Math.random() * 3000);
  }

  // Set click-to-stop callback
  audioVisualizer.setStopRecordingCallback(() => {
    if (isRecording) {
      stopRecording(false); // No confirmation needed when clicking on visualizer
    }
  });

  // Set up RECORD BUTTON
  const recordButton = document.getElementById("startRecording");
  recordButton.addEventListener("click", async () => {
    if (isRecording) {
      await stopRecording(false); // No confirmation needed when clicking stop button directly
    } else {
      await startRecording();
    }
  });

  // Make the ghost microphone clickable for recording too
  const ghostMic = document.getElementById("recording-animation");
  if (ghostMic) {
    ghostMic.addEventListener("click", async () => {
      if (isRecording) {
        await stopRecording(false); // No confirmation needed when clicking directly on ghost mic
      } else {
        await startRecording();
      }
    });
  }

  // Set up COPY BUTTON
  const copyButton = document.getElementById("copy-button");
  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      const transcriptionText = document.getElementById("transcription-text");
      if (transcriptionText && transcriptionText.textContent) {
        try {
          // Get edited text content from the contenteditable element
          await navigator.clipboard.writeText(transcriptionText.textContent);
          window.NotificationService.showClipboardNotification();
        } catch (err) {
          console.error("Failed to copy: ", err);
        }
      }
    });

    // Add hover effect (more subtle without shadow)
    copyButton.addEventListener("mouseenter", () => {
      copyButton.style.transform = "scale(1.15)";
      copyButton.style.opacity = "1";
    });

    copyButton.addEventListener("mouseleave", () => {
      copyButton.style.transform = "scale(1)";
      copyButton.style.opacity = "0.8";
    });

    copyButton.addEventListener("mousedown", () => {
      copyButton.style.transform = "scale(0.95)";
    });

    copyButton.addEventListener("mouseup", () => {
      copyButton.style.transform = "scale(1.15)";
    });
  }

  // Set up SETTINGS BUTTON
  const settingsButton = document.getElementById("options");
  settingsButton.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Settings button clicked");

    // Use the settings dialog manager to open settings
    window.SettingsDialogManager.initialize();
    window.SettingsDialogManager.openSettings();
  });

  // Add About header click listener
  const aboutHeader = document.getElementById("about-header");
  if (aboutHeader) {
    aboutHeader.addEventListener("click", openAbout);
  }

  // Create permission fix button
  const permButton = document.createElement("button");
  permButton.id = "fixPermissions";
  permButton.innerHTML = `
    <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
    </svg>
    Fix Microphone Access
  `;
  permButton.style.marginTop = "12px";
  permButton.style.backgroundColor = "rgba(255, 122, 69, 0.85)";
  permButton.style.display = "none"; // Hidden by default

  // Add click event
  permButton.addEventListener("click", openPermissionFix);

  // Add button to buttons div
  document.querySelector(".buttons").appendChild(permButton);

  // Check microphone permission
  checkMicPermissionAndUpdateButton();

  // Check for Chrome storage permission
  const { microphonePermission } = await chrome.storage.sync.get([
    "microphonePermission",
  ]);
  if (microphonePermission === "granted") {
    permButton.style.display = "none";
  } else {
    // If permission not stored, check if we can detect it
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({
          name: "microphone",
        });

        if (permissionStatus.state === "granted") {
          permButton.style.display = "none";
          // Save status to storage
          chrome.storage.sync.set({ microphonePermission: "granted" });
        } else {
          permButton.style.display = "block";
        }
      }
    } catch (error) {
      console.error("Error checking mic permission:", error);
    }
  }
});

// Check microphone permission status and show button if needed
async function checkMicPermissionAndUpdateButton() {
  try {
    // Try to get mic permission status from storage
    const { microphonePermission } = await chrome.storage.sync.get([
      "microphonePermission",
    ]);

    if (microphonePermission === "granted") {
      const permButton = document.getElementById("fixPermissions");
      if (permButton) {
        permButton.style.display = "none";
      }
      return;
    }

    // If not found in storage, try to check permission state directly
    if (navigator.permissions && navigator.permissions.query) {
      const permissionStatus = await navigator.permissions.query({
        name: "microphone",
      });
      const permButton = document.getElementById("fixPermissions");

      if (permissionStatus.state === "granted") {
        if (permButton) {
          permButton.style.display = "none";
        }
        // Save status to storage
        chrome.storage.sync.set({ microphonePermission: "granted" });
      } else {
        if (permButton) {
          permButton.style.display = "block";
        }
      }

      // Listen for permission changes
      permissionStatus.onchange = () => {
        const permBtn = document.getElementById("fixPermissions");
        if (permBtn) {
          permBtn.style.display =
            permissionStatus.state === "granted" ? "none" : "block";
        }

        if (permissionStatus.state === "granted") {
          chrome.storage.sync.set({ microphonePermission: "granted" });
        }
      };
    }
  } catch (error) {
    console.error("Error checking mic permission:", error);
  }
}
