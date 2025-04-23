const Movie = require('../models/Movie');
const Language = require('../models/Language');
const { validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');

// Get all movies for admin
exports.getAdminMovies = async (req, res) => {
    try {
        const movies = await Movie.find().sort({ releaseDate: -1 });
        
        res.render('admin/movies', {
            user: req.user,
            movies,
            searchQuery: ''
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/movies', {
            user: req.user,
            error: 'Failed to fetch movies',
            searchQuery: ''
        });
    }
};

// Get movie details
exports.getMovieDetails = async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        
        if (!movie) {
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Movie not found',
                searchQuery: ''
            });
        }
        
        res.render('admin/movie-detail', {
            user: req.user,
            movie,
            searchQuery: ''
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/error', {
            user: req.user,
            error: 'Failed to fetch movie',
            searchQuery: ''
        });
    }
};

// Add movie form
exports.getAddMovieForm = async (req, res) => {
    try {
        const languages = await Language.find({ status: true }).sort({ name: 1 });
        
        res.render('admin/add-movie', {
            user: req.user,
            languages,
            searchQuery: ''
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/error', {
            user: req.user,
            error: 'Failed to load movie form data',
            searchQuery: ''
        });
    }
};

// Create movie
exports.createMovie = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const languages = await Language.find({ status: true }).sort({ name: 1 });
            
            return res.status(400).render('admin/add-movie', {
                user: req.user,
                errors: errors.array(),
                formData: req.body,
                languages,
                searchQuery: ''
            });
        }

        const {
            title,
            category,
            duration,
            ratings,
            releaseDate,
            description,
            status,
            language,
            recommended
        } = req.body;

        // Check if title already exists
        const existingMovie = await Movie.findOne({ title });
        if (existingMovie) {
            const languages = await Language.find({ status: true }).sort({ name: 1 });
            
            return res.status(400).render('admin/add-movie', {
                user: req.user,
                errors: [{ msg: 'Movie with this title already exists' }],
                formData: req.body,
                languages,
                searchQuery: ''
            });
        }

        // Check if files are uploaded
        if (!req.files || !req.files.image || !req.files.backgroundImage) {
            const languages = await Language.find({ status: true }).sort({ name: 1 });
            
            return res.status(400).render('admin/add-movie', {
                user: req.user,
                errors: [{ msg: 'Please upload both image and background image' }],
                formData: req.body,
                languages,
                searchQuery: ''
            });
        }

        // Create new movie
        const newMovie = new Movie({
            title,
            image: req.files.image[0].filename,
            backgroundImage: req.files.backgroundImage[0].filename,
            category,
            duration,
            ratings,
            releaseDate,
            description,
            status,
            language,
            recommended: recommended === 'true'
        });

        await newMovie.save();
        
        // Redirect with success flash message
        return res.redirect('/admin/movies?flash_type=success&flash_message=Movie+created+successfully');
    } catch (error) {
        console.error(error);
        const languages = await Language.find({ status: true }).sort({ name: 1 });
        
        res.status(500).render('admin/add-movie', {
            user: req.user,
            errors: [{ msg: 'Server error' }],
            formData: req.body,
            languages,
            searchQuery: ''
        });
    }
};

// Edit movie form
exports.getEditMovieForm = async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        
        if (!movie) {
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Movie not found',
                searchQuery: ''
            });
        }
        
        const languages = await Language.find({ status: true }).sort({ name: 1 });
        
        res.render('admin/edit-movie', {
            user: req.user,
            movie,
            languages,
            searchQuery: ''
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/error', {
            user: req.user,
            error: 'Failed to fetch movie',
            searchQuery: ''
        });
    }
};

