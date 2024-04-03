const express = require("express");
const router = express.Router();
const { checkAuth, restrictTo } = require("../middleware/check-auth");
const { getAllComments } = require("../controllers/allCommentsControllers");

// Route to get all comments across all posts
router.get("/", checkAuth, restrictTo("admin"), getAllComments);

module.exports = router;
