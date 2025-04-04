// Context Menu Test Page Script

// Detect browser and platform
function detectBrowser() {
    const userAgent = navigator.userAgent;
    let browserInfo = '';
    
    // Detect OS
    if (/Windows/.test(userAgent)) {
        browserInfo += '<p><strong>Platform:</strong> Windows</p>';
    } else if (/Macintosh|MacIntel|MacPPC|Mac68K/.test(userAgent)) {
        browserInfo += '<p><strong>Platform:</strong> macOS</p>';
    } else if (/Linux/.test(userAgent)) {
        browserInfo += '<p><strong>Platform:</strong> Linux</p>';
    } else {
        browserInfo += '<p><strong>Platform:</strong> Unknown</p>';
    }
    
    // Detect browser
    if (/Chrome/.test(userAgent) && !/Chromium|Edge|OPR|Opera/.test(userAgent)) {
        browserInfo += '<p><strong>Browser:</strong> Chrome</p>';
    } else if (/Firefox/.test(userAgent)) {
        browserInfo += '<p><strong>Browser:</strong> Firefox</p>';
    } else if (/Safari/.test(userAgent) && !/Chrome|Chromium|Edge|OPR|Opera/.test(userAgent)) {
        browserInfo += '<p><strong>Browser:</strong> Safari</p>';
    } else if (/Edge/.test(userAgent)) {
        browserInfo += '<p><strong>Browser:</strong> Edge</p>';
    } else if (/OPR|Opera/.test(userAgent)) {
        browserInfo += '<p><strong>Browser:</strong> Opera</p>';
    } else {
        browserInfo += '<p><strong>Browser:</strong> Unknown</p>';
    }
    
    browserInfo += `<p><strong>User Agent:</strong> <code>${userAgent}</code></p>`;
    browserInfo += `<p><strong>Extension API:</strong> ${typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined' ? 'Available ✓' : 'Not Available ✗'}</p>`;
    
    const browserInfoElement = document.getElementById('browser-info');
    if (browserInfoElement) {
        browserInfoElement.innerHTML = browserInfo;
    }
}

// Create dynamic input
function createDynamicInput() {
    const container = document.getElementById('dynamic-container');
    if (!container) return;
    
    container.innerHTML = ''; // Clear previous
    
    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.style.marginTop = '15px';
    
    // Create label
    const label = document.createElement('label');
    label.textContent = 'Dynamic input (right-click here):';
    label.setAttribute('for', 'dynamic-input');
    wrapper.appendChild(label);
    
    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'dynamic-input';
    input.placeholder = 'Right-click here to test context menu on dynamic element';
    wrapper.appendChild(input);
    
    // Create result div
    const result = document.createElement('div');
    result.className = 'result';
    result.id = 'result5';
    result.textContent = 'Right-click result will appear here';
    wrapper.appendChild(result);
    
    // Add to container
    container.appendChild(wrapper);
    
    // Focus the new input
    setTimeout(() => input.focus(), 100);
    
    // Update status indicator
    const statusElement = document.getElementById('status5');
    if (statusElement) {
        statusElement.className = 'status-indicator status-warning';
    }
}

// Simple automated test function
function runTests() {
    alert('Right-click each input manually to test context menu.\n\nThis test page will highlight each field in sequence.');
    
    const elements = [
        document.getElementById('text-input'),
        document.getElementById('textarea'),
        document.getElementById('editable')
    ];
    
    let index = 0;
    
    function highlightNext() {
        // Reset all
        elements.forEach(el => {
            if (el) el.style.boxShadow = 'none';
        });
        
        if (index < elements.length) {
            const el = elements[index];
            if (el) {
                el.style.boxShadow = '0 0 0 4px rgba(108, 77, 196, 0.5)';
                el.focus();
                index++;
                setTimeout(highlightNext, 3000);
            }
        }
    }
    
    highlightNext();
}

// Monitor context menu events
function setupContextMenuListener() {
    document.addEventListener('contextmenu', function(e) {
        console.log('Context menu opened on:', e.target);
        
        // Identify which test area was clicked
        let testId = null;
        let resultElement = null;
        
        if (e.target.id === 'text-input' || e.target.closest('#text-input')) {
            testId = 'status1';
            resultElement = document.getElementById('result1');
        } else if (e.target.id === 'textarea' || e.target.closest('#textarea')) {
            testId = 'status2';
            resultElement = document.getElementById('result2');
        } else if (e.target.id === 'editable' || e.target.closest('#editable')) {
            testId = 'status3';
            resultElement = document.getElementById('result3');
        } else if (e.target.closest('.selection-demo')) {
            testId = 'status4';
            resultElement = document.getElementById('result4');
        } else if (e.target.id === 'dynamic-input' || e.target.closest('#dynamic-input')) {
            testId = 'status5';
            resultElement = document.getElementById('result5');
        }
        
        if (testId && resultElement) {
            // Update status indicator
            const statusIndicator = document.getElementById(testId);
            if (statusIndicator) {
                statusIndicator.className = 'status-indicator status-warning';
            }
            
            // Update result text
            resultElement.innerHTML = `Context menu opened on: <code>${e.target.tagName.toLowerCase()}</code> at ${new Date().toLocaleTimeString()}`;
            
            // Add event listener for focus changes
            const currentTarget = e.target;
            
            // Check if we already attached a listener to avoid duplicates
            if (!currentTarget.dataset.listenerAttached) {
                currentTarget.dataset.listenerAttached = 'true';
                
                currentTarget.addEventListener('input', function() {
                    // When input changes, update the status
                    if (testId && resultElement) {
                        document.getElementById(testId).className = 'status-indicator status-success';
                        resultElement.innerHTML = `✅ Transcription received at ${new Date().toLocaleTimeString()}`;
                    }
                });
            }
        }
    });
}

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Run browser detection
    detectBrowser();
    
    // Setup event listeners
    const createDynamicButton = document.getElementById('create-dynamic');
    if (createDynamicButton) {
        createDynamicButton.addEventListener('click', createDynamicInput);
    }
    
    const runTestsButton = document.getElementById('run-tests-btn');
    if (runTestsButton) {
        runTestsButton.addEventListener('click', runTests);
    }
    
    const reloadPageButton = document.getElementById('reload-page-btn');
    if (reloadPageButton) {
        reloadPageButton.addEventListener('click', function() {
            window.location.reload();
        });
    }
    
    // Setup context menu listener
    setupContextMenuListener();
});