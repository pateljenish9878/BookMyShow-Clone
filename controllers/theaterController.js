const Theater = require('../models/Theater');
const { validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { debugDateString } = require('../utils/showHelpers');

// Get all theaters
exports.getTheaters = async (req, res) => {
    try {
        const theaters = await Theater.find().sort({ name: 1 });
        
        res.render('admin/theaters', {
            user: req.user,
            theaters
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/theaters', {
            user: req.user,
            error: 'Failed to fetch theaters'
        });
    }
};

// Get theater by ID
exports.getTheaterById = async (req, res) => {
    try {
        const theater = await Theater.findById(req.params.id);
        
        if (!theater) {
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Theater not found'
            });
        }
        
        // Get show stats
        const Show = require('../models/Show');
        const Booking = require('../models/Booking');
        
        // Count all shows for this theater
        const totalShows = await Show.countDocuments({ theaterId: theater._id });
        
        // Get upcoming shows (shows with date >= today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const upcomingShows = await Show.find({
            theaterId: theater._id,
            showDate: { $gte: today }
        }).populate('movieId', 'title image')
        .sort({ showDate: 1, showTime: 1 })
        .limit(5);
        
        // Count bookings related to this theater
        // If older data may not have theaterId, get shows first and then count bookings for those shows
        let totalBookings = 0;
        try {
            // Get all shows for this theater
            const theaterShows = await Show.find({ theaterId: theater._id }).select('_id');
            const showIds = theaterShows.map(show => show._id);
            
            // Count bookings for these shows
            if (showIds.length > 0) {
                totalBookings = await Booking.countDocuments({
                    $or: [
                        { theaterId: theater._id }, // For newer bookings with theaterId
                        { showId: { $in: showIds } } // For older bookings without theaterId
                    ]
                });
            }
        } catch (err) {
            console.error('Error counting bookings:', err);
        }
        
        res.render('admin/theater-detail', {
            user: req.user,
            theater,
            stats: {
                totalShows,
                totalBookings
            },
            upcomingShows
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/error', {
            user: req.user,
            error: 'Failed to fetch theater'
        });
    }
};

// Add theater form
exports.getAddTheaterForm = (req, res) => {
    res.render('admin/add-theater', {
        user: req.user
    });
};

// Create theater
exports.createTheater = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).render('admin/add-theater', {
                user: req.user,
                errors: errors.array(),
                formData: req.body
            });
        }

        const {
            name,
            location,
            city,
            state,
            pincode,
            facilities,
            contactNumber
        } = req.body;

        // Check if theater with same name and location exists
        const existingTheater = await Theater.findOne({ name, location });
        if (existingTheater) {
            return res.status(400).render('admin/add-theater', {
                user: req.user,
                errors: [{ msg: 'Theater with this name and location already exists' }],
                formData: req.body
            });
        }

        // Process screens data
        const screenData = [];
        if (req.body.screenName && Array.isArray(req.body.screenName)) {
            for (let i = 0; i < req.body.screenName.length; i++) {
                screenData.push({
                    name: req.body.screenName[i],
                    totalSeats: req.body.screenSeats[i],
                    type: req.body.screenType[i],
                    seatLayout: {
                        rows: req.body.screenRows[i],
                        columns: req.body.screenColumns[i]
                    }
                });
            }
        } else if (req.body.screenName) {
            // Single screen
            screenData.push({
                name: req.body.screenName,
                totalSeats: req.body.screenSeats,
                type: req.body.screenType,
                seatLayout: {
                    rows: req.body.screenRows,
                    columns: req.body.screenColumns
                }
            });
        }

        // Calculate total seats from screen data
        const calculatedTotalSeats = screenData.reduce((sum, screen) => sum + parseInt(screen.totalSeats || 0), 0);

        // Handle image upload
        let imageFileName = 'default-theater.jpg';
        if (req.file) {
            imageFileName = req.file.filename;
        }

        // Create new theater
        const newTheater = new Theater({
            name,
            location,
            city,
            state,
            pincode,
            totalSeats: calculatedTotalSeats, // Set total seats based on screen data
            screens: screenData,
            facilities: facilities ? facilities.split(',').map(f => f.trim()) : [],
            image: imageFileName,
            contactNumber
        });

        await newTheater.save();
        
        // Set flash message for success
        req.flash('success', 'Theater created successfully');
        return res.redirect('/admin/theaters');
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/add-theater', {
            user: req.user,
            errors: [{ msg: 'Server error' }],
            formData: req.body
        });
    }
};

