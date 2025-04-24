const Booking = require("../models/Booking");
const Movie = require("../models/Movie");
const Theater = require("../models/Theater");
const User = require("../models/User");
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Show = require('../models/Show');
const { sendBookingConfirmation } = require('../utils/emailService');
const { findShowByExactDate } = require('../utils/showHelpers');
const Payment = require('../models/Payment');

exports.getBookingPage = async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) {
            return res.status(404).render('error', { 
                message: 'Movie not found',
                title: 'Movie Not Found',
                searchQuery: ''
            });
        }
        res.render("frontend/book", { 
            movie,
            searchQuery: ''
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { 
            message: 'Server Error',
            title: 'Server Error',
            searchQuery: ''
        });
    }
};

exports.createSimpleBooking = async (req, res) => {
    const { movieId, selectedSeats } = req.body;
    if (!movieId) {
        return res.status(400).render('error', {
            message: 'Movie ID is required',
            title: 'Booking Error',
            searchQuery: ''
        });
    }

    try {
        let userId;
        if (req.session.user && (req.session.user.id || req.session.user._id)) {
            userId = req.session.user.id || req.session.user._id;
        } else if (req.user && req.user._id) {
            userId = req.user._id;
        } else {
            console.error('No user ID found for simple booking!');
            return res.status(403).render('error', {
                message: 'User authentication required. Please log in again.',
                title: 'Authentication Error',
                searchQuery: ''
            });
        }
        
        const movie = await Movie.findById(movieId);
        if (!movie) {
            return res.status(404).render('error', {
                message: 'Movie not found',
                title: 'Movie Not Found',
                searchQuery: ''
            });
        }

        const seatsArray = selectedSeats ? selectedSeats.split(',') : [];
        const totalPrice = seatsArray.length * 200; 

        const booking = new Booking({
            user: userId,
            movie: movieId,
            theater: req.body.theaterId || "6502f674a1d3a80b52b7c57e", 
            seats: seatsArray,
            showDate: req.body.showDate || new Date(),
            showTime: req.body.showTime || "20:00",
            totalAmount: totalPrice,
            bookingReference: uuidv4().substring(0, 8).toUpperCase(),
            paymentStatus: 'completed', 
            status: 'confirmed'
        });

        await booking.save();
        res.redirect('/bookings');
    } catch (error) {
        console.error(error);
        res.status(500).render('error', {
            message: 'Server Error',
            title: 'Server Error',
            searchQuery: ''
        });
    }
};

