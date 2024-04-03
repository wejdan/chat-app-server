const crypto = require("crypto"); // Node.js built-in module
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { sendOtpEmail, sendRestEmail } = require("../utils/email");
const HttpError = require("../models/HttpError");
const generateTokens = require("../utils/token");
const Otp = require("../models/Otp");

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString(); // Generates a 6-digit OTP
// Utility function for handling validation errors

const refershToken = async (req, res, next) => {
  const { refreshToken } = req.body;
  try {
    // Decode the refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select("+refreshToken ");
    console.log(refreshToken);
    console.log(user.refreshToken);
    if (refreshToken.trim() === user.refreshToken.trim()) {
      // Generate new tokens
      const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
        generateTokens(user._id, user.email);

      // Update the refresh token in the database
      user.refreshToken = newRefreshToken;
      await user.save();

      res.json({
        uid: user._id,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } else {
      return next(new HttpError("Invalid refresh token", 401));
    }
  } catch (error) {
    next(error);
  }
};

const forgetPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return next(
        new HttpError("No account with that email address exists.", 404)
      );
    }

    const resetToken = user.generateResetToken();
    await user.save(); // Save the user with the reset token and expiration

    // Send the reset token to the user's email (modify sendRestEmail as needed)

    try {
      // Attempt to send the reset email
      await sendRestEmail(user.email, resetToken);
      res.status(200).json({
        message:
          "An e-mail has been sent to " +
          user.email +
          " with further instructions.",
      });
    } catch (sendEmailError) {
      // If sending the email fails, clear the reset token and expiration
      console.error("Failed to send reset email:", sendEmailError);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save(); // Save changes to the user
      return next(
        new HttpError(
          "Failed to send reset email. Please try again later.",
          500
        )
      );
    }
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  const token = req.params.token; // The token sent by the user
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex"); // Hash it

  try {
    // Now, find the user by hashed token and check if the token hasn't expired
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
      return next(
        new HttpError("Password reset token is invalid or has expired.", 400)
      );
    }

    // Verify if the new password is different from the old one
    const isSamePassword = await user.verifyPassword(req.body.password);
    if (isSamePassword) {
      return next(
        new HttpError(
          "New password cannot be the same as the current password.",
          400
        )
      );
    }

    // Set the new password and clear the reset token and its expiration
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save(); // Save the updated user
    res.status(200).json({ message: "Your password has been updated." });
  } catch (error) {
    next(error);
  }
};

const requsetOtp = async (req, res, next) => {
  const { email } = req.body;
  const otp = generateOtp();

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // If a user with the email already exists, send an error response

      return next(
        new HttpError("Email is already in use by another account.", 400)
      );
    }
    await Otp.findOneAndDelete({ email });
    const otpInstance = new Otp({ email, otp });
    await otpInstance.save();
    await sendOtpEmail(email, otp); // Implement this function based on your email service

    res.status(200).json({ message: "OTP sent to email." });
  } catch (error) {
    next(error);
  }
};
const verifyOtp = async (req, res, next) => {
  const { email, otp } = req.body;

  try {
    const otpRecord = await Otp.findOne({ email, otp });
    if (!otpRecord) {
      return next(new HttpError("Invalid OTP or OTP expired.", 403));
    }

    // OTP is valid, proceed with user verification logic here
    // Optionally, delete the OTP record or mark it as verified
    await Otp.deleteOne({ _id: otpRecord._id });

    res.status(200).json({ message: "OTP verified successfully." });
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const existingUser = await User.findOne({ email: email });
    if (!existingUser) {
      return next(
        new HttpError("Invalid credentials, could not log you in.", 403)
      );
    }

    const isValidPassword = await existingUser.verifyPassword(password);
    if (!isValidPassword) {
      return next(
        new HttpError("Invalid credentials, could not log you in.", 403)
      );
    }

    const { accessToken, refreshToken } = generateTokens(
      existingUser._id,
      existingUser.email
    );
    // Store the refresh token in the database
    existingUser.refreshToken = refreshToken;

    await existingUser.save();
    const userObj = existingUser.toObject({ getters: true });
    delete userObj.password;

    res.json({ accessToken, refreshToken, user: userObj });
  } catch (error) {
    next(error);
  }
};
const updatePassword = async (req, res, next) => {
  try {
    // Assuming the userId is stored in req.userData after authentication
    const userId = req.user.id;
    console.log(req.user);
    const { currentPassword, newPassword } = req.body;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return next(new HttpError("User not found.", 404));
    }

    // Verify the current password
    const isMatch = await user.verifyPassword(currentPassword);
    if (!isMatch) {
      return next(new HttpError("Your current password is wrong.", 401));
    }

    // Check if the new password is the same as the current password
    const isSamePassword = await user.verifyPassword(newPassword);
    if (isSamePassword) {
      return next(
        new HttpError(
          "New password cannot be the same as the current password.",
          400
        )
      );
    }

    // Update the password and save the user
    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    next(error);
  }
};

const signupUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email: email });
    if (existingUser) {
      return next(
        new HttpError("User exists already, please login instead.", 422)
      );
    }

    const createdUser = new User({
      name,
      email,
      password,
      signUpDate: new Date(),
    });
    await createdUser.save();

    // Generate both access and refresh tokens
    const { accessToken, refreshToken } = generateTokens(
      createdUser._id,
      createdUser.email
    );

    // Store the refresh token in the database
    createdUser.refreshToken = refreshToken;
    await createdUser.save(); // Ensure to save the user again after adding the refresh token

    // Prepare user object for response (excluding the password)
    const userObject = createdUser.toObject({ getters: true });
    delete userObject.password; // Ensure password is not sent back in the response

    // Respond with both tokens and the user information
    res.status(201).json({
      accessToken,
      refreshToken,
      user: userObject,
    });
  } catch (error) {
    next(error);
  }
};
const logoutUser = async (req, res) => {
  try {
    // Extract the refresh token from request body
    const { refreshToken } = req.body;

    // Proceed only if refreshToken is provided
    if (refreshToken) {
      // Find the user associated with the refresh token
      const user = await User.findOne({ refreshToken });

      if (user) {
        user.refreshToken = null; // Clear the refresh token
        await user.save();
      }
    }

    // Respond that the logout was successful regardless of whether the user was found
    res.json({ message: "Logged out successfully." });
  } catch (error) {
    // Log the error for server-side tracking, but don't disrupt the client's logout process
    console.error("Error during logout:", error);

    // Still respond with a successful logout message to ensure the client proceeds with logout
    res.json({ message: "Logged out successfully." });
  }
};

const getUserData = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // Fetch the user data including the isAdmin property
    const userData = await User.findById(userId).select("-password");
    // Convert Mongoose document to a plain JavaScript object
    const userObject = userData.toObject({ getters: true });

    // Extract isAdmin separately and exclude it from the userObject

    // Return both isAdmin and the rest of the user data in the response
    res.json(userObject);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  loginUser,
  signupUser,
  getUserData,
  verifyOtp,
  requsetOtp,
  forgetPassword,
  resetPassword,
  updatePassword,
  refershToken,
  logoutUser,
};
