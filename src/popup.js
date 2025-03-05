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
      <button id="startStop" style="background:#4285f4; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; margin-bottom:10px">
        Start Recording
      </button>
      <div id="recordingStatus" style="font-size:12px; margin-bottom:10px"></div>
      <div id="transcription" style="margin-top:10px; padding:10px; border-radius:4px; background:#f8f9fa; min-height:40px; text-align:left"></div>
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
        
        // Check for previously granted permission
        const permResult = await chrome.storage.sync.get(['microphonePermission']);
        if (!permResult.microphonePermission && isMac) {
          recordingStatus.innerHTML = `
            <span style="color:#721c24">
              Please grant microphone permission in Options page first.
            </span>
          `;
          return;
        }
        
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
        
        // Auto-stop after 10 seconds
        setTimeout(() => {
          if (recording) {
            startStopButton.click();
          }
        }, 10000);
        
      } catch (error) {
        console.error('Error starting recording:', error);
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          recordingStatus.innerHTML = `
            <span style="color:#721c24">
              Microphone access denied. Please go to Options page to grant permission.
            </span>
          `;
          
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
            
            // Send to Gemini API for transcription
            try {
              const transcription = await apiService.transcribeAudio(audioBlob);
              transcriptionElement.textContent = transcription || 'No speech detected.';
              recordingStatus.textContent = 'Transcription complete!';
              recordingStatus.style.color = '#155724';
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

// Initialize the popup
document.addEventListener('DOMContentLoaded', async () => {
  // Check API key
  await checkApiKey();
  
  // Add event listeners
  document.getElementById('options').addEventListener('click', openOptions);
  document.getElementById('testMic').addEventListener('click', testMicrophone);
});