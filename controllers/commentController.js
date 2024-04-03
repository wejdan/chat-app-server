const Comment = require("../models/Comment");
const Post = require("../models/Post"); // Assuming you need to validate posts exist
const HttpError = require("../models/HttpError"); // Custom error handling

exports.getCommentsForPost = async (req, res, next) => {
  const postId = req.params.postId;

  try {
    const comments = await Comment.find({ post: postId })
      .populate("author", "name profileImg") // Populating author name and profile image
      .sort({ createdAt: -1 }) // Sorting by createdAt timestamp, newest first
      .exec(); // Execute the qu
    res.json({ comments });
  } catch (error) {
    console.log(error);
    next(
      new HttpError("Fetching comments failed, please try again later.", 500)
    );
  }
};

exports.createComment = async (req, res, next) => {
  const { body } = req.body;
  const postId = req.params.postId;

  // Optional: Check if the post exists
  let existingPost;
  try {
    existingPost = await Post.findById(postId);
    if (!existingPost) {
      return next(new HttpError("Associated post not found.", 404));
    }
  } catch (error) {
    console.log(error);
    return next(
      new HttpError("Creating comment failed, please try again later.", 500)
    );
  }

  const newComment = new Comment({
    post: postId,
    author: req.user.id, // Assuming user ID is attached to req.user
    body,
  });

  try {
    await newComment.save();
    res.status(201).json({ comment: newComment });
  } catch (error) {
    next(
      new HttpError("Creating comment failed, please try again later.", 500)
    );
  }
};

exports.updateComment = async (req, res, next) => {
  const { body: updatedBody } = req.body; // Renamed to avoid confusion with `comment.body`
  const commentId = req.params.commentId;

  try {
    const comment = await Comment.findById(commentId).populate("author");
    if (!comment) {
      return next(new HttpError("Comment not found.", 404));
    }

    // Check if the requester is the author of the comment or an admin
    if (
      comment.author._id.toString() !== req.user.id.toString() &&
      req.user.role !== "admin"
    ) {
      return next(new HttpError("Not authorized to edit this comment.", 403));
    }

    comment.body = updatedBody;
    await comment.save();
    res.json({ comment });
  } catch (error) {
    console.log(error);
    next(
      new HttpError("Updating comment failed, please try again later.", 500)
    );
  }
};

exports.deleteComment = async (req, res, next) => {
  const commentId = req.params.commentId;

  try {
    const comment = await Comment.findById(commentId).populate("author");
    if (!comment) {
      return next(new HttpError("Comment not found.", 404));
    }

    // Check if the requester is the author of the comment or an admin
    if (
      comment.author._id.toString() !== req.user.id.toString() &&
      req.user.role !== "admin"
    ) {
      return next(new HttpError("Not authorized to delete this comment.", 403));
    }

    await Comment.findByIdAndDelete(commentId);
    res.status(200).json({ message: "Comment deleted." });
  } catch (error) {
    console.log(error);

    next(
      new HttpError("Deleting comment failed, please try again later.", 500)
    );
  }
};
exports.likeComment = async (req, res, next) => {
  const commentId = req.params.commentId;
  const userId = req.user.id; // Assuming user ID is attached to req.user

  try {
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return next(new HttpError("Comment not found.", 404));
    }

    // Prevent user from liking a comment multiple times
    if (comment.likes.includes(userId)) {
      return res
        .status(400)
        .json({ message: "You already liked this comment." });
    }

    // Add userId to likes array
    comment.likes.push(userId);
    await comment.save();

    res.status(200).json({ comment });
  } catch (error) {
    console.log(error);
    next(new HttpError("Liking comment failed, please try again later.", 500));
  }
};

exports.unlikeComment = async (req, res, next) => {
  const commentId = req.params.commentId;
  const userId = req.user.id; // Assuming user ID is attached to req.user

  try {
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return next(new HttpError("Comment not found.", 404));
    }

    // Remove userId from likes array
    comment.likes.pull(userId);
    await comment.save();

    res.status(200).json({ comment });
  } catch (error) {
    console.log(error);
    next(
      new HttpError("Unliking comment failed, please try again later.", 500)
    );
  }
};
