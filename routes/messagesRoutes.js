const express = require("express");
const router = express.Router();
const { checkAuth, restrictTo } = require("../middleware/check-auth");
const { getMessages } = require("../controllers/messagesControllers");

// Route to get all comments across all posts
router.get("/", checkAuth, getMessages);

module.exports = router;
