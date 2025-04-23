const mongoose = require("mongoose");

const SettingSchema = new mongoose.Schema({
    sliderBanners: {
        homePage: [{ type: String }],
        allMoviesPage: [{ type: String }]
    },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Setting", SettingSchema); 