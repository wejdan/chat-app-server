const express = require("express");
const { body } = require("express-validator");

const { checkAuth } = require("../middleware/check-auth");
const { validateRequest } = require("../middleware/check-input");
const {
  generateSignedUrl,
  listImagesController,
  deleteImageController,
  indexFiles,
  deleteImagesController,
} = require("../controllers/storageController");

const router = express.Router();

router.get(
  "/generate-signed-url",
  checkAuth,

  generateSignedUrl
);
router.get("/images", checkAuth, listImagesController);
router.post("/indexFile", checkAuth, indexFiles);

// Route to delete an image
router.post("/delete-images", checkAuth, deleteImagesController);
// Export the router
module.exports = router;
