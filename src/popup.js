// Popup script

// Global variables
let audioService = null;
let apiService = null;
let isRecording = false;
let recordingTimeout = null;
let hasActiveInput = false;
let activeInputInfo = null;
let smartModeEnabled = true; // Default to enabled
const MAX_RECORDING_TIME = 30000; // 30 seconds
const GEMINI_KEY_URL = 'https://aistudio.google.com/app/apikey';
const TALKTYPE_DEBUG = false;
const debugLog = (...args) => {
  if (TALKTYPE_DEBUG) console.log(...args);
};

async function getSetupState() {
  const result = await window.TalkTypeStorage.getWithApiKey(['apiKey', 'microphonePermission']);
  return {
    hasApiKey: Boolean(result.apiKey?.trim()),
    microphonePermission: result.microphonePermission || 'unknown'
  };
}

async function updateSetupCard() {
  const setupCard = document.getElementById('setup-card');
  const setupHint = document.getElementById('setup-hint');
  const setupList = document.querySelector('.setup-list');

  if (!setupCard || !setupHint || !setupList) return;

  const { hasApiKey, microphonePermission } = await getSetupState();
  const micReady = microphonePermission === 'granted';

  if (hasApiKey && micReady) {
    setupCard.style.display = 'none';
    return;
  }

  setupCard.style.display = 'block';

  if (!hasApiKey) {
    setupHint.textContent =
      'Start with your Gemini key. TalkType stores it locally in Chrome and sends audio straight to Google.';
    setupList.innerHTML = `
      <li>Add your Gemini API key</li>
      <li>Grant microphone access</li>
      <li>Click into any text box and start talking</li>
    `;
    return;
  }

  setupHint.textContent =
    'Your key is set. Next up: microphone access, then try TalkType inside Gmail, Slack, Notion, or any text box.';
  setupList.innerHTML = `
    <li>Grant microphone access</li>
    <li>Click into a text box on the current page</li>
    <li>Hit record and TalkType will place the text at your cursor</li>
  `;
}

// Check if API key is set
async function checkApiKey() {
  const result = await window.TalkTypeStorage.getWithApiKey(['apiKey']);
  const apiKeyError = document.getElementById('apiKeyError');
  const recordButton = document.getElementById('startRecording');
  
  if (!result.apiKey) {
    apiKeyError.style.display = 'block';
    recordButton.classList.add('disabled');
    recordButton.disabled = true;
    updateSetupCard();
    return false;
  } else {
    apiKeyError.style.display = 'none';
    recordButton.classList.remove('disabled');
    recordButton.disabled = false;
    updateSetupCard();
    return true;
  }
}

// Open options page
function openOptions() {
  chrome.runtime.openOptionsPage();
}

// Start recording immediately
async function startRecording() {
  if (isRecording) return;
  
  // Show transcription area
  const transcriptionContainer = document.getElementById('transcription-container');
  transcriptionContainer.style.display = 'block';
  const transcriptionText = document.getElementById('transcription-text');
  transcriptionText.textContent = '';
  
  // Hide copy button when starting a new recording
  const copyButtonWrapper = document.getElementById('copy-button-wrapper');
  if (copyButtonWrapper) {
    copyButtonWrapper.style.display = 'none';
  }
  
  // Update status
  const statusElement = document.getElementById('status');
  const recordButton = document.getElementById('startRecording');
  
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
    document.getElementById('recording-container').classList.add('active');
    const recordingAnimation = document.getElementById('recording-animation');
    recordingAnimation.classList.add('active');
    
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
    const settingsButton = document.getElementById('options');
    if (settingsButton) {
      settingsButton.style.display = 'none';
    }
    
    // Start recording
    await audioService.startRecording();
    isRecording = true;
    
    // Auto-stop after MAX_RECORDING_TIME
    recordingTimeout = setTimeout(() => {
      if (isRecording) {
        stopRecording();
      }
    }, MAX_RECORDING_TIME);
    
  } catch (error) {
    console.error('Error starting recording:', error);
    handleRecordingError(error);
  }
}

