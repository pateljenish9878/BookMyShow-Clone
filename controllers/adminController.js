const User = require('../models/User');
const Movie = require('../models/Movie');
const Theater = require('../models/Theater');
const Booking = require('../models/Booking');
const Show = require('../models/Show');
const Language = require('../models/Language');
const Setting = require('../models/Setting');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');

exports.getDashboard = async (req, res) => {
    try {
        const totalMovies = await Movie.countDocuments();
        const totalTheaters = await Theater.countDocuments();
        const totalUsers = await User.countDocuments({ role: 'user' });     
        const totalAdmins = await User.countDocuments({ role: 'admin' });
        const totalBookings = await Booking.countDocuments();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const upcomingShows = await Show.find({
            showDate: { $gte: today }
        }).distinct('movieId');
        
        const currentMovies = await Movie.find({
            _id: { $in: upcomingShows }
        }).sort({ createdAt: -1 }).limit(12);
        
        const recentBookings = await Booking.find()
            .populate('user', 'name email')
            .populate('movie', 'title image')
            .populate('theater', 'name location')
            .sort({ createdAt: -1 })
            .limit(5);
        
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);
        
        const weeklyBookings = await Booking.aggregate([
            { 
                $match: { 
                    createdAt: { $gte: lastWeek, $lte: today },
                    status: { $ne: 'cancelled' }
                } 
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 },
                    revenue: { $sum: "$totalPrice" }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        const dates = [];
        const bookingCounts = [];
        const revenue = [];
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(lastWeek);
            date.setDate(lastWeek.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            
            const stats = weeklyBookings.find(item => item._id === dateStr);
            
            dates.push(dateStr);
            bookingCounts.push(stats ? stats.count : 0);
            revenue.push(stats ? stats.revenue : 0);
        }
        
        res.render('admin/dashboard', {
            user: req.adminUser,
            stats: {
                totalMovies,
                totalTheaters,
                totalUsers,
                totalAdmins,
                totalBookings
            },
            currentMovies,
            recentBookings,
            chartData: {
                dates,
                bookingCounts,
                revenue
            },
            success: req.flash('success'),
            error: req.flash('error'),
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg'),
            warning_msg: req.flash('warning_msg'),
            info_msg: req.flash('info_msg')
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/error', {
            user: req.adminUser,
            error: 'Failed to load dashboard data'
        });
    }
};

exports.getUsers = async (req, res) => {
    try {
        let filter = {};
        if (req.query.role && ['user', 'admin'].includes(req.query.role)) {
            filter.role = req.query.role;
        }
        
        const users = await User.find(filter).sort({ createdAt: -1 });
        
        const activeTab = req.query.role === 'admin' ? 'admin' : 'user';
        
        res.locals.currentUser = req.adminUser; 
        
        res.render('admin/users', {
            user: req.adminUser,
            currentUser: req.adminUser,
            users,
            query: req.query,
            activeTab,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg'),
            warning_msg: req.flash('warning_msg'),
            info_msg: req.flash('info_msg')
        });
    } catch (error) {
        console.error(error);
        res.locals.currentUser = req.adminUser; 
        
        res.render('admin/users', {
            user: req.adminUser,
            currentUser: req.adminUser,
            users: [],
            query: req.query,
            activeTab: req.query.role === 'admin' ? 'admin' : 'user',
            error_msg: 'Failed to fetch users'
        });
    }
};

exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/admin/users');
        }
        
        const queryObj = { role: user.role };
        
        res.render('admin/user-details', {
            user: req.adminUser,
            currentUser: req.adminUser,
            userDetails: user,
            query: queryObj,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg'),
            warning_msg: req.flash('warning_msg'),
            info_msg: req.flash('info_msg')
        });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Failed to fetch user');
        res.redirect('/admin/users');
    }
};

exports.getEditUserForm = async (req, res) => {
    try {
        const userDetails = await User.findById(req.params.id);
        
        if (!userDetails) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/admin/users');
        }
        
        const queryObj = { role: userDetails.role };
        
        res.render('admin/edit-user', {
            user: req.adminUser,
            currentUser: req.adminUser,
            userDetails,
            query: queryObj
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/error', {
            user: req.adminUser,
            currentUser: req.adminUser,
            error: 'Failed to fetch user',
            query: req.query 
        });
    }
};

