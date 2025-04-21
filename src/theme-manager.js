class ThemeManager {
  constructor() {
    this.initialized = false;
  }

  initialize() {
    console.log('Initializing theme manager...');
    
    // Check if user has manually set a preference before
    const userToggled = localStorage.getItem('userToggled');
    
    // Also check for theme preference in chrome.storage for persistence across devices
    chrome.storage.sync.get(['themePreference', 'userToggled'], (result) => {
      // If we have a stored preference in Chrome storage, use that first
      if (result.userToggled === 'true' && result.themePreference !== undefined) {
        console.log('Using Chrome storage theme preference:', result.themePreference);
        const isDarkMode = result.themePreference === 'dark';
        
        // Apply theme
        this.applyTheme(isDarkMode);
        
        // Also update localStorage to match
        localStorage.setItem('userToggled', 'true');
        localStorage.setItem('prefersDarkMode', isDarkMode);
        
        return;
      }
      
      // If Chrome storage doesn't have a preference, check localStorage
      if (userToggled === 'true') {
        // If user has toggled, use their preference from localStorage
        const prefersDarkMode = localStorage.getItem('prefersDarkMode') === 'true';
        console.log('Using localStorage theme preference:', prefersDarkMode ? 'dark' : 'light');
        
        // Apply theme
        this.applyTheme(prefersDarkMode);
        
        // Save to Chrome storage for persistence across devices
        chrome.storage.sync.set({
          themePreference: prefersDarkMode ? 'dark' : 'light',
          userToggled: 'true'
        });
      } else {
        // Otherwise, check system preference
        const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        console.log('Using system theme preference:', prefersDarkMode ? 'dark' : 'light');
        
        // Apply theme
        this.applyTheme(prefersDarkMode);
        
        // Set initial values to localStorage
        localStorage.setItem('userToggled', 'false');
        localStorage.setItem('prefersDarkMode', prefersDarkMode);
        
        // Also set in Chrome storage but mark as not user toggled
        chrome.storage.sync.set({
          themePreference: prefersDarkMode ? 'dark' : 'light',
          userToggled: 'false'
        });
        
        // Add listener for system theme changes if not user toggled
        try {
          const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
          
          // Use the proper event listener based on browser support
          if (darkModeMediaQuery.addEventListener) {
            darkModeMediaQuery.addEventListener('change', this.handleSystemThemeChange.bind(this));
          } else if (darkModeMediaQuery.addListener) {
            // For older browsers
            darkModeMediaQuery.addListener(this.handleSystemThemeChange.bind(this));
          }
        } catch (e) {
          console.error('Error setting up theme listener:', e);
        }
      }
    });
    
    this.initialized = true;
  }

  handleSystemThemeChange(e) {
    // Only apply if user hasn't manually set preference
    chrome.storage.sync.get(['userToggled'], (result) => {
      if (result.userToggled !== 'true' && localStorage.getItem('userToggled') !== 'true') {
        console.log('System theme changed to:', e.matches ? 'dark' : 'light');
        
        // Apply new theme
        this.applyTheme(e.matches);
        
        // Update stored values
        localStorage.setItem('prefersDarkMode', e.matches);
        chrome.storage.sync.set({
          themePreference: e.matches ? 'dark' : 'light'
        });
      }
    });
  }

  applyTheme(isDark) {
    if (isDark) {
      document.body.classList.add('dark-theme');
      
      // Update CSS variables for dark theme
      document.documentElement.style.setProperty('--glass-bg', 'rgba(30, 30, 40, 0.8)');
      document.documentElement.style.setProperty('--glass-border', 'rgba(70, 70, 90, 0.3)');
      document.documentElement.style.setProperty('--text-primary', 'rgba(255, 255, 255, 0.9)');
      document.documentElement.style.setProperty('--text-secondary', 'rgba(255, 255, 255, 0.7)');
      document.documentElement.style.setProperty('--light-accent', 'rgba(111, 66, 193, 0.2)');
      
      // Update background gradient for dark theme
      document.body.style.background = 'linear-gradient(225deg, rgba(20, 20, 30, 0.95), rgba(30, 30, 40, 0.9))';
      
      // Use white icon for dark theme
      try {
        const logoImg = document.querySelector('h1 img');
        if (logoImg) {
          // Ensure we're using the white icon for dark theme
          if (!logoImg.src.includes('icon_white')) {
            logoImg.src = logoImg.src.replace('icon_black', 'icon_white');
          }
        }
      } catch (e) {
        console.error('Error updating logo for dark theme:', e);
      }
    } else {
      document.body.classList.remove('dark-theme');
      
      // Restore default CSS variables for light theme
      document.documentElement.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.65)');
      document.documentElement.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.7)');
      document.documentElement.style.setProperty('--text-primary', 'rgba(60, 64, 67, 0.95)');
      document.documentElement.style.setProperty('--text-secondary', 'rgba(60, 64, 67, 0.85)');
      document.documentElement.style.setProperty('--light-accent', 'rgba(111, 66, 193, 0.1)');
      
      // Restore background gradient for light theme
      document.body.style.background = 'linear-gradient(225deg, rgba(255, 255, 255, 0.9), rgba(240, 245, 255, 0.95))';
      
      // Use black icon for light theme
      try {
        const logoImg = document.querySelector('h1 img');
        if (logoImg) {
          // Ensure we're using the black icon for light theme
          if (!logoImg.src.includes('icon_black')) {
            logoImg.src = logoImg.src.replace('icon_white', 'icon_black');
          }
        }
      } catch (e) {
        console.error('Error updating logo for light theme:', e);
      }
    }
    
    console.log(`Theme applied: ${isDark ? 'Dark' : 'Light'} mode`);
  }

  toggleTheme() {
    // Get current theme state
    const currentIsDark = document.body.classList.contains('dark-theme');
    const newIsDark = !currentIsDark;
    
    // Save preference
    localStorage.setItem('userToggled', 'true');
    localStorage.setItem('prefersDarkMode', newIsDark);
    
    // Apply theme
    this.applyTheme(newIsDark);
    
    // Save to Chrome storage for persistence across devices
    chrome.storage.sync.set({
      themePreference: newIsDark ? 'dark' : 'light',
      userToggled: 'true'
    });
    
    return newIsDark;
  }

  isDarkMode() {
    return document.body.classList.contains('dark-theme');
  }
}

// Create the global instance
window.ThemeManager = new ThemeManager();