# Chrome Web Store Readiness

## Current State

The extension is close, but not "submit blind and hope" ready yet.

What is already good:

- clear product purpose
- real popup UI
- real options/setup page
- first-run settings page opens on install
- direct Gemini transcription flow works without app-side middleware
- content script insertion model is coherent
- README/setup instructions are current
- temporary manual install zip is linked from the TalkType web app

## Biggest Remaining Gaps

1. Store install surface

- There is no Chrome Web Store listing yet.
- The TalkType web app now has a temporary manual install page and downloadable zip.

2. Store assets

You still need the usual Chrome Web Store package:

- 128x128 icon
- at least one screenshot, ideally 3-5
- small promo tile if you want better presentation
- short description
- full description
- privacy policy URL

3. Privacy policy page

The extension is privacy-friendly, and the main TalkType site should host a clean public URL explaining:

- what audio is sent to Google
- that the user provides their own Gemini key
- that TalkType does not run its own transcription server for the extension
- that the API key is stored locally in Chrome extension storage
- what preferences are stored in `chrome.storage.sync`

Suggested URL:

- `https://talktype.app/extension/privacy`

4. Repo and public identity

The extension should live under the same public identity as the main app:

- `https://github.com/pibulus/talktype_extension`

## Suggested Store Positioning

### Short Description

Voice-to-text for any text box on the web. Click, speak, done.

### Longer Description

TalkType adds voice typing to the websites you already use. Click the mic, speak naturally, and your words land right where your cursor is. Works in text inputs, textareas, and rich editors across the web.

Why people like it:

- works in Gmail, Notion, chat apps, docs, and forms
- keeps existing text and inserts at the cursor
- includes multiple transcription styles
- uses your own Gemini API key
- no TalkType account required

### Good Listing Angles

- "Voice-to-text anywhere on the web"
- "Works in any text box"
- "Use your own Gemini key"
- "No accounts, no server middleman"

## Submission Checklist

- rename or verify repo/brand URLs to match TalkType
- publish a privacy policy page on the TalkType site
- add a proper TalkType extension landing page
- capture 3-5 screenshots:
  - popup ready state
  - popup recording state
  - options page
  - inline mic button beside a real text field
  - successful insertion into a web app
- export store copy from this file into the listing
- package and test the extension fresh in Chrome before submission

## My Read

This is close enough to treat as a real public-side project now.

The product itself is not the problem.
The missing pieces are mostly packaging, trust, and install surface.
