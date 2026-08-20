// Live transcription session (content-script side).
// Captures mic audio with MediaRecorder and streams ~250ms chunks over a Port
// to the background worker, which holds the Deepgram WebSocket and API key.
// Interim/final transcripts flow back through the same port.

(function () {
  const CHUNK_MS = 250;
  const STOP_GRACE_MS = 2500; // How long to wait for Deepgram's final flush after stop

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  class TalkTypeLiveSession {
    constructor({ onInterim, onFinal, onError } = {}) {
      this.onInterim = onInterim || (() => {});
      this.onFinal = onFinal || (() => {});
      this.onError = onError || (() => {});
      this.port = null;
      this.stream = null;
      this.recorder = null;
      this.active = false;
      this.starting = false;
      this.cancelled = false; // Set by cancel()/stop() arriving mid-start
      this._closedResolve = null;
      this._errored = false;
    }

    // Resolves true when live capture is running, false if the session was
    // cancelled while waiting for the mic permission prompt.
    async start() {
      this.starting = true;
      try {
        return await this._startInner();
      } finally {
        this.starting = false;
      }
    }

    async _startInner() {
      this.port = chrome.runtime.connect({ name: 'talktype-live' });

      this.port.onMessage.addListener((msg) => {
        if (msg.type === 'interim') this.onInterim(msg.text);
        else if (msg.type === 'final') this.onFinal(msg.text);
        else if (msg.type === 'error') {
          this._errored = true;
          this.onError(msg.message);
        } else if (msg.type === 'closed' && this._closedResolve) {
          this._closedResolve();
        }
      });

      this.port.onDisconnect.addListener(() => {
        if (this._closedResolve) this._closedResolve();
      });

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // The user may have hit Esc / stop while the permission prompt was open —
      // without this check the session would keep a hot mic nobody can stop.
      if (this.cancelled) {
        this._teardown();
        return false;
      }

      const preferredMimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find((type) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type));
      this.recorder = preferredMimeType
        ? new MediaRecorder(this.stream, { mimeType: preferredMimeType })
        : new MediaRecorder(this.stream);

      this.recorder.addEventListener('dataavailable', async (event) => {
        if (!event.data || !event.data.size || !this.port) return;
        try {
          const chunk = await blobToBase64(event.data);
          this.port.postMessage({ type: 'audio', chunk });
        } catch (e) {
          // Dropped chunk — live mode degrades gracefully, next chunk carries on.
        }
      });

      this.port.postMessage({ type: 'start' });
      this.recorder.start(CHUNK_MS);
      this.active = true;
      return true;
    }

    // Stop recording, wait (bounded) for Deepgram to flush remaining finals,
    // then tear everything down. Finals arriving during the grace window still
    // fire onFinal.
    async stop() {
      if (this.starting) {
        // Still waiting on the mic prompt — flag it; start() will tear down.
        this.cancelled = true;
        return;
      }
      if (!this.active) return;
      this.active = false;

      await this._stopRecorder();

      const closed = new Promise((resolve) => {
        this._closedResolve = resolve;
      });
      this.port?.postMessage({ type: 'stop' });

      await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, STOP_GRACE_MS))]);
      this._teardown();
    }

    // Discard: no flush, no waiting, nothing more inserted.
    cancel() {
      if (this.starting) {
        // Still waiting on the mic prompt — flag it; start() will tear down.
        this.cancelled = true;
        return;
      }
      if (!this.active) return;
      this.active = false;
      this.onFinal = () => {};
      this.onInterim = () => {};
      try {
        if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
      } catch (e) {
        // Already stopped.
      }
      this.port?.postMessage({ type: 'cancel' });
      this._teardown();
    }

    _stopRecorder() {
      return new Promise((resolve) => {
        if (!this.recorder || this.recorder.state === 'inactive') {
          resolve();
          return;
        }
        // The last dataavailable fires before stop; give its async base64
        // encode a beat to post before we ask Deepgram to flush.
        this.recorder.addEventListener('stop', () => setTimeout(resolve, 150), { once: true });
        try {
          this.recorder.stop();
        } catch (e) {
          resolve();
        }
      });
    }

    _teardown() {
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      this.recorder = null;
      if (this.port) {
        try {
          this.port.disconnect();
        } catch (e) {
          // Already gone.
        }
        this.port = null;
      }
      this._closedResolve = null;
    }
  }

  window.TalkTypeLiveSession = TalkTypeLiveSession;
})();
