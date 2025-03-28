// Main content script for the Audio to Text extension

// Import services from other scripts
// Note: These scripts need to be included in the manifest.json before this script

let audioService = null;
let apiService = null;
let isRecording = false;
let activeInput = null;
let apiKey = ''; // This should be set through extension options

// Initialize immediately AND ensure it runs on all DOM changes
console.log('TalkType content script loading...');
// Force immediate initialization
initializeExtension();

// Set an immediate timeout to ensure it runs after DOM is loaded
setTimeout(() => {
  console.log('TalkType running delayed initialization...');
  initializeExtension();
}, 500);

// Function to initialize the extension with robust error handling
async function initializeExtension() {
  console.log('TalkType: Extension initializing...');
  
  // Verify that required objects are available in the page context
  if (typeof AudioRecordingService === 'undefined') {
    console.error('TalkType: AudioRecordingService is not defined! Check that audio-service.js is loaded.');
    showStatusNotification('TalkType initialization error: Required scripts missing', 'error');
    return;
  }
  
  if (typeof GeminiApiService === 'undefined') {
    console.error('TalkType: GeminiApiService is not defined! Check that api-service.js is loaded.');
    showStatusNotification('TalkType initialization error: Required scripts missing', 'error');
    return;
  }
  
  // Check that chrome API is available
  if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    console.error('TalkType: chrome.runtime.sendMessage not available!');
    showStatusNotification('TalkType initialization error: Chrome API unavailable', 'error');
    return;
  }
  
  // Get API key from storage with better error handling
  try {
    console.log('TalkType: Fetching API key from storage');
    
    chrome.runtime.sendMessage({action: 'getApiKey'}, response => {
      // Check for chrome runtime errors
      if (chrome.runtime.lastError) {
        console.error('TalkType: Error getting API key:', chrome.runtime.lastError);
        showStatusNotification('Error communicating with extension. Try reloading the page.', 'error');
        return;
      }
      
      // Process response
      if (response && response.apiKey) {
        console.log('TalkType: API key retrieved successfully');
        apiKey = response.apiKey;
        
        // Initialize services
        try {
          console.log('TalkType: Creating AudioRecordingService instance');
          audioService = new AudioRecordingService();
          
          console.log('TalkType: Creating GeminiApiService instance with API key');
          apiService = new GeminiApiService(apiKey);
          
          // Check if services initialized correctly
          if (!audioService || !apiService) {
            console.error('TalkType: Service initialization failed!');
            showStatusNotification('Error initializing TalkType services', 'error');
            return;
          }
          
          // Initialize input detection
          console.log('TalkType: Initializing input detection');
          initializeInputDetection();
          
          // Add observer to detect dynamically added inputs
          console.log('TalkType: Setting up DOM mutation observer');
          observeDynamicInputs();
          
          console.log('TalkType: Extension initialized successfully');
          
          // Check for browser mic support as an early diagnostic
          if (audioService.isRecordingSupported()) {
            console.log('TalkType: Browser supports recording');
          } else {
            console.warn('TalkType: Browser may not support recording!');
            showStatusNotification('Your browser may not support recording. Chrome is recommended.', 'info');
          }
        } catch (initError) {
          console.error('TalkType: Error during service initialization:', initError);
          showStatusNotification('Error initializing speech services: ' + initError.message, 'error');
        }
      } else {
        console.warn('TalkType: No API key found.');
        showStatusNotification('Please set your API key in the extension options.', 'error');
        
        // Try to open options page after a delay
        setTimeout(() => {
          try {
            chrome.runtime.sendMessage({action: 'openOptions'});
          } catch (optionsError) {
            console.error('TalkType: Failed to open options page:', optionsError);
          }
        }, 2000);
      }
    });
  } catch (error) {
    console.error('TalkType: Failed to initialize extension:', error);
    showStatusNotification('TalkType initialization failed: ' + error.message, 'error');
  }
}

// Also initialize on DOM content loaded and load events to ensure it works in all scenarios
document.addEventListener('DOMContentLoaded', () => {
  console.log('TalkType: DOMContentLoaded event fired');
  if (!audioService || !apiService) {
    initializeExtension();
  }
});

// Also try on window load
window.addEventListener('load', () => {
  console.log('TalkType: Window load event fired');
  if (!audioService || !apiService) {
    initializeExtension();
  }
  
  // Double check after a slight delay to catch any late-loading elements
  setTimeout(() => {
    console.log('TalkType: Final initialization check');
    initializeInputDetection();
  }, 1000);
});

