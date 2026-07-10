// Gemini transcription backend — runs ONLY in the background service worker.
// The user's API key is read here and the request fires from here, so the key
// never enters a page's content-script world. Pages talk to this through the
// 'transcribeAudio' message in background.js.

// Pin the current Flash model instead of using a hot-swapped "latest" alias.
const GEMINI_TRANSCRIPTION_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview'
];

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

// Generation config per style type.
// Gemini 3 models keep their recommended default temperature.
const STYLE_CONFIGS = {
  standard: { temperature: 0, topP: 1.0, topK: 1, maxOutputTokens: 8192 },
  surlyPirate: { temperature: 0.7, topP: 0.9, topK: 40, maxOutputTokens: 8192 },
  leetSpeak: { temperature: 0.3, topP: 0.9, topK: 20, maxOutputTokens: 8192 },
  sparklePop: { temperature: 0.8, topP: 0.9, topK: 40, maxOutputTokens: 8192 },
  codeWhisperer: { temperature: 0.1, topP: 0.95, topK: 10, maxOutputTokens: 8192 },
  quillAndInk: { temperature: 0.7, topP: 0.9, topK: 40, maxOutputTokens: 8192 },
};

function getGenerationConfig(style, modelId) {
  const styleConfig = STYLE_CONFIGS[style] || STYLE_CONFIGS.standard;

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

function shouldTryFallback(error) {
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

function humanizeApiError(status, message) {
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

// The prompt asks for bare text, but models occasionally wrap output in
// markdown fences anyway — strip them so backticks never land in a text field.
function cleanTranscriptionText(text) {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/^```[a-z]*\s*\n([\s\S]*?)\n?\s*```$/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  return cleaned;
}

async function transcribeWithModel(modelId, apiKey, audioBase64, mimeType, style) {
  const prompt = TRANSCRIPTION_PROMPTS[style] || TRANSCRIPTION_PROMPTS.standard;

  const response = await fetch(getGenerateEndpoint(modelId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: audioBase64 } },
          ],
        }
      ],
      generationConfig: getGenerationConfig(style, modelId),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `Status ${response.status}`;
    const error = new Error(humanizeApiError(response.status, message));
    error.status = response.status;
    error.rawMessage = message;
    error.modelId = modelId;
    throw error;
  }

  const data = await response.json();

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No transcription returned. The audio may be too short or unclear.');
  }

  if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    console.warn('TalkType: Gemini hit maxOutputTokens — transcript may be cut off.');
  }

  return cleanTranscriptionText(text);
}

async function transcribe({ audioBase64, mimeType, style = 'standard' }) {
  const apiKey = await globalThis.TalkTypeStorage.getApiKey();
  if (!apiKey) {
    throw new Error('Missing Gemini API key. Add it in the extension options first.');
  }

  if (!audioBase64 || typeof audioBase64 !== 'string') {
    throw new Error('No audio received for transcription.');
  }

  let lastError = null;
  for (const [index, modelId] of GEMINI_TRANSCRIPTION_MODELS.entries()) {
    try {
      return await transcribeWithModel(modelId, apiKey, audioBase64, mimeType, style);
    } catch (error) {
      lastError = error;
      if (index === GEMINI_TRANSCRIPTION_MODELS.length - 1 || !shouldTryFallback(error)) {
        throw error;
      }
      console.warn(`Gemini model ${modelId} failed; trying fallback model.`, error);
    }
  }

  throw lastError || new Error('Transcription failed.');
}

globalThis.TalkTypeGemini = { transcribe };
