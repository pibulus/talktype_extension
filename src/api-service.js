// API Service for Gemini transcription

class GeminiApiService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
  }

  /**
   * Transcribe audio data using Gemini API
   * @param {Blob} audioBlob - The recorded audio as a Blob
   * @returns {Promise<string>} - The transcribed text
   */
  async transcribeAudio(audioBlob) {
    try {
      // Convert audio to base64
      const base64Audio = await this._blobToBase64(audioBlob);
      
      // Prepare request payload
      const payload = {
        contents: [
          {
            parts: [
              {
                text: "Please transcribe the following audio to text:",
              },
              {
                inline_data: {
                  mime_type: audioBlob.type,
                  data: base64Audio.split(',')[1]
                }
              }
            ]
          }
        ]
      };

      // Call Gemini API
      const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      return this._extractTranscriptFromResponse(data);
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }

  /**
   * Extract the transcript text from the Gemini API response
   * @param {Object} responseData - The API response data
   * @returns {string} - The extracted transcript
   */
  _extractTranscriptFromResponse(responseData) {
    // TODO: Parse the actual Gemini API response format
    // This is a placeholder implementation
    if (responseData.candidates && 
        responseData.candidates[0] && 
        responseData.candidates[0].content &&
        responseData.candidates[0].content.parts && 
        responseData.candidates[0].content.parts[0] &&
        responseData.candidates[0].content.parts[0].text) {
      return responseData.candidates[0].content.parts[0].text;
    }
    throw new Error('Unable to extract transcript from API response');
  }

  /**
   * Convert Blob to base64 string
   * @param {Blob} blob - The audio blob
   * @returns {Promise<string>} - Base64 encoded string
   */
  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// Export the service
window.GeminiApiService = GeminiApiService;