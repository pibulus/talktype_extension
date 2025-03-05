// Audio recording service

class AudioRecordingService {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.permissionDialog = null;
    this.permissionGranted = false;
  }

  /**
   * Check if microphone permission has been granted
   * @returns {Promise<boolean>}
   */
  async checkMicrophonePermission() {
    // First check storage for stored permission status
    return new Promise((resolve) => {
      chrome.storage.sync.get(['microphonePermission'], (result) => {
        if (result.microphonePermission === 'granted') {
          this.permissionGranted = true;
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  /**
   * Request microphone permission
   * @returns {Promise<boolean>}
   */
  requestMicrophonePermission() {
    return new Promise((resolve) => {
      // First check storage for existing permission
      chrome.storage.sync.get(['microphonePermission'], (result) => {
        if (result.microphonePermission === 'granted') {
          this.permissionGranted = true;
          resolve(true);
          return;
        }
        
        // No permission stored, try to request directly
        try {
          // For maximum compatibility, use both API styles
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
              .then((stream) => {
                // Stop the stream right away, we just needed permission
                try {
                  stream.getTracks().forEach(track => track.stop());
                } catch (e) {
                  if (stream.stop) stream.stop();
                }
                
                // Store permission status
                chrome.storage.sync.set({ microphonePermission: 'granted' });
                this.permissionGranted = true;
                resolve(true);
              })
              .catch((error) => {
                console.error('Permission request failed:', error);
                
                // If permission denied, offer options page
                if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                  this.openPermissionPage();
                }
                
                resolve(false);
              });
          } 
          // Try older APIs for compatibility
          else if (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia) {
            const getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
            
            getUserMedia.call(navigator, 
              { audio: true }, 
              // Success
              (stream) => {
                // Stop the stream
                if (stream.stop) stream.stop();
                else if (stream.getTracks) {
                  stream.getTracks().forEach(track => track.stop());
                }
                
                // Store permission
                chrome.storage.sync.set({ microphonePermission: 'granted' });
                this.permissionGranted = true;
                resolve(true);
              },
              // Error
              (error) => {
                console.error('Permission request failed:', error);
                this.openPermissionPage();
                resolve(false);
              }
            );
          } else {
            // No API available
            console.error('No getUserMedia API available');
            this.openPermissionPage();
            resolve(false);
          }
        } catch (e) {
          console.error('Error during permission request:', e);
          this.openPermissionPage();
          resolve(false);
        }
      });
    });
  }
  
  /**
   * Open the dedicated permission page
   */
  openPermissionPage() {
    chrome.runtime.sendMessage({ action: 'requestMicrophonePermission' });
  }

  /**
   * Request microphone access and start recording
   * @returns {Promise<void>}
   */
  async startRecording() {
    try {
      // Check if we're on Mac
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      
      // Check if we already have permission
      const hasPermission = await this.checkMicrophonePermission();
      
      // If no permission, request it - unless we're on Mac where we'll rely on manual steps
      if (!hasPermission && !this.permissionGranted && !isMac) {
        const permissionGranted = await this.requestMicrophonePermission();
        if (!permissionGranted) {
          throw new Error('Microphone permission denied');
        }
      }
      
      // For Mac, we'll still try to access the microphone even if permission wasn't explicitly granted,
      // as the user might have already granted permission in System Preferences
      
      // Request microphone access with more thorough error handling
      try {
        // Try different methods to improve compatibility
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          this.stream = await navigator.mediaDevices.getUserMedia({ 
            audio: true,
            video: false // Explicitly exclude video to avoid confusion
          });
        } else if (navigator.getUserMedia) {
          this.stream = await new Promise((resolve, reject) => {
            navigator.getUserMedia({ audio: true, video: false }, resolve, reject);
          });
        } else if (navigator.webkitGetUserMedia) {
          this.stream = await new Promise((resolve, reject) => {
            navigator.webkitGetUserMedia({ audio: true, video: false }, resolve, reject);
          });
        } else {
          throw new Error('getUserMedia not supported in this browser');
        }
      } catch (mediaError) {
        console.error('Media access error:', mediaError);
        
        // For Mac users, give specific guidance
        if (isMac) {
          throw new Error('Microphone access denied. Please ensure Chrome has permission to use your microphone in System Preferences > Security & Privacy > Privacy > Microphone.');
        } else {
          throw mediaError;
        }
      }
      
      // Create media recorder with fallbacks for different browser implementations
      try {
        this.mediaRecorder = new MediaRecorder(this.stream);
      } catch (recorderError) {
        console.error('MediaRecorder error:', recorderError);
        
        // Clean up stream if media recorder creation fails
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }
        
        throw new Error('Could not create audio recorder. Your browser may not support this feature.');
      }
      
      this.audioChunks = [];
      
      // Set up event handlers
      this.mediaRecorder.addEventListener('dataavailable', event => {
        this.audioChunks.push(event.data);
      });
      
      // Start recording with error handling
      try {
        this.mediaRecorder.start();
        console.log('Recording started');
      } catch (startError) {
        console.error('Error starting recording:', startError);
        
        // Clean up resources
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }
        
        throw new Error('Failed to start recording: ' + startError.message);
      }
    } catch (error) {
      console.error('Error in startRecording:', error);
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