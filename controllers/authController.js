const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const passport = require('passport');
const { generateOTP, sendPasswordResetOTP } = require('../utils/emailService');

// Admin login
exports.adminLogin = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('admin-login', { 
            formData: req.body,
            errors: errors.array(),
            error: errors.array().map(err => err.msg).join(', ')
        });
    }

    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error(err);
            return res.render('admin-login', { 
                formData: req.body,
                error: 'Server error occurred'
            });
        }
        
        if (!user) {
            return res.render('admin-login', { 
                formData: { email: req.body.email },
                error: info.message || 'Invalid email or password'
            });
        }
        
        // Check if user has role 'admin'
        if (user.role !== 'admin') {
            return res.render('admin-login', { 
                formData: { email: req.body.email },
                error: 'You do not have admin access'
            });
        }
        
        // Check if user is active
        if (!user.active) {
            return res.render('admin-login', { 
                formData: { email: req.body.email },
                error: 'Your account has been deactivated. Please contact the administrator.'
            });
        }
        
        req.login(user, (err) => {
            if (err) {
                console.error(err);
                return res.render('admin-login', { 
                    formData: req.body,
                    error: 'Server error occurred during login'
                });
            }
            
            // Set admin user in session (separate from regular user)
            req.session.adminUser = {
                _id: user._id.toString(), // Store ID as string to avoid toString() issues
                id: user._id.toString(),  // Include both formats for compatibility
                name: user.name,
                email: user.email,
                role: user.role,
                profilePic: user.profilePic || 'default-profile.png' // Include profile picture
            };
            
            // No longer clearing the user session - allow both to exist simultaneously
            console.log('Admin login successful, maintaining any existing user session');
            
            // Create success message
            const successMessage = `Welcome, ${user.name}! You have successfully logged into the admin panel.`;
            
            // Redirect with flash parameter in URL (more reliable than req.flash for immediate redirect)
            return res.redirect(`/admin/dashboard?flash_type=success&flash_message=${encodeURIComponent(successMessage)}`);
        });
    })(req, res, next);
};

// Logout user
exports.logout = (req, res, next) => {
    // Check if this is an admin or user logout based on the request path
    const isAdminLogout = req.path.includes('/admin') || req.originalUrl.includes('/admin');
    
    // Get user info before clearing session
    const userName = isAdminLogout ? 
                    (req.session.adminUser ? req.session.adminUser.name : 'Admin') : 
                    (req.session.user ? req.session.user.name : 'User');
    
    // Only clear the relevant session, not both
    if (req.session) {
        if (isAdminLogout) {
            // Only clear the admin session data
            console.log('Clearing only admin session data, preserving user session');
            req.session.adminUser = null;
            
            // Create logout message
            const logoutMessage = `${userName} has been logged out successfully`;
            
            // Redirect to admin login with toast message
            return res.redirect(`/admin/login?flash_type=success&flash_message=${encodeURIComponent(logoutMessage)}`);
        } else {
            // Only clear the user session data
            console.log('Clearing only user session data, preserving admin session');
            req.session.user = null;
            
            // Clear any booking details as well
            req.session.bookingDetails = null;
            req.session.lastBookingId = null;
            
            // Create logout message
            const logoutMessage = `${userName} has been logged out successfully`;
            
            // Redirect to home with toast message
            return res.redirect(`/?flash_type=success&flash_message=${encodeURIComponent(logoutMessage)}`);
        }
    } else {
        // Create logout message
        const logoutMessage = `${userName} has been logged out successfully`;
        
        // Redirect based on logout source with toast message as URL parameter
        if (isAdminLogout) {
            res.redirect(`/admin/login?flash_type=success&flash_message=${encodeURIComponent(logoutMessage)}`);
        } else {
            res.redirect(`/?flash_type=success&flash_message=${encodeURIComponent(logoutMessage)}`);
        }
    }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ msg: 'Not authenticated' });
        }
        res.json(req.user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Server error' });
    }
};

