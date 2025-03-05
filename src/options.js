// Options page script

// Save options to Chrome storage
function saveOptions() {
  const apiKey = document.getElementById('apiKey').value;
  
  chrome.storage.sync.set(
    { apiKey },
    () => {
      // Update status to let user know options were saved
      const status = document.getElementById('status');
      status.textContent = 'Options saved.';
      status.className = 'status success';
      status.style.display = 'block';
      
      setTimeout(() => {
        status.style.display = 'none';
      }, 2000);
    }
  );
}

// Check microphone permission status
function checkMicrophonePermission() {
  const permissionStatusElement = document.getElementById('permissionStatus');
  
  try {
    // Simpler approach - we'll just show a message prompting the user to test
    permissionStatusElement.textContent = 'Click the button below to test/request microphone access.';
    permissionStatusElement.className = 'permission-status unknown';
    
    // Check storage for previous successful access
    chrome.storage.sync.get(['microphonePermission'], (result) => {
      if (result.microphonePermission === 'granted') {
        permissionStatusElement.textContent = 'Microphone access was previously granted. Click the button to test again.';
        permissionStatusElement.className = 'permission-status granted';
      }
    });
  } catch (error) {
    console.error('Error checking permission:', error);
    permissionStatusElement.textContent = 'Error checking permission. Please click the button below to try.';
    permissionStatusElement.className = 'permission-status unknown';
  }
}

// Request microphone permission
function requestMicrophonePermission() {
  const permissionStatusElement = document.getElementById('permissionStatus');
  
  permissionStatusElement.textContent = 'Requesting microphone access...';
  permissionStatusElement.className = 'permission-status unknown';
  
  // For Mac users, just manually set the permission
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  if (isMac) {
    // Show specific instructions for Mac users
    permissionStatusElement.innerHTML = `
      <p>On Mac, you need to allow Chrome to access your microphone in System Preferences:</p>
      <ol style="text-align: left; margin-left: 20px;">
        <li>Open System Preferences</li>
        <li>Go to Security & Privacy</li>
        <li>Click on Privacy tab</li>
        <li>Select Microphone from the left panel</li>
        <li>Make sure Chrome is checked</li>
      </ol>
      <p>Then click the button below to manually set permission:</p>
      <button id="manualPermission" style="margin-top: 10px; padding: 5px 10px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
        I've granted permission in System Preferences
      </button>
    `;
    
    // Add event listener for manual permission button
    setTimeout(() => {
      const manualButton = document.getElementById('manualPermission');
      if (manualButton) {
        manualButton.addEventListener('click', function() {
          // Store permission status
          chrome.storage.sync.set({ microphonePermission: 'granted' }, function() {
            permissionStatusElement.textContent = 'Microphone access set to granted.';
            permissionStatusElement.className = 'permission-status granted';
          });
        });
      }
    }, 100);
    
    return;
  }
  
  // Standard approach for other platforms
  // First try with newer method if available
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(handleStreamSuccess)
      .catch(handleStreamError);
  } 
  // Fall back to older API versions for compatibility
  else if (navigator.getUserMedia) {
    navigator.getUserMedia({ audio: true }, handleStreamSuccess, handleStreamError);
  }
  else if (navigator.webkitGetUserMedia) {
    navigator.webkitGetUserMedia({ audio: true }, handleStreamSuccess, handleStreamError);
  }
  else if (navigator.mozGetUserMedia) {
    navigator.mozGetUserMedia({ audio: true }, handleStreamSuccess, handleStreamError);
  }
  else {
    // No getUserMedia support
    permissionStatusElement.textContent = 'Your browser does not support microphone access.';
    permissionStatusElement.className = 'permission-status denied';
  }
  
  // Success handler
  function handleStreamSuccess(stream) {
    // Permission granted
    permissionStatusElement.textContent = 'Microphone access granted successfully!';
    permissionStatusElement.className = 'permission-status granted';
    
    // Store permission status
    chrome.storage.sync.set({ microphonePermission: 'granted' });
    
    // Stop all tracks
    try {
      stream.getTracks().forEach(track => track.stop());
    } catch (e) {
      console.log('Error stopping tracks:', e);
      // Older API might not have getTracks
      if (stream.stop) {
        stream.stop();
      }
    }
  }
  
  // Error handler
  function handleStreamError(error) {
    console.error('Microphone access error:', error);
    
    let errorMessage = '';
    
    // Handle different error types
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError' || error === 'PERMISSION_DENIED') {
      errorMessage = 'Microphone access was denied. You need to allow it in your browser settings.';
      chrome.storage.sync.set({ microphonePermission: 'denied' });
    } else if (error.name === 'NotFoundError' || error === 'NO_DEVICES_FOUND') {
      errorMessage = 'No microphone found on your device.';
    } else {
      errorMessage = error.message || 'Unknown error accessing microphone';
    }
    
    permissionStatusElement.textContent = errorMessage;
    permissionStatusElement.className = 'permission-status denied';
  }
}

// Restore options from Chrome storage
function restoreOptions() {
  chrome.storage.sync.get(
    { apiKey: '' },
    (items) => {
      document.getElementById('apiKey').value = items.apiKey;
    }
  );
  
  // Check microphone permission
  checkMicrophonePermission();
}

// Initialize the page
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('requestPermission').addEventListener('click', requestMicrophonePermission);