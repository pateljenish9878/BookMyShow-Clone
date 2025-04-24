const mongoose = require('mongoose');
const Show = require('../models/Show');
const Movie = require('../models/Movie');


exports.findShowByExactDate = async (movieId, theaterId, dateString, time) => {
    try {
        
        if (!movieId || !theaterId || !dateString || !time) {
            console.error('Missing required parameters in findShowByExactDate');
            return null;
        }
        
        const shows = await Show.find({
            movieId: movieId,
            theaterId: theaterId
        }).populate('screenId');
        
        
        if (!shows || shows.length === 0) {
            return null;
        }
        
        for (const show of shows) {
            let showDateString;
            
            if (typeof show.showDate === 'string') {
                showDateString = show.showDate.split('T')[0];
            } else if (show.showDate instanceof Date) {
                const year = show.showDate.getFullYear();
                const month = String(show.showDate.getMonth() + 1).padStart(2, '0');
                const day = String(show.showDate.getDate()).padStart(2, '0');
                showDateString = `${year}-${month}-${day}`;
            } else {
                console.warn(`Show ${show._id} has invalid date format:`, show.showDate);
                continue;
            }
            
            if (showDateString === dateString && show.showTime === time) {
                
                show.screenName = show.screenId ? (show.screenId.name || 'Screen 1') : 'Screen 1';
                
                if (!show.standardPrice) {
                    const basePrice = show.price || 200;
                    show.standardPrice = basePrice;
                    show.premiumPrice = basePrice + 100; 
                }
                
                return show;
            }
        }

        return null;
    } catch (error) {
        console.error('Error in findShowByExactDate:', error);
        
        const standardPrice = 200;
        const premiumPrice = standardPrice + 100; 
        
        
        return {
            _id: new mongoose.Types.ObjectId(),
            movieId: movieId,
            theaterId: theaterId,
            showDate: new Date(dateString),
            showTime: time,
            standardPrice: standardPrice,
            premiumPrice: premiumPrice,
            price: standardPrice, 
            screenId: { _id: new mongoose.Types.ObjectId(), name: 'Screen 1' },
            screenName: 'Screen 1',
            isFallbackShow: true, 
            bookedSeats: [] 
        };
    }
};


exports.debugDateString = (dateStr) => {
    
    try {
        const date = new Date(dateStr);
        
        const isoString = date.toISOString();
        
        const dateOnly = isoString.split('T')[0];    
        const [year, month, day] = dateStr.split('-').map(Number);
        
        const prevDay = new Date(year, month - 1, day - 1);
        const prevYearUTC = prevDay.getUTCFullYear();
        const prevMonthUTC = String(prevDay.getUTCMonth() + 1).padStart(2, '0');
        const prevDayUTC = String(prevDay.getUTCDate()).padStart(2, '0');
        const prevDateStr = `${prevYearUTC}-${prevMonthUTC}-${prevDayUTC}`;
        
        const nextDay = new Date(year, month - 1, day + 1);
        const nextYearUTC = nextDay.getUTCFullYear();
        const nextMonthUTC = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
        const nextDayUTC = String(nextDay.getUTCDate()).padStart(2, '0');
        const nextDateStr = `${nextYearUTC}-${nextMonthUTC}-${nextDayUTC}`;
 
    } catch (error) {
        console.error('Error parsing date:', error);
    }
};
