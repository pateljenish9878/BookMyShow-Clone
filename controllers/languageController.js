const Language = require('../models/Language');
const { validationResult } = require('express-validator');

// Get all languages
exports.getLanguages = async (req, res) => {
    try {
        const languages = await Language.find().sort({ name: 1 });
        
        res.render('admin/languages', {
            user: req.user,
            languages
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/languages', {
            user: req.user,
            error: 'Failed to fetch languages'
        });
    }
};

// Add language form
exports.getAddLanguageForm = (req, res) => {
    res.render('admin/add-language', {
        user: req.user
    });
};

// Create language
exports.createLanguage = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).render('admin/add-language', {
                user: req.user,
                errors: errors.array(),
                formData: req.body
            });
        }

        const { name, code, status } = req.body;

        // Check if language exists
        const existingLanguage = await Language.findOne({ 
            $or: [
                { name: name },
                { code: code }
            ]
        });
        
        if (existingLanguage) {
            return res.status(400).render('admin/add-language', {
                user: req.user,
                errors: [{ msg: 'Language already exists' }],
                formData: req.body
            });
        }

        // Create new language
        const newLanguage = new Language({
            name,
            code,
            status: status === 'true'
        });

        await newLanguage.save();
        
        req.flash('success', 'Language created successfully');
        res.redirect('/admin/languages');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Failed to create language');
        res.redirect('/admin/add-language');
    }
};

// Edit language form
exports.getEditLanguageForm = async (req, res) => {
    try {
        const language = await Language.findById(req.params.id);
        
        if (!language) {
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Language not found'
            });
        }
        
        res.render('admin/edit-language', {
            user: req.user,
            language
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/error', {
            user: req.user,
            error: 'Failed to fetch language'
        });
    }
};

// Update language
exports.updateLanguage = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).render('admin/edit-language', {
                user: req.user,
                errors: errors.array(),
                language: { _id: req.params.id, ...req.body }
            });
        }

        const { name, code, status } = req.body;
        const languageId = req.params.id;

        // Check if language exists
        let language = await Language.findById(languageId);
        if (!language) {
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Language not found'
            });
        }

        // Check if the updated code or name already exists for another language
        if (name !== language.name || code !== language.code) {
            const existingLanguage = await Language.findOne({ 
                $and: [
                    { _id: { $ne: languageId } },
                    { $or: [
                        { name },
                        { code }
                    ]}
                ]
            });
            
            if (existingLanguage) {
                return res.status(400).render('admin/edit-language', {
                    user: req.user,
                    errors: [{ msg: 'Language with this name or code already exists' }],
                    language: { _id: languageId, ...req.body }
                });
            }
        }

        // Update language
        language.name = name;
        language.code = code;
        language.status = status === 'true';

        await language.save();
        
        req.flash('success', 'Language updated successfully');
        res.redirect('/admin/languages');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Failed to update language');
        res.redirect(`/admin/languages/edit/${req.params.id}`);
    }
};

// Delete language
exports.deleteLanguage = async (req, res) => {
    try {
        const languageId = req.params.id;
        
        // Check if language exists
        const language = await Language.findById(languageId);
        if (!language) {
            req.flash('error', 'Language not found');
            return res.redirect('/admin/languages');
        }

        // Delete language
        await Language.findByIdAndDelete(languageId);
        
        req.flash('success', 'Language deleted successfully');
        res.redirect('/admin/languages');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Server error');
        res.redirect('/admin/languages');
    }
}; 