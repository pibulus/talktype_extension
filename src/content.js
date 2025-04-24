/**
 * TalkType - Audio to Text Extension
 * Main content script responsible for coordinating extension initialization
 * across various page load states to ensure reliable operation.
 */

//==============================================================================
// GLOBAL STATE
//==============================================================================

/**
 * Flag to track initialization status and prevent duplicates
 * @type {boolean}
 */
window.talkTypeInitialized = false;

/**
 * AudioRecordingService instance for handling microphone recording
 * @type {Object|null}
 */
window.audioService = null;

/**
 * GeminiApiService instance for handling API communication
 * @type {Object|null}
 */
window.apiService = null;

/**
 * Whether audio recording is currently in progress
 * @type {boolean}
 */
window.isRecording = false; // Global recording state flag - managed by AudioProcessingService instance

/**
 * API key for Gemini API service - managed by FocusTrackingService
 * @type {string}
 */
window.apiKey = "";

//==============================================================================
// LAZY INITIALIZATION SYSTEM
//==============================================================================

// Only set up the minimum required message handlers on content script load
console.log(`TalkType: Content script loading with lazy initialization...`);

/**
 * Registry of service initialization states
 * @type {Object}
 */
window.TalkTypeServices = {
  initStatus: {
    core: false,
    messaging: false,
    messageHandler: false,
    input: false,
    focus: false,
    audio: false,
    api: false,
    shadowDOM: false,
  },
  // Track if we're on Messenger to apply special handling
  isMessenger: false,
  // Track instances of observers and intervals
  focusCheckInterval: null,
  inputObserver: null,
  shadowObserver: null,
  // Callback system
  readyCallbacks: [],
  onReady: function (callback) {
    if (this.initStatus.core) {
      callback(); // Execute immediately if already initialized
    } else {
      this.readyCallbacks.push(callback); // Queue for later execution
    }
  },
};

// Load the service registry early if not already loaded
// This loads the centralized service registry before any service initialization
function loadServiceRegistry() {
  if (!window.ServiceRegistry) {
    console.log("TalkType: Loading ServiceRegistry...");
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("service-registry.js");
    script.onload = () => {
      console.log("TalkType: ServiceRegistry loaded successfully");
    };
    (document.head || document.documentElement).appendChild(script);
  }
}

// Initialize registry as early as possible
loadServiceRegistry();

// Ensure all critical services are registered and ready
window.addEventListener('load', () => {
  console.log("TalkType: Window load event - checking critical services");
  
  // Force registration of critical services
  if (window.ServiceRegistry) {
    setTimeout(() => {
      // Check for AudioProcessingService in particular
      if (!window.ServiceRegistry.hasService('AudioProcessingService') && 
          typeof window.AudioProcessingService === 'function') {
        console.log("TalkType: Re-registering AudioProcessingService after load");
        
        if (window.audioProcessingService && 
            typeof window.audioProcessingService.registerWithServiceRegistry === 'function') {
          window.audioProcessingService.registerWithServiceRegistry();
        } else {
          console.log("TalkType: Creating new AudioProcessingService instance on load");
          window.audioProcessingService = new window.AudioProcessingService();
        }
      }
    }, 200);
  }
});

/**
 * Initialize only core message handling on page load
 * All other initialization happens on-demand when needed
 */
