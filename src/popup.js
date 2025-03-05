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
  const permissionDialog = new PermissionDialog();
  
  statusElement.textContent = 'Requesting microphone access...';
  
  // Show custom permission dialog first
  permissionDialog.showDialog(
    // On Allow
    async () => {
      try {
        // Actually request browser permission
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
        console.error('Microphone access error:', error);
        handleMicrophoneError(error, statusElement);
      }
    },
    // On Deny
    () => {
      statusElement.textContent = 'Microphone access denied by user';
    }
  );
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