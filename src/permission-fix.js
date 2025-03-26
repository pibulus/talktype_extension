// Permission Fix Script
// This script provides a direct way to request microphone permissions

console.log('Permission fix script loaded');

document.addEventListener('DOMContentLoaded', () => {
  const permissionButton = document.createElement('button');
  permissionButton.textContent = 'Request Microphone Access';
  permissionButton.style.display = 'block';
  permissionButton.style.margin = '10px auto';
  permissionButton.style.padding = '10px 15px';
  permissionButton.style.backgroundColor = '#FF7A45';
  permissionButton.style.color = 'white';
  permissionButton.style.border = 'none';
  permissionButton.style.borderRadius = '5px';
  permissionButton.style.cursor = 'pointer';
  
  permissionButton.addEventListener('click', async () => {
    try {
      // Simple, direct request for microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Stop the stream right away, we just needed permission
      stream.getTracks().forEach(track => track.stop());
      
      // Store permission status
      chrome.storage.sync.set({ microphonePermission: 'granted' });
      
      // Show success message
      const status = document.getElementById('permission-status');
      if (status) {
        status.textContent = 'Microphone access granted!';
        status.style.color = 'green';
      }
      
      permissionButton.textContent = 'Access Granted';
      permissionButton.disabled = true;
      permissionButton.style.backgroundColor = '#4caf50';
      
      setTimeout(() => {
        window.close();
      }, 1500);
      
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
      
      // Show detailed error message
      const status = document.getElementById('permission-status');
      if (status) {
        status.innerHTML = `
          <span style="color: red;">Microphone access denied.</span><br>
          <span style="font-size: 14px;">Please check your browser settings:</span>
          <ol style="font-size: 13px; margin-top: 5px;">
            <li>Click the lock/shield icon in the address bar</li>
            <li>Ensure Microphone is set to "Allow"</li>
            <li>If using macOS, also check System Preferences > Security & Privacy > Microphone</li>
          </ol>
        `;
      }
    }
  });
  
  // Create a container
  const container = document.createElement('div');
  container.style.textAlign = 'center';
  container.style.padding = '15px';
  
  // Create a status element
  const status = document.createElement('div');
  status.id = 'permission-status';
  status.textContent = 'Click the button below to grant microphone access';
  status.style.marginBottom = '15px';
  
  // Add elements to the page
  container.appendChild(status);
  container.appendChild(permissionButton);
  
  // Add a link to Chrome microphone settings
  const settingsLink = document.createElement('a');
  settingsLink.href = 'chrome://settings/content/microphone';
  settingsLink.textContent = 'Open Chrome Microphone Settings';
  settingsLink.style.display = 'block';
  settingsLink.style.marginTop = '15px';
  settingsLink.style.fontSize = '13px';
  settingsLink.style.color = '#666';
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://settings/content/microphone' });
  });
  
  container.appendChild(settingsLink);
  
  // Add to body if it exists, otherwise wait for it
  if (document.body) {
    document.body.appendChild(container);
  } else {
    window.addEventListener('load', () => {
      document.body.appendChild(container);
    });
  }
});