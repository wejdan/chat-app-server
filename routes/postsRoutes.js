const express = require("express");
const router = express.Router();
const postController = require("../controllers/postController");
const commentsRoutes = require("../routes/commentsRoutes");

const { restrictTo, checkAuth } = require("../middleware/check-auth");
const { body } = require("express-validator");
const {
  validateRequest,
  validateObjectId,
} = require("../middleware/check-input");

// Updated validation rules to match the Post schema
const postValidationRules = [
  body("title")
    .trim()
    .isLength({ min: 4 })
    .withMessage("Title must be at lest 4 charchters"),
  body("body")
    .trim()
    .isLength({ min: 4 })
    .withMessage("Body must be at lest 4 charchters"),
  body("category")
    .trim()
    .isLength({ min: 3 })
    .withMessage("category must be at lest 3 charchters"),
  body("coverImage")
    .trim()
    .isLength({ min: 1 })
    .withMessage("Cover image must not be empty")
    .isURL()
    .withMessage("Cover image must be a valid URL"),
  // Add more validators as needed for your schema
];

// Route for recently added products
router.get("/recently-added", postController.getRecentlyAddedPosts);

// Route to get all products
router.get("/", postController.getPosts);
router.get("/categories", postController.getCategories);

// Added route to get posts by category
router.get("/category/:categoryName", postController.getPostsByCategory);

// Updated to allow only 1 image for a new product
router.post(
  "/",
  checkAuth,
  restrictTo("admin"),
  postValidationRules,
  validateRequest,
  postController.createPost
);

router.get("/post", postController.getPost);

// Route to update an existing product
router.patch(
  "/:postId",
  checkAuth,
  restrictTo("admin"),
  validateObjectId("postId"),
  postValidationRules,
  validateRequest,
  postController.updatePost
);

// Route to delete a product
router.delete(
  "/:postId",
  checkAuth,
  restrictTo("admin"),
  validateObjectId("postId"),
  postController.deletePost
);
router.use("/:postId/comments", validateObjectId("postId"), commentsRoutes);

module.exports = router;
