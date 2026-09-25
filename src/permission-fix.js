// Standalone mic-permission window, opened when a site's getUserMedia is
// refused and the popup/options can't take over. Grants the extension origin.

document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('permission-status');
  const button = document.getElementById('request');

  button.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach((track) => track.stop());
      chrome.storage.sync.set({ microphonePermission: 'granted' });

      status.textContent = '✓ Mic access granted. Back to talking.';
      button.textContent = 'Done';
      button.disabled = true;
      setTimeout(() => window.close(), 1400);
    } catch (error) {
      const mac = navigator.platform.toUpperCase().includes('MAC');
      status.innerHTML = '';
      const heading = document.createElement('strong');
      heading.textContent = 'Microphone still blocked.';
      const list = document.createElement('ol');
      [
        'Click the lock icon in the address bar and set Microphone to Allow',
        'Or open Chrome mic settings below and allow TalkType',
        mac ? 'On macOS, check System Settings → Privacy & Security → Microphone for Chrome' : null
      ]
        .filter(Boolean)
        .forEach((text) => {
          const li = document.createElement('li');
          li.textContent = text;
          list.appendChild(li);
        });
      status.appendChild(heading);
      status.appendChild(list);
    }
  });

  document.getElementById('settings').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://settings/content/microphone' });
  });
});