// Function to initialize input detection
function initializeInputDetection() {
  console.log('TalkType: Initializing input detection for mic buttons...');
  
  // Find all possible text input elements on the page
  const allInputs = document.querySelectorAll('input, textarea');
  console.log(`TalkType: Found ${allInputs.length} input elements`);
  
  // Filter for inputs that can accept text
  allInputs.forEach(input => {
    // For inputs, check the type
    if (input.tagName.toLowerCase() === 'input') {
      const inputType = input.getAttribute('type') || 'text';
      
      // These input types can accept text
      const textTypes = ['text', 'search', 'email', 'url', 'tel', 'number', 'password', 
                         'date', 'datetime-local', 'time', 'month', 'week'];
      
      // Add mic to text-based inputs
      if (textTypes.includes(inputType.toLowerCase())) {
        addMicrophoneToInput(input);
      }
      
      // Also handle inputs with no type (defaults to text)
      if (!input.hasAttribute('type')) {
        addMicrophoneToInput(input);
      }
    } 
    // All textareas can accept text
    else if (input.tagName.toLowerCase() === 'textarea') {
      addMicrophoneToInput(input);
    }
    
    // Handle contenteditable elements
    if (input.hasAttribute('contenteditable') && input.getAttribute('contenteditable') !== 'false') {
      addMicrophoneToInput(input);
    }
  });
  
  // Also check for contenteditable divs and spans
  const editableElements = document.querySelectorAll('[contenteditable="true"]');
  console.log(`TalkType: Found ${editableElements.length} contenteditable elements`);
  editableElements.forEach(element => {
    addMicrophoneToInput(element);
  });
  
  // Special handling for social media and common sites (with expanded selectors)
  
  // Gmail composer (high priority)
  const gmailComposers = document.querySelectorAll('.Am.Al.editable, .aO9, [role="textbox"][aria-label*="compose"], div[aria-label*="Message Body"], div[g_editable="true"]');
  console.log(`TalkType: Found ${gmailComposers.length} Gmail composers`);
  gmailComposers.forEach(element => {
    if (!element.dataset.hasMicButton) {
      addMicrophoneToInput(element);
    }
  });
  
  // Facebook comment & post boxes (with expanded selectors)
  const facebookInputs = document.querySelectorAll(
    '[role="textbox"], [data-testid="post-composer"] div[contenteditable], ' +
    '[aria-label*="comment"], [aria-label*="Comment"], [aria-label*="post"], [aria-label*="Post"], ' +
    '[aria-label*="Write"], [aria-label*="write"], [placeholder*="comment"], [placeholder*="Comment"], ' +
    '.notranslate[contenteditable], .UFICommentContainer, .UFIAddCommentInput'
  );
  console.log(`TalkType: Found ${facebookInputs.length} Facebook inputs`);
  facebookInputs.forEach(element => {
    if (!element.dataset.hasMicButton) {
      addMicrophoneToInput(element);
    }
  });
  
  // Reddit comment boxes (expanded)
  const redditCommentBoxes = document.querySelectorAll(
    '.public-DraftEditor-content, .RichTextJSON-root, ' +
    '.usertext-edit textarea, .commentarea textarea, ' +
    'div[data-test-id="comment-submission-form-richtext"], ' +
    '[placeholder*="comment"], [placeholder*="Comment"]'
  );
  console.log(`TalkType: Found ${redditCommentBoxes.length} Reddit comment boxes`);
  redditCommentBoxes.forEach(element => {
    if (!element.dataset.hasMicButton) {
      addMicrophoneToInput(element);
    }
  });
  
  // Common messaging platforms (Slack, Discord, etc.)
  const messagingInputs = document.querySelectorAll(
    '[aria-label*="message"], [aria-label*="Message"], ' +
    '[placeholder*="message"], [placeholder*="Message"], ' +
    '.ql-editor[contenteditable], ' +
    '[role="textbox"][aria-label*="message"], [data-slate-editor="true"]'
  );
  console.log(`TalkType: Found ${messagingInputs.length} messaging inputs`);
  messagingInputs.forEach(element => {
    if (!element.dataset.hasMicButton) {
      addMicrophoneToInput(element);
    }
  });
  
  // Twitter/X composer
  const twitterInputs = document.querySelectorAll(
    '[data-testid="tweetTextarea_0"], [aria-label*="tweet"], [aria-label*="Tweet"], ' +
    '[aria-label*="post"], [data-testid="toolBar"], [role="textbox"][aria-labelledby*="post"]'
  );
  console.log(`TalkType: Found ${twitterInputs.length} Twitter/X inputs`);
  twitterInputs.forEach(element => {
    if (!element.dataset.hasMicButton) {
      addMicrophoneToInput(element);
    }
  });
  
  // Generic rich text editors (expanded list)
  const richTextEditors = document.querySelectorAll(
    '.ql-editor, .jodit-wysiwyg, .ce-paragraph, .ProseMirror, [role="textbox"], ' +
    '.trix-content, .tox-edit-area, .CodeMirror, .markdown-body, .editor-container, ' +
    '[class*="editor"], [class*="Editor"], [class*="comment"], [class*="Comment"], ' +
    '[class*="compose"], [class*="Compose"], [id*="editor"], [id*="Editor"]'
  );
  console.log(`TalkType: Found ${richTextEditors.length} rich text editors`);
  richTextEditors.forEach(element => {
    if (!element.dataset.hasMicButton) {
      addMicrophoneToInput(element);
    }
  });
  
  // As a fallback, also look for any elements that might seem like text inputs
  const potentialInputs = document.querySelectorAll(
    'div[role="textbox"], div[contenteditable], ' +
    '[aria-label*="input"], [aria-label*="type"], [aria-label*="write"], ' +
    '[placeholder], [aria-autocomplete="list"]'
  );
  console.log(`TalkType: Found ${potentialInputs.length} potential inputs`);
  potentialInputs.forEach(element => {
    if (!element.dataset.hasMicButton) {
      addMicrophoneToInput(element);
    }
  });
}

