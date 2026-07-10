// Deepgram live bridge — runs ONLY in the background service worker.
// Content scripts stream audio chunks over a long-lived Port; the WebSocket
// (and the Deepgram API key) live here, never in a page context.
// Dictation tuning mirrors the TalkType webapp's transcriptionStore.

const DEEPGRAM_LIVE_URL = 'wss://api.deepgram.com/v1/listen';
const KEEPALIVE_INTERVAL_MS = 8000; // Deepgram closes idle sockets after ~10s

function buildDeepgramLiveUrl() {
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

      try {
        socket = new WebSocket(buildDeepgramLiveUrl(), ['token', apiKey]);
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
      } else if (socket) {
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
        cleanup();
        post({ type: 'closed' });
      }
      return;
    }

    if (msg.type === 'cancel') {
      cleanup();
    }
  });

  port.onDisconnect.addListener(cleanup);
});
