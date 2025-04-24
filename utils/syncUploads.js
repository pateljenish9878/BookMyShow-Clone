const fs = require('fs');
const path = require('path');

const directoryPairs = [
    { source: 'uploads/users', dest: 'public/uploads/users' },
    { source: 'uploads/movies', dest: 'public/uploads/movies' },
    { source: 'uploads/theaters', dest: 'public/uploads/theaters' },
    { source: 'uploads/profiles', dest: 'public/uploads/profiles' },
    { source: 'uploads/sliders', dest: 'public/uploads/sliders' },
    { source: 'uploads/banners', dest: 'public/uploads/banners' }
];

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

const syncDirectory = (sourcePath, destPath) => {
    try {
        if (!fs.existsSync(sourcePath)) {
            fs.mkdirSync(sourcePath, { recursive: true });
        }
        if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
        }

        const files = fs.readdirSync(sourcePath);
        
        files.forEach(file => {
            const sourceFile = path.join(sourcePath, file);
            const destFile = path.join(destPath, file);
            
            if (fs.statSync(sourceFile).isDirectory()) return;
            
            if (!fs.existsSync(destFile)) {
                copyFile(sourceFile, destFile);
                
            }
        });

        
    } catch (err) {
        console.error(`Error synchronizing ${sourcePath} to ${destPath}:`, err);
    }
};

const syncAllDirectories = () => {
    directoryPairs.forEach(pair => {
        const sourcePath = path.resolve(pair.source);
        const destPath = path.resolve(pair.dest);
        syncDirectory(sourcePath, destPath);
    });
    
};

syncAllDirectories();

module.exports = { syncAllDirectories, syncDirectory, copyFile }; 