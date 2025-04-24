const Theater = require('../models/Theater');
const { validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { debugDateString } = require('../utils/showHelpers');

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

exports.getTheaterById = async (req, res) => {
    try {
        const theater = await Theater.findById(req.params.id);
        
        if (!theater) {
            return res.status(404).render('admin/error', {
                user: req.user,
                error: 'Theater not found'
            });
        }
        
        const Show = require('../models/Show');
        const Booking = require('../models/Booking');
        
        const totalShows = await Show.countDocuments({ theaterId: theater._id });
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const upcomingShows = await Show.find({
            theaterId: theater._id,
            showDate: { $gte: today }
        }).populate('movieId', 'title image')
        .sort({ showDate: 1, showTime: 1 })
        .limit(5);
        
        let totalBookings = 0;
        try {
            const theaterShows = await Show.find({ theaterId: theater._id }).select('_id');
            const showIds = theaterShows.map(show => show._id);
            
            if (showIds.length > 0) {
                totalBookings = await Booking.countDocuments({
                    $or: [
                        { theaterId: theater._id }, 
                        { showId: { $in: showIds } } 
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

exports.getAddTheaterForm = (req, res) => {
    res.render('admin/add-theater', {
        user: req.user
    });
};

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

        const existingTheater = await Theater.findOne({ name, location });
        if (existingTheater) {
            return res.status(400).render('admin/add-theater', {
                user: req.user,
                errors: [{ msg: 'Theater with this name and location already exists' }],
                formData: req.body
            });
        }

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

        const calculatedTotalSeats = screenData.reduce((sum, screen) => sum + parseInt(screen.totalSeats || 0), 0);

        let imageFileName = 'default-theater.jpg';
        if (req.file) {
            imageFileName = req.file.filename;
        }

        const newTheater = new Theater({
            name,
            location,
            city,
            state,
            pincode,
            totalSeats: calculatedTotalSeats, 
            screens: screenData,
            facilities: facilities ? facilities.split(',').map(f => f.trim()) : [],
            image: imageFileName,
            contactNumber
        });

        await newTheater.save();
        
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

        let theater = await Theater.findById(req.params.id);
        if (!theater) {
            req.flash('error', 'Theater not found');
            return res.redirect('/admin/theaters');
        }

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

        const calculatedTotalSeats = screenData.reduce((sum, screen) => sum + parseInt(screen.totalSeats || 0), 0);

        if (req.file) {
            try {
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

        theater.name = name;
        theater.location = location;
        theater.city = city;
        theater.state = state;
        theater.pincode = pincode;
        theater.totalSeats = calculatedTotalSeats; 
        theater.screens = screenData;
        theater.facilities = facilities ? facilities.split(',').map(f => f.trim()) : [];
        theater.contactNumber = contactNumber;
        theater.status = status === 'true';

        await theater.save();
        
        req.flash('success', 'Theater updated successfully');
        return res.redirect('/admin/theaters');
    } catch (error) {
        console.error(error);
        req.flash('error', `Failed to update theater: ${error.message}`);
        return res.redirect('/admin/theaters');
    }
};

exports.deleteTheater = async (req, res) => {
    try {
        const theaterId = req.params.id;
        
        const theater = await Theater.findById(theaterId);
        if (!theater) {
            return res.status(404).json({ 
                success: false, 
                message: 'Theater not found' 
            });
        }

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

        await Theater.findByIdAndDelete(theaterId);
        
        req.flash('success', 'Theater deleted successfully');
        return res.redirect('/admin/theaters');
    } catch (error) {
        console.error(error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
};

exports.getTheaterDetailsPublic = async (req, res) => {
    try {
        const theater = await Theater.findById(req.params.id);
        
        if (!theater) {
            return res.status(404).render('error', {
                message: 'Theater not found',
                searchQuery: ''
            });
        }
        
        const Show = require('../models/Show');
        
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

exports.getTheatersForMovie = async (req, res) => {
    try {
        const movieId = req.params.id;
        
        const Movie = require('../models/Movie');
        const movie = await Movie.findById(movieId);
        
        if (!movie) {
            return res.status(404).render('error', {
                message: 'Movie not found',
                searchQuery: '',
                title: 'Movie Not Found'
            });
        }
        
        const theaters = await Theater.find({ status: true }).sort({ name: 1 });
        const Show = require('../models/Show');
        const today = new Date();
        const todayString = today.toISOString().split('T')[0]; // YYYY-MM-DD
        
        let selectedDateStr = todayString;
        
        if (req.query.date) {
            
            if (req.query.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                selectedDateStr = req.query.date;
                debugDateString(selectedDateStr);
            }
        }
        let selectedDate;
        try {
            const [year, month, day] = selectedDateStr.split('-').map(Number);
            selectedDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
        } catch (e) {
            console.error('Error parsing date:', e);
            selectedDate = today; 
        }
        
        
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const dateObj = new Date(today);
            dateObj.setDate(today.getDate() + i);
            
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0'); 
            const day = String(dateObj.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            
            dates.push({
                date: dateObj,
                day: dayName,
                isToday: dateStr === selectedDateStr 
            });
        }
        
        const shows = await Show.aggregate([
            {
                $match: { 
                    movieId: new mongoose.Types.ObjectId(movieId)
                }
            },
            {
                $addFields: {
                    dateString: { 
                        $dateToString: { 
                            format: "%Y-%m-%d", 
                            date: "$showDate", 
                            timezone: "UTC" 
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

        const theaterShows = {};
        shows.forEach(show => {
            const theaterId = show.theaterId.toString();
            if (!theaterShows[theaterId]) {
                theaterShows[theaterId] = [];
            }
          
            show.theaterId = {
                _id: show.theaterId,
                name: show.theaterInfo.name,
                location: show.theaterInfo.location,
                city: show.theaterInfo.city
            };
            
          
            if (!show.formattedTime) {
              
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

        let filteredShowCount = 0;
        
        Object.keys(theaterShows).forEach(theaterId => {
            const allTheaterShows = theaterShows[theaterId];
            const theaterDates = [...new Set(allTheaterShows.map(s => s.dateString))].sort();
            const dateFilteredShows = allTheaterShows.filter(show => {
            const showDateStr = show.dateString;
            const isMatch = showDateStr === selectedDateStr;
                
                return isMatch;
            });
            
            
            theaterShows[theaterId] = dateFilteredShows;
            
            filteredShowCount += dateFilteredShows.length;
        });
        
        res.render('frontend/selectTheater', {
            movie,
            theaters,
            dates,
            today,
            selectedDate,
            selectedDateStr, 
            theaterShows,
            searchQuery: '',
            originalUrl: req.originalUrl 
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