// Function to show clipboard notification
function showClipboardNotification() {
  // Remove any existing notification first
  const existingNotification = document.querySelector('.clipboard-notification');
  if (existingNotification) {
    document.body.removeChild(existingNotification);
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'clipboard-notification';
  notification.innerHTML = `
    <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
    </svg>
    <span>Copied to clipboard</span>
  `;
  document.body.appendChild(notification);
  
  // Add styles if not already added
  if (!document.getElementById('clipboard-notification-style')) {
    const style = document.createElement('style');
    style.id = 'clipboard-notification-style';
    style.textContent = `
      .clipboard-notification {
        position: fixed;
        top: 20px !important;
        bottom: auto !important;
        left: 50%;
        transform: translateX(-50%) translateY(-30px);
        background: rgba(52, 168, 83, 0.85);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        display: flex;
        align-items: center;
        font-size: 13px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        z-index: 1000;
      }
      .clipboard-notification.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      .clipboard-notification .icon {
        width: 18px;
        height: 18px;
        margin-right: 8px;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Animate in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Animate out and remove
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 2000);
}

// Stop recording and transcribe
async function stopRecording() {
  if (!isRecording || !audioService) return;
  
  // Clear timeout
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }
  
  const statusElement = document.getElementById('status');
  const recordButton = document.getElementById('startRecording');
  const recordingAnimation = document.getElementById('recording-animation');
  const transcriptionText = document.getElementById('transcription-text');
  
  try {
    // Hide recording animation
    document.getElementById('recording-container').classList.remove('active');
    recordingAnimation.classList.remove('active');

    // Update status indicator
    statusElement.innerHTML = '<div class="status-indicator"><span class="pulse-dot" style="background-color: rgb(255, 64, 129);"></span><span class="status-text">Processing</span></div>';
    
    // Stop recording and get audio data
    const audioBlob = await audioService.stopRecording();
    isRecording = false;
    
    // Transform recording button into progress bar
    transformButtonToProgressBar(recordButton);
    
    // Get API key and create fresh service instance to avoid stale state
    const { apiKey, transcriptionStyle } =
      await window.TalkTypeStorage.getWithApiKey(['apiKey', 'transcriptionStyle']);

    if (!apiKey || !apiKey.trim()) {
      throw new Error('Missing Gemini API key. Add it in settings first.');
    }

    // Create a new API service instance to prevent stale state
    apiService = null;
    apiService = new GeminiApiService(apiKey);
    if (transcriptionStyle) apiService.setStyle(transcriptionStyle);

    // Update status indicator with random fun messages
    showTranscribingStatus(statusElement, true);
    
    // Actually transcribe the audio
    const transcription = await apiService.transcribeAudio(audioBlob, updateProgressCallback);
    
    // Complete the progress animation
    completeProgressAnimation();
    
    // Dynamically adjust the transcription container height based on content
    const adjustTranscriptionContainer = (text) => {
      const transcriptionContainer = document.getElementById('transcription-container');
      const transcriptionText = document.getElementById('transcription-text');
      
      if (!transcriptionContainer || !transcriptionText) return;
      
      // Reset any previous inline styles to get natural height
      transcriptionText.style.maxHeight = '';
      
      // Set the text content first
      transcriptionText.textContent = text || 'No speech detected.';
      
      // Calculate optimal height based on content
      const textHeight = transcriptionText.scrollHeight;
      const maxHeight = 250; // Match CSS max-height value
      
      // Set an appropriate max-height
      if (textHeight > maxHeight) {
        // If content is larger than max height, enable scrolling
        transcriptionText.style.maxHeight = `${maxHeight}px`;
        transcriptionText.style.overflowY = 'auto';
        
        // Ensure the container expands to max allowed height
        transcriptionContainer.style.height = 'auto';
        transcriptionContainer.style.overflowY = 'auto';
      } else {
        // If content fits, disable scrolling and set exact height
        transcriptionText.style.maxHeight = `${textHeight}px`;
        transcriptionText.style.overflowY = 'hidden';
        
        // Adjust container height to fit content exactly
        transcriptionContainer.style.height = 'auto';
        transcriptionContainer.style.overflowY = 'hidden';
      }
      
      // Force reflow to ensure animation works
      transcriptionContainer.offsetHeight;
    };
    
    // Try to insert text into the active input field if in smart mode
    if (smartModeEnabled && hasActiveInput && transcription && transcription.trim()) {
      try {
        console.log('Smart Mode enabled and active input detected, attempting to insert text');
        
        // Send message to content script to insert the transcription
        const activeTab = await new Promise(resolve => {
          chrome.tabs.query({active: true, currentWindow: true}, tabs => {
            resolve(tabs[0]);
          });
        });
        
        if (activeTab && activeTab.id) {
          // Try to insert the transcription into the active input
          const response = await chrome.tabs.sendMessage(activeTab.id, {
            action: 'insertTranscription',
            text: transcription
          });
          
          console.log('Insertion response:', response);
          
          if (response && response.success) {
            // If successful, still copy to clipboard as a backup
            try {
              await navigator.clipboard.writeText(transcription);
            } catch (clipErr) {
              console.warn('Failed to copy text after insertion: ', clipErr);
            }
            
            // Show success indicator
            statusElement.innerHTML = '<div class="status-indicator status-complete"><span class="pulse-dot"></span><span class="status-text">Inserted</span></div>';
            
            // Still show the text in the popup with dynamic height adjustment
            transcriptionText.style.opacity = '0';
            transcriptionText.style.transition = 'opacity 0.3s ease';
            
            // Apply dynamic height adjustment
            adjustTranscriptionContainer(transcription);
            
            transcriptionText.style.opacity = '1';
            
            // Show copy button
            const copyButtonWrapper = document.getElementById('copy-button-wrapper');
            if (copyButtonWrapper) {
              copyButtonWrapper.style.display = 'block';
            }
            
            // Reset status after a delay
            setTimeout(() => {
              if (!isRecording) {
                statusElement.innerHTML = '<div class="status-indicator status-ready"><span class="pulse-dot"></span><span class="status-text">Ready</span></div>';
                updateSmartModeUI(); // Update to show current smart mode status
              }
            }, 3000);
            
            return; // Exit early as we've handled the insertion
          }
        }
      } catch (insertErr) {
        console.error('Error inserting transcription into active input:', insertErr);
        // Continue with normal flow if insertion fails
      }
    }
    
    // If smart mode insertion failed or was not attempted, handle normally
    
    // Copy to clipboard
    if (transcription && transcription.trim()) {
      try {
        await navigator.clipboard.writeText(transcription);
        // Clipboard notification will be shown by completeProgressAnimation
        // No need to call showClipboardNotification() here to avoid duplicate notifications
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
    
    // Show the transcription with "Complete" status
    statusElement.innerHTML = '<div class="status-indicator status-complete"><span class="pulse-dot"></span><span class="status-text">Complete</span></div>';
    
    // Reset status to "Ready" after 3 seconds
    setTimeout(() => {
      if (!isRecording) {
        statusElement.innerHTML = '<div class="status-indicator status-ready"><span class="pulse-dot"></span><span class="status-text">Ready</span></div>';
        updateSmartModeUI(); // Update to show current smart mode status
      }
    }, 3000);
    
    // Animate the transcription text with dynamic height
    transcriptionText.style.opacity = '0';
    transcriptionText.style.transition = 'opacity 0.3s ease';
    
    // Apply dynamic height adjustment
    adjustTranscriptionContainer(transcription);
    
    // Show with animation
    transcriptionText.style.opacity = '1';
    
    // Show copy button when transcription is available
    const copyButtonWrapper = document.getElementById('copy-button-wrapper');
    if (copyButtonWrapper) {
      copyButtonWrapper.style.display = 'block';
    }
    
  } catch (error) {
    console.error('Error in recording/transcription:', error);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `<svg class="icon" style="color: #ff5252" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path></svg>`;
    const errorSpan = document.createElement('span');
    errorSpan.textContent = 'Error: ' + error.message;
    errorDiv.appendChild(errorSpan);
    statusElement.textContent = '';
    statusElement.appendChild(errorDiv);
    transcriptionText.textContent = 'Transcription failed. Please try again.';
    
    // Restore button in case of error
    recordButton.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path fill="currentColor" d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      </svg>
      Record & Transcribe
    `;
    recordButton.disabled = false;
    recordButton.classList.remove('button-progress-container');
    
    // Show settings button again
    const settingsButton = document.getElementById('options');
    if (settingsButton) {
      settingsButton.style.display = 'block';
    }
  }
}

// Transform button into progress bar
function transformButtonToProgressBar(button) {
  // Add the progress bar styles if not already added
  if (!document.getElementById('progress-bar-styles')) {
    const progressStyles = document.createElement('style');
    progressStyles.id = 'progress-bar-styles';
    progressStyles.textContent = `
      /* Gradient Progress Bar */
      .button-progress-container {
        position: relative;
        overflow: hidden;
        border-radius: 16px;
      }
      
      .button-progress-bar {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 0%;
        background: var(--progress-gradient);
        background-size: 200% 100%;
        border-radius: 16px;
        transition: width 0.3s ease;
        z-index: 0;
        opacity: 0.85;
      }
      
      .button-progress-bar.complete {
        animation: gradient-shift 1.5s ease forwards, glow 1.5s ease forwards;
      }
      
      .button-progress-bar::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 50%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        animation: progress-shine 2s infinite;
      }
      
      .button-progress-content {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
      }
      
      @keyframes progress-shine {
        0% { left: -100%; }
        100% { left: 200%; }
      }
      
      @keyframes gradient-shift {
        0% { background-position: 0% 50%; }
        100% { background-position: 100% 50%; }
      }
      
      @keyframes glow {
        0% { box-shadow: 0 0 5px rgba(111, 66, 193, 0.3); }
        50% { box-shadow: 0 0 20px rgba(111, 66, 193, 0.6), 0 0 30px rgba(247, 70, 180, 0.4); }
        100% { box-shadow: 0 0 10px rgba(111, 66, 193, 0.5); }
      }
      
      /* Copy notification */
      .copy-notification {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(30px);
        background: rgba(52, 168, 83, 0.85);
        color: white;
        padding: 10px 18px;
        border-radius: 30px;
        font-size: 14px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        z-index: 2000;
        display: flex;
        align-items: center;
      }
      
      .copy-notification.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
      
      .copy-notification svg {
        margin-right: 8px;
        width: 16px;
        height: 16px;
      }
    `;
    document.head.appendChild(progressStyles);
  }
  
  // Preserve button content
  const buttonContent = button.innerHTML;
  
  // Transform button to progress bar
  button.classList.add('button-progress-container');
  button.disabled = true;
  
  // Create progress structure
  button.innerHTML = `
    <div id="progress-bar" class="button-progress-bar"></div>
    <div class="button-progress-content">
      <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M6 2l12 10-12 10V2z"/>
      </svg>
      <span>Processing</span>
    </div>
  `;
  
  // Hide settings button while showing progress
  const settingsButton = document.getElementById('options');
  if (settingsButton) {
    settingsButton.style.display = 'none';
  }
  
  // Store original content for later restoration
  button.dataset.originalContent = buttonContent;
  
  // Start progress animation
  startFakeProgressAnimation();
}

// Start fake progress animation
function startFakeProgressAnimation() {
  let fakeProgress = 0;
  window.progressInterval = setInterval(() => {
    if (fakeProgress < 30) {
      fakeProgress += 3; // Fast initial progress
    } else if (fakeProgress < 60) {
      fakeProgress += 1.5; // Still fast
    } else if (fakeProgress < 85) {
      fakeProgress += 0.8; // Medium speed
    } else if (fakeProgress < 95) {
      fakeProgress += 0.3; // Slow down
    }
    
    // Cap at 95%
    if (fakeProgress > 95) {
      fakeProgress = 95;
      clearInterval(window.progressInterval);
    }
    
    // Update progress bar
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
      progressBar.style.width = fakeProgress + '%';
    }
  }, 40); // Slightly slower interval for smoother animation
}

