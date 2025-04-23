/**
 * Admin Flash Message System
 * This script handles flash messages for all admin CRUD operations
 */

// Initialize SweetAlert2 Toast
const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

// Display flash message from query parameters
document.addEventListener('DOMContentLoaded', function() {
  // Function to show a toast
  function showToast(type, message) {
    Toast.fire({
      icon: type, // 'success', 'error', 'warning', 'info'
      title: message
    });
  }
  
  // Detect URL parameters for flash messages
  function getFlashFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const flashType = urlParams.get('flash_type');
    const flashMessage = urlParams.get('flash_message');
    
    if (flashType && flashMessage) {
      // Show the toast with the message
      showToast(flashType, decodeURIComponent(flashMessage));
      
      // Remove the parameters from URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }
  
  // Process flash messages in the HTML
  function processFlashMessages() {
    const flashDivs = document.querySelectorAll('.flash-message');
    
    if (flashDivs.length > 0) {
      flashDivs.forEach(div => {
        const type = div.getAttribute('data-type');
        const message = div.getAttribute('data-message');
        const important = div.getAttribute('data-important') === 'true';
        
        // For important messages, use a modal instead of a toast
        if (important) {
          Swal.fire({
            icon: type,
            title: message,
            showConfirmButton: true
          });
        } else {
          showToast(type, message);
        }
        
        // Remove the flash div
        div.remove();
      });
    }
  }
  
  // Process any flash messages
  getFlashFromUrl();
  processFlashMessages();
});

/**
 * Display a flash message
 * @param {string} type - success, error, warning, or info
 * @param {string} message - The message to display
 * @param {boolean} isImportant - Whether to show as a prominent alert instead of toast
 */
function showFlash(type, message, isImportant = false) {
  if (isImportant) {
    Swal.fire({
      icon: type,
      title: type.charAt(0).toUpperCase() + type.slice(1),
      text: message,
      confirmButtonColor: '#dc3545'
    });
  } else {
    Toast.fire({
      icon: type,
      title: message
    });
  }
}

/**
 * Redirect with flash message
 * @param {string} url - URL to redirect to
 * @param {string} type - success, error, warning, or info
 * @param {string} message - The message to display
 */
function redirectWithFlash(url, type, message) {
  const flashUrl = `${url}${url.includes('?') ? '&' : '?'}flash_type=${type}&flash_message=${encodeURIComponent(message)}`;
  window.location.href = flashUrl;
}

/**
 * Confirm deletion with SweetAlert2
 * @param {string} url - URL to send DELETE request to
 * @param {string} itemName - Name of the item being deleted
 * @param {string} redirectUrl - URL to redirect to after deletion
 */
function confirmDelete(url, itemName, redirectUrl) {
  Swal.fire({
    title: 'Are you sure?',
    text: `Do you really want to delete this ${itemName}? This action cannot be undone.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Yes, delete it!'
  }).then((result) => {
    if (result.isConfirmed) {
      // Send DELETE request
      fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          redirectWithFlash(redirectUrl, 'success', `${itemName} deleted successfully`);
        } else {
          showFlash('error', data.message || `Failed to delete ${itemName}`);
        }
      })
      .catch(error => {
        console.error('Error:', error);
        showFlash('error', `An error occurred while deleting the ${itemName}`);
      });
    }
  });
}

/**
 * Submit form with SweetAlert2 confirmation
 * @param {HTMLFormElement} form - Form element to submit
 * @param {string} action - Action being performed (create, update, etc.)
 * @param {string} itemName - Name of the item being acted upon
 */
function confirmFormSubmit(form, action, itemName) {
  Swal.fire({
    title: 'Confirm',
    text: `Are you sure you want to ${action} this ${itemName}?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Yes, proceed!'
  }).then((result) => {
    if (result.isConfirmed) {
      form.submit();
    }
  });
} 