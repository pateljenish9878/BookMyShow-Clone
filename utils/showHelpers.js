const mongoose = require('mongoose');
const Show = require('../models/Show');
const Movie = require('../models/Movie');

/**
 * Find a show using exact date string match to avoid timezone issues
 * @param {string} movieId - Movie ID
 * @param {string} theaterId - Theater ID
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @param {string} time - Show time string
 * @returns {Promise<Object>} - Show object if found, null otherwise
 */
exports.findShowByExactDate = async (movieId, theaterId, dateString, time) => {
    try {
        console.log(`Finding show for movie ${movieId}, theater ${theaterId}, date ${dateString}, time ${time}`);
        
        // Ensure we have all required parameters
        if (!movieId || !theaterId || !dateString || !time) {
            console.error('Missing required parameters in findShowByExactDate');
            return null;
        }
        
        // Find all shows for this movie and theater
        const shows = await Show.find({
            movieId: movieId,
            theaterId: theaterId
        }).populate('screenId');
        
        console.log(`Found ${shows ? shows.length : 0} shows for movie and theater`);
        
        if (!shows || shows.length === 0) {
            return null;
        }
        
        // Loop through shows and find one that matches the date and time
        for (const show of shows) {
            // Get date string in YYYY-MM-DD format from show.showDate
            let showDateString;
            
            if (typeof show.showDate === 'string') {
                // If it's already a string, try to extract just the date part
                showDateString = show.showDate.split('T')[0];
            } else if (show.showDate instanceof Date) {
                // Format date to YYYY-MM-DD manually to avoid timezone issues
                const year = show.showDate.getFullYear();
                const month = String(show.showDate.getMonth() + 1).padStart(2, '0');
                const day = String(show.showDate.getDate()).padStart(2, '0');
                showDateString = `${year}-${month}-${day}`;
            } else {
                // If showDate is neither string nor Date, log and skip
                console.warn(`Show ${show._id} has invalid date format:`, show.showDate);
                continue;
            }
            
            console.log(`Comparing show date ${showDateString} with requested date ${dateString}`);
            console.log(`Comparing show time ${show.showTime} with requested time ${time}`);
            
            // Check if date and time match
            if (showDateString === dateString && show.showTime === time) {
                console.log(`Found matching show: ${show._id}`);
                
                // Add screen name
                show.screenName = show.screenId ? (show.screenId.name || 'Screen 1') : 'Screen 1';
                
                // Add specific standardPrice and premiumPrice if not already present
                if (!show.standardPrice) {
                    // Use the price field from the database
                    const basePrice = show.price || 200;
                    show.standardPrice = basePrice;
                    show.premiumPrice = basePrice + 100; // Premium seats are 100 more than standard
                }
                
                console.log(`Returning show with prices: Standard=${show.standardPrice}, Premium=${show.premiumPrice}`);
                return show;
            }
        }
        
        // If we reach here, no matching show was found
        console.log('No matching show found, returning null');
        return null;
    } catch (error) {
        console.error('Error in findShowByExactDate:', error);
        
        // Create a dummy show object as a fallback
        const standardPrice = 200;
        const premiumPrice = standardPrice + 100; // Use same formula: premium is standard + 100
        
        console.log(`Creating fallback show with prices: Standard=${standardPrice}, Premium=${premiumPrice}`);
        
        return {
            _id: new mongoose.Types.ObjectId(),
            movieId: movieId,
            theaterId: theaterId,
            showDate: new Date(dateString),
            showTime: time,
            standardPrice: standardPrice,
            premiumPrice: premiumPrice,
            price: standardPrice, // Use the standardPrice value
            screenId: { _id: new mongoose.Types.ObjectId(), name: 'Screen 1' },
            screenName: 'Screen 1',
            isFallbackShow: true, // Flag to indicate this is a fallback
            bookedSeats: [] // Ensure bookedSeats is defined
        };
    }
};

/**
 * Debug function to check if a date string is correctly formatted for comparison
 * @param {string} dateStr - Date string to check (usually in YYYY-MM-DD format)
 */
exports.debugDateString = (dateStr) => {
    console.log('==== Date String Debug ====');
    console.log('Original string:', dateStr);
    
    // Try to parse as a date
    try {
        const date = new Date(dateStr);
        console.log('Parsed as date object:', date);
        
        // Format back as ISO string
        const isoString = date.toISOString();
        console.log('ISO string:', isoString);
        
        // Extract just the date part
        const dateOnly = isoString.split('T')[0];
        console.log('Date part:', dateOnly);
        
        // Compare original with extracted
        console.log('Original equals extracted:', dateStr === dateOnly);
        
        // Try direct string comparison with day increment/decrement
        const [year, month, day] = dateStr.split('-').map(Number);
        
        // Previous day
        const prevDay = new Date(year, month - 1, day - 1);
        const prevYearUTC = prevDay.getUTCFullYear();
        const prevMonthUTC = String(prevDay.getUTCMonth() + 1).padStart(2, '0');
        const prevDayUTC = String(prevDay.getUTCDate()).padStart(2, '0');
        const prevDateStr = `${prevYearUTC}-${prevMonthUTC}-${prevDayUTC}`;
        
        // Next day
        const nextDay = new Date(year, month - 1, day + 1);
        const nextYearUTC = nextDay.getUTCFullYear();
        const nextMonthUTC = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
        const nextDayUTC = String(nextDay.getUTCDate()).padStart(2, '0');
        const nextDateStr = `${nextYearUTC}-${nextMonthUTC}-${nextDayUTC}`;
        
        console.log('Previous day:', prevDateStr);
        console.log('Original day:', dateStr);
        console.log('Next day:', nextDateStr);
    } catch (error) {
        console.error('Error parsing date:', error);
    }
    
    console.log('==========================');
};
