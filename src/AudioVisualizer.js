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
    this.historyLength = 30; // Moderate number of bars for balanced flow speed
    this.analyser = null;
    this.audioContext = null;
    this.recording = false;
    this.stream = null;
    this.recordingStartTime = null;
    this.timerInterval = null;
    this.statusElement = document.getElementById('status');
    this.prevLevels = []; // Store previous levels for smoothing
    this.updateFrequency = 3; // Update every 3 frames for slower, more gentle movement
    this.frameCount = 0;
    
    // Determine device and set scaling factors
    const userAgent = navigator.userAgent;
    this.isAndroid = /Android/i.test(userAgent);
    this.isiPhone = /iPhone|iPad/i.test(userAgent);
    this.isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
    this.isMac = /Macintosh/i.test(userAgent);
    
    // Determine if we should use the fallback visualizer for Safari/iOS
    this.useFallback = this.isiPhone || this.isSafari;
    
    // Set scaling factors - increased sensitivity
    if (this.isAndroid) {
      this.scalingFactor = 42; // Even more sensitive (reduced from 48)
      this.offset = 70;
      this.exponent = 0.43; // Slightly reduced for higher sensitivity
    } else if (this.isiPhone) {
      this.scalingFactor = 42; // More sensitive (reduced from 48)
      this.offset = 72;
      this.exponent = 0.23; // Slightly reduced for higher sensitivity
    } else if (this.isMac) {
      this.scalingFactor = 28; // Even more sensitive (reduced from 32)
      this.offset = 85;
      this.exponent = 0.43; // Slightly reduced for higher sensitivity
    } else {
      this.scalingFactor = 2500; // Even more sensitive (reduced from 2800)
      this.offset = 72;
      this.exponent = 0.43; // Slightly reduced for higher sensitivity
    }
    
    // Cap for max level percentage
    this.maxLevelCap = 95; // Allow higher peaks for more expression
    
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
      transition: opacity 0.4s ease-out;
      pointer-events: auto; /* Allow interaction only during recording */
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
    
    // Add styles for bars with enhanced flow
    const style = document.createElement('style');
    style.textContent = `
      .history-bar {
        position: absolute;
        bottom: 0;
        background: linear-gradient(
          to top,
          #ff7eb3,
          #b368ed 50%,
          #7b68ee
        );
        transition: height 0.45s cubic-bezier(0.25, 0.1, 0.25, 1); /* Smoother transition for more fluid animation */
        border-radius: 4px 4px 0 0;
        margin-right: 0;
        filter: blur(0.8px); /* Slight blur for smoother appearance */
        opacity: 0.9;
      }
      
      /* Wavy animation for bars with different phases */
      @keyframes wave-1 {
        0%, 100% { transform: translateY(0); }
        30% { transform: translateY(-2.5px); }
        70% { transform: translateY(2.5px); }
      }
      
      @keyframes wave-2 {
        0%, 100% { transform: translateY(1.2px); }
        50% { transform: translateY(-1.8px); }
      }
      
      @keyframes wave-3 {
        0%, 100% { transform: translateY(0); }
        40% { transform: translateY(-2px); }
        75% { transform: translateY(2px); }
      }
      
      @keyframes wave-4 {
        0%, 100% { transform: translateY(-0.5px); }
        35% { transform: translateY(1.5px); }
        65% { transform: translateY(-1px); }
      }
      
      /* Slower wave animations for more gentle flow */
      .history-bar.wave-1 {
        animation: wave-1 6.5s infinite ease-in-out; /* Slowed down even more */
      }
      
      .history-bar.wave-2 {
        animation: wave-2 7.8s infinite ease-in-out; /* Slowed down even more */
      }
      
      .history-bar.wave-3 {
        animation: wave-3 7.2s infinite ease-in-out; /* Slowed down even more */
      }
      
      .history-bar.wave-4 {
        animation: wave-4 5.9s infinite ease-in-out; /* Slowed down even more */
      }
      
      /* Dark theme support */
      .dark-theme .history-container {
        background: linear-gradient(to bottom, rgba(40,40,50,0.4), rgba(60,50,80,0.2));
      }
      
      /* Flowing initial animation */
      @keyframes flow-up {
        0% { height: 0%; opacity: 0.7; }
        40% { height: 20%; opacity: 0.85; }
        70% { height: 18%; opacity: 0.95; }
        100% { height: 22%; opacity: 1; }
      }
      
      .history-bar.flow-up {
        animation: flow-up 1.7s ease-out forwards; /* Balanced initial animation speed */
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
      // For both real and fallback visualizer, we need microphone permission
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recording = true;
      
      // Reset display properties
      this.visualizerWrapper.style.display = 'flex';
      this.visualizerWrapper.style.zIndex = '5';
      this.visualizerWrapper.style.pointerEvents = 'auto';
      
      // Show visualizer with fade-in
      this.visualizerWrapper.style.opacity = '1';
      
      // Initialize history and previous levels for smooth animation
      const initialLevel = 18;
      this.history = Array(this.historyLength).fill(initialLevel);
      this.prevLevels = Array(10).fill(initialLevel);
      
      // Initialize audio analyzer if not using fallback
      if (!this.useFallback) {
        // Standard WebAudio API for compatible browsers
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.7; // Balanced smoothing
        
        const source = this.audioContext.createMediaStreamSource(this.stream);
        source.connect(this.analyser);
        
        // Start standard animation
        this.updateVisualizer();
      } else {
        // Safari/iOS fallback - use simulated visualizer
        console.log('Using fallback visualizer for Safari/iOS');
        
        // Set up fallback data
        this.fallbackBaseLevel = 15;
        this.fallbackRange = 30;
        this.fallbackVariation = 10;
        this.fallbackSmoothing = 0.6;
        this.fallbackLastValue = this.fallbackBaseLevel;
        
        // Start fallback animation
        this.fallbackInterval = setInterval(() => this.updateFallbackVisualizer(), 100);
      }
      
      // Create initial bars with flowing animation
      this.updateBars(true);
      
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
    
    // Immediately disable pointer events to prevent interaction conflicts
    this.visualizerWrapper.style.pointerEvents = 'none';
    
    // Stop appropriate animation type
    if (!this.useFallback) {
      // Stop standard WebAudio visualizer
      cancelAnimationFrame(this.animationFrameId);
    } else {
      // The interval will detect this.recording = false and fade out naturally
      // We don't immediately clear the interval to allow for fade out animation
    }
    
    // Stop timer
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    
    // Reset audio data
    this.audioLevel = 0;
    this.prevLevels = [];
    
    // Remove all bars after fade completes
    setTimeout(() => {
      while (this.visualizerElement.firstChild) {
        this.visualizerElement.removeChild(this.visualizerElement.firstChild);
      }
      
      // Ensure the wrapper is completely hidden and non-interactive
      this.visualizerWrapper.style.display = 'none';
      this.visualizerWrapper.style.zIndex = '-1';
      
      // Clear fallback interval if it exists
      if (this.fallbackInterval) {
        clearInterval(this.fallbackInterval);
        this.fallbackInterval = null;
      }
      
      // Reset history array
      this.history = [];
      
      // Close audio context and stop stream for standard visualizer
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
        this.analyser = null;
      }
      
      // Always stop the audio stream
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
  
  // Standard WebAudio API visualizer implementation
  updateVisualizer() {
    if (!this.recording || !this.analyser) return;
    
    // Increment frame counter
    this.frameCount++;
    
    // Only update every few frames to moderate the movement
    // Faster than before, but still keeps some smoothness
    if (this.frameCount % Math.max(1, this.updateFrequency - 1) !== 0) { // Reduced from 2 to 1 for more updates
      this.animationFrameId = requestAnimationFrame(this.updateVisualizer.bind(this));
      return;
    }
    
    const bufferLength = this.analyser.frequencyBinCount;
    this.audioDataArray = new Float32Array(bufferLength);
    this.analyser.getFloatFrequencyData(this.audioDataArray);
    
    // Process audio data with focus on speech frequencies
    let sum = 0;
    let totalWeight = 0;
    
    // Process frequencies with a focus on speech range
    const usableBufferLength = Math.floor(bufferLength * 0.65); // Use more frequencies for better response
    
    for (let i = 0; i < usableBufferLength; i++) {
      // Apply weighting to emphasize speech frequencies with broader range
      const weight = Math.exp(-0.45 * Math.pow((i - usableBufferLength/4) / (usableBufferLength/3), 2)); // Less aggressive curve
      
      // Even less damping on higher frequencies for better reactivity to all sounds
      const frequencyDamping = i < usableBufferLength/2 ? 1 : 0.9; // Higher value = more sensitivity
      
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
    
    // Apply minimal smoothing for an even more flowing effect with better reactivity 
    const smoothed = this.prevLevels.reduce((sum, level, i, arr) => {
      const weight = (arr.length - i) / (arr.length * 1.05); // Even less smoothing for more reactivity
      return sum + (level * weight);
    }, 0) / this.prevLevels.reduce((sum, _, i, arr) => sum + ((arr.length - i) / (arr.length * 1.05)), 0);
    
    // Apply increased dampening for smoother, more fluid movement
    const dampeningFactor = 0.65; // Higher dampening = smoother, less reactive response
    this.audioLevel = this.audioLevel * (1 - dampeningFactor) + smoothed * dampeningFactor;
    
    // Add enhanced random variation to some values for a more natural, flowing look
    if (Math.random() < 0.15) { // 15% chance (increased from 10%)
      this.audioLevel += (Math.random() * 2.5 - 1.2); // Slightly larger variation for more organic movement
    }
    
    // Update history with new level
    this.history = [this.audioLevel, ...this.history];
    if (this.history.length > this.historyLength) {
      this.history = this.history.slice(0, this.historyLength);
    }
    
    // Update the bars
    this.updateBars();
    
    this.animationFrameId = requestAnimationFrame(this.updateVisualizer.bind(this));
  }
  
  // Safari/iOS fallback visualizer implementation
  updateFallbackVisualizer() {
    if (!this.recording) {
      // If we're not recording, fade out the bars gradually
      if (this.history.some(level => level > 2)) {
        this.history = this.history.map(level => level * 0.9);
        this.updateBars();
      } else {
        clearInterval(this.fallbackInterval);
      }
      return;
    }
    
    // Generate smoother speech-like pattern with more gentle peaks
    // Simulate the waveform of natural speech
    
    // Calculate trend (whether we're going up or down in volume)
    const trendDirection = Math.random() > 0.5 ? 1 : -1;
    const trendMagnitude = Math.random() * this.fallbackVariation;
    
    // Calculate smoother random component for natural variations
    const randomComponent = (Math.random() * 2 - 1) * this.fallbackVariation * 0.3; // Reduced randomness for smoothness
    
    // Apply increased smoothing to previous value for more fluid continuity
    let newLevel = this.fallbackLastValue * (this.fallbackSmoothing + 0.1) + // Increased smoothing
                  (1 - (this.fallbackSmoothing + 0.1)) * (
                    this.fallbackBaseLevel + 
                    trendDirection * trendMagnitude + 
                    randomComponent
                  );
    
    // Occasionally add gentler speech "peaks" to simulate speech patterns
    if (Math.random() < 0.1) { // 10% chance of a peak (reduced from 12%)
      newLevel += Math.random() * this.fallbackRange * 0.5; // Reduced peak heights for smoother appearance
    }
    
    // Ensure we stay within reasonable visualization bounds
    newLevel = Math.max(5, Math.min(this.maxLevelCap, newLevel));
    
    // Save for next iteration
    this.fallbackLastValue = newLevel;
    
    // Add to history and limit length
    this.history = [newLevel, ...this.history];
    if (this.history.length > this.historyLength) {
      this.history = this.history.slice(0, this.historyLength);
    }
    
    // Update the visualization
    this.updateBars();
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
        
        // Give each bar a wave animation based on its position
        // This creates a more natural flowing effect with different phases
        // Using 4 different wave patterns for more organic movement
        if (index % 4 === 0) {
          bar.classList.add('wave-1');
        } else if (index % 4 === 1) {
          bar.classList.add('wave-2');
        } else if (index % 4 === 2) {
          bar.classList.add('wave-3');
        } else {
          bar.classList.add('wave-4');
        }
      }
      
      // Wider bars for smoother appearance
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