// Show transcribing status with animation and random fun messages
function showTranscribingStatus(container, randomMessage = false) {
  // Update the status to indicate processing is happening
  const statusElement = document.getElementById('status');
  if (statusElement) {
    // Array of fun processing messages
    const processingMessages = [
      "Processing",
      "Magic happening",
      "Converting soundwaves",
      "Neural magic",
      "Translating voice",
      "Brain thinking",
      "Decoding speech",
      "Putting words together",
      "Making sense of audio",
      "Hang tight",
      "Almost there",
      "Processing audio"
    ];
    
    // Choose a message - either random or default
    const message = randomMessage ? 
      processingMessages[Math.floor(Math.random() * processingMessages.length)] : 
      "Processing";
    
    statusElement.innerHTML = `
      <div class="status-indicator status-processing">
        <span class="pulse-dot"></span>
        <span class="status-text">${message}...</span>
      </div>
    `;
  }
  
  // Progress bar animation is handled by startFakeProgressAnimation()
}

// Callback for progress updates
function updateProgressCallback(status, percentage) {
  // This function can be used to update UI based on real progress
  // For now we're using fake progress for a smoother experience
  console.log(`Transcription progress: ${status} (${percentage}%)`);
}

// Complete progress animation
function completeProgressAnimation() {
  // Clear any existing interval
  if (window.progressInterval) {
    clearInterval(window.progressInterval);
  }
  
  // Get the progress bar
  const progressBar = document.getElementById('progress-bar');
  if (progressBar) {
    // Set to 100% with satisfying finish
    progressBar.style.width = '100%';
    progressBar.style.transition = 'width 0.5s cubic-bezier(0.1, 0.9, 0.2, 1.2)';
    progressBar.classList.add('complete');
    
    // Update the progress content text to show "Complete"
    const progressContent = document.querySelector('.button-progress-content span');
    if (progressContent) {
      progressContent.textContent = 'Complete';
    }
    
    // Update icon to checkmark
    const progressIcon = document.querySelector('.button-progress-content svg path');
    if (progressIcon) {
      progressIcon.setAttribute('d', 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z');
    }
    
    // Show the copy notification
    setTimeout(() => {
      showCopyNotification();
      
      // Restore button after a short delay
      setTimeout(() => {
        const recordButton = document.getElementById('startRecording');
        
        if (recordButton) {
          // Always use the original mic icon and "Record & Transcribe" text
          recordButton.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path fill="currentColor" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path fill="currentColor" d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            </svg>
            Record & Transcribe
          `;
          recordButton.classList.remove('button-progress-container');
          recordButton.disabled = false;
          delete recordButton.dataset.originalContent;

          // Restore the settings button once processing finishes.
          const settingsButton = document.getElementById('options');
          if (settingsButton) {
            settingsButton.style.display = 'block';
          }
        }
      }, 1200); // Slightly longer delay to ensure user sees "Complete" state
    }, 800); // Wait for animation to complete
  }
}

// Show copy notification
function showCopyNotification() {
  // Create notification if it doesn't exist
  if (!document.getElementById('copy-notification')) {
    const notification = document.createElement('div');
    notification.id = 'copy-notification';
    notification.className = 'copy-notification';
    notification.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="currentColor"/>
      </svg>
      <span>Copied to clipboard</span>
    `;
    document.body.appendChild(notification);
    
    // Add custom styles for top notification
    const notifStyle = document.createElement('style');
    notifStyle.id = 'top-notification-style';
    notifStyle.textContent = `
      .copy-notification {
        position: fixed;
        top: 20px !important;
        bottom: auto !important;
        left: 50%;
        transform: translateX(-50%) translateY(-40px);
        background: rgba(52, 168, 83, 0.85);
        color: white;
        padding: 10px 18px;
        border-radius: 30px;
        font-size: 14px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        z-index: 2000;
        display: flex;
        align-items: center;
      }
      
      .copy-notification.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
    `;
    document.head.appendChild(notifStyle);
  }
  
  const notification = document.getElementById('copy-notification');
  
  // Show the notification
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  
  // Hide after 2.5 seconds
  setTimeout(() => {
    notification.classList.remove('show');
  }, 2500);
}

// Handle recording errors
function handleRecordingError(error) {
  const statusElement = document.getElementById('status');
  const recordButton = document.getElementById('startRecording');
  
  // Reset button state
  recordButton.innerHTML = `
    <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path fill="currentColor" d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    </svg>
    Record & Transcribe
  `;
  
  // Hide animation
  document.getElementById('recording-container').classList.remove('active');
  document.getElementById('recording-animation').classList.remove('active');

  // Handle permission errors specially
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
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
    const permButton = document.getElementById('fixPermissions');
    if (permButton) {
      permButton.style.display = 'block';
    }
  } else {
    // Show other errors
    const errorDiv2 = document.createElement('div');
    errorDiv2.className = 'error-message';
    errorDiv2.innerHTML = `<svg class="icon" style="color: #ff5252" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path></svg>`;
    const errorSpan2 = document.createElement('span');
    errorSpan2.textContent = 'Error: ' + error.message;
    errorDiv2.appendChild(errorSpan2);
    statusElement.textContent = '';
    statusElement.appendChild(errorDiv2);
  }
  
  // Add error message styling
  if (!document.getElementById('error-message-style')) {
    const style = document.createElement('style');
    style.id = 'error-message-style';
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
  const permissionDialog = document.getElementById('permissionDialog');
  permissionDialog.style.display = 'flex';
  
  // Force reflow before adding show class to ensure animation works
  permissionDialog.offsetHeight;
  permissionDialog.classList.add('show');
  
  // Setup permission button
  const permissionBtn = document.getElementById('permissionBtn');
  const permissionStatus = document.getElementById('permission-status');
  
  // Add click handler for permission button
  permissionBtn.onclick = async () => {
    try {
      // Request microphone access directly
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Stop the stream right away, we just needed permission
      stream.getTracks().forEach(track => track.stop());
      
      // Store permission status
      chrome.storage.sync.set({ microphonePermission: 'granted' });
      
      // Show success message
      permissionStatus.textContent = 'Microphone access granted!';
      permissionStatus.style.color = '#a0ff9d';
      
      permissionBtn.textContent = 'Access Granted';
      permissionBtn.disabled = true;
      permissionBtn.style.backgroundColor = 'rgba(76, 175, 80, 0.7)';
      
      // Close the dialog after a short delay
      setTimeout(() => {
        permissionDialog.style.display = 'none';
        permissionDialog.classList.remove('show');
        // Refresh the status message
        document.getElementById('status').textContent = 'Ready to transcribe! Microphone access granted.';
      }, 1500);
      
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
      
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
  document.getElementById('closeDialog').onclick = () => {
    permissionDialog.classList.remove('show');
    setTimeout(() => {
      permissionDialog.style.display = 'none';
    }, 200); // Matches transition time
  };
}

// Pre-load initialization - start without waiting for DOM content
const startInit = () => {
  // Pre-initialize global services
  audioService = new AudioRecordingService();
};

// Run pre-initialization immediately
startInit();

// Function to update UI based on smart mode and active input state
function updateSmartModeUI() {
  const statusElement = document.getElementById('status');
  if (!statusElement) return;
  
  // Don't override status if recording
  if (isRecording) return;
  
  // Get current smart mode status
  chrome.storage.sync.get(['smartModeEnabled'], (result) => {
    // Update global variable
    smartModeEnabled = result.smartModeEnabled !== false;
    
    // Update UI based on smart mode and active input
    if (smartModeEnabled) {
      if (hasActiveInput) {
        // Smart mode is on and has active input
        statusElement.innerHTML = `
          <div class="status-indicator status-ready">
            <span class="pulse-dot"></span>
            <span class="status-text">Smart Mode: Ready</span>
          </div>
        `;
      } else {
        // Smart mode is on but no active input
        statusElement.innerHTML = `
          <div class="status-indicator">
            <span class="pulse-dot"></span>
            <span class="status-text">Smart Mode (No Input)</span>
          </div>
        `;
      }
    } else {
      // Smart mode is off
      statusElement.innerHTML = `
        <div class="status-indicator status-ready">
          <span class="pulse-dot"></span>
          <span class="status-text">Ready</span>
        </div>
      `;
    }
  });
}

// Function to check for active input in the current page
async function checkActiveInputStatus() {
  try {
    // Get the active tab
    const tabs = await new Promise(resolve => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        resolve(tabs);
      });
    });
    
    if (!tabs || !tabs[0]) {
      console.log('No active tab found');
      hasActiveInput = false;
      return;
    }
    
    // Ask content script if there's an active input
    const response = await new Promise(resolve => {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'checkActiveInput'}, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Error checking active input:', chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
    
    if (response) {
      hasActiveInput = response.hasActiveInput;
      activeInputInfo = response.inputInfo;
      debugLog('Active input status:', hasActiveInput);
      
      // Update UI based on active input status
      updateSmartModeUI();
    } else {
      hasActiveInput = false;
      activeInputInfo = null;
      
      // Update UI for no active input
      updateSmartModeUI();
    }
  } catch (error) {
    console.error('Error checking active input status:', error);
    hasActiveInput = false;
    activeInputInfo = null;
  }
}

// Initialize the popup
document.addEventListener('DOMContentLoaded', async () => {
  // Force immediate rendering
  document.body.style.display = 'block';
  document.body.style.opacity = '1';
  
  // Check API key in parallel with rendering
  checkApiKey();
  updateSetupCard();
  
  // Get smart mode setting
  chrome.storage.sync.get(['smartModeEnabled'], (result) => {
    smartModeEnabled = result.smartModeEnabled !== false; // Default to true if not set
    console.log('Smart mode enabled:', smartModeEnabled);
    
    // Check for active input in the current page
    checkActiveInputStatus();
  });
  
  // Apply theme based on user preference or system preference
  initializeTheme();
  
  // Listen for message updates from the background script about active input changes
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updateSmartModeStatus') {
      console.log('Received smart mode status update:', message);
      hasActiveInput = message.hasActiveInput;
      activeInputInfo = message.inputInfo;
      
      // Update UI based on new status
      updateSmartModeUI();
    }
  });
  
  // Set up RECORD BUTTON
  const recordButton = document.getElementById('startRecording');
  recordButton.addEventListener('click', async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  });
  
  // Set up COPY BUTTON
  const copyButton = document.getElementById('copy-button');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      const transcriptionText = document.getElementById('transcription-text');
      if (transcriptionText && transcriptionText.textContent) {
        try {
          await navigator.clipboard.writeText(transcriptionText.textContent);
          showClipboardNotification();
        } catch (err) {
          console.error('Failed to copy: ', err);
        }
      }
    });
    
    // Add hover effect (more subtle without shadow)
    copyButton.addEventListener('mouseenter', () => {
      copyButton.style.transform = 'scale(1.15)';
      copyButton.style.opacity = '1';
    });
    
    copyButton.addEventListener('mouseleave', () => {
      copyButton.style.transform = 'scale(1)';
      copyButton.style.opacity = '0.8';
    });
    
    copyButton.addEventListener('mousedown', () => {
      copyButton.style.transform = 'scale(0.95)';
    });
    
    copyButton.addEventListener('mouseup', () => {
      copyButton.style.transform = 'scale(1.15)';
    });
  }

  const setupOpenOptionsButton = document.getElementById('setup-open-options');
  if (setupOpenOptionsButton) {
    setupOpenOptionsButton.addEventListener('click', openOptions);
  }

  const setupOpenGeminiButton = document.getElementById('setup-open-gemini');
  if (setupOpenGeminiButton) {
    setupOpenGeminiButton.addEventListener('click', () => {
      chrome.tabs.create({ url: GEMINI_KEY_URL });
    });
  }
  
  // Add Smart Mode toggle to the UI
  const buttonsContainer = document.querySelector('.buttons');
  if (buttonsContainer) {
    // Add Smart Mode toggle button at the top
    const smartModeButton = document.createElement('button');
    smartModeButton.id = 'smartModeToggle';
    smartModeButton.className = 'smart-mode-button';
    smartModeButton.innerHTML = `
      <div class="toggle-container">
        <span>Smart Mode</span>
        <label class="switch">
          <input type="checkbox" id="smartModeCheckbox" ${smartModeEnabled ? 'checked' : ''}>
          <span class="slider round"></span>
        </label>
      </div>
    `;
    
    // Add button at the beginning of the container
    buttonsContainer.insertBefore(smartModeButton, buttonsContainer.firstChild);
    
    // Add styles for the toggle
    const style = document.createElement('style');
    style.textContent = `
      .smart-mode-button {
        background: linear-gradient(135deg, rgba(111, 66, 193, 0.6), rgba(70, 174, 247, 0.5)) !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 10px 15px !important;
      }
      
      .toggle-container {
        display: flex;
        width: 100%;
        justify-content: space-between;
        align-items: center;
      }
      
      .switch {
        position: relative;
        display: inline-block;
        width: 40px;
        height: 24px;
      }
      
      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      
      .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(255, 255, 255, 0.3);
        transition: .4s;
      }
      
      .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .4s;
      }
      
      input:checked + .slider {
        background-color: rgba(70, 230, 130, 0.7);
      }
      
      input:checked + .slider:before {
        transform: translateX(16px);
      }
      
      .slider.round {
        border-radius: 34px;
      }
      
      .slider.round:before {
        border-radius: 50%;
      }
    `;
    document.head.appendChild(style);
    
    // Add event listener for smart mode toggle
    const checkbox = document.getElementById('smartModeCheckbox');
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        smartModeEnabled = e.target.checked;
        
        // Save setting to storage
        chrome.storage.sync.set({ smartModeEnabled });
        
        // Update smart mode UI
        updateSmartModeUI();
        
        // Notify content script about the change
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'toggleSmartMode',
              enabled: smartModeEnabled
            });
          }
        });
      });
    }
  }
  
  // Set up SETTINGS BUTTON
  const settingsButton = document.getElementById('options');
  settingsButton.addEventListener('click', (e) => {
    e.preventDefault();
    console.log("Settings button clicked");
    
    // Add popup styles if not already added
    if (!document.getElementById('settings-popup-styles')) {
      const popupStyles = document.createElement('style');
      popupStyles.id = 'settings-popup-styles';
      popupStyles.textContent = `
        .settings-popup {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: settings-appear 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          padding: 16px;
          box-sizing: border-box;
        }
        
        @keyframes settings-appear {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        
        .settings-content {
          position: relative;
          width: 100%;
          padding: 25px 20px 20px;
          border-radius: 18px;
          text-align: center;
          background: linear-gradient(225deg, rgba(255, 255, 255, 0.9), rgba(240, 245, 255, 0.95));
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 2px solid var(--glass-border);
          box-shadow: 0 2px 20px rgba(0, 0, 0, 0.08);
          animation: content-appear 0.25s cubic-bezier(0.23, 1, 0.32, 1) forwards;
          transform: translateY(10px) scale(0.95);
          opacity: 0;
          max-width: 280px;
          margin: 0 auto;
          box-sizing: border-box;
          overflow: visible;
        }
        
        /* Add particle background to match main UI */
        .settings-content::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 18px;
          background-image: url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23bfcaff' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E");
          opacity: 0.3;
          z-index: 0;
          pointer-events: none;
        }
        
        /* Add beam effect to match main UI */
        .settings-content::before {
          content: '';
          position: absolute;
          width: 150%;
          height: 60px;
          background: linear-gradient(90deg, rgba(111, 66, 193, 0), rgba(255, 255, 255, 0.05), rgba(111, 66, 193, 0));
          transform: rotate(-45deg);
          top: -30px;
          left: -20%;
          animation: beam 12s linear infinite;
          z-index: 0;
          opacity: 0.5;
          border-radius: 18px;
          overflow: hidden;
        }
        
        @keyframes content-appear {
          0% { transform: translateY(10px) scale(0.95); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        
        .settings-content h3 {
          margin-top: 0;
          margin-bottom: 20px;
          color: var(--text-primary);
          font-size: 20px;
          font-weight: 600;
          position: relative;
          z-index: 2;
          letter-spacing: 0.3px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .settings-content h3::before {
          content: '';
          display: inline-block;
          width: 24px;
          height: 24px;
          background-image: url('icons/icon_black/favicon-32x32.png');
          background-size: contain;
          background-repeat: no-repeat;
          margin-right: 8px;
          filter: drop-shadow(0 1px 3px rgba(111, 66, 193, 0.3));
        }
        
        .dark-theme .settings-content h3::before {
          background-image: url('icons/icon_white/favicon-32x32.png');
        }
        
        .settings-button {
          display: flex;
          align-items: center;
          width: 100%;
          margin-bottom: 14px;
          text-align: left;
          padding: 12px 15px;
          background: var(--primary-gradient);
          color: white;
          border: 2px solid var(--glass-border);
          border-radius: 16px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          font-size: 14px;
          letter-spacing: 0.3px;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
          position: relative;
          overflow: hidden;
          z-index: 2;
        }
        
        .settings-button:hover {
          background: var(--hover-gradient);
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 8px 20px rgba(111, 66, 193, 0.18);
        }
        
        .settings-button:active {
          transform: translateY(1px) scale(0.98);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
        }
        
        .settings-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: all 0.6s ease;
        }
        
        .settings-button:hover::before {
          left: 100%;
        }
        
        .settings-close {
          position: absolute;
          top: 10px;
          right: 10px;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          font-size: 20px;
          cursor: pointer;
          color: var(--text-primary);
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all 0.2s ease;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 3;
        }
        
        .settings-close:hover {
          background: rgba(255, 255, 255, 0.35);
          transform: scale(1.1);
        }
        
        .settings-close:active {
          transform: scale(0.95);
        }
        
        /* API key input styling */
        #api-key-field {
          width: 100%;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.8);
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
          font-size: 14px;
          margin-bottom: 15px;
          transition: all 0.3s ease;
          box-sizing: border-box;
          height: 42px;
          max-width: 100%;
        }
        
        #api-key-field:focus {
          border-color: rgba(111, 66, 193, 0.6);
          box-shadow: inset 0 1px 3px rgba(111, 66, 193, 0.2), 0 0 0 2px rgba(111, 66, 193, 0.1);
          outline: none;
        }
        
        .save-button {
          width: 100%;
          padding: 10px 12px;
          background: linear-gradient(135deg, rgba(52, 168, 83, 0.85), rgba(66, 133, 244, 0.75));
          color: white;
          border: none;
          border-radius: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .save-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(52, 168, 83, 0.2);
        }
        
        .save-button:active {
          transform: translateY(1px) scale(0.98);
        }
        
        /* API key success notification */
        .api-key-success {
          position: absolute;
          bottom: -60px;
          left: 0;
          right: 0;
          background: rgba(52, 168, 83, 0.85);
          color: white;
          padding: 10px;
          border-radius: 12px;
          text-align: center;
          transform: translateY(0);
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
          z-index: 10;
        }
        
        .api-key-success.show {
          transform: translateY(-70px);
          opacity: 1;
        }
        
        /* Dark mode support */
        .dark-theme .settings-content {
          background: linear-gradient(225deg, rgba(20, 20, 30, 0.95), rgba(30, 30, 40, 0.9));
          border-color: rgba(70, 70, 90, 0.3);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        
        .dark-theme .settings-content h3 {
          color: rgba(255, 255, 255, 0.9);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        
        .dark-theme #api-key-field {
          background: rgba(40, 40, 50, 0.8);
          color: white;
          border-color: rgba(70, 70, 90, 0.5);
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
        }
        
        .dark-theme #api-key-field:focus {
          border-color: rgba(111, 66, 193, 0.6);
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 0 2px rgba(111, 66, 193, 0.3);
        }
        
        .dark-theme .settings-close {
          background: rgba(0, 0, 0, 0.2);
          border-color: rgba(70, 70, 90, 0.3);
          color: rgba(255, 255, 255, 0.9);
        }
        
        .dark-theme .settings-close:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        
        .dark-theme p {
          color: rgba(255, 255, 255, 0.85);
        }
        
        /* Animation for beam in dark mode */
        .dark-theme .settings-content::before {
          background: linear-gradient(90deg, rgba(80, 50, 168, 0), rgba(100, 100, 255, 0.05), rgba(80, 50, 168, 0));
        }
        
        /* Enhance the subtle drift animation for the particle pattern */
        @keyframes subtle-drift {
          0% { background-position: 0 0; }
          100% { background-position: 100px 100px; }
        }
        
        .settings-content::after {
          animation: subtle-drift 120s linear infinite;
        }
        
        /* Enhanced beam animation */
        @keyframes beam {
          0% { transform: rotate(-45deg) translateX(-100%); }
          100% { transform: rotate(-45deg) translateX(200%); }
        }
        
        /* Theme toggle success message */
        .theme-success {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(30px);
          background: rgba(111, 66, 193, 0.85);
          color: white;
          padding: 10px 18px;
          border-radius: 30px;
          font-size: 14px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
          z-index: 2000;
        }
        
        .theme-success.show {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      `;
      document.head.appendChild(popupStyles);
    }
    
    // Create and show settings popup
    const settingsPopup = document.createElement('div');
    settingsPopup.className = 'settings-popup';
    
    // Determine current theme for accurate button labels
    const isDarkTheme = document.body.classList.contains('dark-theme');
    
    // Use same popup HTML as the original handler
    settingsPopup.innerHTML = `
      <div class="settings-content">
        <h3>Settings</h3>
        <button id="configureApiKey" class="settings-button">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px; margin-right: 10px;">
            <path fill="currentColor" d="M22 11.5c0-1.65-1.35-3-3-3s-3 1.35-3 3c0 .75.28 1.43.75 1.95l-2.75 2.75c-.27-.17-.56-.31-.87-.39l-.51-3.56c.86-.33 1.38-1.18 1.38-2.12 0-1.32-1.04-2.38-2.38-2.38-1.33 0-2.37 1.06-2.37 2.38 0 .89.47 1.68 1.18 2.05l-.71 3.58c-.94.29-1.72.98-2.09 1.89L3.8 15.4c.02-.16.05-.32.05-.49 0-1.21-.99-2.2-2.2-2.2S-.55 13.7-.55 14.91s.99 2.2 2.2 2.2c.69 0 1.31-.33 1.71-.83l3.44 1.61c-.01.08-.03.15-.03.24 0 1.93 1.57 3.5 3.5 3.5s3.5-1.57 3.5-3.5c0-.31-.05-.6-.12-.89l2.7-2.7c.43.28.93.45 1.5.45 1.65.01 3-1.34 3-2.99zm-5.91 6.32c-.26.57-.85.97-1.53.97-.92 0-1.67-.75-1.67-1.67 0-.58.29-1.1.76-1.39.17-.11.37-.2.57-.25l.25-.04.21 1.04-1.06.21.5.87c-.02.03-.04.08-.04.12 0 .17.13.3.3.3s.3-.13.3-.3c0-.12-.06-.21-.16-.26zm.3-6.32c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5z"/>
          </svg>
          Configure API Key
        </button>
        <button id="toggleTheme" class="settings-button">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px; margin-right: 10px;">
            ${isDarkTheme ? 
              `<path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5s5-2.24 5-5s-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0c-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0c-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0c.39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>` 
              : 
              `<path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9s9-4.03 9-9c0-.46-.04-.92-.1-1.36c-.98 1.37-2.58 2.26-4.4 2.26c-2.98 0-5.4-2.42-5.4-5.4c0-1.81.89-3.42 2.26-4.4c-.44-.06-.9-.1-1.36-.1z"/>`
            }
          </svg>
          Switch to ${isDarkTheme ? 'Light' : 'Dark'} Mode
        </button>
        <div class="theme-indicator" style="
          display: flex;
          justify-content: center;
          margin-top: 20px;
          font-size: 12px;
          color: var(--text-secondary);
          align-items: center;
          opacity: 0.8;
        ">
          <span style="position: relative; z-index: 2;">
            Current theme: <strong>${isDarkTheme ? 'Dark Mode' : 'Light Mode'}</strong>
          </span>
        </div>
        <button id="closeSettings" class="settings-close">&times;</button>
      </div>
    `;
    document.body.appendChild(settingsPopup);
    
    // Add event handlers for the popup buttons
    document.getElementById('closeSettings').addEventListener('click', () => {
      document.body.removeChild(settingsPopup);
    });
    
    document.getElementById('configureApiKey').addEventListener('click', () => {
      document.body.removeChild(settingsPopup);
      
      // Create and show the API key configuration popup
      const apiKeyPopup = document.createElement('div');
      apiKeyPopup.className = 'settings-popup';
      apiKeyPopup.innerHTML = `
        <div class="settings-content">
          <h3 style="justify-content: center;">Configure API Key</h3>
          <div style="position: relative; z-index: 2; padding: 0 5px; max-width: 100%; box-sizing: border-box;">
            <p style="font-size: 14px; margin: 0 0 20px; opacity: 0.85; line-height: 1.5;">
              Enter your Gemini API key to enable voice transcription
            </p>
            <input type="password" id="api-key-field" placeholder="Enter your Gemini API key" spellcheck="false" autocomplete="off" style="width: 100%; box-sizing: border-box; max-width: 100%;" />
            <button id="save-api-key" class="save-button">
              <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; margin-right: 6px;">
                <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
              </svg>
              Save API Key
            </button>
          </div>
          <button id="closeApiKey" class="settings-close">&times;</button>
          <div class="api-key-success">
            API key saved successfully!
          </div>
        </div>
      `;
      document.body.appendChild(apiKeyPopup);
      
      // Fetch and populate current API key
      window.TalkTypeStorage.getApiKey().then((storedApiKey) => {
        if (storedApiKey) {
          document.getElementById('api-key-field').value = storedApiKey;
        }
      });
      
      // Add event listener for save button
      document.getElementById('save-api-key').addEventListener('click', () => {
        const apiKey = document.getElementById('api-key-field').value.trim();
        if (apiKey) {
          window.TalkTypeStorage.setApiKey(apiKey).then(() => {
            // Show success message with animation
            const successMsg = document.querySelector('.api-key-success');
            successMsg.classList.add('show');
            
            // Apply success styling to the button
            const saveButton = document.getElementById('save-api-key');
            saveButton.innerHTML = `
              <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; margin-right: 6px;">
                <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
              </svg>
              Saved!
            `;
            
            // Update the API key check
            checkApiKey();
            
            // Close the popup after a delay
            setTimeout(() => {
              document.body.removeChild(apiKeyPopup);
            }, 1500);
          });
        } else {
          // Show error state for empty input
          const apiKeyField = document.getElementById('api-key-field');
          apiKeyField.style.borderColor = 'rgba(255, 0, 0, 0.5)';
          apiKeyField.style.boxShadow = 'inset 0 1px 3px rgba(255, 0, 0, 0.2)';
          
          // Shake animation for empty field
          apiKeyField.style.animation = 'shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both';
          
          // Add shake animation if not already added
          if (!document.getElementById('shake-animation')) {
            const shakeStyle = document.createElement('style');
            shakeStyle.id = 'shake-animation';
            shakeStyle.textContent = `
              @keyframes shake {
                10%, 90% { transform: translateX(-1px); }
                20%, 80% { transform: translateX(2px); }
                30%, 50%, 70% { transform: translateX(-3px); }
                40%, 60% { transform: translateX(3px); }
              }
            `;
            document.head.appendChild(shakeStyle);
          }
          
          // Reset the error state after animation
          setTimeout(() => {
            apiKeyField.style.borderColor = '';
            apiKeyField.style.boxShadow = '';
            apiKeyField.style.animation = '';
          }, 500);
        }
      });
      
      // Add event listener for Enter key in input field
      document.getElementById('api-key-field').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
          document.getElementById('save-api-key').click();
        }
      });
      
      // Add event listener for close button
      document.getElementById('closeApiKey').addEventListener('click', () => {
        document.body.removeChild(apiKeyPopup);
      });
    });
    
    document.getElementById('toggleTheme').addEventListener('click', () => {
      // Toggle theme
      const currentIsDark = document.body.classList.contains('dark-theme');
      const newIsDark = !currentIsDark;
      
      // Save preference
      localStorage.setItem('userToggled', 'true');
      localStorage.setItem('prefersDarkMode', newIsDark);
      
      // Apply theme
      applyTheme(newIsDark);
      
      // Update theme indicator
      const themeIndicator = document.querySelector('.theme-indicator span strong');
      if (themeIndicator) {
        themeIndicator.textContent = newIsDark ? 'Dark Mode' : 'Light Mode';
      }
      
      // Apply success styling to button
      const toggleButton = document.getElementById('toggleTheme');
      toggleButton.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px; margin-right: 10px;">
          <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
        </svg>
        ${newIsDark ? 'Dark' : 'Light'} Mode Applied
      `;
      toggleButton.style.background = 'linear-gradient(135deg, rgba(52, 168, 83, 0.85), rgba(66, 133, 244, 0.75))';
    });
  });
  
  // Create permission fix button
  const permButton = document.createElement('button');
  permButton.id = 'fixPermissions';
  permButton.innerHTML = `
    <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
    </svg>
    Fix Microphone Access
  `;
  permButton.style.marginTop = '12px';
  permButton.style.backgroundColor = 'rgba(255, 122, 69, 0.85)';
  permButton.style.display = 'none'; // Hidden by default
  
  // Add click event
  permButton.addEventListener('click', openPermissionFix);
  
  // Add button to buttons div
  document.querySelector('.buttons').appendChild(permButton);
  
  // Check microphone permission
  checkMicPermissionAndUpdateButton();

  // Check for Chrome storage permission
  const { microphonePermission } = await chrome.storage.sync.get(['microphonePermission']);
  if (microphonePermission === 'granted') {
    permButton.style.display = 'none';
  } else {
    // If permission not stored, check if we can detect it
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        
        if (permissionStatus.state === 'granted') {
          permButton.style.display = 'none';
          // Save status to storage
          chrome.storage.sync.set({ microphonePermission: 'granted' });
        } else {
          permButton.style.display = 'block';
        }
      }
    } catch (error) {
      console.error('Error checking mic permission:', error);
    }
  }
});

