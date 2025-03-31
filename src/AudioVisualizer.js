/**
 * AudioVisualizer.js - Based on the Svelte component
 * Provides audio visualization during recording in the popup
 */

class AudioVisualizer {
  constructor(container) {
    this.container = container;
    this.audioDataArray = null;
    this.animationFrameId = null;
    this.audioLevel = 0;
    this.history = []; // Array to store audio level history
    this.historyLength = 30; // Number of bars to display in history
    this.analyser = null;
    this.audioContext = null;
    this.recording = false;
    this.stream = null;
    this.recordingStartTime = null;
    this.timerInterval = null;
    this.statusElement = document.getElementById('status');
    
    // Determine device and set scaling factors
    const userAgent = navigator.userAgent;
    this.isAndroid = /Android/i.test(userAgent);
    this.isiPhone = /iPhone/i.test(userAgent);
    this.isMac = /Macintosh/i.test(userAgent);
    
    // Set scaling factors based on device
    if (this.isAndroid) {
      this.scalingFactor = 40;
      this.offset = 80;
      this.exponent = 0.5;
    } else if (this.isiPhone) {
      this.scalingFactor = 40;
      this.offset = 80;
      this.exponent = 0.2;
    } else if (this.isMac) {
      this.scalingFactor = 20;
      this.offset = 100;
      this.exponent = 0.5;
    } else {
      this.scalingFactor = 2000;
      this.offset = 80;
      this.exponent = 0.5;
    }
    
    this.frameSkipCounter = 0;
    this.frameSkipRate = 2; // Controls animation speed (higher = slower)
    
    // Create containers
    this.createElements();
  }
  
