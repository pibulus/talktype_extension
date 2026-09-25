// Options page — every control writes to storage the moment it changes.

(function () {
  const S = window.TalkTypeSetup;

  const STYLES = [
    { id: 'standard', name: 'Clean & Accurate', blurb: 'Straight transcription. Filler words gone.' },
    { id: 'surlyPirate', name: 'Surly Pirate', blurb: 'Arr! Yer words, saltier.' },
    { id: 'leetSpeak', name: 'L33t Sp34k', blurb: 'Y0ur w0rd5 1n h4ck3r sp34k.' },
    { id: 'sparklePop', name: 'Sparkle Pop', blurb: 'OMG so bubbly!!! Emojis everywhere!!!' },
    { id: 'codeWhisperer', name: 'Code Whisperer', blurb: 'Rambling in, tidy technical prompt out.' },
    { id: 'quillAndInk', name: 'Quill & Ink', blurb: 'Victorian prose, dear reader.' },
    { id: 'custom', name: 'Bring your own', blurb: 'Tell it what to do with your words.' }
  ];

  async function mountStyles() {
    const grid = document.getElementById('style-grid');
    const { transcriptionStyle } = await chrome.storage.sync.get({ transcriptionStyle: 'standard' });

    const customBox = document.getElementById('custom-style');
    const reflect = (id) => {
      customBox.style.display = id === 'custom' ? 'block' : 'none';
    };

    const options = STYLES.map((style) => {
      const input = S.el('input', { type: 'radio', name: 'style', value: style.id });
      input.checked = style.id === transcriptionStyle;
      const option = S.el('label', { class: `style-option${input.checked ? ' selected' : ''}` }, [
        input,
        S.el('span', { class: 'engine-check', text: '✓' }),
        S.el('div', { class: 'style-name', text: style.name }),
        S.el('div', { class: 'style-blurb', text: style.blurb })
      ]);
      input.addEventListener('change', async () => {
        if (!input.checked) return;
        options.forEach((o) => o.classList.toggle('selected', o === option));
        reflect(style.id);
        await chrome.storage.sync.set({ transcriptionStyle: style.id });
        S.toast(`Style: ${style.name}`);
      });
      grid.appendChild(option);
      return option;
    });
    reflect(transcriptionStyle);

    const prompt = document.getElementById('custom-prompt');
    const note = document.getElementById('custom-note');
    const { customStylePrompt } = await chrome.storage.sync.get({ customStylePrompt: '' });
    prompt.value = customStylePrompt || '';
    let timer = null;
    prompt.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await chrome.storage.sync.set({ customStylePrompt: prompt.value.trim().slice(0, 1000) });
        note.textContent = 'Saved.';
        setTimeout(() => {
          note.textContent = 'Applied after transcription. Short and bossy works best.';
        }, 1500);
      }, 500);
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
    S.mountWords(document.getElementById('words'));
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
