const Show = require('../models/Show');
const Movie = require('../models/Movie');
const Theater = require('../models/Theater');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { findShowByExactDate } = require('../utils/showHelpers');

exports.getShows = async (req, res) => {
    try {
        const shows = await Show.find()
            .populate('movieId', 'title image')
            .populate('theaterId', 'name location')
            .sort({ showDate: 1, showTime: 1 });

        const populatedShows = await Promise.all(shows.map(async (show) => {
            const showObj = show.toObject();
            
            try {
                if (!show.theaterId || !show.theaterId._id) {
                    return showObj;
                }
                
                if (!show.movieId || !show.movieId._id) {
                    return showObj;
                }
                
                const theater = await Theater.findById(show.theaterId._id);
                if (!theater) {
                    return showObj;
                }
                
                if (!theater.screens || theater.screens.length === 0) {
                    return showObj;
                }
                
                const screen = theater.screens.find(s => s._id.toString() === show.screenId.toString());
                if (!screen) {
                    return showObj;
                }
                
                showObj.screenId = {
                    _id: screen._id,
                    name: screen.name,
                    type: screen.type || 'Standard'
                };
                
                if (show.showTime) {
                    try {
                        const [hours, minutes] = show.showTime.split(':');
                        const hour = parseInt(hours, 10);
                        const isPM = hour >= 12;
                        const displayHour = hour % 12 || 12;
                        showObj.formattedTime = `${displayHour}:${minutes || '00'} ${isPM ? 'PM' : 'AM'}`;
                    } catch (err) {
                        showObj.formattedTime = show.showTime;
                    }
                }
                
                return showObj;
            } catch (err) {
                console.error(`Error finding screen data for show ${show._id}:`, err);
                return showObj;
            }
        }));
        
        
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

        let showTimes = req.body['showTimes[]'];
        
        if (!showTimes && req.body.showTimes) {
            showTimes = req.body.showTimes;
        }

        let timesToProcess = [];
        if (Array.isArray(showTimes)) {
            timesToProcess = showTimes.filter(time => time && time.trim() !== '');
        } else if (showTimes) {
            timesToProcess = [showTimes];
        }
        
        
        if (!timesToProcess || timesToProcess.length === 0) {
            return res.status(400).render('admin/add-show', {
                user: req.user,
                errors: [{ msg: 'At least one valid show time is required' }],
                formData: req.body,
                movies: await Movie.find().sort({ title: 1 }),
                theaters: await Theater.find({ status: true }).sort({ name: 1 })
            });
        }

        const movie = await Movie.findById(movieId);
        if (!movie) {
            return res.status(404).json({ msg: 'Movie not found' });
        }

        const theater = await Theater.findById(theaterId);
        if (!theater) {
            return res.status(404).json({ msg: 'Theater not found' });
        }

        const screen = theater.screens.find(s => s._id.toString() === screenId);
        if (!screen) {
            return res.status(404).json({ msg: 'Screen not found' });
        }

        const formattedDate = new Date(showDate);
        
        const dateComponents = showDate.split('-');
        const year = parseInt(dateComponents[0]);
        const month = parseInt(dateComponents[1]) - 1; 
        const day = parseInt(dateComponents[2]);
        
        const utcNoonDate = new Date(Date.UTC(year, month, day, 12, 0, 0));

        const showsToCreate = [];
        const validationErrors = [];
        
        for (let i = 0; i < timesToProcess.length; i++) {
            const showTime = timesToProcess[i];
            
            if (!showTime) {
                continue;
            }
            
            let formattedTime;
            if (typeof showTime === 'string') {
                formattedTime = showTime.includes(':') ? showTime : `${showTime}:00`;
            } else {
                formattedTime = String(showTime).includes(':') ? String(showTime) : `${showTime}:00`;
            }
            
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
        
        const createdShows = await Show.insertMany(showsToCreate);
        req.flash('success', `Successfully created ${createdShows.length} show(s)`);
        
        res.redirect('/admin/shows');
    } catch (error) {
        console.error('Error in createShow:', error);
        req.flash('error', 'Failed to create show');
        res.redirect('/admin/shows');
    }
};

exports.getEditShowForm = async (req, res) => {
    try {
        const showId = req.params.id;
        
        const show = await Show.findById(showId)
            .populate('movieId', 'title status')
            .populate('theaterId', 'name city');
        
        if (!show) {
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Show not found'
            });
        }

        const theater = await Theater.findById(show.theaterId._id);
        if (!theater) {
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Theater not found for this show'
            });
        }
        
        const relatedShows = await Show.find({
            _id: { $ne: show._id },
            movieId: show.movieId._id || show.movieId,
            theaterId: show.theaterId._id || show.theaterId,
            screenId: show.screenId,
            showDate: show.showDate
        }).sort({ showTime: 1 });
        
        
        if (relatedShows.length > 0) {
            show.additionalTimes = relatedShows.map(s => s.showTime);
        }
        
        const screen = theater.screens.find(s => s._id.toString() === show.screenId.toString());
        if (screen) {
            show.screenId = {
                _id: screen._id,
                name: screen.name,
                type: screen.type || 'Standard'
            };
        } else {
            console.warn(`Screen ${show.screenId} not found in theater ${theater._id}`);
            
            // Try to fix the issue by using the first available screen
            if (theater.screens && theater.screens.length > 0) {
                const validScreen = theater.screens[0];
                console.log(`Automatically fixing show ${show._id} by assigning screen ${validScreen._id}`);
                
                // Update the show in the database with the valid screen ID
                await Show.findByIdAndUpdate(show._id, { screenId: validScreen._id });
                
                // Update in the current context for rendering
                show.screenId = {
                    _id: validScreen._id,
                    name: validScreen.name,
                    type: validScreen.type || 'Standard'
                };
                
                console.log(`Show ${show._id} has been updated with a valid screen ID`);
            } else {
                // If no screens are available, handle gracefully
                show.screenId = {
                    _id: show.screenId,
                    name: 'Unknown Screen',
                    type: 'Standard'
                };
            }
        }
        
        const movies = await Movie.find().sort({ title: 1 });
        const theaters = await Theater.find().sort({ name: 1 });
        
        show.screenOptions = theater.screens.map(s => ({
            _id: s._id,
            name: s.name,
            type: s.type || 'Standard'
        }));
        
      
        
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

        let showTimes = req.body['showTimes[]'];
        
        if (!showTimes && req.body.showTimes) {
            showTimes = req.body.showTimes;
        }

        let timesToProcess = [];
        if (Array.isArray(showTimes)) {
            timesToProcess = showTimes.filter(time => time && time.trim() !== '');
        } else if (showTimes) {
            timesToProcess = [showTimes];
        }
        
        
        if (!timesToProcess || timesToProcess.length === 0) {
            return res.status(400).render('admin/edit-show', {
                user: req.user,
                errors: [{ msg: 'At least one valid show time is required' }],
                show: { ...req.body, _id: req.params.id },
                movies: await Movie.find().sort({ title: 1 }),
                theaters: await Theater.find().sort({ name: 1 })
            });
        }

        const formattedDate = new Date(showDate);
        
        const dateComponents = showDate.split('-');
        const year = parseInt(dateComponents[0]);
        const month = parseInt(dateComponents[1]) - 1; 
        const day = parseInt(dateComponents[2]);
        
        const utcNoonDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
 
        let formattedTime;
        if (typeof timesToProcess[0] === 'string') {
            formattedTime = timesToProcess[0].includes(':') ? timesToProcess[0] : `${timesToProcess[0]}:00`;
        } else {
            formattedTime = String(timesToProcess[0]).includes(':') ? String(timesToProcess[0]) : `${timesToProcess[0]}:00`;
        }
        
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

        show.movieId = movieId;
        show.theaterId = theaterId;
        show.screenId = screenId;
        show.showDate = utcNoonDate;
        show.showTime = formattedTime;
        show.price = price;

        await show.save();
        
        if (timesToProcess.length > 1) {
            const additionalShows = [];
            const validationErrors = [];
            
            for (let i = 1; i < timesToProcess.length; i++) {
                const time = timesToProcess[i];
                
                if (!time) continue;
                
                let additionalTime;
                if (typeof time === 'string') {
                    additionalTime = time.includes(':') ? time : `${time}:00`;
                } else {
                    additionalTime = String(time).includes(':') ? String(time) : `${time}:00`;
                }
                
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
            
            if (additionalShows.length > 0) {
                await Show.insertMany(additionalShows);
            }
            
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

exports.deleteShow = async (req, res) => {
    try {
        const showId = req.params.id;
        
        const show = await Show.findById(showId);
        if (!show) {
            req.flash('error', 'Show not found');
            return res.redirect('/admin/shows');
        }

        if (show.bookedSeats && show.bookedSeats.length > 0) {
            req.flash('error', 'Cannot delete show with active bookings');
            return res.redirect('/admin/shows');
        }

        await Show.findByIdAndDelete(showId);
        
        req.flash('success', 'Show deleted successfully');
        res.redirect('/admin/shows');
    } catch (error) {
        console.error('Error in deleteShow:', error);
        req.flash('error', 'Server error when deleting show');
        res.redirect('/admin/shows');
    }
};

exports.testCreateShow = async (req, res) => {
    try {
        // Instead of hardcoded IDs, fetch the first available theater and screen
        const Theater = require('../models/Theater');
        const Movie = require('../models/Movie');
        
        // Get the first available theater
        const theater = await Theater.findOne();
        if (!theater || !theater.screens || theater.screens.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No theaters with screens found in the database'
            });
        }
        
        // Get the first available movie
        const movie = await Movie.findOne();
        if (!movie) {
            return res.status(404).json({
                success: false,
                message: 'No movies found in the database'
            });
        }
        
        // Use the first screen from the theater
        const screen = theater.screens[0];
        
        const testShow = new Show({
            movieId: movie._id,
            theaterId: theater._id,
            screenId: screen._id,
            showDate: new Date(),
            showTime: '14:00',
            price: 250,
            bookedSeats: []
        });
        
        const savedShow = await testShow.save();
        
        res.json({
            success: true,
            message: 'Test show created successfully',
            show: savedShow,
            theater: {
                id: theater._id,
                name: theater.name
            },
            screen: {
                id: screen._id,
                name: screen.name
            },
            movie: {
                id: movie._id,
                title: movie.title
            }
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

exports.createTestShowApril24 = async (req, res) => {
    try {
        const Movie = require('../models/Movie');
        const Theater = require('../models/Theater');
        const Show = require('../models/Show');
        
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
        
        // Make sure the theater has screens
        if (!theater.screens || theater.screens.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'The theater has no screens'
            });
        }
        
        // Use a valid screen ID from the theater
        const screenId = theater.screens[0]._id;
        
        const targetDateStr = '2025-04-24';
        const targetDate = new Date(`${targetDateStr}T12:00:00.000Z`);
        const newShow = new Show({
            movieId: movie._id,
            theaterId: theater._id,
            screenId: screenId,
            showDate: targetDate,
            showTime: '14:00',
            price: 250,
            bookedSeats: []
        });
        
        await newShow.save();
        
        const dateStr = targetDate.toISOString().split('T')[0];
        
        const foundShow = await findShowByExactDate(movie._id, theater._id, targetDateStr, '14:00');
        
        return res.json({
            success: true,
            message: 'Test show created for April 24th at 14:00',
            show: {
                id: newShow._id,
                movie: movie.title,
                theater: theater.name,
                screen: theater.screens[0].name,
                date: targetDate,
                time: '14:00',
                dateString: newShow.dateString, 
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