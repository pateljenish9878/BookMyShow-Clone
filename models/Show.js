const mongoose = require("mongoose");

const ShowSchema = new mongoose.Schema({
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true },
    theaterId: { type: mongoose.Schema.Types.ObjectId, ref: "Theater", required: true },
    screenId: { type: mongoose.Schema.Types.ObjectId, required: true },
    showDate: { type: Date, required: true },
    showTime: { type: String, required: true },
    price: { type: Number, required: true },
    bookedSeats: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
}, { collection: 'shows', toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtual for date string in YYYY-MM-DD format
ShowSchema.virtual('dateString').get(function() {
    if (this.showDate) {
        // Format date to YYYY-MM-DD in UTC to avoid timezone issues
        const year = this.showDate.getUTCFullYear();
        const month = String(this.showDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(this.showDate.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return null;
});

// Method to get formatted time for display
ShowSchema.methods.getFormattedTime = function() {
    // If showTime already has AM/PM format, return as is
    if (this.showTime.includes('AM') || this.showTime.includes('PM')) {
        return this.showTime;
    }
    
    // Convert 24-hour format to 12-hour format with AM/PM
    try {
        const [hours, minutes] = this.showTime.split(':');
        const hour = parseInt(hours, 10);
        const isPM = hour >= 12;
        const displayHour = hour % 12 || 12; // Convert 0 to 12
        return `${displayHour}:${minutes} ${isPM ? 'PM' : 'AM'}`;
    } catch (error) {
        return this.showTime; // Return original if formatting fails
    }
};

// Format showTime before saving to ensure consistency
ShowSchema.pre('save', function(next) {
    // Ensure showTime is in proper format HH:MM (24-hour)
    if (this.showTime && !this.showTime.includes(':')) {
        const timeStr = this.showTime.toString();
        if (timeStr.length === 4) { // e.g. "1030" -> "10:30"
            this.showTime = `${timeStr.substring(0, 2)}:${timeStr.substring(2)}`;
        }
    }
    next();
});

module.exports = mongoose.model("Show", ShowSchema); 