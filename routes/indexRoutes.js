const express = require("express");
const router = express.Router();
const homeController = require("../controllers/indexController");

router.get("/", homeController.getHomepage);
router.get("/all-movies", homeController.getAllMovies);
router.get("/movie/:id", homeController.getMovieDetails);
router.get("/coming-soon", homeController.comingSoon);

module.exports = router;