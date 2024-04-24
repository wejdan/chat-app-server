const express = require("express");
const { body } = require("express-validator");

const { checkAuth, restrictTo } = require("../middleware/check-auth");
const { validateRequest } = require("../middleware/check-input");
const multer = require("multer");
const {
  updateUser,
  deleteUser,
  updateProfile,
  getAllUsers,
  searchUsers,
} = require("../controllers/userControllers");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB upload limit
  },
});
// Place the specific route before the general one
router.get("/", checkAuth, restrictTo("admin"), getAllUsers);
router.get("/search", searchUsers);

router.delete("/:userId", checkAuth, restrictTo("admin"), deleteUser);

router.patch("/:userId", checkAuth, updateUser);
router.post(
  "/profile-picture",
  checkAuth,

  updateProfile
);

// Export the router
module.exports = router;
