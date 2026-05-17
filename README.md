# TalkType

Voice-to-text for any text input on the web. Click, speak, done.

TalkType is a Chrome extension that drops a mic button next to every text field it finds -- Gmail, Slack, Discord, Facebook, whatever. Hit record, say your thing, and it lands right where your cursor is. No overwriting, no fuss.

![TalkType Logo](src/icons/icon_white/android-icon-192x192.png)

## What it does

- Adds a mic button to any text input on any website (including contenteditable fields)
- Records audio and transcribes through Gemini 3 Flash, with Gemini 3.1 Flash-Lite fallbacks
- Inserts text at cursor position without overwriting what's already there
- Auto-copies transcription to clipboard
- Glass morphism UI that adapts to light and dark mode
- Six transcription styles with personality (see below)
- Single inline API request -- no upload pipeline, no middleware
- Uses your own Gemini API key (free tier available)
- No app-side accounts, analytics, or server middleware. Your mic, your key, your words.

## Transcription Styles

Pick a voice. Each style has its own generation config tuned for the job.

| Style | What you get |
|---|---|
| **Clean & Accurate** | Straight transcription. Filler words removed only when they are clearly non-semantic. |
| **Surly Pirate** | Your words, but angrier and saltier. Arr. |
| **L33t Sp34k** | Num3r1c sub5t1tut10n5 and h4ck3r j4rg0n. |
| **Sparkle Pop** | SUPER bubbly!!! Emojis everywhere!!! Literally obsessed!!! |
| **Code Whisperer** | Restructures your rambling into clean, technical language ready for a coding prompt. |
| **Quill & Ink** | Victorian prose. Dickens-grade flourishes. For when email deserves eloquence. |

## Installation

1. Download the extension zip from [talktype.app/downloads/talktype-extension.zip](https://talktype.app/downloads/talktype-extension.zip) or clone this repo
2. Open `chrome://extensions/` in Chrome
3. Toggle **Developer mode** (top-right)
4. Click **Load unpacked**
5. If you downloaded the zip, select the unzipped `talktype-extension` folder. If you cloned the repo, select the `src` folder.
6. TalkType appears in your toolbar

## Setup

1. Grab a free Gemini API key from [Google AI Studio](https://aistudio.google.com)
2. Click the TalkType icon in your toolbar
3. Go to Settings and paste your key
4. That's it. Go talk to a text field.

## Usage

1. Click into any text input on any page
2. Hit the mic button that appears
3. Speak
4. Text lands at your cursor and copies to clipboard

Works with standard inputs, textareas, and contenteditable elements (Gmail compose, Notion, etc).

## Project Structure

```
src/
  manifest.json        Extension config (Manifest V3)
  content.js           Injects mic buttons, handles text insertion
  background.js        Service worker
  api-service.js       Gemini API calls + style configs
  audio-service.js     Audio recording
  permission-dialog.js Mic permission handling
  popup.html/js        Toolbar popup UI
  options.html/js      Settings page
  styles.css           Glass morphism styles
  icons/               Light and dark icon sets
```

No build step. No bundler. Vanilla JS all the way through.

## Privacy

- Mic activates only when you click record
- Audio goes to Gemini API for transcription, nowhere else
- We do not run an app server or store transcripts ourselves
- Your API key is stored in Chrome's local extension storage on this device
- Non-secret preferences are stored with Chrome's `storage.sync`
- Transcriptions are inserted into the page and copied to your clipboard, but this extension does not keep a local transcript history
- No analytics, no telemetry, no user accounts

## Tech

- Chrome Manifest V3
- Gemini 3 Flash primary model with Gemini 3.1 Flash-Lite fallbacks
- Browser-recorded audio is converted to WAV when needed before the single inline base64 request
- Vanilla JavaScript, no dependencies
- Style-specific prompts, with Gemini 3 kept on its recommended default temperature

## Current Scope

- This extension currently uses a Gemini-only transcription flow
- It does not yet share the newer Deepgram/live transcription architecture used in the main TalkType app
- No automated test suite is bundled in this repo; validation is currently manual in Chrome

## Version

1.5

## License

[MIT](LICENSE)

---

Made by [Pablo](https://github.com/pibulus). Talk easy.
