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

// Test microphone access
async function testMicrophone() {
  const statusElement = document.getElementById('status');
  
  try {
    statusElement.textContent = 'Requesting microphone access...';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Show success message
    statusElement.textContent = 'Microphone access granted!';
    
    // Stop all tracks
    stream.getTracks().forEach(track => track.stop());
    
    // Reset status after 2 seconds
    setTimeout(() => {
      statusElement.textContent = 'Ready to transcribe audio to text';
    }, 2000);
  } catch (error) {
    // Show error message
    statusElement.textContent = `Error: ${error.message}`;
    console.error('Microphone access error:', error);
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