// Edit theater form
exports.getEditTheaterForm = async (req, res) => {
    try {
        const theater = await Theater.findById(req.params.id);
        
        if (!theater) {
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Theater not found'
            });
        }
        
        res.render('admin/edit-theater', {
            user: req.user,
            theater
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('admin/error', {
            user: req.user,
            error: 'Failed to fetch theater'
        });
    }
};

// Update theater
exports.updateTheater = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).render('admin/edit-theater', {
                user: req.user,
                errors: errors.array(),
                theater: { _id: req.params.id, ...req.body }
            });
        }

        const {
            name,
            location,
            city,
            state,
            pincode,
            facilities,
            contactNumber,
            status
        } = req.body;

        // Check if theater exists
        let theater = await Theater.findById(req.params.id);
        if (!theater) {
            req.flash('error', 'Theater not found');
            return res.redirect('/admin/theaters');
        }

        // Check if theater with the same name and location exists (excluding current theater)
        if (name !== theater.name || location !== theater.location) {
            const existingTheater = await Theater.findOne({
                _id: { $ne: req.params.id },
                name,
                location
            });
            
            if (existingTheater) {
                return res.status(400).render('admin/edit-theater', {
                    user: req.user,
                    errors: [{ msg: 'Theater with this name and location already exists' }],
                    theater: { _id: req.params.id, ...req.body }
                });
            }
        }

        // Process screens data
        const screenData = [];
        if (req.body.screenName && Array.isArray(req.body.screenName)) {
            for (let i = 0; i < req.body.screenName.length; i++) {
                screenData.push({
                    name: req.body.screenName[i],
                    totalSeats: req.body.screenSeats[i],
                    type: req.body.screenType[i],
                    seatLayout: {
                        rows: req.body.screenRows[i],
                        columns: req.body.screenColumns[i]
                    }
                });
            }
        } else if (req.body.screenName) {
            // Single screen
            screenData.push({
                name: req.body.screenName,
                totalSeats: req.body.screenSeats,
                type: req.body.screenType,
                seatLayout: {
                    rows: req.body.screenRows,
                    columns: req.body.screenColumns
                }
            });
        }

        // Calculate total seats from screen data
        const calculatedTotalSeats = screenData.reduce((sum, screen) => sum + parseInt(screen.totalSeats || 0), 0);

        // Handle image upload
        if (req.file) {
            try {
                // Delete old image if not default
                if (theater.image && theater.image !== 'default-theater.jpg') {
                    const oldImagePath = path.join(__dirname, '../uploads/theaters', theater.image);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
                theater.image = req.file.filename;
            } catch (err) {
                console.error('Error handling image upload:', err);
            }
        }

        // Update theater
        theater.name = name;
        theater.location = location;
        theater.city = city;
        theater.state = state;
        theater.pincode = pincode;
        theater.totalSeats = calculatedTotalSeats; // Set total seats based on screen data
        theater.screens = screenData;
        theater.facilities = facilities ? facilities.split(',').map(f => f.trim()) : [];
        theater.contactNumber = contactNumber;
        theater.status = status === 'true';

        await theater.save();
        
        // Set flash message for success
        req.flash('success', 'Theater updated successfully');
        return res.redirect('/admin/theaters');
    } catch (error) {
        console.error(error);
        req.flash('error', `Failed to update theater: ${error.message}`);
        return res.redirect('/admin/theaters');
    }
};

