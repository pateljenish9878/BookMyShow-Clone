const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' 
    },
    amount: {
        type: Number,
        required: true
    },
    method: {
        type: String,
        enum: ['card', 'upi', 'netbanking', 'wallet'],
        default: 'card'
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    transactionId: {
        type: String
    },
    paymentDate: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema); 