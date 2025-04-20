// Main content script for the Audio to Text extension

// Import services from other scripts
// Note: These scripts need to be included in the manifest.json before this script

let audioService = null;
let apiService = null;
let isRecording = false;
// Active input is now managed by FocusTrackingService
let apiKey = ""; // This should be set through extension options

// Initialize immediately AND ensure it runs on all DOM changes
console.log(`TalkType: Content script loading...`);
// Force immediate initialization
initializeExtension();

// Set an immediate timeout to ensure it runs after DOM is loaded
setTimeout(() => {
  console.log("TalkType running delayed initialization...");
  initializeExtension();
}, 500);

// Function to initialize the extension with robust error handling
function initializeExtension() {
  console.log("TalkType: Extension initializing...");

  // Ensure script execution environment is ready
  if (document.readyState === "loading") {
    console.log("TalkType: Document still loading, deferring initialization");
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(initializeExtensionCore, 100);
    });
    return;
  }

  // If document is already loaded, proceed with initialization
  initializeExtensionCore();
}

// Core initialization logic, separated for clarity
function initializeExtensionCore() {
  // Verify that required objects are available in the page context
  if (typeof window.AudioRecordingService === "undefined") {
    console.error(
      "TalkType: AudioRecordingService is not defined! Check that audio-service.js is loaded."
    );
    console.log(
      "TalkType: Available global objects:",
      Object.keys(window).filter((k) => k.includes("Service"))
    );

    // Try to use notification service or fallback to alert
    if (window.NotificationService) {
      window.NotificationService.showStatusNotification(
        "TalkType initialization error: Required scripts missing",
        "error"
      );
    } else {
      alert("TalkType initialization error: Required scripts missing");
    }

    // Inject script directly as a fallback
    injectServiceScripts();
    return;
  }

  // Initialize the message handler service if available
  if (window.MessageHandlerService) {
    console.log("TalkType: Initializing MessageHandlerService");
    window.MessageHandlerService.initialize();
  } else {
    console.warn(
      "TalkType: MessageHandlerService not available, using legacy message handling"
    );
  }

  if (typeof window.GeminiApiService === "undefined") {
    console.error(
      "TalkType: GeminiApiService is not defined! Check that api-service.js is loaded."
    );
    console.log(
      "TalkType: Available global objects:",
      Object.keys(window).filter((k) => k.includes("Service"))
    );

    // Try to use notification service or fallback to alert
    if (window.NotificationService) {
      window.NotificationService.showStatusNotification(
        "TalkType initialization error: Required scripts missing",
        "error"
      );
    } else {
      alert("TalkType initialization error: Required scripts missing");
    }

    // Inject script directly as a fallback
    injectServiceScripts();
    return;
  }

  // Log notification service initialization
  if (window.NotificationService) {
    console.log(`TalkType: NotificationService initialized and ready`);
  } else {
    console.error(`TalkType: NotificationService initialization failed!`);
    // Notifications won't work without NotificationService
  }

  // Check that chrome API is available
  if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    console.error(`TalkType: chrome.runtime.sendMessage not available!`);
    if (window.NotificationService) {
      window.NotificationService.showStatusNotification(
        "TalkType initialization error: Chrome API unavailable",
        "error"
      );
    } else {
      console.error("TalkType ERROR: Chrome API unavailable");
    }
    return;
  }

  // Get API key directly from storage for more reliable access
  chrome.storage.sync.get(["apiKey"], function (result) {
    if (chrome.runtime.lastError) {
      console.error(
        `TalkType: Error accessing storage - ${chrome.runtime.lastError}`
      );
      if (window.NotificationService) {
        window.NotificationService.showStatusNotification(
          "Error accessing extension storage. Try reloading the page.",
          "error"
        );
      } else {
        console.error("TalkType ERROR: Error accessing extension storage");
      }
      return;
    }

    console.log(
      `TalkType: Got API key from storage - ${
        result.apiKey ? "Valid key" : "Empty key"
      }`
    );
    apiKey = result.apiKey || "";

    // Initialize services - even with empty API key to allow detection of inputs
    try {
      console.log("TalkType: Creating AudioRecordingService instance");
      audioService = new window.AudioRecordingService();

      console.log("TalkType: Creating GeminiApiService instance with API key");
      apiService = new window.GeminiApiService(apiKey);

      console.log("TalkType: Creating AudioProcessingService instance");
      window.audioProcessingService = new window.AudioProcessingService();

      // Check if services initialized correctly
      if (!audioService || !apiService) {
        console.error("TalkType: Service initialization failed!");
        if (window.NotificationService) {
          window.NotificationService.showStatusNotification("Error initializing TalkType services", "error");
        } else {
          console.error("TalkType ERROR: Error initializing TalkType services");
        }
        return;
      }

      // Initialize input detection - do this regardless of API key status
      console.log("TalkType: Initializing input detection");
      initializeInputDetection();

      // Add observer to detect dynamically added inputs
      console.log("TalkType: Setting up DOM mutation observer");
      observeDynamicInputs();

      // Initialize focus tracking service for contextual transcription
      console.log("TalkType: Initializing focus tracking service");
      if (window.FocusTrackingService) {
        window.FocusTrackingService.initialize();
      } else {
        console.error("TalkType: FocusTrackingService not available!");
      }

      console.log("TalkType: Extension initialized successfully");

      // Check for browser mic support as an early diagnostic
      if (audioService.isRecordingSupported()) {
        console.log("TalkType: Browser supports recording");
      } else {
        console.warn("TalkType: Browser may not support recording!");
        if (window.NotificationService) {
          window.NotificationService.showStatusNotification(
            "Your browser may not support recording. Chrome is recommended.",
            "info"
          );
        } else {
          console.warn("TalkType: Your browser may not support recording. Chrome is recommended.");
        }
      }

      // If no API key, show prompt but still allow initialization
      if (!apiKey) {
        console.warn("TalkType: No API key found in storage.");
        if (window.NotificationService) {
          window.NotificationService.showStatusNotification(
            "Please set your API key in the extension options.",
            "warning"
          );
        } else {
          console.warn("TalkType: Please set your API key in the extension options.");
        }
      }

      // Already initialized FocusTrackingService above
    } catch (initError) {
      console.error(
        "TalkType: Error during service initialization:",
        initError
      );
      if (window.NotificationService) {
        window.NotificationService.showStatusNotification(
          "Error initializing speech services: " + initError.message,
          "error"
        );
      } else {
        console.error("TalkType ERROR: Error initializing speech services: " + initError.message);
      }
    }
  });
}

