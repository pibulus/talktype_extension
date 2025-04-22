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
// INITIALIZATION TRIGGERS
//==============================================================================

// Primary initialization on script load
console.log(`TalkType: Content script loading...`);
initializeExtension();

// Backup initialization to ensure DOM readiness
setTimeout(() => {
  console.log("TalkType: Running delayed initialization...");
  initializeExtension();
}, 500);

/**
 * Main initialization function with DOM readiness checks and error handling
 * Routes to appropriate initialization helper based on document state
 */
function initializeExtension() {
  // Skip if already initialized to prevent duplicated initialization
  if (window.talkTypeInitialized) {
    console.log("TalkType: Skipping initialization - already initialized");
    return;
  }
  
  console.log("TalkType: Extension initializing...");

  // Handle initialization during document loading state
  if (document.readyState === "loading") {
    console.log("TalkType: Document still loading, deferring initialization");
    document.addEventListener("DOMContentLoaded", () => {
      // Skip if already initialized by another trigger
      if (window.talkTypeInitialized) {
        console.log("TalkType: Skipping DOMContentLoaded initialization - already initialized");
        return;
      }
      
      setTimeout(() => {
        if (window.InitializationHelpers && !window.talkTypeInitialized) {
          window.talkTypeInitialized = true;
          window.InitializationHelpers.initializeExtensionCore();
        } else if (!window.InitializationHelpers) {
          console.error("TalkType: InitializationHelpers not available!");
        }
      }, 100);
    });
    return;
  }

  // Handle initialization when document is already loaded
  if (window.InitializationHelpers) {
    window.talkTypeInitialized = true;
    window.InitializationHelpers.initializeExtensionCore();
  } else {
    console.error("TalkType: InitializationHelpers not available!");
  }
}

//==============================================================================
// LIFECYCLE EVENT HANDLERS
//==============================================================================

// DOMContentLoaded initialization backup
document.addEventListener("DOMContentLoaded", () => {
  console.log("TalkType: DOMContentLoaded event fired");
  // Only initialize if not already initialized and services are missing
  if (!window.talkTypeInitialized && (!window.audioService || !window.apiService)) {
    initializeExtension();
  }
});

// Window.onload initialization backup and post-load operations
window.addEventListener("load", () => {
  console.log("TalkType: Window load event fired");
  
  // Ensure core services are initialized
  if (!window.talkTypeInitialized && (!window.audioService || !window.apiService)) {
    initializeExtension();
  }

  // Even if initialized, we still want to run these post-load operations once
  // These operations won't re-initialize the core services, just enhance functionality
  
  // Initialize focus tracking after window load (if not already done)
  if (window.FocusTrackingService && !window.focusTrackingInitialized) {
    window.focusTrackingInitialized = true;
    window.FocusTrackingService.initialize();
  }

  // Final input detection after a delay to catch dynamic elements
  setTimeout(() => {
    if (window.InputDetectionService) {
      console.log("TalkType: Running final input detection sweep");
      window.InputDetectionService.initializeInputDetection();
    }
  }, 1000);
});