exports.getAllBookings = async (req, res) => {
    try {
        const bookings = await Booking.find().sort({ bookingDate: -1 });
        res.render("frontend/booking", { 
            bookings,
            searchQuery: ''
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { 
            message: 'Server Error',
            title: 'Server Error',
            searchQuery: '' 
        });
    }
};

exports.getAvailableSeats = async (req, res) => {
  try {
    const { movieId, theaterId, showDate, showTime } = req.query;
    
    if (!movieId || !theaterId || !showDate || !showTime) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    const bookings = await Booking.find({
      movie: movieId,
      theater: theaterId,
      showDate,
      showTime,
      status: { $ne: 'cancelled' }
    });

    const bookedSeats = bookings.reduce((seats, booking) => {
      return [...seats, ...booking.seats];
    }, []);

    const theater = await Theater.findById(theaterId);
    
    if (!theater) {
      return res.status(404).json({ message: 'Theater not found' });
    }

    const movie = await Movie.findById(movieId);
    
    if (!movie) {
      return res.status(404).json({ message: 'Movie not found' });
    }

    res.json({
      movie,
      theater,
      showDate,
      showTime,
      bookedSeats,
      totalSeats: theater.totalSeats
    });
  } catch (error) {
    console.error('Error getting available seats:', error);
    res.status(500).json({ message: 'Error getting available seats', error: error.message });
  }
};

// Show seat selection page
exports.selectSeats = async (req, res) => {
    try {
        const movieId = req.params.movieId;
        const theaterId = req.params.theaterId;
        const { date, time } = req.query;
        
        if (!movieId || !theaterId || !date || !time) {
            console.error('Missing required parameters:', {
                movieId: movieId ? 'present' : 'missing',
                theaterId: theaterId ? 'present' : 'missing',
                date: date ? 'present' : 'missing',
                time: time ? 'present' : 'missing',
            });
            return res.status(400).render('error', {
                message: 'Missing required parameters for seat selection',
                title: 'Selection Error'
            });
        }

        const movie = await Movie.findById(movieId);
        const theater = await Theater.findById(theaterId);
        
        if (!movie || !theater) {
            console.error('Movie or theater not found:', {
                movieId,
                theaterId,
                movieFound: !!movie,
                theaterFound: !!theater
            });
            return res.status(404).render('error', {
                message: 'Movie or theater not found',
                title: 'Not Found'
            });
        }

        const originalDate = date;
        const bookings = await Booking.find({
            movie: movieId,
            theater: theaterId,
            showDate: originalDate,
            showTime: time,
            status: { $ne: 'cancelled' }
        });
        
        
        const bookedSeats = bookings.reduce((seats, booking) => {
            return seats.concat(booking.seats);
        }, []);
        
        const show = await findShowByExactDate(movieId, theaterId, originalDate, time);
        
        let screen = null;
        let seats = [];
        if (show && show.screenId) {
            if (theater.screens && theater.screens.length > 0) {
                screen = theater.screens.find(s => s._id.toString() === show.screenId.toString());
            }
        }
        
        let standardPrice = 200;
        let premiumPrice = 300;
        
        if (show) {
            standardPrice = show.price || 200;
            premiumPrice = standardPrice + 100; 
            
        }
    
        return res.render('frontend/selectSeats', {
            movie,
            theater,
            screen,
            show,
            standardPrice, 
            premiumPrice,
            seats: seats || [],
            bookedSeats: bookedSeats || [], 
            screenId: screen ? screen._id : null,  
            screenName: screen ? screen.name : 'Screen 1',  
            showDate: originalDate,
            showTime: time,
            date: originalDate,  
            time: time,  
            searchQuery: '',
            baseUrl: req.protocol + '://' + req.get('host')
        });
        
    } catch (err) {
        console.error('Error in selectSeats:', err);
        res.status(500).render('error', {
            message: 'Error loading seat selection page',
            title: 'Error'
        });
    }
};

exports.confirmBooking = async (req, res) => {
    try {
        const { 
            movieId, 
            theaterId, 
            date, 
            time, 
            selectedSeats, 
            standardPrice,
            premiumPrice,
            seatPrices, 
            totalPrice,
            screenId,
            screenName,
            customerPhone  
        } = req.body;
        let userData = {};
        
        if (req.session && req.session.user) {
            userData = {
                id: req.session.user.id || req.session.user._id,
                name: req.session.user.name,
                email: req.session.user.email,
                phone: req.session.user.phone || customerPhone || ""
            };
            
        } else if (req.user) {
            userData = {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                phone: req.user.phone || customerPhone || ""
            };
            
        } else {
            console.error('No user data found in session or passport!');
            return res.status(401).json({ 
                success: false, 
                message: 'User authentication required. Please log in again.',
                redirectTo: '/user/login'
            });
        }

        const missingParams = [];
        if (!movieId) missingParams.push('movieId');
        if (!theaterId) missingParams.push('theaterId');
        if (!date) missingParams.push('date');
        if (!time) missingParams.push('time');
        if (!selectedSeats) missingParams.push('selectedSeats');
        
        if (missingParams.length > 0) {
            console.error('Missing required parameters for booking confirmation:', missingParams);
            return res.status(400).json({ 
                success: false, 
                message: `Missing required parameters: ${missingParams.join(', ')}`
            });
        }
        
        const seats = Array.isArray(selectedSeats) ? selectedSeats : selectedSeats.split(',');
        
        
        if (!seats.length) {
            console.error('No seats selected for booking');
            return res.status(400).json({ 
                success: false, 
                message: 'Please select at least one seat'
            });
        }

        const movie = await Movie.findById(movieId);
        const theater = await Theater.findById(theaterId);
        
        if (!movie || !theater) {
            console.error('Movie or theater not found');
            return res.status(404).json({ 
                success: false, 
                message: 'Movie or theater not found'
            });
        }
        
        const originalDate = date;
        let showDate;
        
        try {
            if (originalDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                showDate = new Date(originalDate);
            } else {
                showDate = new Date(originalDate);
            }
            
            if (isNaN(showDate.getTime())) {
                throw new Error('Invalid date');
            }
        } catch (error) {
            console.error('Error parsing date:', error);
            showDate = new Date();
        }
        
        const show = await findShowByExactDate(movieId, theaterId, originalDate, time);        
        let parsedSeatPrices = [];
        if (seatPrices) {
            try {
                parsedSeatPrices = JSON.parse(seatPrices);
            } catch (error) {
                console.error('Error parsing seat prices:', error);
            }
        }
        
        let calculatedTotalPrice = 0;
        
        if (parsedSeatPrices.length > 0) {
            calculatedTotalPrice = parsedSeatPrices.reduce((sum, item) => sum + (item.price || 0), 0);
        } else {
            const stdPrice = parseFloat(standardPrice) || 200;
            const premPrice = parseFloat(premiumPrice) || 300;
            
            const isPremiumSeat = (seat) => {
                const row = seat.charAt(0);
                return row >= 'F' && row <= 'Z';
            };
            
            calculatedTotalPrice = seats.reduce((sum, seat) => {
                return sum + (isPremiumSeat(seat) ? premPrice : stdPrice);
            }, 0);
        }
        
        const convenienceFee = Math.round(calculatedTotalPrice * 0.05);
        const finalTotalPrice = calculatedTotalPrice + convenienceFee;
        const bookingTotalPrice = totalPrice ? parseFloat(totalPrice) : finalTotalPrice;
        
        req.session.bookingDetails = {
            userId: userData.id,
            movieId: movieId,
            theaterId: theaterId,
            showId: show ? show._id : null,
            screenId: screenId || (show ? show.screenId._id : null),
            screenName: screenName || (show ? show.screenName : 'Screen 1'),
            showDate: originalDate,
            showTime: time,
            selectedSeats: seats,
            seatPrices: parsedSeatPrices,
            basePrice: calculatedTotalPrice,
            convenienceFee: convenienceFee,
            totalAmount: bookingTotalPrice,
            standardPrice: parseFloat(standardPrice) || 200, 
            premiumPrice: parseFloat(premiumPrice) || 300, 
            customerName: userData.name,
            customerEmail: userData.email,
            customerPhone: customerPhone || userData.phone || ""
        };

        return res.json({ 
            success: true, 
            redirectUrl: '/bookings/payment'
        });
    } catch (error) {
        console.error('Error confirming booking:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Internal server error while confirming booking: ' + error.message
        });
    }
};

