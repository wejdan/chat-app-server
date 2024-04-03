const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const slugify = require("slugify");

const postSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    coverImage: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: String,
      required: [true, "A post must belong to a category"],
    }, // Simple array of strings. For a more complex setup, use references to a Category model.
    publishedDate: Date,
    updatedAt: Date,
    comments: [
      {
        type: Schema.Types.ObjectId,
        ref: "Comment",
      },
    ],
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
); // This adds `createdAt` and `updatedAt` fields automatically
// Middleware to generate slug before saving
postSchema.pre("save", function (next) {
  if (this.title && this.isModified("title")) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  next();
});
const Post = mongoose.model("Post", postSchema);

module.exports = Post;
