const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { authenticate } = require('../middleware/auth');
const Movie = require('../models/Movie');
const Theater = require('../models/Theater');

// Root path redirects to the /all endpoint for backward compatibility
router.get('/', authenticate, (req, res) => {
    res.redirect('/bookings/all');
});

// Get booking routes
router.get('/movie/:id', authenticate, bookingController.getBookingPage);
router.get('/select-seats/:movieId/:theaterId', authenticate, bookingController.selectSeats);

// Update the payment route to render the confirmBooking page instead
router.get('/payment', authenticate, async (req, res) => {
    if (!req.session.bookingDetails) {
        return res.status(400).render('error', {
            message: 'No booking information found. Please start your booking again.',
            title: 'Booking Error'
        });
    }
    
    // Get booking details from session
    const bookingDetails = req.session.bookingDetails;
    
    try {
        // Fetch complete movie and theater details
        const movie = await Movie.findById(bookingDetails.movieId);
        const theater = await Theater.findById(bookingDetails.theaterId);
        
        if (!movie || !theater) {
            return res.status(404).render('error', {
                message: 'Movie or theater details not found.',
                title: 'Not Found'
            });
        }
        
        // Render the confirm booking page with all necessary data
        res.render('frontend/confirmBooking', { 
            movie: movie,
            theater: theater,
            date: bookingDetails.showDate,
            time: bookingDetails.showTime,
            selectedSeats: bookingDetails.selectedSeats.join(','),
            standardPrice: bookingDetails.standardPrice || 200,
            premiumPrice: bookingDetails.premiumPrice || 300
        });
    } catch (error) {
        return res.status(500).render('error', {
            message: 'Error loading booking details. Please try again.',
            title: 'Error'
        });
    }
});

// Combined route for success page - with or without ID
router.get('/success/:id?', authenticate, async (req, res) => {
    try {
        // If ID is in URL params, store it in session
        if (req.params.id) {
            req.session.lastBookingId = req.params.id;
            
            // Save session to make sure ID is stored
            await new Promise((resolve) => {
                req.session.save(err => {
                    resolve();
                });
            });
        }
        
        // Call the controller function to show success page
        bookingController.showBookingSuccess(req, res);
    } catch (error) {
        return res.status(500).render('error', { 
            message: 'Failed to load booking details',
            title: 'Error'
        });
    }
});

router.get('/all', authenticate, bookingController.getUserBookings);
router.get('/available-seats', authenticate, bookingController.getAvailableSeats);

// Post booking routes
router.post('/confirm-booking', authenticate, bookingController.confirmBooking);
router.post('/process-payment', authenticate, bookingController.processPayment);
router.post('/cancel/:bookingId', authenticate, bookingController.cancelBooking);

// Create a simple booking (for testing)
router.post('/create-simple-booking', authenticate, bookingController.createSimpleBooking);

module.exports = router;
