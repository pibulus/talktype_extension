// Main content script for the Audio to Text extension

// Import services from other scripts
// Note: These scripts need to be included in the manifest.json before this script

// Define global variables that will be used across modules
window.audioService = null;
window.apiService = null;
window.isRecording = false;
// Active input is now managed by FocusTrackingService
window.apiKey = ""; // This should be set through extension options

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
      setTimeout(() => {
        if (window.InitializationHelpers) {
          window.InitializationHelpers.initializeExtensionCore();
        } else {
          console.error("TalkType: InitializationHelpers not available!");
        }
      }, 100);
    });
    return;
  }

  // If document is already loaded, proceed with initialization
  if (window.InitializationHelpers) {
    window.InitializationHelpers.initializeExtensionCore();
  } else {
    console.error("TalkType: InitializationHelpers not available!");
  }
}

// Also initialize on DOM content loaded and load events to ensure it works in all scenarios
document.addEventListener("DOMContentLoaded", () => {
  console.log("TalkType: DOMContentLoaded event fired");
  if (!window.audioService || !window.apiService) {
    initializeExtension();
  }
});

// Also try on window load
window.addEventListener("load", () => {
  console.log("TalkType: Window load event fired");
  if (!window.audioService || !window.apiService) {
    initializeExtension();
  }

  // Refresh focus tracking if the service is available
  if (window.FocusTrackingService) {
    window.FocusTrackingService.initialize();
  }

  // Double check after a slight delay to catch any late-loading elements
  setTimeout(() => {
    console.log("TalkType: Final initialization check");
    window.InputDetectionService.initializeInputDetection();
  }, 1000);
});