const User = require("../models/User");
const {
  generateUploadSignedUrl,
  markImageForRemoval,
} = require("../utils/imgs");
// Import other required services or utilities

// Controller method for deleting a user
// Enhanced deleteUser controller method
const deleteUser = async (req, res, next) => {
  try {
    const userId = req.params.userId;

    // Additional authorization checks can be implemented here

    // Optionally, delete or handle related resources (e.g., user's posts and comments)

    // Delete the user from the database
    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Optionally, mark the user's profile image for removal
    if (user.profileImg) {
      markImageForRemoval(user.profileImg, userId)
        .then(() =>
          console.log(`Marked user's image for removal: ${user.profileImg}`)
        )
        .catch((err) =>
          console.error(`Failed to mark user's image for removal: ${err}`)
        );
    }

    res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    next(error); // Pass errors to the error handling middleware
  }
};

// Controller method for updating user information
const updateUser = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const updates = req.body;

    // Additional validation and authorization checks can be implemented here

    // Update the user in the database
    const updatedUser = await User.findByIdAndUpdate(userId, updates, {
      new: true,
    });
    res.status(200).json({ user: updatedUser });
  } catch (error) {
    next(error); // Pass errors to the error handling middleware
  }
};

// Controller method for updating profile picture
const updateProfile = async (req, res, next) => {
  const { id } = req.user; // Assuming you're storing the user's ID in req.user
  const { imageUrl } = req.body; // The public URL of the uploaded image

  try {
    // Retrieve the current user to get the old image URL
    const currentUser = await User.findById(id);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const oldImageUrl = currentUser.profileImg;

    // Proceed to update the user with the new image URL
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { profileImg: imageUrl },
      { new: true }
    );

    // After successfully updating the user, mark the old image for removal
    // Ensure this does not delay the response to the client
    if (oldImageUrl && oldImageUrl !== imageUrl) {
      markImageForRemoval(oldImageUrl, id)
        .then(() => console.log(`Marked old image for removal: ${oldImageUrl}`))
        .catch((err) =>
          console.error(`Failed to mark old image for removal: ${err}`)
        );
    }

    res.json({
      message: "Profile picture updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};
// Controller method to get all users
const searchUsers = async (req, res) => {
  const searchQuery = req.query.query;

  try {
    // Use a case-insensitive regex search to find actors matching the search query in their name
    const results = await User.find({
      name: { $regex: searchQuery, $options: "i" },
    }).limit(10); // Limit the results to 10 or any number you see fit

    // Transform the results to match the expected format for React Select
    const users = results.map((user) => ({
      value: user._id.toString(),
      label: user.name,
      image: user.profileImg, // Assuming 'profile' is the field for the actor's image URL
    }));

    res.json(users);
  } catch (error) {
    next(error);
  }
};
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select("-password -refreshToken"); // Excluding sensitive fields
    res.status(200).json({
      status: "success",
      results: users.length,
      users,
    });
  } catch (error) {
    next(error); // Pass errors to the error handling middleware
  }
};

module.exports = {
  deleteUser,
  getAllUsers,
  updateUser,
  updateProfile,
  searchUsers,
};
