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
        // Get user id ONLY from the user session, never from adminUser
        let userId;
        if (req.session.user && (req.session.user.id || req.session.user._id)) {
            userId = req.session.user.id || req.session.user._id;
            console.log('Using user ID from session for simple booking:', userId);
        } else if (req.user && req.user._id) {
            // Fallback to passport user if available
            userId = req.user._id;
            console.log('Using passport user ID for simple booking:', userId);
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
            theater: req.body.theaterId || "6502f674a1d3a80b52b7c57e", // Default theater if not provided
            seats: seatsArray,
            showDate: req.body.showDate || new Date(),
            showTime: req.body.showTime || "20:00",
            totalAmount: totalPrice,
            bookingReference: uuidv4().substring(0, 8).toUpperCase(),
            paymentStatus: 'completed', // Set payment as completed for simple bookings
            status: 'confirmed'
        });

        await booking.save();
        console.log('Simple booking created with ID:', booking._id);
        console.log('Simple booking associated with user ID:', userId);
        
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

// Get available seats for a show
exports.getAvailableSeats = async (req, res) => {
  try {
    const { movieId, theaterId, showDate, showTime } = req.query;
    
    if (!movieId || !theaterId || !showDate || !showTime) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    // Find existing bookings for this show
    const bookings = await Booking.find({
      movie: movieId,
      theater: theaterId,
      showDate,
      showTime,
      status: { $ne: 'cancelled' }
    });

    // Get all booked seats
    const bookedSeats = bookings.reduce((seats, booking) => {
      return [...seats, ...booking.seats];
    }, []);

    // Get theater details to determine total seats
    const theater = await Theater.findById(theaterId);
    
    if (!theater) {
      return res.status(404).json({ message: 'Theater not found' });
    }

    // Get movie details
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
        // Log the request parameters for debugging
        console.log('=== SEAT SELECTION REQUESTED ===');
        console.log('Movie ID (params):', req.params.movieId);
        console.log('Theater ID (params):', req.params.theaterId);
        console.log('Date (query):', req.query.date);
        console.log('Time (query):', req.query.time);
        console.log('Session user:', req.session && req.session.user ? req.session.user.name : 'None');

        // Additional date debugging
        if (req.query.date) {
            console.log('Date as received:', req.query.date);
            
            // Don't convert to Date object - use the string directly
            console.log('Using exact date string from URL');
        } else {
            console.error('No date provided in query parameters');
            return res.status(400).render('error', {
                message: 'Date is required for seat selection',
                title: 'Selection Error'
            });
        }

        // Get movieId and theaterId from URL parameters, date and time from query parameters
        const movieId = req.params.movieId;
        const theaterId = req.params.theaterId;
        const { date, time } = req.query;
        
        // Validate all required parameters
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

        // Get movie and theater details
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
        
        console.log('Movie:', movie.title);
        console.log('Theater:', theater.name);
        
        // Keep the original date string (YYYY-MM-DD) - DO NOT create a new Date object
        const originalDate = date;
        console.log('Using original date string:', originalDate);
        
        // Find existing bookings for this show using string date
        const bookings = await Booking.find({
            movie: movieId,
            theater: theaterId,
            showDate: originalDate,
            showTime: time,
            status: { $ne: 'cancelled' }
        });
        
        console.log(`Found ${bookings.length} bookings for show: ${movie.title} at ${theater.name} on ${originalDate} at ${time}`);
        
        // Get all booked seats
        const bookedSeats = bookings.reduce((seats, booking) => {
            return seats.concat(booking.seats);
        }, []);
        
        console.log('Total booked seats from bookings:', bookedSeats.length);
        
        // Find the show for this movie, theater, date and time
        const show = await findShowByExactDate(movieId, theaterId, originalDate, time);
        console.log('Found show for seat selection:', show ? `Show ID: ${show._id}` : 'No show found');
        
        // Get screen info from show if available
        let screen = null;
        let seats = [];
        if (show && show.screenId) {
            // Try to find the screen from the theater
            if (theater.screens && theater.screens.length > 0) {
                screen = theater.screens.find(s => s._id.toString() === show.screenId.toString());
                console.log('Found screen from theater:', screen ? screen.name : 'Not found');
            }
        }
        
        // Make sure show is defined before trying to access properties
        let standardPrice = 200;
        let premiumPrice = 300;
        
        if (show) {
            // Use the price field directly from the show model
            standardPrice = show.price || 200;
            premiumPrice = standardPrice + 100; // Always 100 more than standard
            
            // Log the prices directly from the database
            console.log(`Using show price from database: ${show.price}`);
            console.log(`Standard price: ${standardPrice}, Premium price: ${premiumPrice}`);
        }
        
        console.log('=== RENDERING SEAT SELECTION ===');
        console.log(`Movie: ${movie.title} (${movieId})`);
        console.log(`Date: ${originalDate}`);
        console.log(`Standard Price: ${standardPrice}`);
        console.log(`Premium Price: ${premiumPrice}`);
        
        // Render the seat selection page
        return res.render('frontend/selectSeats', {
            movie,
            theater,
            screen,
            show,
            standardPrice, 
            premiumPrice,
            seats: seats || [],
            bookedSeats: bookedSeats || [],  // Add bookedSeats
            screenId: screen ? screen._id : null,  // Add screenId for template
            screenName: screen ? screen.name : 'Screen 1',  // Add screenName for template
            showDate: originalDate,
            showTime: time,
            date: originalDate,  // Add date alias for backward compatibility
            time: time,  // Add time alias for backward compatibility
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

// Show booking confirmation page
exports.confirmBooking = async (req, res) => {
    try {
        // Log full request body for debugging
        console.log('Received booking request:', {
            body: req.body,
            contentType: req.headers['content-type'],
            method: req.method
        });
        
        // Extract booking details from the request body
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
            customerPhone  // Add customer phone to the extracted data
        } = req.body;
        
        console.log('Extracted booking data:', {
            movieId, 
            theaterId, 
            date, 
            time, 
            selectedSeats: selectedSeats ? (typeof selectedSeats === 'string' ? selectedSeats.substring(0, 20) + '...' : 'array') : 'missing',
            standardPrice,
            premiumPrice
        });
        
        // Debug session information
        console.log('===== SESSION DEBUG IN CONFIRM BOOKING =====');
        console.log('User session:', req.session && req.session.user ? {
            id: req.session.user.id || req.session.user._id,
            name: req.session.user.name,
            role: req.session.user.role
        } : 'None');
        console.log('Admin session:', req.session && req.session.adminUser ? {
            id: req.session.adminUser.id || req.session.adminUser._id,
            name: req.session.adminUser.name,
            role: req.session.adminUser.role
        } : 'None');
        console.log('Request path:', req.path);
        console.log('===========================================');

        // Get user info from session or authenticated user
        // ONLY use the user session, never adminUser
        let userData = {};
        
        // Check if we have user data in the session
        if (req.session && req.session.user) {
            userData = {
                id: req.session.user.id || req.session.user._id,
                name: req.session.user.name,
                email: req.session.user.email,
                phone: req.session.user.phone || customerPhone || ""
            };
            
            console.log('Using user data from session:', userData);
        } else if (req.user) {
            // Fallback to passport user if available
            userData = {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                phone: req.user.phone || customerPhone || ""
            };
            
            console.log('Using user data from passport:', userData);
        } else {
            console.error('No user data found in session or passport!');
            return res.status(401).json({ 
                success: false, 
                message: 'User authentication required. Please log in again.',
                redirectTo: '/user/login'
            });
        }

        // Validate required parameters
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
        
        // Convert selectedSeats to array if it's a string
        const seats = Array.isArray(selectedSeats) ? selectedSeats : selectedSeats.split(',');
        
        console.log('Parsed seats:', seats);
        
        if (!seats.length) {
            console.error('No seats selected for booking');
            return res.status(400).json({ 
                success: false, 
                message: 'Please select at least one seat'
            });
        }

        // Get movie and theater data
        const movie = await Movie.findById(movieId);
        const theater = await Theater.findById(theaterId);
        
        if (!movie || !theater) {
            console.error('Movie or theater not found');
            return res.status(404).json({ 
                success: false, 
                message: 'Movie or theater not found'
            });
        }
        
        // Convert date string to Date object
        // Keep the original date string for UI and the Date object for the database
        const originalDate = date;
        let showDate;
        
        try {
            // If date is in YYYY-MM-DD format, parse it
            if (originalDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                showDate = new Date(originalDate);
            } else {
                // Try to parse other date formats
                showDate = new Date(originalDate);
            }
            
            // Check if the date is valid
            if (isNaN(showDate.getTime())) {
                throw new Error('Invalid date');
            }
        } catch (error) {
            // Fallback to current date if parsing fails
            console.error('Error parsing date:', error);
            showDate = new Date();
        }
        
        // Get the show for this movie, theater, date and time
        const show = await findShowByExactDate(movieId, theaterId, originalDate, time);
        
        console.log('Found show for booking:', show ? show._id : 'No show found');
        
        // Parse the seat prices from JSON string if available
        let parsedSeatPrices = [];
        if (seatPrices) {
            try {
                parsedSeatPrices = JSON.parse(seatPrices);
            } catch (error) {
                console.error('Error parsing seat prices:', error);
                // We'll calculate prices based on standard/premium prices instead
            }
        }
        
        // Calculate total price if not provided
        let calculatedTotalPrice = 0;
        
        if (parsedSeatPrices.length > 0) {
            // Sum up the prices from the parsed seat prices
            calculatedTotalPrice = parsedSeatPrices.reduce((sum, item) => sum + (item.price || 0), 0);
        } else {
            // Calculate based on standard/premium prices
            const stdPrice = parseFloat(standardPrice) || 200;
            const premPrice = parseFloat(premiumPrice) || 300;
            
            // Assuming premium seats are in the back rows (e.g., rows F-J are premium if we have A-J)
            const isPremiumSeat = (seat) => {
                const row = seat.charAt(0);
                // Simple logic: Second half of alphabet is premium
                return row >= 'F' && row <= 'Z';
            };
            
            // Calculate based on seat type (premium or standard)
            calculatedTotalPrice = seats.reduce((sum, seat) => {
                return sum + (isPremiumSeat(seat) ? premPrice : stdPrice);
            }, 0);
        }
        
        // Add convenience fee (5% of subtotal)
        const convenienceFee = Math.round(calculatedTotalPrice * 0.05);
        const finalTotalPrice = calculatedTotalPrice + convenienceFee;
        
        // Use the provided total price or the calculated one
        const bookingTotalPrice = totalPrice ? parseFloat(totalPrice) : finalTotalPrice;
        
        // Store booking details in session for payment and next steps
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
            standardPrice: parseFloat(standardPrice) || 200, // Store standardPrice explicitly
            premiumPrice: parseFloat(premiumPrice) || 300, // Store premiumPrice explicitly
            customerName: userData.name,
            customerEmail: userData.email,
            customerPhone: customerPhone || userData.phone || ""
        };
        
        // Log the prices being stored in the session
        console.log('Prices being stored in session:');
        console.log('Standard Price:', parseFloat(standardPrice) || 200);
        console.log('Premium Price:', parseFloat(premiumPrice) || 300);
        
        // Ensure session is saved before redirecting
        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) {
                    console.error('Error saving session:', err);
                    reject(err);
                } else {
                    console.log('Session saved successfully');
                    resolve();
                }
            });
        });

        console.log('Booking details stored in session:', req.session.bookingDetails);

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
        console.log("[showBookingSuccess] Starting to retrieve booking details");
        
        // Debug session information
        console.log('===== SESSION DEBUG IN BOOKING SUCCESS =====');
        console.log('User session:', req.session.user ? {
            id: req.session.user.id || req.session.user._id,
            name: req.session.user.name,
            role: req.session.user.role
        } : 'None');
        console.log('Admin session:', req.session.adminUser ? 'Present' : 'None');
        console.log('Request path:', req.path);
        console.log('===========================================');
        
        // Get booking ID from session or URL parameter
        let bookingId = req.session.lastBookingId || req.params.id;
        
        if (!bookingId) {
            console.error("[showBookingSuccess] No booking ID found in session or params");
            return res.status(404).render('error', { 
                message: 'Booking details not found. Please check your bookings in your account.',
                title: 'Booking Not Found'
            });
        }
        
        console.log(`[showBookingSuccess] Looking up booking with ID: ${bookingId}`);
        
        // Find booking with populated references
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
        
        console.log(`[showBookingSuccess] Found booking for movie: ${booking.movie ? booking.movie.title : 'Unknown'}`);
        
        // Add a security check to ensure users can only view their own bookings
        if (req.session.user && booking.user) {
            const sessionUserId = req.session.user.id || req.session.user._id;
            const bookingUserId = booking.user.toString();
            
            console.log(`[showBookingSuccess] Session user ID: ${sessionUserId}, Booking user ID: ${bookingUserId}`);
            
            // Skip check if booking doesn't have a user or if we're in dev mode
            if (process.env.NODE_ENV !== 'development' && sessionUserId !== bookingUserId) {
                console.error(`[showBookingSuccess] User ID mismatch: ${sessionUserId} vs ${bookingUserId}`);
                return res.status(403).render('error', { 
                    message: 'You are not authorized to view this booking.',
                    title: 'Access Denied'
                });
            }
        }
        
        // Check if confirmation email was sent
        const emailSent = booking.emailSent || false;
        
        // Send confirmation email if not already sent
        if (!emailSent && booking.customerEmail) {
            try {
                console.log(`[showBookingSuccess] Sending confirmation email to ${booking.customerEmail}`);
                
                // Determine correct screen name
                let screenName = 'Screen 1'; // Default value
                
                if (booking.screenName) {
                    screenName = booking.screenName;
                    console.log(`[showBookingSuccess] Using screen name from booking: ${screenName}`);
                } else if (booking.screenId) {
                    // Could potentially look up screen name from ID here if needed
                    screenName = `Screen ${booking.screenId}`;
                    console.log(`[showBookingSuccess] Using generated screen name from ID: ${screenName}`);
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
                console.log(`[showBookingSuccess] Confirmation email sent successfully`);
            } catch (emailError) {
                console.error(`[showBookingSuccess] Error sending email: ${emailError.message}`);
                // Continue with showing success page even if email fails
            }
        }
        
        // Store the booking ID in the session for future reference
        req.session.lastBookingId = booking._id;
        
        // Save the session to ensure it's properly stored
        await new Promise((resolve) => {
            req.session.save(err => {
                if (err) {
                    console.error('Error saving session in success page:', err);
                } else {
                    console.log('Session saved successfully in success page');
                }
                resolve();
            });
        });
        
        // Use only the frontend user session, never admin session
        const userForRender = req.session.user || null;
        
        // Render the success page with booking details
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

// Get all user bookings for the current user
exports.getUserBookings = async (req, res) => {
    try {
        console.log('==== FETCHING USER BOOKINGS ====');
        
        // Debug session information
        console.log('Session user:', req.session.user ? {
            id: req.session.user.id || req.session.user._id,
            name: req.session.user.name,
            role: req.session.user.role
        } : 'None');
        console.log('Session adminUser:', req.session.adminUser ? {
            id: req.session.adminUser.id || req.session.adminUser._id,
            name: req.session.adminUser.name,
            role: req.session.adminUser.role
        } : 'None');
        
        // ONLY use req.session.user, NEVER use adminUser for frontend pages
        if (!req.session.user) {
            console.log('No user in session, redirecting to login');
            req.session.redirectTo = '/bookings/all';
            return res.redirect('/user/login');
        }
        
        // Get user ID from session user only, not from admin session
        const userId = req.session.user.id || req.session.user._id;
        console.log('Using user ID for bookings:', userId);
        
        // Find all bookings for this user
        const bookings = await Booking.find({ user: userId })
            .sort({ bookingDate: -1 })
            .populate('movie')
            .populate('theater');
        
        console.log(`Found ${bookings.length} bookings for user ID ${userId}`);
        
        // Ensure only user data is set in locals for frontend view
        res.locals.user = { ...req.session.user };
        res.locals.adminUser = null;
        
        // Render bookings page
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

// Cancel booking
exports.cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    // Debug session information
    console.log('===== SESSION DEBUG IN CANCEL BOOKING =====');
    console.log('User session:', req.session.user ? {
        id: req.session.user.id || req.session.user._id,
        name: req.session.user.name,
        role: req.session.user.role
    } : 'None');
    console.log('Admin session:', req.session.adminUser ? 'Present (Role: ' + req.session.adminUser.role + ')' : 'None');
    console.log('Request path:', req.path);
    console.log('===========================================');
    
    // Use the booking user ID from the session data - ONLY use user session, not admin session
    let userId;
    
    if (req.session.user && (req.session.user.id || req.session.user._id)) {
      // Regular user from session
      userId = req.session.user.id || req.session.user._id;
      console.log('Using session user ID for cancel booking:', userId);
    } else if (req.user && req.user._id) {
      // Passport user 
      userId = req.user._id;
      console.log('Using passport user ID for cancel booking:', userId);
    } else {
      // If we can't determine user ID, return error
      console.log('No user ID found for cancel booking');
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if user is authorized to cancel this booking
    const bookingUserId = booking.user.toString();
    
    // Admin users can cancel any booking if this is an admin route
    const isAdminRoute = req.path.includes('/admin') || req.originalUrl.includes('/admin');
    const isAdmin = isAdminRoute && req.session.adminUser && req.session.adminUser.role === 'admin';
    
    if (!isAdmin && bookingUserId !== userId.toString()) {
      console.error(`Unauthorized cancellation attempt: Session user ${userId} trying to cancel booking owned by ${bookingUserId}`);
      return res.status(403).json({ message: 'You are not authorized to cancel this booking' });
    }

    // Check if booking is eligible for cancellation (e.g., not too close to show time)
    const showDateTime = new Date(`${booking.showDate}T${booking.showTime}`);
    const now = new Date();
    const hoursDifference = (showDateTime - now) / (1000 * 60 * 60);

    if (hoursDifference < 3 && !isAdmin) { // Admin can bypass time restriction
      return res.status(400).json({ 
        message: 'Cannot cancel bookings less than 3 hours before show time' 
      });
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.paymentStatus = 'refunded'; // In a real app, process refund with payment gateway
    
    await booking.save();
    console.log(`Booking ${bookingId} successfully cancelled by user ${userId}`);

    res.json({ 
      success: true, 
      message: 'Booking cancelled successfully' 
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Error cancelling booking', error: error.message });
  }
};

// Process payment and create booking
exports.processPayment = async (req, res) => {
    try {
        // Check if booking details exist in session
        if (!req.session.bookingDetails) {
            return res.status(400).json({
                success: false,
                message: 'No booking details found. Please start your booking again.'
            });
        }

        const bookingDetails = req.session.bookingDetails;
        console.log('Processing payment for booking:', bookingDetails);

        // Debug session information
        console.log('===== SESSION DEBUG IN PROCESS PAYMENT =====');
        console.log('User session:', req.session.user ? {
            id: req.session.user.id || req.session.user._id,
            name: req.session.user.name,
            role: req.session.user.role
        } : 'None');
        console.log('Admin session:', req.session.adminUser ? {
            id: req.session.adminUser.id || req.session.adminUser._id,
            name: req.session.adminUser.name,
            role: req.session.adminUser.role
        } : 'None');
        console.log('===========================================');

        // Get user id - first try the ID stored in bookingDetails (most reliable source)
        // Then try the user session, NEVER use adminUser
        let userId;
        
        if (bookingDetails.userId) {
            // Use the userId from booking details (most reliable source)
            userId = bookingDetails.userId;
            console.log('Using user ID from booking details:', userId);
        } else if (req.session.user && (req.session.user.id || req.session.user._id)) {
            // Fallback to session user if available
            userId = req.session.user.id || req.session.user._id;
            console.log('Using user ID from session for booking:', userId);
        } else if (req.user && req.user._id) {
            // Fallback to passport user if available
            userId = req.user._id;
            console.log('Using passport user ID for booking:', userId);
        } else {
            console.error('No user ID found for booking!');
            return res.status(403).json({
                success: false,
                message: 'User authentication required. Please log in again.'
            });
        }

        // Create a new booking
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
            standardPrice: bookingDetails.standardPrice, // Save standard price for reference
            premiumPrice: bookingDetails.premiumPrice, // Save premium price for reference
            paymentStatus: 'completed',
            status: 'confirmed',
            customerName: bookingDetails.customerName,
            customerEmail: bookingDetails.customerEmail,
            customerPhone: bookingDetails.customerPhone,
            bookingReference: uuidv4().substring(0, 8).toUpperCase(),
            emailSent: false
        });

        // Save the booking
        const savedBooking = await booking.save();
        console.log('Booking created with ID:', savedBooking._id);
        console.log('Booking associated with user ID:', userId);

        // Create payment record
        const payment = new Payment({
            booking: savedBooking._id,
            user: userId,
            amount: bookingDetails.totalAmount,
            method: req.body.paymentMethod || 'card',
            status: 'completed'
        });

        await payment.save();
        console.log('Payment record created with ID:', payment._id);

        // Update the Show document to mark seats as booked
        if (!bookingDetails.isFallbackShow) {
            try {
                const show = await Show.findById(bookingDetails.showId);
                if (show) {
                    // If bookedSeats doesn't exist, initialize it as an empty array
                    if (!show.bookedSeats) {
                        show.bookedSeats = [];
                    }

                    // Add the newly booked seats
                    show.bookedSeats = [...show.bookedSeats, ...bookingDetails.selectedSeats];
                    await show.save();
                    console.log('Updated show with booked seats');
                }
            } catch (err) {
                console.error('Error updating show booked seats (non-critical):', err);
                // Continue processing, this is not critical
            }
        } else {
            console.log('Skipping show update as this is a fallback show');
        }

        // Fetch movie and theater details for confirmation email
        const movie = await Movie.findById(bookingDetails.movieId);
        const theater = await Theater.findById(bookingDetails.theaterId);

        // Send email confirmation
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
                console.log('Booking confirmation email sent to:', bookingDetails.customerEmail);
                // Update booking to mark email as sent
                savedBooking.emailSent = true;
                await savedBooking.save();
            }
        } catch (emailError) {
            console.error('Failed to send booking confirmation email:', emailError);
            // Continue with booking process even if email fails
        }

        // Store booking ID in session for the success page and save it
        // IMPORTANT: Save the booking ID before clearing the booking details
        req.session.lastBookingId = savedBooking._id;
        
        // Save session and wait for it to complete before responding
        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) {
                    console.error('Error saving session:', err);
                    reject(err);
                } else {
                    console.log('Session saved successfully with lastBookingId:', req.session.lastBookingId);
                    resolve();
                }
            });
        });
        
        // Now that the session is saved, we can clear the booking details
        delete req.session.bookingDetails;
        
        // Save the session again after removing bookingDetails
        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) {
                    console.error('Error saving session after clearing booking details:', err);
                    // Don't reject here, as we've already saved the important data
                    resolve();
                } else {
                    console.log('Session saved successfully after clearing booking details');
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
