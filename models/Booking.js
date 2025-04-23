const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    movie: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Movie',
        required: true
    },
    theater: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Theater',
        required: true
    },
    screenId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Screen',
        default: null
    },
    // Add this virtual to support legacy code that may refer to 'screen'
    screen: {
        type: Object,
        default: function() {
            return { name: 'Screen 1' };
        }
    },
    showId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Show',
        default: null
    },
    seats: {
        type: [String],
        required: true
    },
    showDate: {
        type: String,
        required: true
    },
    showTime: {
        type: String,
        required: true
    },
    customerName: {
        type: String,
        default: ''
    },
    customerEmail: {
        type: String,
        default: ''
    },
    customerPhone: {
        type: String,
        default: ''
    },
    basePrice: {
        type: Number,
        default: 0
    },
    convenienceFee: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['card', 'upi', 'wallet', 'netbanking'],
        default: 'card'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    status: {
        type: String,
        enum: ['confirmed', 'cancelled', 'completed'],
        default: 'confirmed'
    },
    bookingReference: {
        type: String,
        required: true,
        unique: true
    },
    emailSent: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field on save
BookingSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model("Booking", BookingSchema);
