// Offline transcription engine — runs in an MV3 offscreen document so the
// Whisper model (WASM inference via transformers.js) stays warm across tabs
// and audio never leaves the device.
//
// Config ported from the TalkType webapp's whisperService.js, which already
// defused the landmines: q4 weights (modern ort rejects q8), asyncify wasm
// build (the jspi build Chrome 137+ auto-picks rejects the q4 tiny model),
// wasmPaths as an object (a string base path bypasses the wasm cache),
// numThreads=1 (worker spawning is blocked by extension CSP).

import { pipeline, env } from './vendor/transformers.web.min.js';

// Only models proven against transformers.js 4.x in the TalkType webapp —
// the onnx-community exports; older distil-whisper/* repos hit the q8/ort
// rejection landmine, so don't add them here until the app proves them.
const MODELS = {
  tiny: {
    id: 'onnx-community/whisper-tiny.en',
    dtype: 'q4',
    device: 'wasm' // Mobile-safe, runs anywhere
  },
  small: {
    id: 'onnx-community/distil-small.en',
    dtype: 'q4',
    device: null // Resolved at load: WebGPU when available, else wasm
  }
};

const TARGET_SAMPLE_RATE = 16000;
const HEARTBEAT_INTERVAL_MS = 10000;

let envConfigured = false;
let transcriberPromise = null;
let currentModelKey = null;
let busyCount = 0;
let heartbeatTimer = null;

// The background service worker idles out after ~30s without events. Model
// downloads and long inferences outlive that, so we ping it while busy to
// keep the content-script → background → offscreen response chain alive.
function beginBusy() {
  busyCount += 1;
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      chrome.runtime.sendMessage({ action: 'offlineHeartbeat' }).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);
  }
}

function endBusy() {
  busyCount = Math.max(0, busyCount - 1);
  if (busyCount === 0 && heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function configureEnv() {
  if (envConfigured) return;

  env.allowRemoteModels = true; // Model files come from the HF hub (CORS-enabled), then cache
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  const wasmBackend = env.backends?.onnx?.wasm;
  if (wasmBackend) {
    wasmBackend.wasmPaths = {
      wasm: chrome.runtime.getURL('vendor/ort-wasm-simd-threaded.asyncify.wasm'),
      mjs: chrome.runtime.getURL('vendor/ort-wasm-simd-threaded.asyncify.mjs')
    };
    // If the asyncify override ever fails to import under extension CSP,
    // delete the wasmPaths override above — ort then resolves the vendored
    // jsep pair relative to the transformers bundle in the same directory.
    wasmBackend.numThreads = 1;
  }

  envConfigured = true;
}

function broadcastProgress(update) {
  const payload = {
    action: 'offlineModelProgress',
    status: update?.status || 'progress',
    file: update?.file || '',
    progress: typeof update?.progress === 'number' ? Math.round(update.progress) : null
  };
  chrome.runtime.sendMessage(payload).catch(() => {
    // Nobody listening — fine.
  });
}

async function loadTranscriber() {
  const { offlineModel } = await chrome.storage.sync.get({ offlineModel: 'tiny' });
  const modelKey = MODELS[offlineModel] ? offlineModel : 'tiny';

  // Reuse the warm pipeline unless the user switched models
  if (transcriberPromise && currentModelKey === modelKey) {
    return transcriberPromise;
  }

  configureEnv();
  currentModelKey = modelKey;
  const model = MODELS[modelKey];
  const device = model.device || (navigator.gpu ? 'webgpu' : 'wasm');

  transcriberPromise = pipeline('automatic-speech-recognition', model.id, {
    dtype: model.dtype,
    device,
    progress_callback: broadcastProgress
  }).catch((error) => {
    transcriberPromise = null; // Allow retry after a failed download
    currentModelKey = null;
    throw error;
  });
  return transcriberPromise;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Fast path for the canonical WAV our api-service produces (16kHz mono 16-bit).
// Returns null when the file needs the generic decode path instead.
function tryParseSimpleWav(bytes) {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset) => String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let offset = 12;
  let format = null;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = tag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'fmt ') {
      format = {
        audioFormat: view.getUint16(offset + 8, true),
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        bitsPerSample: view.getUint16(offset + 22, true)
      };
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, bytes.length - dataOffset);
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (
    !format ||
    dataOffset < 0 ||
    format.audioFormat !== 1 ||
    format.channels !== 1 ||
    format.bitsPerSample !== 16 ||
    format.sampleRate !== TARGET_SAMPLE_RATE
  ) {
    return null;
  }

  const sampleCount = Math.floor(dataSize / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = view.getInt16(dataOffset + i * 2, true);
    float32[i] = sample < 0 ? sample / 0x8000 : sample / 0x7fff;
  }
  return float32;
}

// Generic path: decode any container, downmix to mono, resample to 16kHz.
async function decodeGeneric(bytes) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('This audio format cannot be decoded by the offline engine.');
  }

  const audioContext = new AudioContextClass();
  try {
    const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
    const length = Math.max(1, Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    if (audioContext.close) await audioContext.close();
  }
}

async function toFloat32Audio(audioBase64, mimeType) {
  const bytes = base64ToBytes(audioBase64);
  if ((mimeType || '').includes('wav')) {
    const fast = tryParseSimpleWav(bytes);
    if (fast) return fast;
  }
  return decodeGeneric(bytes);
}

async function handleTranscribe({ audioBase64, mimeType }) {
  beginBusy();
  try {
    const audio = await toFloat32Audio(audioBase64, mimeType);
    if (!audio || audio.length < TARGET_SAMPLE_RATE / 10) {
      throw new Error('No audio captured. The recording may be too short.');
    }

    const transcriber = await loadTranscriber();
    const output = await transcriber(audio, {
      chunk_length_s: 30,
      stride_length_s: 5
    });

    const text = (output?.text || '').trim();
    if (!text) {
      throw new Error('No speech detected.');
    }
    return text;
  } finally {
    endBusy();
  }
}

async function handlePrepareModel() {
  beginBusy();
  try {
    await loadTranscriber();
    broadcastProgress({ status: 'ready', progress: 100 });
    return true;
  } finally {
    endBusy();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'offscreenTranscribe') {
    handleTranscribe(message)
      .then((text) => sendResponse({ text }))
      .catch((error) => {
        console.error('TalkType offline: transcription failed', error);
        sendResponse({ error: humanizeOfflineError(error) });
      });
    return true;
  }

  if (message.action === 'offscreenPrepareModel') {
    handlePrepareModel()
      .then(() => sendResponse({ ready: true }))
      .catch((error) => {
        console.error('TalkType offline: model load failed', error);
        sendResponse({ error: humanizeOfflineError(error) });
      });
    return true;
  }
});

function humanizeOfflineError(error) {
  const message = error?.message || 'Offline transcription failed.';
  const lower = message.toLowerCase();

  if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to load')) {
    return 'Could not download the offline model. Check your connection and try again — after the first download it works fully offline.';
  }
  return message;
}
