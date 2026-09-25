// Options page — every control writes to storage the moment it changes.

(function () {
  const S = window.TalkTypeSetup;

  const STYLES = [
    { id: 'standard', name: 'Clean & Accurate', blurb: 'Straight transcription. Filler words gone.' },
    { id: 'surlyPirate', name: 'Surly Pirate', blurb: 'Arr! Yer words, saltier.' },
    { id: 'leetSpeak', name: 'L33t Sp34k', blurb: 'Y0ur w0rd5 1n h4ck3r sp34k.' },
    { id: 'sparklePop', name: 'Sparkle Pop', blurb: 'OMG so bubbly!!! Emojis everywhere!!!' },
    { id: 'codeWhisperer', name: 'Code Whisperer', blurb: 'Rambling in, tidy technical prompt out.' },
    { id: 'quillAndInk', name: 'Quill & Ink', blurb: 'Victorian prose, dear reader.' }
  ];

  async function mountStyles() {
    const grid = document.getElementById('style-grid');
    const { transcriptionStyle } = await chrome.storage.sync.get({ transcriptionStyle: 'standard' });

    const options = STYLES.map((style) => {
      const input = S.el('input', { type: 'radio', name: 'style', value: style.id });
      input.checked = style.id === transcriptionStyle;
      const option = S.el('label', { class: `style-option${input.checked ? ' selected' : ''}` }, [
        input,
        S.el('div', {}, [
          S.el('div', { class: 'style-name', text: style.name }),
          S.el('div', { class: 'style-blurb', text: style.blurb })
        ])
      ]);
      input.addEventListener('change', async () => {
        if (!input.checked) return;
        options.forEach((o) => o.classList.toggle('selected', o === option));
        await chrome.storage.sync.set({ transcriptionStyle: style.id });
        S.toast(`Style: ${style.name}`);
      });
      grid.appendChild(option);
      return option;
    });
  }

  function reflectEngine(engineId) {
    const keyField = document.getElementById('key-field');
    const offline = document.getElementById('offline-model');
    const styleCard = document.getElementById('style-card');

    S.mountKeyField(keyField, engineId);

    if (engineId === 'offline') {
      offline.style.display = 'block';
      if (!offline.dataset.mounted) {
        S.mountOfflineModel(offline);
        offline.dataset.mounted = 'true';
      }
    } else {
      offline.style.display = 'none';
    }

    const cloud = engineId === 'cloud';
    styleCard.classList.toggle('muted', !cloud);
    styleCard.querySelectorAll('input').forEach((i) => {
      i.disabled = !cloud;
    });
  }

  async function mountToggles() {
    const prefs = await chrome.storage.sync.get({
      smartModeEnabled: true,
      soundEffectsEnabled: true,
      historyEnabled: false
    });
    const map = {
      smartMode: ['smartModeEnabled', prefs.smartModeEnabled !== false],
      soundEffects: ['soundEffectsEnabled', prefs.soundEffectsEnabled !== false],
      historyEnabled: ['historyEnabled', prefs.historyEnabled === true]
    };
    Object.entries(map).forEach(([id, [key, value]]) => {
      const box = document.getElementById(id);
      box.checked = value;
      box.addEventListener('change', async () => {
        await chrome.storage.sync.set({ [key]: box.checked });
        S.toast(box.checked ? 'On' : 'Off');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await mountStyles();
    await S.mountEnginePicker(document.getElementById('engine-picker'), { onChange: reflectEngine });
    S.mountShortcut(document.getElementById('shortcut'));
    S.mountMicTest(document.getElementById('mic-test'));
    mountToggles();

    document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;
    document.getElementById('show-tour').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'openOnboarding' });
    });
  });
})();
