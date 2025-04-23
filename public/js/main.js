// Session health check - helps prevent session contamination
document.addEventListener('DOMContentLoaded', function() {
  // Only run on frontend pages
  if (!window.location.pathname.startsWith('/admin')) {
    // Check for header signs of admin session in user context
    const userHeader = document.querySelector('.user-dropdown-toggle');
    if (userHeader) {
      const userName = userHeader.querySelector('.user-name');
      if (userName && userName.textContent.includes('Hi, Admin')) {
        console.error('Session contamination detected: Admin user data in frontend context');
        
        // Clear cookies and reload page to fix the issue
        document.cookie.split(';').forEach(function(c) {
          document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
        });
        
        // After clearing cookies, reload the page
        setTimeout(function() {
          window.location.reload();
        }, 100);
      }
    }
  }
}); 