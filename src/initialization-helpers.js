// Initialization helper functions for the Audio to Text extension

/**
 * Initialize only core services when needed, not eager loading
 * @param {boolean} isMessenger - Whether we're running on Messenger
 */
function initializeCoreServices(isMessenger) {
  // Prevent duplicate initialization
  if (servicesInitialized) {
    console.log("TalkType: Core services already initialized, skipping");
    return;
  }
  
  // Store messenger detection
  if (isMessenger && window.TalkTypeServices) {
    console.log("TalkType: Messenger detected - using minimal initialization");
    window.TalkTypeServices.isMessenger = true;
  }
  
  console.log("TalkType: Initializing core services on demand");
  
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
    if (window.TalkTypeServices) {
      window.TalkTypeServices.initStatus.messaging = true;
      window.TalkTypeServices.initStatus.messageHandler = true;
    }
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
  
  // Mark core initialization as started
  servicesInitialized = true;
  
  // Get API key asynchronously
  getApiKey(function(apiKey) {
    initializeAudioAndApiServices(apiKey);
  });
}

/**
 * Get API key asynchronously to avoid blocking operation
 * @param {Function} callback - Function to call with API key
 */
function getApiKey(callback) {
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
      callback(""); // Continue with empty key
      return;
    }

    console.log(
      `TalkType: Got API key from storage - ${
        result.apiKey ? "Valid key" : "Empty key"
      }`
    );
    callback(result.apiKey || "");
  });
}

/**
 * Initialize audio and API services with API key
 * @param {string} apiKey - The API key to use
 */
function initializeAudioAndApiServices(apiKey) {
  window.apiKey = apiKey;
  
  if (window.TalkTypeServices.initStatus.audio && window.TalkTypeServices.initStatus.api) {
    console.log("TalkType: Audio and API services already initialized");
    return;
  }
  
  // Initialize services - even with empty API key to allow detection of inputs
  try {
    // Check if we should use ServiceRegistry
    if (window.ServiceRegistry) {
      console.log("TalkType: Using ServiceRegistry for service initialization");
      
      // Register AudioRecordingService if not registered
      if (!window.ServiceRegistry.hasService('AudioRecordingService')) {
        window.ServiceRegistry.register('AudioRecordingService', {
          factory: () => new window.AudioRecordingService(),
          dependencies: [],
          lazy: false
        });
      }
      
      // Register GeminiApiService if not registered
      if (!window.ServiceRegistry.hasService('GeminiApiService')) {
        window.ServiceRegistry.register('GeminiApiService', {
          factory: () => {
            if (typeof window.GeminiApiService !== 'function') {
              console.error("TalkType: GeminiApiService constructor not available");
              return null;
            }
            const service = new window.GeminiApiService(window.apiKey);
            console.log("TalkType: GeminiApiService created through factory");
            return service;
          },
          dependencies: [],
          lazy: false
        });
      }
      
      // Get services from registry
      window.audioService = window.ServiceRegistry.get('AudioRecordingService');
      window.apiService = window.ServiceRegistry.get('GeminiApiService');
      window.audioProcessingService = window.ServiceRegistry.get('AudioProcessingService');
      
      // Update initialization status
      window.TalkTypeServices.initStatus.audio = true;
      window.TalkTypeServices.initStatus.api = true;
    } else {
      // Fallback to traditional initialization
      // Only initialize audio service if not already done
      if (!window.TalkTypeServices.initStatus.audio) {
        console.log("TalkType: Creating AudioRecordingService instance directly");
        window.audioService = new window.AudioRecordingService();
        window.TalkTypeServices.initStatus.audio = true;
      }

      // Only initialize API service if not already done
      if (!window.TalkTypeServices.initStatus.api) {
        console.log("TalkType: Creating GeminiApiService instance directly with API key");
        window.apiService = new window.GeminiApiService(window.apiKey);
        window.TalkTypeServices.initStatus.api = true;
      }

      // Only initialize audio processing if not already done
      if (!window.audioProcessingService) {
        console.log("TalkType: Creating AudioProcessingService instance directly");
        window.audioProcessingService = new window.AudioProcessingService();
      }
    }

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

    console.log("TalkType: Audio and API services initialized successfully");

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
  } catch (initError) {
    console.error(
      "TalkType: Error during audio/API service initialization:",
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
}

/**
 * Legacy full initialization function for backward compatibility
 */
function initializeExtensionCore() {
  console.log("TalkType: Using legacy initialization function");
  initializeCoreServices();
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
  initializeCoreServices,
  initializeExtensionCore,
  injectServiceScripts,
  resetInitialization
};