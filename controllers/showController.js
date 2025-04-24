const Show = require('../models/Show');
const Movie = require('../models/Movie');
const Theater = require('../models/Theater');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { findShowByExactDate } = require('../utils/showHelpers');

// Get all shows
exports.getShows = async (req, res) => {
    try {
        console.log('Getting all shows...');
        const shows = await Show.find()
            .populate('movieId', 'title image')
            .populate('theaterId', 'name location')
            .sort({ showDate: 1, showTime: 1 });
        
        console.log(`Found ${shows.length} shows in database:`, shows.map(s => ({
            id: s._id,
            movie: s.movieId ? s.movieId.title : 'Unknown',
            theater: s.theaterId ? s.theaterId.name : 'Unknown',
            date: s.showDate,
            time: s.showTime
        })));
        
        // For each show, find the screen information from the theater
        const populatedShows = await Promise.all(shows.map(async (show) => {
            // Convert to object to allow modification
            const showObj = show.toObject();
            
            try {
                // Skip if we don't have a valid theater or movieId
                if (!show.theaterId || !show.theaterId._id) {
                    console.log(`Show ${show._id} has no valid theater reference`);
                    return showObj;
                }
                
                if (!show.movieId || !show.movieId._id) {
                    console.log(`Show ${show._id} has no valid movie reference`);
                    return showObj;
                }
                
                const theater = await Theater.findById(show.theaterId._id);
                if (!theater) {
                    console.log(`Theater ${show.theaterId._id} not found for show ${show._id}`);
                    return showObj;
                }
                
                if (!theater.screens || theater.screens.length === 0) {
                    console.log(`Theater ${theater._id} has no screens`);
                    return showObj;
                }
                
                // Find the screen in the theater's screens array
                const screen = theater.screens.find(s => s._id.toString() === show.screenId.toString());
                if (!screen) {
                    console.log(`Screen ${show.screenId} not found in theater ${theater._id}`);
                    return showObj;
                }
                
                // Add screen details to the show object
                showObj.screenId = {
                    _id: screen._id,
                    name: screen.name,
                    type: screen.type || 'Standard'
                };
                
                // Add formatted time if showTime exists
                if (show.showTime) {
                    try {
                        const [hours, minutes] = show.showTime.split(':');
                        const hour = parseInt(hours, 10);
                        const isPM = hour >= 12;
                        const displayHour = hour % 12 || 12;
                        showObj.formattedTime = `${displayHour}:${minutes || '00'} ${isPM ? 'PM' : 'AM'}`;
                    } catch (err) {
                        console.log(`Error formatting time for show ${show._id}:`, err);
                        showObj.formattedTime = show.showTime;
                    }
                }
                
                return showObj;
            } catch (err) {
                console.error(`Error finding screen data for show ${show._id}:`, err);
                return showObj;
            }
        }));
        
        console.log(`Populated ${populatedShows.length} shows with screen data`);
        
        res.render('admin/shows', {
            user: req.user,
            shows: populatedShows
        });
    } catch (error) {
        console.error('Error in getShows:', error);
        res.status(500).render('admin/shows', {
            user: req.user,
            error: 'Failed to fetch shows'
        });
    }
};

// Add show form
exports.getAddShowForm = async (req, res) => {
    try {
        const movies = await Movie.find().sort({ title: 1 });
        const theaters = await Theater.find({ status: true }).sort({ name: 1 });
        
        res.render('admin/add-show', {
            user: req.user,
            movies,
            theaters
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/error', {
            user: req.user,
            error: 'Failed to load show form data'
        });
    }
};

