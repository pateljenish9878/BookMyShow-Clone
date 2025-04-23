const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const adminMovieController = require('../controllers/adminMovieController');
const theaterController = require('../controllers/theaterController');
const languageController = require('../controllers/languageController');
const showController = require('../controllers/showController');
const { check } = require('express-validator');
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User');
const settingsController = require('../controllers/settingsController');
const bcrypt = require('bcryptjs');
const fs = require('fs');

// Multer storage configuration for theaters
const theaterStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads/theaters'));
    },
    filename: (req, file, cb) => {
        cb(null, `theater-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// Multer storage configuration for movies
const movieStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads/movies'));
    },
    filename: (req, file, cb) => {
        cb(null, `movie-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const uploadTheater = multer({ 
    storage: theaterStorage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Images only (jpeg, jpg, png, webp)!');
        }
    }
});

const uploadMovie = multer({ 
    storage: movieStorage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp|avif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype) || file.mimetype === 'image/avif';
        
        console.log('File upload attempt:', {
            originalname: file.originalname,
            mimetype: file.mimetype,
            extname: path.extname(file.originalname).toLowerCase(),
            isValidExtname: filetypes.test(path.extname(file.originalname).toLowerCase()),
            isValidMimetype: filetypes.test(file.mimetype) || file.mimetype === 'image/avif'
        });
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Images only (jpeg, jpg, png, webp, avif)!');
        }
    }
}).fields([
    { name: 'image', maxCount: 1 },
    { name: 'backgroundImage', maxCount: 1 }
]);

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, 'logo-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 1000000 }, // 1MB limit
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|svg/;
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Images only (jpeg, jpg, png, svg)!');
        }
    }
});

// Set up multer for user profile picture uploads
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Try uploads/users first, then fallback to public/uploads/users
        const primaryPath = path.join(__dirname, '../uploads/users');
        const fallbackPath = path.join(__dirname, '../public/uploads/users');
        
        // Check if the primary directory exists
        try {
            // Use fs to check if the directory exists and is writable
            fs.accessSync(primaryPath, fs.constants.W_OK);
            cb(null, primaryPath);
        } catch (err) {
            console.log('Primary uploads directory not writable, using fallback path:', fallbackPath);
            // Create fallback directory if it doesn't exist
            try {
                if (!fs.existsSync(fallbackPath)) {
                    fs.mkdirSync(fallbackPath, { recursive: true });
                }
                cb(null, fallbackPath);
            } catch (err) {
                console.error('Error creating fallback uploads directory:', err);
                cb(err);
            }
        }
    },
    filename: (req, file, cb) => {
        cb(null, 'profile-' + Date.now() + path.extname(file.originalname));
    }
});

const uploadProfile = multer({ 
    storage: profileStorage,
    limits: { fileSize: 2000000 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png/;
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Images only (jpeg, jpg, png)!');
        }
    }
}).single('profileImage');

// Dashboard
router.get('/dashboard', authMiddleware, isAdmin, adminController.getDashboard);

// Admin Profile
router.get('/profile', authMiddleware, isAdmin, (req, res) => {
    res.render('admin/profile', {
        adminUser: req.session.adminUser,
        currentUser: req.session.adminUser
    });
});

// Profile Edit
router.get('/profile/edit', authMiddleware, isAdmin, (req, res) => {
    res.render('admin/profile-edit', {
        adminUser: req.session.adminUser,
        currentUser: req.session.adminUser
    });
});

// Profile Update
router.post('/profile/update', authMiddleware, isAdmin, async (req, res) => {
    try {
        const { name, email, phone, emailNotifications } = req.body;
        const adminId = req.session.adminUser._id;
        
        // Check if email is already in use
        const existingUser = await User.findOne({ email, _id: { $ne: adminId } });
        if (existingUser) {
            req.flash('error_msg', 'Email is already in use');
            return res.redirect('/admin/profile/edit');
        }
        
        // Update user preferences
        const preferences = {
            emailNotifications: emailNotifications === 'on' || emailNotifications === true
        };
        
        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            adminId,
            { 
                name,
                email,
                phone,
                preferences,
                updatedAt: Date.now()
            },
            { new: true }
        );
        
        // Update session
        req.session.adminUser = {
            ...req.session.adminUser,
            name,
            email,
            phone,
            preferences,
            updatedAt: new Date()
        };
        
        req.flash('success_msg', 'Profile updated successfully');
        res.redirect('/admin/profile');
    } catch (error) {
        console.error('Error updating profile:', error);
        req.flash('error_msg', 'Error updating profile');
        res.redirect('/admin/profile/edit');
    }
});

