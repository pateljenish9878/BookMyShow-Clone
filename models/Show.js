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

ShowSchema.virtual('dateString').get(function() {
    if (this.showDate) {
        const year = this.showDate.getUTCFullYear();
        const month = String(this.showDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(this.showDate.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return null;
});

ShowSchema.methods.getFormattedTime = function() {
    if (this.showTime.includes('AM') || this.showTime.includes('PM')) {
        return this.showTime;
    }
    
    try {
        const [hours, minutes] = this.showTime.split(':');
        const hour = parseInt(hours, 10);
        const isPM = hour >= 12;
        const displayHour = hour % 12 || 12; 
        return `${displayHour}:${minutes} ${isPM ? 'PM' : 'AM'}`;
    } catch (error) {
        return this.showTime; 
    }
};

ShowSchema.pre('save', function(next) {
    if (this.showTime && !this.showTime.includes(':')) {
        const timeStr = this.showTime.toString();
        if (timeStr.length === 4) { 
            this.showTime = `${timeStr.substring(0, 2)}:${timeStr.substring(2)}`;
        }
    }
    next();
});

module.exports = mongoose.model("Show", ShowSchema); 