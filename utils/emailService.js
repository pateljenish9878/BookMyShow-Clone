const nodemailer = require('nodemailer');

exports.generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

exports.sendPasswordResetOTP = async (email, otp) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset OTP',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
                    <p style="color: #555; font-size: 16px;">We received a request to reset your password. Please use the following OTP to complete the process:</p>
                    <div style="background-color: #f9f9f9; padding: 15px; text-align: center; border-radius: 4px; margin: 20px 0;">
                        <h1 style="color: #007bff; margin: 0; letter-spacing: 5px;">${otp}</h1>
                    </div>
                    <p style="color: #555; font-size: 14px;">This OTP is valid for 15 minutes. If you didn't request a password reset, please ignore this email.</p>
                    <p style="color: #777; font-size: 14px; text-align: center; margin-top: 30px;">© ${new Date().getFullYear()} Movie Booking System</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send email');
    }
};

exports.sendBookingConfirmation = async (bookingData) => {
    try {
        const {
            email,
            name,
            bookingId,
            movieTitle,
            theaterName,
            screenName,
            showDate,
            showTime,
            seats,
            totalAmount
        } = bookingData;

        const formattedDate = new Date(showDate + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const seatsList = seats.join(', ');
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: `Booking Confirmation - ${movieTitle}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
                        <h2 style="color: #f84464; margin: 0;">BookMyShow</h2>
                        <p style="color: #555; margin-top: 5px;">Your booking has been confirmed!</p>
                    </div>
                    
                    <div style="padding: 20px 0;">
                        <h3 style="color: #333; margin: 0 0 15px 0;">${movieTitle}</h3>
                        
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #777;">Booking ID</td>
                                <td style="padding: 8px 0; color: #333; font-weight: bold;">${bookingId}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #777;">Theater</td>
                                <td style="padding: 8px 0; color: #333;">${theaterName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #777;">Screen</td>
                                <td style="padding: 8px 0; color: #333;">${screenName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #777;">Date</td>
                                <td style="padding: 8px 0; color: #333;">${formattedDate}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #777;">Time</td>
                                <td style="padding: 8px 0; color: #333;">${showTime}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #777;">Seats</td>
                                <td style="padding: 8px 0; color: #333;">${seatsList}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #777;">Amount</td>
                                <td style="padding: 8px 0; color: #333;">₹${totalAmount}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin-top: 20px;">
                        <p style="margin: 0; color: #555; font-size: 14px;">Please arrive at least 15 minutes before the show time. Present this email or your booking ID at the counter to collect your tickets.</p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                        <p style="color: #777; font-size: 14px; margin: 0;">Thank you for booking with us, ${name}!</p>
                        <p style="color: #777; font-size: 12px; margin-top: 15px;">© ${new Date().getFullYear()} Movie Booking System. All rights reserved.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending booking confirmation email:', error);
        return false;
    }
};

module.exports = exports; 