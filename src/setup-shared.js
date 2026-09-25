// Setup widgets shared by the options page and the onboarding tour:
// engine picker, key fields that autosave, offline model download, the real
// keyboard binding, and the mic test. Everything writes straight to storage —
// there are no Save buttons anywhere.

(function () {
  const GEMINI_KEY_URL = 'https://aistudio.google.com/app/apikey';
  const DEEPGRAM_KEY_URL = 'https://console.deepgram.com/signup';

  const ENGINES = [
    {
      id: 'cloud',
      emoji: '☁️',
      name: 'Cloud',
      blurb: 'Gemini transcribes after you stop. Six personality styles.',
      cost: 'Free Gemini key',
      keyLabel: 'Gemini API key',
      keyUrl: GEMINI_KEY_URL,
      keyHint: 'Free from Google AI Studio. Stored only on this device, sent only to Google.'
    },
    {
      id: 'live',
      emoji: '⚡',
      name: 'Live',
      blurb: 'Deepgram streams words into the field while you talk.',
      cost: '$200 free credit',
      keyLabel: 'Deepgram API key',
      keyUrl: DEEPGRAM_KEY_URL,
      keyHint: 'Signup includes about $200 of credit — roughly 400 hours of dictation before you pay a cent.'
    },
    {
      id: 'offline',
      emoji: '🔒',
      name: 'Private',
      blurb: 'Whisper runs inside Chrome. Audio never leaves your machine.',
      cost: 'Free · no key · offline',
      keyLabel: null
    }
  ];

  const engineById = (id) => ENGINES.find((e) => e.id === id) || ENGINES[0];

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    children.forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  let toastTimer = null;
  function toast(message) {
    let node = document.querySelector('.toast');
    if (!node) {
      node = el('div', { class: 'toast', role: 'status' });
      document.body.appendChild(node);
    }
    node.textContent = message;
    requestAnimationFrame(() => node.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 1600);
  }

  // ---------------------------------------------------------------
  // Engine picker
  // ---------------------------------------------------------------
  async function mountEnginePicker(container, { onChange } = {}) {
    const { transcriptionEngine } = await chrome.storage.sync.get({ transcriptionEngine: 'cloud' });
    let current = engineById(transcriptionEngine).id;

    const grid = el('div', { class: 'engine-grid', role: 'radiogroup', 'aria-label': 'Transcription engine' });
    const cards = ENGINES.map((engine) => {
      const input = el('input', { type: 'radio', name: 'engine', value: engine.id });
      const card = el('label', { class: 'engine-card' }, [
        input,
        el('span', { class: 'engine-check', text: '✓' }),
        el('div', { class: 'engine-emoji', text: engine.emoji }),
        el('div', { class: 'engine-name', text: engine.name }),
        el('div', { class: 'engine-blurb', text: engine.blurb }),
        el('div', { class: 'engine-cost', text: engine.cost })
      ]);
      input.addEventListener('change', async () => {
        if (!input.checked) return;
        current = engine.id;
        cards.forEach((c) => c.classList.toggle('selected', c === card));
        await chrome.storage.sync.set({ transcriptionEngine: engine.id });
        toast(`${engine.emoji} ${engine.name} engine saved`);
        if (onChange) onChange(engine.id);
      });
      grid.appendChild(card);
      return card;
    });

    cards.forEach((card) => {
      const input = card.querySelector('input');
      input.checked = input.value === current;
      card.classList.toggle('selected', input.checked);
    });

    container.appendChild(grid);
    if (onChange) onChange(current);
    return { get current() { return current; } };
  }

  // ---------------------------------------------------------------
  // Your words — names and terms the models should spell your way.
  // Gemini gets them in the prompt, Deepgram nova-3 as keyterms.
  // ---------------------------------------------------------------
  function mountWords(container) {
    const HINT = 'Commas or new lines. Cloud and Live engines only.';
    const area = el('textarea', {
      placeholder: 'Svelte, Obsidian, Brunswick, Mesa Cosa',
      'aria-label': 'Your words',
      'data-talktype-ignore': '',
      rows: '2'
    });
    const note = el('div', { class: 'field-note', text: HINT });
    chrome.storage.sync.get({ customVocabulary: '' }).then(({ customVocabulary }) => {
      area.value = customVocabulary || '';
    });
    let timer = null;
    area.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await chrome.storage.sync.set({ customVocabulary: area.value.trim().slice(0, 2000) });
        note.textContent = 'Saved.';
        note.classList.add('saved');
        setTimeout(() => {
          note.textContent = HINT;
          note.classList.remove('saved');
        }, 1500);
      }, 500);
    });
    container.appendChild(area);
    container.appendChild(note);
  }

  // ---------------------------------------------------------------
  // Key field — autosaves on input (debounced) with a little "Saved" tick
  // ---------------------------------------------------------------
  function mountKeyField(container, engineId) {
    const engine = engineById(engineId);
    container.textContent = '';
    if (!engine.keyLabel) {
      container.appendChild(
        el('p', { class: 'field-note', text: 'No key needed. Private mode runs a Whisper model inside Chrome.' })
      );
      return;
    }

    const input = el('input', {
      type: 'password',
      placeholder: `Paste your ${engine.keyLabel} here`,
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': engine.keyLabel,
      'data-talktype-ignore': ''
    });
    const reveal = el('button', { type: 'button', class: 'secondary', text: 'Show', 'aria-label': 'Show or hide key' });
    reveal.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      reveal.textContent = showing ? 'Show' : 'Hide';
    });
    const note = el('div', { class: 'field-note', text: engine.keyHint });
    const link = el('a', { href: engine.keyUrl, target: '_blank', rel: 'noopener', text: `Get a ${engine.name === 'Cloud' ? 'free Gemini' : 'Deepgram'} key ↗` });

    const getter = engine.id === 'cloud' ? window.TalkTypeStorage.getApiKey : window.TalkTypeStorage.getDeepgramApiKey;
    const setter = engine.id === 'cloud' ? window.TalkTypeStorage.setApiKey : window.TalkTypeStorage.setDeepgramApiKey;

    getter().then((value) => {
      input.value = value || '';
      if (value) {
        note.textContent = `${engine.keyLabel} is set.`;
        note.classList.add('saved');
      }
    });

    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      note.classList.remove('saved');
      note.textContent = 'Saving…';
      timer = setTimeout(async () => {
        const saved = await setter(input.value);
        note.textContent = saved ? `Saved. ${engine.keyLabel} lives only on this device.` : engine.keyHint;
        note.classList.toggle('saved', Boolean(saved));
        if (saved) toast('Key saved');
        container.dispatchEvent(new CustomEvent('talktype-key-changed', { bubbles: true, detail: { engine: engine.id, hasKey: Boolean(saved) } }));
      }, 450);
    });

    container.appendChild(el('label', { text: engine.keyLabel }));
    container.appendChild(el('div', { class: 'field-row' }, [input, reveal]));
    container.appendChild(note);
    container.appendChild(el('div', { class: 'btn-row' }, [link]));
  }

  // ---------------------------------------------------------------
  // Offline model chooser + download with live progress
  // ---------------------------------------------------------------
  function mountOfflineModel(container) {
    container.textContent = '';

    const select = el('select', { 'aria-label': 'Private mode model' }, [
      el('option', { value: 'tiny', text: 'Tiny English — fastest, ~96MB, runs anywhere' }),
      el('option', { value: 'small', text: 'Distil-Small English — sharper, ~251MB, uses your GPU when it can' })
    ]);
    chrome.storage.sync.get({ offlineModel: 'tiny' }).then(({ offlineModel }) => {
      select.value = offlineModel;
    });
    select.addEventListener('change', () => {
      chrome.storage.sync.set({ offlineModel: select.value });
      toast('Model choice saved');
    });

    const button = el('button', { type: 'button', text: 'Download model now' });
    const status = el('div', { class: 'status' });
    const bar = el('div', { class: 'progress', style: 'display:none' }, [el('span')]);

    const show = (text, kind) => {
      status.textContent = text;
      status.className = `status show ${kind || ''}`;
    };

    button.addEventListener('click', () => {
      button.disabled = true;
      bar.style.display = 'block';
      show('Starting download — one time only, then it works fully offline…');
      chrome.runtime
        .sendMessage({ action: 'prepareOfflineModel' })
        .then((response) => {
          if (response?.ready) {
            show('✓ Model ready. Private mode works offline now.', 'ok');
            bar.firstChild.style.width = '100%';
          } else {
            show(response?.error || 'Model setup failed. Try again.', 'err');
          }
        })
        .catch(() => show('Model setup failed. Try again.', 'err'))
        .finally(() => {
          button.disabled = false;
        });
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.action !== 'offlineModelProgress') return;
      if (message.status === 'ready') {
        show('✓ Model ready. Private mode works offline now.', 'ok');
        bar.firstChild.style.width = '100%';
      } else if (message.status === 'progress' && message.file && message.progress !== null) {
        bar.style.display = 'block';
        bar.firstChild.style.width = `${message.progress}%`;
        show(`Downloading ${message.file} — ${message.progress}%`);
      }
    });

    container.appendChild(el('label', { text: 'Model' }));
    container.appendChild(select);
    container.appendChild(el('div', { class: 'field-note', text: 'You can skip this — the model downloads itself on first use.' }));
    container.appendChild(el('div', { class: 'btn-row' }, [button]));
    container.appendChild(bar);
    container.appendChild(status);
  }

  // ---------------------------------------------------------------
  // Keyboard shortcut — shows the binding Chrome actually applied
  // ---------------------------------------------------------------
  async function getShortcut() {
    try {
      const commands = await chrome.commands.getAll();
      return commands.find((c) => c.name === 'toggle-recording')?.shortcut || '';
    } catch (e) {
      return '';
    }
  }

  async function mountShortcut(container) {
    container.textContent = '';
    const shortcut = await getShortcut();

    const chip = shortcut
      ? el('span', { class: 'chip ok' }, ['Bound to ', el('kbd', { text: shortcut })])
      : el('span', { class: 'chip warn', text: 'Not bound — another extension has Alt+Shift+D' });

    const change = el('button', { type: 'button', class: 'secondary', text: shortcut ? 'Change shortcut' : 'Pick a shortcut' });
    change.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openShortcutSettings' }));

    container.appendChild(el('div', { class: 'btn-row', style: 'align-items:center; margin-top:0' }, [chip, change]));
    container.appendChild(
      el('p', { class: 'field-note', style: 'margin-top:10px' }, [
        'Click into any text box, press it, talk, press it again. ',
        el('kbd', { text: 'Esc' }),
        ' throws a recording away.'
      ])
    );
    return shortcut;
  }

  // ---------------------------------------------------------------
  // Microphone test (extension-origin permission; sites ask once each)
  // ---------------------------------------------------------------
  function mountMicTest(container) {
    container.textContent = '';
    const button = el('button', { type: 'button', text: '🎙 Test microphone' });
    const status = el('div', { class: 'status' });
    const show = (text, kind) => {
      status.textContent = text;
      status.className = `status show ${kind || ''}`;
    };

    chrome.storage.sync.get(['microphonePermission']).then(({ microphonePermission }) => {
      if (microphonePermission === 'granted') show('Microphone access was granted for TalkType before. Test again anytime.', 'ok');
    });

    button.addEventListener('click', async () => {
      show('Asking Chrome for the mic…');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach((t) => t.stop());
        chrome.storage.sync.set({ microphonePermission: 'granted' });
        show('✓ Mic works. Heads up: Chrome asks once per website the first time you dictate there.', 'ok');
      } catch (error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          chrome.storage.sync.set({ microphonePermission: 'denied' });
          const mac = navigator.platform.toUpperCase().includes('MAC');
          show(
            `Mic blocked. Open chrome://settings/content/microphone, find TalkType (${chrome.runtime.id}) and set it to Allow.${
              mac ? ' On macOS also check System Settings → Privacy & Security → Microphone for Chrome.' : ''
            }`,
            'err'
          );
        } else if (error.name === 'NotFoundError') {
          show('No microphone found. Plug one in and try again.', 'err');
        } else {
          show(`Could not access the microphone: ${error.message}`, 'err');
        }
      }
    });

    const settings = el('button', { type: 'button', class: 'secondary', text: 'Chrome mic settings' });
    settings.addEventListener('click', () => chrome.tabs.create({ url: 'chrome://settings/content/microphone' }));

    container.appendChild(el('div', { class: 'btn-row', style: 'margin-top:0' }, [button, settings]));
    container.appendChild(status);
  }

  window.TalkTypeSetup = {
    ENGINES,
    engineById,
    el,
    toast,
    mountEnginePicker,
    mountKeyField,
    mountWords,
    mountOfflineModel,
    mountShortcut,
    mountMicTest,
    getShortcut,
    GEMINI_KEY_URL,
    DEEPGRAM_KEY_URL
  };
})();
