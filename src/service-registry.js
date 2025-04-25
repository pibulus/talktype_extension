/**
 * Centralized Service Registry for TalkType Extension
 * 
 * Manages service initialization, dependencies, and access
 * to ensure proper initialization order and prevent undefined services.
 */

class ServiceRegistry {
  constructor() {
    // Prevent multiple instances
    if (window._serviceRegistryInstance) {
      return window._serviceRegistryInstance;
    }
    
    window._serviceRegistryInstance = this;
    
    this.services = new Map();
    this.definitions = new Map();
    this.initializing = new Set();
    this.initialized = new Set();
    this.pendingLoads = new Map();
    this.serviceScriptMap = {
      'AudioRecordingService': 'audio-service.js',
      'GeminiApiService': 'api-service.js',
      'AudioProcessingService': 'audio-processing-service.js',
      'NotificationService': 'notification-service.js',
      'InputDetectionService': 'input-detection-service.js',
      'FocusTrackingService': 'focus-tracking-service.js',
      'ContextMenuService': 'context-menu-service.js',
      'TypingSimulatorService': 'typing-simulator-service.js'
    };
    
    console.log("TalkType: ✅ ServiceRegistry created with dynamic resolution");
  }
  
  /**
   * Register a service with the registry
   * @param {string} name - Service name
   * @param {Object} definition - Service definition object
   * @param {Function} definition.factory - Function that creates the service
   * @param {string[]} definition.dependencies - Array of dependency service names
   * @param {boolean} definition.lazy - Whether to initialize lazily (default: true)
   */
  register(name, definition) {
    if (this.definitions.has(name)) {
      console.log(`TalkType: Service ${name} already registered, updating definition`);
    }
    
    this.definitions.set(name, {
      factory: definition.factory,
      dependencies: definition.dependencies || [],
      lazy: definition.lazy !== undefined ? definition.lazy : true
    });
    
    console.log(`TalkType: Registered service ${name} with dependencies: ${definition.dependencies?.join(', ') || 'none'}`);
    return this;
  }
  
  /**
   * Get a service by name, initializing it if necessary
   * @param {string} name - Service name
   * @returns {Object|Promise<Object>} The service instance or a promise that resolves to the instance
   */
  get(name) {
    // Return existing instance if available
    if (this.services.has(name)) {
      return this.services.get(name);
    }
    
    // Check if service is defined
    if (!this.definitions.has(name)) {
      console.log(`TalkType: Service ${name} is not registered, attempting dynamic resolution`);
      
      // Check if we're already loading this service
      if (this.pendingLoads.has(name)) {
        return this.pendingLoads.get(name);
      }
      
      // Try to load the service dynamically
      if (this.serviceScriptMap[name]) {
        const loadPromise = this.loadServiceScript(name)
          .then(() => {
            // Once loaded, try to get the service again
            this.pendingLoads.delete(name);
            if (this.definitions.has(name)) {
              return this.get(name);
            } else {
              console.error(`TalkType: Service ${name} failed to register after loading script`);
              return null;
            }
          })
          .catch(err => {
            console.error(`TalkType: Failed to load service ${name}:`, err);
            this.pendingLoads.delete(name);
            return null;
          });
        
        this.pendingLoads.set(name, loadPromise);
        return loadPromise;
      }
      
      console.error(`TalkType: Service ${name} is not registered and no script mapping exists!`);
      return null;
    }
    
    // Initialize the service and its dependencies
    return this.initializeService(name);
  }
  
