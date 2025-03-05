// Main content script for the Audio to Text extension

// Import services from other scripts
// Note: These scripts need to be included in the manifest.json before this script

let audioService = null;
let apiService = null;
let isRecording = false;
let activeInput = null;
let apiKey = ''; // This should be set through extension options

// Initialize services when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize services
  audioService = new AudioRecordingService();
  apiService = new GeminiApiService(apiKey);
  
  // Check for recorded inputs
  initializeInputDetection();
  
  // Add observer to detect dynamically added inputs
  observeDynamicInputs();
});

// Function to initialize input detection
function initializeInputDetection() {
  // Find all text input elements on the page
  const textInputs = document.querySelectorAll('input[type="text"], input[type="search"], textarea');
  
  // Add microphone icon to each text input
  textInputs.forEach(input => {
    addMicrophoneToInput(input);
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
            addMicrophoneToInput(node);
          }
          
          // Check for inputs inside the added node
          if (node.querySelectorAll) {
            const inputs = node.querySelectorAll('input[type="text"], input[type="search"], textarea');
            inputs.forEach(input => addMicrophoneToInput(input));
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
  
  // Create container for the microphone button
  const container = document.createElement('div');
  container.className = 'audio-to-text-container';
  container.style.position = 'relative';
  container.style.display = 'inline';
  
  // Create microphone button
  const micButton = document.createElement('button');
  micButton.className = 'audio-to-text-mic-button';
  micButton.innerHTML = '🎤'; // Microphone emoji as placeholder icon
  micButton.title = 'Click to dictate';
  micButton.style.position = 'absolute';
  micButton.style.right = '-30px';
  micButton.style.top = '50%';
  micButton.style.transform = 'translateY(-50%)';
  micButton.style.zIndex = '9999';
  micButton.style.background = 'transparent';
  micButton.style.border = 'none';
  micButton.style.cursor = 'pointer';
  micButton.style.fontSize = '16px';
  
  // Add recording indicator styles
  const recordingIndicator = document.createElement('span');
  recordingIndicator.className = 'audio-to-text-recording-indicator';
  recordingIndicator.style.display = 'none';
  recordingIndicator.style.width = '10px';
  recordingIndicator.style.height = '10px';
  recordingIndicator.style.borderRadius = '50%';
  recordingIndicator.style.backgroundColor = 'red';
  recordingIndicator.style.position = 'absolute';
  recordingIndicator.style.top = '0';
  recordingIndicator.style.right = '0';
  micButton.appendChild(recordingIndicator);
  
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
  
  // Insert the button next to the input
  // If the input is within a parent container, add the button to that container
  const parent = inputElement.parentElement;
  if (parent) {
    parent.style.position = 'relative';
    parent.appendChild(micButton);
  } else {
    // Fallback if no parent
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    
    // Replace input with wrapper containing input and button
    inputElement.parentNode.insertBefore(wrapper, inputElement);
    wrapper.appendChild(inputElement);
    wrapper.appendChild(micButton);
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
    
    // Show recording indicator
    if (indicator) {
      indicator.style.display = 'block';
    }
    
    // Start recording
    await audioService.startRecording();
    
    console.log('Recording started for', targetInput);
  } catch (error) {
    console.error('Failed to start recording:', error);
    alert(`Failed to start recording: ${error.message}`);
    
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
    
    // Hide all recording indicators
    document.querySelectorAll('.audio-to-text-recording-indicator').forEach(indicator => {
      indicator.style.display = 'none';
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
  }
}

// Function to process audio data and get transcription
async function processAudioData(audioBlob) {
  if (!apiService || !activeInput) {
    return;
  }
  
  try {
    // Show processing indicator
    activeInput.style.backgroundImage = 'url("data:image/svg+xml;base64,...")'; // Add loading spinner image
    
    // Send audio to API for transcription
    const transcription = await apiService.transcribeAudio(audioBlob);
    
    // Insert transcribed text into the input
    activeInput.value = transcription;
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    console.log('Transcription complete:', transcription);
  } catch (error) {
    console.error('Transcription failed:', error);
    alert(`Transcription failed: ${error.message}`);
  } finally {
    // Remove processing indicator
    activeInput.style.backgroundImage = '';
    
    // Reset active input
    activeInput = null;
  }
}