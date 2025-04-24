const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'bookMyShowSecret';


exports.authenticate = (req, res, next) => {
  try {
    const path = req.path;
    
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
    if (req.xhr || 
      (req.headers.accept && req.headers.accept.includes('application/json')) ||
      (req.headers['content-type'] && req.headers['content-type'].includes('application/json'))) {
      return res.status(500).json({
        success: false,
        message: 'Authentication error'
      });
    }
    return res.redirect('/user/login');
  }
};

exports.isAdmin = (req, res, next) => {
  const adminUser = req.session.adminUser;
  
  if (adminUser && adminUser.role === 'admin') {
    req.user = adminUser;
    return next();
  }
  
  if (req.isAuthenticated() && req.user && req.user.role === 'admin') {
    return next();
  }
  
  res.status(403).redirect('/admin/login');
};

exports.generateToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });
}; 