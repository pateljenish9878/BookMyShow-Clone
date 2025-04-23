const mongoose = require("mongoose");

const TheaterSchema = new mongoose.Schema({
    name: { type: String, required: true },
    location: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String },
    totalSeats: { type: Number, required: true },
    screens: [
        {
            name: { type: String, required: true },
            totalSeats: { type: Number, required: true },
            type: { type: String, default: '2D' },
            seatLayout: {
                rows: { type: Number, required: true },
                columns: { type: Number, required: true }
            }
        }
    ],
    facilities: [{ type: String }],
    image: { type: String },
    contactNumber: { type: String },
    status: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Theater", TheaterSchema); 