  createElements() {
    // Create container for visualization
    const visualizerContainer = document.createElement('div');
    visualizerContainer.className = 'visualizer-wrapper';
    visualizerContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 5;
      opacity: 0;
      transition: opacity 0.4s ease;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      border-radius: inherit;
      overflow: hidden;
      padding: 0;
      margin: 0;
    `;
    
    // Create the visualizer element - positioned at the bottom
    const historyContainer = document.createElement('div');
    historyContainer.className = 'history-container';
    historyContainer.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: row-reverse;
      border-radius: inherit;
      overflow: hidden;
      background: linear-gradient(to bottom, rgba(255,255,255,0.5), rgba(255,242,248,0.2));
      margin: 0;
      padding: 0;
    `;
    
    // Store references
    this.visualizerWrapper = visualizerContainer;
    this.visualizerElement = historyContainer;
    
    // Add to container
    this.container.appendChild(visualizerContainer);
    visualizerContainer.appendChild(historyContainer);
    
    // Make the visualizer interactive - click to stop recording
    this.visualizerWrapper.addEventListener('click', () => {
      if (this.recording && typeof this.onStopRecording === 'function') {
        this.onStopRecording();
      }
    });
    
    // Add hover effect to indicate interactivity
    this.visualizerWrapper.addEventListener('mouseenter', () => {
      if (this.recording) {
        this.visualizerWrapper.style.cursor = 'pointer';
      }
    });
    
    // Add styles for bars
    const style = document.createElement('style');
    style.textContent = `
      .history-bar {
        position: absolute;
        bottom: 0;
        background: linear-gradient(
          to top,
          #ff7eb3,
          #7b68ee
        );
        transition: height 0.15s ease-in-out;
        border-radius: 3px 3px 0 0;
        margin-right: 1px;
        box-shadow: 0 0 8px rgba(249, 168, 212, 0.2);
        opacity: 0.95;
      }
      
      /* Dynamic bar color based on intensity */
      .history-bar.low {
        background: linear-gradient(to top, #7b68ee, #8d7aff);
      }
      
      .history-bar.medium {
        background: linear-gradient(to top, #a368ed, #7b68ee);
      }
      
      .history-bar.high {
        background: linear-gradient(to top, #ff7eb3, #a368ed);
      }
      
      .history-bar.peak {
        background: linear-gradient(to top, #ff5c8d, #ff7eb3);
        box-shadow: 0 0 12px rgba(255, 92, 141, 0.4);
      }
      
      /* Dark theme support */
      .dark-theme .history-container {
        background: linear-gradient(to bottom, rgba(40,40,50,0.4), rgba(60,50,80,0.2));
      }
      
      /* Warm up animation for bars */
      @keyframes warm-up {
        0% { height: 0%; }
        50% { height: 30%; }
        75% { height: 15%; }
        100% { height: 20%; }
      }
      
      .history-bar.warm-up {
        animation: warm-up 0.6s ease-out forwards;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Allow setting callback when user clicks on visualizer to stop recording
  setStopRecordingCallback(callback) {
    this.onStopRecording = callback;
  }
  
  async start() {
    if (this.recording) return;
    
    try {
      // Initialize visualizer
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);
      this.analyser.fftSize = 256;
      this.recording = true;
      
      // Show visualizer with fade-in
      this.visualizerWrapper.style.opacity = '1';
      
      // Initialize history with zeros
      this.history = Array(this.historyLength).fill(0);
      
      // Create initial bars with warm-up animation
      this.updateBars(true);
      
      // Start animation
      this.updateVisualizer();
      
      // Start recording timer
      this.recordingStartTime = Date.now();
      this.updateTimer();
      this.timerInterval = setInterval(() => this.updateTimer(), 1000);
      
      return true;
    } catch (error) {
      console.error('Error accessing microphone for visualizer:', error);
      this.recording = false;
      return false;
    }
  }
  
  stop() {
    if (!this.recording) return;
    
    this.recording = false;
    
    // Fade out visualizer
    this.visualizerWrapper.style.opacity = '0';
    
    // Stop animation
    cancelAnimationFrame(this.animationFrameId);
    
    // Stop timer
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    
    // Reset audio data
    this.audioLevel = 0;
    this.history = [];
    
    // Remove all bars after fade completes
    setTimeout(() => {
      while (this.visualizerElement.firstChild) {
        this.visualizerElement.removeChild(this.visualizerElement.firstChild);
      }
      
      // Close audio context and stop stream
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
        this.analyser = null;
      }
      
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
    }, 400); // Match fade-out transition time
  }
  
  updateTimer() {
    if (!this.recording || !this.recordingStartTime) return;
    
    const elapsedMs = Date.now() - this.recordingStartTime;
    const seconds = Math.floor(elapsedMs / 1000);
    
    // Get the existing status text element
    const statusElement = this.statusElement;
    if (!statusElement) return;
    
    // Update the status indicator text to include seconds
    const statusText = statusElement.querySelector('.status-text');
    if (statusText) {
      // Format the recording status with timer
      statusText.textContent = `Recording... ${seconds}s`;
      
      // Highlight timer in red when approaching max recording time (30s)
      if (seconds > 25) { // 25 seconds
        statusText.innerHTML = `Recording... <span style="color: #ff5c8d; font-weight: bold">${seconds}s</span>`;
      }
    }
  }
  
  updateVisualizer() {
    if (!this.recording || !this.analyser) return;
    
    // Skip frames to slow down the animation
    if (this.frameSkipCounter < this.frameSkipRate) {
      this.frameSkipCounter++;
      this.animationFrameId = requestAnimationFrame(this.updateVisualizer.bind(this));
      return;
    }
    this.frameSkipCounter = 0;
    
    const bufferLength = this.analyser.frequencyBinCount;
    this.audioDataArray = new Float32Array(bufferLength);
    this.analyser.getFloatFrequencyData(this.audioDataArray);
    
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += this.audioDataArray[i];
    }
    
    let linearLevel = Math.max(0, sum / bufferLength + this.offset);
    let nonLinearLevel = Math.pow(linearLevel, this.exponent);
    this.audioLevel = Math.max(
      0,
      Math.min(100, nonLinearLevel * (100 / Math.pow(this.scalingFactor, this.exponent)))
    );
    
    // Update history - add new level to the start, remove oldest if history is too long
    this.history = [this.audioLevel, ...this.history];
    if (this.history.length > this.historyLength) {
      this.history.pop();
    }
    
    // Update the bars
    this.updateBars();
    
    this.animationFrameId = requestAnimationFrame(this.updateVisualizer.bind(this));
  }
  
  updateBars(warmUp = false) {
    // Clear existing bars
    while (this.visualizerElement.firstChild) {
      this.visualizerElement.removeChild(this.visualizerElement.firstChild);
    }
    
    // Create new bars
    this.history.forEach((level, index) => {
      const bar = document.createElement('div');
      
      // Apply warm-up animation to new bars if requested
      if (warmUp) {
        bar.className = 'history-bar warm-up';
      } else {
        bar.className = 'history-bar';
        
        // Assign color class based on level
        if (level < 25) {
          bar.classList.add('low');
        } else if (level < 50) {
          bar.classList.add('medium');
        } else if (level < 75) {
          bar.classList.add('high');
        } else {
          bar.classList.add('peak');
        }
      }
      
      bar.style.height = warmUp ? '0%' : `${level}%`;
      bar.style.width = `${100 / this.historyLength}%`;
      bar.style.left = `${index * (100 / this.historyLength)}%`;
      
      this.visualizerElement.appendChild(bar);
    });
  }
}

// Export for use in popup.js
window.AudioVisualizer = AudioVisualizer;