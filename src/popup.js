// Popup script

// Global variables
let audioService = null;
let apiService = null;
let isRecording = false;
let recordingTimeout = null;
const MAX_RECORDING_TIME = 15000; // 15 seconds

// Check if API key is set
async function checkApiKey() {
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKeyError = document.getElementById('apiKeyError');
  const recordButton = document.getElementById('startRecording');
  
  if (!result.apiKey) {
    apiKeyError.style.display = 'block';
    recordButton.classList.add('disabled');
    recordButton.disabled = true;
    return false;
  } else {
    apiKeyError.style.display = 'none';
    recordButton.classList.remove('disabled');
    recordButton.disabled = false;
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
    const recordingAnimation = document.getElementById('recording-animation');
    recordingAnimation.style.display = 'block';
    
    // Update button
    recordButton.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
      </svg>
      Stop Recording
    `;
    
    // Update status
    statusElement.innerHTML = `
      <div class="status-indicator">
        <span class="pulse-dot" style="background-color: #ff5252;"></span>
        <span class="status-text">Recording...</span>
      </div>
    `;
    
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
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(30px);
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
    // Update UI
    recordButton.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path fill="currentColor" d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      </svg>
      Record & Transcribe
    `;
    statusElement.innerHTML = '<div class="status-indicator"><span class="pulse-dot" style="background-color: #2196F3;"></span><span class="status-text">Processing</span></div>';
    recordingAnimation.style.display = 'none';
    
    // Stop recording and get audio data
    const audioBlob = await audioService.stopRecording();
    isRecording = false;
    
    // Create progress UI
    createProgressUI(statusElement);
    
    // Get API key and create service
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);
    apiService = new GeminiApiService(apiKey);
    
    // Verify API key
    const isValidKey = await apiService.verifyApiKey();
    if (!isValidKey) {
      throw new Error('Invalid API key. Please check your key in Options.');
    }
    
    // Show transcribing status with animated messages
    showTranscribingStatus(statusElement);
    
    // Actually transcribe the audio
    const transcription = await apiService.transcribeAudio(audioBlob, updateProgressCallback);
    
    // Complete the progress animation
    completeProgressAnimation();
    
    // Copy to clipboard
    if (transcription && transcription.trim()) {
      try {
        await navigator.clipboard.writeText(transcription);
        // Show a subtle notification that text was copied
        showClipboardNotification();
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
    
    // Show the transcription
    statusElement.innerHTML = '<div class="status-indicator"><span class="pulse-dot" style="background-color: #34a853;"></span><span class="status-text">Transcription complete</span></div>';
    
    // Animate the transcription text
    transcriptionText.style.opacity = '0';
    transcriptionText.style.transition = 'opacity 0.3s ease';
    transcriptionText.textContent = transcription || 'No speech detected.';
    
    // Force reflow to ensure animation works
    transcriptionText.offsetHeight;
    
    // Show with animation
    transcriptionText.style.opacity = '1';
    
  } catch (error) {
    console.error('Error in recording/transcription:', error);
    statusElement.innerHTML = `
      <div class="error-message">
        <svg class="icon" style="color: #ff5252" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
        </svg>
        <span>Error: ${error.message}</span>
      </div>
    `;
    transcriptionText.textContent = 'Transcription failed. Please try again.';
  }
}

// Create progress UI elements
function createProgressUI(container) {
  // Clear container
  container.innerHTML = '';
  
  // Create progress bar container
  const progressBarContainer = document.createElement('div');
  progressBarContainer.id = 'progress-container';
  progressBarContainer.style.width = '100%';
  progressBarContainer.style.height = '4px';
  progressBarContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.08)';
  progressBarContainer.style.borderRadius = '10px';
  progressBarContainer.style.margin = '12px 0';
  progressBarContainer.style.overflow = 'hidden';
  progressBarContainer.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.05)';
  
  // Create progress bar
  const progressBar = document.createElement('div');
  progressBar.id = 'progress-bar';
  progressBar.style.width = '0%';
  progressBar.style.height = '100%';
  progressBar.style.background = 'linear-gradient(to right, #4285f4, #34a853)';
  progressBar.style.borderRadius = '10px';
  progressBar.style.transition = 'width 0.8s cubic-bezier(0.1, 0.7, 0.8, 1)';
  
  // Create pulse animation
  const pulse = document.createElement('div');
  pulse.style.height = '100%';
  pulse.style.width = '15px';
  pulse.style.position = 'absolute';
  pulse.style.backgroundColor = 'rgba(255,255,255,0.3)';
  pulse.style.animation = 'pulse 1.5s infinite';
  
  // Add animation style if not already defined
  if (!document.getElementById('pulse-animation')) {
    const style = document.createElement('style');
    style.id = 'pulse-animation';
    style.textContent = `
      @keyframes pulse {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(500%); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Assemble UI
  progressBar.appendChild(pulse);
  progressBarContainer.appendChild(progressBar);
  
  // Create status text with a subtle shimmer animation
  const statusText = document.createElement('div');
  statusText.id = 'status-text';
  statusText.style.fontWeight = '500';
  statusText.style.fontSize = '14px';
  statusText.style.color = 'var(--text-primary)';
  statusText.style.position = 'relative';
  statusText.style.overflow = 'hidden';
  statusText.style.display = 'inline-block';
  statusText.textContent = '✨ Starting AI transcription...';
  
  // Create shimmer effect
  if (!document.getElementById('shimmer-style')) {
    const shimmerStyle = document.createElement('style');
    shimmerStyle.id = 'shimmer-style';
    shimmerStyle.textContent = `
      .shimmer {
        position: relative;
        overflow: hidden;
      }
      .shimmer::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 50%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
        animation: shimmer 2s infinite;
      }
      @keyframes shimmer {
        0% { left: -100%; }
        100% { left: 150%; }
      }
    `;
    document.head.appendChild(shimmerStyle);
  }
  statusText.classList.add('shimmer');
  
  // Create a container for the status text that's centered
  const statusTextContainer = document.createElement('div');
  statusTextContainer.style.textAlign = 'center';
  statusTextContainer.style.marginBottom = '8px';
  statusTextContainer.appendChild(statusText);
  
  // Add to container in order (status text above progress bar)
  container.appendChild(statusTextContainer);
  container.appendChild(progressBarContainer);
  
  // Start progress animation
  startFakeProgressAnimation();
}

// Start fake progress animation
function startFakeProgressAnimation() {
  let fakeProgress = 0;
  window.progressInterval = setInterval(() => {
    if (fakeProgress < 30) {
      fakeProgress += 9; // Fast initial progress
    } else if (fakeProgress < 60) {
      fakeProgress += 5; // Still fast
    } else if (fakeProgress < 85) {
      fakeProgress += 2; // Medium speed
    } else if (fakeProgress < 95) {
      fakeProgress += 0.5; // Slow down
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
  }, 25);
}

// Show transcribing status with animation
function showTranscribingStatus(container) {
  const statusMessages = [
    { message: '✨ Starting AI transcription...', timing: 0 },
    { message: '🔄 Reticulating splines...', timing: 75 },
    { message: '🔊 Enhancing audio clarity...', timing: 150 },
    { message: '🔍 Analyzing speech patterns...', timing: 225 },
    { message: '🧠 Activating neural networks...', timing: 300 },
    { message: '💬 Processing language context...', timing: 375 },
    { message: '🌐 Running advanced Gemini model...', timing: 450 },
    { message: '📊 Optimizing text accuracy...', timing: 525 },
    { message: '📝 Finalizing your transcription...', timing: 600 }
  ];
  
  // Update status text immediately with the first message
  const statusText = document.getElementById('status-text');
  if (statusText) {
    statusText.textContent = statusMessages[0].message;
  }
  
  // Schedule the remaining messages
  for (let i = 1; i < statusMessages.length; i++) {
    const item = statusMessages[i];
    setTimeout(() => {
      const statusText = document.getElementById('status-text');
      if (statusText) {
        statusText.textContent = item.message;
      }
    }, item.timing);
  }
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
    progressBar.style.transition = 'width 0.4s cubic-bezier(0.1, 0.9, 0.2, 1.2)';
    progressBar.style.backgroundColor = '#34a853';
    progressBar.style.boxShadow = '0 0 10px rgba(52, 168, 83, 0.5)';
  }
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
  document.getElementById('recording-animation').style.display = 'none';
  
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
    document.getElementById('fixPermissions').style.display = 'block';
  } else {
    // Show other errors
    statusElement.innerHTML = `
      <div class="error-message">
        <svg class="icon" style="color: #ff5252" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path>
        </svg>
        <span>Error: ${error.message}</span>
      </div>
    `;
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

// Initialize the popup
document.addEventListener('DOMContentLoaded', async () => {
  // Force immediate rendering
  document.body.style.display = 'block';
  document.body.style.opacity = '1';
  
  // Check API key in parallel with rendering
  checkApiKey();
  
  // Add event listeners for settings - show a settings popup instead of opening options page
  document.getElementById('options').addEventListener('click', (e) => {
    e.preventDefault();
    // Create and show a simple settings popup
    const settingsPopup = document.createElement('div');
    settingsPopup.className = 'settings-popup';
    settingsPopup.innerHTML = `
      <div class="settings-content glass">
        <h3>Settings</h3>
        <button id="goToOptions" class="settings-button">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"></path>
          </svg>
          Configure API Key
        </button>
        <button id="toggleTheme" class="settings-button">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M20 15.31L23.31 12 20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"></path>
          </svg>
          Toggle Theme
        </button>
        <button id="closeSettings" class="settings-close">&times;</button>
      </div>
    `;
    document.body.appendChild(settingsPopup);
    
    // Add event listeners for the popup buttons
    document.getElementById('goToOptions').addEventListener('click', openOptions);
    document.getElementById('toggleTheme').addEventListener('click', () => {
      document.body.classList.toggle('dark-theme');
      settingsPopup.style.display = 'none';
    });
    document.getElementById('closeSettings').addEventListener('click', () => {
      settingsPopup.style.display = 'none';
    });
    
    // Close when clicking outside
    settingsPopup.addEventListener('click', (event) => {
      if (event.target === settingsPopup) {
        settingsPopup.style.display = 'none';
      }
    });
  });
  
  // Set up recording button
  const recordButton = document.getElementById('startRecording');
  recordButton.addEventListener('click', async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  });
  
  // Add permission fix button - ALWAYS VISIBLE as requested
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
  // Always visible as requested
  
  // Add click event
  permButton.addEventListener('click', openPermissionFix);
  
  // Add button to buttons div
  document.querySelector('.buttons').appendChild(permButton);
  
  // Add the settings popup styling
  const style = document.createElement('style');
  style.textContent = `
    .settings-popup {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    
    .settings-content {
      position: relative;
      width: 80%;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
    }
    
    .settings-content h3 {
      margin-top: 0;
      margin-bottom: 15px;
      color: var(--text-primary);
    }
    
    .settings-button {
      display: block;
      width: 100%;
      margin-bottom: 10px;
      text-align: left;
      padding: 10px;
    }
    
    .settings-close {
      position: absolute;
      top: 5px;
      right: 5px;
      background: transparent;
      border: none;
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
    }
    
    .settings-close:hover {
      background: rgba(0, 0, 0, 0.1);
    }
    
    .dark-theme {
      --glass-bg: rgba(30, 30, 40, 0.8);
      --glass-border: rgba(70, 70, 90, 0.3);
      --text-primary: rgba(255, 255, 255, 0.9);
      --text-secondary: rgba(255, 255, 255, 0.7);
      --light-accent: rgba(111, 66, 193, 0.2);
      background: linear-gradient(225deg, rgba(20, 20, 30, 0.95), rgba(30, 30, 40, 0.9));
    }
  `;
  document.head.appendChild(style);
});