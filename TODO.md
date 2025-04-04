# TalkType Extension TODO

## High Priority
- [x] Replace problematic mic buttons with a more reliable approach (completed in v1.3.0)
- [x] Add context menu-based transcription to support all text input types (completed in v1.3.0)
- [ ] Test context menu transcription on popular websites (Facebook, Gmail, Google Docs)
- [ ] Improve error handling for API key validation

## Medium Priority
- [x] Improve transcription insertion reliability (addressed in v1.3.0 with context menu)
- [x] Add visual indicator for context menu recording (completed in v1.3.0)
- [ ] Update progress bar animations for a more fluid user experience
- [ ] Add keyboard shortcut for controlling recording

## Low Priority
- [ ] Support keeping recording active when popup is closed (architectural change)
- [ ] Add language selection options for non-English transcription
- [ ] Add customization options for notification style and position
- [ ] Optimize recording performance on slower devices

## Technical Debt
- [ ] Refactor notification code to reduce duplication between content.js and styles.css
- [ ] Consolidate styling into fewer CSS files with better organization
- [ ] Improve modularization of JavaScript with clearer separation of concerns
- [ ] Add comprehensive automated testing for UI components

## Ideas for Future Releases
- [ ] Allow speech command support ("delete that", "new paragraph", etc.)
- [ ] Add ability to save transcription history
- [ ] Support for real-time transcription (stream mode)
- [ ] Integration with additional speech-to-text services beyond Gemini API
- [ ] Mobile browser extension support
- [ ] Add text formatting options for transcriptions (capitalize, lowercase, etc.)
- [ ] Consider re-adding mic buttons as an optional feature that users can enable

---

**Note to self**: The context menu approach solved many of the positioning and compatibility issues we were facing with mic buttons. Recording functionality could still be moved to the background script to allow continuous recording even when the popup is closed. This would require architectural changes but would improve the user experience. Worth exploring in a future major update.

Last updated: April 2025