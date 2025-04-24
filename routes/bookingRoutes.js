const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { authenticate } = require('../middleware/auth');
const Movie = require('../models/Movie');
const Theater = require('../models/Theater');

router.get('/', authenticate, (req, res) => {
    res.redirect('/bookings/all');
});

router.get('/movie/:id', authenticate, bookingController.getBookingPage);
router.get('/select-seats/:movieId/:theaterId', authenticate, bookingController.selectSeats);

router.get('/payment', authenticate, async (req, res) => {
    if (!req.session.bookingDetails) {
        return res.status(400).render('error', {
            message: 'No booking information found. Please start your booking again.',
            title: 'Booking Error',
            searchQuery: ''
        });
    }
    
    const bookingDetails = req.session.bookingDetails;
    
    try {
        const movie = await Movie.findById(bookingDetails.movieId);
        const theater = await Theater.findById(bookingDetails.theaterId);
        
        if (!movie || !theater) {
            return res.status(404).render('error', {
                message: 'Movie or theater details not found.',
                title: 'Not Found',
                searchQuery: ''
            });
        }
        
        const selectedSeats = Array.isArray(bookingDetails.selectedSeats) 
            ? bookingDetails.selectedSeats.join(',') 
            : bookingDetails.selectedSeats;
            
        let displayDate = bookingDetails.showDate;
        if (displayDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = displayDate.split('-');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            displayDate = `${parseInt(day)} ${months[parseInt(month)-1]} ${year}`;
        }
        
        const standardPrice = bookingDetails.standardPrice || 200;
        const premiumPrice = bookingDetails.premiumPrice || 300;
        
        
        
        res.render('frontend/confirmBooking', { 
            movie: movie,
            theater: theater,
            date: displayDate,
            time: bookingDetails.showTime,
            selectedSeats: selectedSeats,
            totalAmount: bookingDetails.totalAmount,
            basePrice: bookingDetails.basePrice,
            convenienceFee: bookingDetails.convenienceFee,
            standardPrice: standardPrice,
            premiumPrice: premiumPrice,
            screenName: bookingDetails.screenName || 'Screen 1',
            customerName: bookingDetails.customerName,
            customerEmail: bookingDetails.customerEmail,
            customerPhone: bookingDetails.customerPhone,
            searchQuery: ''
        });
    } catch (error) {
        console.error('Error rendering payment page:', error);
        return res.status(500).render('error', {
            message: 'Error loading booking details. Please try again.',
            title: 'Error',
            searchQuery: ''
        });
    }
});

router.get('/success/:id?', authenticate, async (req, res) => {
    try {
        if (req.params.id) {
            req.session.lastBookingId = req.params.id;
            
            await new Promise((resolve) => {
                req.session.save(err => {
                    resolve();
                });
            });
        }
        
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

router.post('/confirm-booking', authenticate, bookingController.confirmBooking);
router.post('/process-payment', authenticate, bookingController.processPayment);
router.post('/cancel/:bookingId', authenticate, bookingController.cancelBooking);

router.post('/create-simple-booking', authenticate, bookingController.createSimpleBooking);

module.exports = router;
