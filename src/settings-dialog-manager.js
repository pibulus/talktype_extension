class SettingsDialogManager {
  constructor() {
    this.settingsPopup = null;
    this.apiKeyPopup = null;
    this.initialized = false;
  }

  initialize() {
    // Global initialization tracking
    if (window.settingsDialogInitialized || this.initialized) {
      console.log("TalkType: SettingsDialogManager already initialized");
      return;
    }

    // Add required CSS styles if not already added
    this.addRequiredStyles();
    this.initialized = true;
    window.settingsDialogInitialized = true;
  }

  addRequiredStyles() {
    // Add popup styles if not already added
    if (!document.getElementById('settings-popup-styles')) {
      const popupStyles = document.createElement('style');
      popupStyles.id = 'settings-popup-styles';
      popupStyles.textContent = `
        .settings-popup {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: settings-appear 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          padding: 16px;
          box-sizing: border-box;
        }
        
        @keyframes settings-appear {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        
        .settings-content {
          position: relative;
          width: 100%;
          padding: 25px 20px 20px;
          border-radius: 18px;
          text-align: center;
          background: linear-gradient(225deg, rgba(255, 255, 255, 0.9), rgba(240, 245, 255, 0.95));
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 2px solid var(--glass-border);
          box-shadow: 0 2px 20px rgba(0, 0, 0, 0.08);
          animation: content-appear 0.25s cubic-bezier(0.23, 1, 0.32, 1) forwards;
          transform: translateY(10px) scale(0.95);
          opacity: 0;
          max-width: 280px;
          margin: 0 auto;
          box-sizing: border-box;
          overflow: visible;
        }
        
        /* Add particle background to match main UI */
        .settings-content::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 18px;
          background-image: url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23bfcaff' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E");
          opacity: 0.3;
          z-index: 0;
          pointer-events: none;
        }
        
        /* Add beam effect to match main UI */
        .settings-content::before {
          content: '';
          position: absolute;
          width: 150%;
          height: 60px;
          background: linear-gradient(90deg, rgba(111, 66, 193, 0), rgba(255, 255, 255, 0.05), rgba(111, 66, 193, 0));
          transform: rotate(-45deg);
          top: -30px;
          left: -20%;
          animation: beam 12s linear infinite;
          z-index: 0;
          opacity: 0.5;
          border-radius: 18px;
          overflow: hidden;
        }
        
        @keyframes content-appear {
          0% { transform: translateY(10px) scale(0.95); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        
        .settings-content h3 {
          margin-top: 0;
          margin-bottom: 20px;
          color: var(--text-primary);
          font-size: 20px;
          font-weight: 600;
          position: relative;
          z-index: 2;
          letter-spacing: 0.3px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .settings-content h3::before {
          content: '';
          display: inline-block;
          width: 24px;
          height: 24px;
          background-image: url('icons/icon_black/favicon-32x32.png');
          background-size: contain;
          background-repeat: no-repeat;
          margin-right: 8px;
          filter: drop-shadow(0 1px 3px rgba(111, 66, 193, 0.3));
        }
        
        .dark-theme .settings-content h3::before {
          background-image: url('icons/icon_white/favicon-32x32.png');
        }
        
        .settings-button {
          display: flex;
          align-items: center;
          width: 100%;
          margin-bottom: 14px;
          text-align: left;
          padding: 12px 15px;
          background: var(--primary-gradient);
          color: white;
          border: 2px solid var(--glass-border);
          border-radius: 16px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          font-size: 14px;
          letter-spacing: 0.3px;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
          position: relative;
          overflow: hidden;
          z-index: 2;
        }
        
        .settings-button:hover {
          background: var(--hover-gradient);
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 8px 20px rgba(111, 66, 193, 0.18);
        }
        
        .settings-button:active {
          transform: translateY(1px) scale(0.98);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
        }
        
        .settings-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: all 0.6s ease;
        }
        
        .settings-button:hover::before {
          left: 100%;
        }
        
        .settings-close {
          position: absolute;
          top: 10px;
          right: 10px;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          font-size: 20px;
          cursor: pointer;
          color: var(--text-primary);
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all 0.2s ease;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 3;
        }
        
        .settings-close:hover {
          background: rgba(255, 255, 255, 0.35);
          transform: scale(1.1);
        }
        
        .settings-close:active {
          transform: scale(0.95);
        }
        
        /* API key input styling */
        #api-key-field {
          width: 100%;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.8);
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
          font-size: 14px;
          margin-bottom: 15px;
          transition: all 0.3s ease;
          box-sizing: border-box;
          height: 42px;
          max-width: 100%;
        }
        
        #api-key-field:focus {
          border-color: rgba(111, 66, 193, 0.6);
          box-shadow: inset 0 1px 3px rgba(111, 66, 193, 0.2), 0 0 0 2px rgba(111, 66, 193, 0.1);
          outline: none;
        }
        
        .save-button {
          width: 100%;
          padding: 10px 12px;
          background: linear-gradient(135deg, rgba(75, 203, 156, 0.85), rgba(70, 174, 247, 0.75));
          color: white;
          border: none;
          border-radius: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .save-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(75, 203, 156, 0.25);
        }
        
        .save-button:active {
          transform: translateY(1px) scale(0.98);
        }
        
        /* API key success notification */
        .api-key-success {
          position: absolute;
          bottom: -60px;
          left: 50%;
          width: 90%;
          max-width: 280px;
          transform: translateX(-50%) translateY(0);
          background: rgba(75, 203, 156, 0.95);
          color: white;
          padding: 12px;
          border-radius: 14px;
          text-align: center;
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
          z-index: 10;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }
        
        .api-key-success.show {
          transform: translateX(-50%) translateY(-15px);
          opacity: 1;
        }
        
        /* Dark mode support */
        .dark-theme .settings-content {
          background: linear-gradient(225deg, rgba(20, 20, 30, 0.95), rgba(30, 30, 40, 0.9));
          border-color: rgba(70, 70, 90, 0.3);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        
        .dark-theme .settings-content h3 {
          color: rgba(255, 255, 255, 0.9);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        
        .dark-theme #api-key-field {
          background: rgba(40, 40, 50, 0.8);
          color: white;
          border-color: rgba(70, 70, 90, 0.5);
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
        }
        
        .dark-theme #api-key-field:focus {
          border-color: rgba(111, 66, 193, 0.6);
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2), 0 0 0 2px rgba(111, 66, 193, 0.3);
        }
        
        .dark-theme .settings-close {
          background: rgba(0, 0, 0, 0.2);
          border-color: rgba(70, 70, 90, 0.3);
          color: rgba(255, 255, 255, 0.9);
        }
        
        .dark-theme .settings-close:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        
        .dark-theme p {
          color: rgba(255, 255, 255, 0.85);
        }
        
        /* Animation for beam in dark mode */
        .dark-theme .settings-content::before {
          background: linear-gradient(90deg, rgba(80, 50, 168, 0), rgba(100, 100, 255, 0.05), rgba(80, 50, 168, 0));
        }
        
        /* Enhance the subtle drift animation for the particle pattern */
        @keyframes subtle-drift {
          0% { background-position: 0 0; }
          100% { background-position: 100px 100px; }
        }
        
        .settings-content::after {
          animation: subtle-drift 120s linear infinite;
        }
        
        /* Enhanced beam animation */
        @keyframes beam {
          0% { transform: rotate(-45deg) translateX(-100%); }
          100% { transform: rotate(-45deg) translateX(200%); }
        }
        
        /* Theme toggle success message */
        .theme-success {
          position: fixed;
          bottom: 10px;
          left: 50%;
          transform: translateX(-50%) translateY(40px);
          background: rgba(111, 66, 193, 0.95);
          color: white;
          padding: 10px 18px;
          border-radius: 14px;
          font-size: 14px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
          z-index: 2000;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          width: 90%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .theme-success.show {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
        
        /* Add shake animation if not already added */
        @keyframes shake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-3px); }
          40%, 60% { transform: translateX(3px); }
        }
      `;
      document.head.appendChild(popupStyles);
    }
  }

  openSettings() {
    // Create and show settings popup
    this.settingsPopup = document.createElement('div');
    this.settingsPopup.className = 'settings-popup';
    
    // Determine current theme for accurate button labels
    const isDarkTheme = window.ThemeManager.isDarkMode();
    
    // Build the popup HTML
    this.settingsPopup.innerHTML = `
      <div class="settings-content">
        <h3>Settings</h3>
        <button id="configureApiKey" class="settings-button">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px; margin-right: 10px;">
            <path fill="currentColor" d="M22 11.5c0-1.65-1.35-3-3-3s-3 1.35-3 3c0 .75.28 1.43.75 1.95l-2.75 2.75c-.27-.17-.56-.31-.87-.39l-.51-3.56c.86-.33 1.38-1.18 1.38-2.12 0-1.32-1.04-2.38-2.38-2.38-1.33 0-2.37 1.06-2.37 2.38 0 .89.47 1.68 1.18 2.05l-.71 3.58c-.94.29-1.72.98-2.09 1.89L3.8 15.4c.02-.16.05-.32.05-.49 0-1.21-.99-2.2-2.2-2.2S-.55 13.7-.55 14.91s.99 2.2 2.2 2.2c.69 0 1.31-.33 1.71-.83l3.44 1.61c-.01.08-.03.15-.03.24 0 1.93 1.57 3.5 3.5 3.5s3.5-1.57 3.5-3.5c0-.31-.05-.6-.12-.89l2.7-2.7c.43.28.93.45 1.5.45 1.65.01 3-1.34 3-2.99zm-5.91 6.32c-.26.57-.85.97-1.53.97-.92 0-1.67-.75-1.67-1.67 0-.58.29-1.1.76-1.39.17-.11.37-.2.57-.25l.25-.04.21 1.04-1.06.21.5.87c-.02.03-.04.08-.04.12 0 .17.13.3.3.3s.3-.13.3-.3c0-.12-.06-.21-.16-.26zm.3-6.32c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5z"/>
          </svg>
          Configure API Key
        </button>
        <button id="toggleTheme" class="settings-button">
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px; margin-right: 10px;">
            ${isDarkTheme ? 
              `<path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5s5-2.24 5-5s-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0c-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0c-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0c.39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>` 
              : 
              `<path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9s9-4.03 9-9c0-.46-.04-.92-.1-1.36c-.98 1.37-2.58 2.26-4.4 2.26c-2.98 0-5.4-2.42-5.4-5.4c0-1.81.89-3.42 2.26-4.4c-.44-.06-.9-.1-1.36-.1z"/>`
            }
          </svg>
          Switch to ${isDarkTheme ? 'Light' : 'Dark'} Mode
        </button>
        <div class="theme-indicator" style="
          display: flex;
          justify-content: center;
          margin-top: 20px;
          font-size: 12px;
          color: var(--text-secondary);
          align-items: center;
          opacity: 0.8;
        ">
          <span style="position: relative; z-index: 2;">
            Current theme: <strong>${isDarkTheme ? 'Dark Mode' : 'Light Mode'}</strong>
          </span>
        </div>
        <button id="closeSettings" class="settings-close">&times;</button>
      </div>
    `;
    document.body.appendChild(this.settingsPopup);
    
    // Add event handlers for the popup buttons
    document.getElementById('closeSettings').addEventListener('click', () => {
      this.closeSettings();
    });
    
    document.getElementById('configureApiKey').addEventListener('click', () => {
      this.closeSettings();
      this.openApiKeyConfig();
    });
    
    document.getElementById('toggleTheme').addEventListener('click', () => {
      // Toggle theme using ThemeManager
      const newIsDark = window.ThemeManager.toggleTheme();
      
      // Update theme indicator
      const themeIndicator = document.querySelector('.theme-indicator span strong');
      if (themeIndicator) {
        themeIndicator.textContent = newIsDark ? 'Dark Mode' : 'Light Mode';
      }
      
      // Apply success styling to button
      const toggleButton = document.getElementById('toggleTheme');
      toggleButton.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px; margin-right: 10px;">
          <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
        </svg>
        ${newIsDark ? 'Dark' : 'Light'} Mode Applied
      `;
      toggleButton.style.background = 'linear-gradient(135deg, rgba(75, 203, 156, 0.85), rgba(70, 174, 247, 0.75))';
    });
  }

  closeSettings() {
    if (this.settingsPopup && this.settingsPopup.parentNode) {
      document.body.removeChild(this.settingsPopup);
      this.settingsPopup = null;
    }
  }

  openApiKeyConfig() {
    // Create and show the API key configuration popup
    this.apiKeyPopup = document.createElement('div');
    this.apiKeyPopup.className = 'settings-popup';
    this.apiKeyPopup.innerHTML = `
      <div class="settings-content">
        <h3 style="justify-content: center;">Configure API Key</h3>
        <div style="position: relative; z-index: 2; padding: 0 5px; max-width: 100%; box-sizing: border-box;">
          <p style="font-size: 14px; margin: 0 0 15px; opacity: 0.85; line-height: 1.5;">
            TalkType needs a Gemini API key to turn your voice into text.
          </p>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" style="display: flex; align-items: center; justify-content: center; background: rgba(111, 66, 193, 0.1); color: #6f42c1; text-decoration: none; padding: 10px 15px; border-radius: 8px; font-weight: 600; font-size: 13px; margin-bottom: 20px; border: 1.5px dashed rgba(111, 66, 193, 0.4); transition: all 0.2s ease;">
            <svg style="width: 16px; height: 16px; margin-right: 8px;" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
            </svg>
            Grab a free key (takes 5 secs) ↗
          </a>
          <input type="text" id="api-key-field" placeholder="Enter your Gemini API key" spellcheck="false" autocomplete="off" style="width: 100%; box-sizing: border-box; max-width: 100%;" />
          <button id="save-api-key" class="save-button">
            <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; margin-right: 6px;">
              <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
            </svg>
            Save API Key
          </button>
        </div>
        <button id="closeApiKey" class="settings-close">&times;</button>
        <div class="api-key-success">
          API key saved successfully!
        </div>
      </div>
    `;
    document.body.appendChild(this.apiKeyPopup);
    
    // Fetch and populate current API key securely
    if (window.TalkTypeStorage) {
      window.TalkTypeStorage.getApiKey().then(key => {
        if (key) document.getElementById('api-key-field').value = key;
      });
    } else {
      chrome.storage.sync.get(['apiKey'], (result) => {
        if (result.apiKey) {
          document.getElementById('api-key-field').value = result.apiKey;
        }
      });
    }
    
    // Add event listener for save button
    document.getElementById('save-api-key').addEventListener('click', () => {
      this.saveApiKey();
    });
    
    // Add event listener for Enter key in input field
    document.getElementById('api-key-field').addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        this.saveApiKey();
      }
    });
    
    // Add event listener for close button
    document.getElementById('closeApiKey').addEventListener('click', () => {
      this.closeApiKeyConfig();
    });
  }

  closeApiKeyConfig() {
    if (this.apiKeyPopup && this.apiKeyPopup.parentNode) {
      document.body.removeChild(this.apiKeyPopup);
      this.apiKeyPopup = null;
    }
  }

  saveApiKey() {
    const apiKey = document.getElementById('api-key-field').value.trim();
    if (apiKey) {
      const savePromise = window.TalkTypeStorage 
        ? window.TalkTypeStorage.setApiKey(apiKey) 
        : new Promise(r => chrome.storage.sync.set({ apiKey }, r));
        
      savePromise.then(() => {
        // Show success message with animation
        const successMsg = document.querySelector('.api-key-success');
        successMsg.classList.add('show');
        
        // Apply success styling to the button
        const saveButton = document.getElementById('save-api-key');
        saveButton.innerHTML = `
          <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; margin-right: 6px;">
            <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
          Saved!
        `;
        
        // Update the API key check
        if (typeof checkApiKey === 'function') {
          checkApiKey();
        }
        
        // Close the popup after a delay
        setTimeout(() => {
          this.closeApiKeyConfig();
        }, 1500);
      });
    } else {
      // Show error state for empty input
      const apiKeyField = document.getElementById('api-key-field');
      apiKeyField.style.borderColor = 'rgba(255, 0, 0, 0.5)';
      apiKeyField.style.boxShadow = 'inset 0 1px 3px rgba(255, 0, 0, 0.2)';
      
      // Shake animation for empty field
      apiKeyField.style.animation = 'shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both';
      
      // Reset the error state after animation
      setTimeout(() => {
        apiKeyField.style.borderColor = '';
        apiKeyField.style.boxShadow = '';
        apiKeyField.style.animation = '';
      }, 500);
    }
  }
}

// Create the global instance
window.SettingsDialogManager = new SettingsDialogManager();