// Show booking success page
exports.showBookingSuccess = async (req, res) => {
    try {        
        let bookingId = req.session.lastBookingId || req.params.id;
        
        if (!bookingId) {
            console.error("[showBookingSuccess] No booking ID found in session or params");
            return res.status(404).render('error', { 
                message: 'Booking details not found. Please check your bookings in your account.',
                title: 'Booking Not Found'
            });
        }
        
        
        const booking = await Booking.findById(bookingId)
            .populate('movie', 'title posterUrl image imageUrl duration genre language certificationType')
            .populate('theater', 'name location')
            .exec();
            
        if (!booking) {
            console.error(`[showBookingSuccess] Booking with ID ${bookingId} not found`);
            return res.status(404).render('error', { 
                message: 'Booking not found. Please check your bookings in your account.',
                title: 'Booking Not Found'
            });
        }
        
        if (req.session.user && booking.user) {
            const sessionUserId = req.session.user.id || req.session.user._id;
            const bookingUserId = booking.user.toString();
            
            if (process.env.NODE_ENV !== 'development' && sessionUserId !== bookingUserId) {
                console.error(`[showBookingSuccess] User ID mismatch: ${sessionUserId} vs ${bookingUserId}`);
                return res.status(403).render('error', { 
                    message: 'You are not authorized to view this booking.',
                    title: 'Access Denied'
                });
            }
        }
        
        const emailSent = booking.emailSent || false;
        
        if (!emailSent && booking.customerEmail) {
            try {
                
                let screenName = 'Screen 1'; // Default value
                
                if (booking.screenName) {
                    screenName = booking.screenName;
                } else if (booking.screenId) {
                    screenName = `Screen ${booking.screenId}`;
                }
                
                const emailData = {
                    email: booking.customerEmail,
                    name: booking.customerName || 'Customer',
                    bookingId: booking.bookingReference || booking._id,
                    movieTitle: booking.movie ? booking.movie.title : 'Movie',
                    theaterName: booking.theater ? booking.theater.name : 'Theater',
                    screenName: screenName,
                    showDate: booking.showDate,
                    showTime: booking.showTime,
                    seats: booking.seats,
                    totalAmount: booking.totalAmount
                };
                
                await sendBookingConfirmation(emailData);
                booking.emailSent = true;
                await booking.save();
            } catch (emailError) {
                console.error(`[showBookingSuccess] Error sending email: ${emailError.message}`);
            }
        }
        
        req.session.lastBookingId = booking._id;
        const userForRender = req.session.user || null;
        
        return res.render('frontend/bookingSuccess', { 
            booking, 
            title: 'Booking Confirmed',
            user: userForRender
        });
    } catch (error) {
        console.error(`[showBookingSuccess] Error: ${error.message}`);
        return res.status(500).render('error', { 
            message: 'Error retrieving booking details. Please contact support.',
            title: 'Error'
        });
    }
};

