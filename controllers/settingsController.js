const Setting = require('../models/Setting');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Configure multer storage for file uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadPath = path.join('uploads', 'sliders');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        cb(null, uploadPath);
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'slider-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter to only accept images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

// Initialize multer upload
exports.upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max size
    }
});

// Show settings page
exports.getSettingsPage = async (req, res) => {
    try {
        // Get existing settings or create default
        let settings = await Setting.findOne();
        
        if (!settings) {
            settings = new Setting();
            await settings.save();
        }
        
        res.render('admin/settings', {
            user: req.user,
            settings,
            success: req.flash('success'),
            error: req.flash('error')
        });
    } catch (error) {
        console.error('Error getting settings:', error);
        req.flash('error', 'Failed to load settings');
        res.redirect('/admin');
    }
};

// Update slider banners
exports.updateSliderBanners = async (req, res) => {
    try {
        const { page } = req.params; // 'homePage' or 'allMoviesPage'
        
        if (!['homePage', 'allMoviesPage'].includes(page)) {
            return res.redirect('/admin/settings?flash_type=error&flash_message=Invalid+page+specified');
        }
        
        // Get existing settings or create default
        let settings = await Setting.findOne();
        if (!settings) {
            settings = new Setting();
        }
        
        // Initialize sliderBanners if not defined
        if (!settings.sliderBanners) {
            settings.sliderBanners = { homePage: [], allMoviesPage: [] };
        }
        
        // Add new banner images if files were uploaded
        if (req.files && req.files.length > 0) {
            // Add filenames to the appropriate page array
            const bannerImages = req.files.map(file => file.filename);
            
            if (!settings.sliderBanners[page]) {
                settings.sliderBanners[page] = [];
            }
            
            // Add the new banner images
            settings.sliderBanners[page] = [...settings.sliderBanners[page], ...bannerImages];
        }
        
        // Update updatedAt timestamp
        settings.updatedAt = Date.now();
        
        await settings.save();
        
        return res.redirect(`/admin/settings?flash_type=success&flash_message=Slider+banners+updated+successfully`);
    } catch (error) {
        console.error('Error updating slider banners:', error);
        return res.redirect(`/admin/settings?flash_type=error&flash_message=Failed+to+update+slider+banners`);
    }
};

// Delete slider banner
exports.deleteSliderBanner = async (req, res) => {
    try {
        const { page, filename } = req.params;
        
        if (!['homePage', 'allMoviesPage'].includes(page)) {
            return res.status(400).json({ success: false, message: 'Invalid page specified' });
        }
        
        // Get existing settings
        const settings = await Setting.findOne();
        if (!settings || !settings.sliderBanners || !settings.sliderBanners[page]) {
            return res.status(404).json({ success: false, message: 'Settings not found' });
        }
        
        // Remove the file from the array
        const index = settings.sliderBanners[page].indexOf(filename);
        if (index > -1) {
            settings.sliderBanners[page].splice(index, 1);
            
            // Delete the file from the filesystem
            const filePath = path.join('uploads', 'sliders', filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            
            // Update settings
            settings.updatedAt = Date.now();
            await settings.save();
            
            return res.json({ success: true, message: 'Banner deleted successfully' });
        } else {
            return res.status(404).json({ success: false, message: 'Banner not found' });
        }
    } catch (error) {
        console.error('Error deleting slider banner:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete banner' });
    }
}; 