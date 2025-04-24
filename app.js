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

require('./utils/ensureDirectories');

require('./utils/syncUploads');

const app = express();
connectDB().then(async () => {
    // Run data cleanup on startup to fix any invalid show data
    try {
        const cleanupShows = require('./utils/cleanupShows');
        const result = await cleanupShows();
        console.log('Database cleanup completed:', result);
    } catch (err) {
        console.error('Error during database cleanup:', err);
    }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());

app.use(methodOverride(function(req, res) {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    var method = req.body._method;
    delete req.body._method;
    return method;
  }
}));
app.use(methodOverride('_method'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'bookMyShowSecret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000 
  }
}));

app.use(flash());

app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  res.locals.warning_msg = req.flash('warning');
  res.locals.info_msg = req.flash('info');
  next();
});

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  const isAdminPath = req.path.startsWith('/admin');
  next();
});

app.use('/', express.static(path.resolve(__dirname, 'public')));
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));
app.use('/uploads/users', express.static(path.resolve(__dirname, 'uploads/users')));
app.use('/uploads/movies', express.static(path.resolve(__dirname, 'uploads/movies')));
app.use('/uploads/theaters', express.static(path.resolve(__dirname, 'uploads/theaters')));
app.use('/uploads/profiles', express.static(path.resolve(__dirname, 'uploads/profiles')));
app.use('/uploads/sliders', express.static(path.resolve(__dirname, 'uploads/sliders')));
app.use('/uploads/banners', express.static(path.resolve(__dirname, 'uploads/banners')));

app.use((req, res, next) => {
  const isAdminRoute = req.path.startsWith('/admin') && req.path !== '/admin/login';
  
  res.locals.user = null;
  res.locals.adminUser = null;
  
  if (isAdminRoute) {
    if (req.session.adminUser) {
      res.locals.adminUser = { ...req.session.adminUser };
    }
  } 
  else {
    if (req.session.user) {
      res.locals.user = { ...req.session.user };
    }
  }
  
  res.locals.searchQuery = '';
  
  const isStaticResource = req.path.startsWith('/uploads/') || 
                           req.path.startsWith('/css/') || 
                           req.path.startsWith('/js/') || 
                           req.path.startsWith('/images/');
  
  if (isAdminRoute && !req.session.adminUser && !isStaticResource && req.method === 'GET') {
    return res.redirect('/admin/login');
  }
  
  next();
});

const indexRoutes = require('./routes/indexRoutes');
const movieRoutes = require('./routes/movieRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/', authRoutes); 
app.use('/admin', adminRoutes);
app.use('/', indexRoutes);
app.use('/admin-movies', movieRoutes);
app.use('/bookings', bookingRoutes);

app.get('/theaters/:id', require('./controllers/theaterController').getTheaterDetailsPublic);
app.get('/movie/:id/theaters', require('./controllers/theaterController').getTheatersForMovie);

app.use((req, res, next) => {
    res.status(404).render('404', {
        title: '404 - Page Not Found',
        message: 'The page you are looking for does not exist.',
        searchQuery: ''
    });
});

app.use((err, req, res, next) => {
    console.error('Global error handler caught:', err);
    
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