// Function to observe for dynamically added inputs
function observeDynamicInputs() {
  console.log('TalkType: Setting up MutationObserver...');
  
  // Create a more thorough check and scan function
  const scanAndAttachMic = (root) => {
    console.log('TalkType: Scanning for input elements...');
    
    // Find ALL inputs and textareas
    const allInputs = root.querySelectorAll('input, textarea');
    if (allInputs.length > 0) {
      console.log(`TalkType: Found ${allInputs.length} input/textarea elements`);
    }
    
    // Add to text-based inputs
    allInputs.forEach(input => {
      if (input.tagName.toLowerCase() === 'input') {
        const inputType = input.getAttribute('type') || 'text';
        const textTypes = ['text', 'search', 'email', 'url', 'tel', 'number', 'password', 
                          'date', 'datetime-local', 'time', 'month', 'week'];
        
        if (textTypes.includes(inputType.toLowerCase()) || !input.hasAttribute('type')) {
          addMicrophoneToInput(input);
        }
      } else if (input.tagName.toLowerCase() === 'textarea') {
        addMicrophoneToInput(input);
      }
    });
    
    // Find contenteditable elements
    const editableElements = root.querySelectorAll('[contenteditable="true"]');
    if (editableElements.length > 0) {
      console.log(`TalkType: Found ${editableElements.length} contenteditable elements`);
    }
    editableElements.forEach(element => {
      addMicrophoneToInput(element);
    });
    
    // Special handling for known sites and editors
    
    // Reddit
    const redditCommentBoxes = root.querySelectorAll('.public-DraftEditor-content, .RichTextJSON-root');
    if (redditCommentBoxes.length > 0) {
      console.log(`TalkType: Found ${redditCommentBoxes.length} Reddit comment boxes`);
    }
    redditCommentBoxes.forEach(element => {
      if (!element.dataset.hasMicButton) {
        addMicrophoneToInput(element);
      }
    });
    
    // Facebook
    const facebookCommentBoxes = root.querySelectorAll('[role="textbox"], [data-testid="post-composer"] div[contenteditable]');
    if (facebookCommentBoxes.length > 0) {
      console.log(`TalkType: Found ${facebookCommentBoxes.length} Facebook comment boxes`);
    }
    facebookCommentBoxes.forEach(element => {
      if (!element.dataset.hasMicButton) {
        addMicrophoneToInput(element);
      }
    });
    
    // Generic rich text editors (expanded list)
    const richTextEditors = root.querySelectorAll(
      '.ql-editor, .jodit-wysiwyg, .ce-paragraph, .ProseMirror, [role="textbox"], ' +
      '.trix-content, .tox-edit-area, .CodeMirror, .markdown-body, ' +
      '[class*="editor"], [class*="Editor"], [class*="comment"], [class*="Comment"]'
    );
    if (richTextEditors.length > 0) {
      console.log(`TalkType: Found ${richTextEditors.length} rich text editors`);
    }
    richTextEditors.forEach(element => {
      if (!element.dataset.hasMicButton) {
        addMicrophoneToInput(element);
      }
    });
  };
  
  // Create an observer that watches for ALL DOM changes
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    
    // Check if any mutations are relevant
    mutations.forEach((mutation) => {
      // If nodes were added
      if (mutation.addedNodes.length) {
        shouldScan = true;
        
        // For each added node that's an element
        mutation.addedNodes.forEach((node) => {
          // Direct check for input elements
          if (node.nodeName === 'INPUT' || node.nodeName === 'TEXTAREA') {
            addMicrophoneToInput(node);
          } 
          // Check for contenteditable
          else if (node.hasAttribute && node.hasAttribute('contenteditable') && 
                   node.getAttribute('contenteditable') !== 'false') {
            addMicrophoneToInput(node);
          }
        });
      }
      
      // If attributes changed, check if it's a relevant attribute
      if (mutation.type === 'attributes') {
        if (mutation.attributeName === 'contenteditable' || 
            mutation.attributeName === 'type' || 
            mutation.attributeName === 'class' ||
            mutation.attributeName === 'style') {
          shouldScan = true;
        }
      }
    });
    
    // If relevant changes were detected, scan the document
    if (shouldScan) {
      // Use a small delay to let the DOM settle
      setTimeout(() => {
        scanAndAttachMic(document.body);
      }, 50);
    }
  });
  
  // Start observing with ALL possible mutation types
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: false
  });
  
  // Also set up a periodic scan to catch any missed elements
  setInterval(() => {
    scanAndAttachMic(document.body);
  }, 2000);
  
  // Initial scan of the page
  scanAndAttachMic(document.body);
}

