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

        // Additional date debugging
        if (req.query.date) {
            console.log('Date as received:', req.query.date);
            
            // Don't convert to Date object - use the string directly
            console.log('Using exact date string from URL');
        }

        // Get movieId and theaterId from URL parameters, date and time from query parameters
        const movieId = req.params.movieId;
        const theaterId = req.params.theaterId;
        const { date, time } = req.query;
        
        // Validate all required parameters
        if (!movieId || !theaterId || !date || !time) {
            return res.status(400).render('error', {
                message: 'Missing required parameters for seat selection',
                title: 'Selection Error'
            });
        }

        // Get movie and theater details
        const movie = await Movie.findById(movieId);
        const theater = await Theater.findById(theaterId);
        
        if (!movie || !theater) {
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
        
        // Set default prices
        let standardPrice = 200;
        let premiumPrice = 300;
        
        // Find the show to get the ticket price using our custom function
        console.log(`Looking for show with Movie=${movieId}, Theater=${theaterId}, Date=${originalDate}, Time=${time}`);
        
        // Use the custom function that avoids timezone issues
        const show = await findShowByExactDate(movieId, theaterId, originalDate, time);
        
        // Set default screen info
        let screenId = null;
        let screenName = 'Screen 1'; // Default screen name
        
        // If a show is found, get all details
        if (show) {
            console.log('=== SHOW FOUND ===');
            console.log('Show ID:', show._id);
            console.log('Show Date String:', show.dateString || 'Not available');
            
            // Extract screen information
            if (show.screenId) {
                screenId = show.screenId;
                console.log('Screen ID from show:', screenId);
            }
            
            if (show.screenName) {
                screenName = show.screenName;
                console.log('Screen Name from show:', screenName);
            } else if (show.screen && show.screen.name) {
                screenName = show.screen.name;
                console.log('Screen Name from screen object:', screenName);
            }
            
            // Special handling for Kesari Chapter 2 movie
            if (movie.title.includes('Kesari Chapter')) {
                console.log('Applying special pricing for Kesari Chapter 2');
                standardPrice = 150;
                premiumPrice = 250;
                console.log(`Using Kesari Chapter 2 special prices: Standard=${standardPrice}, Premium=${premiumPrice}`);
            }
            // Special handling for Chhava movie
            else if (movie.title.includes('Chhava')) {
                console.log('Applying special pricing for Chhava');
                standardPrice = 350;
                premiumPrice = 450;
                console.log(`Using Chhava special prices: Standard=${standardPrice}, Premium=${premiumPrice}`);
            }
            // Check if show has explicit standardPrice and premiumPrice
            else if (show.standardPrice && show.premiumPrice) {
                standardPrice = parseInt(show.standardPrice);
                premiumPrice = parseInt(show.premiumPrice);
                console.log(`Using explicit prices: Standard=${standardPrice}, Premium=${premiumPrice}`);
            } 
            // Fall back to single price if standardPrice is not available
            else if (show.price) {
                console.log('Price:', show.price);
                standardPrice = parseInt(show.price);
                premiumPrice = standardPrice + 100;
                console.log(`Using calculated prices from show.price: Standard=${standardPrice}, Premium=${premiumPrice}`);
            }
            // If no prices available in the show object, use defaults
            else {
                standardPrice = 250;
                premiumPrice = 350;
                console.log(`No price information in show, using defaults: Standard=${standardPrice}, Premium=${premiumPrice}`);
            }
        } else {
            console.log('No shows found, using default prices');
            standardPrice = 250;
            premiumPrice = 350;
        }
        
        console.log(`Using show prices: Standard=${standardPrice}, Premium=${premiumPrice}`);
        console.log('Screen information: ID =', screenId, 'Name =', screenName);
        console.log('Rendering seat selection with prices:', standardPrice, premiumPrice);
        
        console.log('=== RENDERING SEAT SELECTION ===');
        console.log(`Movie: ${movie.title} (${movieId})`);
        console.log(`Date: ${originalDate}`);
        console.log(`Standard Price: ${standardPrice}`);
        console.log(`Premium Price: ${premiumPrice}`);
        
        // Render the seat selection page with the URL date, not a converted date
        res.render('frontend/selectSeats', {
            movie,
            theater,
            date: originalDate, // Use the original date string from URL
            time,
            bookedSeats,
            standardPrice,
            premiumPrice,
            screenId,
            screenName,
            selectedDate: originalDate // Pass selected date explicitly 
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
        
        console.log('Received booking data:', req.body);
        
        // Debug session information
        console.log('===== SESSION DEBUG IN CONFIRM BOOKING =====');
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
        console.log('Request path:', req.path);
        console.log('===========================================');

        // Get user info from session or authenticated user
        // ONLY use the user session, never adminUser
        let userData = {};
        
        if (req.session.user) {
            // Session user - preferred method
            userData = {
                id: req.session.user.id || req.session.user._id,
                name: req.session.user.name,
                email: req.session.user.email,
                phone: req.session.user.phone || ''
            };
            console.log('Using session user data for booking:', userData);
        } else if (req.user) {
            // Passport authenticated user
            userData = {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                phone: req.user.phone || ''
            };
            console.log('Using passport user data for booking:', userData);
        } else {
            // Guest user - redirect to login
            console.log('No user data found, redirecting to login');
            return res.status(403).json({ 
                success: false, 
                message: 'Please login to continue with booking',
                redirectToLogin: true
            });
        }
        
        // Include customer phone from the request body or from user data if available
        const finalCustomerPhone = customerPhone || userData.phone || '';
        console.log('Customer phone for booking:', finalCustomerPhone);

        // Validate required fields with detailed logging
        const missingFields = [];
        if (!movieId) missingFields.push('movieId');
        if (!theaterId) missingFields.push('theaterId');
        if (!date) missingFields.push('date');
        if (!time) missingFields.push('time');
        if (!selectedSeats) missingFields.push('selectedSeats');
        if (!totalPrice) missingFields.push('totalPrice');
        
        if (missingFields.length > 0) {
            console.error('Missing required fields:', missingFields);
            return res.status(400).json({ 
                success: false, 
                message: `Missing required booking information: ${missingFields.join(', ')}` 
            });
        }

        // Find the movie and theater
        const movie = await Movie.findById(movieId);
        const theater = await Theater.findById(theaterId);
        
        if (!movie || !theater) {
            const notFound = [];
            if (!movie) notFound.push('Movie');
            if (!theater) notFound.push('Theater');
            console.error(`${notFound.join(' and ')} not found:`, { movieId, theaterId });
            
            return res.status(404).json({ 
                success: false, 
                message: `${notFound.join(' and ')} not found` 
            });
        }

        // Find the show using the helper function
        const show = await findShowByExactDate(movieId, theaterId, date, time);
        
        if (!show) {
            console.error('Show not found for parameters:', { movieId, theaterId, date, time });
            return res.status(404).json({ 
                success: false, 
                message: 'Show not found. Please check the date and time.' 
            });
        }
        
        // Get screen information from show or use provided values
        const finalScreenId = screenId || (show.screenId ? show.screenId : null);
        const finalScreenName = screenName || (show.screenName ? show.screenName : 'Screen 1');
        
        console.log('Final screen information:', {
            screenId: finalScreenId,
            screenName: finalScreenName
        });

        // Parse the selected seats and seatPrices
        const selectedSeatsArray = selectedSeats.includes(',') 
            ? selectedSeats.split(',') 
            : [selectedSeats];
            
        let seatPricesArray;
        try {
            // Try to parse if it's a JSON string, otherwise use as-is
            seatPricesArray = typeof seatPrices === 'string' 
                ? JSON.parse(seatPrices) 
                : seatPrices || [];
        } catch (e) {
            console.error('Error parsing seatPrices:', e);
            seatPricesArray = [];
        }
        
        console.log('Parsed data:', {
            selectedSeatsArray,
            seatPricesArray,
            totalPrice
        });

        // Calculate convenience fee (5% of base price)
        const totalPriceNumber = parseInt(totalPrice, 10) || 0;
        
        // Calculate base price (original ticket price before convenience fee)
        // Since totalPrice = basePrice + (basePrice * 0.05)
        // totalPrice = basePrice * 1.05
        // Therefore basePrice = totalPrice / 1.05
        const basePrice = Math.round(totalPriceNumber / 1.05);
        const convenienceFee = totalPriceNumber - basePrice;

        // Store booking details in session for payment
        req.session.bookingDetails = {
            movieId: movie._id,
            movieTitle: movie.title,
            theaterId: theater._id,
            theaterName: theater.name,
            screenId: finalScreenId,
            screenName: finalScreenName,
            showId: show._id,
            showDate: date,
            showTime: time,
            selectedSeats: selectedSeatsArray,
            seatPrices: seatPricesArray,
            standardPrice: parseInt(standardPrice, 10) || 200,
            premiumPrice: parseInt(premiumPrice, 10) || 300,
            basePrice: basePrice,
            convenienceFee: convenienceFee,
            totalAmount: totalPriceNumber,
            // Use the user data we extracted earlier, including the ID
            userId: userData.id,
            customerName: userData.name,
            customerEmail: userData.email,
            customerPhone: finalCustomerPhone,
            isFallbackShow: show.isFallbackShow || false
        };

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