// Update movie
exports.updateMovie = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            const languages = await Language.find({ status: true }).sort({ name: 1 });
            
            return res.status(400).render('admin/edit-movie', {
                user: req.user,
                errors: errors.array(),
                movie: { _id: req.params.id, ...req.body },
                languages,
                searchQuery: ''
            });
        }

        const {
            title,
            category,
            duration,
            ratings,
            releaseDate,
            description,
            status,
            language,
            recommended
        } = req.body;

        // Check if movie exists
        let movie = await Movie.findById(req.params.id);
        if (!movie) {
            return res.redirect(`/admin/movies?flash_type=error&flash_message=Movie+not+found`);
        }

        // Check if title already exists for another movie
        if (title !== movie.title) {
            const existingMovie = await Movie.findOne({ 
                _id: { $ne: req.params.id },
                title 
            });
            
            if (existingMovie) {
                const languages = await Language.find({ status: true }).sort({ name: 1 });
                
                return res.status(400).render('admin/edit-movie', {
                    user: req.user,
                    errors: [{ msg: 'Movie with this title already exists' }],
                    movie: { _id: req.params.id, ...req.body },
                    languages,
                    searchQuery: ''
                });
            }
        }

        const updateData = {
            title,
            category,
            duration,
            ratings: parseFloat(ratings),
            releaseDate,
            description,
            status,
            language,
            recommended: recommended === 'true'
        };

        // Handle image uploads
        if (req.files) {
            // Handle poster image
            if (req.files.image && req.files.image.length > 0) {
                try {
                    // Delete old image if it exists
                    if (movie.image) {
                        const oldImagePath = path.join(__dirname, '../uploads/movies', movie.image);
                        if (fs.existsSync(oldImagePath)) {
                            fs.unlinkSync(oldImagePath);
                        } else {
                            const altImagePath = path.join(__dirname, '../uploads', movie.image);
                            if (fs.existsSync(altImagePath)) {
                                fs.unlinkSync(altImagePath);
                            }
                        }
                    }
                    
                    // Add new image to updateData
                    updateData.image = req.files.image[0].filename;
                } catch (err) {
                    console.error('Error handling image upload:', err);
                }
            }
            
            // Handle background image
            if (req.files.backgroundImage && req.files.backgroundImage.length > 0) {
                try {
                    // Delete old background image if it exists
                    if (movie.backgroundImage) {
                        const oldBgPath = path.join(__dirname, '../uploads/movies', movie.backgroundImage);
                        if (fs.existsSync(oldBgPath)) {
                            fs.unlinkSync(oldBgPath);
                        } else {
                            const altBgPath = path.join(__dirname, '../uploads', movie.backgroundImage);
                            if (fs.existsSync(altBgPath)) {
                                fs.unlinkSync(altBgPath);
                            }
                        }
                    }
                    
                    // Add new background image to updateData
                    updateData.backgroundImage = req.files.backgroundImage[0].filename;
                } catch (err) {
                    console.error('Error handling background image upload:', err);
                }
            }
        }

        // Update movie
        const updatedMovie = await Movie.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        // Redirect with success message
        return res.redirect(`/admin/movies?flash_type=success&flash_message=Movie+updated+successfully`);
    } catch (error) {
        console.error('Error updating movie:', error);
        return res.redirect(`/admin/movies?flash_type=error&flash_message=Failed+to+update+movie:+${encodeURIComponent(error.message)}`);
    }
};

// Delete movie
exports.deleteMovie = async (req, res) => {
    try {
        const movieId = req.params.id;
        
        // Check if movie exists
        const movie = await Movie.findById(movieId);
        if (!movie) {
            return res.status(404).json({ 
                success: false, 
                message: 'Movie not found' 
            });
        }

        // Delete movie images - check both possible locations
        let imagePath = path.join(__dirname, '../uploads/movies', movie.image);
        if (!fs.existsSync(imagePath)) {
            imagePath = path.join(__dirname, '../uploads', movie.image);
        }
        
        let bgImagePath = path.join(__dirname, '../uploads/movies', movie.backgroundImage);
        if (!fs.existsSync(bgImagePath)) {
            bgImagePath = path.join(__dirname, '../uploads', movie.backgroundImage);
        }
        
        // Attempt to delete image files (don't block if files can't be deleted)
        try {
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        } catch (err) {
            console.error('Error deleting movie image:', err);
        }
        
        try {
            if (fs.existsSync(bgImagePath)) {
                fs.unlinkSync(bgImagePath);
            }
        } catch (err) {
            console.error('Error deleting movie background image:', err);
        }

        // Delete movie
        await Movie.findByIdAndDelete(movieId);
        
        // Return success response for AJAX request
        return res.json({ 
            success: true, 
            message: 'Movie deleted successfully',
            redirectUrl: '/admin/movies?flash_type=success&flash_message=Movie+deleted+successfully'
        });
    } catch (error) {
        console.error('Error deleting movie:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
}; 