// Function to add microphone icon to an input element
function addMicrophoneToInput(inputElement) {
  console.log('TalkType: Adding microphone to input element:', inputElement);
  
  // Check if this input already has a microphone button
  if (inputElement.dataset.hasMicButton) {
    console.log('TalkType: Input already has mic button, skipping');
    return;
  }
  
  // Mark this input as having a mic button
  inputElement.dataset.hasMicButton = 'true';
  
  // Create a hardcoded microphone emoji as fallback
  const micEmoji = "🎤";
  
  // Try to get the SVG icon URL
  let micIconUrl = chrome.runtime.getURL('icons/mic.svg');
  console.log('TalkType: Microphone icon URL:', micIconUrl);
  
  // Whether we have a valid icon URL
  const hasValidIcon = micIconUrl && !micIconUrl.includes('undefined') && !micIconUrl.includes('chrome-extension://null');
  
  // Create microphone button with TalkType branding
  const micButton = document.createElement('button');
  micButton.className = 'audio-to-text-mic-button';
  micButton.title = 'TalkType: Click to dictate';
  micButton.style.position = 'absolute';
  micButton.style.zIndex = '99999'; // Very high z-index to ensure visibility
  micButton.style.background = 'rgba(111, 66, 193, 0.15)';
  micButton.style.border = '1px solid rgba(111, 66, 193, 0.3)';
  micButton.style.borderRadius = '50%';
  micButton.style.cursor = 'pointer';
  micButton.style.width = '28px'; // Slightly larger
  micButton.style.height = '28px'; // Slightly larger
  micButton.style.padding = '2px';
  micButton.style.opacity = '1'; // Fully visible
  micButton.style.transform = 'scale(1)';
  micButton.style.transition = 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28), opacity 0.3s ease, background 0.2s ease, box-shadow 0.2s ease';
  micButton.style.boxShadow = '0 2px 6px rgba(111, 66, 193, 0.4)'; // More pronounced shadow
  micButton.style.backdropFilter = 'blur(2px)';
  micButton.style.webkitBackdropFilter = 'blur(2px)';
  micButton.style.display = 'block'; // Always visible
  
  // Add a subtle pulse animation to make it more noticeable
  micButton.style.animation = 'gentle-pulse 2s infinite';
  
  // Add this animation if it doesn't exist yet
  if (!document.getElementById('talk-type-animations')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'talk-type-animations';
    styleEl.textContent = `
      @keyframes gentle-pulse {
        0% { transform: scale(1); box-shadow: 0 2px 6px rgba(111, 66, 193, 0.4); }
        50% { transform: scale(1.05); box-shadow: 0 2px 10px rgba(111, 66, 193, 0.6); }
        100% { transform: scale(1); box-shadow: 0 2px 6px rgba(111, 66, 193, 0.4); }
      }
    `;
    document.head.appendChild(styleEl);
  }
  
  console.log('TalkType: Created mic button for input:', inputElement);
  
  // Create the icon (either image or text)
  if (hasValidIcon) {
    // Create SVG icon image
    const micIcon = document.createElement('img');
    micIcon.src = micIconUrl;
    micIcon.style.width = '100%';
    micIcon.style.height = '100%';
    micIcon.style.transition = 'transform 0.2s ease';
    
    // Handle image loading error
    micIcon.onerror = () => {
      console.error('TalkType: Failed to load microphone icon, using emoji fallback');
      micIcon.style.display = 'none';
      createEmojiIcon();
    };
    
    // Log successful load
    micIcon.onload = () => {
      console.log('TalkType: Successfully loaded microphone icon!');
    };
    
    micButton.appendChild(micIcon);
  } else {
    // Use emoji fallback immediately
    createEmojiIcon();
  }
  
  // Function to create emoji fallback
  function createEmojiIcon() {
    const textIcon = document.createElement('div');
    textIcon.innerText = micEmoji;
    textIcon.style.fontSize = '14px';
    textIcon.style.textAlign = 'center';
    textIcon.style.lineHeight = '20px';
    textIcon.style.color = '#6F42C1'; // Use purple TalkType brand color
    micButton.appendChild(textIcon);
  }
  
  // Add recording indicator with vaporwave style
  const recordingIndicator = document.createElement('span');
  recordingIndicator.className = 'audio-to-text-recording-indicator';
  recordingIndicator.style.display = 'none';
  recordingIndicator.style.width = '10px';
  recordingIndicator.style.height = '10px';
  recordingIndicator.style.borderRadius = '50%';
  recordingIndicator.style.background = 'linear-gradient(135deg, #9c27b0, #673ab7)'; // Purple vaporwave colors
  recordingIndicator.style.position = 'absolute';
  recordingIndicator.style.top = '-3px';
  recordingIndicator.style.right = '-3px';
  recordingIndicator.style.boxShadow = '0 0 5px rgba(156, 39, 176, 0.7)';
  recordingIndicator.style.animation = 'pulse-mic 1.5s infinite';
  recordingIndicator.style.border = '1px solid rgba(255, 255, 255, 0.3)';
  
  // Add pulse animation for recording indicator
  if (!document.getElementById('audio-to-text-animations')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'audio-to-text-animations';
    styleEl.textContent = `
      @keyframes pulse-mic {
        0% {
          box-shadow: 0 0 0 0 rgba(156, 39, 176, 0.7);
          opacity: 1;
        }
        50% {
          box-shadow: 0 0 10px 3px rgba(156, 39, 176, 0.4);
          opacity: 0.9;
        }
        100% {
          box-shadow: 0 0 0 0 rgba(156, 39, 176, 0);
          opacity: 1;
        }
      }
      
      @keyframes wiggle-mic {
        0% { transform: rotate(-3deg) scale(1); }
        25% { transform: rotate(3deg) scale(1.05); }
        50% { transform: rotate(-2deg) scale(1.02); }
        75% { transform: rotate(2deg) scale(1.05); }
        100% { transform: rotate(0deg) scale(1); }
      }
    `;
    document.head.appendChild(styleEl);
  }
  
  micButton.appendChild(recordingIndicator);
  
  // Add more pronounced TalkType branded hover effects
  micButton.addEventListener('mouseenter', () => {
    micButton.style.opacity = '1';
    micButton.style.transform = 'scale(1.15)';
    micButton.style.boxShadow = '0 2px 8px rgba(111, 66, 193, 0.45)';
    micButton.style.background = 'rgba(111, 66, 193, 0.25)';
    micButton.style.border = '1px solid rgba(111, 66, 193, 0.5)';
    // Add a slight glow effect to highlight the button
    micButton.style.filter = 'drop-shadow(0 0 3px rgba(111, 66, 193, 0.3))';
  });
  
  micButton.addEventListener('mouseleave', () => {
    // Only change opacity if not recording
    if (!isRecording) {
      micButton.style.opacity = '0.9';
      micButton.style.transform = 'scale(1)';
      micButton.style.boxShadow = '0 1px 3px rgba(111, 66, 193, 0.15)';
      micButton.style.background = 'rgba(111, 66, 193, 0.1)';
      micButton.style.border = '1px solid rgba(111, 66, 193, 0.2)';
      micButton.style.filter = 'none';
      // We keep the button visible at all times
    }
  });
  
  micButton.addEventListener('mousedown', () => {
    micButton.style.transform = 'scale(0.95)';
    micButton.style.boxShadow = '0 0 2px rgba(0,0,0,0.1)';
  });
  
  micButton.addEventListener('mouseup', () => {
    micButton.style.transform = 'scale(1.1)';
    micButton.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
  });
  
  // Add click event to microphone button - simplified but robust
  micButton.onclick = async function(event) {
    // Prevent any default behavior and event bubbling
    event.preventDefault();
    event.stopPropagation();
    
    console.log('TalkType: Mic button clicked!', inputElement);
    
    // Set active input element as a global target
    activeInput = inputElement;
    
    // Visual feedback - always show something when clicked
    micButton.style.transform = 'scale(1.1)';
    micButton.style.background = 'rgba(255, 64, 129, 0.3)';
    micButton.style.border = '1px solid rgba(255, 64, 129, 0.5)';
    micButton.style.boxShadow = '0 2px 8px rgba(255, 64, 129, 0.35)';
    
    try {
      // Toggle recording state
      if (isRecording) {
        console.log('TalkType: Stopping recording...');
        showStatusNotification('Stopping recording...', 'info');
        stopRecording();
      } else {
        console.log('TalkType: Starting recording...');
        showStatusNotification('Starting recording...', 'info');
        
        // First check if services are initialized - initialize them if needed
        if (!audioService || !apiService) {
          console.log('TalkType: Services not initialized, initializing now...');
          showStatusNotification('Initializing TalkType...', 'processing');
          
          // Try to initialize before recording
          initializeExtension();
          
          // Wait for initialization
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Check again
          if (!audioService || !apiService) {
            console.error('TalkType: Failed to initialize services!');
            showStatusNotification('Failed to initialize TalkType services. Please check options.', 'error');
            return;
          }
        }
        
        // Simple animation
        const micIcon = micButton.querySelector('img');
        if (micIcon) {
          micIcon.style.animation = 'wiggle-mic 0.5s ease';
        }
        
        // Start recording
        startRecording(inputElement, recordingIndicator);
      }
    } catch (error) {
      console.error('TalkType: Error handling click:', error);
      showStatusNotification('Error: ' + error.message, 'error');
      
      // Reset button appearance
      setTimeout(() => {
        micButton.style.transform = 'scale(1)';
        micButton.style.background = 'rgba(111, 66, 193, 0.15)';
        micButton.style.border = '1px solid rgba(111, 66, 193, 0.3)';
        micButton.style.boxShadow = '0 2px 6px rgba(111, 66, 193, 0.4)';
      }, 500);
    }
  };
  
  // Always show mic button, but update position on focus
  inputElement.addEventListener('focus', () => {
    positionMicButton(inputElement, micButton);
  });
  
  // No need to hide on blur anymore, we keep it visible
  
  // Position the button appropriately based on the input element
  positionMicButton(inputElement, micButton);
  
  // Listen for input resize (if ResizeObserver is available)
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      positionMicButton(inputElement, micButton);
    });
    resizeObserver.observe(inputElement);
  }
  
  // Listen for input position changes
  window.addEventListener('resize', () => {
    positionMicButton(inputElement, micButton);
  });
  
  // Update position when input changes visibility
  const observer = new MutationObserver(() => {
    positionMicButton(inputElement, micButton);
  });
  observer.observe(inputElement, { attributes: true, attributeFilter: ['style', 'class'] });
}

