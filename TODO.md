# TalkType Extension TODO

## High Priority
- [ ] Fix transcription issues on Facebook posts and Gmail (requires testing different DOM selection methods)
- [ ] Test dark mode detection and styling across various websites 
- [ ] Improve error handling for API key validation
- [ ] Add feedback mechanism when transcription fails with specific error message

## Medium Priority
- [ ] Update progress bar animations for a more fluid user experience
- [ ] Improve notification positioning for compatibility with more websites
- [ ] Refine input detection for rarer text inputs
- [ ] Add option to disable animations for performance-sensitive environments

## Low Priority
- [ ] Support keeping recording active when popup is closed (architectural change)
- [ ] Add language selection options for non-English transcription
- [ ] Implement hotkey support for starting/stopping recording
- [ ] Add customization options for notification style and position

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

---

**Note to self**: The current implementation works well but recording functionality could be moved to the background script to allow continuous recording even when the popup is closed. This would require significant architectural changes but would greatly improve the user experience. Worth exploring in a future major update.

Last updated: March 2025