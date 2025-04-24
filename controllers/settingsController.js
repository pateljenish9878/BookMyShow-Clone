const Setting = require('../models/Setting');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadPath = path.join('uploads', 'sliders');
        
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

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

exports.upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 
    }
});

exports.getSettingsPage = async (req, res) => {
    try {
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

exports.updateSliderBanners = async (req, res) => {
    try {
        const { page } = req.params; 
        
        if (!['homePage', 'allMoviesPage'].includes(page)) {
            return res.redirect('/admin/settings?flash_type=error&flash_message=Invalid+page+specified');
        }
        
        let settings = await Setting.findOne();
        if (!settings) {
            settings = new Setting();
        }
        
        if (!settings.sliderBanners) {
            settings.sliderBanners = { homePage: [], allMoviesPage: [] };
        }
        
        if (req.files && req.files.length > 0) {
            const bannerImages = req.files.map(file => file.filename);
            
            if (!settings.sliderBanners[page]) {
                settings.sliderBanners[page] = [];
            }
            
            settings.sliderBanners[page] = [...settings.sliderBanners[page], ...bannerImages];
        }
        
        settings.updatedAt = Date.now();
        
        await settings.save();
        
        return res.redirect(`/admin/settings?flash_type=success&flash_message=Slider+banners+updated+successfully`);
    } catch (error) {
        console.error('Error updating slider banners:', error);
        return res.redirect(`/admin/settings?flash_type=error&flash_message=Failed+to+update+slider+banners`);
    }
};

exports.deleteSliderBanner = async (req, res) => {
    try {
        const { page, filename } = req.params;
        
        if (!['homePage', 'allMoviesPage'].includes(page)) {
            return res.status(400).json({ success: false, message: 'Invalid page specified' });
        }
        
        const settings = await Setting.findOne();
        if (!settings || !settings.sliderBanners || !settings.sliderBanners[page]) {
            return res.status(404).json({ success: false, message: 'Settings not found' });
        }
        
        const index = settings.sliderBanners[page].indexOf(filename);
        if (index > -1) {
            settings.sliderBanners[page].splice(index, 1);
            
            const filePath = path.join('uploads', 'sliders', filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            
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