// Delete theater
exports.deleteTheater = async (req, res) => {
    try {
        const theaterId = req.params.id;
        
        // Check if theater exists
        const theater = await Theater.findById(theaterId);
        if (!theater) {
            return res.status(404).json({ 
                success: false, 
                message: 'Theater not found' 
            });
        }

        // Check if theater has associated shows
        const hasShows = await Show.exists({ theaterId: theaterId });
        if (hasShows) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete theater with active shows. Please delete all associated shows first.' 
            });
        }

        // Delete theater image if not default
        try {
            if (theater.image && theater.image !== 'default-theater.jpg') {
                const imagePath = path.join(__dirname, '../uploads/theaters', theater.image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }
        } catch (err) {
            console.error('Error deleting theater image:', err);
        }

        // Delete theater
        await Theater.findByIdAndDelete(theaterId);
        
        // Return success response for AJAX
        return res.json({ 
            success: true, 
            message: 'Theater deleted successfully',
            redirectUrl: '/admin/theaters'
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
};

// Get theater by ID for frontend users
exports.getTheaterDetailsPublic = async (req, res) => {
    try {
        const theater = await Theater.findById(req.params.id);
        
        if (!theater) {
            return res.status(404).render('error', {
                message: 'Theater not found',
                searchQuery: ''
            });
        }
        
        // Get show stats
        const Show = require('../models/Show');
        
        // Get upcoming shows (shows with date >= today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const upcomingShows = await Show.find({
            theaterId: theater._id,
            showDate: { $gte: today }
        }).populate('movieId', 'title image')
        .sort({ showDate: 1, showTime: 1 })
        .limit(10);
        
        res.render('frontend/theaterDetails', {
            theater,
            upcomingShows,
            searchQuery: ''
        });
    } catch (error) {
        console.error('Error fetching theater details:', error);
        res.status(500).render('error', {
            message: 'Failed to fetch theater details',
            searchQuery: ''
        });
    }
};

