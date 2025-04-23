const mongoose = require("mongoose");

const MovieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    image: { type: String, required: true },
    backgroundImage: { type: String, required: true },
    category: { type: String, required: true },
    duration: { type: String, required: true },
    ratings: { type: Number, required: true },
    releaseDate: { type: Date, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ["Upcoming", "In Cinema"], required: true },
    language: { type: String, required: true },
    recommended: { type: Boolean, default: false }
});

module.exports = mongoose.model("Movie", MovieSchema);