// Get theater screens based on theater ID
exports.getTheaterScreens = async (req, res) => {
    try {
        const theater = await Theater.findById(req.params.theaterId);
        
        if (!theater) {
            return res.status(404).json({ error: 'Theater not found' });
        }
        
        res.json({ screens: theater.screens });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Create show
exports.createShow = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const movies = await Movie.find().sort({ title: 1 });
            const theaters = await Theater.find({ status: true }).sort({ name: 1 });
            
            return res.status(400).render('admin/add-show', {
                user: req.user,
                errors: errors.array(),
                formData: req.body,
                movies,
                theaters
            });
        }

        const {
            movieId,
            theaterId,
            screenId,
            showDate,
            price
        } = req.body;

        // Get show times array - various ways it might come in from the form
        let showTimes = req.body['showTimes[]'];
        
        // Express sometimes parses arrays differently based on how they're submitted
        if (!showTimes && req.body.showTimes) {
            showTimes = req.body.showTimes;
        }
        
        console.log('Received body:', req.body);
        console.log('Received showTimes in createShow:', showTimes);
        
        // Handle both array and single value cases
        let timesToProcess = [];
        if (Array.isArray(showTimes)) {
            // It's already an array
            timesToProcess = showTimes.filter(time => time && time.trim() !== '');
        } else if (showTimes) {
            // It's a single value
            timesToProcess = [showTimes];
        }
        
        console.log('timesToProcess in createShow:', timesToProcess);
        
        if (!timesToProcess || timesToProcess.length === 0) {
            console.log('No valid show times provided in createShow');
            return res.status(400).render('admin/add-show', {
                user: req.user,
                errors: [{ msg: 'At least one valid show time is required' }],
                formData: req.body,
                movies: await Movie.find().sort({ title: 1 }),
                theaters: await Theater.find({ status: true }).sort({ name: 1 })
            });
        }

        // Verify movie and theater
        const movie = await Movie.findById(movieId);
        if (!movie) {
            return res.status(404).json({ msg: 'Movie not found' });
        }

        const theater = await Theater.findById(theaterId);
        if (!theater) {
            return res.status(404).json({ msg: 'Theater not found' });
        }

        // Find screen
        const screen = theater.screens.find(s => s._id.toString() === screenId);
        if (!screen) {
            return res.status(404).json({ msg: 'Screen not found' });
        }

        // Format the date properly
        const formattedDate = new Date(showDate);
        
        // Important fix for timezone-safe date handling:
        // Extract year, month, day directly from the input string to avoid timezone conversion issues
        const dateComponents = showDate.split('-');
        const year = parseInt(dateComponents[0]);
        const month = parseInt(dateComponents[1]) - 1; // JavaScript months are 0-indexed
        const day = parseInt(dateComponents[2]);
        
        // Create a UTC date at noon on the specified day to ensure consistency across timezones
        const utcNoonDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
        
        console.log(`Creating date from components: year=${year}, month=${month}, day=${day}`);
        console.log(`Input date: ${showDate}, UTC noon date: ${utcNoonDate.toISOString()}`);
        
        // Create a batch of show times
        const showsToCreate = [];
        const validationErrors = [];
        
        // Process each time
        for (let i = 0; i < timesToProcess.length; i++) {
            const showTime = timesToProcess[i];
            
            // Skip null/undefined/empty values
            if (!showTime) {
                continue;
            }
            
            // Format the time properly (ensure it has seconds if needed)
            let formattedTime;
            if (typeof showTime === 'string') {
                formattedTime = showTime.includes(':') ? showTime : `${showTime}:00`;
            } else {
                formattedTime = String(showTime).includes(':') ? String(showTime) : `${showTime}:00`;
            }
            
            // Check if show already exists
            const existingShow = await Show.findOne({
                theaterId,
                screenId,
                showDate: utcNoonDate,
                showTime: formattedTime
            });

            if (existingShow) {
                validationErrors.push({ msg: `Show at ${formattedTime} already exists for this screen and date` });
                continue;
            }
            
            // Create new show object (but don't save yet)
            showsToCreate.push({
                movieId,
                theaterId,
                screenId,
                showDate: utcNoonDate,
                showTime: formattedTime,
                price,
                bookedSeats: []
            });
        }
        
        // If there are errors, return them
        if (validationErrors.length > 0) {
            const movies = await Movie.find().sort({ title: 1 });
            const theaters = await Theater.find({ status: true }).sort({ name: 1 });
            
            return res.status(400).render('admin/add-show', {
                user: req.user,
                errors: validationErrors,
                formData: req.body,
                movies,
                theaters
            });
        }
        
        // Create all shows
        console.log(`Creating ${showsToCreate.length} shows:`, showsToCreate);
        const createdShows = await Show.insertMany(showsToCreate);
        console.log('Shows created successfully:', createdShows.map(s => ({
            id: s._id,
            movie: s.movieId,
            theater: s.theaterId,
            screen: s.screenId,
            date: s.showDate,
            time: s.showTime
        })));
        
        // Add success flash message
        req.flash('success', `Successfully created ${createdShows.length} show(s)`);
        
        // Redirect to shows list
        res.redirect('/admin/shows');
    } catch (error) {
        console.error('Error in createShow:', error);
        req.flash('error', 'Failed to create show');
        res.redirect('/admin/shows');
    }
};

