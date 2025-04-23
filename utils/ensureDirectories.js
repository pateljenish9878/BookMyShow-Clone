/**
 * Utility to ensure all required upload directories exist
 */
const fs = require('fs');
const path = require('path');

// Define all required directories
const requiredDirectories = [
    'uploads',
    'uploads/movies',
    'uploads/theaters',
    'uploads/categories',
    'uploads/languages',
    'uploads/banners',
    'uploads/profiles',
    'uploads/temp',
    'public/uploads',
    'public/uploads/profiles'
];

// Create function to ensure directories exist
const ensureDirectoriesExist = () => {
    requiredDirectories.forEach(dir => {
        const fullPath = path.resolve(dir);
        
        if (!fs.existsSync(fullPath)) {
            try {
                fs.mkdirSync(fullPath, { recursive: true });
            } catch (err) {
                // Directory creation failed, do nothing
            }
        }
    });
};

// Execute the function
ensureDirectoriesExist();

// Export for use in other files
module.exports = { ensureDirectoriesExist }; 