// Main content script for the Audio to Text extension

// Import services from other scripts
// Note: These scripts need to be included in the manifest.json before this script

let audioService = null;
let apiService = null;
let isRecording = false;
let activeInput = null;
let apiKey = ''; // This should be set through extension options

// Initialize immediately to ensure the script runs on all pages
initializeExtension();

// Function to initialize the extension
async function initializeExtension() {
  console.log('Audio to Text extension initializing...');
  
  // Get API key from storage
  try {
    chrome.runtime.sendMessage({action: 'getApiKey'}, response => {
      if (chrome.runtime.lastError) {
        console.error('Error getting API key:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.apiKey) {
        apiKey = response.apiKey;
        
        // Initialize services
        audioService = new AudioRecordingService();
        apiService = new GeminiApiService(apiKey);
        
        // Initialize input detection
        initializeInputDetection();
        
        // Add observer to detect dynamically added inputs
        observeDynamicInputs();
        
        console.log('Audio to Text extension initialized successfully');
      } else {
        console.warn('No API key found. Microphone functionality will be limited.');
      }
    });
  } catch (error) {
    console.error('Failed to initialize Audio to Text extension:', error);
  }
}

// Also initialize on DOM content loaded to ensure it works in all scenarios
document.addEventListener('DOMContentLoaded', () => {
  if (!audioService || !apiService) {
    initializeExtension();
  }
});

// Function to initialize input detection
function initializeInputDetection() {
  // Find all possible text input elements on the page
  const allInputs = document.querySelectorAll('input, textarea');
  
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
  editableElements.forEach(element => {
    addMicrophoneToInput(element);
  });
  
  // Special handling for common sites (Reddit, Facebook, etc.)
  
  // Reddit comment boxes
  const redditCommentBoxes = document.querySelectorAll('.public-DraftEditor-content, .RichTextJSON-root');
  redditCommentBoxes.forEach(element => {
    if (!element.dataset.hasMicButton) {
      addMicrophoneToInput(element);
    }
  });
  
  // Facebook comment boxes
  const facebookCommentBoxes = document.querySelectorAll('[role="textbox"], [data-testid="post-composer"] div[contenteditable]');
  facebookCommentBoxes.forEach(element => {
    if (!element.dataset.hasMicButton) {
      addMicrophoneToInput(element);
    }
  });
  
  // Generic rich text editors
  const richTextEditors = document.querySelectorAll('.ql-editor, .jodit-wysiwyg, .ce-paragraph, .ProseMirror, [role="textbox"]');
  richTextEditors.forEach(element => {
    if (!element.dataset.hasMicButton) {
      addMicrophoneToInput(element);
    }
  });
}

// Function to observe for dynamically added inputs
function observeDynamicInputs() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach((node) => {
          // Check if the added node is an input element
          if (node.nodeName === 'INPUT' || node.nodeName === 'TEXTAREA') {
            // For inputs, check if they can accept text
            if (node.nodeName === 'INPUT') {
              const inputType = node.getAttribute('type') || 'text';
              const textTypes = ['text', 'search', 'email', 'url', 'tel', 'number', 'password', 
                                'date', 'datetime-local', 'time', 'month', 'week'];
              
              if (textTypes.includes(inputType.toLowerCase()) || !node.hasAttribute('type')) {
                addMicrophoneToInput(node);
              }
            } else {
              // All textareas can accept text
              addMicrophoneToInput(node);
            }
          } else if (node.hasAttribute && node.hasAttribute('contenteditable') && 
                     node.getAttribute('contenteditable') !== 'false') {
            // Handle contenteditable elements
            addMicrophoneToInput(node);
          }
          
          // Check for inputs inside the added node
          if (node.querySelectorAll) {
            // Check for all possible input types
            const inputs = node.querySelectorAll('input, textarea');
            inputs.forEach(input => {
              if (input.tagName.toLowerCase() === 'input') {
                const inputType = input.getAttribute('type') || 'text';
                const textTypes = ['text', 'search', 'email', 'url', 'tel', 'number', 'password', 
                                  'date', 'datetime-local', 'time', 'month', 'week'];
                
                if (textTypes.includes(inputType.toLowerCase()) || !input.hasAttribute('type')) {
                  addMicrophoneToInput(input);
                }
              } else {
                // All textareas can accept text
                addMicrophoneToInput(input);
              }
            });
            
            // Also check for contenteditable elements
            const editableElements = node.querySelectorAll('[contenteditable="true"]');
            editableElements.forEach(element => {
              addMicrophoneToInput(element);
            });
            
            // Special handling for common sites - check for social media inputs
            // Reddit
            const redditCommentBoxes = node.querySelectorAll('.public-DraftEditor-content, .RichTextJSON-root');
            redditCommentBoxes.forEach(element => {
              if (!element.dataset.hasMicButton) {
                addMicrophoneToInput(element);
              }
            });
            
            // Facebook
            const facebookCommentBoxes = node.querySelectorAll('[role="textbox"], [data-testid="post-composer"] div[contenteditable]');
            facebookCommentBoxes.forEach(element => {
              if (!element.dataset.hasMicButton) {
                addMicrophoneToInput(element);
              }
            });
            
            // Generic rich text editors
            const richTextEditors = node.querySelectorAll('.ql-editor, .jodit-wysiwyg, .ce-paragraph, .ProseMirror, [role="textbox"]');
            richTextEditors.forEach(element => {
              if (!element.dataset.hasMicButton) {
                addMicrophoneToInput(element);
              }
            });
          }
        });
      }
    });
  });
  
  // Start observing the document
  observer.observe(document.body, { childList: true, subtree: true });
}

