// API Service for audio transcription via Gemini

// Transcription style prompts - ported from TalkType webapp
const TRANSCRIPTION_PROMPTS = {
  standard:
    'Transcribe this audio into clean, well-punctuated text. Remove filler words (um, uh, like, you know). If a phrase repeats 3+ times, transcribe it only once. Use proper capitalization and punctuation. Return only the transcription text with no preamble or commentary.',
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

// Generation config per style type
// Standard = deterministic (temp 0), creative styles = some randomness
const STYLE_CONFIGS = {
  standard:      { temperature: 0, topP: 1.0, topK: 1, maxOutputTokens: 4096 },
  surlyPirate:   { temperature: 0.7, topP: 0.9, topK: 40, maxOutputTokens: 4096 },
  leetSpeak:     { temperature: 0.3, topP: 0.9, topK: 20, maxOutputTokens: 4096 },
  sparklePop:    { temperature: 0.8, topP: 0.9, topK: 40, maxOutputTokens: 4096 },
  codeWhisperer: { temperature: 0.1, topP: 0.95, topK: 10, maxOutputTokens: 4096 },
  quillAndInk:   { temperature: 0.7, topP: 0.9, topK: 40, maxOutputTokens: 4096 },
};

class GeminiApiService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.style = 'standard';
    this.generateEndpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  }

  setStyle(style) {
    this.style = TRANSCRIPTION_PROMPTS[style] ? style : 'standard';
  }

  getPrompt() {
    return TRANSCRIPTION_PROMPTS[this.style] || TRANSCRIPTION_PROMPTS.standard;
  }

  getGenerationConfig() {
    return STYLE_CONFIGS[this.style] || STYLE_CONFIGS.standard;
  }

  /**
   * Transcribe audio using inline base64 (single request, no upload step)
   */
  async transcribeAudio(audioBlob, progressCallback = null) {
    try {
      if (progressCallback) progressCallback('preparing', 10);

      // Convert blob to raw base64 (strip the data URL prefix)
      const base64Data = await this._blobToBase64Raw(audioBlob);
      const mimeType = audioBlob.type || "audio/webm";

      if (progressCallback) progressCallback('sending', 30);

      // Single request with inline audio data
      const response = await fetch(
        `${this.generateEndpoint}?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: this.getPrompt() },
                { inline_data: { mime_type: mimeType, data: base64Data } },
              ],
            }],
            generationConfig: this.getGenerationConfig(),
          }),
        }
      );

      if (progressCallback) progressCallback('processing', 70);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.error?.message || `Status ${response.status}`;
        throw new Error(`Transcription failed: ${msg}`);
      }

      const data = await response.json();

      if (progressCallback) progressCallback('complete', 100);

      // Extract transcription text from response
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("No transcription returned. The audio may be too short or unclear.");
      }

      return text;
    } catch (error) {
      console.error("Transcription error:", error);
      throw error;
    }
  }

  /**
   * Verify that the API key is valid
   */
  async verifyApiKey() {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );
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
        // Strip "data:audio/webm;base64," prefix to get raw base64
        const result = reader.result;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// Export the service and style data
window.GeminiApiService = GeminiApiService;
window.TRANSCRIPTION_PROMPTS = TRANSCRIPTION_PROMPTS;
window.STYLE_LABELS = STYLE_LABELS;
