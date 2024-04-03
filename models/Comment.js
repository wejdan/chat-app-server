const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const commentSchema = new Schema(
  {
    post: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
); // This adds `createdAt` and `updatedAt` fields automatically
commentSchema.virtual("likeCount").get(function () {
  return this.likes.length;
});

const Comment = mongoose.model("Comment", commentSchema);

module.exports = Comment;
