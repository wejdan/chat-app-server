const Comment = require("../models/Comment");

// Controller function to get all comments across all posts
exports.getAllComments = async (req, res) => {
  try {
    const comments = await Comment.find()
      .populate("post", "title") // Assuming you want to show the post title
      .populate("author", "name") // Assuming you want to show the author name
      .sort({ createdAt: -1 }); // Sort by newest comments first

    res.status(200).json({
      status: "success",
      results: comments.length,
      comments,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve comments",
      error: err,
    });
  }
};
