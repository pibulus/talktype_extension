// Audio recording service

class AudioRecordingService {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
  }

  /**
   * Request microphone access and start recording
   * @returns {Promise<void>}
   */
  async startRecording() {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create media recorder
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];
      
      // Set up event handlers
      this.mediaRecorder.addEventListener('dataavailable', event => {
        this.audioChunks.push(event.data);
      });
      
      // Start recording
      this.mediaRecorder.start();
      console.log('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      throw error;
    }
  }

  /**
   * Stop recording and return the audio data
   * @returns {Promise<Blob>} - The recorded audio as a Blob
   */
  stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No active recording'));
        return;
      }

      // Handle recording stop
      this.mediaRecorder.addEventListener('stop', () => {
        // Create audio blob from chunks
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // Stop all tracks
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }
        
        this.stream = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        
        console.log('Recording stopped, audio blob created');
        resolve(audioBlob);
      });

      // Stop recording
      this.mediaRecorder.stop();
    });
  }

  /**
   * Check if the browser supports audio recording
   * @returns {boolean} - Whether recording is supported
   */
  isRecordingSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
}

// Export the service
window.AudioRecordingService = AudioRecordingService;