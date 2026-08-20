// Shared storage helpers for extension settings.

(function () {
  const API_KEY = 'apiKey';

  function normalizeApiKey(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  async function getApiKey() {
    const localResult = await chrome.storage.local.get([API_KEY]);
    const localKey = normalizeApiKey(localResult[API_KEY]);
    if (localKey) return localKey;

    const legacyResult = await chrome.storage.sync.get([API_KEY]);
    const legacyKey = normalizeApiKey(legacyResult[API_KEY]);
    if (!legacyKey) return '';

    await chrome.storage.local.set({ [API_KEY]: legacyKey });
    await chrome.storage.sync.remove([API_KEY]);
    return legacyKey;
  }

  async function setApiKey(apiKey) {
    const normalizedApiKey = normalizeApiKey(apiKey);

    if (normalizedApiKey) {
      await chrome.storage.local.set({ [API_KEY]: normalizedApiKey });
    } else {
      await chrome.storage.local.remove([API_KEY]);
    }

    await chrome.storage.sync.remove([API_KEY]);
    return normalizedApiKey;
  }

  async function getWithApiKey(keysOrDefaults) {
    const isArrayRequest = Array.isArray(keysOrDefaults);
    const entries = isArrayRequest ? keysOrDefaults : Object.keys(keysOrDefaults || {});
    const wantsApiKey = entries.includes(API_KEY);

    let syncRequest = keysOrDefaults;
    if (wantsApiKey) {
      syncRequest = isArrayRequest
        ? keysOrDefaults.filter((key) => key !== API_KEY)
        : Object.fromEntries(Object.entries(keysOrDefaults).filter(([key]) => key !== API_KEY));
    }

    const result =
      (isArrayRequest && syncRequest.length === 0) ||
      (!isArrayRequest && Object.keys(syncRequest || {}).length === 0)
        ? {}
        : await chrome.storage.sync.get(syncRequest);

    if (wantsApiKey) {
      result[API_KEY] = await getApiKey();
    }

    return result;
  }

  // ===================================================================
  // DEEPGRAM KEY - BYOK for live mode, device-local like the Gemini key
  // ===================================================================

  const DEEPGRAM_KEY = 'deepgramApiKey';

  async function getDeepgramApiKey() {
    const result = await chrome.storage.local.get([DEEPGRAM_KEY]);
    return normalizeApiKey(result[DEEPGRAM_KEY]);
  }

  async function setDeepgramApiKey(apiKey) {
    const normalized = normalizeApiKey(apiKey);
    if (normalized) {
      await chrome.storage.local.set({ [DEEPGRAM_KEY]: normalized });
    } else {
      await chrome.storage.local.remove([DEEPGRAM_KEY]);
    }
    return normalized;
  }

  // ===================================================================
  // TRANSCRIPT HISTORY - opt-in, capped, device-local (storage.local)
  // ===================================================================

  const HISTORY_KEY = 'transcriptHistory';
  const HISTORY_LIMIT = 20;

  async function appendTranscriptToHistory(entry) {
    const settings = await chrome.storage.sync.get({ historyEnabled: false });
    if (!settings.historyEnabled) return;

    const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
    if (!text) return;

    const result = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
    const history = Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
    history.unshift({
      text,
      host: entry.host || '',
      style: entry.style || 'standard',
      at: Date.now()
    });
    await chrome.storage.local.set({ [HISTORY_KEY]: history.slice(0, HISTORY_LIMIT) });
  }

  async function getTranscriptHistory() {
    const result = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
    return Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
  }

  async function clearTranscriptHistory() {
    await chrome.storage.local.remove([HISTORY_KEY]);
  }

  globalThis.TalkTypeStorage = {
    getApiKey,
    setApiKey,
    getWithApiKey,
    migrateApiKeyToLocal: getApiKey,
    getDeepgramApiKey,
    setDeepgramApiKey,
    appendTranscriptToHistory,
    getTranscriptHistory,
    clearTranscriptHistory
  };
})();
