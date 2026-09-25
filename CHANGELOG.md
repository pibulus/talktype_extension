# Changelog

## 1.8.0 — Chrome Web Store ready

### New
- **Quick engine** — Chrome's built-in speech recognition. Zero setup, and the default on fresh installs, so TalkType works before you've read a word.
- **Welcome tour** on install: pick an engine, plug in a key if it needs one, try the real mic button right there, see your shortcut.
- **Your words** — custom vocabulary. Gemini gets it in the prompt, Deepgram nova-3 as keyterms.
- **Bring your own** output style — your own instructions applied after transcription.
- Live engine now covers popup recordings through Deepgram's prerecorded endpoint, so Live users never need a second key.

### Smarter
- Every surface shows the keyboard shortcut Chrome *actually* bound, and warns with a one-click fix if another extension took Alt+Shift+D.
- The shortcut and popup work on tabs that were open before install or update — no reload. Stale mic buttons from the previous version are swept and replaced.
- Clicking the ghost just records; no more "click the field first".
- No missing-key nag on page load; you hear about it only when you try to record.
- Listening toast has a Done button, quotes your real shortcut, and shows live words as a caption on Quick and Live.
- Settings changes reach open tabs immediately.

### Redesigned
- Popup: one button, a line saying where your words will land, engine / shortcut / settings chips.
- Settings: everything autosaves, one glass panel, line icons, pill switches, springy squish on press.
- Gradient ghost icon at every size (the old outline icon disappeared on light toolbars).

### Under the hood
- Store package down from 16MB to 6.4MB (unused ONNX runtime builds dropped).
- Console output silenced on every website.
- Fake-mic end-to-end test and CI.
- Fixed: a Live session cancelled while the connection was opening could leave the socket open.
