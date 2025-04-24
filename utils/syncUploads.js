/**
 * Utility to synchronize files between uploads and public/uploads directories
 * to ensure files are accessible after server restarts
 */
const fs = require('fs');
const path = require('path');

// Define directory pairs to sync (source -> destination)
const directoryPairs = [
    { source: 'uploads/users', dest: 'public/uploads/users' },
    { source: 'uploads/movies', dest: 'public/uploads/movies' },
    { source: 'uploads/theaters', dest: 'public/uploads/theaters' },
    { source: 'uploads/profiles', dest: 'public/uploads/profiles' },
    { source: 'uploads/sliders', dest: 'public/uploads/sliders' },
    { source: 'uploads/banners', dest: 'public/uploads/banners' }
];

/**
 * Copy a file from source to destination
 */
const copyFile = (source, dest) => {
    try {
        if (fs.existsSync(source)) {
            fs.copyFileSync(source, dest);
            return true;
        }
        return false;
    } catch (err) {
        console.error(`Error copying file from ${source} to ${dest}:`, err);
        return false;
    }
};

/**
 * Synchronize files between source and destination directories
 */
const syncDirectory = (sourcePath, destPath) => {
    try {
        // Ensure both directories exist
        if (!fs.existsSync(sourcePath)) {
            fs.mkdirSync(sourcePath, { recursive: true });
        }
        if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
        }

        // Read source directory
        const files = fs.readdirSync(sourcePath);
        
        // Copy each file to destination if it doesn't exist there
        files.forEach(file => {
            const sourceFile = path.join(sourcePath, file);
            const destFile = path.join(destPath, file);
            
            // Skip directories
            if (fs.statSync(sourceFile).isDirectory()) return;
            
            // Copy file if it doesn't exist in destination
            if (!fs.existsSync(destFile)) {
                copyFile(sourceFile, destFile);
                console.log(`Copied ${file} from ${sourcePath} to ${destPath}`);
            }
        });

        console.log(`Synchronized ${files.length} files from ${sourcePath} to ${destPath}`);
    } catch (err) {
        console.error(`Error synchronizing ${sourcePath} to ${destPath}:`, err);
    }
};

/**
 * Synchronize all directory pairs
 */
const syncAllDirectories = () => {
    directoryPairs.forEach(pair => {
        const sourcePath = path.resolve(pair.source);
        const destPath = path.resolve(pair.dest);
        syncDirectory(sourcePath, destPath);
    });
    console.log('Completed synchronization of all upload directories');
};

// Run synchronization
syncAllDirectories();

module.exports = { syncAllDirectories, syncDirectory, copyFile }; 