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
    
    // Remove after animation
    setTimeout(() => {
      if (this.dialogElement && this.dialogElement.parentNode) {
        this.dialogElement.parentNode.removeChild(this.dialogElement);
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
    this.dialogElement.style.backgroundColor = 'white';
    this.dialogElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    this.dialogElement.style.borderRadius = '8px';
    this.dialogElement.style.padding = '20px';
    this.dialogElement.style.zIndex = '999999';
    this.dialogElement.style.width = '350px';
    this.dialogElement.style.opacity = '0';
    this.dialogElement.style.transition = 'opacity 0.3s ease';
    
    // Add content
    this.dialogElement.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 24px; margin-bottom: 10px; color: #444;">🎤</div>
        <h3 style="margin: 0 0 10px; font-size: 18px; color: #333;">Microphone Access Required</h3>
        <p style="margin: 0; color: #666; font-size: 14px;">
          Audio to Text needs permission to use your microphone for voice transcription.
        </p>
      </div>
      <div style="display: flex; justify-content: space-around; margin-top: 20px;">
        <button class="permission-deny" style="padding: 8px 16px; background: #f1f1f1; border: none; border-radius: 4px; cursor: pointer; color: #666; font-weight: bold;">
          Deny
        </button>
        <button class="permission-allow" style="padding: 8px 16px; background: #4285f4; border: none; border-radius: 4px; cursor: pointer; color: white; font-weight: bold;">
          Allow
        </button>
      </div>
    `;
  }
}

// Export the dialog
window.PermissionDialog = PermissionDialog;