// Change Password
router.post('/profile/change-password', authMiddleware, isAdmin, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const adminId = req.session.adminUser._id;
        
        // Validate password confirmation
        if (newPassword !== confirmPassword) {
            req.flash('error_msg', 'New passwords do not match');
            return res.redirect('/admin/profile/edit');
        }
        
        // Find user
        const user = await User.findById(adminId);
        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/admin/profile/edit');
        }
        
        // Check current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            req.flash('error_msg', 'Current password is incorrect');
            return res.redirect('/admin/profile/edit');
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Update password
        user.password = hashedPassword;
        user.updatedAt = Date.now();
        await user.save();
        
        req.flash('success_msg', 'Password changed successfully');
        res.redirect('/admin/profile');
    } catch (error) {
        console.error('Error changing password:', error);
        req.flash('error_msg', 'Error changing password');
        res.redirect('/admin/profile/edit');
    }
});

// Profile Photo Upload
router.post('/profile/upload-photo', authMiddleware, isAdmin, uploadProfile, async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error_msg', 'Please select an image to upload');
            return res.redirect('/admin/profile');
        }
        
        // Get the current admin user from session
        const adminUser = req.session.adminUser;
        
        // Create a copy of the file in both directories for compatibility
        try {
            // Create uploads/profiles directory if it doesn't exist
            const profilesDir = path.join(__dirname, '../uploads/profiles');
            if (!fs.existsSync(profilesDir)) {
                fs.mkdirSync(profilesDir, { recursive: true });
            }
            
            // Copy the file from uploads/users to uploads/profiles
            const sourcePath = req.file.path;
            const destPath = path.join(profilesDir, req.file.filename);
            
            // Copy file if source exists
            if (fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, destPath);
                console.log('Image file copied to profiles directory for compatibility');
            }
        } catch (err) {
            console.error('Error copying profile image:', err);
            // Continue anyway since we have at least one copy
        }
        
        // Update the user in the database
        const updatedUser = await User.findByIdAndUpdate(
            adminUser._id,
            { profilePic: req.file.filename },
            { new: true }
        );
        
        // Update the session with the new profile pic
        req.session.adminUser = {
            ...req.session.adminUser,
            profilePic: req.file.filename
        };
        
        req.flash('success_msg', 'Profile picture updated successfully');
        res.redirect('/admin/profile');
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        req.flash('error_msg', 'Error uploading profile picture');
        res.redirect('/admin/profile');
    }
});

// User Management
router.get('/users', authMiddleware, isAdmin, adminController.getUsers);

// Admin-specific routes (need to be before the :id routes)
router.get('/users/add-admin', authMiddleware, isAdmin, (req, res) => {
    res.render('admin/add-admin', {
        user: req.adminUser,
        formData: {},
        query: {}
    });
});

router.post('/users/admin', authMiddleware, isAdmin, uploadProfile, [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
    check('phone', 'Phone number is required').not().isEmpty()
], adminController.createAdmin);

// Regular user routes
router.get('/users/add', authMiddleware, isAdmin, (req, res) => {
    res.render('admin/add-user', {
        user: req.adminUser,
        formData: {},
        query: {}
    });
});

router.post('/users', authMiddleware, isAdmin, uploadProfile, [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
    check('phone', 'Phone number is required').not().isEmpty()
], adminController.createUser);