function initializeMessageHandling() {
  if (window.TalkTypeServices.initStatus.messaging) return;

  console.log("TalkType: Setting up core message handling");

  // Listen for messages from popup, background, or context menu
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("TalkType: Received message:", request.action);

    // Special handling for initialization triggers
    if (request.action === "initializeServices") {
      initializeOnDemand(request.services || ["core"]);
      sendResponse({ success: true });
      return true;
    }

    // Handle get active input - initialize focus tracking if needed
    if (request.action === "getActiveInput") {
      // Initialize focus tracking if needed
      initializeOnDemand(["focus"]);

      // Use actual message handler once initialized
      if (window.MessageHandlerService) {
        return window.MessageHandlerService.handleGetActiveInput(
          request,
          sendResponse
        );
      }

      // Fallback response if not initialized yet
      sendResponse({
        hasActiveInput: false,
        inputInfo: null,
        message: "Services not initialized yet",
      });
      return true;
    }

    // Speech transcription requests require full initialization
    if (
      request.action === "startRecording" ||
      request.action === "insertTranscription"
    ) {
      // Initialize all required services - MessageHandlerService will be initialized as part of core
      initializeOnDemand(["core", "audio", "api", "input"]);

      // Let caller know initialization is in progress
      sendResponse({
        success: true,
        initializing: true,
        message: "Initializing services...",
      });
      return true;
    }

    // Context menu handling requires focus tracking and input detection
    if (request.action === "startTranscriptionFromContextMenu") {
      initializeOnDemand(["core", "focus", "input"]);
      sendResponse({ success: true, initializing: true });
      return true;
    }

    // Fallback message passing to MessageHandlerService if already initialized
    if (window.MessageHandlerService) {
      // Forward message to the handler
      return true; // Will be handled by existing listener
    }

    // Respond with initialization required for other actions
    sendResponse({
      success: false,
      error: "Services not initialized yet",
    });
    return true;
  });

  window.TalkTypeServices.initStatus.messaging = true;
  console.log("TalkType: Core message handling initialized");
}

/**
 * Trigger on-demand initialization for specific services
 * @param {Array<string>} services - Services to initialize
 */
function initializeOnDemand(services = []) {
  console.log("TalkType: On-demand initialization for:", services);

  // First, detect if we're in Messenger to apply special handling
  const isMessenger =
    window.location.hostname.includes("messenger.com") ||
    (window.location.hostname.includes("facebook.com") &&
      window.location.pathname.includes("/messages"));

  // Update the global flag
  if (isMessenger && window.TalkTypeServices) {
    window.TalkTypeServices.isMessenger = true;
  }

  // Initialize the core system if needed
  if (services.includes("core") && !window.TalkTypeServices.initStatus.core) {
    if (window.InitializationHelpers) {
      window.talkTypeInitialized = true;

      // Use the core services with Messenger awareness
      window.InitializationHelpers.initializeCoreServices(isMessenger);
      window.TalkTypeServices.initStatus.core = true;

      // Execute any queued callbacks
      window.TalkTypeServices.readyCallbacks.forEach((callback) => {
        try {
          callback();
        } catch (e) {
          console.error("Error in ready callback:", e);
        }
      });
      window.TalkTypeServices.readyCallbacks = [];
    } else {
      console.error("TalkType: InitializationHelpers not available!");
      // Try to inject it
      if (
        typeof window.InitializationHelpers === "undefined" &&
        typeof injectServiceScripts !== "undefined"
      ) {
        injectServiceScripts();
      }
    }
  }

  // Use safe approach to prevent duplicate initialization

  // Initialize focus tracking if requested and not already done
  if (services.includes("focus") && !window.TalkTypeServices.initStatus.focus) {
    if (window.FocusTrackingService) {
      console.log("TalkType: Initializing focus tracking on demand");
      window.FocusTrackingService.initialize();
      // The service will now set its own flag
    }
  }

  // Initialize input detection if requested and not already done
  if (services.includes("input") && !window.TalkTypeServices.initStatus.input) {
    if (window.InputDetectionService) {
      console.log("TalkType: Initializing input detection on demand");

      // For Messenger, delay input detection to avoid interference
      if (isMessenger) {
        setTimeout(() => {
          window.InputDetectionService.initializeInputDetection();
          window.TalkTypeServices.initStatus.input = true;
        }, 1000); // 1 second delay for Messenger
      } else {
        window.InputDetectionService.initializeInputDetection();
        window.TalkTypeServices.initStatus.input = true;
      }
    }
  }
}

// Start with just the bare minimum message handling
initializeMessageHandling();

//==============================================================================
// MINIMAL POST-LOAD OPERATIONS (no heavy initialization)
//==============================================================================

// Set up lazy initialization triggers but don't execute heavy operations
window.addEventListener("load", () => {
  console.log("TalkType: Window load event - setting up lazy initialization");

  // Set up context menu service if available
  if (window.ContextMenuService && !window.contextMenuInitialized) {
    window.contextMenuInitialized = true;
    window.ContextMenuService.initialize();
  }
});
