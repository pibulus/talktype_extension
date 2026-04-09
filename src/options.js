// Options page script

// Style preview descriptions
const STYLE_PREVIEWS = {
  standard: 'Removes filler words and stutters. Just the clean goods.',
  surlyPirate: 'Arr! Yer words be rewritten in the tongue of a salty sea dog.',
  leetSpeak: 'Y0ur w0rd5 g3t c0nv3rt3d 1nt0 h4ck3r sp34k. 1337!',
  sparklePop: 'OMG your words become TOTALLY bubbly and sparkly!!! Like, SO extra!!!',
  codeWhisperer: 'Restructures your speech into clean, technical language for coding prompts.',
  quillAndInk: 'Your words are rendered in the most elegant Victorian prose, dear reader.',
};

// Save API key to Chrome storage
function saveOptions() {
  const apiKey = document.getElementById('apiKey').value.trim();

  chrome.storage.sync.set(
    { apiKey },
    () => {
      const status = document.getElementById('status');
      status.textContent = 'API key saved.';
      status.className = 'status success';
      status.style.display = 'block';

      setTimeout(() => {
        status.style.display = 'none';
      }, 2000);
    }
  );
}

// Save transcription style
function saveStyle() {
  const style = document.getElementById('transcriptionStyle').value;

  chrome.storage.sync.set(
    { transcriptionStyle: style },
    () => {
      const status = document.getElementById('styleStatus');
      status.textContent = 'Style saved! New transcriptions will use this style.';
      status.className = 'status success';
      status.style.display = 'block';

      setTimeout(() => {
        status.style.display = 'none';
      }, 2500);
    }
  );
}

// Update the style preview text
function updateStylePreview() {
  const style = document.getElementById('transcriptionStyle').value;
  const preview = document.getElementById('stylePreview');
  preview.textContent = STYLE_PREVIEWS[style] || STYLE_PREVIEWS.standard;
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
  
  permissionStatusElement.textContent = 'Testing microphone access...';
  permissionStatusElement.className = 'permission-status unknown';
  
  // For all users, we want to see if Chrome's permission is already set correctly
  const extensionId = chrome.runtime.id;
  
  permissionStatusElement.innerHTML = `
    <p>Testing access to your microphone...</p>
    <p style="font-size: 12px; margin-top: 5px;">This will trigger Chrome's permission prompt if access isn't already granted.</p>
  `;
  
  // Add a message about the current extension ID to help users identify it in Chrome settings
  const idMessage = document.createElement('div');
  idMessage.style.marginTop = '10px';
  idMessage.style.padding = '6px';
  idMessage.style.backgroundColor = '#fff3cd';
  idMessage.style.borderRadius = '4px';
  idMessage.style.fontSize = '12px';
  idMessage.innerHTML = `<strong>Your extension ID:</strong> ${extensionId}<br>Look for this ID in Chrome settings.`;
  permissionStatusElement.appendChild(idMessage);
  
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
    permissionStatusElement.innerHTML = `
      <p style="color: #155724; font-weight: bold;">✓ Microphone access granted successfully!</p>
      <p style="margin-top: 10px;">Chrome permission is set correctly to "Allow". Your extension can now use the microphone.</p>
      <p style="margin-top: 10px; font-size: 13px;">Note: This setting has been stored in both Chrome's settings and the extension's storage.</p>
    `;
    permissionStatusElement.className = 'permission-status granted';
    
    // Store permission status
    chrome.storage.sync.set({ microphonePermission: 'granted' });
    
    // Record the permission and settings URLs to help users find them later
    const settingsLink = document.createElement('div');
    settingsLink.style.marginTop = '15px';
    settingsLink.innerHTML = `
      <button id="checkSettings" style="font-size: 12px; padding: 4px 8px;">
        Verify Chrome Settings
      </button>
    `;
    permissionStatusElement.appendChild(settingsLink);
    
    // Add click handler for the settings verification
    setTimeout(() => {
      const checkButton = document.getElementById('checkSettings');
      if (checkButton) {
        checkButton.addEventListener('click', openChromeSettings);
      }
    }, 100);
    
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
    
    // Get extension ID to help user identify it in settings
    const extensionId = chrome.runtime.id;
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
    // Handle different error types
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError' || error === 'PERMISSION_DENIED') {
      // User denied permission or it's set to "Block" in Chrome
      permissionStatusElement.innerHTML = `
        <p style="color: #721c24; font-weight: bold;">❌ Microphone access denied</p>
        <p style="margin-top: 10px;">You need to change Chrome's permission settings for this extension to "Allow".</p>
        
        <div style="margin-top: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 4px;">
          <p><strong>To fix this:</strong></p>
          <ol style="margin-left: 20px; margin-top: 5px;">
            <li>Click "Open Chrome Microphone Settings" button below</li>
            <li>Find <code>chrome-extension://${extensionId}</code> in the list</li>
            <li>Change its setting from "Block" to "Allow"</li>
            <li>Return to this page and click "Test Microphone Access" again</li>
          </ol>
          ${isMac ? `
          <p style="margin-top: 10px;"><strong>Mac users:</strong> Also check System Preferences > Security & Privacy > Privacy > Microphone</p>
          ` : ''}
        </div>
      `;
      
      // Add direct link to Chrome settings
      const fixButton = document.createElement('button');
      fixButton.textContent = 'Open Chrome Microphone Settings';
      fixButton.style.marginTop = '15px';
      fixButton.style.padding = '8px 12px';
      fixButton.addEventListener('click', openChromeSettings);
      permissionStatusElement.appendChild(fixButton);
      
      // Mark as denied in storage
      chrome.storage.sync.set({ microphonePermission: 'denied' });
    } else if (error.name === 'NotFoundError' || error === 'NO_DEVICES_FOUND') {
      permissionStatusElement.innerHTML = `
        <p style="color: #721c24; font-weight: bold;">❌ No microphone found</p>
        <p style="margin-top: 10px;">Your device doesn't have a microphone, or it's not properly connected.</p>
        <p style="margin-top: 5px;">Please connect a microphone and try again.</p>
      `;
    } else {
      permissionStatusElement.innerHTML = `
        <p style="color: #721c24; font-weight: bold;">❌ Error accessing microphone</p>
        <p style="margin-top: 10px;">${error.message || 'Unknown error accessing microphone'}</p>
        <p style="margin-top: 10px;">Try refreshing the page or restarting your browser.</p>
      `;
    }
    
    permissionStatusElement.className = 'permission-status denied';
  }
}

// Restore options from Chrome storage
function restoreOptions() {
  chrome.storage.sync.get(
    { apiKey: '', transcriptionStyle: 'standard' },
    (items) => {
      document.getElementById('apiKey').value = items.apiKey;
      document.getElementById('transcriptionStyle').value = items.transcriptionStyle;
      updateStylePreview();
    }
  );

  // Check microphone permission
  checkMicrophonePermission();
}

// Open Chrome's microphone settings
function openChromeSettings() {
  chrome.tabs.create({
    url: 'chrome://settings/content/microphone'
  });
}

// Initialize the page
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('saveStyle').addEventListener('click', saveStyle);
document.getElementById('transcriptionStyle').addEventListener('change', updateStylePreview);
document.getElementById('requestPermission').addEventListener('click', requestMicrophonePermission);
document.getElementById('openChromeSettings').addEventListener('click', openChromeSettings);
