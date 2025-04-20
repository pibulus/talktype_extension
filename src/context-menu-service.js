// Context Menu Service for the Audio to Text extension
// Handles transcription initiated from the context menu

class ContextMenuService {
  constructor() {
    // Variables to track context menu recording state
    this.contextMenuRecording = false;
    this.contextMenuRecordingIndicator = null;
    this.targetInputElement = null;
    
    // Set up message listener for context menu actions
    this.setupMessageListener();
  }

  // Initialize and set up message listener
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("TalkType: Context menu message received:", request);
      
      // Send an immediate response to ensure the connection is acknowledged
      sendResponse({ received: true, status: "processing" });
      
      if (request.action === "startTranscriptionFromContextMenu") {
        this.handleContextMenuAction(request);
        return true;
      }
      
      return false; // Let other handlers process it
    });
  }

  // Handle incoming context menu action message
  handleContextMenuAction(request) {
    // Show notification that we received the message
    window.NotificationService.showStatusNotification("Context menu action received!", "info");
    
    // Get the active element (where the user right-clicked)
    this.targetInputElement = document.activeElement;
    console.log("TalkType: Active element is:", this.targetInputElement);
    
    // Add debug information
    if (request.info && request.info.editable) {
      console.log(
        "TalkType: Context menu was triggered on an editable element according to Chrome"
      );
    }
    
    // Validate if it's a proper input element
    if (!window.InputDetectionService.isValidTextInputElement(this.targetInputElement)) {
      console.error("TalkType: Context menu target is not a valid text input element");
      window.NotificationService.showStatusNotification(
        "Cannot transcribe: Invalid input element",
        "error"
      );
      return;
    }
    
    console.log(
      "TalkType: Starting context menu transcription for:",
      this.targetInputElement
    );
    
    // Start the recording process
    this.startContextMenuRecording();
  }

  // Create a visual indicator for context menu recording
  createContextMenuRecordingIndicator() {
    // Remove any existing indicators
    const existingIndicator = document.getElementById("talktype-context-recording");
    if (existingIndicator) {
      document.body.removeChild(existingIndicator);
    }
    
    // Create new indicator
    const indicator = document.createElement("div");
    indicator.id = "talktype-context-recording";
    indicator.innerHTML = `
      <div class="talktype-context-recording-icon">
        <div class="talktype-context-recording-pulse"></div>
      </div>
      <div class="talktype-context-recording-text">
        Recording... Click anywhere to stop
      </div>
    `;
    
    // Style the indicator
    indicator.style.position = "fixed";
    indicator.style.bottom = "20px";
    indicator.style.right = "20px";
    indicator.style.padding = "12px 18px";
    indicator.style.background = "rgba(111, 66, 193, 0.9)";
    indicator.style.color = "white";
    indicator.style.borderRadius = "16px";
    indicator.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    indicator.style.fontSize = "14px";
    indicator.style.fontWeight = "500";
    indicator.style.display = "flex";
    indicator.style.alignItems = "center";
    indicator.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.15)";
    indicator.style.zIndex = "2147483647"; // Highest possible z-index
    indicator.style.cursor = "pointer";
    indicator.style.backdropFilter = "blur(8px)";
    indicator.style.webkitBackdropFilter = "blur(8px)";
    indicator.style.border = "1px solid rgba(255, 255, 255, 0.2)";
    indicator.style.transition = "all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)";
    
    // Style the icon part
    const iconPart = indicator.querySelector(".talktype-context-recording-icon");
    iconPart.style.width = "16px";
    iconPart.style.height = "16px";
    iconPart.style.borderRadius = "50%";
    iconPart.style.background = "#e991a9";
    iconPart.style.marginRight = "12px";
    iconPart.style.position = "relative";
    
    // Style the pulse animation
    const pulsePart = indicator.querySelector(".talktype-context-recording-pulse");
    pulsePart.style.position = "absolute";
    pulsePart.style.top = "0";
    pulsePart.style.left = "0";
    pulsePart.style.right = "0";
    pulsePart.style.bottom = "0";
    pulsePart.style.borderRadius = "50%";
    pulsePart.style.animation = "talktype-pulse 2s infinite";
    
    // Add pulse animation if it doesn't exist yet
    if (!document.getElementById("talktype-context-animations")) {
      const styleEl = document.createElement("style");
      styleEl.id = "talktype-context-animations";
      styleEl.textContent = `
        @keyframes talktype-pulse {
          0% { box-shadow: 0 0 0 0 rgba(233, 145, 169, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(233, 145, 169, 0); }
          100% { box-shadow: 0 0 0 0 rgba(233, 145, 169, 0); }
        }
      `;
      document.head.appendChild(styleEl);
    }
    
    // Add hover effects
    indicator.addEventListener("mouseenter", () => {
      indicator.style.transform = "scale(1.05)";
      indicator.style.boxShadow = "0 6px 25px rgba(0, 0, 0, 0.2)";
    });
    
    indicator.addEventListener("mouseleave", () => {
      indicator.style.transform = "scale(1)";
      indicator.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.15)";
    });
    
    // Add click handler to stop recording
    indicator.addEventListener("click", () => {
      this.stopContextMenuRecording();
    });
    
    // Add to page
    document.body.appendChild(indicator);
    return indicator;
  }

  // Handle document click to stop recording
  documentClickHandler = (event) => {
    // Prevent immediate re-triggering
    if (event.target.closest("#talktype-context-recording")) {
      return;
    }
    
    console.log("TalkType: Document clicked, stopping context menu recording");
    this.stopContextMenuRecording();
  }

  // Start recording from context menu
  async startContextMenuRecording() {
    try {
      // Do nothing if already recording
      if (this.contextMenuRecording) {
        console.log("TalkType: Already recording from context menu");
        return;
      }
      
      // Show recording indicator
      this.contextMenuRecordingIndicator = this.createContextMenuRecordingIndicator();
      
      // Set active input for use during transcription
      window.activeInput = this.targetInputElement;
      
      // Initialize audio service if needed
      if (!window.audioService) {
        console.log("TalkType: Initializing audio service for context menu recording");
        
        // Get API key from storage
        const { apiKey } = await new Promise((resolve) => {
          chrome.storage.sync.get(["apiKey"], resolve);
        });
        
        // Create services
        window.audioService = new window.AudioRecordingService();
        window.apiService = new window.GeminiApiService(apiKey);
        
        if (!apiKey) {
          window.NotificationService.showStatusNotification(
            "Please set your API key in the extension options",
            "error"
          );
          return;
        }
      }
      
      // Set recording flag
      this.contextMenuRecording = true;
      window.isRecording = true;
      
      // Notify background script about recording state
      chrome.runtime.sendMessage({
        action: "updateRecordingState",
        isRecording: true,
      });
      
      // Start recording
      await window.audioProcessingService.startRecording(this.targetInputElement, null);
      console.log("TalkType: Context menu recording started");
      
      // Add global click handler to stop recording when clicked elsewhere
      setTimeout(() => {
        document.addEventListener("click", this.documentClickHandler, { once: true });
      }, 500); // Small delay to avoid immediate triggering
    } catch (error) {
      console.error("TalkType: Error starting context menu recording:", error);
      window.NotificationService.showStatusNotification(`Recording error: ${error.message}`, "error");
      this.contextMenuRecording = false;
      window.isRecording = false;
      
      // Clean up
      if (this.contextMenuRecordingIndicator) {
        document.body.removeChild(this.contextMenuRecordingIndicator);
        this.contextMenuRecordingIndicator = null;
      }
    }
  }

  // Stop recording from context menu and process audio
  async stopContextMenuRecording() {
    if (!this.contextMenuRecording) {
      return;
    }
    
    console.log("TalkType: Stopping context menu recording");
    
    try {
      // Update indicator to show processing
      if (this.contextMenuRecordingIndicator) {
        const textElement = this.contextMenuRecordingIndicator.querySelector(
          ".talktype-context-recording-text"
        );
        if (textElement) {
          textElement.textContent = "Processing transcription...";
        }
        
        // Change style to indicate processing
        this.contextMenuRecordingIndicator.style.background = "rgba(70, 174, 247, 0.85)";
      }
      
      // Use audioProcessingService to stop recording - it will handle transcription and insertion
      await window.audioProcessingService.stopRecording();
      
      // Reset recording flags
      this.contextMenuRecording = false;
      window.isRecording = false;
      
      // Notify background script
      chrome.runtime.sendMessage({
        action: "updateRecordingState",
        isRecording: false,
      });
      
      // Show success notification
      window.NotificationService.showStatusNotification("Transcription complete", "success");
    } catch (error) {
      console.error("TalkType: Error during context menu transcription:", error);
      window.NotificationService.showStatusNotification(`Transcription error: ${error.message}`, "error");
    } finally {
      // Clean up
      if (this.contextMenuRecordingIndicator) {
        document.body.removeChild(this.contextMenuRecordingIndicator);
        this.contextMenuRecordingIndicator = null;
      }
      
      // Reset state
      this.targetInputElement = null;
      document.removeEventListener("click", this.documentClickHandler);
    }
  }
}

// Make service available globally
window.ContextMenuService = new ContextMenuService();