// Inject service scripts as a fallback
function injectServiceScripts() {
  console.log("TalkType: Attempting to inject service scripts as fallback");

  // Create and inject the audio service script
  const audioScript = document.createElement("script");
  audioScript.src = chrome.runtime.getURL("audio-service.js");
  audioScript.onload = function () {
    console.log("TalkType: Successfully injected audio-service.js");

    // Now inject the API service script
    const apiScript = document.createElement("script");
    apiScript.src = chrome.runtime.getURL("api-service.js");
    apiScript.onload = function () {
      console.log("TalkType: Successfully injected api-service.js");

      // Try initialization again after scripts are loaded
      setTimeout(initializeExtensionCore, 100);
    };
    apiScript.onerror = function (e) {
      console.error("TalkType: Failed to inject api-service.js:", e);
    };
    document.head.appendChild(apiScript);
  };
  audioScript.onerror = function (e) {
    console.error("TalkType: Failed to inject audio-service.js:", e);
  };
  document.head.appendChild(audioScript);
}

// Also initialize on DOM content loaded and load events to ensure it works in all scenarios
document.addEventListener("DOMContentLoaded", () => {
  console.log("TalkType: DOMContentLoaded event fired");
  if (!audioService || !apiService) {
    initializeExtension();
  }
});

// Also try on window load
window.addEventListener("load", () => {
  console.log("TalkType: Window load event fired");
  if (!audioService || !apiService) {
    initializeExtension();
  }

  // Refresh focus tracking if the service is available
  if (window.FocusTrackingService) {
    window.FocusTrackingService.initialize();
  }

  // Double check after a slight delay to catch any late-loading elements
  setTimeout(() => {
    console.log("TalkType: Final initialization check");
    initializeInputDetection();
  }, 1000);
});

// Function to initialize input detection
/**
 * Sets up a MutationObserver to detect and handle dynamically added input elements
 * @deprecated Use InputDetectionService.observeDynamicInputs() instead
 */
function observeDynamicInputs() {
  return window.InputDetectionService.observeDynamicInputs();
}

/**
 * Initialize input detection to find all text input elements on the page
 */
function initializeInputDetection() {
  return window.InputDetectionService.initializeInputDetection();
}

