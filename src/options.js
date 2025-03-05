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
async function checkMicrophonePermission() {
  const permissionStatusElement = document.getElementById('permissionStatus');
  
  try {
    // Try to query current permission status
    const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
    
    // Update UI based on permission state
    if (permissionStatus.state === 'granted') {
      permissionStatusElement.textContent = 'Microphone access is granted.';
      permissionStatusElement.className = 'permission-status granted';
      chrome.storage.sync.set({ microphonePermission: 'granted' });
    } else if (permissionStatus.state === 'denied') {
      permissionStatusElement.textContent = 'Microphone access is denied. You need to allow it in your browser settings.';
      permissionStatusElement.className = 'permission-status denied';
      chrome.storage.sync.set({ microphonePermission: 'denied' });
    } else {
      permissionStatusElement.textContent = 'Microphone permission status is prompt. Click the button below to request access.';
      permissionStatusElement.className = 'permission-status unknown';
    }
    
    // Listen for permission changes
    permissionStatus.onchange = function() {
      checkMicrophonePermission();
    };
  } catch (error) {
    console.log('Permission query not supported:', error);
    
    // Fall back to checking stored permission
    chrome.storage.sync.get(['microphonePermission'], (result) => {
      if (result.microphonePermission === 'granted') {
        permissionStatusElement.textContent = 'Microphone access was previously granted.';
        permissionStatusElement.className = 'permission-status granted';
      } else {
        permissionStatusElement.textContent = 'Unable to determine microphone permission status. Click the button below to request access.';
        permissionStatusElement.className = 'permission-status unknown';
      }
    });
  }
}

// Request microphone permission
async function requestMicrophonePermission() {
  const permissionStatusElement = document.getElementById('permissionStatus');
  
  permissionStatusElement.textContent = 'Requesting microphone access...';
  permissionStatusElement.className = 'permission-status unknown';
  
  try {
    // Actually request browser permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Permission granted
    permissionStatusElement.textContent = 'Microphone access granted successfully!';
    permissionStatusElement.className = 'permission-status granted';
    
    // Store permission status
    chrome.storage.sync.set({ microphonePermission: 'granted' });
    
    // Stop all tracks
    stream.getTracks().forEach(track => track.stop());
  } catch (error) {
    console.error('Microphone access error:', error);
    
    // Handle different error types
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      permissionStatusElement.textContent = 'Microphone access was denied. You need to allow it in your browser settings.';
      permissionStatusElement.className = 'permission-status denied';
      chrome.storage.sync.set({ microphonePermission: 'denied' });
    } else if (error.name === 'NotFoundError') {
      permissionStatusElement.textContent = 'No microphone found on your device.';
      permissionStatusElement.className = 'permission-status denied';
    } else {
      permissionStatusElement.textContent = `Error: ${error.message}`;
      permissionStatusElement.className = 'permission-status denied';
    }
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