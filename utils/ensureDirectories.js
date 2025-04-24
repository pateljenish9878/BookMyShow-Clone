
const fs = require('fs');
const path = require('path');

const requiredDirectories = [
    'uploads',
    'uploads/movies',
    'uploads/theaters',
    'uploads/categories',
    'uploads/languages',
    'uploads/banners',
    'uploads/profiles',
    'uploads/users',
    'uploads/sliders',
    'uploads/temp',
    'public/uploads',
    'public/uploads/profiles',
    'public/uploads/movies',
    'public/uploads/theaters',
    'public/uploads/users',
    'public/uploads/sliders',
    'public/uploads/banners'
];

const ensureDirectoriesExist = () => {
    requiredDirectories.forEach(dir => {
        const fullPath = path.resolve(dir);
        
        if (!fs.existsSync(fullPath)) {
            try {
                fs.mkdirSync(fullPath, { recursive: true });
            } catch (err) {
                
            }
        }
    });
};

ensureDirectoriesExist();

module.exports = { ensureDirectoriesExist }; 