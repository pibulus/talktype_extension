# TalkType Browser Extension

A sleek, modern browser extension that adds voice-to-text functionality to any text input field with a beautiful glass morphism UI.

![TalkType Logo](src/icons/icon_white/android-icon-192x192.png)

## Features

- **Modern Glass UI**: Beautiful transparent interface with subtle animations
- **Adaptive Icons**: Automatically switches between light and dark mode icons based on system theme
- **Smart Microphone**: Click once to start recording, with visual feedback
- **Instant Transcription**: Using the powerful Gemini API for accurate speech recognition
- **Clipboard Integration**: Automatically copies transcriptions to clipboard
- **Focus-Based**: Elegantly positions microphone buttons near text fields
- **Theme Options**: Toggle between light and dark themes
- **Responsive Design**: Works across devices and screen sizes
- **Dynamic Content Support**: Works with dynamically loaded content on any website

## Installation

### From Source

1. Clone this repository or download it as a ZIP file
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the `src` folder from this repository
5. The extension should now be installed and visible in your browser toolbar

## Usage

1. Click on the extension icon in the browser toolbar to access the popup
2. Go to Settings and enter your Gemini API key
   - You can get a Gemini API key from [Google AI Studio](https://ai.google.dev/)
3. Navigate to any website with text inputs
4. Click on the microphone icon that appears next to text inputs when focused
5. Speak your text and it will be transcribed into the input field
6. The transcription is automatically copied to your clipboard for convenience

## Key Features in Detail

### Glass Morphism UI
TalkType features a modern design with subtle transparency effects, giving it a premium look and feel. The interface includes delicate animations and visual feedback during recording and transcription.

### Direct Recording
Simply click the "Record & Transcribe" button to immediately start recording. A visual indicator shows recording status, and the transcription appears in a sleek container.

### Adaptive Theming
The extension icon automatically adapts to your system's light or dark theme, ensuring good visibility in both modes. You can also toggle between light and dark themes within the extension.

### Smart Positioning
Microphone buttons are intelligently positioned next to text fields, appearing when needed and staying out of your way when not in use.

## Development

### Project Structure

- `manifest.json` - Extension configuration
- `content.js` - Content script that runs on web pages
- `background.js` - Background script for extension functionality
- `api-service.js` - Service for communicating with the Gemini API
- `audio-service.js` - Service for audio recording functionality
- `options.html/js` - Options page for extension configuration
- `popup.html/js` - Popup UI when clicking the extension icon
- `styles.css` - Styles for the extension UI elements
- `icons/` - Icons for the extension (including light/dark variants)

### Building for Production

1. Ensure you have the latest versions of all files
2. Update the version number in `manifest.json`
3. Zip the contents of the `src` directory
4. The extension is now ready to be distributed

## Privacy

TalkType takes your privacy seriously:
- Microphone access is only activated when you explicitly click to record
- Audio is only sent to the Gemini API for transcription
- No audio data or transcriptions are stored
- Uses your personal Gemini API key which you control
- All processing happens in your browser or via the API

## License

[MIT License](LICENSE)

## Acknowledgements

- Uses the [Gemini API](https://ai.google.dev/) for speech transcription
- Icons based on Material Design principles
- Created with ❤️ for easier web interaction