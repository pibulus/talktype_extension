# Audio to Text Chrome Extension

A Chrome extension that adds microphone functionality to text inputs for voice transcription using the Gemini API.

## Features

- Automatically adds microphone icons to text input fields on any webpage
- Records audio from your microphone with a simple click
- Transcribes speech to text using the Gemini API
- Inserts the transcribed text into the input field
- Works with dynamically loaded content
- Customizable through the options page

## Installation

### From Source

1. Clone this repository or download it as a ZIP file
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the `src` folder from this repository
5. The extension should now be installed and visible in your Chrome toolbar

## Usage

1. Click on the extension icon in the Chrome toolbar to access the popup
2. Go to Options and enter your Gemini API key
   - You can get a Gemini API key from [Google AI Studio](https://ai.google.dev/)
3. Navigate to any website with text inputs
4. Click on the microphone icon that appears next to text inputs
5. Speak your text and it will be transcribed into the input field

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
- `icons/` - Icons for the extension

### Building for Production

1. Ensure you have the latest versions of all files
2. Update the version number in `manifest.json`
3. Zip the contents of the `src` directory
4. The extension is now ready to be distributed

## Privacy

This extension:
- Only activates microphone recording when you explicitly click the microphone icon
- Only sends audio to the Gemini API for transcription
- Does not store any audio data or transcriptions
- Uses your personal Gemini API key which you control

## License

[MIT License](LICENSE)

## Acknowledgements

- Uses the [Gemini API](https://ai.google.dev/) for speech transcription
- Icons from [Material Design Icons](https://material.io/resources/icons/)
