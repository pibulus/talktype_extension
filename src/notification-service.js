/**
 * Notification Service for TalkType Extension
 * 
 * A lightweight, standalone service that handles the creation, display,
 * and management of user notifications in the TalkType extension.
 * 
 * This module provides two main types of notifications:
 * 1. Status notifications - Simple messages with different visual states (success, error, etc.)
 * 2. Progress notifications - Visual indicators for ongoing operations with percentage updates
 * 
 * All notifications use a consistent glass-morphism UI style and provide
 * appropriate visual feedback based on their state.
 * 
 * @module notification-service
 */

const notificationService = {
  /**
   * Show a status notification with enhanced visual appeal
   * @param {string} message - The message to display in the notification
   * @param {string} type - The type of notification ('info', 'error', 'success', 'warning', etc.)
   * @returns {Element} The notification element
   */
  showStatusNotification(message, type = 'info') {
    console.log(`TalkType: Showing notification - ${message} (${type})`);
    
    // Don't show notifications if they were recently disabled
    if (window.audioToTextNotificationsDisabled) {
      return;
    }
    
    // Remove ALL existing notifications to avoid duplicates
    const existingNotifications = document.querySelectorAll(`.audio-to-text-notification`);
    existingNotifications.forEach(notification => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    });
    
    // Create notification element with enhanced glass morphism style
    const notification = document.createElement('div');
    notification.className = `audio-to-text-notification audio-to-text-notification-${type}`;
    notification.style.position = 'fixed';
    notification.style.top = '20px';  // Changed from bottom to top
    notification.style.right = '20px';
    notification.style.padding = '16px 20px';
    notification.style.borderRadius = '16px';
    notification.style.boxShadow = '0 10px 40px rgba(31, 38, 135, 0.3)';
    notification.style.zIndex = '99999'; // Very high z-index to ensure visibility
    
    // Apply backdrop-filter for glass effect when supported
    notification.style.backdropFilter = 'blur(12px)';
    notification.style.WebkitBackdropFilter = 'blur(12px)';
    
    // Set theme-specific styles based on notification type
    switch (type) {
      case 'error':
        notification.style.background = 'rgba(221, 55, 55, 0.85)';
        notification.style.boxShadow = '0 10px 30px rgba(221, 55, 55, 0.3), 0 0 10px rgba(221, 55, 55, 0.2) inset';
        notification.style.color = 'white';
        notification.style.borderLeft = '4px solid #ff2020';
        break;
      case 'success':
        notification.style.background = 'rgba(46, 182, 125, 0.85)';
        notification.style.boxShadow = '0 10px 30px rgba(46, 182, 125, 0.3), 0 0 10px rgba(46, 182, 125, 0.2) inset';
        notification.style.color = 'white';
        notification.style.borderLeft = '4px solid #0cd466';
        break;
      case 'warning':
        notification.style.background = 'rgba(255, 171, 25, 0.85)';
        notification.style.boxShadow = '0 10px 30px rgba(255, 171, 25, 0.3), 0 0 10px rgba(255, 171, 25, 0.2) inset';
        notification.style.color = 'white';
        notification.style.borderLeft = '4px solid #ff9500';
        break;
      case 'recording':
        notification.style.background = 'linear-gradient(135deg, rgba(111, 66, 193, 0.9), rgba(247, 70, 180, 0.8))';
        notification.style.boxShadow = '0 10px 40px rgba(111, 66, 193, 0.4), 0 0 15px rgba(111, 66, 193, 0.2) inset';
        notification.style.color = 'white';
        notification.style.borderLeft = '4px solid #f746b4';
        break;
      case 'processing':
        notification.style.background = 'linear-gradient(135deg, rgba(52, 152, 219, 0.85), rgba(142, 68, 173, 0.85))';
        notification.style.boxShadow = '0 10px 40px rgba(52, 152, 219, 0.4), 0 0 15px rgba(52, 152, 219, 0.2) inset';
        notification.style.color = 'white';
        notification.style.borderLeft = '4px solid #8e44ad';
        break;
      default: // info
        notification.style.background = 'linear-gradient(135deg, rgba(111, 66, 193, 0.85), rgba(70, 174, 247, 0.75))';
        notification.style.boxShadow = '0 10px 40px rgba(111, 66, 193, 0.3), 0 0 10px rgba(111, 66, 193, 0.2) inset';
        notification.style.color = 'white';
        notification.style.borderLeft = '4px solid #6f42c1';
        break;
    }
    
    // Style common elements
    notification.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    notification.style.fontSize = '14px';
    notification.style.lineHeight = '1.5';
    notification.style.textAlign = 'left';
    notification.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
    notification.style.cursor = 'default';
    notification.style.userSelect = 'none';
    notification.style.maxWidth = '320px';
    notification.style.overflow = 'hidden';
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(-20px)';
    
    // Create status indicator
    const statusCircle = document.createElement('div');
    statusCircle.style.display = 'inline-block';
    statusCircle.style.width = '12px';
    statusCircle.style.height = '12px';
    statusCircle.style.borderRadius = '50%';
    statusCircle.style.marginRight = '10px';
    statusCircle.style.verticalAlign = 'middle';
    
    // Set status circle color and pulsing animation based on type
    switch (type) {
      case 'error':
        statusCircle.style.backgroundColor = '#ff3b30';
        break;
      case 'success':
        statusCircle.style.backgroundColor = '#34c759';
        break;
      case 'warning':
        statusCircle.style.backgroundColor = '#ff9500';
        break;
      case 'recording':
        statusCircle.style.backgroundColor = '#f746b4';
        statusCircle.style.animation = 'pulse 1s infinite';
        break;
      case 'processing':
        statusCircle.style.backgroundColor = '#8e44ad';
        statusCircle.style.animation = 'pulse 1.5s infinite';
        break;
      default: // info
        statusCircle.style.backgroundColor = '#6f42c1';
        break;
    }
    
    // Create animation styles if they don't exist
    if (!document.getElementById('audio-to-text-notification-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'audio-to-text-notification-styles';
      styleEl.textContent = `
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
      `;
      document.head.appendChild(styleEl);
    }
    
    // Inner content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.style.display = 'flex';
    contentWrapper.style.alignItems = 'center';
    
    // Add status indicator and message
    contentWrapper.appendChild(statusCircle);
    contentWrapper.innerHTML += message;
    notification.appendChild(contentWrapper);
    
    // Create close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '8px';
    closeButton.style.right = '10px';
    closeButton.style.background = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.color = 'rgba(255, 255, 255, 0.8)';
    closeButton.style.fontSize = '18px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0';
    closeButton.style.lineHeight = '1';
    closeButton.style.transition = 'color 0.2s';
    
    // Hover effect for close button
    closeButton.onmouseenter = () => {
      closeButton.style.color = 'rgba(255, 255, 255, 1)';
    };
    closeButton.onmouseleave = () => {
      closeButton.style.color = 'rgba(255, 255, 255, 0.8)';
    };
    
    // Close on button click
    closeButton.onclick = () => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    };
    
    notification.appendChild(closeButton);
    
    // Hide notification after delay (except for error and recording)
    if (type !== 'error' && type !== 'recording') {
      setTimeout(() => {
        if (document.body.contains(notification)) {
          notification.style.opacity = '0';
          notification.style.transform = 'translateY(-20px)';
          setTimeout(() => {
            if (document.body.contains(notification)) {
              document.body.removeChild(notification);
            }
          }, 300);
        }
      }, 4000); // Display for 4 seconds
    }
    
    // Add to DOM and animate in
    document.body.appendChild(notification);
    
    // Force reflow to ensure animation works
    notification.offsetHeight;
    
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
    
    return notification;
  },

  /**
   * Create a stylish progress notification
   * @param {string} message - The message to display in the notification
   * @returns {Element} The notification element
   */
  createProgressNotification(message) {
    // Remove any existing notifications first
    document.querySelectorAll('.audio-to-text-notification, .audio-to-text-progress-notification').forEach(notification => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    });
    
    // Create progress notification styles if they don't exist
    if (!document.getElementById('progress-notification-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'progress-notification-styles';
      styleEl.textContent = `
        .audio-to-text-progress-notification {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 15px 20px;
          border-radius: 16px;
          font-size: 14px;
          font-weight: 500;
          color: white;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background: linear-gradient(135deg, rgba(111, 66, 193, 0.85), rgba(70, 174, 247, 0.75));
          box-shadow: 0 10px 40px rgba(111, 66, 193, 0.3);
          border-left: 4px solid #6f42c1;
          z-index: 99999;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          line-height: 1.5;
          width: 280px;
          overflow: hidden;
          opacity: 0;
          transform: translateY(-20px);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        
        .progress-container {
          margin-top: 10px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          height: 10px;
          overflow: hidden;
          position: relative;
        }
        
        .progress-bar {
          height: 100%;
          width: 0%;
          background: linear-gradient(135deg, rgba(111, 66, 193, 0.9), rgba(247, 70, 180, 0.8), rgba(255, 152, 0, 0.85));
          background-size: 200% 100%;
          animation: gradientBg 2s ease infinite;
          border-radius: 8px;
          transition: width 0.5s ease;
        }
        
        @keyframes gradientBg {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        
        .progress-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 6px;
          font-size: 12px;
          opacity: 0.8;
        }
      `;
      document.head.appendChild(styleEl);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'audio-to-text-progress-notification';
    
    // Message
    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    messageEl.style.marginBottom = '6px';
    messageEl.style.display = 'flex';
    messageEl.style.alignItems = 'center';
    notification.appendChild(messageEl);
    
    // Status circle
    const statusCircle = document.createElement('div');
    statusCircle.style.display = 'inline-block';
    statusCircle.style.width = '12px';
    statusCircle.style.height = '12px';
    statusCircle.style.borderRadius = '50%';
    statusCircle.style.marginRight = '10px';
    statusCircle.style.backgroundColor = '#6f42c1';
    statusCircle.style.animation = 'pulse 1.5s infinite';
    messageEl.prepend(statusCircle);
    
    // Create animation styles if they don't exist
    if (!document.getElementById('audio-to-text-notification-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'audio-to-text-notification-styles';
      styleEl.textContent = `
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
      `;
      document.head.appendChild(styleEl);
    }
    
    // Progress container
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    notification.appendChild(progressContainer);
    
    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressContainer.appendChild(progressBar);
    
    // Progress labels
    const progressLabels = document.createElement('div');
    progressLabels.className = 'progress-labels';
    
    // Status text
    const statusText = document.createElement('div');
    statusText.className = 'progress-status-text';
    statusText.textContent = 'Starting...';
    progressLabels.appendChild(statusText);
    
    // Percentage
    const percentageText = document.createElement('div');
    percentageText.className = 'progress-percentage';
    percentageText.textContent = '0%';
    progressLabels.appendChild(percentageText);
    
    notification.appendChild(progressLabels);
    
    // Close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '10px';
    closeButton.style.right = '10px';
    closeButton.style.background = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.color = 'rgba(255, 255, 255, 0.8)';
    closeButton.style.fontSize = '18px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0';
    closeButton.style.lineHeight = '1';
    closeButton.style.transition = 'color 0.2s';
    
    // Hover effect for close button
    closeButton.onmouseenter = () => {
      closeButton.style.color = 'rgba(255, 255, 255, 1)';
    };
    closeButton.onmouseleave = () => {
      closeButton.style.color = 'rgba(255, 255, 255, 0.8)';
    };
    
    // Close on button click
    closeButton.onclick = () => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    };
    
    notification.appendChild(closeButton);
    
    // Add to DOM and animate in
    document.body.appendChild(notification);
    
    // Force reflow to ensure animation works
    notification.offsetHeight;
    
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
    
    return notification;
  },

  /**
   * Update a progress notification with a new percentage
   * @param {Element} notification - The notification element to update
   * @param {number} percentage - The percentage to update the notification with (0-100)
   */
  updateProgressNotification(notification, percentage) {
    if (!notification || !document.body.contains(notification)) return;
    
    // Get progress elements
    const progressBar = notification.querySelector('.progress-bar');
    const progressPercentage = notification.querySelector('.progress-percentage');
    const progressStatus = notification.querySelector('.progress-status-text');
    
    // Ensure percentage is valid
    const validPercentage = Math.max(0, Math.min(100, percentage));
    
    // Update progress bar width
    if (progressBar) {
      progressBar.style.width = `${validPercentage}%`;
    }
    
    // Update percentage text
    if (progressPercentage) {
      progressPercentage.textContent = `${Math.round(validPercentage)}%`;
    }
    
    // Update status text based on progress
    if (progressStatus) {
      if (validPercentage === 0) {
        progressStatus.textContent = 'Starting...';
      } else if (validPercentage < 25) {
        progressStatus.textContent = 'Processing...';
      } else if (validPercentage < 50) {
        progressStatus.textContent = 'Converting...';
      } else if (validPercentage < 75) {
        progressStatus.textContent = 'Analyzing...';
      } else if (validPercentage < 100) {
        progressStatus.textContent = 'Finalizing...';
      } else {
        progressStatus.textContent = 'Complete!';
      }
    }
    
    // Cancel indeterminate animation if exists
    if (notification._indeterminateInterval) {
      clearInterval(notification._indeterminateInterval);
      notification._indeterminateInterval = null;
    }
  },

  /**
   * Animate a progress notification with an indeterminate progress animation
   * @param {Element} notification - The notification element to animate
   */
  animateIndeterminateProgress(notification) {
    if (!notification) return;
    
    notification._indeterminateInterval = setInterval(() => {
      const progressBar = notification.querySelector('.progress-bar');
      if (progressBar) {
        const currentWidth = parseFloat(progressBar.style.width || '0');
        
        // Create a "bouncing" effect between 10% and 30%
        if (currentWidth >= 30) {
          progressBar.style.width = '10%';
        } else {
          progressBar.style.width = `${currentWidth + 5}%`;
        }
      }
    }, 200);
  },

  /**
   * Stop the indeterminate progress animation on a notification
   * @param {Element} notification - The notification element to stop animating
   */
  stopIndeterminateProgress(notification) {
    if (notification && notification._indeterminateInterval) {
      clearInterval(notification._indeterminateInterval);
      notification._indeterminateInterval = null;
    }
  },

  /**
   * Show a clipboard notification (optimized for popup view)
   * @param {string} message - The message to display
   */
  showClipboardNotification(message = 'Copied to clipboard') {
    // Remove any existing notification first
    const existingNotification = document.querySelector('.clipboard-notification');
    if (existingNotification) {
      document.body.removeChild(existingNotification);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'clipboard-notification';
    notification.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; margin-right: 8px;">
        <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
      </svg>
      <span>${message}</span>
    `;
    
    // Add styles if not already added
    if (!document.getElementById('clipboard-notification-style')) {
      const style = document.createElement('style');
      style.id = 'clipboard-notification-style';
      style.textContent = `
        .clipboard-notification {
          position: fixed;
          bottom: 10px !important;
          top: auto !important;
          left: 50%;
          transform: translateX(-50%) translateY(40px);
          background: rgba(75, 203, 156, 0.95);
          color: white;
          padding: 10px 18px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          z-index: 1000;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          width: 90%;
        }
        .clipboard-notification.show {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // Animate out and remove
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 2000);
    
    return notification;
  },
  
  /**
   * Show status notification with custom position (for popup)
   * @param {string} message - The message to display
   * @param {string} type - Notification type
   * @param {Object} options - Additional options
   * @returns {Element} The notification element
   */
  showPopupNotification(message, type = 'info', options = {}) {
    // Default options
    const defaultOptions = {
      position: 'bottom', // 'top', 'bottom'
      duration: 3000,     // milliseconds
      width: '90%'        // Width of notification
    };
    
    // Merge options
    const finalOptions = {...defaultOptions, ...options};
    
    // Remove any existing notification
    const existingNotification = document.querySelector('.status-notification');
    if (existingNotification) {
      document.body.removeChild(existingNotification);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'status-notification';
    
    // Determine icon based on type
    let icon = '';
    let bgColor = '';
    
    switch(type) {
      case 'error':
        icon = '<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>';
        bgColor = 'rgba(255, 82, 82, 0.95)';
        break;
      case 'warning':
        icon = '<path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>';
        bgColor = 'rgba(255, 171, 25, 0.95)';
        break;
      case 'success':
        icon = '<path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>';
        bgColor = 'rgba(75, 203, 156, 0.95)';
        break;
      default: // info
        icon = '<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>';
        bgColor = 'rgba(70, 174, 247, 0.95)';
    }
    
    notification.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        ${icon}
      </svg>
      <span>${message}</span>
    `;
    
    // Add styles if not already added
    if (!document.getElementById('status-notification-style')) {
      const style = document.createElement('style');
      style.id = 'status-notification-style';
      style.textContent = `
        .status-notification {
          position: fixed;
          bottom: 10px !important;
          top: auto !important;
          left: 50%;
          transform: translateX(-50%) translateY(40px);
          background: ${bgColor};
          color: white;
          padding: 10px 18px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          z-index: 1000;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          width: ${finalOptions.width};
        }
        .status-notification.show {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        .status-notification .icon {
          width: 18px;
          height: 18px;
          margin-right: 8px;
        }
      `;
      document.head.appendChild(style);
    } else {
      // Update background color for the current notification
      document.getElementById('status-notification-style').textContent = 
        document.getElementById('status-notification-style').textContent.replace(
          /background:[^;]+;/, 
          `background: ${bgColor};`
        );
    }
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // Animate out and remove
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, finalOptions.duration);
    
    return notification;
  },
  
  /**
   * Show a copy notification
   * @param {string} message - Custom message or default
   * @returns {HTMLElement} - The notification element
   */
  showCopyNotification(message = 'Copied to clipboard') {
    // Create notification if it doesn't exist
    if (!document.getElementById('copy-notification')) {
      const notification = document.createElement('div');
      notification.id = 'copy-notification';
      notification.className = 'copy-notification';
      notification.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="currentColor"/>
        </svg>
        <span>${message}</span>
      `;
      document.body.appendChild(notification);
      
      // Add custom styles for notification
      const notifStyle = document.createElement('style');
      notifStyle.id = 'top-notification-style';
      notifStyle.textContent = `
        .copy-notification {
          position: fixed;
          bottom: 10px !important;
          top: auto !important;
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
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          width: 90%;
          justify-content: center;
        }
        
        .copy-notification.show {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      `;
      document.head.appendChild(notifStyle);
    } else {
      // Update message
      document.querySelector('#copy-notification span').textContent = message;
    }
    
    const notification = document.getElementById('copy-notification');
    
    // Show the notification
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
    
    // Hide after 2.5 seconds
    setTimeout(() => {
      notification.classList.remove('show');
    }, 2500);
    
    return notification;
  }
};

// Expose the service as a global variable like other services
window.NotificationService = notificationService;