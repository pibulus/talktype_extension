// API Service for audio transcription via Gemini

// Pin the current Flash model instead of using a hot-swapped "latest" alias.
const GEMINI_TRANSCRIPTION_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview'
];
const GEMINI_SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac'
]);

function getGenerateEndpoint(modelId) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
}

// Transcription style prompts - ported from TalkType webapp
const TRANSCRIPTION_PROMPTS = {
  standard:
    'Generate a faithful transcript of the speech in this audio. Preserve the speaker meaning, use natural punctuation and capitalization, remove filler words only when they are clearly non-semantic, and do not summarize. Return only the transcription text with no preamble, labels, markdown, or commentary.',
  surlyPirate:
    'Transcribe this audio file accurately, but rewrite it in the style of a surly pirate. Use pirate slang, expressions, and attitude. Arr! Return only the pirate-style transcription, no additional text.',
  leetSpeak:
    'Tr4n5cr1b3 th15 4ud10 f1l3 4ccur4t3ly, but c0nv3rt 1t 1nt0 l33t 5p34k. U53 num3r1c 5ub5t1tut10n5 (3=e, 4=a, 1=i, 0=o, 5=s, 7=t) 4nd h4ck3r j4rg0n wh3n p0551bl3. R3turn 0nly th3 l33t 5p34k tr4n5cr1pt10n, n0 4dd1t10n4l t3xt.',
  sparklePop:
    "OMG!!! Transcribe this audio file like TOTALLY accurately, but make it SUPER bubbly and enthusiastic!!! Use LOTS of emojis, exclamation points, and teen slang!!!! Sprinkle in words like 'literally,' 'totally,' 'sooo,' 'vibes,' and 'obsessed'!!! Add sparkle emojis, hearts, and rainbow emojis throughout!!! Make it EXTRA and over-the-top excited!!!",
  codeWhisperer:
    'Transcribe this audio file accurately and completely, but reformat it into clear, structured, technical language suitable for a coding prompt. Remove redundancies, organize thoughts logically, use precise technical terminology, and structure content with clear sections. Return only the optimized, programmer-friendly transcription.',
  quillAndInk:
    'Transcribe this audio file with the eloquence and stylistic flourishes of a 19th century Victorian novelist, in the vein of Jane Austen or Charles Dickens. Employ elaborate sentences, period-appropriate vocabulary, literary devices, and a generally formal and ornate prose style. The transcription should maintain the original meaning but transform the manner of expression entirely.',
};

// Human-readable style labels
const STYLE_LABELS = {
  standard: 'Clean & Accurate',
  surlyPirate: 'Surly Pirate',
  leetSpeak: 'L33t Sp34k',
  sparklePop: 'Sparkle Pop',
  codeWhisperer: 'Code Whisperer',
  quillAndInk: 'Quill & Ink',
};

// Generation config per style type.
// Gemini 3 models keep their recommended default temperature.
const STYLE_CONFIGS = {
  standard: { temperature: 0, topP: 1.0, topK: 1, maxOutputTokens: 4096 },
  surlyPirate: { temperature: 0.7, topP: 0.9, topK: 40, maxOutputTokens: 4096 },
  leetSpeak: { temperature: 0.3, topP: 0.9, topK: 20, maxOutputTokens: 4096 },
  sparklePop: { temperature: 0.8, topP: 0.9, topK: 40, maxOutputTokens: 4096 },
  codeWhisperer: { temperature: 0.1, topP: 0.95, topK: 10, maxOutputTokens: 4096 },
  quillAndInk: { temperature: 0.7, topP: 0.9, topK: 40, maxOutputTokens: 4096 },
};

class GeminiApiService {
  constructor(apiKey) {
    this.apiKey = apiKey?.trim() || '';
    this.style = 'standard';
    this.modelIds = GEMINI_TRANSCRIPTION_MODELS;
  }

  setStyle(style) {
    this.style = TRANSCRIPTION_PROMPTS[style] ? style : 'standard';
  }

  getPrompt() {
    return TRANSCRIPTION_PROMPTS[this.style] || TRANSCRIPTION_PROMPTS.standard;
  }