// Get theaters for a movie (select theaters page)
exports.getTheatersForMovie = async (req, res) => {
    try {
        const movieId = req.params.id;
        
        // Get the movie details
        const Movie = require('../models/Movie');
        const movie = await Movie.findById(movieId);
        
        if (!movie) {
            return res.status(404).render('error', {
                message: 'Movie not found',
                searchQuery: '',
                title: 'Movie Not Found'
            });
        }
        
        // Get all active theaters
        const theaters = await Theater.find({ status: true }).sort({ name: 1 });
        
        // Get the Show model to fetch show times
        const Show = require('../models/Show');
        
        // Get today's date as an ISO date string YYYY-MM-DD
        const today = new Date();
        const todayString = today.toISOString().split('T')[0]; // YYYY-MM-DD
        
        console.log('Theater selection - Today string:', todayString);
        
        // Check if date is provided in URL - use exact string without conversion
        let selectedDateStr = todayString;
        
        if (req.query.date) {
            console.log('Date from URL:', req.query.date);
            
            // If date from URL is a valid YYYY-MM-DD format, use it directly
            if (req.query.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                selectedDateStr = req.query.date;
                console.log('Using exact date string from URL:', selectedDateStr);
                
                // Debug the date string format
                debugDateString(selectedDateStr);
            }
        }
        
        console.log('Final selectedDateStr for filtering shows:', selectedDateStr);

        // Create Date object for selected date (needed for some UI operations)
        // But we'll use selectedDateStr for all date comparisons
        let selectedDate;
        try {
            // Parse the date string to create a Date object at noon UTC to avoid timezone issues
            const [year, month, day] = selectedDateStr.split('-').map(Number);
            selectedDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
            console.log('Created selectedDate object:', selectedDate);
            console.log('selectedDate ISO string:', selectedDate.toISOString());
        } catch (e) {
            console.error('Error parsing date:', e);
            selectedDate = today; // fallback to today
        }
        
        console.log('Selected date object:', selectedDate);
        
        // Build the dates array for the date navigation UI
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const dateObj = new Date(today);
            dateObj.setDate(today.getDate() + i);
            
            // Get the date string in YYYY-MM-DD format
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0'); 
            const day = String(dateObj.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            // Get day name
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            
            dates.push({
                date: dateObj,
                day: dayName,
                isToday: dateStr === selectedDateStr // Compare string dates for accuracy
            });
        }
        
        // Find shows and log the specific query being used
        console.log(`MongoDB Query: Finding shows with movieId=${movieId}`);
        
        // Get all shows for this movie using aggregation to handle dates correctly
        console.log('Finding shows for movie ID:', movieId);
        
        const shows = await Show.aggregate([
            {
                $match: { 
                    movieId: new mongoose.Types.ObjectId(movieId)
                }
            },
            {
                $addFields: {
                    // Make sure we have a consistent date string format for comparison
                    dateString: { 
                        $dateToString: { 
                            format: "%Y-%m-%d", 
                            date: "$showDate", 
                            timezone: "UTC" // Explicitly use UTC to avoid timezone shifts
                        } 
                    }
                }
            },
            {
                $lookup: {
                    from: 'theaters',
                    localField: 'theaterId',
                    foreignField: '_id',
                    as: 'theaterInfo'
                }
            },
            {
                $unwind: '$theaterInfo'
            },
            {
                $project: {
                    movieId: 1,
                    theaterId: 1,
                    screenId: 1,
                    showDate: 1,
                    dateString: 1,
                    showTime: 1,
                    price: 1,
                    standardPrice: 1,
                    premiumPrice: 1,
                    'theaterInfo.name': 1,
                    'theaterInfo.location': 1,
                    'theaterInfo.city': 1
                }
            },
            {
                $sort: { dateString: 1, showTime: 1 }
            }
        ]);
        
        console.log(`Found ${shows.length} shows for movie ID ${movieId} using aggregation`);
        
        // Sample the first few shows for debugging
        if (shows.length > 0) {
            // Log all the date strings to help debug the filtering issue
            const dateStrings = [...new Set(shows.map(show => show.dateString))].sort();
            console.log('All show dates available:', dateStrings);
            console.log('We are filtering for date:', selectedDateStr);
            
            // Log the first few shows
            console.log('Sample show data:');
            for (let i = 0; i < Math.min(3, shows.length); i++) {
                console.log(`Show ${i+1}:`);
                console.log(`  dateString: ${shows[i].dateString}`);
                console.log(`  original date: ${shows[i].showDate}`);
                console.log(`  theater: ${shows[i].theaterInfo.name}`);
                console.log(`  time: ${shows[i].showTime}`);
            }
        }
        
        // Group shows by theater
        const theaterShows = {};
        shows.forEach(show => {
            const theaterId = show.theaterId.toString();
            if (!theaterShows[theaterId]) {
                theaterShows[theaterId] = [];
            }
            
            // Add the theater info to the show object
            show.theaterId = {
                _id: show.theaterId,
                name: show.theaterInfo.name,
                location: show.theaterInfo.location,
                city: show.theaterInfo.city
            };
            
            // Add formatted time if needed
            if (!show.formattedTime) {
                // Try to format the time from HH:MM to 12-hour format
                try {
                    const [hours, minutes] = show.showTime.split(':');
                    const hour = parseInt(hours, 10);
                    const isPM = hour >= 12;
                    const displayHour = hour % 12 || 12; // Convert 0 to 12
                    show.formattedTime = `${displayHour}:${minutes} ${isPM ? 'PM' : 'AM'}`;
                } catch (e) {
                    show.formattedTime = show.showTime;
                }
            }
            
            theaterShows[theaterId].push(show);
        });
        
        // Log theater shows for debugging
        console.log(`Grouped shows for ${Object.keys(theaterShows).length} theaters using aggregation`);

        // Filtered count to ensure we have shows for the selected date
        let filteredShowCount = 0;
        
        // For each theater, filter shows by date and log the detailed results
        Object.keys(theaterShows).forEach(theaterId => {
            console.log(`Filtering shows for theater ${theaterId}`);
            const allTheaterShows = theaterShows[theaterId];
            console.log(`Theater has ${allTheaterShows.length} total shows`);
            
            // Log all dates for this theater
            const theaterDates = [...new Set(allTheaterShows.map(s => s.dateString))].sort();
            console.log(`Theater show dates: ${theaterDates.join(', ')}`);
            
            const dateFilteredShows = allTheaterShows.filter(show => {
                // Debug each show's date comparison
                const showDateStr = show.dateString;
                const isMatch = showDateStr === selectedDateStr;
                
                if (showDateStr === selectedDateStr) {
                    console.log(`MATCH: Show date ${showDateStr} matches selected date ${selectedDateStr}`);
                }
                
                return isMatch;
            });
            
            console.log(`Theater ${theaterId} has ${dateFilteredShows.length} shows for date ${selectedDateStr}`);
            
            // CRITICAL FIX: Replace the theater shows array with the filtered shows
            // This is essential for the view to display the correct shows
            theaterShows[theaterId] = dateFilteredShows;
            
            filteredShowCount += dateFilteredShows.length;
        });
        console.log(`Shows available specifically for date ${selectedDateStr}: ${filteredShowCount}`);
        
        res.render('frontend/selectTheater', {
            movie,
            theaters,
            dates,
            today,
            selectedDate,
            selectedDateStr, // Pass the exact string for date comparison
            theaterShows,
            searchQuery: '',
            originalUrl: req.originalUrl // Pass the original URL to the template
        });
        
    } catch (error) {
        console.error('Error fetching theaters for movie:', error);
        res.status(500).render('error', {
            message: 'Failed to fetch theaters',
            searchQuery: '',
            title: 'Error'
        });
    }
}; 