exports.register = async (req, res) => {
    try {
        const { name, email, password, phone, role } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create new user
        const user = new User({
            name,
            email,
            password: hashedPassword,
            phone,
            role: role || 'user'
        });
        
        await user.save();
        
        const userData = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        };
        
        // Set the appropriate session based on role
        if (user.role === 'admin') {
            // Set admin session
            req.session.adminUser = userData;
            return res.redirect('/admin/dashboard');
        } else {
            // Set regular user session
            req.session.user = userData;
            return res.redirect('/');
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        
        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        
        // Create consistent user data object for session
        const userData = {
            _id: user._id.toString(), // Store ID as string to avoid toString() issues
            id: user._id.toString(),  // Include both formats for compatibility
            name: user.name,
            email: user.email,
            role: user.role,
            profilePic: user.profilePic || 'default-profile.png' // Include profile picture
        };
        
        // Set the appropriate session based on role and EXPLICITLY clear the other session
        if (user.role === 'admin') {
            // Set admin session
            req.session.adminUser = userData;
            req.session.user = null; // Explicitly clear user session
            return res.redirect('/admin/dashboard');
        } else {
            // Set regular user session
            req.session.user = userData;
            req.session.adminUser = null; // Explicitly clear admin session
            return res.redirect('/');
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getUser = (req, res) => {
    res.json({ success: true, user: req.session.user });
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        
        // Find user
        const user = await User.findOne({ email, role: 'admin' });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Admin account not found with this email' });
        }
        
        // Generate OTP
        const otp = generateOTP();
        
        // Set OTP expiry (15 minutes)
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 15);
        
        // Save OTP to user
        user.resetPasswordOTP = otp;
        user.resetPasswordOTPExpiry = otpExpiry;
        await user.save();
        
        // Send OTP email
        await sendPasswordResetOTP(user.email, otp);
        
        return res.status(200).json({ 
            success: true, 
            message: 'Password reset OTP sent to your email',
            email: user.email
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        
        // Find user
        const user = await User.findOne({ 
            email,
            resetPasswordOTP: otp,
            resetPasswordOTPExpiry: { $gt: new Date() }
        });
        
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired OTP' 
            });
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Update password and clear OTP fields
        user.password = hashedPassword;
        user.resetPasswordOTP = undefined;
        user.resetPasswordOTPExpiry = undefined;
        await user.save();
        
        return res.status(200).json({ 
            success: true, 
            message: 'Password reset successful' 
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.authenticate = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/user/login');
    }
    next();
};

exports.authenticateAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/login');
    }
    next();
};

// User login
exports.userLogin = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('user-login', { 
            formData: req.body,
            searchQuery: '',
            errors: errors.array(),
            error: errors.array().map(err => err.msg).join(', ')
        });
    }

    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.render('user-login', { 
                formData: { email },
                searchQuery: '',
                error: 'Invalid email or password'
            });
        }
        
        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('user-login', { 
                formData: { email },
                searchQuery: '',
                error: 'Invalid email or password'
            });
        }
        
        // Check if user is active
        if (!user.active) {
            return res.render('user-login', { 
                formData: { email },
                searchQuery: '',
                error: 'Your account has been deactivated. Please contact the administrator.'
            });
        }
        
        // Set user in session with consistent structure
        req.session.user = {
            _id: user._id.toString(), // Store ID as string to avoid toString() issues
            id: user._id.toString(),  // Include both formats for compatibility
            name: user.name,
            email: user.email,
            role: user.role,
            profilePic: user.profilePic || 'default-profile.png'
        };
        
        // No longer clearing the admin session - allow both to exist simultaneously
        console.log('User login successful, maintaining any existing admin session');
        
        // If the user was trying to book a movie, redirect to that page
        // Make sure redirectTo never points to admin pages
        let redirectUrl = req.session.redirectTo || '/';
        if (redirectUrl.includes('/admin')) {
            redirectUrl = '/';
        }
        delete req.session.redirectTo;
        
        req.flash('success', `Welcome back, ${user.name}! You have successfully logged in.`);
        return res.redirect(redirectUrl);
    } catch (err) {
        console.error(err);
        return res.render('user-login', { 
            formData: req.body,
            searchQuery: '',
            error: 'Server error occurred during login'
        });
    }
};

