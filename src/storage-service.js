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

  globalThis.TalkTypeStorage = {
    getApiKey,
    setApiKey,
    getWithApiKey,
    migrateApiKeyToLocal: getApiKey
  };
})();
