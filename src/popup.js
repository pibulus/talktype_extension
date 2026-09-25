// Toolbar popup: one big button. Records here, transcribes through the
// background worker (which holds the keys), then drops the text into the
// field you had focused on the page — or the clipboard if there wasn't one.

(function () {
  const MAX_RECORDING_MS = 2 * 60 * 1000;
  const ENGINE_LABELS = { browser: 'Quick', cloud: 'Cloud', live: 'Live', offline: 'Private' };
  const KEY_URLS = {
    cloud: 'https://aistudio.google.com/app/apikey',
    live: 'https://console.deepgram.com/signup'
  };

  const $ = (id) => document.getElementById(id);

  let audioService = new AudioRecordingService();
  let isRecording = false;
  let isStarting = false;
  let autoStopTimer = null;
  let tickTimer = null;
  let startedAt = 0;
  let setup = { engine: 'cloud', engineReady: false, shortcut: '' };
  let smartModeEnabled = true;
  let pageTarget = null; // { hasActiveInput, inputInfo, host }
  let lastTranscript = '';

  // ---------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------
  function setStatus(kind, text) {
    const pill = $('status');
    pill.className = `status-pill ${kind}`;
    $('status-text').textContent = text;
  }

  let toastTimer = null;
  function toast(text) {
    const node = $('toast');
    node.textContent = text;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 1500);
  }

  function showError(message) {
    const node = $('error');
    node.textContent = message;
    node.style.display = message ? 'block' : 'none';
  }

  function setRecordButton(mode) {
    const button = $('record');
    const label = $('record-label');
    button.classList.remove('stop');
    button.disabled = false;
    if (mode === 'recording') {
      button.classList.add('stop');
      label.textContent = 'Done — transcribe';
    } else if (mode === 'processing') {
      button.disabled = true;
      label.textContent = 'Transcribing…';
    } else {
      label.textContent = 'Start talking';
    }
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function renderTarget() {
    const node = $('target');
    if (!setup.engineReady) {
      node.innerHTML = '';
      return;
    }
    const where = document.createElement('span');
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';
    if (smartModeEnabled && pageTarget?.hasActiveInput) {
      where.innerHTML = `Lands in the text box on <b>${escapeHtml(pageTarget.host || 'this page')}</b>`;
    } else {
      where.innerHTML = 'Copies to clipboard <span style="opacity:.7">(click a text box on the page first to insert there)</span>';
    }
    node.replaceChildren(arrow, where);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // ---------------------------------------------------------------
  // Setup state
  // ---------------------------------------------------------------
  async function refreshSetup() {
    setup = (await chrome.runtime.sendMessage({ action: 'getSetupState' }).catch(() => null)) || setup;
    const engine = setup.engine || 'cloud';

    $('engine-chip').textContent = ENGINE_LABELS[engine] || ENGINE_LABELS.cloud;

    const shortcutChip = $('shortcut-chip');
    if (setup.shortcut) {
      shortcutChip.className = 'chip';
      shortcutChip.innerHTML = `<kbd>${escapeHtml(setup.shortcut)}</kbd>`;
      shortcutChip.title = 'Press this in any text box to dictate. Click to change.';
    } else {
      shortcutChip.className = 'chip warn';
      shortcutChip.textContent = 'No shortcut';
      shortcutChip.title = 'Another extension took Alt+Shift+D. Click to pick one.';
    }

    const setupCard = $('setup');
    if (setup.engineReady) {
      setupCard.style.display = 'none';
      $('record').disabled = false;
    } else {
      setupCard.style.display = 'block';
      $('record').disabled = true;
      const need = engine === 'live' ? 'Deepgram' : 'Gemini';
      $('setup-title').textContent = `${ENGINE_LABELS[engine]} needs a ${need} key`;
      $('setup-text').textContent =
        engine === 'live'
          ? 'Free signup, about $200 of credit. Or switch to Private mode — no key at all.'
          : 'Free from Google AI Studio. Or switch to Private mode — no key at all.';
      $('setup-key').onclick = () => chrome.tabs.create({ url: KEY_URLS[engine] || KEY_URLS.cloud });
    }
    renderTarget();
  }

  async function refreshPageTarget() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    let host = '';
    try {
      host = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, '') : '';
    } catch (e) {
      host = '';
    }
    const response = await chrome.runtime
      .sendMessage({ action: 'sendToActiveTab', payload: { action: 'checkActiveInput' } })
      .catch(() => null);
    pageTarget = {
      hasActiveInput: Boolean(response?.hasActiveInput),
      inputInfo: response?.inputInfo || null,
      host: response?.host || host
    };
    renderTarget();
  }

  // ---------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------
  async function startRecording() {
    if (isRecording || isStarting) return;
    isStarting = true;
    showError('');

    try {
      if (!audioService.isRecordingSupported()) {
        throw new Error('This browser cannot record audio. Chrome or Edge, please.');
      }

      if (setup.engine === 'browser') {
        await startQuick();
      } else {
        await audioService.startRecording();
      }
      isRecording = true;
      startedAt = Date.now();
      window.TalkTypeSounds?.play('start');

      setStatus('recording', 'Listening');
      setRecordButton('recording');
      $('listening').classList.add('show');
      $('result').style.display = 'none';
      $('timer').textContent = '0:00';
      tickTimer = setInterval(() => {
        $('timer').textContent = formatTime(Date.now() - startedAt);
      }, 500);
      autoStopTimer = setTimeout(() => {
        if (isRecording) stopRecording();
      }, MAX_RECORDING_MS);
    } catch (error) {
      handleStartError(error);
    } finally {
      isStarting = false;
    }
  }

  function handleStartError(error) {
    window.TalkTypeSounds?.play('error');
    setStatus('error', 'Mic issue');
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError' || /permission/i.test(error.message)) {
      showError('Chrome blocked the mic for TalkType. Open Settings → Microphone to fix it.');
    } else if (error.name === 'NotFoundError') {
      showError('No microphone found.');
    } else {
      showError(error.message || 'Could not start recording.');
    }
  }

  async function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    clearTimeout(autoStopTimer);
    clearInterval(tickTimer);
    $('listening').classList.remove('show');

    setStatus('processing', 'Transcribing');
    setRecordButton('processing');
    window.TalkTypeSounds?.play('stop');

    try {
      const { transcriptionStyle } = await chrome.storage.sync.get({ transcriptionStyle: 'standard' });

      let transcript = '';
      if (quick) {
        transcript = await stopQuick();
      } else {
        const audioBlob = await audioService.stopRecording();
        const api = new GeminiApiService();
        api.setStyle(transcriptionStyle);
        transcript = (await api.transcribeAudio(audioBlob)) || '';
      }
      lastTranscript = transcript.trim();

      if (!lastTranscript) {
        setStatus('ready', 'Ready');
        setRecordButton('idle');
        showError('No speech detected. Try again a touch closer to the mic.');
        return;
      }

      window.TalkTypeStorage
        .appendTranscriptToHistory({ text: lastTranscript, style: transcriptionStyle, host: 'popup' })
        .then(renderHistory)
        .catch(() => {});

      let inserted = false;
      if (smartModeEnabled && pageTarget?.hasActiveInput) {
        const response = await chrome.runtime
          .sendMessage({ action: 'sendToActiveTab', payload: { action: 'insertTranscription', text: lastTranscript } })
          .catch(() => null);
        inserted = Boolean(response?.success);
      }

      try {
        await navigator.clipboard.writeText(lastTranscript);
      } catch (e) {
        // Clipboard can be unavailable in odd contexts; the text is still on screen.
      }

      window.TalkTypeSounds?.play('success');
      showResult(lastTranscript, inserted);
      setStatus('ready', inserted ? 'Inserted' : 'Copied');
      toast(inserted ? 'Dropped into the page + copied' : 'Copied to clipboard');
      setTimeout(() => {
        if (!isRecording) setStatus('ready', 'Ready');
      }, 2500);
    } catch (error) {
      window.TalkTypeSounds?.play('error');
      setStatus('error', 'Failed');
      showError(error.message || 'Transcription failed.');
    } finally {
      if (!isRecording) setRecordButton('idle');
    }
  }

  function showResult(text, inserted) {
    $('result-text').textContent = text;
    $('result').style.display = 'block';
    const insertButton = $('insert');
    insertButton.style.display = !inserted && pageTarget?.hasActiveInput ? 'inline-flex' : 'none';
  }

  // ---------------------------------------------------------------
  // Quick engine — Chrome's built-in recognition, right here in the popup.
  // Interim words show in the transcript card as you talk.
  // ---------------------------------------------------------------
  let quick = null;

  function startQuick() {
    return new Promise((resolve, reject) => {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        reject(new Error('This browser has no built-in speech recognition. Pick another engine in Settings.'));
        return;
      }
      const rec = new Recognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || 'en-US';

      let finals = '';
      let started = false;
      let stopping = false;
      let onDone = null;

      rec.onstart = () => {
        started = true;
        resolve();
      };
      rec.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = (result[0]?.transcript || '').trim();
          if (!text) continue;
          if (result.isFinal) finals = finals ? `${finals} ${text}` : text;
          else interim += text + ' ';
        }
        $('result').style.display = 'block';
        $('result-text').textContent = `${finals} ${interim}`.trim();
      };
      rec.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        const error = new Error(
          event.error === 'network'
            ? "Chrome couldn't reach its speech service. Check your connection."
            : event.error === 'audio-capture'
              ? 'No microphone found.'
              : `Speech recognition error: ${event.error}`
        );
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') error.name = 'NotAllowedError';
        if (!started) reject(error);
        else showError(error.message);
      };
      rec.onend = () => {
        if (stopping) {
          if (onDone) onDone(finals.trim());
        } else if (isRecording) {
          try {
            rec.start(); // Chrome ends after a pause; keep going until the user stops
          } catch (e) {
            // Already starting.
          }
        }
      };

      quick = {
        stop: () =>
          new Promise((done) => {
            stopping = true;
            onDone = done;
            setTimeout(() => done(finals.trim()), 1500);
            try {
              rec.stop();
            } catch (e) {
              done(finals.trim());
            }
          }),
        abort: () => {
          stopping = true;
          try {
            rec.abort();
          } catch (e) {
            // Already gone.
          }
        }
      };

      try {
        rec.start();
      } catch (error) {
        reject(error);
      }
    });
  }

  async function stopQuick() {
    const current = quick;
    quick = null;
    return current ? current.stop() : '';
  }

  // ---------------------------------------------------------------
  // History
  // ---------------------------------------------------------------
  async function renderHistory() {
    const section = $('history');
    const list = $('history-list');
    const { historyEnabled } = await chrome.storage.sync.get({ historyEnabled: false });
    if (!historyEnabled) {
      section.style.display = 'none';
      return;
    }
    const history = await window.TalkTypeStorage.getTranscriptHistory();
    if (!history.length) {
      section.style.display = 'none';
      return;
    }
    list.textContent = '';
    history.slice(0, 5).forEach((entry) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'history-item';
      item.title = 'Click to copy';
      if (entry.host && entry.host !== 'popup') {
        const host = document.createElement('span');
        host.className = 'host';
        host.textContent = entry.host;
        item.appendChild(host);
      }
      item.appendChild(document.createTextNode(entry.text));
      item.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(entry.text);
          toast('Copied');
        } catch (e) {
          toast('Could not copy');
        }
      });
      list.appendChild(item);
    });
    section.style.display = 'block';
  }

  // ---------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    const prefs = await chrome.storage.sync.get({ smartModeEnabled: true });
    smartModeEnabled = prefs.smartModeEnabled !== false;

    refreshSetup();
    refreshPageTarget();
    renderHistory();

    $('record').addEventListener('click', () => (isRecording ? stopRecording() : startRecording()));
    $('copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(lastTranscript);
        toast('Copied');
      } catch (e) {
        toast('Could not copy');
      }
    });
    $('insert').addEventListener('click', async () => {
      const response = await chrome.runtime
        .sendMessage({ action: 'sendToActiveTab', payload: { action: 'insertTranscription', text: lastTranscript } })
        .catch(() => null);
      if (response?.success) {
        toast('Inserted');
        $('insert').style.display = 'none';
      } else {
        toast('Click a text box on the page first');
      }
    });
    $('clear-history').addEventListener('click', async () => {
      await window.TalkTypeStorage.clearTranscriptHistory();
      renderHistory();
    });
    $('setup-open').addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openOnboarding' }));
    $('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
    $('engine-chip').addEventListener('click', () => chrome.runtime.openOptionsPage());
    $('shortcut-chip').addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openShortcutSettings' }));

    // Space/Enter on the body toggles recording so the popup is keyboard-first
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' && document.activeElement === document.body) {
        e.preventDefault();
        $('record').click();
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'updateSmartModeStatus') {
        pageTarget = { ...(pageTarget || {}), hasActiveInput: Boolean(message.hasActiveInput), inputInfo: message.inputInfo || null };
        renderTarget();
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes.transcriptionEngine || changes.smartModeEnabled) {
        if (changes.smartModeEnabled) smartModeEnabled = changes.smartModeEnabled.newValue !== false;
        refreshSetup();
      }
      if (changes.historyEnabled) renderHistory();
    });
  });

  // The popup's JS context dies the instant it closes — release the mic
  // instead of abandoning a live stream.
  window.addEventListener('pagehide', () => {
    audioService.stopStreamTracks();
    if (quick) quick.abort();
  });
})();
