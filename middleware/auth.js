const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT Secret key
const JWT_SECRET = process.env.JWT_SECRET || 'bookMyShowSecret';

// Authentication middleware functions

// Check if user is authenticated (works with both passport and session auth)
exports.authenticate = (req, res, next) => {
  // Determine if this is an admin route
  const isAdminRoute = req.path.startsWith('/admin');
  
  // For admin routes, check only adminUser session
  if (isAdminRoute) {
    if (req.session.adminUser) {
      // For admin routes, set req.user to adminUser session
      req.user = req.session.adminUser;
      return next();
    }
    
    // If no admin session, redirect to admin login
    console.log('No admin session found for admin route, redirecting to login');
    return res.redirect('/admin/login');
  } 
  // For frontend routes, check only user session
  else {
    if (req.session.user) {
      // For frontend routes, set req.user to user session
      req.user = req.session.user;
      return next();
    }
    
    if (req.isAuthenticated()) {
      // If using passport directly, that's fine too
      return next();
    }
    
    // Store the URL the user is trying to access
    req.session.redirectTo = req.originalUrl;
    
    // Check if this is an API request
    const isApiRequest = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
    
    if (isApiRequest) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required',
        redirectTo: '/user/login'
      });
    }
    
    // For regular requests, redirect to user login page
    console.log('No user session found for frontend route, redirecting to login');
    res.redirect('/user/login');
  }
};

// Check if user is admin (works with both passport and session auth)
exports.isAdmin = (req, res, next) => {
  // Check specifically for admin session
  const adminUser = req.session.adminUser;
  
  if (adminUser && adminUser.role === 'admin') {
    // Set req.user to adminUser for convenience
    req.user = adminUser;
    return next();
  }
  
  // Fallback to passport check - less preferred
  if (req.isAuthenticated() && req.user && req.user.role === 'admin') {
    return next();
  }
  
  console.log('No admin privileges for route, redirecting to admin login');
  res.status(403).redirect('/admin/login');
};

// Generate JWT token
exports.generateToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });
}; 