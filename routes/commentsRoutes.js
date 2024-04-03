const express = require("express");
const router = express.Router({ mergeParams: true }); // Make sure mergeParams is true

const commentsController = require("../controllers/commentController");
const { checkAuth, restrictTo } = require("../middleware/check-auth");
const { body } = require("express-validator");
const {
  validateRequest,
  validateObjectId,
} = require("../middleware/check-input");

// Validation rules for a comment
const commentValidationRules = [
  body("body")
    .trim()
    .isLength({ min: 3 })
    .withMessage("Comment body must not be empty"),
  // Add more validators as needed for your schema
];

// Route to get comments for a post
router.get("/", commentsController.getCommentsForPost);

// Route to add a new comment to a post
router.post(
  "/",
  checkAuth,
  commentValidationRules,
  validateRequest,
  commentsController.createComment
);

// Route to update an existing comment
router.patch(
  "/:commentId",
  checkAuth,
  validateObjectId("commentId"),

  commentValidationRules,
  validateRequest,
  commentsController.updateComment
);

// Route to delete a comment
router.delete(
  "/:commentId",
  checkAuth,
  validateObjectId("commentId"),
  commentsController.deleteComment
);
router.patch("/:commentId/like", checkAuth, commentsController.likeComment);
router.patch("/:commentId/unlike", checkAuth, commentsController.unlikeComment);

module.exports = router;
