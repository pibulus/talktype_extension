// Tiny WebAudio chirps for recording feedback — pure oscillators, no audio
// files. Runs in content scripts and the popup; gated by the soundEffectsEnabled
// setting (toggle lives in options).

(function () {
  let audioContext = null;
  let soundsEnabled = true;

  chrome.storage.sync.get({ soundEffectsEnabled: true }, (result) => {
    soundsEnabled = result.soundEffectsEnabled !== false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.soundEffectsEnabled) {
      soundsEnabled = changes.soundEffectsEnabled.newValue !== false;
    }
  });

  function getContext() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  function tone(ctx, { freq, start, duration, type = 'sine', peak = 0.07 }) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime + start;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  const CHIRPS = {
    // C5 → G5 rising: "I'm listening"
    start: (ctx) => {
      tone(ctx, { freq: 523.25, start: 0, duration: 0.09 });
      tone(ctx, { freq: 783.99, start: 0.08, duration: 0.14 });
    },
    // G5 → C5 falling: "got it, working on it"
    stop: (ctx) => {
      tone(ctx, { freq: 783.99, start: 0, duration: 0.09 });
      tone(ctx, { freq: 523.25, start: 0.08, duration: 0.14 });
    },
    // E5 → G5 → C6 sparkle: "your words landed"
    success: (ctx) => {
      tone(ctx, { freq: 659.25, start: 0, duration: 0.08 });
      tone(ctx, { freq: 783.99, start: 0.07, duration: 0.08 });
      tone(ctx, { freq: 1046.5, start: 0.14, duration: 0.18 });
    },
    // Soft low bonk — sympathetic, not alarming
    error: (ctx) => {
      tone(ctx, { freq: 220, start: 0, duration: 0.2, type: 'triangle', peak: 0.05 });
    }
  };

  function play(name) {
    if (!soundsEnabled || !CHIRPS[name]) return;
    try {
      const ctx = getContext();
      if (ctx) CHIRPS[name](ctx);
    } catch (e) {
      // Sound is garnish — never let it break the flow.
    }
  }

  globalThis.TalkTypeSounds = { play };
})();
