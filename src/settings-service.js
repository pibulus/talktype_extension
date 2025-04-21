// Settings Service for TalkType extension
// Centralized management of extension settings

class SettingsService {
  constructor() {
    // Singleton Protection Pattern
    if (window._settingsServiceInstance) {
      console.log("TalkType: ⚠️ Avoiding duplicate SettingsService initialization");
      return window._settingsServiceInstance;
    }
    
    // Register this instance as the singleton
    window._settingsServiceInstance = this;
    
    // Default settings
    this.defaults = {
      apiKey: '',
      autoRecord: false,
      contextMenu: true,
      microphonePermission: null
    };
    
    // Initialize settings
    this.initialized = false;
    this.settings = {};
    
    console.log("TalkType: ✅ SettingsService initialized as singleton");
  }
  
  // Initialize and load all settings
  async initialize() {
    if (this.initialized) return this.settings;
    
    try {
      // Load all settings from storage
      this.settings = await chrome.storage.sync.get(this.defaults);
      this.initialized = true;
      console.log("TalkType: Settings loaded", this.settings);
      return this.settings;
    } catch (error) {
      console.error("TalkType: Error loading settings", error);
      return this.defaults;
    }
  }
  
  // Get a specific setting
  async get(key) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (key in this.settings) {
      return this.settings[key];
    }
    
    return this.defaults[key];
  }
  
  // Get all settings
  async getAll() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.settings;
  }
  
  // Update a specific setting
  async set(key, value) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Update local cache
      this.settings[key] = value;
      
      // Save to storage
      await chrome.storage.sync.set({ [key]: value });
      
      console.log(`TalkType: Setting "${key}" updated to:`, value);
      return true;
    } catch (error) {
      console.error(`TalkType: Error updating setting "${key}"`, error);
      return false;
    }
  }
  
  // Update multiple settings at once
  async setMultiple(settingsObject) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Update local cache
      Object.assign(this.settings, settingsObject);
      
      // Save to storage
      await chrome.storage.sync.set(settingsObject);
      
      console.log("TalkType: Multiple settings updated:", settingsObject);
      return true;
    } catch (error) {
      console.error("TalkType: Error updating multiple settings", error);
      return false;
    }
  }
  
  // Toggle a boolean setting
  async toggle(key) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!(key in this.settings)) {
      this.settings[key] = this.defaults[key];
    }
    
    const currentValue = !!this.settings[key];
    return await this.set(key, !currentValue);
  }
  
  // Special methods for specific settings
  
  // Context Menu
  async isContextMenuEnabled() {
    return await this.get('contextMenu');
  }
  
  async toggleContextMenu() {
    return await this.toggle('contextMenu');
  }
  
  async enableContextMenu() {
    return await this.set('contextMenu', true);
  }
  
  async disableContextMenu() {
    return await this.set('contextMenu', false);
  }
  
  // Auto Record
  async isAutoRecordEnabled() {
    return await this.get('autoRecord');
  }
  
  async toggleAutoRecord() {
    return await this.toggle('autoRecord');
  }
  
  // API Key
  async getApiKey() {
    return await this.get('apiKey');
  }
  
  async setApiKey(apiKey) {
    return await this.set('apiKey', apiKey);
  }
  
  // Microphone Permission
  async getMicrophonePermission() {
    return await this.get('microphonePermission');
  }
  
  async setMicrophonePermission(status) {
    return await this.set('microphonePermission', status);
  }
}

// Export a singleton instance
window.SettingsService = window._settingsServiceInstance || new SettingsService();