// Check microphone permission status and show button if needed
async function checkMicPermissionAndUpdateButton() {
  try {
    // Try to get mic permission status from storage
    const { microphonePermission } = await chrome.storage.sync.get(['microphonePermission']);
    
    if (microphonePermission === 'granted') {
      const permButton = document.getElementById('fixPermissions');
      if (permButton) {
        permButton.style.display = 'none';
      }
      return;
    }
    
    // If not found in storage, try to check permission state directly
    if (navigator.permissions && navigator.permissions.query) {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
      const permButton = document.getElementById('fixPermissions');
      
      if (permissionStatus.state === 'granted') {
        if (permButton) {
          permButton.style.display = 'none';
        }
        // Save status to storage
        chrome.storage.sync.set({ microphonePermission: 'granted' });
        updateSetupCard();
      } else {
        if (permButton) {
          permButton.style.display = 'block';
        }
        updateSetupCard();
      }
      
      // Listen for permission changes
      permissionStatus.onchange = () => {
        const permBtn = document.getElementById('fixPermissions');
        if (permBtn) {
          permBtn.style.display = 
            permissionStatus.state === 'granted' ? 'none' : 'block';
        }
        
        if (permissionStatus.state === 'granted') {
          chrome.storage.sync.set({ microphonePermission: 'granted' });
        }
        updateSetupCard();
      };
    }
  } catch (error) {
    console.error('Error checking mic permission:', error);
  }
}

