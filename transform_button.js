// Transform recording button to progress bar
function transformButtonToProgressBar(button) {
  // Add the progress bar styles if not already added
  if (\!document.getElementById('button-progress-styles')) {
    const progressStyles = document.createElement('style');
    progressStyles.id = 'button-progress-styles';
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
    `;
    document.head.appendChild(progressStyles);
  }
  
  // Preserve button content
  const buttonContent = button.innerHTML;
  
  // Transform button to progress bar
  button.classList.add('button-progress-container');
  button.disabled = true;
  
  // Create progress structure
  button.innerHTML = `
    <div id="progress-bar" class="button-progress-bar"></div>
    <div class="button-progress-content">
      <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M6 2l12 10-12 10V2z"/>
      </svg>
      <span>Processing</span>
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
  startFakeProgressAnimation();
}

// Start fake progress animation
function startFakeProgressAnimation() {
  let fakeProgress = 0;
  window.progressInterval = setInterval(() => {
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
      clearInterval(window.progressInterval);
    }
    
    // Update progress bar
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
      progressBar.style.width = fakeProgress + '%';
    }
  }, 40); // Slightly slower interval for smoother animation
}

// Complete progress animation
function completeProgressAnimation() {
  // Clear any existing interval
  if (window.progressInterval) {
    clearInterval(window.progressInterval);
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
      showCopyNotification();
      
      // Restore button after a short delay
      setTimeout(() => {
        const recordButton = document.getElementById('startRecording');
        
        if (recordButton) {
          // Restore original button appearance
          if (recordButton.dataset.originalContent) {
            recordButton.innerHTML = recordButton.dataset.originalContent;
            recordButton.classList.remove('button-progress-container');
            recordButton.disabled = false;
            delete recordButton.dataset.originalContent;
          } else {
            // Fallback if original content wasn't stored
            recordButton.innerHTML = `
              <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path fill="currentColor" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path fill="currentColor" d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              </svg>
              Record & Transcribe
            `;
            recordButton.classList.remove('button-progress-container');
            recordButton.disabled = false;
          }
          
          // Re-attach event listener for the record button
          recordButton.addEventListener('click', async () => {
            if (isRecording) {
              await stopRecording();
            } else {
              await startRecording();
            }
          });
          
          // Show the settings button again
          const settingsButton = document.getElementById('options');
          if (settingsButton) {
            settingsButton.style.display = 'block';
          }
        }
      }, 1000);
    }, 800); // Wait for animation to complete
  }
}
