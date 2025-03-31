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
    this.historyLength = 40; // More bars for smoother appearance
    this.analyser = null;
    this.audioContext = null;
    this.recording = false;
    this.stream = null;
    this.recordingStartTime = null;
    this.timerInterval = null;
    this.statusElement = document.getElementById('status');
    this.prevLevels = []; // Store previous levels for smoothing
    
    // Determine device and set scaling factors
    const userAgent = navigator.userAgent;
    this.isAndroid = /Android/i.test(userAgent);
    this.isiPhone = /iPhone/i.test(userAgent);
    this.isMac = /Macintosh/i.test(userAgent);
    
    // Set scaling factors - MEDIUM SENSITIVITY (between original and last version)
    if (this.isAndroid) {
      this.scalingFactor = 55; // Medium sensitivity
      this.offset = 70;
      this.exponent = 0.5;
    } else if (this.isiPhone) {
      this.scalingFactor = 55;
      this.offset = 70;
      this.exponent = 0.25;
    } else if (this.isMac) {
      this.scalingFactor = 40; // Medium sensitivity
      this.offset = 85;
      this.exponent = 0.5;
    } else {
      this.scalingFactor = 3500; // Medium sensitivity
      this.offset = 70;
      this.exponent = 0.5;
    }
    
    // Cap for max level percentage to avoid constant peaking
    this.maxLevelCap = 90; // Allow slightly higher peaks
    
    this.frameSkipCounter = 0;
    this.frameSkipRate = 1; 
    this.smoothingFactor = 0.7;
    
    // Create containers
    this.createElements();
    
    // Preload resources for smoother initial animation
    this.preloadResources();
  }
  
  preloadResources() {
    // Create a hidden canvas to initialize WebGL/rendering contexts
    const preloadCanvas = document.createElement('canvas');
    preloadCanvas.width = 2;
    preloadCanvas.height = 2;
    preloadCanvas.style.position = 'absolute';
    preloadCanvas.style.opacity = '0';
    preloadCanvas.style.pointerEvents = 'none';
    document.body.appendChild(preloadCanvas);
    
    // Try to initialize 2D context to warm up rendering pipeline
    try {
      const ctx = preloadCanvas.getContext('2d');
      // Create a gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, 2);
      gradient.addColorStop(0, '#7b68ee');
      gradient.addColorStop(1, '#ff7eb3');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 2, 2);
    } catch (e) {
      console.log('Preloading canvas context failed, but this is fine');
    }
    
    // Remove after a short delay
    setTimeout(() => {
      if (document.body.contains(preloadCanvas)) {
        document.body.removeChild(preloadCanvas);
      }
    }, 1000);
    
    // Initialize history with calmer random values
    this.history = Array(this.historyLength).fill(0).map(() => Math.random() * 5 + 3);
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
      transition: opacity 0.3s ease-out;
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
    
    // Add styles for bars with smoother color flow
    const style = document.createElement('style');
    style.textContent = `
      .history-bar {
        position: absolute;
        bottom: 0;
        background: linear-gradient(
          to top,
          #ff7eb3,
          #a368ed 60%,
          #7b68ee
        );
        transition: height 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
        border-radius: 4px 4px 0 0;
        margin-right: 0;
        filter: blur(0.5px);
        opacity: 0.92;
      }
      
      /* Wavy animation for some bars */
      @keyframes slight-wave {
        0%, 100% { transform: translateY(0); }
        25% { transform: translateY(-1px); }
        75% { transform: translateY(1px); }
      }
      
      .history-bar.wavy {
        animation: slight-wave 2s infinite ease-in-out;
      }
      
      .history-bar.wavy-slow {
        animation: slight-wave 3.5s infinite ease-in-out;
      }
      
      /* Dark theme support */
      .dark-theme .history-container {
        background: linear-gradient(to bottom, rgba(40,40,50,0.4), rgba(60,50,80,0.2));
      }
      
      /* Flowing initial animation */
      @keyframes flow-up {
        0% { height: 0%; opacity: 0.7; }
        20% { height: 20%; opacity: 0.85; }
        40% { height: 15%; opacity: 0.9; }
        60% { height: 25%; opacity: 0.95; }
        80% { height: 18%; opacity: 0.97; }
        100% { height: 22%; opacity: 1; }
      }
      
      .history-bar.flow-up {
        animation: flow-up 1.2s ease-out forwards;
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
      
      // Create analyzer with optimized settings for smoother visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.75; // Slightly less smoothing
      
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);
      this.recording = true;
      
      // Show visualizer with fade-in
      this.visualizerWrapper.style.opacity = '1';
      
      // Initialize history and previous levels for smooth animation
      const initialLevel = 15; // Start with moderate level
      this.history = Array(this.historyLength).fill(initialLevel);
      this.prevLevels = Array(10).fill(initialLevel);
      
      // Create initial bars with flowing animation
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
    this.prevLevels = [];
    
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
    }, 300); // Match fade-out transition time
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
    
    // Process animation frame
    this.frameSkipCounter++;
    if (this.frameSkipCounter < this.frameSkipRate) {
      this.animationFrameId = requestAnimationFrame(this.updateVisualizer.bind(this));
      return;
    }
    this.frameSkipCounter = 0;
    
    const bufferLength = this.analyser.frequencyBinCount;
    this.audioDataArray = new Float32Array(bufferLength);
    this.analyser.getFloatFrequencyData(this.audioDataArray);
    
    // Process audio data with focus on speech frequencies
    let sum = 0;
    let totalWeight = 0;
    
    // Process frequencies with a focus on speech range
    const usableBufferLength = Math.floor(bufferLength * 0.6); // Use slightly more frequencies
    
    for (let i = 0; i < usableBufferLength; i++) {
      // Apply weighting to emphasize speech frequencies 
      const weight = Math.exp(-0.5 * Math.pow((i - usableBufferLength/4) / (usableBufferLength/3), 2));
      
      // Modest reduction for higher frequencies
      const frequencyDamping = i < usableBufferLength/2 ? 1 : 0.7; // Less aggressive damping
      
      sum += this.audioDataArray[i] * weight * frequencyDamping;
      totalWeight += weight * frequencyDamping;
    }
    
    let linearLevel = Math.max(0, sum / totalWeight + this.offset);
    let nonLinearLevel = Math.pow(linearLevel, this.exponent);
    let rawLevel = Math.max(
      0,
      Math.min(this.maxLevelCap, nonLinearLevel * (100 / Math.pow(this.scalingFactor, this.exponent)))
    );
    
    // Use previous levels for smoother transitions
    this.prevLevels.unshift(rawLevel);
    this.prevLevels = this.prevLevels.slice(0, 10);
    
    // Apply smoothing for a flowing effect
    const smoothed = this.prevLevels.reduce((sum, level, i, arr) => {
      const weight = (arr.length - i) / (arr.length * 1.2); // Smoother weighting
      return sum + (level * weight);
    }, 0) / this.prevLevels.reduce((sum, _, i, arr) => sum + ((arr.length - i) / (arr.length * 1.2)), 0);
    
    // Apply moderate dampening
    const dampeningFactor = 0.65; // Less dampening
    this.audioLevel = this.audioLevel * (1 - dampeningFactor) + smoothed * dampeningFactor;
    
    // Update history with new level and apply minimal organic variation
    this.history = [this.audioLevel, ...this.history];
    if (this.history.length > this.historyLength) {
      this.history = this.history.slice(0, this.historyLength);
    }
    
    // Update the bars
    this.updateBars();
    
    this.animationFrameId = requestAnimationFrame(this.updateVisualizer.bind(this));
  }
  
  updateBars(initialAnimation = false) {
    // Clear existing bars
    while (this.visualizerElement.firstChild) {
      this.visualizerElement.removeChild(this.visualizerElement.firstChild);
    }
    
    // Create new bars
    this.history.forEach((level, index) => {
      const bar = document.createElement('div');
      
      // Apply initial flowing animation if requested
      if (initialAnimation) {
        bar.className = 'history-bar flow-up';
      } else {
        bar.className = 'history-bar';
        
        // Add wavy animation to some bars for more fluid look
        // Every 5th bar gets a slow wave, every 8th gets a regular wave
        if (index % 8 === 0) {
          bar.classList.add('wavy');
        } else if (index % 5 === 0) {
          bar.classList.add('wavy-slow');
        }
      }
      
      // Adjust width for more bars
      const barWidth = 100 / this.historyLength;
      
      bar.style.height = initialAnimation ? '0%' : `${level}%`;
      bar.style.width = `${barWidth}%`;
      bar.style.left = `${index * barWidth}%`;
      
      this.visualizerElement.appendChild(bar);
    });
  }
}

// Export for use in popup.js
window.AudioVisualizer = AudioVisualizer;