/**
 * Initialize theme based on user preference or system preference
 */
function initializeTheme() {
  console.log('Initializing theme...');
  
  // Check if user has manually set a preference before
  const userToggled = localStorage.getItem('userToggled');
  
  // Also check for theme preference in chrome.storage for persistence across devices
  chrome.storage.sync.get(['themePreference', 'userToggled'], (result) => {
    // If we have a stored preference in Chrome storage, use that first
    if (result.userToggled === 'true' && result.themePreference !== undefined) {
      console.log('Using Chrome storage theme preference:', result.themePreference);
      const isDarkMode = result.themePreference === 'dark';
      
      // Apply theme
      applyTheme(isDarkMode);
      
      // Also update localStorage to match
      localStorage.setItem('userToggled', 'true');
      localStorage.setItem('prefersDarkMode', isDarkMode);
      
      return;
    }
    
    // If Chrome storage doesn't have a preference, check localStorage
    if (userToggled === 'true') {
      // If user has toggled, use their preference from localStorage
      const prefersDarkMode = localStorage.getItem('prefersDarkMode') === 'true';
      console.log('Using localStorage theme preference:', prefersDarkMode ? 'dark' : 'light');
      
      // Apply theme
      applyTheme(prefersDarkMode);
      
      // Save to Chrome storage for persistence across devices
      chrome.storage.sync.set({
        themePreference: prefersDarkMode ? 'dark' : 'light',
        userToggled: 'true'
      });
    } else {
      // Otherwise, check system preference
      const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      console.log('Using system theme preference:', prefersDarkMode ? 'dark' : 'light');
      
      // Apply theme
      applyTheme(prefersDarkMode);
      
      // Set initial values to localStorage
      localStorage.setItem('userToggled', 'false');
      localStorage.setItem('prefersDarkMode', prefersDarkMode);
      
      // Also set in Chrome storage but mark as not user toggled
      chrome.storage.sync.set({
        themePreference: prefersDarkMode ? 'dark' : 'light',
        userToggled: 'false'
      });
      
      // Add listener for system theme changes if not user toggled
      try {
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        // Use the proper event listener based on browser support
        if (darkModeMediaQuery.addEventListener) {
          darkModeMediaQuery.addEventListener('change', handleSystemThemeChange);
        } else if (darkModeMediaQuery.addListener) {
          // For older browsers
          darkModeMediaQuery.addListener(handleSystemThemeChange);
        }
      } catch (e) {
        console.error('Error setting up theme listener:', e);
      }
    }
  });
}

