// Popup script

// Check if API key is set
async function checkApiKey() {
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKeyError = document.getElementById('apiKeyError');
  const testMicButton = document.getElementById('testMic');
  
  if (!result.apiKey) {
    apiKeyError.style.display = 'block';
    testMicButton.classList.add('disabled');
    testMicButton.disabled = true;
  } else {
    apiKeyError.style.display = 'none';
    testMicButton.classList.remove('disabled');
    testMicButton.disabled = false;
  }
}

// Open options page
function openOptions() {
  chrome.runtime.openOptionsPage();
}

// Test microphone access and transcription
async function testMicrophone() {
  const statusElement = document.getElementById('status');
  let recording = false;
  let mediaRecorder = null;
  let audioChunks = [];
  let stream = null;
  
  // Check if API key is set
  const result = await chrome.storage.sync.get(['apiKey']);
  if (!result.apiKey) {
    statusElement.innerHTML = '<span style="color: #721c24">Please set your Gemini API key in Options first.</span>';
    return;
  }
  
  // Initialize test recording UI
  statusElement.innerHTML = `
    <div style="text-align:center">
      <button id="startStop" style="background:#4285f4; color:white; border:none; padding:10px 18px; border-radius:6px; cursor:pointer; margin-bottom:12px; font-weight:500; box-shadow:0 2px 5px rgba(66,133,244,0.3); transition:all 0.2s ease;">
        Start Recording
      </button>
      <div id="recordingStatus" style="font-size:13px; margin-bottom:12px; color:#555;"></div>
      <div id="transcription" style="margin-top:12px; padding:15px; border-radius:8px; background:#fff; min-height:50px; text-align:left; box-shadow:0 1px 3px rgba(0,0,0,0.08);"></div>
    </div>
  `;
  
  // Get UI elements
  const startStopButton = document.getElementById('startStop');
  const recordingStatus = document.getElementById('recordingStatus');
  const transcriptionElement = document.getElementById('transcription');
  
  // Add click handler for record button
  startStopButton.addEventListener('click', async () => {
    if (!recording) {
      // Start recording
      try {
        // Check if we're on Mac
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        
        // Even if we have previously granted permission in our storage,
        // Chrome might still have it set to "Ask" rather than "Allow"
        // So we'll just try to get the stream directly regardless of stored permission
        
        // Request microphone access
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create media recorder
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        // Set up event handlers
        mediaRecorder.addEventListener('dataavailable', event => {
          audioChunks.push(event.data);
        });
        
        // Start recording
        mediaRecorder.start();
        recording = true;
        startStopButton.textContent = 'Stop Recording';
        recordingStatus.textContent = 'Recording... (speak now)';
        recordingStatus.style.color = '#721c24';
        
        // Show recording animation
        const recordingAnimation = document.getElementById('recording-animation');
        recordingAnimation.style.display = 'block';
        
        // Auto-stop after 15 seconds
        setTimeout(() => {
          if (recording) {
            startStopButton.click();
          }
        }, 15000);
        
      } catch (error) {
        console.error('Error starting recording:', error);
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          // For Mac users, show OS-level instructions
          const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
          
          if (isMac) {
            recordingStatus.innerHTML = `
              <span style="color:#721c24">
                Microphone access denied. Please check both places:
                <ol style="text-align:left; margin-top:5px; margin-bottom:5px">
                  <li>Chrome site settings (click shield/lock icon in address bar)</li>
                  <li>macOS System Preferences > Security & Privacy > Privacy > Microphone</li>
                </ol>
              </span>
            `;
          } else {
            recordingStatus.innerHTML = `
              <span style="color:#721c24">
                Microphone access denied. Click the lock/shield icon in the address bar and allow microphone access.
              </span>
            `;
          }
          
          // Add a direct link to Chrome's content settings
          const settingsButton = document.createElement('button');
          settingsButton.textContent = 'Open Chrome Settings';
          settingsButton.style.marginTop = '10px';
          settingsButton.style.marginRight = '5px';
          settingsButton.style.padding = '5px 10px';
          settingsButton.addEventListener('click', () => {
            chrome.tabs.create({
              url: 'chrome://settings/content/microphone'
            });
          });
          recordingStatus.appendChild(settingsButton);
          
          // Add button to open options
          const optionsButton = document.createElement('button');
          optionsButton.textContent = 'Open Options';
          optionsButton.style.marginTop = '10px';
          optionsButton.style.padding = '5px 10px';
          optionsButton.addEventListener('click', openOptions);
          recordingStatus.appendChild(optionsButton);
        } else {
          recordingStatus.textContent = `Error: ${error.message}`;
        }
      }
    } else {
      // Stop recording
      if (mediaRecorder && recording) {
        mediaRecorder.stop();
        recording = false;
        startStopButton.textContent = 'Start Recording';
        recordingStatus.textContent = 'Processing...';
        
        // Hide recording animation
        const recordingAnimation = document.getElementById('recording-animation');
        recordingAnimation.style.display = 'none';
        
        // Process the recording after it stops
        mediaRecorder.addEventListener('stop', async () => {
          try {
            // Stop all tracks
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
            }
            
            // Create audio blob
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Show processing message
            transcriptionElement.textContent = 'Transcribing...';
            
            // Get the API key
            const { apiKey } = await chrome.storage.sync.get(['apiKey']);
            
            // Convert blob to base64
            const base64Audio = await blobToBase64(audioBlob);
            
            // Create a GeminiApiService instance
            const apiService = new GeminiApiService(apiKey);
            
            // Send to API for transcription
            try {
              // Clear any previous text first
              transcriptionElement.textContent = "";
              // Create progress indicators with pleasing design
              const progressBarContainer = document.createElement('div');
              progressBarContainer.style.width = '100%';
              progressBarContainer.style.height = '8px';
              progressBarContainer.style.backgroundColor = '#f0f0f0';
              progressBarContainer.style.borderRadius = '10px';
              progressBarContainer.style.margin = '12px 0';
              progressBarContainer.style.overflow = 'hidden';
              progressBarContainer.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.1)';
              
              const progressBar = document.createElement('div');
              progressBar.style.width = '0%';
              progressBar.style.height = '100%';
              progressBar.style.background = 'linear-gradient(to right, #4285f4, #34a853)';
              progressBar.style.borderRadius = '10px';
              progressBar.style.transition = 'width 0.8s cubic-bezier(0.1, 0.7, 0.8, 1)';
              
              // Adding a pulse effect for enhanced perception
              const pulse = document.createElement('div');
              pulse.style.height = '100%';
              pulse.style.width = '15px';
              pulse.style.position = 'absolute';
              pulse.style.backgroundColor = 'rgba(255,255,255,0.3)';
              pulse.style.animation = 'pulse 1.5s infinite';
              
              const style = document.createElement('style');
              style.textContent = `
                @keyframes pulse {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(500%); }
                }
              `;
              document.head.appendChild(style);
              
              progressBar.appendChild(pulse);
              progressBarContainer.appendChild(progressBar);
              
              // Status with emoji for increased engagement
              recordingStatus.innerHTML = '';
              recordingStatus.appendChild(document.createTextNode('✨ Starting AI transcription...'));
              recordingStatus.appendChild(document.createElement('br'));
              recordingStatus.appendChild(progressBarContainer);
              
              // Verify API key first - but start progress animation immediately
              let progressInterval;
              let fakeProgress = 0;
              
              // Extreme speed progress bar for super short transcriptions
              // Will likely hit 95% before the API calls complete
              progressInterval = setInterval(() => {
                if (fakeProgress < 30) {
                  fakeProgress += 9; // Extremely fast initial progress
                } else if (fakeProgress < 60) {
                  fakeProgress += 5; // Very fast progress
                } else if (fakeProgress < 85) {
                  fakeProgress += 2; // Still fast
                } else if (fakeProgress < 95) {
                  fakeProgress += 0.5; // Slow down a little
                }
                // Stop at 95% - the real completion will jump to 100%
                if (fakeProgress > 95) {
                  fakeProgress = 95;
                  clearInterval(progressInterval);
                }
                progressBar.style.width = fakeProgress + '%';
              }, 25);
              
              // Ultra-fast status messages for short transcriptions
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
              
              // Show initial status message and prepare a prominent display
              recordingStatus.style.fontWeight = 'bold';
              recordingStatus.style.fontSize = '14px';

              // Force immediate display of "Reticulating splines"
              recordingStatus.innerHTML = '';
              recordingStatus.appendChild(document.createTextNode('🔄 Reticulating splines...'));
              recordingStatus.appendChild(document.createElement('br'));
              recordingStatus.appendChild(progressBarContainer);
              
              // Schedule the rest of the messages with very short delays
              for (let i = 2; i < statusMessages.length; i++) {
                const item = statusMessages[i];
                setTimeout(() => {
                  if (recordingStatus.firstChild) {
                    recordingStatus.replaceChild(
                      document.createTextNode(item.message),
                      recordingStatus.firstChild
                    );
                  }
                }, item.timing/2); // Use half the scheduled time to make them appear faster
              }
              
              // Actual API call
              const isValidKey = await apiService.verifyApiKey();
              
              if (!isValidKey) {
                clearInterval(progressInterval);
                throw new Error('Invalid API key. Please check your key in Options.');
              }
              
              // Real API call - but we'll continue to use our fake progress
              // The real progress updates from the API will be ignored
              const transcription = await apiService.transcribeAudio(audioBlob);
              
              // When complete, jump to 100% with a satisfying finish
              clearInterval(progressInterval);
              progressBar.style.width = '100%';
              progressBar.style.transition = 'width 0.4s cubic-bezier(0.1, 0.9, 0.2, 1.2)';
              
              // Add minimal artificial delay to completion
              // Just enough for satisfying completion effect but not too long
              setTimeout(() => {
                // Completion micro-animation for dopamine release
                progressBar.style.backgroundColor = '#34a853';
                progressBar.style.boxShadow = '0 0 10px rgba(52, 168, 83, 0.5)';
                
                // Show celebratory success message
                recordingStatus.innerHTML = '✅ Transcription complete!';
                recordingStatus.style.color = '#155724';
                recordingStatus.style.fontWeight = 'bold';
                
                // Almost immediately show result with subtle animation
                setTimeout(() => {
                  // Show result with subtle entrance animation
                  transcriptionElement.style.opacity = '0';
                  transcriptionElement.style.transition = 'opacity 0.3s ease';
                  transcriptionElement.textContent = transcription || 'No speech detected.';
                  
                  // Trigger reflow to ensure animation works
                  transcriptionElement.offsetHeight;
                  
                  // Animate in the result
                  transcriptionElement.style.opacity = '1';
                }, 100);
              }, 200);
            } catch (apiError) {
              console.error('API error:', apiError);
              transcriptionElement.textContent = `Error: ${apiError.message}`;
              recordingStatus.textContent = 'Transcription failed.';
              recordingStatus.style.color = '#721c24';
            }
          } catch (processError) {
            console.error('Processing error:', processError);
            recordingStatus.textContent = `Error: ${processError.message}`;
            recordingStatus.style.color = '#721c24';
          }
        });
      }
    }
  });
  
  // Helper function to convert blob to base64
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// Handle microphone errors
function handleMicrophoneError(error, statusElement) {
  // Handle different error types
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    statusElement.innerHTML = `
      <span style="color: #721c24">Microphone permission denied by browser</span><br>
      <small>To fix this:</small>
      <ol style="font-size: 12px; text-align: left; margin-top: 5px;">
        <li>Click the lock/site settings icon in the Chrome address bar</li>
        <li>Find "Microphone" in the site permissions</li>
        <li>Change it to "Allow"</li>
        <li>Refresh this page and try again</li>
      </ol>
    `;
  } else if (error.name === 'NotFoundError') {
    statusElement.textContent = 'Error: No microphone found on your device';
  } else {
    statusElement.textContent = `Error: ${error.message}`;
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

// Initialize the popup
document.addEventListener('DOMContentLoaded', async () => {
  // Check API key
  await checkApiKey();
  
  // Add event listeners
  document.getElementById('options').addEventListener('click', openOptions);
  document.getElementById('testMic').addEventListener('click', testMicrophone);
  
  // Add permission fix button
  const permButton = document.createElement('button');
  permButton.id = 'fixPermissions';
  permButton.textContent = 'Fix Microphone Access';
  permButton.style.marginTop = '10px';
  permButton.style.backgroundColor = '#FF7A45';
  permButton.style.color = 'white';
  permButton.style.border = 'none';
  permButton.style.padding = '8px 12px';
  permButton.style.borderRadius = '4px';
  permButton.style.cursor = 'pointer';
  permButton.style.fontSize = '14px';
  permButton.style.display = 'block';
  permButton.style.width = '100%';
  
  // Add click event
  permButton.addEventListener('click', openPermissionFix);
  
  // Add button to buttons div
  document.querySelector('.buttons').appendChild(permButton);
});