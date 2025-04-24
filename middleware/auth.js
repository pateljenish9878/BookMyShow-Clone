const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT Secret key
const JWT_SECRET = process.env.JWT_SECRET || 'bookMyShowSecret';

// Authentication middleware functions

// Check if user is authenticated (works with both passport and session auth)
exports.authenticate = (req, res, next) => {
  try {
    const path = req.path;
    
    // Admin routes require adminUser session
    if (path.startsWith('/admin')) {
      if (req.session.adminUser) {
        return next();
      } else {
        if (req.xhr || req.path.includes('/api/')) {
          return res.status(401).json({ 
            message: "Authentication required. Please log in as admin." 
          });
        }
        return res.redirect('/admin/login');
      }
    }
    
    // Booking routes require user session, even if admin is logged in
    if (path.startsWith('/bookings')) {
      if (req.session.user) {
        return next();
      } else {
        if (req.xhr || req.path.includes('/api/')) {
          return res.status(401).json({ 
            message: "Authentication required. Please log in to book tickets." 
          });
        }
        return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
      }
    }
    
    // Frontend/user routes can use either user or adminUser session
    if (req.session.user || req.session.adminUser) {
      return next();
    } else {
      if (req.xhr || req.path.includes('/api/')) {
        return res.status(401).json({ 
          message: "Authentication required. Please log in." 
        });
      }
      return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
    }
  } catch (error) {
    console.error('Error in authentication middleware:', error);
    // For API requests
    if (req.xhr || 
      (req.headers.accept && req.headers.accept.includes('application/json')) ||
      (req.headers['content-type'] && req.headers['content-type'].includes('application/json'))) {
      return res.status(500).json({
        success: false,
        message: 'Authentication error'
      });
    }
    // For regular requests
    return res.redirect('/user/login');
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