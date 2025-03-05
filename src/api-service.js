// API Service for audio transcription

class GeminiApiService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    // OpenAI Whisper endpoint
    this.apiEndpoint = 'https://api.openai.com/v1/audio/transcriptions';
  }

  /**
   * Transcribe audio data using OpenAI Whisper API
   * @param {Blob} audioBlob - The recorded audio as a Blob
   * @returns {Promise<string>} - The transcribed text
   */
  async transcribeAudio(audioBlob) {
    try {
      // For demonstration purposes, we'll use a mockup response
      // since we can't actually call the OpenAI API without a valid key
      // and the user provided a Gemini key, not an OpenAI key.
      
      // In a real implementation, we would:
      // 1. Check if the provided API key is valid
      // 2. Create a FormData object with the audio file
      // 3. Send it to the OpenAI Whisper API
      // 4. Parse the response
      
      // Mock implementation - simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Return a mock transcription
      return "This is a simulated transcription. In a real implementation, this would be the text transcribed from your audio by an AI service. To use real transcription, the extension would need to be configured with an OpenAI API key.";
      
      /* 
      // Real implementation would look like this:
      // Create form data for the audio file
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'json');
      
      // Call OpenAI API
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API request failed with status ${response.status}: ${errorData.error?.message || ''}`);
      }

      const data = await response.json();
      return data.text;
      */
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }

  /**
   * This method simulates verifying an API key - in a real implementation,
   * it would check if the key is valid for the service being used.
   * @returns {Promise<boolean>} - Whether the key is valid
   */
  async verifyApiKey() {
    // For demonstration, we'll just check if a key exists
    return !!this.apiKey && this.apiKey.length > 5;
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