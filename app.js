const express = require('express');
const path = require('path');
const connectDB = require('./config/db');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const methodOverride = require('method-override');
const mongoose = require('mongoose');
const ejs = require('ejs');
const session = require('express-session');
const passport = require('./config/passport');
const dotenv = require('dotenv');
const flash = require('connect-flash');

// Ensure all upload directories exist
require('./utils/ensureDirectories');

const app = express();
connectDB();

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());

// Support method overrides for PUT and DELETE 
app.use(methodOverride(function(req, res) {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    // look in urlencoded POST bodies and delete it
    var method = req.body._method;
    delete req.body._method;
    return method;
  }
}));
app.use(methodOverride('_method')); // Also keep the URL query param version

// Configure express-session
app.use(session({
  secret: process.env.SESSION_SECRET || 'bookMyShowSecret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Initialize flash middleware
app.use(flash());

// Pass flash messages to views
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  res.locals.warning_msg = req.flash('warning');
  res.locals.info_msg = req.flash('info');
  next();
});

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Add session cleanup middleware to handle conflicting sessions
app.use((req, res, next) => {
  // Determine if this is an admin route
  const isAdminPath = req.path.startsWith('/admin');
  
  // Instead of clearing sessions, we'll keep both but use only the appropriate one
  // based on the current route context (admin vs frontend)
  next();
});

// Static files
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Set current user in response locals
app.use((req, res, next) => {
  // Determine if this is an admin route
  const isAdminRoute = req.path.startsWith('/admin') && req.path !== '/admin/login';
  
  // Reset all locals first
  res.locals.user = null;
  res.locals.adminUser = null;
  
  // For admin routes - use ONLY adminUser session in locals
  if (isAdminRoute) {
    if (req.session.adminUser) {
      res.locals.adminUser = { ...req.session.adminUser };
    }
  } 
  // For user/frontend routes - use ONLY user session in locals
  else {
    if (req.session.user) {
      res.locals.user = { ...req.session.user };
    }
  }
  
  // Add default searchQuery to all renders
  res.locals.searchQuery = '';
  
  // Only redirect to admin login for admin routes, not frontend routes
  const isStaticResource = req.path.startsWith('/uploads/') || 
                           req.path.startsWith('/css/') || 
                           req.path.startsWith('/js/') || 
                           req.path.startsWith('/images/');
  
  if (isAdminRoute && !req.session.adminUser && !isStaticResource && req.method === 'GET') {
    return res.redirect('/admin/login');
  }
  
  next();
});

// Routes
const indexRoutes = require('./routes/indexRoutes');
const movieRoutes = require('./routes/movieRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Load auth routes first to ensure authentication routes take precedence
app.use('/', authRoutes); // Auth routes will be like /login, /register, etc.
app.use('/admin', adminRoutes);
app.use('/', indexRoutes);
app.use('/admin-movies', movieRoutes);
app.use('/bookings', bookingRoutes);

// Add a route for public theater views
app.get('/theaters/:id', require('./controllers/theaterController').getTheaterDetailsPublic);
app.get('/movie/:id/theaters', require('./controllers/theaterController').getTheatersForMovie);

// Error handling middleware
app.use((req, res, next) => {
    res.status(404).render('404', {
        title: '404 - Page Not Found',
        message: 'The page you are looking for does not exist.',
        searchQuery: ''
    });
});

app.use((err, req, res, next) => {
    console.error('Global error handler caught:', err);
    
    // Check if this is an API request
    const isApiRequest = req.xhr || 
        (req.headers.accept && req.headers.accept.includes('application/json')) ||
        (req.headers['content-type'] && req.headers['content-type'].includes('application/json'));
    
    if (isApiRequest) {
        return res.status(500).json({
            success: false,
            message: err.message || 'An unexpected error occurred',
            error: process.env.NODE_ENV === 'production' ? 'Server error' : err.stack
        });
    }
    
    res.status(500).render('error', {
        title: 'Server Error',
        message: 'Something went wrong on our end. Our team has been notified.',
        error: process.env.NODE_ENV === 'production' ? null : err,
        searchQuery: ''
    });
});

const PORT = process.env.PORT || 5555;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));