// Function to position microphone button correctly relative to input
function positionMicButton(inputElement, micButton) {
  console.log('TalkType: Positioning mic button for input:', inputElement);
  const inputRect = inputElement.getBoundingClientRect();
  console.log('TalkType: Input element rect:', inputRect);
  
  // Determine the type of input element
  const elementType = inputElement.tagName.toLowerCase();
  const isTextArea = elementType === 'textarea';
  const isContentEditable = inputElement.isContentEditable;
  const isLargeElement = isTextArea || isContentEditable || 
                        (inputRect.height > 40) || 
                        (elementType !== 'input' && elementType !== 'textarea');
  
  // IMPORTANT: Attach the button directly to the input's parent for proper positioning
  // This ensures it moves with the input and doesn't stay fixed when scrolling
  const inputParent = inputElement.parentElement;
  
  // First remove from document.body if it's there
  if (document.body.contains(micButton)) {
    document.body.removeChild(micButton);
  }
  
  // Then add to the parent element with relative positioning
  if (inputParent && !inputParent.contains(micButton)) {
    // Make sure parent has position style for proper child positioning
    const parentStyle = window.getComputedStyle(inputParent);
    if (parentStyle.position === 'static') {
      inputParent.style.position = 'relative';
    }
    
    inputParent.appendChild(micButton);
    
    // Change from absolute to relative positioning
    micButton.style.position = 'absolute';
    micButton.style.zIndex = '99999';
  }
  
  // Fallback to body if parent isn't available
  if (!inputParent && !document.body.contains(micButton)) {
    document.body.appendChild(micButton);
  }
  
  // If input is not visible, hidden, disabled, or has zero dimensions, hide the button
  const computedStyle = window.getComputedStyle(inputElement);
  if (inputRect.width === 0 || inputRect.height === 0 || 
      inputElement.offsetParent === null || 
      computedStyle.display === 'none' || 
      computedStyle.visibility === 'hidden' ||
      (inputElement.disabled === true) ||
      (inputElement.readOnly === true) ||
      // Check for opacity - if opacity is 0 or near 0, consider it hidden
      (parseFloat(computedStyle.opacity) < 0.1)) {
    micButton.style.display = 'none';
    return;
  }
  
  // Check if the element is part of the page and not in an iframe or overlay
  let isInPage = true;
  let parent = inputElement.parentElement;
  
  while (parent !== null) {
    const parentStyle = window.getComputedStyle(parent);
    // Check if parent is invisible or detached from the main document
    if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || 
        parseFloat(parentStyle.opacity) < 0.1) {
      isInPage = false;
      break;
    }
    parent = parent.parentElement;
  }
  
  if (!isInPage) {
    micButton.style.display = 'none';
    return;
  }
  
  // Show the button
  micButton.style.display = 'block';
  
  // Position calculation based on the element type
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  // For different element types, position differently
  let top, right; // Use right alignment instead of left for better positioning
  
  // Calculate position to ensure mic is always inside the input
  const padding = 8; // Minimum padding from edge
  
  // When positioned within parent, use relative positioning values
  if (isLargeElement) {
    // For large elements (textareas, contenteditable)
    top = padding;
    right = padding; // Positioned from right edge
  } else {
    // For standard inputs, position vertically centered
    top = (inputRect.height - 28) / 2; // Center vertically (button is 28px)
    right = padding + 5; // Position from right with padding
    
    // If input is too small, adjust position
    if (inputRect.height < 24) {
      top = 0; // Position at top
    }
  }
  
  // Set position relative to the parent element to ensure proper scrolling behavior
  micButton.style.top = `${top}px`;
  micButton.style.right = `${right}px`; // Use right instead of left
  micButton.style.left = 'auto'; // Clear any previous left value
  
  // Delay showing slightly to ensure position is set first
  setTimeout(() => {
    micButton.style.opacity = '0.8';
    micButton.style.transform = 'scale(1)';
  }, 10);
  
  // Only adjust padding for standard input elements
  if (elementType === 'input' || elementType === 'textarea') {
    // If input has a right padding of less than 30px, add padding to make room for the button
    const rightPadding = parseInt(computedStyle.paddingRight, 10) || 0;
    
    if (rightPadding < 25 && !inputElement.dataset.originalPadding) {
      // Store original padding
      inputElement.dataset.originalPadding = rightPadding;
      inputElement.style.paddingRight = '25px';
    }
  }
}

