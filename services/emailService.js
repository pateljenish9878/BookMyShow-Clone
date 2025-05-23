const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendOTP = async (email, otp) => {
  try {
    return {
      success: true,
      message: 'OTP email would be sent in production'
    };
  } catch (error) {
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
};

const sendPasswordResetOTP = async (email, otp) => {
  try {
    return await sendOTP(email, otp);
  } catch (error) {
    throw new Error(`Failed to send password reset OTP: ${error.message}`);
  }
};

const sendBookingConfirmation = async (booking) => {
    try {
        if (!booking) {
            return false;
        }

        const userEmail = booking.userId?.email || booking.customerEmail;
        const userName = booking.userId?.name || booking.customerName || 'Customer';
        
        if (!userEmail) {
            return false;
        }

        const movieTitle = booking.movieId?.title || booking.movieTitle || 'Your movie';
        
        let formattedDate;
        try {
            const date = new Date(booking.showDate);
            formattedDate = date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (e) {
            formattedDate = booking.showDate;
        }

        const subject = `Booking Confirmation - ${movieTitle}`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd;">
                <h2 style="color: #e50914; text-align: center;">Movie Booking Confirmation</h2>
                <p>Hello ${userName},</p>
                <p>Thank you for booking with us. Your movie booking has been confirmed!</p>
                
                <div style="background-color: #f8f8f8; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Booking Details</h3>
                    <p><strong>Movie:</strong> ${movieTitle}</p>
                    <p><strong>Booking Reference:</strong> ${booking.bookingReference || booking._id}</p>
                    <p><strong>Date:</strong> ${formattedDate}</p>
                    <p><strong>Time:</strong> ${booking.showTime}</p>
                    <p><strong>Theater:</strong> ${booking.theaterId?.name || booking.theaterName || 'Theater'}</p>
                    <p><strong>Screen:</strong> ${booking.screenId?.name || booking.screenName || 'Screen 1'}</p>
                    <p><strong>Seats:</strong> ${booking.seats.join(', ')}</p>
                    <p><strong>Total Amount:</strong> ₹${booking.totalAmount}</p>
                </div>
                
                <p style="margin-bottom: 5px;">Please arrive at least 15 minutes before the show time.</p>
                <p style="margin-top: 0;">Show this email and your booking reference at the counter to collect your tickets.</p>
                
                <div style="text-align: center; margin-top: 30px; color: #777; font-size: 12px;">
                    <p>If you have any questions, please contact our customer support.</p>
                    <p>Thank you for choosing our cinema!</p>
                </div>
            </div>
        `;

        const mailOptions = {
            from: process.env.EMAIL_FROM || 'no-reply@moviebooking.com',
            to: userEmail,
            subject: subject,
            html: html
        };

        return true;
    } catch (error) {
        return false;
    }
};

module.exports = {
  generateOTP,
  sendPasswordResetOTP,
  sendBookingConfirmation
}; 