/**
 * Handle system theme change events
 * @param {MediaQueryListEvent} e - The media query change event
 */
function handleSystemThemeChange(e) {
  // Only apply if user hasn't manually set preference
  chrome.storage.sync.get(['userToggled'], (result) => {
    if (result.userToggled !== 'true' && localStorage.getItem('userToggled') !== 'true') {
      console.log('System theme changed to:', e.matches ? 'dark' : 'light');
      
      // Apply new theme
      applyTheme(e.matches);
      
      // Update stored values
      localStorage.setItem('prefersDarkMode', e.matches);
      chrome.storage.sync.set({
        themePreference: e.matches ? 'dark' : 'light'
      });
    }
  });
}

/**
 * Apply theme to the extension
 * @param {boolean} isDark - Whether to apply dark theme
 */
function applyTheme(isDark) {
  if (isDark) {
    document.body.classList.add('dark-theme');
    
    // Update CSS variables for dark theme
    document.documentElement.style.setProperty('--glass-bg', 'rgba(30, 30, 40, 0.8)');
    document.documentElement.style.setProperty('--glass-border', 'rgba(70, 70, 90, 0.3)');
    document.documentElement.style.setProperty('--text-primary', 'rgba(255, 255, 255, 0.9)');
    document.documentElement.style.setProperty('--text-secondary', 'rgba(255, 255, 255, 0.7)');
    document.documentElement.style.setProperty('--light-accent', 'rgba(111, 66, 193, 0.2)');
    
    // Update background gradient for dark theme
    document.body.style.background = 'linear-gradient(225deg, rgba(20, 20, 30, 0.95), rgba(30, 30, 40, 0.9))';
    
    // Use white icon for dark theme
    try {
      const logoImg = document.querySelector('h1 img');
      if (logoImg) {
        // Ensure we're using the white icon for dark theme
        if (!logoImg.src.includes('icon_white')) {
          logoImg.src = logoImg.src.replace('icon_black', 'icon_white');
        }
      }
    } catch (e) {
      console.error('Error updating logo for dark theme:', e);
    }
  } else {
    document.body.classList.remove('dark-theme');
    
    // Restore default CSS variables for light theme
    document.documentElement.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.65)');
    document.documentElement.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.7)');
    document.documentElement.style.setProperty('--text-primary', 'rgba(60, 64, 67, 0.95)');
    document.documentElement.style.setProperty('--text-secondary', 'rgba(60, 64, 67, 0.85)');
    document.documentElement.style.setProperty('--light-accent', 'rgba(111, 66, 193, 0.1)');
    
    // Restore background gradient for light theme
    document.body.style.background = 'linear-gradient(225deg, rgba(255, 255, 255, 0.9), rgba(240, 245, 255, 0.95))';
    
    // Use black icon for light theme
    try {
      const logoImg = document.querySelector('h1 img');
      if (logoImg) {
        // Ensure we're using the black icon for light theme
        if (!logoImg.src.includes('icon_black')) {
          logoImg.src = logoImg.src.replace('icon_white', 'icon_black');
        }
      }
    } catch (e) {
      console.error('Error updating logo for light theme:', e);
    }
  }
  
  console.log(`Theme applied: ${isDark ? 'Dark' : 'Light'} mode`);
}