// Get edit show form
exports.getEditShowForm = async (req, res) => {
    try {
        const showId = req.params.id;
        console.log(`Getting edit form for show ID: ${showId}`);
        
        const show = await Show.findById(showId)
            .populate('movieId', 'title status')
            .populate('theaterId', 'name city');
        
        if (!show) {
            console.log(`Show with ID ${showId} not found`);
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Show not found'
            });
        }
        
        console.log('Show after population:', {
            id: show._id.toString(),
            movie: show.movieId ? (typeof show.movieId === 'object' ? show.movieId._id.toString() : show.movieId.toString()) : 'undefined',
            theater: show.theaterId ? (typeof show.theaterId === 'object' ? show.theaterId._id.toString() : show.theaterId.toString()) : 'undefined',
            screen: show.screenId ? show.screenId.toString() : 'undefined',
            date: show.showDate,
            time: show.showTime
        });
        
        // Get detailed theater information for screens
        const theater = await Theater.findById(show.theaterId._id);
        if (!theater) {
            console.log(`Theater with ID ${show.theaterId._id} not found`);
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Theater not found for this show'
            });
        }
        
        // Find related shows (same movie, theater, screen, date)
        const relatedShows = await Show.find({
            _id: { $ne: show._id },
            movieId: show.movieId._id || show.movieId,
            theaterId: show.theaterId._id || show.theaterId,
            screenId: show.screenId,
            showDate: show.showDate
        }).sort({ showTime: 1 });
        
        console.log(`Found ${relatedShows.length} related shows`);
        
        // Add related showtimes to the current show object
        if (relatedShows.length > 0) {
            show.additionalTimes = relatedShows.map(s => s.showTime);
        }
        
        // Get screen details
        const screen = theater.screens.find(s => s._id.toString() === show.screenId.toString());
        if (screen) {
            show.screenId = {
                _id: screen._id,
                name: screen.name,
                type: screen.type || 'Standard'
            };
            console.log(`Screen found: ${screen.name}`);
        } else {
            console.warn(`Screen ${show.screenId} not found in theater ${theater._id}`);
        }
        
        const movies = await Movie.find().sort({ title: 1 });
        const theaters = await Theater.find().sort({ name: 1 });
        
        // Set screen options for the selected theater
        show.screenOptions = theater.screens.map(s => ({
            _id: s._id,
            name: s.name,
            type: s.type || 'Standard'
        }));
        
        console.log('Show data for edit form:', {
            id: show._id,
            movie: show.movieId ? (typeof show.movieId === 'object' ? show.movieId.title : show.movieId) : 'Unknown',
            theater: show.theaterId ? (typeof show.theaterId === 'object' ? show.theaterId.name : show.theaterId) : 'Unknown',
            screen: show.screenId ? (typeof show.screenId === 'object' ? show.screenId.name : show.screenId) : 'Unknown',
            date: show.showDate,
            time: show.showTime,
            additionalTimes: show.additionalTimes || []
        });
        
        res.render('admin/edit-show', {
            user: req.user,
            show,
            movies,
            theaters
        });
    } catch (error) {
        console.error('Error in getEditShowForm:', error);
        res.status(500).render('admin/error', {
            user: req.user,
            error: 'Failed to fetch show data'
        });
    }
};