// Dynamic parameter routes must come after specific paths
router.get('/users/:id', authMiddleware, isAdmin, adminController.getUserById);
router.get('/users/:id/edit', authMiddleware, isAdmin, adminController.getEditUserForm);
router.put('/users/:id', authMiddleware, isAdmin, uploadProfile, [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('phone', 'Phone number is required').not().isEmpty()
], adminController.updateUser);
router.delete('/users/:id', authMiddleware, isAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        // Don't allow deleting self
        // Safe comparison that avoids toString() errors
        const adminId = req.adminUser && req.adminUser._id ? req.adminUser._id.toString() : null;
        if (adminId && userId === adminId) {
            return res.status(400).json({ success: false, msg: 'Cannot delete yourself' });
        }

        const userRole = req.query.returnRole || user.role; // Store the role before deletion
        
        // Delete user
        await User.findByIdAndDelete(userId);
        
        // Redirect back to the appropriate user list
        res.redirect(`/admin/users?role=${userRole}`);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, msg: 'Server error' });
    }
});

// Toggle user active status - PATCH version (original)
router.patch('/users/:id/toggle-status', authMiddleware, isAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        // Don't allow deactivating self
        // Safe comparison that avoids toString() errors
        const adminId = req.adminUser && req.adminUser._id ? req.adminUser._id.toString() : null;

        if (adminId && userId && userId === adminId) {
            return res.status(400).json({ success: false, msg: 'Cannot change your own status' });
        }

        // Toggle active status
        user.active = !user.active;
        await user.save();
        
        // Use returnRole if provided, otherwise use user.role
        const roleToUse = req.query.returnRole || user.role;
        res.redirect(`/admin/users?role=${roleToUse}`);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, msg: 'Server error' });
    }
});

// Toggle user active status - POST version (alternative)
router.post('/users/:id/toggle-status', authMiddleware, isAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/admin/users');
        }

        // Don't allow deactivating self
        // Safe comparison that avoids toString() errors
        const adminId = req.adminUser && req.adminUser._id ? req.adminUser._id.toString() : null;

        if (adminId && userId && userId === adminId) {
            req.flash('error_msg', 'You cannot change your own status');
            return res.redirect('/admin/users');
        }

        // Toggle active status
        user.active = !user.active;
        await user.save();
        
        // Set success flash message
        const statusText = user.active ? 'activated' : 'deactivated';
        req.flash('success_msg', `User ${user.name} has been ${statusText} successfully`);
        
        // Use returnRole if provided, otherwise use user.role
        const roleToUse = req.query.returnRole || user.role;
        res.redirect(`/admin/users?role=${roleToUse}`);
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Server error occurred while updating user status');
        res.redirect('/admin/users');
    }
});

// Movie Management
router.get('/movies', authMiddleware, isAdmin, adminMovieController.getAdminMovies);
router.get('/movies/add', authMiddleware, isAdmin, adminMovieController.getAddMovieForm);
router.post('/movies', authMiddleware, isAdmin, uploadMovie, [
    check('title', 'Title is required').not().isEmpty(),
    check('category', 'Category is required').not().isEmpty(),
    check('duration', 'Duration is required').not().isEmpty(),
    check('ratings', 'Rating is required').isNumeric(),
    check('releaseDate', 'Release date is required').not().isEmpty(),
    check('description', 'Description is required').not().isEmpty(),
    check('status', 'Status is required').not().isEmpty(),
    check('language', 'Language is required').not().isEmpty()
], adminMovieController.createMovie);
router.get('/movies/:id', authMiddleware, isAdmin, adminMovieController.getMovieDetails);
router.get('/movies/:id/edit', authMiddleware, isAdmin, adminMovieController.getEditMovieForm);
router.put('/movies/:id', authMiddleware, isAdmin, uploadMovie, [
    check('title', 'Title is required').not().isEmpty(),
    check('category', 'Category is required').not().isEmpty(),
    check('duration', 'Duration is required').not().isEmpty(),
    check('ratings', 'Rating is required').isNumeric(),
    check('releaseDate', 'Release date is required').not().isEmpty(),
    check('description', 'Description is required').not().isEmpty(),
    check('status', 'Status is required').not().isEmpty(),
    check('language', 'Language is required').not().isEmpty()
], adminMovieController.updateMovie);
router.delete('/movies/:id', authMiddleware, isAdmin, adminMovieController.deleteMovie);

