const express = require("express");
const router = express.Router();
const multer = require("multer");
const movieController = require("../controllers/movieController");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});
const upload = multer({ storage });

router.get("/", movieController.getAllMovies);
router.post("/add", upload.fields([{ name: "image" }, { name: "backgroundImage" }]), movieController.addMovie);
router.get("/edit/:id", movieController.getMovieForEdit);
router.post("/update/:id", upload.fields([{ name: "image" }, { name: "backgroundImage" }]), movieController.updateMovie);
router.get("/delete/:id", movieController.deleteMovie);

module.exports = router;