exports.getUserBookings = async (req, res) => {
    try {
        
        if (!req.session.user) {
            req.session.redirectTo = '/bookings/all';
            return res.redirect('/user/login');
        }
        
        const userId = req.session.user.id || req.session.user._id;
        
        const bookings = await Booking.find({ user: userId })
            .sort({ bookingDate: -1 })
            .populate('movie')
            .populate('theater');

        res.locals.user = { ...req.session.user };
        res.locals.adminUser = null;
        
        res.render('frontend/booking', { 
            bookings,
            searchQuery: ''
        });
    } catch (error) {
        console.error('Error in getUserBookings:', error);
        res.status(500).render('error', { 
            message: 'Error loading your bookings. Please try again.',
            title: 'Error',
            searchQuery: ''
        });
    }
};

exports.cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    let userId;
    
    if (req.session.user && (req.session.user.id || req.session.user._id)) {
      userId = req.session.user.id || req.session.user._id;
    } else if (req.user && req.user._id) {
      // Passport user 
      userId = req.user._id;
    } else {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const bookingUserId = booking.user.toString();
    
    const isAdminRoute = req.path.includes('/admin') || req.originalUrl.includes('/admin');
    const isAdmin = isAdminRoute && req.session.adminUser && req.session.adminUser.role === 'admin';
    
    if (!isAdmin && bookingUserId !== userId.toString()) {
      console.error(`Unauthorized cancellation attempt: Session user ${userId} trying to cancel booking owned by ${bookingUserId}`);
      return res.status(403).json({ message: 'You are not authorized to cancel this booking' });
    }

    const showDateTime = new Date(`${booking.showDate}T${booking.showTime}`);
    const now = new Date();
    const hoursDifference = (showDateTime - now) / (1000 * 60 * 60);

    if (hoursDifference < 3 && !isAdmin) { 
      return res.status(400).json({ 
        message: 'Cannot cancel bookings less than 3 hours before show time' 
      });
    }

    booking.status = 'cancelled';
    booking.paymentStatus = 'refunded'; 
    
    await booking.save();

    res.json({ 
      success: true, 
      message: 'Booking cancelled successfully' 
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Error cancelling booking', error: error.message });
  }
};

exports.processPayment = async (req, res) => {
    try {
        if (!req.session.bookingDetails) {
            return res.status(400).json({
                success: false,
                message: 'No booking details found. Please start your booking again.'
            });
        }

        const bookingDetails = req.session.bookingDetails;
        let userId;
        
        if (bookingDetails.userId) {
            userId = bookingDetails.userId;
        } else if (req.session.user && (req.session.user.id || req.session.user._id)) {
            userId = req.session.user.id || req.session.user._id;
        } else if (req.user && req.user._id) {
            userId = req.user._id;
        } else {
            console.error('No user ID found for booking!');
            return res.status(403).json({
                success: false,
                message: 'User authentication required. Please log in again.'
            });
        }

        const booking = new Booking({
            user: userId,
            movie: bookingDetails.movieId,
            theater: bookingDetails.theaterId,
            screenId: bookingDetails.screenId,
            showId: bookingDetails.showId,
            showDate: bookingDetails.showDate,
            showTime: bookingDetails.showTime,
            seats: bookingDetails.selectedSeats,
            totalAmount: bookingDetails.totalAmount,
            basePrice: bookingDetails.basePrice,
            convenienceFee: bookingDetails.convenienceFee,
            standardPrice: bookingDetails.standardPrice, 
            premiumPrice: bookingDetails.premiumPrice, 
            paymentStatus: 'completed',
            status: 'confirmed',
            customerName: bookingDetails.customerName,
            customerEmail: bookingDetails.customerEmail,
            customerPhone: bookingDetails.customerPhone,
            bookingReference: uuidv4().substring(0, 8).toUpperCase(),
            emailSent: false
        });

        const savedBooking = await booking.save();

        const payment = new Payment({
            booking: savedBooking._id,
            user: userId,
            amount: bookingDetails.totalAmount,
            method: req.body.paymentMethod || 'card',
            status: 'completed'
        });

        await payment.save();

        if (!bookingDetails.isFallbackShow) {
            try {
                const show = await Show.findById(bookingDetails.showId);
                if (show) {
                    if (!show.bookedSeats) {
                        show.bookedSeats = [];
                    }

                    show.bookedSeats = [...show.bookedSeats, ...bookingDetails.selectedSeats];
                    await show.save();
                }
            } catch (err) {
                console.error('Error updating show booked seats (non-critical):', err);
            }
        }

        const movie = await Movie.findById(bookingDetails.movieId);
        const theater = await Theater.findById(bookingDetails.theaterId);

        const emailData = {
            email: bookingDetails.customerEmail,
            name: bookingDetails.customerName,
            bookingId: savedBooking.bookingReference,
            movieTitle: movie ? movie.title : 'Movie',
            theaterName: theater ? theater.name : 'Theater',
            screenName: bookingDetails.screenName || 'Screen 1',
            showDate: bookingDetails.showDate,
            showTime: bookingDetails.showTime,
            seats: bookingDetails.selectedSeats,
            totalAmount: bookingDetails.totalAmount
        };
        
        try {
            const emailSent = await sendBookingConfirmation(emailData);
            if (emailSent) {
                savedBooking.emailSent = true;
                await savedBooking.save();
            }
        } catch (emailError) {
            console.error('Failed to send booking confirmation email:', emailError);
        }
        req.session.lastBookingId = savedBooking._id;
        
        await new Promise((resolve, reject) => {
            req.session.save(err => { 
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
        
        delete req.session.bookingDetails;
        
        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) {
                    console.error('Error saving session after clearing booking details:', err);
                    resolve();
                } else {
                    resolve();
                }
            });
        });

        return res.json({
            success: true,
            redirectUrl: `/bookings/success/${savedBooking._id}`
        });
    } catch (error) {
        console.error('Payment processing error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while processing your payment. Please try again.'
        });
    }
};
