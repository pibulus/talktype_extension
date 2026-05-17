// Audio recording service

class AudioRecordingService {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.permissionDialog = null;
    this.permissionGranted = false;
    this.recordingMimeType = '';
    this.stopPromise = null;
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
   * Request microphone permission with improved error handling and diagnostics
   * @returns {Promise<boolean>}
   */
  requestMicrophonePermission() {
    console.log('TalkType AudioService: Requesting microphone permission');
    
    return new Promise((resolve) => {
      // First check storage for existing permission
      chrome.storage.sync.get(['microphonePermission'], (result) => {
        // Chrome storage API error handling
        if (chrome.runtime.lastError) {
          console.error('TalkType AudioService: Chrome storage error:', chrome.runtime.lastError);
        }
        
        console.log('TalkType AudioService: Stored permission status:', result.microphonePermission);
        
        if (result && result.microphonePermission === 'granted') {
          console.log('TalkType AudioService: Using stored permission: granted');
          this.permissionGranted = true;
          resolve(true);
          return;
        }
        
        // Debug browser support
        if (!navigator.mediaDevices) {
          console.error('TalkType AudioService: navigator.mediaDevices not available');
        }
        
        if (navigator.mediaDevices && !navigator.mediaDevices.getUserMedia) {
          console.error('TalkType AudioService: navigator.mediaDevices.getUserMedia not available');
        }
        
        // No permission stored, try to request directly
        try {
          console.log('TalkType AudioService: Requesting media access directly');
          
          // For maximum compatibility, use both API styles
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            console.log('TalkType AudioService: Using modern getUserMedia API');
            
            navigator.mediaDevices.getUserMedia({ 
              audio: true,
              video: false // Explicitly exclude video to avoid confusion
            })
              .then((stream) => {
                console.log('TalkType AudioService: Permission granted! Got stream with tracks:', 
                  stream.getTracks().length);
                
                // Stop the stream right away, we just needed permission
                try {
                  stream.getTracks().forEach(track => {
                    console.log('TalkType AudioService: Stopping track:', track.kind);
                    track.stop();
                  });
                } catch (e) {
                  console.error('TalkType AudioService: Error stopping tracks:', e);
                  if (stream.stop) stream.stop();
                }
                
                // Store permission status
                console.log('TalkType AudioService: Storing permission as granted');
                chrome.storage.sync.set({ microphonePermission: 'granted' });
                this.permissionGranted = true;
                resolve(true);
              })
              .catch((error) => {
                console.error('TalkType AudioService: Permission request failed:', error.name, error.message);
                
                // If permission denied, offer options page
                if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                  console.log('TalkType AudioService: Permission denied, opening permission page');
                  this.openPermissionPage();
                }
                
                resolve(false);
              });
          } 
          // Try older APIs for compatibility
          else if (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia) {
            console.log('TalkType AudioService: Using legacy getUserMedia API');
            const getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
            
            getUserMedia.call(navigator, 
              { audio: true, video: false }, 
              // Success
              (stream) => {
                console.log('TalkType AudioService: Legacy API permission granted!');
                // Stop the stream
                if (stream.stop) {
                  console.log('TalkType AudioService: Using legacy stream.stop()');
                  stream.stop();
                }
                else if (stream.getTracks) {
                  console.log('TalkType AudioService: Using modern getTracks() with legacy API');
                  stream.getTracks().forEach(track => track.stop());
                }
                
                // Store permission
                chrome.storage.sync.set({ microphonePermission: 'granted' });
                this.permissionGranted = true;
                resolve(true);
              },
              // Error
              (error) => {
                console.error('TalkType AudioService: Legacy permission request failed:', error);
                this.openPermissionPage();
                resolve(false);
              }
            );
          } else {
            // No API available
            console.error('TalkType AudioService: No getUserMedia API available');
            this.openPermissionPage();
            resolve(false);
          }
        } catch (e) {
          console.error('TalkType AudioService: Error during permission request:', e);
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

  getPreferredMimeType() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
      return '';
    }

    return [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
  }

  stopStreamTracks() {
    if (!this.stream) return;
    this.stream.getTracks().forEach(track => track.stop());
  }

  /**
   * Request microphone access and start recording
   * @returns {Promise<void>}
   */
  async startRecording() {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        throw new Error('Recording is already in progress');
      }

      this.stopPromise = null;
      this.recordingMimeType = '';

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
        const preferredMimeType = this.getPreferredMimeType();
        this.mediaRecorder = preferredMimeType
          ? new MediaRecorder(this.stream, { mimeType: preferredMimeType })
          : new MediaRecorder(this.stream);
        this.recordingMimeType = this.mediaRecorder.mimeType || preferredMimeType || '';
      } catch (recorderError) {
        console.error('MediaRecorder error:', recorderError);
        
        // Clean up stream if media recorder creation fails
        this.stopStreamTracks();
        
        throw new Error('Could not create audio recorder. Your browser may not support this feature.');
      }
      
      this.audioChunks = [];
      
      // Set up event handlers
      this.mediaRecorder.addEventListener('dataavailable', event => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      });
      
      // Start recording with error handling
      try {
        this.mediaRecorder.start();
        console.log('Recording started');
      } catch (startError) {
        console.error('Error starting recording:', startError);
        
        // Clean up resources
        this.stopStreamTracks();
        
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
    if (this.stopPromise) return this.stopPromise;

    if (!this.mediaRecorder) {
      return Promise.reject(new Error('No active recording'));
    }

    const recorder = this.mediaRecorder;
    const mimeType =
      this.recordingMimeType ||
      recorder.mimeType ||
      this.audioChunks[0]?.type ||
      'audio/webm';

    this.stopPromise = new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        this.stopStreamTracks();
        this.stream = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingMimeType = '';
      };

      const settle = (handler, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        handler(value);
      };

      const resolveWithBlob = () => {
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        if (!audioBlob.size) {
          settle(reject, new Error('No audio captured'));
          return;
        }

        console.log('Recording stopped, audio blob created');
        settle(resolve, audioBlob);
      };

      recorder.addEventListener('stop', resolveWithBlob, { once: true });
      recorder.addEventListener(
        'error',
        (event) => {
          settle(reject, event.error || new Error('Recording failed'));
        },
        { once: true }
      );

      try {
        if (recorder.state === 'inactive') {
          resolveWithBlob();
          return;
        }

        recorder.stop();
      } catch (error) {
        settle(reject, error);
      }
    });

    return this.stopPromise.finally(() => {
      this.stopPromise = null;
    });
  }

  /**
   * Check if the browser supports audio recording
   * @returns {boolean} - Whether recording is supported
   */
  isRecordingSupported() {
    console.log('TalkType AudioService: Checking recording support');
    
    // More thorough check for browser compatibility
    const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasGetUserMedia = !!(navigator.getUserMedia || 
                            navigator.webkitGetUserMedia || 
                            navigator.mozGetUserMedia || 
                            navigator.msGetUserMedia);
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
    
    console.log('TalkType AudioService: hasMediaDevices:', hasMediaDevices);
    console.log('TalkType AudioService: hasGetUserMedia:', hasGetUserMedia);
    console.log('TalkType AudioService: hasMediaRecorder:', hasMediaRecorder);
    
    return hasMediaDevices && hasMediaRecorder;
  }
}

// Export the service
window.AudioRecordingService = AudioRecordingService;
