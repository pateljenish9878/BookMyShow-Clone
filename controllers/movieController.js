const Movie = require("../models/Movie");
const fs = require("fs");
const path = require("path");

exports.getAllMovies = async (req, res) => {
    try {
        const movies = await Movie.find();
        res.render("backend/admin-movies", { movies, movie: null });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching movies");
    }
};

exports.addMovie = async (req, res) => {
    try {
        const { title, category, duration, ratings, releaseDate, description, status, language } = req.body;

        const image = req.files["image"] ? req.files["image"][0].filename : "";
        const backgroundImage = req.files["backgroundImage"] ? req.files["backgroundImage"][0].filename : "";

        const recommended = req.body.recommended ? true : false; 

        const newMovie = new Movie({
            title,
            image,
            backgroundImage,
            category,
            duration,
            ratings,
            releaseDate,
            description,
            status,
            language,
            recommended
        });

        await newMovie.save();
        res.redirect("/admin-movies");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error adding movie");
    }
};


exports.getMovieForEdit = async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        const movies = await Movie.find();
        res.render("backend/admin-movies", { movies, movie });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching movie for edit");
    }
};

exports.updateMovie = async (req, res) => {
    try {
        const { title, category, duration, ratings, releaseDate, description, status, language } = req.body;

        const recommended = req.body.recommended ? true : false; // ✅ Fix

        const updateData = {
            title,
            category,
            duration,
            ratings,
            releaseDate,
            description,
            status,
            language,
            recommended
        };

        if (req.files["image"]) {
            updateData.image = req.files["image"][0].filename;
        }
        if (req.files["backgroundImage"]) {
            updateData.backgroundImage = req.files["backgroundImage"][0].filename;
        }

        await Movie.findByIdAndUpdate(req.params.id, updateData);
        res.redirect("/admin-movies");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error updating movie");
    }
};


exports.deleteMovie = async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) {
            return res.status(404).send("Movie not found");
        }

        // Delete images from uploads folder
        const deleteFile = (filePath) => {
            if (filePath) {
                const fullPath = path.join(__dirname, "../uploads", filePath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }
        };

        deleteFile(movie.image);
        deleteFile(movie.backgroundImage);

        await Movie.findByIdAndDelete(req.params.id);
        res.redirect("/admin-movies");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error deleting movie");
    }
};
