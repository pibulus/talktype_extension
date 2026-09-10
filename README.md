# TalkType Browser Extension

Voice-to-text for any text field, in the TalkType house style — a peach ghost, warm cream
paper, and ink, never `#fff` or `#000`.

![TalkType Ghost](src/icons/icon_white/android-icon-192x192.png)

## Features

- **Three engines, one ghost** — Gemini (cloud batch), Deepgram (live streaming), and a
  fully offline Whisper model that runs on-device via WebAssembly/WebGPU.
- **Dictate into anything** — Gmail, Slack, Discord, docs, any `contenteditable` or input.
- **Typing simulator** — text lands in the field like you typed it, not just on the clipboard.
- **Right-click to transcribe** — context menu on any editable field.
- **Global shortcut** — `Alt+Shift+D` toggles dictation in the focused field (configurable).
- **Privacy-first** — bring your own keys; nothing is stored or sent except to the engine
  you pick, and offline mode never leaves the device.

## Install (from source)

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `src/` folder

## Usage

1. Click the extension icon → **Settings**, enter your Gemini and/or Deepgram API key
   (get a Gemini key at [Google AI Studio](https://aistudio.google.com/)).
2. Right-click any text field → **"Transcribe with TalkType"**, or press `Alt+Shift+D`.
3. Speak; the text is inserted where you were typing.

## Engines

| Engine | Needs | Notes |
|---|---|---|
| Gemini | Your Gemini key | Cloud batch transcription, style presets |
| Deepgram | Your Deepgram key | Live streaming, realtime text |
| Offline Whisper | Nothing | On-device; first run downloads the model, then works offline |

## Design

One palette, three surfaces — the extension, [talktype.app](https://talktype.app), and the
TalkType Mac app share a single system: cream `#fff6e6`, warm ink `#1e1714`, and the
pink `#ff82ca` → tangerine `#ffb060` brand duo. Dark mode inverts to warm near-black — never
cold blue-black. The ghost is a gradient-filled body with ink linework and eyes.

## Privacy

- Microphone activates only when you start recording.
- Audio is sent only to the engine you selected, using a key you control.
- No audio or transcripts are stored.
- Offline mode runs entirely on your device.

## License

Proprietary — see [LICENSE.md](LICENSE.md).

## The TalkType family

The extension is the free gateway to the rest of TalkType — and it comes free with
either of the paid apps:

- **[talktype.app](https://talktype.app)** — the full voice-to-text web app: offline
  Whisper, cloud engines, style presets, history.
- **TalkType for Mac** — native menu-bar dictation on the Mac App Store.

Buy one, and the extension is your free companion everywhere you type.

## About

Created by Pablo Alvarado, made with ❤️ in Melbourne (2025–2026).