// Register new user
exports.registerUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('user-register', { 
            formData: req.body,
            searchQuery: '',
            errors: errors.array(),
            error: errors.array().map(err => err.msg).join(', ')
        });
    }

    try {
        const { name, email, password, phone } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('user-register', { 
                formData: req.body,
                searchQuery: '',
                error: 'User already exists with this email'
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create user data object
        const userData = {
            name,
            email,
            password: hashedPassword,
            phone,
            role: 'user', // Default role for self-registered users
            active: true
        };
        
        // Handle profile image if uploaded
        if (req.file) {
            userData.profilePic = req.file.filename;
        }
        
        // Create new user
        const user = new User(userData);
        await user.save();
        
        // Set user in session with consistent structure
        req.session.user = {
            _id: user._id.toString(),
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            profilePic: user.profilePic || 'default-profile.png'
        };
        
        // Explicitly clear the adminUser session to avoid contamination
        req.session.adminUser = null;
        
        // If the user was trying to book a movie, redirect to that page
        const redirectUrl = req.session.redirectTo || '/';
        delete req.session.redirectTo;
        
        req.flash('success', `Account created successfully! Welcome to BookMyShow, ${user.name}.`);
        return res.redirect(redirectUrl);
    } catch (err) {
        console.error(err);
        return res.render('user-register', { 
            formData: req.body,
            searchQuery: '',
            error: 'Server error occurred during registration'
        });
    }
};

// Get user profile
exports.getUserProfile = async (req, res) => {
    try {
        // ONLY use the user session, never use admin session for user profile
        if (!req.session.user || !req.session.user.id) {
            return res.status(401).redirect('/user/login');
        }
        
        const userId = req.session.user.id; // Only use the user session ID
        
        // Find the user in the database
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).render('error', { 
                message: 'User not found',
                searchQuery: ''
            });
        }
        
        // Render the user profile page
        res.render('user-profile', { 
            user,
            success: req.query.success || false,
            errors: [],
            searchQuery: ''
        });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { 
            message: 'Server error occurred while loading profile',
            searchQuery: ''
        });
    }
};

// Update user profile
exports.updateUserProfile = async (req, res) => {
    try {
        // Get the current user ID from the session
        const userId = req.session.user && req.session.user.id ? req.session.user.id : 
                       (req.session.user && req.session.user._id ? req.session.user._id : null);
        
        if (!userId) {
            return res.status(401).render('error', { 
                message: 'Authentication required' 
            });
        }
        
        // Find the user in the database
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).render('error', { 
                message: 'User not found' 
            });
        }
        
        // Update user fields
        const { name, email, phone } = req.body;
        
        user.name = name || user.name;
        user.phone = phone || user.phone;
        
        // Update email only if it has changed
        if (email !== user.email) {
            // Check if email exists
            const existingUser = await User.findOne({ email, _id: { $ne: userId } });
            if (existingUser) {
                return res.render('user-profile', {
                    user,
                    errors: [{ msg: 'Email already in use by another account' }],
                    success: false,
                    searchQuery: ''
                });
            }
            user.email = email;
        }
        
        // Handle profile image if uploaded
        if (req.file) {
            // If user already has a custom profile pic and it's not the default, delete it
            if (user.profilePic && user.profilePic !== 'default-profile.png') {
                const fs = require('fs');
                const path = require('path');
                const oldImagePath = path.join(__dirname, '../uploads/users/', user.profilePic);
                
                // Check if file exists before attempting to delete
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            
            // Update to new profile picture
            user.profilePic = req.file.filename;
        }
        
        // Save the updated user
        await user.save();
        
        // Update session data with consistent structure
        if (req.session.user) {
            req.session.user = {
                ...req.session.user,
                _id: user._id.toString(),
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                profilePic: user.profilePic || 'default-profile.png'
            };
        }
        
        // Redirect to profile page with success message
        res.redirect('/user/profile?success=true');
    } catch (err) {
        console.error(err);
        res.status(500).render('user-profile', {
            user: req.body,
            errors: [{ msg: 'Server error occurred while updating profile' }],
            success: false,
            searchQuery: ''
        });
    }
};

