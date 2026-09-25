# TalkType

Talk into any text box on the web. Click the ghost, say your thing, done.

TalkType is a Chrome extension that drops a mic button next to every text field it finds — Gmail, Slack, Notion, Discord, Reddit, ChatGPT, whatever. Hit record, speak, and the words land right where your cursor is. No overwriting, no account, no server in the middle.

<img src="src/icons/ghost/ghost-128.png" width="96" alt="TalkType ghost">

## Three engines, your call

| Engine | What happens | What it costs you |
|---|---|---|
| ☁️ **Cloud** | Gemini transcribes after you stop. Six personality styles. | A free Gemini API key |
| ⚡ **Live** | Deepgram streams words into the field while you talk. | A Deepgram key (signup comes with ~$200 credit, roughly 400 hours) |
| 🔒 **Private** | Whisper runs inside Chrome. Audio never leaves your machine. | Nothing. One ~96MB model download, then fully offline. |

Keys live only in Chrome's local storage on your device and are sent only to the provider they belong to. TalkType has no backend.

## What it does

- Adds a mic button to inputs, textareas and rich editors (Gmail compose, Notion, ProseMirror, Quill, Draft, Lexical, Slate…)
- Inserts at the cursor without clobbering what's there; auto-copies to clipboard as backup
- **Keyboard:** Alt+Shift+D starts/stops dictation in the focused field, Esc discards. The extension shows you the *actual* binding Chrome applied and warns if another extension took it
- Works on tabs that were open before you installed it (the shortcut and popup inject the script on demand)
- **Your words:** names, brands and slang the models keep mangling — Gemini gets them in the prompt, Deepgram nova-3 as keyterms
- **BYO style:** your own post-transcription instructions (translate it, make it a haiku, bullet points only)
- Little sound chirps on start/stop/success (optional)
- Optional on-device history of your last 20 transcripts
- Welcome tour on install with a try-it-here box that uses the real mic button

## Transcription styles (Cloud engine)

| Style | What you get |
|---|---|
| **Clean & Accurate** | Straight transcription. Filler words removed only when clearly non-semantic. |
| **Surly Pirate** | Your words, but angrier and saltier. Arr. |
| **L33t Sp34k** | Num3r1c sub5t1tut10n5 and h4ck3r j4rg0n. |
| **Sparkle Pop** | SUPER bubbly!!! Emojis everywhere!!! Literally obsessed!!! |
| **Code Whisperer** | Restructures rambling into clean technical language for a coding prompt. |
| **Quill & Ink** | Victorian prose. Dickens-grade flourishes. |
| **BYO** | Whatever you tell it. |

## Install

**From the Chrome Web Store:** coming soon — see [talktype.app](https://talktype.app).

**From source:**

1. Clone this repo (or grab the zip from [talktype.app/downloads/talktype-extension.zip](https://talktype.app/downloads/talktype-extension.zip))
2. Open `chrome://extensions/`, toggle **Developer mode**
3. **Load unpacked** → select the `src` folder
4. The welcome tour opens. Pick an engine, paste a key (or choose Private), say hello in the try-it box.

## Project structure

```
src/
  manifest.json        Extension config (Manifest V3)
  background.js        Service worker: engine router, keyboard command, on-demand script injection
  gemini-service.js    Gemini backend (background-only — holds the API key)
  deepgram-live.js     Deepgram live WebSocket bridge + prerecorded fallback (background-only)
  offscreen.html/js    Offline Whisper engine (transformers.js in an offscreen doc)
  vendor/              Vendored transformers.js + ONNX runtime WASM (no build step)
  content.js           Mic buttons, text insertion, in-page toasts
  api-service.js       Page-side client: audio prep + message to background
  live-service.js      Page-side live session: mic chunks over a Port
  audio-service.js     Audio recording
  sound-service.js     WebAudio chirps
  storage-service.js   Keys, prefs, transcript history
  popup.html/js        Toolbar popup
  options.html/js      Settings (everything autosaves)
  onboarding.html/js   Welcome tour, opened on install
  setup-shared.js      Engine picker / key fields / shortcut / mic test shared by options + onboarding
  brand.css            Shared look for extension pages
  permission-fix.html/js  Mic permission window
  styles.css           Injected styles for the mic button
  icons/ghost/         Toolbar + store icons
scripts/package.sh     Zip src/ for the Web Store
store/                 Promo tile + screenshots
PRIVACY.md             Privacy policy text for talktype.app/extension/privacy
CHROME_WEB_STORE.md    Listing copy, permission justifications, submission checklist
```

No build step. No bundler. Vanilla JS all the way through.

## Privacy

- Mic is on only while you're recording
- Cloud → audio goes to Google with your key. Live → to Deepgram with your key. Private → nowhere
- Keys in `chrome.storage.local`, never synced, never sent to TalkType
- Non-secret preferences in `chrome.storage.sync`
- History is off by default; if on, the last 20 transcripts stay on this device and clear from the popup
- No analytics, no telemetry, no accounts. Full policy in [PRIVACY.md](PRIVACY.md)

## Development

- Load `src` unpacked and iterate; there's no build
- `./scripts/package.sh` produces `dist/talktype-extension-<version>.zip`
- No automated test suite yet; validation is manual in Chrome (the smoke path: install → onboarding → key → try-it box → a real site → Alt+Shift+D → popup insert)

## License

[MIT](LICENSE)

---

Made by [Pablo](https://github.com/pibulus). Talk easy.
