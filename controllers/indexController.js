const Movie = require("../models/Movie");
const Setting = require("../models/Setting");

exports.getHomepage = async (req, res) => {
    try {
        const searchQuery = req.query.search || "";
        const query = { recommended: true }; 

        if (searchQuery) {
            query.title = new RegExp(searchQuery, "i"); 
        }

        const movies = await Movie.find(query);
        
        const settings = await Setting.findOne();
        const sliderBanners = settings && settings.sliderBanners && settings.sliderBanners.homePage 
            ? settings.sliderBanners.homePage.map(banner => `/uploads/sliders/${banner}`)
            : ['/images/swiper-1.jpg', '/images/swiper-2.jpg', '/images/swiper-3.jpg', '/images/swiper-4.jpg'];
        
        res.render("frontend/index", { 
            movies, 
            searchQuery,
            sliderBanners 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching movies");
    }
};


exports.getAllMovies = async (req, res) => {
    try {
        const searchQuery = req.query.search || "";
        const language = req.query.language || "";
        const category = req.query.category || "";
        
        const page = parseInt(req.query.page) || 1;
        const limit = 12; 
        const skip = (page - 1) * limit;
        
        const query = {};
        
        if (searchQuery) {
            query.title = new RegExp(searchQuery, "i");
        }
        
        if (language) {
            query.language = language;
        }
        
        if (category) {
           query.category = { $regex: category, $options: "i" };
        }

        const totalMovies = await Movie.countDocuments(query);
        const totalPages = Math.ceil(totalMovies / limit);

        const movies = await Movie.find(query)
            .skip(skip)
            .limit(limit);
        
        const settings = await Setting.findOne();
        const sliderBanners = settings && settings.sliderBanners && settings.sliderBanners.allMoviesPage 
            ? settings.sliderBanners.allMoviesPage.map(banner => `/uploads/sliders/${banner}`)
            : ['/images/swiper-1.jpg', '/images/swiper-2.jpg', '/images/swiper-3.jpg', '/images/swiper-4.jpg'];
        
        res.render("frontend/allMovies", { 
            movies, 
            searchQuery,
            selectedLanguage: language,
            selectedCategory: category,
            category: category, 
            sliderBanners,
            pagination: {
                page,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page + 1,
                prevPage: page - 1,
                totalMovies
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching movies");
    }
};

exports.getMovieDetails = async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).send("Movie not found");

        const releaseDate = new Date(movie.releaseDate).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });

        res.render("frontend/singleMovie", { movie, releaseDate });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching movie details");
    }
};

exports.comingSoon = (req, res) => {
    try {
        return res.render("coming-soon", { searchQuery: '' });
    } catch (error) {
        console.error("Error rendering comingSoon page:", error);
        return res.status(500).render("error", { 
            message: "Error rendering page", 
            searchQuery: '' 
        });
    }
};