  getGenerationConfig(modelId = GEMINI_TRANSCRIPTION_MODELS[0]) {
    const styleConfig = STYLE_CONFIGS[this.style] || STYLE_CONFIGS.standard;

    // Gemini 3 docs recommend keeping temperature at the default 1.0.
    if (modelId.startsWith('gemini-3')) {
      return {
        maxOutputTokens: styleConfig.maxOutputTokens,
        responseMimeType: 'text/plain',
        temperature: 1.0
      };
    }

    return {
      ...styleConfig,
      responseMimeType: 'text/plain'
    };
  }

  /**
   * Transcribe audio using inline base64 (single request, no upload step)
   */
  async transcribeAudio(audioBlob, progressCallback = null) {
    try {
      if (!this.apiKey) {
        throw new Error('Missing Gemini API key. Add it in the extension options first.');
      }

      if (progressCallback) progressCallback('preparing', 10);

      const preparedAudio = await this._prepareAudioForGemini(audioBlob);

      // Convert blob to raw base64 (strip the data URL prefix)
      const base64Data = await this._blobToBase64Raw(preparedAudio.blob);

      let lastError = null;
      for (const [index, modelId] of this.modelIds.entries()) {
        try {
          if (progressCallback) progressCallback('sending', index === 0 ? 30 : 45);
          return await this._transcribeWithModel(
            modelId,
            base64Data,
            preparedAudio.mimeType,
            progressCallback
          );
        } catch (error) {
          lastError = error;
          if (index === this.modelIds.length - 1 || !this._shouldTryFallback(error)) {
            throw error;
          }
          console.warn(`Gemini model ${modelId} failed; trying fallback model.`, error);
        }
      }

      throw lastError || new Error('Transcription failed.');
    } catch (error) {
      console.error("Transcription error:", error);
      throw error;
    }
  }

  async _transcribeWithModel(modelId, base64Data, mimeType, progressCallback = null) {
    // Single request with inline audio data
    const response = await fetch(getGenerateEndpoint(modelId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: this.getPrompt() },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          }
        ],
        generationConfig: this.getGenerationConfig(modelId),
      }),
    });

    if (progressCallback) progressCallback('processing', 70);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error?.message || `Status ${response.status}`;
      const error = new Error(this._humanizeApiError(response.status, message));
      error.status = response.status;
      error.rawMessage = message;
      error.modelId = modelId;
      throw error;
    }

    const data = await response.json();

    if (progressCallback) progressCallback('complete', 100);

    // Extract transcription text from response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("No transcription returned. The audio may be too short or unclear.");
    }

    return text;
  }

  /**
   * Verify that the API key is valid
   */
  async verifyApiKey() {
    try {
      if (!this.apiKey) return false;

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { "x-goog-api-key": this.apiKey }
      });
      return response.ok;
    } catch (error) {
      console.error("API key verification error:", error);
      return false;
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
      return {
        blob: this._audioBufferToWavBlob(audioBuffer),
        mimeType: 'audio/wav'
      };
    } finally {
      if (audioContext.close) await audioContext.close();
    }
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

  _shouldTryFallback(error) {
    const rawMessage = (error.rawMessage || error.message || '').toLowerCase();
    return (
      error.status === 403 ||
      error.status === 404 ||
      error.status === 429 ||
      error.status >= 500 ||
      rawMessage.includes('model') ||
      rawMessage.includes('not found') ||
      rawMessage.includes('not supported') ||
      rawMessage.includes('unavailable')
    );
  }

  _humanizeApiError(status, message) {
    const lower = message.toLowerCase();

    if (status === 400 || lower.includes('api key not valid')) {
      return 'Invalid Gemini API key. Check the key in extension settings.';
    }

    if (status === 403 || lower.includes('permission')) {
      return 'Gemini rejected this request. Check API access and billing for the key.';
    }

    if (status === 429 || lower.includes('quota') || lower.includes('rate limit')) {
      return 'Gemini is rate-limiting this key right now. Try again in a moment.';
    }

    if (status >= 500) {
      return 'Gemini is having a moment. Try again shortly.';
    }

    return `Transcription failed: ${message}`;
  }
}

// Export the service and style data
window.GeminiApiService = GeminiApiService;
window.TRANSCRIPTION_PROMPTS = TRANSCRIPTION_PROMPTS;
window.STYLE_LABELS = STYLE_LABELS;
window.GEMINI_TRANSCRIPTION_MODELS = GEMINI_TRANSCRIPTION_MODELS;