// Change user password
exports.changeUserPassword = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('user-change-password', { 
            errors: errors.array(),
            success: false,
            searchQuery: ''
        });
    }

    try {
        // ONLY use the user session data for changing password
        if (!req.session.user || !req.session.user.id) {
            return res.status(401).redirect('/user/login');
        }
        
        const userId = req.session.user.id;
        
        // Find the user in the database
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).render('error', { 
                message: 'User not found' 
            });
        }
        
        // Verify current password
        const { currentPassword, newPassword } = req.body;
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        
        if (!isMatch) {
            return res.status(400).render('user-change-password', { 
                errors: [{ msg: 'Current password is incorrect' }],
                success: false,
                searchQuery: ''
            });
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Update password
        user.password = hashedPassword;
        await user.save();
        
        // Render success message
        res.render('user-change-password', {
            errors: [],
            success: true,
            searchQuery: ''
        });
    } catch (err) {
        console.error(err);
        res.status(500).render('user-change-password', {
            errors: [{ msg: 'Server error occurred while changing password' }],
            success: false,
            searchQuery: ''
        });
    }
};

// User forgot password
exports.userForgotPassword = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('user-forgot-password', { 
            errors: errors.array(),
            formData: req.body,
            searchQuery: ''
        });
    }

    try {
        const { email } = req.body;
        
        // Find user with role 'user'
        const user = await User.findOne({ email, role: 'user' });
        if (!user) {
            return res.status(404).render('user-forgot-password', { 
                errors: [{ msg: 'No user account found with this email' }],
                formData: { email },
                searchQuery: ''
            });
        }
        
        // Check if user is active
        if (!user.active) {
            return res.status(403).render('user-forgot-password', { 
                errors: [{ msg: 'Your account has been deactivated. Please contact support.' }],
                formData: { email },
                searchQuery: ''
            });
        }
        
        // Generate OTP
        const otp = generateOTP();
        
        // Set OTP expiry (15 minutes)
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 15);
        
        // Save OTP to user
        user.resetPasswordOTP = otp;
        user.resetPasswordOTPExpiry = otpExpiry;
        await user.save();
        
        // Send OTP email
        await sendPasswordResetOTP(user.email, otp);
        
        // Render success message
        return res.render('user-reset-password', { 
            email: user.email,
            success: false,
            errors: [],
            searchQuery: ''
        });
    } catch (err) {
        console.error('Error in userForgotPassword:', err);
        return res.status(500).render('user-forgot-password', { 
            errors: [{ msg: 'Server error occurred. Please try again later.' }],
            formData: req.body,
            searchQuery: ''
        });
    }
};

// User reset password
exports.userResetPassword = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('user-reset-password', { 
            errors: errors.array(),
            email: req.body.email,
            searchQuery: ''
        });
    }

    try {
        const { email, otp, newPassword, confirmPassword } = req.body;
        
        // Check if passwords match
        if (newPassword !== confirmPassword) {
            return res.status(400).render('user-reset-password', { 
                errors: [{ msg: 'Passwords do not match' }],
                email,
                searchQuery: ''
            });
        }
        
        // Find user with valid OTP
        const user = await User.findOne({ 
            email,
            role: 'user',
            resetPasswordOTP: otp,
            resetPasswordOTPExpiry: { $gt: new Date() }
        });
        
        if (!user) {
            return res.status(400).render('user-reset-password', { 
                errors: [{ msg: 'Invalid or expired reset code' }],
                email,
                searchQuery: ''
            });
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Update password and clear OTP fields
        user.password = hashedPassword;
        user.resetPasswordOTP = undefined;
        user.resetPasswordOTPExpiry = undefined;
        await user.save();
        
        // Show success message
        return res.render('user-reset-password', { 
            success: true,
            errors: [],
            searchQuery: ''
        });
    } catch (err) {
        console.error('Error in userResetPassword:', err);
        return res.status(500).render('user-reset-password', { 
            errors: [{ msg: 'Server error occurred. Please try again later.' }],
            email: req.body.email,
            searchQuery: ''
        });
    }
}; 