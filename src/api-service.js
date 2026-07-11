// Page-side transcription client.
// Prepares audio (decode → 16kHz mono WAV → base64) in the page context —
// AudioContext doesn't exist in service workers — then hands it to the
// background worker, which holds the API key and makes the Gemini request.
// The key never enters this file's world.

const GEMINI_SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac'
]);

class GeminiApiService {
  // The apiKey argument is accepted for backward compatibility but unused —
  // the background worker reads the key from storage itself.
  constructor(apiKey) {
    this.style = 'standard';
  }

  setStyle(style) {
    this.style = typeof style === 'string' && style ? style : 'standard';
  }

  async transcribeAudio(audioBlob, progressCallback = null) {
    try {
      if (progressCallback) progressCallback('preparing', 10);

      const preparedAudio = await this._prepareAudioForGemini(audioBlob);
      const base64Data = await this._blobToBase64Raw(preparedAudio.blob);

      // Gemini's inline request cap is ~20MB; refuse before burning a request
      if (base64Data.length > 19 * 1024 * 1024) {
        throw new Error('Recording too large to send in one request. Try a shorter take.');
      }

      if (progressCallback) progressCallback('sending', 30);

      const response = await chrome.runtime.sendMessage({
        action: 'transcribeAudio',
        audioBase64: base64Data,
        mimeType: preparedAudio.mimeType,
        style: this.style
      });

      if (progressCallback) progressCallback('processing', 70);

      if (!response) {
        throw new Error('TalkType could not reach its background worker. Try reloading the extension.');
      }
      if (response.error) {
        throw new Error(response.error);
      }

      if (progressCallback) progressCallback('complete', 100);
      return response.text;
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }

  /**
   * Convert Blob to raw base64 string (no data URL prefix)
   */
  _blobToBase64Raw(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Strip "data:<mime>;base64," prefix to get raw base64.
        const result = reader.result;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  _normalizeAudioMimeType(mimeType = '') {
    const [baseType] = mimeType.toLowerCase().split(';');
    return baseType || 'audio/wav';
  }

  async _prepareAudioForGemini(audioBlob) {
    const mimeType = this._normalizeAudioMimeType(audioBlob.type);
    if (GEMINI_SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)) {
      return { blob: audioBlob, mimeType };
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('This browser cannot convert the recorded audio into a Gemini-supported format.');
    }

    const audioContext = new AudioContextClass();
    try {
      const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
      const speechBuffer = await this._downsampleForSpeech(audioBuffer);
      return {
        blob: this._audioBufferToWavBlob(speechBuffer),
        mimeType: 'audio/wav'
      };
    } finally {
      if (audioContext.close) await audioContext.close();
    }
  }

  // Resample to 16kHz mono before WAV-encoding. Speech models don't benefit
  // from more, and 48kHz stereo WAV blows past Gemini's ~20MB inline request
  // limit after ~2.5 minutes; 16kHz mono stays under it past 10 minutes.
  async _downsampleForSpeech(audioBuffer) {
    const targetRate = 16000;
    if (audioBuffer.numberOfChannels === 1 && audioBuffer.sampleRate <= targetRate) {
      return audioBuffer;
    }

    const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContextClass) return audioBuffer;

    const length = Math.max(1, Math.ceil(audioBuffer.duration * targetRate));
    const offlineContext = new OfflineContextClass(1, length, targetRate);
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);
    return offlineContext.startRendering();
  }

  _audioBufferToWavBlob(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = audioBuffer.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    this._writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this._writeAscii(view, 8, 'WAVE');
    this._writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    this._writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const channelData = Array.from({ length: numChannels }, (_, channel) =>
      audioBuffer.getChannelData(channel)
    );
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i += 1) {
      for (let channel = 0; channel < numChannels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += bytesPerSample;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  _writeAscii(view, offset, text) {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }
}

// Export the service
window.GeminiApiService = GeminiApiService;
