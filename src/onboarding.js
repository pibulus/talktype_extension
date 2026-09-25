// Welcome tour — opened once on install, again from Settings on request.

(function () {
  const S = window.TalkTypeSetup;

  async function isEngineReady(engineId) {
    if (engineId === 'offline' || engineId === 'browser') return true;
    const key =
      engineId === 'live'
        ? await window.TalkTypeStorage.getDeepgramApiKey()
        : await window.TalkTypeStorage.getApiKey();
    return Boolean(key);
  }

  async function reflectEngine(engineId) {
    const keyField = document.getElementById('key-field');
    const offline = document.getElementById('offline-model');
    const title = document.getElementById('step-key-title');
    const tryStep = document.getElementById('step-try');

    S.mountKeyField(keyField, engineId);

    if (engineId === 'browser') {
      title.textContent = 'Nothing to plug in';
      offline.style.display = 'none';
    } else if (engineId === 'offline') {
      title.textContent = 'Nothing to plug in';
      offline.style.display = 'block';
      if (!offline.dataset.mounted) {
        S.mountOfflineModel(offline);
        offline.dataset.mounted = 'true';
      }
    } else {
      title.textContent = engineId === 'live' ? 'Plug in your Deepgram key' : 'Plug in your Gemini key';
      offline.style.display = 'none';
    }

    tryStep.classList.toggle('locked', !(await isEngineReady(engineId)));
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const picker = await S.mountEnginePicker(document.getElementById('engine-picker'), { onChange: reflectEngine });

    // Unlock the try-it box the moment a key lands
    document.getElementById('key-field').addEventListener('talktype-key-changed', (e) => {
      document.getElementById('step-try').classList.toggle('locked', !e.detail.hasKey);
    });

    S.mountShortcut(document.getElementById('shortcut'));

    document.getElementById('open-settings').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Focus the demo box once things are ready so the mic button is obvious
    if (await isEngineReady(picker.current)) {
      setTimeout(() => document.getElementById('try-area').focus({ preventScroll: true }), 300);
    }
  });
})();