// Function to start recording
async function startRecording(targetInput, indicator) {
  console.log('TalkType: Starting recording with services:', !!audioService, !!apiService);
  
  // If services aren't initialized, show a helpful error and try to initialize again
  if (!audioService || !apiService) {
    console.error('TalkType: Services not initialized!');
    
    // Show error notification
    showStatusNotification('TalkType services not initialized. Trying to reconnect...', 'error');
    
    // Try to initialize again
    initializeExtension();
    
    // Wait a bit and check again
    setTimeout(() => {
      if (audioService && apiService) {
        console.log('TalkType: Services initialized! You can try recording now.');
        showStatusNotification('TalkType services connected! Try again.', 'success');
      } else {
        console.error('TalkType: Services failed to initialize!');
        showStatusNotification('Could not initialize TalkType. Please check your API key in options.', 'error');
      }
    }, 1000);
    
    return;
  }
  
  // Check if already recording
  if (isRecording) {
    console.log('TalkType: Already recording, ignoring start request');
    return;
  }
  
  try {
    // Comprehensive browser API debugging
    console.log('TalkType: Checking browser API support...');
    
    if (!navigator.mediaDevices) {
      console.error('TalkType: navigator.mediaDevices not available!');
      showStatusNotification('Your browser does not support media recording', 'error');
      return;
    }
    
    console.log('TalkType: mediaDevices API available:', !!navigator.mediaDevices);
    console.log('TalkType: getUserMedia available:', !!navigator.mediaDevices.getUserMedia);
    console.log('TalkType: MediaRecorder available:', typeof MediaRecorder !== 'undefined');
    
    // Check if recording is supported by audioService
    if (!audioService.isRecordingSupported()) {
      console.error('TalkType: Recording not supported according to audioService');
      showStatusNotification('Your browser does not support audio recording', 'error');
      return;
    }
    
    // Check permissions directly
    console.log('TalkType: Checking permissions...');
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        console.log('TalkType: Microphone permission status:', permissionStatus.state);
        
        if (permissionStatus.state === 'denied') {
          showStatusNotification('Microphone permission denied. Please enable in your browser settings.', 'error');
          return;
        }
      } catch (permError) {
        console.log('TalkType: Permission check error (this is normal in some browsers):', permError);
      }
    }
    
    // Update state
    isRecording = true;
    activeInput = targetInput;
    console.log('TalkType: Set isRecording=true, activeInput=', targetInput);
    
    // Show recording indicator with animations
    if (indicator) {
      console.log('TalkType: Showing recording indicator');
      indicator.style.display = 'block';
      
      // Find the mic button (parent of the indicator)
      const micButton = indicator.parentElement;
      if (micButton) {
        // Add wiggle animation to the mic icon
        const micIcon = micButton.querySelector('img');
        if (micIcon) {
          micIcon.style.animation = 'wiggle-mic 0.5s ease';
          setTimeout(() => {
            micIcon.style.animation = ''; // Remove animation after it completes
          }, 500);
        }
        
        // Add more prominent TalkType branded recording state
        micButton.style.opacity = '1';
        micButton.style.background = 'rgba(255, 64, 129, 0.2)';
        micButton.style.border = '1px solid rgba(255, 64, 129, 0.4)';
        micButton.style.boxShadow = '0 2px 8px rgba(255, 64, 129, 0.35)';
        micButton.style.filter = 'drop-shadow(0 0 4px rgba(255, 64, 129, 0.4))';
      }
    }
    
    // Show enhanced listening notification
    showStatusNotification('Listening... Click again when done speaking', 'recording');
    
    // Start recording with thorough error handling
    console.log('TalkType: Calling audioService.startRecording()...');
    try {
      await audioService.startRecording();
      console.log('TalkType: Recording started successfully for', targetInput);
    } catch (recError) {
      // This detailed error is handled below in the main catch block
      throw recError;
    }
    
    console.log('TalkType: Recording active for', targetInput);
  } catch (error) {
    console.error('TalkType: Failed to start recording:', error);
    
    // Handle different error types with user-friendly notifications instead of alerts
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      console.log('TalkType: Permission error detected:', error.name);
      
      // Create a detailed but friendly notification
      showStatusNotification('Microphone permission needed. Click the lock icon in your address bar and allow microphone access.', 'error');
      
      // Try to check system permissions too
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'microphone' })
          .then(permStatus => {
            console.log('TalkType: System permission status:', permStatus.state);
          })
          .catch(permErr => {
            console.log('TalkType: System permission check failed:', permErr);
          });
      }
      
      // On Mac, show a special notification
      if (navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
        console.log('TalkType: Mac detected, showing special message');
        setTimeout(() => {
          showStatusNotification('Mac users: Also check System Preferences → Security & Privacy → Microphone', 'info');
        }, 3000);
      }
    } else if (error.name === 'NotFoundError') {
      showStatusNotification('No microphone found. Please connect a microphone and try again.', 'error');
    } else if (error.name === 'TypeError' && error.message.includes('MediaRecorder')) {
      showStatusNotification('Your browser doesn\'t support audio recording. Try using Chrome or Edge.', 'error');
    } else {
      // Generic error with more details
      console.log('TalkType: General recording error:', error);
      showStatusNotification(`Recording error: ${error.message}`, 'error');
    }
    
    // Reset state
    isRecording = false;
    activeInput = null;
    console.log('TalkType: Reset recording state after error');
    
    // Hide recording indicator and update button state
    if (indicator) {
      indicator.style.display = 'none';
      
      // Reset button appearance
      const micButton = indicator.parentElement;
      if (micButton) {
        micButton.style.animation = '';
        micButton.style.opacity = '1';
        micButton.style.background = 'rgba(111, 66, 193, 0.15)';
        micButton.style.border = '1px solid rgba(111, 66, 193, 0.3)';
        micButton.style.boxShadow = '0 2px 6px rgba(111, 66, 193, 0.4)';
        micButton.style.filter = 'none';
      }
    }
    
    // Remove any recording notifications
    document.querySelectorAll('.audio-to-text-notification-recording').forEach(notification => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    });
  }
}

