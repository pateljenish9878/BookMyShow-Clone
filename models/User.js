const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    profilePic: { type: String, default: "default-profile.png" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    active: { type: Boolean, default: true },
    resetPasswordOTP: { type: String },
    resetPasswordOTPExpiry: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema); 