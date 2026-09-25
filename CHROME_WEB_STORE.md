# Chrome Web Store — Submission Kit

Everything needed for the developer dashboard, in the order the form asks for it. Copy-paste.

## Package

```
./scripts/package.sh          # → dist/talktype-extension-<version>.zip
```

The zip contains only `src/` (manifest at the root of the zip, as the store requires). Test it fresh: `chrome://extensions` → Developer mode → drag the zip in.

## Store listing

**Name** (45 max): `TalkType — Voice to Text Anywhere`

**Summary** (132 max):
`Talk into any text box on the web. Cloud, live, or fully offline transcription — your mic, your key, your words.`

**Category:** Productivity → Tools
**Language:** English

**Description:**

```
TalkType puts a tiny mic next to every text box on the web. Click it, say your thing, and the words land right where your cursor is. Gmail, Slack, Notion, Discord, Reddit, ChatGPT, forms, comment boxes — anything you can type in, you can talk into.

THREE WAYS TO TRANSCRIBE — YOU PICK
☁️ Cloud — Google Gemini transcribes after you stop, with six personality styles (Clean & Accurate, Surly Pirate, L33t Sp34k, Sparkle Pop, Code Whisperer, Quill & Ink). Uses your own free Gemini API key.
⚡ Live — Deepgram streams your words into the field while you talk. Uses your own Deepgram key (signup includes ~$200 of free credit).
🔒 Private — a Whisper model runs inside Chrome. One-time model download, then your voice never leaves your machine. No key, no internet needed.

BUILT TO STAY OUT OF YOUR WAY
• Teach it your words — names, brands, slang — spelled your way
• BYO style: your own instructions applied after transcription
• Inserts at the cursor without overwriting what's already there
• Auto-copies every transcript to your clipboard as a backup
• Keyboard shortcut (Alt+Shift+D by default) starts and stops dictation in the focused field; Esc discards
• Little sound chirps on start/stop/success (optional)
• Optional on-device history of your last 20 transcripts
• Works in rich editors too: Gmail compose, Notion, Slack, Google Docs comments, ProseMirror/Quill/Draft/Lexical/Slate editors

NO ACCOUNT. NO SERVER IN THE MIDDLE.
TalkType has no backend. Your API key is stored locally in Chrome and only ever sent to the provider it belongs to. No analytics, no telemetry, no tracking. Pick Private mode and nothing leaves your device at all.

Made in Melbourne by Pablo. Talk easy.
https://talktype.app
```

**Icon:** `src/icons/ghost/ghost-128.png`
**Small promo tile (440×280):** `store/promo-small-440x280.png`
**Screenshots (1280×800):** `store/screenshot-*.png` — regenerate with `node scripts/screenshots.mjs` (see below).

## Privacy tab

**Single purpose description:**
`Dictate into any text field on the web: records your voice when you ask, transcribes it with the engine you choose, and inserts the text at your cursor.`

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Store preferences, the user's own API keys (local only), and optional transcript history. |
| `unlimitedStorage` | The Private engine caches a 96–251MB Whisper model in the browser cache so it works offline. |
| `offscreen` | Hosts the offline Whisper model (WASM) in an offscreen document, since service workers cannot run it. |
| `scripting` + `activeTab` | After install or update, tabs that were already open have no content script. When the user presses the keyboard shortcut or uses the popup on such a tab, we inject the content script so it works without a reload. Only on the active tab, only on a user gesture. |
| Host `<all_urls>` (content script) | The mic button must appear next to text fields on any site the user chooses to dictate into. |
| Host `generativelanguage.googleapis.com` | Cloud engine: sends audio to Gemini with the user's own key. |
| Host `api.deepgram.com` | Live engine: streams audio to Deepgram with the user's own key. |

**Remote code:** No. All code ships in the package. Model weights for the Private engine are data files downloaded from the Hugging Face hub, not executable code.

**Data usage disclosures (tick):**
- Audio or voice data — collected? *Yes, transmitted to the user-chosen provider (Google or Deepgram) or processed locally.* Not sold, not used for unrelated purposes, not for creditworthiness.
- Authentication information — *the user's own API keys, stored locally only.*
- Website content — *text is inserted into text fields; page content is not collected.*

**Privacy policy URL:** `https://talktype.app/extension/privacy` — publish the contents of `PRIVACY.md` there. Until that page is live, the store accepts the GitHub-rendered copy: `https://github.com/pibulus/talktype_extension/blob/main/PRIVACY.md`.

## Distribution

- Visibility: Public
- Regions: All
- Pricing: Free (the providers' own pricing applies to the user's keys; TalkType charges nothing)

## Pre-flight checklist

- [ ] `PRIVACY.md` is live at talktype.app/extension/privacy (or use the GitHub URL above for the first submission)
- [ ] talktype.app/extension links to the Web Store listing (replace the manual zip once approved)
- [ ] Fresh-profile test of the zip: install → onboarding opens → paste key → mic on a real site → Alt+Shift+D works
- [ ] Test on a tab that was open *before* install: shortcut injects and works
- [ ] Test all three engines once
- [ ] Bump `version` in `src/manifest.json` for every resubmission

## Positioning notes

Angles that land:
- "Talk into any text box" (the promise, in five words)
- "Three engines, your choice" — cloud/live/offline is the differentiator nobody else offers in one extension
- "No account, no server in the middle" — trust angle; Private mode makes it literal
- Personality styles are the fun hook for social posts, not the lead