// Function to stop recording and process audio
async function stopRecording() {
  if (!audioService || !isRecording || !activeInput) {
    return;
  }
  
  try {
    // Stop recording and get audio blob
    const audioBlob = await audioService.stopRecording();
    
    // Update recording state
    isRecording = false;
    
    // Hide all recording indicators and reset button styling
    document.querySelectorAll('.audio-to-text-recording-indicator').forEach(indicator => {
      indicator.style.display = 'none';
      
      // Reset the parent button styling with smooth transition
      const micButton = indicator.parentElement;
      if (micButton) {
        micButton.style.boxShadow = '0 1px 3px rgba(111, 66, 193, 0.15)';
        micButton.style.transform = 'scale(1)';
        micButton.style.opacity = '0.9';
        micButton.style.background = 'rgba(111, 66, 193, 0.1)';
        micButton.style.border = '1px solid rgba(111, 66, 193, 0.2)';
        micButton.style.filter = 'none';
        
        // Add a modern finish animation
        const micIcon = micButton.querySelector('img');
        if (micIcon) {
          micIcon.style.animation = 'wiggle-mic 0.3s ease reverse';
          setTimeout(() => {
            micIcon.style.animation = '';
          }, 300);
        }
      }
    });
    
    // Remove any recording notifications
    document.querySelectorAll('.audio-to-text-notification-recording').forEach(notification => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    });
    
    // Process the audio data
    await processAudioData(audioBlob);
  } catch (error) {
    console.error('Failed to stop recording:', error);
    alert(`Failed to stop recording: ${error.message}`);
    
    // Reset state
    isRecording = false;
    activeInput = null;
    
    // Hide all recording indicators
    document.querySelectorAll('.audio-to-text-recording-indicator').forEach(indicator => {
      indicator.style.display = 'none';
    });
    
    // Also remove any recording notifications on error
    document.querySelectorAll('.audio-to-text-notification-recording').forEach(notification => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    });
  }
}

