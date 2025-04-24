const mongoose = require('mongoose');
const Theater = require('../models/Theater');
const Show = require('../models/Show');

// Connect to MongoDB
const cleanupShows = async () => {
  try {
    
    // Find all shows
    const shows = await Show.find();
    
    let fixedShows = 0;
    let deletedShows = 0;
    let validShows = 0;
    
    // Process each show
    for (const show of shows) {
      // Find the theater for this show
      const theater = await Theater.findById(show.theaterId);
      
      if (!theater) {
        await Show.findByIdAndDelete(show._id);
        deletedShows++;
        continue;
      }
      
      // Check if the screen exists in this theater
      const screenExists = theater.screens.some(screen => 
        screen._id.toString() === show.screenId.toString()
      );
      
      if (!screenExists) {
        // Screen doesn't exist in the theater
        if (theater.screens.length > 0) {
          // Use the first available screen
          const validScreenId = theater.screens[0]._id;
          
          show.screenId = validScreenId;
          await show.save();
          fixedShows++;
        } else {
          // No valid screens available, delete the show
          await Show.findByIdAndDelete(show._id);
          deletedShows++;
        }
      } else {
        validShows++;
      }
    }
    
    
    return {
      valid: validShows,
      fixed: fixedShows,
      deleted: deletedShows
    };
    
  } catch (error) {
    console.error('Error in cleanup process:', error);
    throw error;
  }
};

// Export the function for use in other scripts
module.exports = cleanupShows;

// Allow this script to be run directly
if (require.main === module) {
  mongoose.connect('mongodb://localhost:27017/bookmyshow', { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
  })
  .then(async () => {
    try {
      await cleanupShows();
    } catch (error) {
      console.error('Cleanup failed:', error);
    } finally {
      mongoose.disconnect();
    }
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });
} 