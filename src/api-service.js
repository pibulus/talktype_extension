// API Service for audio transcription

class GeminiApiService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    // Gemini API endpoints
    this.uploadEndpoint =
      "https://generativelanguage.googleapis.com/upload/v1beta/files";
    this.generateEndpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  }

  /**
   * Transcribe audio data using Gemini API
   * @param {Blob} audioBlob - The recorded audio as a Blob
   * @param {Function} progressCallback - Optional callback function to report progress
   * @returns {Promise<string>} - The transcribed text
   */
  async transcribeAudio(audioBlob, progressCallback = null) {
    try {
      // Step 1: Upload the audio file to Gemini
      if (progressCallback) progressCallback('upload-start', 0);
      
      const fileUri = await this.uploadAudioFile(audioBlob, progressCallback);
      if (!fileUri) {
        throw new Error("Failed to upload audio file");
      }
      
      if (progressCallback) progressCallback('upload-complete', 50);

      // Step 2: Generate content using the uploaded file
      if (progressCallback) progressCallback('transcription-start', 50);
      
      const result = await this.generateContentFromAudio(fileUri);
      
      if (progressCallback) progressCallback('transcription-complete', 100);
      
      return result;
    } catch (error) {
      console.error("Transcription error:", error);
      throw error;
    }
  }

  /**
   * Upload audio file to Gemini API
   * @param {Blob} audioBlob - The recorded audio blob
   * @param {Function} progressCallback - Optional callback function to report progress
   * @returns {Promise<string>} - The file URI for the uploaded file
   */
  async uploadAudioFile(audioBlob, progressCallback = null) {
    try {
      // Step 1: Get the audio file details
      const mimeType = audioBlob.type || "audio/webm";
      const numBytes = audioBlob.size;
      const displayName = "AUDIO";

      if (progressCallback) progressCallback('preparing-metadata', 5);

      // Step 2: Initial resumable request to define metadata
      const uploadUrlResponse = await fetch(
        `${this.uploadEndpoint}?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": numBytes.toString(),
            "X-Goog-Upload-Header-Content-Type": mimeType,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ file: { display_name: displayName } }),
        }
      );

      if (!uploadUrlResponse.ok) {
        const errorText = await uploadUrlResponse.text();
        throw new Error(
          `Failed to initiate upload: ${uploadUrlResponse.status} - ${errorText}`
        );
      }

      if (progressCallback) progressCallback('initial-request-complete', 20);

      // Get the upload URL from the response headers
      const uploadUrl = uploadUrlResponse.headers.get("X-Goog-Upload-URL");
      if (!uploadUrl) {
        throw new Error("No upload URL received from Gemini API");
      }

      if (progressCallback) progressCallback('starting-file-upload', 25);

      // Step 3: Upload the actual bytes
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Length": numBytes.toString(),
          "X-Goog-Upload-Offset": "0",
          "X-Goog-Upload-Command": "upload, finalize",
        },
        body: audioBlob,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(
          `Failed to upload file: ${uploadResponse.status} - ${errorText}`
        );
      }

      if (progressCallback) progressCallback('file-upload-complete', 45);

      // Get the file info from the response
      const fileInfo = await uploadResponse.json();

      // Return the file URI
      return fileInfo.file?.uri;
    } catch (error) {
      console.error("Error uploading audio:", error);
      throw error;
    }
  }

  /**
   * Generate content from an audio file using Gemini API
   * @param {string} fileUri - The URI of the uploaded audio file
   * @param {Function} progressCallback - Optional callback function to report progress
   * @returns {Promise<string>} - The transcribed text
   */
  async generateContentFromAudio(fileUri, progressCallback = null) {
    try {
      if (progressCallback) progressCallback('sending-transcription-request', 55);
      
      // Call Gemini API to process the audio file
      const response = await fetch(
        `${this.generateEndpoint}?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: "Transcribe this audio clip" },
                  { file_data: { mime_type: "audio/webm", file_uri: fileUri } },
                ],
              },
            ],
          }),
        }
      );

      if (progressCallback) progressCallback('transcription-response-received', 75);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Gemini API request failed with status ${response.status}: ${
            errorData.error?.message || ""
          }`
        );
      }

      const data = await response.json();
      
      if (progressCallback) progressCallback('processing-response', 90);

      // Extract the transcription from the response
      if (
        data.candidates &&
        data.candidates.length > 0 &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.length > 0
      ) {
        return data.candidates[0].content.parts[0].text;
      } else {
        throw new Error("Unexpected response format from Gemini API");
      }
    } catch (error) {
      console.error("Error generating content from audio:", error);
      throw error;
    }
  }

  /**
   * Verify that the API key is valid
   * @returns {Promise<boolean>} - Whether the key is valid
   */
  async verifyApiKey() {
    try {
      // Make a simple request to verify the API key
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );
      if (response.ok) {
        return true;
      } else {
        console.error("API key verification failed:", await response.text());
        return false;
      }
    } catch (error) {
      console.error("API key verification error:", error);
      return false;
    }
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