// Function to process audio data and get transcription
async function processAudioData(audioBlob) {
  if (!apiService || !activeInput) {
    return;
  }
  
  try {
    // Show processing indicator
    activeInput.classList.add('audio-to-text-processing');
    
    // Create a vaporwave processing notification with glass morphism
    const processingNotification = showStatusNotification('Transcribing...', 'processing');
    
    // Send audio to API for transcription
    const transcription = await apiService.transcribeAudio(audioBlob);
    
    // Insert transcribed text based on element type
    if (activeInput.isContentEditable) {
      // For contentEditable elements
      activeInput.textContent = transcription;
      
      // Trigger input event for reactive frameworks
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (activeInput.tagName === 'INPUT' || activeInput.tagName === 'TEXTAREA') {
      // For standard input/textarea elements
      activeInput.value = transcription;
      
      // Trigger input events to make sure any listeners are notified
      // This ensures that frameworks like React, Angular, etc. detect the change
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      activeInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // If it's a textarea, resize appropriately
      if (activeInput.tagName.toLowerCase() === 'textarea' && activeInput.scrollHeight > activeInput.clientHeight) {
        const originalHeight = activeInput.style.height;
        activeInput.style.height = 'auto';
        activeInput.style.height = (activeInput.scrollHeight) + 'px';
        
        // Reset after 1s to allow for any auto-resize scripts
        setTimeout(() => {
          if (originalHeight) {
            activeInput.style.height = originalHeight;
          }
        }, 1000);
      }
      
      // Focus the input and place cursor at the end
      activeInput.focus();
      
      // Set selection range if supported by this element
      if (typeof activeInput.setSelectionRange === 'function') {
        activeInput.setSelectionRange(transcription.length, transcription.length);
      }
    } else {
      // Fallback for other elements - try innerText
      try {
        activeInput.innerText = transcription;
        activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (e) {
        console.error('Unable to set text on element:', e);
      }
    }
    
    // Show simple success notification
    showStatusNotification('Transcription complete', 'success');
    
    console.log('Transcription complete:', transcription);
  } catch (error) {
    console.error('Transcription failed:', error);
    
    // Show error notification instead of alert
    showStatusNotification(`❌ Transcription failed: ${error.message}`, 'error');
  } finally {
    // Remove processing indicator
    activeInput.classList.remove('audio-to-text-processing');
    
    // Reset active input
    activeInput = null;
  }
}

// Function to show status notifications with enhanced visual appeal
function showStatusNotification(message, type = 'info') {
  console.log('TalkType: Showing notification -', message, type);
  
  // Don't show notifications if they were recently disabled
  if (window.audioToTextNotificationsDisabled) {
    return;
  }
  
  // Remove any existing notifications of the same type
  const existingNotifications = document.querySelectorAll(`.audio-to-text-notification-${type}`);
  existingNotifications.forEach(notification => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  });
  
  // Create notification element with enhanced glass morphism style
  const notification = document.createElement('div');
  notification.className = `audio-to-text-notification audio-to-text-notification-${type}`;
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
  notification.style.padding = '16px 20px';
  notification.style.borderRadius = '16px';
  notification.style.boxShadow = '0 10px 40px rgba(31, 38, 135, 0.3)';
  notification.style.zIndex = '99999'; // Very high z-index to ensure visibility
  notification.style.fontSize = '16px';
  notification.style.fontWeight = '600';
  notification.style.maxWidth = '350px';
  notification.style.opacity = '0';
  notification.style.transform = 'translateY(30px) scale(0.95)';
  notification.style.transition = 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)';
  notification.style.backdropFilter = 'blur(16px)';
  notification.style.webkitBackdropFilter = 'blur(16px)';
  notification.style.border = '2px solid rgba(255, 255, 255, 0.25)';
  notification.style.pointerEvents = 'all';
  
  // Create notification styles with animations if they don't exist yet
  if (!document.getElementById('talktype-notification-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'talktype-notification-styles';
    styleEl.textContent = `
      @keyframes talktype-gentle-pulse {
        0% { box-shadow: 0 8px 25px rgba(255, 255, 255, 0.3); border-color: rgba(255, 255, 255, 0.3); }
        50% { box-shadow: 0 12px 40px rgba(255, 255, 255, 0.5); border-color: rgba(255, 255, 255, 0.5); }
        100% { box-shadow: 0 8px 25px rgba(255, 255, 255, 0.3); border-color: rgba(255, 255, 255, 0.3); }
      }
      
      @keyframes talktype-gradientBg {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      
      @keyframes talktype-float {
        0% { transform: translateY(0px); }
        50% { transform: translateY(-5px); }
        100% { transform: translateY(0px); }
      }
      
      @keyframes talktype-sparkle {
        0%, 100% { opacity: 0; }
        50% { opacity: 1; }
      }
      
      .talktype-gradient-notification {
        background: linear-gradient(90deg, #4568DC, #7474BF, #348AC7, #56CCF2);
        background-size: 300% 100%;
        animation: talktype-gradientBg 3s ease infinite;
      }
      
      .talktype-recording-notification {
        background: linear-gradient(135deg, rgba(111, 66, 193, 0.85), rgba(70, 174, 247, 0.8));
        animation: talktype-gentle-pulse 2s infinite;
      }
      
      .talktype-success-notification {
        background: linear-gradient(135deg, rgba(76, 175, 80, 0.85), rgba(105, 220, 155, 0.8));
      }
      
      .talktype-error-notification {
        background: linear-gradient(135deg, rgba(244, 67, 54, 0.85), rgba(255, 87, 34, 0.8));
      }
      
      .talktype-notification-icon {
        display: inline-block;
        margin-right: 10px;
        vertical-align: middle;
        animation: talktype-float 2s ease-in-out infinite;
      }
      
      .talktype-sparkle {
        position: absolute;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background-color: white;
        opacity: 0;
      }
    `;
    document.head.appendChild(styleEl);
  }
  
  // Create notification content with icon and message
  let notificationIcon = '';
  
  // Set styles based on notification type with enhanced aesthetics
  if (type === 'error') {
    notification.classList.add('talktype-error-notification');
    notificationIcon = '❌';
  } else if (type === 'success') {
    notification.classList.add('talktype-success-notification');
    notificationIcon = '✓';
  } else if (type === 'recording') {
    notification.classList.add('talktype-recording-notification');
    notificationIcon = '🎤';
    
    // Add sparkle effects for recording
    for (let i = 0; i < 3; i++) {
      const sparkle = document.createElement('span');
      sparkle.className = 'talktype-sparkle';
      sparkle.style.top = `${Math.random() * 100}%`;
      sparkle.style.left = `${Math.random() * 100}%`;
      sparkle.style.animation = `talktype-sparkle ${1 + Math.random()}s ease-in-out infinite ${Math.random()}s`;
      notification.appendChild(sparkle);
    }
  } else if (type === 'processing') {
    notification.classList.add('talktype-gradient-notification');
    notificationIcon = '⚙️';
  } else {
    notification.style.background = 'linear-gradient(135deg, rgba(33, 150, 243, 0.85), rgba(3, 169, 244, 0.8))';
    notificationIcon = 'ℹ️';
  }
  
  // Create icon element
  const iconElement = document.createElement('span');
  iconElement.className = 'talktype-notification-icon';
  iconElement.textContent = notificationIcon;
  
  // Create message text element
  const messageElement = document.createElement('span');
  messageElement.textContent = message;
  messageElement.style.verticalAlign = 'middle';
  
  // Add icon and message to notification
  notification.appendChild(iconElement);
  notification.appendChild(messageElement);
  
  // Apply common styles
  notification.style.color = 'white';
  notification.style.display = 'flex';
  notification.style.alignItems = 'center';
  
  // Add close button with improved styling
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.style.background = 'transparent';
  closeButton.style.border = 'none';
  closeButton.style.color = 'white';
  closeButton.style.marginLeft = '15px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '22px';
  closeButton.style.lineHeight = '18px';
  closeButton.style.opacity = '0.8';
  closeButton.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
  closeButton.style.padding = '0 5px';
  closeButton.style.borderRadius = '50%';
  
  // Add hover effects to close button
  closeButton.onmouseenter = () => {
    closeButton.style.opacity = '1';
    closeButton.style.transform = 'scale(1.1)';
  };
  
  closeButton.onmouseleave = () => {
    closeButton.style.opacity = '0.8';
    closeButton.style.transform = 'scale(1)';
  };
  
  closeButton.onclick = () => {
    if (document.body.contains(notification)) {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(30px) scale(0.9)';
      
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 500);
    }
  };
  
  notification.appendChild(closeButton);
  
  // Add to DOM
  document.body.appendChild(notification);
  
  // Trigger enhanced entrance animation
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0) scale(1)';
  }, 10);
  
  // Auto-remove after timeout (except for recording notifications)
  if (type !== 'recording') {
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px) scale(0.95)';
        
        // Remove from DOM after transition
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 500);
      }
    }, 6000);
  }
  
  return notification;
}