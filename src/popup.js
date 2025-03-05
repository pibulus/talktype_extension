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
  
  // First check if we already have permission
  try {
    const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
    
    if (permissionStatus.state === 'granted') {
      // We already have permission, just verify it works
      statusElement.textContent = 'Checking microphone...';
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Show success message
      statusElement.textContent = 'Microphone access granted!';
      
      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
      
      // Reset status after 2 seconds
      setTimeout(() => {
        statusElement.textContent = 'Ready to transcribe audio to text';
      }, 2000);
      
      return;
    }
  } catch (error) {
    console.log('Permission query not supported or failed:', error);
    // Continue to request permission anyway
  }
  
  // Open the dedicated permission page in a new tab
  statusElement.textContent = 'Opening permission page...';
  
  chrome.runtime.sendMessage({ action: 'requestMicrophonePermission' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error opening permission page:', chrome.runtime.lastError);
      statusElement.textContent = 'Error opening permission page';
      return;
    }
    
    if (response && response.tabId) {
      statusElement.textContent = 'Permission page opened. Please grant access there.';
    }
  });
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