// Theater Management
router.get('/theaters', authMiddleware, isAdmin, theaterController.getTheaters);
router.get('/theaters/add', authMiddleware, isAdmin, theaterController.getAddTheaterForm);
router.post('/theaters', authMiddleware, isAdmin, uploadTheater.single('image'), [
    check('name', 'Name is required').not().isEmpty(),
    check('location', 'Location is required').not().isEmpty(),
    check('city', 'City is required').not().isEmpty(),
    check('state', 'State is required').not().isEmpty(),
    check('totalSeats', 'Total seats is required').isNumeric(),
    check('screenName', 'At least one screen is required').not().isEmpty()
], theaterController.createTheater);
router.get('/theaters/:id', authMiddleware, isAdmin, theaterController.getTheaterById);
router.get('/theaters/:id/edit', authMiddleware, isAdmin, theaterController.getEditTheaterForm);
router.put('/theaters/:id', authMiddleware, isAdmin, uploadTheater.single('image'), [
    check('name', 'Name is required').not().isEmpty(),
    check('location', 'Location is required').not().isEmpty(),
    check('city', 'City is required').not().isEmpty(),
    check('state', 'State is required').not().isEmpty(),
    check('totalSeats', 'Total seats is required').isNumeric(),
    check('screenName', 'At least one screen is required').not().isEmpty()
], theaterController.updateTheater);
router.delete('/theaters/:id', authMiddleware, isAdmin, theaterController.deleteTheater);

// Language Management
router.get('/languages', authMiddleware, isAdmin, languageController.getLanguages);
router.get('/languages/add', authMiddleware, isAdmin, languageController.getAddLanguageForm);
router.post('/languages', authMiddleware, isAdmin, [
    check('name', 'Name is required').not().isEmpty(),
    check('code', 'Code is required').not().isEmpty()
], languageController.createLanguage);
router.get('/languages/:id/edit', authMiddleware, isAdmin, languageController.getEditLanguageForm);
router.put('/languages/:id', authMiddleware, isAdmin, [
    check('name', 'Name is required').not().isEmpty(),
    check('code', 'Code is required').not().isEmpty()
], languageController.updateLanguage);
router.delete('/languages/:id', authMiddleware, isAdmin, languageController.deleteLanguage);

// Show Management
router.get('/shows', authMiddleware, isAdmin, showController.getShows);
router.get('/shows/add', authMiddleware, isAdmin, showController.getAddShowForm);
router.post('/shows', authMiddleware, isAdmin, [
    check('movieId', 'Movie is required').not().isEmpty(),
    check('theaterId', 'Theater is required').not().isEmpty(),
    check('screenId', 'Screen is required').not().isEmpty(),
    check('showDate', 'Show date is required').not().isEmpty(),
    check('price', 'Price is required').isNumeric()
], showController.createShow);
router.get('/shows/:id/edit', authMiddleware, isAdmin, showController.getEditShowForm);
router.put('/shows/:id', authMiddleware, isAdmin, [
    check('movieId', 'Movie is required').not().isEmpty(),
    check('theaterId', 'Theater is required').not().isEmpty(),
    check('screenId', 'Screen is required').not().isEmpty(),
    check('showDate', 'Show date is required').not().isEmpty(),
    check('price', 'Price is required').isNumeric()
], showController.updateShow);
router.get('/shows/:id/delete', authMiddleware, isAdmin, showController.deleteShow);
router.delete('/shows/:id', authMiddleware, isAdmin, showController.deleteShow);
router.get('/theaters/:theaterId/screens', authMiddleware, isAdmin, showController.getTheaterScreens);

// Bookings Management
router.get('/bookings', authMiddleware, isAdmin, adminController.getBookings);

// Settings Management
router.get('/settings', authMiddleware, isAdmin, settingsController.getSettingsPage);
router.post('/settings/sliders/:page', authMiddleware, isAdmin, settingsController.upload.array('banners', 10), settingsController.updateSliderBanners);
router.delete('/settings/sliders/:page/:filename', authMiddleware, isAdmin, settingsController.deleteSliderBanner);
router.post('/settings', authMiddleware, isAdmin, upload.single('logo'), adminController.updateSettings);

// Test route for shows
router.get('/test-show', authMiddleware, isAdmin, showController.testCreateShow);

// Test route for admin session
router.get('/test-session', authMiddleware, isAdmin, (req, res) => {
    res.json({
        adminUser: req.session.adminUser,
        adminUserInReq: req.adminUser,
        adminUserInLocals: res.locals.adminUser
    });
});

module.exports = router; 