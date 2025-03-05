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
  
  // First check if the browser supports the necessary APIs
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    permissionStatusElement.textContent = 'Your browser does not support audio recording.';
    permissionStatusElement.className = 'permission-status denied';
    return;
  }
  
  // Check if permissions API is supported
  if (navigator.permissions && navigator.permissions.query) {
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
      return;
    } catch (error) {
      console.log('Permission query failed:', error);
      // Continue to fallback methods
    }
  }
  
  // If permissions API is not supported or failed, try a direct approach
  // We'll try to directly request and then immediately release
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // If we get here, permission was granted
    stream.getTracks().forEach(track => track.stop());
    
    permissionStatusElement.textContent = 'Microphone access is granted.';
    permissionStatusElement.className = 'permission-status granted';
    chrome.storage.sync.set({ microphonePermission: 'granted' });
  } catch (error) {
    console.log('Direct permission check failed:', error);
    
    // Fall back to checking stored permission
    chrome.storage.sync.get(['microphonePermission'], (result) => {
      if (result.microphonePermission === 'granted') {
        permissionStatusElement.textContent = 'Microphone access was previously granted.';
        permissionStatusElement.className = 'permission-status granted';
      } else {
        permissionStatusElement.textContent = 'Click the button below to request microphone access.';
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
  
  // First check if getUserMedia is supported
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    permissionStatusElement.textContent = 'Error: Your browser does not support audio recording.';
    permissionStatusElement.className = 'permission-status denied';
    return;
  }
  
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