exports.createUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('admin/add-user', {
            user: req.adminUser,
            formData: req.body,
            errors: errors.array(),
            query: req.query
        });
    }

    try {
        const { name, email, password, phone } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('admin/add-user', {
                user: req.adminUser,
                formData: req.body,
                error_msg: 'User with this email already exists',
                query: req.query
            });
        }
        
        let profilePic = null;
        if (req.file) {
            profilePic = req.file.filename;
            
            try {
                const fs = require('fs');
                const path = require('path');
                
                const profilesDir = path.join(__dirname, '../uploads/profiles');
                if (!fs.existsSync(profilesDir)) {
                    fs.mkdirSync(profilesDir, { recursive: true });
                }
                
                const sourcePath = req.file.path;
                const destPath = path.join(profilesDir, req.file.filename);
                
                if (fs.existsSync(sourcePath)) {
                    fs.copyFileSync(sourcePath, destPath);
                }
            } catch (err) {
                console.error('Error copying user profile image:', err);
            }
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            phone,
            role: 'user',
            profilePic
        });
        
        await newUser.save();
        
        req.flash('success_msg', 'User added successfully');
        res.redirect('/admin/users?role=user');
    } catch (error) {
        console.error(error);
        res.render('admin/add-user', {
            user: req.adminUser,
            formData: req.body,
            error_msg: 'Server error occurred',
            query: req.query
        });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).render('admin/edit-user', {
                user: req.adminUser,
                currentUser: req.adminUser,
                errors: errors.array(),
                userDetails: { _id: req.params.id, ...req.body },
                query: { role: req.body.role || 'user' },
                error_msg: 'Please correct the errors in the form'
            });
        }

        const { name, email, phone, role, active } = req.body;
        const userId = req.params.id;

        let user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/admin/users');
        }

        if (email !== user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).render('admin/edit-user', {
                    user: req.adminUser,
                    currentUser: req.adminUser,
                    errors: [{ msg: 'Email already in use' }],
                    userDetails: { _id: userId, ...req.body },
                    query: { role: user.role },
                    error_msg: 'This email is already in use by another user'
                });
            }
        }

        user.name = name;
        user.email = email;
        user.phone = phone;
        
        if (req.adminUser && req.adminUser._id && userId && req.adminUser._id.toString() !== userId) {
            user.role = role || user.role;
            user.active = active === 'true';
        }

        if (req.body.password && req.body.password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(req.body.password, salt);
        }

        if (req.file) {
            if (user.profilePic !== 'default-profile.png') {
                try {
                    const oldImagePath = path.join(__dirname, '../public/uploads/profiles', user.profilePic);
                    fs.unlinkSync(oldImagePath);
                } catch (err) {
                    console.error('Error deleting old profile picture:', err);
                }
            }
            user.profilePic = req.file.filename;
        }

        await user.save();
        
        req.flash('success_msg', 'User updated successfully');
        res.redirect(`/admin/users?role=${user.role}`);
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Server error occurred while updating user');
        res.redirect('/admin/users');
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;
        
        const user = await User.findById(userId);
        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/admin/users');
        }

        if (req.adminUser._id.toString() === userId) {
            req.flash('error_msg', 'You cannot delete your own account');
            return res.redirect('/admin/users');
        }

        const userRole = user.role; 
        
        await User.findByIdAndDelete(userId);
        
        req.flash('success_msg', 'User deleted successfully');
        res.redirect(`/admin/users?role=${userRole}`);
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Server error occurred while deleting user');
        res.redirect('/admin/users');
    }
};

exports.getBookings = async (req, res) => {
    try {
        const bookings = await Booking.find()
            .sort({ createdAt: -1 })
            .populate('user', 'name email')
            .populate('movie', 'title image')
            .populate('theater', 'name location');
        
        res.render('admin/bookings', {
            user: req.adminUser,
            bookings
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/bookings', {
            user: req.adminUser,
            error: 'Failed to fetch bookings',
            bookings: []
        });
    }
};

exports.getSettings = async (req, res) => {
    try {
        const settings = await Setting.findOne();
        
        res.render('admin/settings', {
            user: req.adminUser,
            settings
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/error', {
            user: req.adminUser,
            error: 'Failed to fetch settings'
        });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const {
            siteName,
            siteDescription,
            contactEmail,
            contactPhone,
            address,
            facebook,
            twitter,
            instagram,
            currency
        } = req.body;

        let settings = await Setting.findOne();
        if (!settings) {
            settings = new Setting();
        }

        settings.siteName = siteName;
        settings.siteDescription = siteDescription;
        settings.contactEmail = contactEmail;
        settings.contactPhone = contactPhone;
        settings.address = address;
        settings.socialLinks = {
            facebook,
            twitter,
            instagram
        };
        settings.currency = currency;
        settings.updatedAt = Date.now();

        if (req.file) {
            settings.logo = req.file.filename;
        }

        await settings.save();
        
        res.redirect('/admin/settings');
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/settings', {
            user: req.adminUser,
            errors: [{ msg: 'Server error' }],
            settings: req.body
        });
    }
};

exports.createAdmin = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('admin/add-admin', {
            user: req.adminUser,
            formData: req.body,
            errors: errors.array(),
            query: req.query 
        });
    }

    try {
        const { name, email, password, phone } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('admin/add-admin', {
                user: req.adminUser,
                formData: req.body,
                error_msg: 'User with this email already exists',
                query: req.query
            });
        }
        
        let profilePic = null;
        if (req.file) {
            profilePic = req.file.filename;
            
            try {
                const fs = require('fs');
                const path = require('path');
                
                const profilesDir = path.join(__dirname, '../uploads/profiles');
                if (!fs.existsSync(profilesDir)) {
                    fs.mkdirSync(profilesDir, { recursive: true });
                }
                
                const sourcePath = req.file.path;
                const destPath = path.join(profilesDir, req.file.filename);
                
                if (fs.existsSync(sourcePath)) {
                    fs.copyFileSync(sourcePath, destPath);
                }
            } catch (err) {
                console.error('Error copying admin profile image:', err);
            }
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            phone,
            role: 'admin',
            profilePic
        });
        
        await newUser.save();
        
        req.flash('success_msg', 'Administrator added successfully');
        res.redirect('/admin/users?role=admin');
    } catch (error) {
        console.error(error);
        res.render('admin/add-admin', {
            user: req.adminUser,
            formData: req.body,
            error_msg: 'Server error occurred',
            query: req.query
        });
    }
}; 