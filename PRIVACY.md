# TalkType Chrome Extension — Privacy Policy

_Last updated: September 2026. This is the text published at https://talktype.app/extension/privacy and referenced from the Chrome Web Store listing._

TalkType turns your voice into text inside any text box on the web. It has no accounts, no analytics, no telemetry, and no TalkType server in the middle. This page explains exactly what leaves your computer, when, and where it goes.

## The short version

- Your microphone is only on while you are recording. You start it, you stop it.
- Where the audio goes depends on the engine **you** choose:
  - **Quick** (the default) — Chrome's own speech recognition. Chrome sends the audio to Google's speech service; TalkType never sees it and no key is involved.
  - **Cloud** — audio is sent directly from your browser to Google's Gemini API using **your own** API key.
  - **Live** — audio is streamed directly from your browser to Deepgram using **your own** API key.
  - **Private** — audio never leaves your device. A Whisper model runs inside Chrome.
- API keys are stored in Chrome's local extension storage on your device. They are never sent anywhere except to the provider they belong to.
- We do not see your audio, your transcripts, or your keys. There is no TalkType backend.

## What data is processed

| Data | Where it goes | Retained? |
|---|---|---|
| Microphone audio | Google via Chrome's speech service (Quick engine), Google Gemini with your key (Cloud engine), Deepgram with your key (Live engine), or nowhere (Private engine) | Not by TalkType. Provider retention is governed by the provider's own policy. |
| Transcribed text | Inserted into the page you are on and copied to your clipboard | Only if you turn on **Keep recent transcripts** (off by default): the last 20 stay in Chrome local storage on your device and can be cleared from the popup. |
| Gemini / Deepgram API key | Chrome `storage.local` on this device | Until you remove it. Never synced, never sent to TalkType. |
| Preferences (engine, style, sounds, history toggle, insert toggle, model choice) | Chrome `storage.sync` | Synced by Chrome to your other Chrome profiles if you have Chrome sync on. Contains no keys and no transcripts. |
| Whisper model files (Private engine) | Downloaded once from the Hugging Face hub into Chrome's cache | Until Chrome clears its cache or you uninstall. |

## Third parties

- **Google speech service via Chrome** — used by the Quick engine through the browser's Web Speech API. Governed by Google Chrome's privacy policy; TalkType adds nothing to it.
- **Google Gemini API** (`generativelanguage.googleapis.com`) — used only with the Cloud engine and only with a key you provide. See Google's [Gemini API terms](https://ai.google.dev/gemini-api/terms) and privacy policy.
- **Deepgram** (`api.deepgram.com`) — used only with the Live engine and only with a key you provide. See Deepgram's privacy policy.
- **Hugging Face hub** — used only with the Private engine, only to download model weights the first time. No audio is ever sent there.

TalkType has no relationship with any of these providers beyond calling their public APIs from your browser with your credentials.

## Permissions we ask for and why

- **Access to all websites** — to place a mic button next to text fields and insert your words where your cursor is. TalkType does not read page content beyond what it needs to find text fields.
- **Storage / unlimited storage** — to keep preferences, your keys (locally), optional transcript history, and the offline model cache.
- **Offscreen document** — to host the offline Whisper model in a background page.
- **Scripting / active tab** — so the keyboard shortcut and popup work on tabs that were open before TalkType was installed, without you reloading them.
- **Microphone** — Chrome asks you per site the first time you dictate there. TalkType never records without you starting it.

## What we do not do

- No accounts, sign-ups, or emails.
- No analytics, crash reporting, or usage tracking.
- No ads, no selling or sharing of data.
- No remote code. Everything runs from the files shipped in the extension.

## Your choices

- Switch to the **Private** engine at any time if you do not want audio sent to any provider.
- Remove a key from Settings to delete it from your device immediately.
- Turn off **Keep recent transcripts** and press **Clear** in the popup to remove stored history.
- Uninstalling the extension removes all locally stored data.

## Contact

Questions: open an issue at https://github.com/pibulus/talktype_extension or reach Pablo via https://talktype.app.