// Update show
exports.updateShow = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).render('admin/edit-show', {
                user: req.user,
                errors: errors.array(),
                show: { ...req.body, _id: req.params.id },
                movies: await Movie.find().sort({ title: 1 }),
                theaters: await Theater.find().sort({ name: 1 })
            });
        }

        const show = await Show.findById(req.params.id);
        if (!show) {
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Show not found'
            });
        }

        const {
            movieId,
            theaterId,
            screenId,
            showDate,
            price
        } = req.body;

        // Get show times array - various ways it might come in from the form
        let showTimes = req.body['showTimes[]'];
        
        // Express sometimes parses arrays differently based on how they're submitted
        if (!showTimes && req.body.showTimes) {
            showTimes = req.body.showTimes;
        }
        
        console.log('Received body in updateShow:', req.body);
        console.log('Received showTimes in updateShow:', showTimes);
        
        // Handle both array and single value cases
        let timesToProcess = [];
        if (Array.isArray(showTimes)) {
            // It's already an array
            timesToProcess = showTimes.filter(time => time && time.trim() !== '');
        } else if (showTimes) {
            // It's a single value
            timesToProcess = [showTimes];
        }
        
        console.log('timesToProcess in updateShow:', timesToProcess);
        
        if (!timesToProcess || timesToProcess.length === 0) {
            console.log('No valid show times provided in updateShow');
            return res.status(400).render('admin/edit-show', {
                user: req.user,
                errors: [{ msg: 'At least one valid show time is required' }],
                show: { ...req.body, _id: req.params.id },
                movies: await Movie.find().sort({ title: 1 }),
                theaters: await Theater.find().sort({ name: 1 })
            });
        }

        // Format the date properly
        const formattedDate = new Date(showDate);
        
        // Important fix for timezone-safe date handling:
        // Extract year, month, day directly from the input string to avoid timezone conversion issues
        const dateComponents = showDate.split('-');
        const year = parseInt(dateComponents[0]);
        const month = parseInt(dateComponents[1]) - 1; // JavaScript months are 0-indexed
        const day = parseInt(dateComponents[2]);
        
        // Create a UTC date at noon on the specified day to ensure consistency across timezones
        const utcNoonDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
        
        console.log(`Creating date from components: year=${year}, month=${month}, day=${day}`);
        console.log(`Input date: ${showDate}, UTC noon date: ${utcNoonDate.toISOString()}`);
        
        // Format the first time for the primary show we're updating
        let formattedTime;
        if (typeof timesToProcess[0] === 'string') {
            formattedTime = timesToProcess[0].includes(':') ? timesToProcess[0] : `${timesToProcess[0]}:00`;
        } else {
            formattedTime = String(timesToProcess[0]).includes(':') ? String(timesToProcess[0]) : `${timesToProcess[0]}:00`;
        }
        
        // Check if another show already exists with the same screen, date, time (except this one)
        const existingShow = await Show.findOne({
            _id: { $ne: req.params.id },
            theaterId,
            screenId,
            showDate: utcNoonDate,
            showTime: formattedTime
        });

        if (existingShow) {
            return res.status(400).render('admin/edit-show', {
                user: req.user,
                errors: [{ msg: `Another show already exists at ${formattedTime} for this screen and date` }],
                show: { ...req.body, _id: req.params.id },
                movies: await Movie.find().sort({ title: 1 }),
                theaters: await Theater.find().sort({ name: 1 })
            });
        }

        // Update the primary show
        show.movieId = movieId;
        show.theaterId = theaterId;
        show.screenId = screenId;
        show.showDate = utcNoonDate;
        show.showTime = formattedTime;
        show.price = price;

        await show.save();
        
        // Create additional shows for the other times if provided
        if (timesToProcess.length > 1) {
            const additionalShows = [];
            const validationErrors = [];
            
            // Process additional times (skip the first one which was used to update the primary show)
            for (let i = 1; i < timesToProcess.length; i++) {
                const time = timesToProcess[i];
                
                if (!time) continue;
                
                // Format the time
                let additionalTime;
                if (typeof time === 'string') {
                    additionalTime = time.includes(':') ? time : `${time}:00`;
                } else {
                    additionalTime = String(time).includes(':') ? String(time) : `${time}:00`;
                }
                
                // Check if show already exists
                const duplicate = await Show.findOne({
                    theaterId,
                    screenId,
                    showDate: utcNoonDate,
                    showTime: additionalTime
                });

                if (duplicate) {
                    validationErrors.push({ msg: `Show at ${additionalTime} already exists for this screen and date` });
                    continue;
                }
                
                // Create new show object
                additionalShows.push({
                    movieId,
                    theaterId,
                    screenId,
                    showDate: utcNoonDate,
                    showTime: additionalTime,
                    price,
                    bookedSeats: []
                });
            }
            
            // Create additional shows if any
            if (additionalShows.length > 0) {
                await Show.insertMany(additionalShows);
            }
            
            // If there are errors with some of the additional times, show warnings
            if (validationErrors.length > 0) {
                req.flash('warning', validationErrors.map(err => err.msg).join(', '));
            }
        }

        req.flash('success', 'Show updated successfully');
        res.redirect('/admin/shows');
    } catch (error) {
        console.error('Error in updateShow:', error);
        req.flash('error', 'Failed to update show');
        res.redirect('/admin/shows');
    }
};

