const HttpError = require("../models/HttpError");
const slugify = require("slugify");
const mongoose = require("mongoose");
const Post = require("../models/Post"); // Assuming you have a Post model set up
const {
  deleteImages,
  moveImageToPermanentStorage,
  markImageForRemoval,
} = require("../utils/imgs");
const cheerio = require("cheerio"); // DOM parsing library, similar to jQuery
const ImageForRemoval = require("../models/ImageForRemoval");
// Controller to get recently added posts
exports.getRecentlyAddedPosts = async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).limit(6); // Get the latest 5 posts
    res.status(200).json(posts);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching recently added posts", error: error });
  }
};

// Controller to get all posts
exports.getPosts = async (req, res, next) => {
  const searchQuery = req.query.query;
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 10; // Set a standard page size or make it configurable through an environment variable or query parameter
  const category = req.query.category;
  const queryCondition = {};
  if (searchQuery) {
    // If a search term is provided, filter posts by title or content using case-insensitive search
    queryCondition.$or = [
      { title: { $regex: searchQuery, $options: "i" } },
      { content: { $regex: searchQuery, $options: "i" } },
    ];
  }
  // Filter by category if provided and not 'All'
  if (category && category !== "All") {
    queryCondition.category = category;
  }
  try {
    const skipAmount = (page - 1) * pageSize;

    // Fetch the page of posts based on queryCondition, skipAmount, and pageSize
    const posts = await Post.find(queryCondition)
      .sort({ createdAt: -1 }) // Sort by most recent first
      .skip(skipAmount)
      .limit(pageSize);

    // Calculate total posts to determine the number of pages
    const totalPosts = await Post.countDocuments(queryCondition);
    const totalPages = Math.ceil(totalPosts / pageSize);

    // Respond with posts data and pagination details
    res.status(200).json({
      posts: posts.map((post) => post.toObject({ getters: true })), // Convert each post document to an object
      totalPages, // Total number of pages based on the totalPosts and pageSize
      currentPage: page, // Current page number
      totalPosts, // Total number of posts matching the search query
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching posts", error: error });
    next(error);
  }
};
exports.getCategories = async (req, res, next) => {
  try {
    const categories = await Post.distinct("category"); // This will fetch all unique categories
    res.json(categories); // Send the categories as a JSON response
  } catch (error) {
    next(error);
  }
};
// Controller to get posts by category
exports.getPostsByCategory = async (req, res) => {
  try {
    const posts = await Post.find({ category: req.params.categoryName });
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({
      message: `Error fetching posts for category ${req.params.categoryName}`,
      error: error,
    });
  }
};

// Controller to create a post
exports.createPost = async (req, res, next) => {
  try {
    let { title, body, category, coverImage } = req.body;

    const $ = cheerio.load(body);
    const imageUrls = [];

    // Find all <img> tags and extract the 'src' attribute
    $("img").each((index, img) => {
      const imageUrl = $(img).attr("src");
      console.log("-----------------", imageUrl);
      if (
        imageUrl.startsWith(
          `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/temporary/`
        )
      ) {
        // Check if image is in temporary storage
        imageUrls.push(imageUrl);
      }
    });

    // Include the cover image URL if it's in temporary storage
    if (
      coverImage &&
      coverImage.startsWith(
        `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/temporary/`
      )
    ) {
      imageUrls.push(coverImage);
    }

    // Move all images (including cover if necessary) to permanent storage
    const permanentUrls = await Promise.all(
      imageUrls.map(async (tempUrl) => {
        return await moveImageToPermanentStorage(tempUrl);
      })
    );

    // Replace temporary URLs in the body and coverImageUrl with permanent URLs
    permanentUrls.forEach((permUrl, index) => {
      const tempUrl = imageUrls[index];
      if (tempUrl === coverImage) {
        // This is the cover image URL
        coverImage = permUrl; // Update cover image URL to permanent
      } else {
        // This is an inline image URL
        body = body.replace(tempUrl, permUrl);
      }
    });
    const slug = slugify(title, {
      lower: true, // convert to lower case
      strict: true, // strip special characters except replacement
      remove: /[*+~.()'"!:@]/g, // regex to remove characters
      replacement: "-", // replace spaces with replacement character, defaults to `-`
    });
    const newPost = new Post({
      title,
      slug,
      body,
      category,
      coverImage,
      author: req.user.id,
      isPublished: true,
    });
    const savedPost = await newPost.save();
    res.status(201).json(savedPost);
  } catch (error) {
    console.log("err is", error);
    //res.status(500).json({ message: "Error creating post", error: error });
    next(error);
  }
};

// Controller to get a single post by slug
exports.getPost = async (req, res) => {
  const { id, slug } = req.query; // Destructure id and slug from query parameters

  try {
    let post;

    if (id && mongoose.isValidObjectId(id)) {
      // If an id is provided and it's a valid ObjectId, find by _id
      post = await Post.findById(id);
    } else if (slug) {
      // If a slug is provided, find by slug
      post = await Post.findOne({ slug: slug });
    } else {
      // If neither id nor slug is provided, or id is not valid, return an error
      return res.status(400).json({ message: "Invalid or missing identifier" });
    }

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    const postObj = post.toObject();
    postObj.id = postObj._id.toString(); // Ensure 'id' is a string
    delete postObj._id; // Optionally remove the '_id' field if not needed in the response

    res.status(200).json(postObj);
  } catch (error) {
    res.status(500).json({ message: "Error fetching the post", error: error });
  }
};
function extractImageUrlsFromHtml(htmlContent) {
  const $ = cheerio.load(htmlContent);
  const imageUrls = [];

  $("img").each((_, img) => {
    imageUrls.push($(img).attr("src"));
  });

  return imageUrls;
}

exports.updatePost = async (req, res, next) => {
  const postId = req.params.postId;
  const updatedPostData = req.body;

  try {
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).send({ message: "Post not found" });
    }

    // Extract all image URLs from the original and updated post body
    const originalImageUrls = extractImageUrlsFromHtml(post.body);
    const updatedImageUrls = extractImageUrlsFromHtml(updatedPostData.body);

    // Identify new images added to the body
    const newImageUrls = updatedImageUrls.filter(
      (url) =>
        url.startsWith(
          `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/temporary/`
        ) && !originalImageUrls.includes(url)
    );

    // Include the cover image URL if it's in temporary storage and different from the old one
    if (
      updatedPostData.coverImage &&
      updatedPostData.coverImage.startsWith(
        `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/temporary/`
      ) &&
      post.coverImage !== updatedPostData.coverImage
    ) {
      newImageUrls.push(updatedPostData.coverImage);
    }

    // Move all new images to permanent storage
    const imageUrlReplacements = await Promise.all(
      newImageUrls.map((tempUrl) => moveImageToPermanentStorage(tempUrl))
    );

    // Replace temporary URLs in the body and coverImageUrl with permanent URLs
    console.log(updatedPostData);

    let coverImageUrl = updatedPostData.coverImage;
    let body = updatedPostData.body;
    imageUrlReplacements.forEach((permUrl, index) => {
      const tempUrl = newImageUrls[index];
      if (tempUrl === updatedPostData.coverImage) {
        // This is the new cover image URL
        coverImageUrl = permUrl; // Update cover image URL to permanent
        console.log("-------------------", coverImageUrl);
      } else {
        // This is a new inline image URL
        body = updatedPostData.body.replace(tempUrl, permUrl);
      }
    });

    // Mark removed body images for removal and the old cover image if it's no longer used
    const imagesToRemove = originalImageUrls.filter(
      (url) => !updatedImageUrls.includes(url)
    );
    if (
      post.coverImage !== coverImageUrl &&
      !updatedImageUrls.includes(post.coverImage)
    ) {
      imagesToRemove.push(post.coverImage); // Add old cover image to removal list if it's replaced and not reused in the body
    }
    await Promise.all(
      imagesToRemove.map((url) => markImageForRemoval(url, postId))
    );

    // Update the post with new data, including the possibly updated body and coverImage
    post.title = updatedPostData.title;
    post.body = body;
    post.category = updatedPostData.category;
    post.coverImage = coverImageUrl;
    // Optionally update the slug as well, if the title has changed
    if (post.title !== updatedPostData.title) {
      post.slug = slugify(updatedPostData.title, {
        lower: true,
        strict: true,
        remove: /[*+~.()'"!:@]/g,
        replacement: "-",
      });
    }
    await post.save();

    res.status(200).json(post);
  } catch (error) {
    console.error("Failed to update post:", error);
    return res.status(500).send({ message: "Error updating post", error });
  }
};

// Controller to delete a post
exports.deletePost = async (req, res, next) => {
  try {
    // First, find the post by ID without deleting it
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return next(new HttpError("Post not found", 404));
    }

    // Check if the current user is the author of the post
    if (post.author.toString() !== req.user.id) {
      return next(
        new HttpError("User not authorized to delete this post", 403)
      );
    }

    // If the user is authorized, proceed to delete the post
    await Post.findByIdAndDelete(req.params.postId);

    // Assuming `extractImageUrlsFromHtml` is a function that extracts image URLs from the post's HTML body
    const imageUrls = extractImageUrlsFromHtml(post.body);

    // Assuming you have images in the post body or cover image that you want to delete from storage
    const imagesToDelete = [post.coverImage, ...imageUrls];

    // Use a utility function to mark images for removal or delete them from your storage
    await Promise.all(
      imagesToDelete.map((url) => markImageForRemoval(url, post._id))
    );

    res.status(200).json({ message: "Post successfully deleted" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error deleting post", error: error });
  }
};
