const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const passport = require('passport');
const { generateOTP, sendPasswordResetOTP } = require('../utils/emailService');
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
        
        if (user.role !== 'admin') {
            return res.render('admin-login', { 
                formData: { email: req.body.email },
                error: 'You do not have admin access'
            });
        }
        
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
            
            req.session.adminUser = {
                _id: user._id.toString(), 
                id: user._id.toString(),  
                name: user.name,
                email: user.email,
                role: user.role,
                profilePic: user.profilePic || 'default-profile.png' 
            };
            
            const successMessage = `Welcome, ${user.name}! You have successfully logged into the admin panel.`;
            
            return res.redirect(`/admin/dashboard?flash_type=success&flash_message=${encodeURIComponent(successMessage)}`);
        });
    })(req, res, next);
};

exports.logout = (req, res, next) => {
    const isAdminLogout = req.path.includes('/admin') || req.originalUrl.includes('/admin');
    
    const userName = isAdminLogout ? 
                    (req.session.adminUser ? req.session.adminUser.name : 'Admin') : 
                    (req.session.user ? req.session.user.name : 'User');
    
    if (req.session) {
        if (isAdminLogout) {
            req.session.adminUser = null;
            
            const logoutMessage = `${userName} has been logged out successfully`;
            
            return res.redirect(`/admin/login?flash_type=success&flash_message=${encodeURIComponent(logoutMessage)}`);
        } else {
            req.session.user = null;
            
            req.session.bookingDetails = null;
            req.session.lastBookingId = null;
            
            const logoutMessage = `${userName} has been logged out successfully`;
            
            return res.redirect(`/?flash_type=success&flash_message=${encodeURIComponent(logoutMessage)}`);
        }
    } else {
        const logoutMessage = `${userName} has been logged out successfully`;
        
        if (isAdminLogout) {
            res.redirect(`/admin/login?flash_type=success&flash_message=${encodeURIComponent(logoutMessage)}`);
        } else {
            res.redirect(`/?flash_type=success&flash_message=${encodeURIComponent(logoutMessage)}`);
        }
    }
};

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
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
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
        
        if (user.role === 'admin') {
            req.session.adminUser = userData;
            return res.redirect('/admin/dashboard');
        } else {
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
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        
        const userData = {
            _id: user._id.toString(), 
            id: user._id.toString(),  
            name: user.name,
            email: user.email,
            role: user.role,
            profilePic: user.profilePic || 'default-profile.png' 
        };
        
        if (user.role === 'admin') {
            req.session.adminUser = userData;
            req.session.user = null; 
            return res.redirect('/admin/dashboard');
        } else {
            req.session.user = userData;
            req.session.adminUser = null; 
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
        
        const user = await User.findOne({ email, role: 'admin' });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Admin account not found with this email' });
        }
        
        const otp = generateOTP();
        
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 15);
        
        user.resetPasswordOTP = otp;
        user.resetPasswordOTPExpiry = otpExpiry;
        await user.save();
        
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
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
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
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.render('user-login', { 
                formData: { email },
                searchQuery: '',
                error: 'Invalid email or password'
            });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('user-login', { 
                formData: { email },
                searchQuery: '',
                error: 'Invalid email or password'
            });
        }
        
        if (!user.active) {
            return res.render('user-login', { 
                formData: { email },
                searchQuery: '',
                error: 'Your account has been deactivated. Please contact the administrator.'
            });
        }
        
        req.session.user = {
            _id: user._id.toString(), 
            id: user._id.toString(),  
            name: user.name,
            email: user.email,
            role: user.role,
            profilePic: user.profilePic || 'default-profile.png'
        };
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
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('user-register', { 
                formData: req.body,
                searchQuery: '',
                error: 'User already exists with this email'
            });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const userData = {
            name,
            email,
            password: hashedPassword,
            phone,
            role: 'user', 
            active: true
        };
        
        if (req.file) {
            userData.profilePic = req.file.filename;
        }
        
        const user = new User(userData);
        await user.save();
        
        req.session.user = {
            _id: user._id.toString(),
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            profilePic: user.profilePic || 'default-profile.png'
        };
        
        req.session.adminUser = null;
        
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

exports.getUserProfile = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.id) {
            return res.status(401).redirect('/user/login');
        }
        
        const userId = req.session.user.id; // Only use the user session ID
        
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).render('error', { 
                message: 'User not found',
                searchQuery: ''
            });
        }
        
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

exports.updateUserProfile = async (req, res) => {
    try {
        const userId = req.session.user && req.session.user.id ? req.session.user.id : 
                       (req.session.user && req.session.user._id ? req.session.user._id : null);
        
        if (!userId) {
            return res.status(401).render('error', { 
                message: 'Authentication required' 
            });
        }
        
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).render('error', { 
                message: 'User not found' 
            });
        }
        
        const { name, email, phone } = req.body;
        
        user.name = name || user.name;
        user.phone = phone || user.phone;
        
        if (email !== user.email) {
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
        
        if (req.file) {
            if (user.profilePic && user.profilePic !== 'default-profile.png') {
                const fs = require('fs');
                const path = require('path');
                const oldImagePath = path.join(__dirname, '../uploads/users/', user.profilePic);
                
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            
            user.profilePic = req.file.filename;
        }
        
        await user.save();
        
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
        if (!req.session.user || !req.session.user.id) {
            return res.status(401).redirect('/user/login');
        }
        
        const userId = req.session.user.id;
        
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).render('error', { 
                message: 'User not found' 
            });
        }
        
        const { currentPassword, newPassword } = req.body;
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        
        if (!isMatch) {
            return res.status(400).render('user-change-password', { 
                errors: [{ msg: 'Current password is incorrect' }],
                success: false,
                searchQuery: ''
            });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        user.password = hashedPassword;
        await user.save();
        
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
        
        const user = await User.findOne({ email, role: 'user' });
        if (!user) {
            return res.status(404).render('user-forgot-password', { 
                errors: [{ msg: 'No user account found with this email' }],
                formData: { email },
                searchQuery: ''
            });
        }
        
        if (!user.active) {
            return res.status(403).render('user-forgot-password', { 
                errors: [{ msg: 'Your account has been deactivated. Please contact support.' }],
                formData: { email },
                searchQuery: ''
            });
        }
        
        const otp = generateOTP();
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 15);
        
        user.resetPasswordOTP = otp;
        user.resetPasswordOTPExpiry = otpExpiry;
        await user.save();
        
        await sendPasswordResetOTP(user.email, otp);
        
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
        
        if (newPassword !== confirmPassword) {
            return res.status(400).render('user-reset-password', { 
                errors: [{ msg: 'Passwords do not match' }],
                email,
                searchQuery: ''
            });
        }
        
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
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        user.password = hashedPassword;
        user.resetPasswordOTP = undefined;
        user.resetPasswordOTPExpiry = undefined;
        await user.save();
        
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