  /**
   * Load a service script dynamically
   * @param {string} serviceName - Name of the service to load
   * @returns {Promise<void>} Promise that resolves when the script is loaded
   */
  loadServiceScript(serviceName) {
    return new Promise((resolve, reject) => {
      const scriptName = this.serviceScriptMap[serviceName];
      if (!scriptName) {
        reject(new Error(`No script mapping for service ${serviceName}`));
        return;
      }
      
      console.log(`TalkType: Dynamically loading script for ${serviceName}: ${scriptName}`);
      
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(scriptName);
      script.onload = () => {
        console.log(`TalkType: Successfully loaded ${scriptName} for ${serviceName}`);
        
        // Add small delay to ensure script has time to execute and register itself
        setTimeout(() => {
          if (this.definitions.has(serviceName)) {
            console.log(`TalkType: Service ${serviceName} successfully registered after loading`);
            resolve();
          } else {
            console.log(`TalkType: Waiting for ${serviceName} to register...`);
            // Check again after a short delay
            setTimeout(() => {
              if (this.definitions.has(serviceName)) {
                console.log(`TalkType: Service ${serviceName} successfully registered after second check`);
                resolve();
              } else {
                console.error(`TalkType: Service ${serviceName} failed to register after loading`);
                resolve(); // Resolve anyway to prevent hanging
              }
            }, 100);
          }
        }, 50);
      };
      script.onerror = (error) => {
        console.error(`TalkType: Failed to load ${scriptName}:`, error);
        reject(error);
      };
      
      (document.head || document.documentElement).appendChild(script);
    });
  }
  
  /**
   * Initialize a service and its dependencies
   * @param {string} name - Service name
   * @returns {Object} The initialized service
   */
  initializeService(name) {
    // Detect circular dependencies
    if (this.initializing.has(name)) {
      console.error(`TalkType: Circular dependency detected for service ${name}`);
      return null;
    }
    
    // Skip if already initialized
    if (this.initialized.has(name)) {
      return this.services.get(name);
    }
    
    const definition = this.definitions.get(name);
    if (!definition) {
      console.error(`TalkType: Cannot initialize undefined service ${name}`);
      return null;
    }
    
    // Mark as initializing to detect circles
    this.initializing.add(name);
    
    // Initialize dependencies first
    const dependencies = definition.dependencies || [];
    
    // Create resolved dependencies object
    const resolvedDependencies = {};
    let allDepsResolved = true;
    
    for (const dep of dependencies) {
      const depInstance = this.get(dep);
      
      // If dependency returns a promise (is being loaded dynamically)
      if (depInstance instanceof Promise) {
        console.log(`TalkType: Dependency ${dep} is loading asynchronously, cannot initialize ${name} yet`);
        this.initializing.delete(name);
        
        // Return a promise that resolves when the dependency is loaded
        return depInstance.then(() => {
          console.log(`TalkType: Dependency ${dep} loaded, retrying initialization of ${name}`);
          return this.initializeService(name);
        });
      }
      
      resolvedDependencies[dep] = depInstance;
      
      // If a dependency failed to initialize, abort
      if (!resolvedDependencies[dep]) {
        console.error(`TalkType: Failed to initialize dependency ${dep} for service ${name}`);
        allDepsResolved = false;
      }
    }
    
    if (!allDepsResolved) {
      this.initializing.delete(name);
      return null;
    }
    
    try {
      // Create the service instance
      console.log(`TalkType: Creating service ${name}`);
      const instance = definition.factory(resolvedDependencies);
      
      // Store the instance
      this.services.set(name, instance);
      this.initialized.add(name);
      
      // Expose on window for backward compatibility
      window[name] = instance;
      
      console.log(`TalkType: Service ${name} initialized successfully`);
      return instance;
    } catch (error) {
      console.error(`TalkType: Error initializing service ${name}:`, error);
      return null;
    } finally {
      this.initializing.delete(name);
    }
  }
  
  /**
   * Initialize all registered services that aren't marked as lazy
   */
  initializeEagerServices() {
    for (const [name, definition] of this.definitions.entries()) {
      if (!definition.lazy) {
        this.get(name);
      }
    }
  }
  
  /**
   * Check if a service is registered
   * @param {string} name - Service name
   * @returns {boolean} Whether the service is registered
   */
  hasService(name) {
    return this.definitions.has(name);
  }
  
  /**
   * Check if a service class is available globally
   * @param {string} name - Service name
   * @returns {boolean} Whether the service class exists
   */
  hasServiceClass(name) {
    return typeof window[name] === 'function';
  }
  
  /**
   * Check if a service is initialized
   * @param {string} name - Service name
   * @returns {boolean} Whether the service is initialized
   */
  isInitialized(name) {
    return this.initialized.has(name);
  }
}

// Create the singleton instance
window.ServiceRegistry = new ServiceRegistry();

// Register core services
window.registerService = function(name, definition) {
  window.ServiceRegistry.register(name, definition);
};