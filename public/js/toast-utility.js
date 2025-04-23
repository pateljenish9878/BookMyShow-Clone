/**
 * Toast Utility for Admin Panel
 * Uses SweetAlert2 for modern, consistent toast notifications
 */

/**
 * Shows a toast notification with the specified type and message
 * @param {string} type - The type of notification: 'success', 'error', 'warning', 'info'
 * @param {string} message - The message to display in the toast
 * @param {number} duration - Duration in milliseconds (optional, default: 3000)
 */
function showToastNotification(type, message, duration = 3000) {
    // Convert type to SweetAlert2 icon type if needed
    const icon = type === 'success' ? 'success' :
                 type === 'error' ? 'error' :
                 type === 'warning' ? 'warning' : 'info';
    
    // Create and show the toast
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: duration,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });
    
    Toast.fire({
        icon: icon,
        title: message
    });
}

/**
 * Shows a success toast notification
 * @param {string} message - The success message to display
 * @param {number} duration - Duration in milliseconds (optional)
 */
function showSuccessToast(message, duration) {
    showToastNotification('success', message, duration);
}

/**
 * Shows an error toast notification
 * @param {string} message - The error message to display
 * @param {number} duration - Duration in milliseconds (optional)
 */
function showErrorToast(message, duration) {
    showToastNotification('error', message, duration);
}

/**
 * Shows a warning toast notification
 * @param {string} message - The warning message to display
 * @param {number} duration - Duration in milliseconds (optional)
 */
function showWarningToast(message, duration) {
    showToastNotification('warning', message, duration);
}

/**
 * Shows an info toast notification
 * @param {string} message - The info message to display
 * @param {number} duration - Duration in milliseconds (optional)
 */
function showInfoToast(message, duration) {
    showToastNotification('info', message, duration);
}

/**
 * Process flash messages from URL parameters
 * This function checks for flash_type and flash_message URL parameters
 * and displays a toast notification if they exist
 */
function processFlashMessagesFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('flash_type') && urlParams.has('flash_message')) {
        const type = urlParams.get('flash_type');
        const message = urlParams.get('flash_message');
        showToastNotification(type, message);
        
        // Clean URL parameters
        const url = new URL(window.location);
        url.searchParams.delete('flash_type');
        url.searchParams.delete('flash_message');
        window.history.replaceState({}, document.title, url);
    }
}

// Automatically process flash messages when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    processFlashMessagesFromURL();
    
    // Process flash messages from container if it exists
    const flashContainer = document.getElementById('flash-message-container');
    if (flashContainer) {
        const flashMessages = flashContainer.querySelectorAll('.flash-message');
        flashMessages.forEach(function(flashMsg) {
            const type = flashMsg.dataset.type;
            const message = flashMsg.textContent;
            if (message.trim()) {
                showToastNotification(type, message);
            }
        });
    }
}); 