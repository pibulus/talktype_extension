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
    try {
      // Try to get current permission status
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
      return permissionStatus.state === 'granted';
    } catch (error) {
      console.warn('Could not query microphone permission status:', error);
      return false;
    }
  }

  /**
   * Request microphone permission with a custom dialog
   * @returns {Promise<boolean>}
   */
  requestMicrophonePermission() {
    return new Promise((resolve) => {
      // First check storage for existing permission
      chrome.storage.sync.get(['microphonePermission'], async (result) => {
        if (result.microphonePermission === 'granted') {
          this.permissionGranted = true;
          resolve(true);
          return;
        }
        
        // No permission stored, try to request using dialog
        // Create dialog if needed
        if (!this.permissionDialog) {
          this.permissionDialog = new PermissionDialog();
        }
        
        // Try the dedicated permission page approach if dialog doesn't show
        try {
          // Show custom permission dialog
          this.permissionDialog.showDialog(
            // On Allow
            async () => {
              try {
                // Actually request browser permission
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                
                // Stop the stream right away, we just needed permission
                stream.getTracks().forEach(track => track.stop());
                
                // Store permission status
                chrome.storage.sync.set({ microphonePermission: 'granted' });
                
                this.permissionGranted = true;
                resolve(true);
              } catch (error) {
                console.error('Permission request failed:', error);
                
                // If permission denied, open dedicated page
                if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                  this.openPermissionPage();
                }
                
                resolve(false);
              }
            },
            // On Deny
            () => {
              // On deny, offer the dedicated page
              this.openPermissionPage();
              
              this.permissionGranted = false;
              resolve(false);
            }
          );
        } catch (e) {
          console.error('Error showing dialog:', e);
          // Fallback to native permission request
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
      // Check if we already have permission
      const hasPermission = await this.checkMicrophonePermission();
      
      // If no permission, request it with our custom dialog
      if (!hasPermission && !this.permissionGranted) {
        const permissionGranted = await this.requestMicrophonePermission();
        if (!permissionGranted) {
          throw new Error('Microphone permission denied');
        }
      }
      
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