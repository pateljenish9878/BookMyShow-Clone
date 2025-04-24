const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { check } = require('express-validator');
const adminController = require('../controllers/adminController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/users');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'profile-' + uniqueSuffix + ext);
    }
});

const uploadProfile = multer({
    storage: profileStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        cb(null, true); 
    }
    
});

router.get('/admin/login', (req, res) => {
    res.render('admin-login', { 
        formData: {},
        errors: []
    });
});

router.post('/admin/login', [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
], authController.adminLogin);

router.post('/logout', authController.logout);
router.get('/logout', authController.logout);

router.post('/admin/logout', authController.logout);
router.get('/admin/logout', (req, res) => {
    req.session.adminUser = null;
    res.redirect('/admin/login');
});

router.get('/user', authController.authenticate, authController.getUser);

router.post('/forgot-password', [
    check('email', 'Please include a valid email').isEmail()
], authController.forgotPassword);

router.post('/reset-password', [
    check('email', 'Please include a valid email').isEmail(),
    check('otp', 'OTP is required').not().isEmpty(),
    check('newPassword', 'Password must be at least 6 characters').isLength({ min: 6 })
], authController.resetPassword);

router.get('/login', (req, res) => {
    res.redirect('/admin/login');
});

router.get('/user/login', (req, res) => {
    res.render('user-login', { 
        formData: {},
        errors: []
    });
});

router.post('/user/login', [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
], authController.userLogin);

router.get('/user/register', (req, res) => {
    res.render('user-register', { 
        formData: {},
        errors: []
    });
});

router.post('/user/register', 
    uploadProfile.single('profilePic'),
    [
        check('name', 'Name is required').not().isEmpty(),
        check('email', 'Please include a valid email').isEmail(),
        check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
        check('confirmPassword').custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
    ], 
    authController.registerUser
);

router.get('/user/profile', authController.authenticate, authController.getUserProfile);
router.post('/user/profile', authController.authenticate, uploadProfile.single('profilePic'), authController.updateUserProfile);

router.get('/user/change-password', authController.authenticate, (req, res) => {
    res.render('user-change-password', { 
        errors: [],
        success: false
    });
});

router.post('/user/change-password', 
    authController.authenticate, 
    [
        check('currentPassword', 'Current password is required').not().isEmpty(),
        check('newPassword', 'New password must be at least 6 characters').isLength({ min: 6 }),
        check('confirmPassword').custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
    ],
    authController.changeUserPassword
);

router.get('/user/forgot-password', (req, res) => {
    res.render('user-forgot-password', { 
        formData: {},
        errors: [],
        searchQuery: ''
    });
});

router.post('/user/forgot-password', [
    check('email', 'Please include a valid email').isEmail()
], authController.userForgotPassword);

router.get('/user/reset-password', (req, res) => {
    res.render('user-reset-password', { 
        email: req.query.email || '',
        errors: [],
        success: false,
        searchQuery: ''
    });
});

router.post('/user/reset-password', [
    check('email', 'Please include a valid email').isEmail(),
    check('otp', 'Reset code is required').not().isEmpty(),
    check('newPassword', 'Password must be at least 6 characters').isLength({ min: 6 }),
    check('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.newPassword) {
            throw new Error('Passwords do not match');
        }
        return true;
    })
], authController.userResetPassword);

module.exports = router; 