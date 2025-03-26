// Permission Dialog Component

class PermissionDialog {
  constructor() {
    this.dialogElement = null;
    this.isShowing = false;
  }
  
  /**
   * Creates and shows a permission request dialog
   * @param {Function} onAllow - Callback when user allows permission
   * @param {Function} onDeny - Callback when user denies permission
   */
  showDialog(onAllow, onDeny) {
    if (this.isShowing) return;
    
    // Create dialog if it doesn't exist
    if (!this.dialogElement) {
      this.createDialogElement();
    }
    
    // Set up buttons
    const allowButton = this.dialogElement.querySelector('.permission-allow');
    const denyButton = this.dialogElement.querySelector('.permission-deny');
    
    // Clear previous listeners
    const newAllowButton = allowButton.cloneNode(true);
    const newDenyButton = denyButton.cloneNode(true);
    allowButton.parentNode.replaceChild(newAllowButton, allowButton);
    denyButton.parentNode.replaceChild(newDenyButton, denyButton);
    
    // Add new listeners
    newAllowButton.addEventListener('click', () => {
      this.hideDialog();
      if (onAllow) onAllow();
    });
    
    newDenyButton.addEventListener('click', () => {
      this.hideDialog();
      if (onDeny) onDeny();
    });
    
    // In popup environment, we need to attach dialog to the document root
    // and make sure it's positioned properly
    try {
      // For popup, use a different approach
      if (window.innerWidth < 400) { // Likely a popup
        // Position for small popup
        this.dialogElement.style.width = '90%';
        this.dialogElement.style.position = 'fixed';
        this.dialogElement.style.top = '50%';
        this.dialogElement.style.left = '50%';
        this.dialogElement.style.transform = 'translate(-50%, -50%)';
        this.dialogElement.style.maxHeight = '80vh';
        this.dialogElement.style.overflow = 'auto';
        this.dialogElement.style.zIndex = '2147483647'; // Max z-index
        
        // Create a backdrop
        const backdrop = document.createElement('div');
        backdrop.style.position = 'fixed';
        backdrop.style.top = '0';
        backdrop.style.left = '0';
        backdrop.style.width = '100%';
        backdrop.style.height = '100%';
        backdrop.style.backgroundColor = 'rgba(0,0,0,0.5)';
        backdrop.style.zIndex = '2147483646'; // One less than dialog
        backdrop.className = 'audio-to-text-permission-backdrop';
        
        // Add backdrop first
        document.body.appendChild(backdrop);
      }
    } catch (e) {
      console.error('Error setting up dialog position:', e);
    }
    
    // Show dialog
    document.body.appendChild(this.dialogElement);
    this.isShowing = true;
    
    // Animate in
    setTimeout(() => {
      this.dialogElement.style.opacity = '1';
    }, 10);
  }
  
  /**
   * Hides the permission dialog
   */
  hideDialog() {
    if (!this.isShowing || !this.dialogElement) return;
    
    // Animate out
    this.dialogElement.style.opacity = '0';
    
    // Remove backdrop if it exists
    const backdrop = document.querySelector('.audio-to-text-permission-backdrop');
    if (backdrop) {
      backdrop.style.opacity = '0';
    }
    
    // Remove after animation
    setTimeout(() => {
      // Remove dialog
      if (this.dialogElement && this.dialogElement.parentNode) {
        this.dialogElement.parentNode.removeChild(this.dialogElement);
      }
      
      // Remove backdrop
      if (backdrop && backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
      
      this.isShowing = false;
    }, 300);
  }
  
  /**
   * Creates the dialog element
   */
  createDialogElement() {
    // Create dialog container
    this.dialogElement = document.createElement('div');
    this.dialogElement.className = 'audio-to-text-permission-dialog';
    this.dialogElement.style.position = 'fixed';
    this.dialogElement.style.top = '20%';
    this.dialogElement.style.left = '50%';
    this.dialogElement.style.transform = 'translateX(-50%)';
    // Glass morphism style
    this.dialogElement.style.background = 'linear-gradient(135deg, rgba(125, 46, 185, 0.85), rgba(173, 69, 255, 0.75))';
    this.dialogElement.style.backdropFilter = 'blur(10px)';
    this.dialogElement.style.webkitBackdropFilter = 'blur(10px)';
    this.dialogElement.style.boxShadow = '0 8px 32px rgba(31, 38, 135, 0.3)';
    this.dialogElement.style.borderRadius = '12px';
    this.dialogElement.style.border = '1px solid rgba(255, 255, 255, 0.18)';
    this.dialogElement.style.padding = '25px';
    this.dialogElement.style.zIndex = '999999';
    this.dialogElement.style.width = '350px';
    this.dialogElement.style.opacity = '0';
    this.dialogElement.style.transition = 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
    
    // Add glass morphism content
    this.dialogElement.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 32px; margin-bottom: 15px; text-shadow: 0 2px 10px rgba(255,255,255,0.5);">🎤</div>
        <h3 style="margin: 0 0 15px; font-size: 20px; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">Microphone Access</h3>
        <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 15px; line-height: 1.5;">
          Allow microphone access to convert your voice to text.
        </p>
      </div>
      <div style="display: flex; justify-content: space-around; margin-top: 25px;">
        <button class="permission-deny" style="padding: 10px 18px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; cursor: pointer; color: white; font-weight: 500; backdrop-filter: blur(5px); transition: all 0.2s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          Later
        </button>
        <button class="permission-allow" style="padding: 10px 18px; background: linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.15)); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; cursor: pointer; color: white; font-weight: 500; backdrop-filter: blur(5px); transition: all 0.2s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          Allow Access
        </button>
      </div>
    `;
  }
}

// Export the dialog
window.PermissionDialog = PermissionDialog;