// Delete show
exports.deleteShow = async (req, res) => {
    try {
        const showId = req.params.id;
        
        // Check if show exists
        const show = await Show.findById(showId);
        if (!show) {
            req.flash('error', 'Show not found');
            return res.redirect('/admin/shows');
        }

        // Check if show has bookings
        if (show.bookedSeats && show.bookedSeats.length > 0) {
            req.flash('error', 'Cannot delete show with active bookings');
            return res.redirect('/admin/shows');
        }

        // Delete show
        await Show.findByIdAndDelete(showId);
        
        req.flash('success', 'Show deleted successfully');
        res.redirect('/admin/shows');
    } catch (error) {
        console.error('Error in deleteShow:', error);
        req.flash('error', 'Server error when deleting show');
        res.redirect('/admin/shows');
    }
};

// Test function to create a show
exports.testCreateShow = async (req, res) => {
    try {
        console.log('Testing direct show creation with Mongoose');
        
        // Create sample show data
        const testShow = new Show({
            movieId: '680670ac2298e18a222ab78d', // Chhava movie
            theaterId: '68067c4c5f4ce3cc1cf994e0', // INOX theater
            screenId: '680738a60ab69deae2d34750', // Imperial screen
            showDate: new Date(),
            showTime: '14:00',
            price: 250,
            bookedSeats: []
        });
        
        console.log('Attempting to save test show:', testShow);
        
        // Save to database
        const savedShow = await testShow.save();
        
        console.log('Test show successfully saved:', savedShow);
        
        res.json({
            success: true,
            message: 'Test show created successfully',
            show: savedShow
        });
    } catch (error) {
        console.error('Error creating test show:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create test show',
            error: error.message
        });
    }
};

// Create a new show for testing April 24th date
exports.createTestShowApril24 = async (req, res) => {
    try {
        // Get necessary models
        const Movie = require('../models/Movie');
        const Theater = require('../models/Theater');
        const Show = require('../models/Show');
        
        // Get the first movie and theater
        const movies = await Movie.find().limit(1);
        const theaters = await Theater.find().limit(1);
        
        if (!movies.length || !theaters.length) {
            return res.status(404).json({
                success: false,
                message: 'No movies or theaters found'
            });
        }
        
        const movie = movies[0];
        const theater = theaters[0];
        const screenId = theater.screens && theater.screens.length > 0 ? theater.screens[0]._id : new mongoose.Types.ObjectId();
        
        // Create a date for April 24, 2025 at noon UTC to avoid timezone issues
        const targetDateStr = '2025-04-24';
        const targetDate = new Date(`${targetDateStr}T12:00:00.000Z`);
        
        console.log('Creating test show with:');
        console.log('Movie:', movie.title);
        console.log('Theater:', theater.name);
        console.log('Date:', targetDate.toISOString());
        console.log('Date String:', targetDateStr);
        
        // Create a test show with the special date
        const newShow = new Show({
            movieId: movie._id,
            theaterId: theater._id,
            screenId: screenId,
            showDate: targetDate,
            showTime: '14:00',
            price: 250,
            bookedSeats: []
        });
        
        // Save the show
        await newShow.save();
        
        // Verify using direct date string comparison (how system will search later)
        const dateStr = targetDate.toISOString().split('T')[0];
        console.log('Date will be queried as:', dateStr);
        
        // Check if show can be found with exact date string
        const foundShow = await findShowByExactDate(movie._id, theater._id, targetDateStr, '14:00');
        
        return res.json({
            success: true,
            message: 'Test show created for April 24th at 14:00',
            show: {
                id: newShow._id,
                movie: movie.title,
                theater: theater.name,
                date: targetDate,
                time: '14:00',
                dateString: newShow.dateString, // Using virtual property
                foundInTest: !!foundShow
            }
        });
    } catch (error) {
        console.error('Error creating test show:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
}; 