// Function to add microphone icon to an input element
function addMicrophoneToInput(inputElement) {
  // Check if this input already has a microphone button
  if (inputElement.dataset.hasMicButton) {
    return;
  }
  
  // Mark this input as having a mic button
  inputElement.dataset.hasMicButton = 'true';
  
  // Get the mic icon URL
  const micIconUrl = chrome.runtime.getURL('icons/mic.svg');
  
  // Create microphone button
  const micButton = document.createElement('button');
  micButton.className = 'audio-to-text-mic-button';
  micButton.title = 'Click to dictate';
  micButton.style.position = 'absolute';
  micButton.style.zIndex = '9999';
  micButton.style.background = 'rgba(255, 255, 255, 0.05)';
  micButton.style.border = '1px solid rgba(255, 255, 255, 0.1)';
  micButton.style.borderRadius = '50%';
  micButton.style.cursor = 'pointer';
  micButton.style.width = '24px';
  micButton.style.height = '24px';
  micButton.style.padding = '2px';
  micButton.style.opacity = '0.8'; // Always visible
  micButton.style.transform = 'scale(0.85)';
  micButton.style.transition = 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28), opacity 0.3s ease, background 0.2s ease, box-shadow 0.2s ease';
  micButton.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
  micButton.style.backdropFilter = 'blur(2px)';
  micButton.style.webkitBackdropFilter = 'blur(2px)';
  micButton.style.display = 'block'; // Always visible
  
  // Create mic icon image
  const micIcon = document.createElement('img');
  micIcon.src = micIconUrl;
  micIcon.style.width = '100%';
  micIcon.style.height = '100%';
  micIcon.style.transition = 'transform 0.2s ease';
  micButton.appendChild(micIcon);
  
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
  
  // Add subtle tactile hover effects
  micButton.addEventListener('mouseenter', () => {
    micButton.style.opacity = '1';
    micButton.style.transform = 'scale(1.1)';
    micButton.style.boxShadow = '0 2px 8px rgba(111, 66, 193, 0.35)';
    micButton.style.background = 'rgba(111, 66, 193, 0.2)';
    micButton.style.border = '1px solid rgba(111, 66, 193, 0.4)';
  });
  
  micButton.addEventListener('mouseleave', () => {
    // Only change opacity if not recording
    if (!isRecording) {
      micButton.style.opacity = '0.8';
      micButton.style.transform = 'scale(1)';
      micButton.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
      micButton.style.background = 'rgba(255, 255, 255, 0.05)';
      micButton.style.border = '1px solid rgba(255, 255, 255, 0.1)';
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
  
  // Add click event to microphone button
  micButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (isRecording) {
      stopRecording();
    } else {
      startRecording(inputElement, recordingIndicator);
    }
  });
  
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
  const inputRect = inputElement.getBoundingClientRect();
  
  // Determine the type of input element
  const elementType = inputElement.tagName.toLowerCase();
  const isTextArea = elementType === 'textarea';
  const isContentEditable = inputElement.isContentEditable;
  const isLargeElement = isTextArea || isContentEditable || 
                        (inputRect.height > 40) || 
                        (elementType !== 'input' && elementType !== 'textarea');
  
  // Add the button to the document body for absolute positioning
  if (!document.body.contains(micButton)) {
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
  let top, left;
  
  // Calculate position to ensure mic is always inside the input
  const padding = 8; // Minimum padding from edge
  
  if (isLargeElement) {
    // For large elements (textareas, contenteditable)
    top = inputRect.top + scrollTop + padding - 3; // Position slightly higher
    left = inputRect.right + scrollLeft - 24 - padding; // Keep inside by padding amount
  } else {
    // For standard inputs, position vertically centered but slightly higher
    top = inputRect.top + scrollTop + (inputRect.height - 24) / 2 - 3;
    
    // Ensure it's always inside the input field, not outside
    left = inputRect.left + scrollLeft + inputRect.width - 24 - padding;
    
    // If input is too small, adjust position
    if (inputRect.height < 24) {
      top = inputRect.top + scrollTop + (inputRect.height - 20) / 2 - 3;
    }
  }
  
  // Make sure the button doesn't go off-screen
  const rightEdge = window.innerWidth + scrollLeft;
  if (left + 24 > rightEdge) {
    left = rightEdge - 30;
  }
  
  // Extra safety - ensure we're never outside the input boundaries
  const inputRight = inputRect.left + inputRect.width;
  if (left + 24 > inputRight + scrollLeft) {
    left = inputRight + scrollLeft - 24;
  }
  
  // Set position first, before showing
  micButton.style.top = `${top}px`;
  micButton.style.left = `${left}px`;
  
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
  if (!audioService || isRecording) {
    return;
  }
  
  try {
    // Check if recording is supported
    if (!audioService.isRecordingSupported()) {
      alert('Audio recording is not supported in this browser.');
      return;
    }
    
    // Update state
    isRecording = true;
    activeInput = targetInput;
    
    // Show recording indicator with animations
    if (indicator) {
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
        
        // Add a subtle highlight for recording state
        micButton.style.opacity = '1';
      }
    }
    
    // Show simple listening notification
    showStatusNotification('Listening...', 'recording');
    
    // Start recording
    await audioService.startRecording();
    
    console.log('Recording started for', targetInput);
  } catch (error) {
    console.error('Failed to start recording:', error);
    
    // Handle different error types
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      const permissionMessage = `
        Microphone permission denied. 
        
        Please allow microphone access in your browser settings:
        1. Click the lock icon in the address bar
        2. Find "Microphone" in the site permissions
        3. Change it to "Allow"
        4. Refresh the page and try again
      `;
      alert(permissionMessage);
    } else {
      alert(`Failed to start recording: ${error.message}`);
    }
    
    // Reset state
    isRecording = false;
    activeInput = null;
    
    // Hide recording indicator
    if (indicator) {
      indicator.style.display = 'none';
    }
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
        micButton.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
        micButton.style.transform = 'scale(1)';
        micButton.style.opacity = '0.7';
        micButton.style.background = 'rgba(255, 255, 255, 0.05)';
        micButton.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        
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

// Function to show status notifications
function showStatusNotification(message, type = 'info') {
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
  
  // Create notification element with glass morphism style
  const notification = document.createElement('div');
  notification.className = `audio-to-text-notification audio-to-text-notification-${type}`;
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
  notification.style.padding = '15px 20px';
  notification.style.borderRadius = '12px';
  notification.style.boxShadow = '0 8px 32px rgba(31, 38, 135, 0.2)';
  notification.style.zIndex = '10000';
  notification.style.fontSize = '15px';
  notification.style.fontWeight = '500';
  notification.style.maxWidth = '300px';
  notification.style.opacity = '0';
  notification.style.transform = 'translateY(20px) scale(0.98)';
  notification.style.transition = 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
  notification.style.backdropFilter = 'blur(12px)';
  notification.style.webkitBackdropFilter = 'blur(12px)';
  notification.style.border = '1px solid rgba(255, 255, 255, 0.18)';
  
  // Set styles based on notification type with lighter glass aesthetics
  if (type === 'error') {
    notification.style.background = 'linear-gradient(135deg, rgba(244, 67, 54, 0.75), rgba(255, 87, 34, 0.7))';
    notification.style.color = 'white';
    notification.style.border = '1px solid rgba(255, 255, 255, 0.4)';
  } else if (type === 'success') {
    notification.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.75), rgba(105, 220, 155, 0.7))';
    notification.style.color = 'white';
    notification.style.border = '1px solid rgba(255, 255, 255, 0.4)';
  } else if (type === 'recording') {
    notification.style.background = 'linear-gradient(135deg, rgba(111, 66, 193, 0.75), rgba(70, 174, 247, 0.7))';
    notification.style.color = 'white';
    notification.style.border = '1px solid rgba(255, 255, 255, 0.4)';
    
    // Add gentle pulse animation
    if (!document.getElementById('pulse-recording-style')) {
      const style = document.createElement('style');
      style.id = 'pulse-recording-style';
      style.textContent = `
        @keyframes gentle-pulse {
          0% { box-shadow: 0 0 5px rgba(255, 255, 255, 0.3); border-color: rgba(255, 255, 255, 0.3); }
          50% { box-shadow: 0 0 15px rgba(255, 255, 255, 0.5); border-color: rgba(255, 255, 255, 0.5); }
          100% { box-shadow: 0 0 5px rgba(255, 255, 255, 0.3); border-color: rgba(255, 255, 255, 0.3); }
        }
      `;
      document.head.appendChild(style);
    }
    
    notification.style.animation = 'gentle-pulse 2s infinite';
  } else if (type === 'processing') {
    // Create modern gradient animation for processing
    if (!document.getElementById('gradient-notification-styles')) {
      const gradientStyle = document.createElement('style');
      gradientStyle.id = 'gradient-notification-styles';
      gradientStyle.textContent = `
        @keyframes gradientBg {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .gradient-notification {
          background: linear-gradient(90deg, #4568DC, #7474BF, #348AC7, #56CCF2);
          background-size: 300% 100%;
          animation: gradientBg 3s ease infinite;
        }
      `;
      document.head.appendChild(gradientStyle);
    }
    
    notification.classList.add('gradient-notification');
    notification.style.color = 'white';
    notification.style.border = '1px solid rgba(255, 255, 255, 0.4)';
  } else {
    notification.style.background = 'linear-gradient(135deg, rgba(33, 150, 243, 0.75), rgba(3, 169, 244, 0.7))';
    notification.style.color = 'white';
    notification.style.border = '1px solid rgba(255, 255, 255, 0.4)';
  }
  
  // Set content
  notification.textContent = message;
  
  // Add close button
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.style.background = 'transparent';
  closeButton.style.border = 'none';
  closeButton.style.color = 'white';
  closeButton.style.marginLeft = '10px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.float = 'right';
  closeButton.style.fontSize = '18px';
  closeButton.style.lineHeight = '14px';
  closeButton.onclick = () => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  };
  notification.prepend(closeButton);
  
  // Add to DOM
  document.body.appendChild(notification);
  
  // Trigger animation with more flair
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0) scale(1)';
  }, 10);
  
  // Auto-remove after timeout (except for recording notifications)
  if (type !== 'recording') {
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(10px)';
        
        // Remove from DOM after transition
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 300);
      }
    }, 5000);
  }
  
  return notification;
}