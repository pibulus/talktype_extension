// Initialization helper functions for the Audio to Text extension

/**
 * Core initialization logic, extracted for better modularity
 */
function initializeExtensionCore() {
  // Prevent duplicate initialization
  if (servicesInitialized) {
    console.log("TalkType: Services already initialized, skipping");
    return;
  }
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
    window.apiKey = result.apiKey || "";

    // Initialize services - even with empty API key to allow detection of inputs
    try {
      console.log("TalkType: Creating AudioRecordingService instance");
      window.audioService = new window.AudioRecordingService();

      console.log("TalkType: Creating GeminiApiService instance with API key");
      window.apiService = new window.GeminiApiService(window.apiKey);

      console.log("TalkType: Creating AudioProcessingService instance");
      window.audioProcessingService = new window.AudioProcessingService();

      // Check if services initialized correctly
      if (!window.audioService || !window.apiService) {
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
      window.InputDetectionService.initializeInputDetection();

      // Add observer to detect dynamically added inputs
      console.log("TalkType: Setting up DOM mutation observer");
      window.InputDetectionService.observeDynamicInputs();

      // Initialize focus tracking service for contextual transcription
      console.log("TalkType: Initializing focus tracking service");
      if (window.FocusTrackingService) {
        window.FocusTrackingService.initialize();
      } else {
        console.error("TalkType: FocusTrackingService not available!");
      }

      console.log("TalkType: Extension initialized successfully");
      
      // Mark initialization as complete
      servicesInitialized = true;

      // Check for browser mic support as an early diagnostic
      if (window.audioService.isRecordingSupported()) {
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
      if (!window.apiKey) {
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

/**
 * Inject service scripts as a fallback
 */
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

// Track service initialization state
let servicesInitialized = false;

/**
 * Reset initialization flag - useful for testing or recovery
 */
function resetInitialization() {
  servicesInitialized = false;
  window.talkTypeInitialized = false;
}

// Export the functions for use in content.js
window.InitializationHelpers = {
  initializeExtensionCore,
  injectServiceScripts,
  resetInitialization
};