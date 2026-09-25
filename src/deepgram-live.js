// Deepgram live bridge — runs ONLY in the background service worker.
// Content scripts stream audio chunks over a long-lived Port; the WebSocket
// (and the Deepgram API key) live here, never in a page context.
// Dictation tuning mirrors the TalkType webapp's transcriptionStore.

const DEEPGRAM_LIVE_URL = 'wss://api.deepgram.com/v1/listen';
const KEEPALIVE_INTERVAL_MS = 8000; // Deepgram closes idle sockets after ~10s
const MAX_BUFFERED_AUDIO_CHUNKS = 120; // ~30s of 250ms chunks awaiting socket open

// nova-3 keyterm prompting: the user's own words, spelled their way
function appendKeyterms(params, customVocabulary) {
  globalThis.TalkTypeGemini.parseVocabulary(customVocabulary).forEach((word) => params.append('keyterm', word));
  return params;
}

function buildDeepgramLiveUrl(customVocabulary = '') {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: 'en-US',
    smart_format: 'true',
    interim_results: 'true',
    punctuate: 'true',
    // Dictation tuning (vs conversation defaults): a longer endpointing window
    // keeps natural thinking pauses from finalizing mid-sentence.
    endpointing: '600',
    utterance_end_ms: '1000',
    vad_events: 'true',
    numerals: 'true',
    filler_words: 'false'
  });
  appendKeyterms(params, customVocabulary);

  return `${DEEPGRAM_LIVE_URL}?${params.toString()}`;
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'talktype-live') return;

  let socket = null;
  let keepAliveTimer = null;
  let ended = false; // Set on stop/cancel/disconnect — may arrive while 'start' is still awaiting storage
  const pendingChunks = []; // Audio that arrives before the socket opens

  const post = (message) => {
    try {
      port.postMessage(message);
    } catch (e) {
      // Port already disconnected — nothing to tell.
    }
  };

  const cleanup = () => {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    if (socket) {
      const closingSocket = socket;
      socket = null;
      try {
        closingSocket.close();
      } catch (e) {
        // Already closed.
      }
    }
    pendingChunks.length = 0;
  };

  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'start') {
      const apiKey = await globalThis.TalkTypeStorage.getDeepgramApiKey();
      if (!apiKey) {
        post({
          type: 'error',
          message: 'Missing Deepgram API key. Add it in the extension options first.'
        });
        return;
      }
      const { customVocabulary } = await chrome.storage.sync.get({ customVocabulary: '' });

      // The user stopped, cancelled or closed the tab while we were reading
      // storage — opening a socket now would leak it.
      if (ended) return;

      try {
        socket = new WebSocket(buildDeepgramLiveUrl(customVocabulary), ['token', apiKey]);
      } catch (e) {
        post({ type: 'error', message: 'Could not open the live transcription connection.' });
        return;
      }

      socket.onopen = () => {
        pendingChunks.forEach((chunk) => socket.send(chunk));
        pendingChunks.length = 0;
        keepAliveTimer = setInterval(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, KEEPALIVE_INTERVAL_MS);
        post({ type: 'open' });
      };

      socket.onmessage = (event) => {
        let data = null;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          return;
        }

        if (data.type !== 'Results') return;
        const text = data.channel?.alternatives?.[0]?.transcript || '';
        if (!text) return;

        post({ type: data.is_final ? 'final' : 'interim', text });
      };

      socket.onerror = () => {
        post({
          type: 'error',
          message: 'Live transcription connection failed. Check your Deepgram key and network.'
        });
      };

      socket.onclose = () => {
        cleanup();
        post({ type: 'closed' });
      };
      return;
    }

    if (msg.type === 'audio' && typeof msg.chunk === 'string') {
      const buffer = base64ToArrayBuffer(msg.chunk);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(buffer);
      } else if (pendingChunks.length < MAX_BUFFERED_AUDIO_CHUNKS) {
        // Queue even before the socket object exists (the 'start' handler may
        // still be reading the key from storage) — flushed in socket.onopen.
        // When full, newest chunks are dropped: the first chunk carries the
        // webm header, so it must never be evicted.
        pendingChunks.push(buffer);
      }
      return;
    }

    if (msg.type === 'stop') {
      // Ask Deepgram to flush remaining finals; the server closes the socket
      // when it's done, which triggers our onclose → 'closed' message.
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'CloseStream' }));
      } else {
        ended = true;
        cleanup();
        post({ type: 'closed' });
      }
      return;
    }

    if (msg.type === 'cancel') {
      ended = true;
      cleanup();
    }
  });

  port.onDisconnect.addListener(() => {
    ended = true;
    cleanup();
  });
});

// ===================================================================
// PRERECORDED (batch) — used when the Live engine is selected but the
// request is a whole clip (the popup records in batch mode). Same key, same
// dictation tuning, no second provider to sign up for.
// ===================================================================

const DEEPGRAM_PRERECORDED_URL = 'https://api.deepgram.com/v1/listen';

function base64ToBlob(base64, mimeType) {
  return new Blob([base64ToArrayBuffer(base64)], { type: mimeType || 'audio/wav' });
}

async function transcribePrerecorded({ audioBase64, mimeType }) {
  const apiKey = await globalThis.TalkTypeStorage.getDeepgramApiKey();
  if (!apiKey) {
    throw new Error('Missing Deepgram API key. Add it in the extension options first.');
  }
  if (!audioBase64 || typeof audioBase64 !== 'string') {
    throw new Error('No audio received for transcription.');
  }

  const { customVocabulary } = await chrome.storage.sync.get({ customVocabulary: '' });
  const params = appendKeyterms(
    new URLSearchParams({
      model: 'nova-3',
      language: 'en-US',
      smart_format: 'true',
      punctuate: 'true',
      numerals: 'true',
      filler_words: 'false'
    }),
    customVocabulary
  );

  const response = await fetch(`${DEEPGRAM_PRERECORDED_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': mimeType || 'audio/wav'
    },
    body: base64ToBlob(audioBase64, mimeType)
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Deepgram rejected the API key. Check it in extension settings.');
    }
    if (response.status === 402) {
      throw new Error('Deepgram says this key is out of credit.');
    }
    if (response.status === 429) {
      throw new Error('Deepgram is rate-limiting this key right now. Try again in a moment.');
    }
    const detail = await response.text().catch(() => '');
    throw new Error(`Deepgram transcription failed (${response.status})${detail ? ': ' + detail.slice(0, 120) : ''}`);
  }

  const data = await response.json();
  const text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
  if (!text) {
    throw new Error('No speech detected.');
  }
  return text;
}

globalThis.TalkTypeDeepgram = { transcribePrerecorded };
