class UIProgressManager {
  constructor() {
    this.progressInterval = null;
    this.lastMessageUpdateTime = 0;
    this.processingMessages = [
      "Processing", "Magic", "Converting", "Thinking", "Translating", 
      "Analyzing", "Decoding", "Working", "Transcribing", "Interpreting", 
      "Transforming", "Computing", "Listening", "Deciphering", "Understanding", 
      "Pondering", "Absorbing", "Wizardry", "Enchanting", "Conjuring", 
      "Brewing", "Spellcasting", "Unraveling", "Digesting", "Transmuting", "Calculating"
    ];
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;
    
    // Add the progress bar styles if not already added
    this.addProgressBarStyles();
    this.initialized = true;
  }

  addProgressBarStyles() {
    if (!document.getElementById('progress-bar-styles')) {
      const progressStyles = document.createElement('style');
      progressStyles.id = 'progress-bar-styles';
      progressStyles.textContent = `
        /* Gradient Progress Bar */
        .button-progress-container {
          position: relative;
          overflow: hidden;
          border-radius: 16px;
        }
        
        .button-progress-bar {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 0%;
          background: var(--progress-gradient);
          background-size: 200% 100%;
          border-radius: 16px;
          transition: width 0.3s ease;
          z-index: 0;
          opacity: 0.85;
        }
        
        .button-progress-bar.complete {
          animation: gradient-shift 1.5s ease forwards, glow 1.5s ease forwards;
        }
        
        .button-progress-bar::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 50%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          animation: progress-shine 2s infinite;
        }
        
        .button-progress-content {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        
        @keyframes progress-shine {
          0% { left: -100%; }
          100% { left: 200%; }
        }
        
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
        
        @keyframes glow {
          0% { box-shadow: 0 0 5px rgba(70, 174, 247, 0.3); }
          50% { box-shadow: 0 0 20px rgba(75, 203, 156, 0.6), 0 0 30px rgba(90, 120, 255, 0.5); }
          100% { box-shadow: 0 0 10px rgba(75, 203, 156, 0.6); }
        }
        
        /* Copy notification */
        .copy-notification {
          position: fixed;
          bottom: 10px;
          left: 50%;
          transform: translateX(-50%) translateY(40px);
          background: rgba(75, 203, 156, 0.95);
          color: white;
          padding: 10px 18px;
          border-radius: 14px;
          font-size: 14px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          width: 90%;
        }
        
        .copy-notification.show {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
        
        .copy-notification svg {
          margin-right: 8px;
          width: 16px;
          height: 16px;
        }
      `;
      document.head.appendChild(progressStyles);
    }
  }

  transformButtonToProgressBar(button) {
    // Preserve button content
    const buttonContent = button.innerHTML;
    
    // Transform button to progress bar
    button.classList.add('button-progress-container');
    button.disabled = true;
    
    // Create progress structure with a random fun message
    const randomMessage = this.getRandomProcessingMessage();
    button.innerHTML = `
      <div id="progress-bar" class="button-progress-bar"></div>
      <div class="button-progress-content">
        <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path fill="currentColor" d="M6 2l12 10-12 10V2z"/>
        </svg>
        <span>${randomMessage}...</span>
      </div>
    `;
    
    // Hide settings button while showing progress
    const settingsButton = document.getElementById('options');
    if (settingsButton) {
      settingsButton.style.display = 'none';
    }
    
    // Store original content for later restoration
    button.dataset.originalContent = buttonContent;
    
    // Start progress animation
    this.startFakeProgressAnimation();
  }

  startFakeProgressAnimation() {
    let fakeProgress = 0;
    this.lastMessageUpdateTime = Date.now();
    
    this.progressInterval = setInterval(() => {
      if (fakeProgress < 30) {
        fakeProgress += 3; // Fast initial progress
      } else if (fakeProgress < 60) {
        fakeProgress += 1.5; // Still fast
      } else if (fakeProgress < 85) {
        fakeProgress += 0.8; // Medium speed
      } else if (fakeProgress < 95) {
        fakeProgress += 0.3; // Slow down
      }
      
      // Cap at 95%
      if (fakeProgress > 95) {
        fakeProgress = 95;
        clearInterval(this.progressInterval);
      }
      
      // Update progress bar
      const progressBar = document.getElementById('progress-bar');
      if (progressBar) {
        progressBar.style.width = fakeProgress + '%';
        
        // Occasionally update the message (every ~2.5 seconds)
        const now = Date.now();
        if (now - this.lastMessageUpdateTime > 2500) {
          const messageElement = document.querySelector('.button-progress-content span');
          if (messageElement) {
            const randomMessage = this.getRandomProcessingMessage();
            messageElement.textContent = `${randomMessage}...`;
          }
          this.lastMessageUpdateTime = now;
        }
      }
    }, 40); // Slightly slower interval for smoother animation
  }

  showTranscribingStatus(container, randomMessage = false) {
    // Update the status to indicate processing is happening
    const statusElement = document.getElementById('status');
    if (statusElement) {
      // Always choose a random fun message
      const message = this.getRandomProcessingMessage();
      
      statusElement.innerHTML = `
        <div class="status-indicator status-processing">
          <span class="pulse-dot"></span>
          <span class="status-text">${message}...</span>
        </div>
      `;
    }
    
    // Progress bar animation is handled by startFakeProgressAnimation()
  }

  updateProgressCallback(status, percentage) {
    // This function can be used to update UI based on real progress
    // For now we're using fake progress for a smoother experience
    console.log(`Transcription progress: ${status} (${percentage}%)`);
  }

  completeProgressAnimation() {
    // Clear any existing interval
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    
    // Get the progress bar
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
      // Set to 100% with satisfying finish
      progressBar.style.width = '100%';
      progressBar.style.transition = 'width 0.5s cubic-bezier(0.1, 0.9, 0.2, 1.2)';
      progressBar.classList.add('complete');
      
      // Update the progress content text to show "Complete"
      const progressContent = document.querySelector('.button-progress-content span');
      if (progressContent) {
        progressContent.textContent = 'Complete';
      }
      
      // Update icon to checkmark
      const progressIcon = document.querySelector('.button-progress-content svg path');
      if (progressIcon) {
        progressIcon.setAttribute('d', 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z');
      }
      
      // Show the copy notification
      setTimeout(() => {
        window.NotificationService.showCopyNotification();
        
        // Restore button after a short delay
        setTimeout(() => {
          const recordButton = document.getElementById('startRecording');
          
          if (recordButton) {
            // Always use the original mic icon and "Record & Transcribe" text
            recordButton.innerHTML = `
              <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path fill="currentColor" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path fill="currentColor" d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              </svg>
              Record & Transcribe
            `;
            recordButton.classList.remove('button-progress-container');
            recordButton.disabled = false;
            delete recordButton.dataset.originalContent;
            
            // Re-attach the event listener for the record button
            recordButton.addEventListener('click', async () => {
              if (window.isRecording) {
                await window.stopRecording();
              } else {
                await window.startRecording();
              }
            });
            
            // Keep settings button permanently hidden after first recording
            // This maintains layout stability and prevents UI shifts
          }
        }, 1200); // Slightly longer delay to ensure user sees "Complete" state
      }, 800); // Wait for animation to complete
    }
  }

  getRandomProcessingMessage() {
    return this.processingMessages[Math.floor(Math.random() * this.processingMessages.length)];
  }
}

// Create the global instance
window.UIProgressManager = new UIProgressManager();