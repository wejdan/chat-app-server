const jwt = require("jsonwebtoken");
const User = require("../models/User");
const HttpError = require("../models/HttpError");
const generateTokens = require("../utils/token");

const handleOAuthSuccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new HttpError("OAuth login failed. User not found.", 403));
    }

    // Assuming generateTokens is a function you've created to generate access and refresh tokens
    const { accessToken, refreshToken } = generateTokens(
      req.user._id,
      req.user.email
    );

    // Update user with refreshToken if you're storing refresh tokens in DB
    await User.findByIdAndUpdate(req.user._id, {
      refreshToken: refreshToken,
    });

    // Prepare user object for response, exclude sensitive data
    const userObj = req.user.toObject({ getters: true });
    delete userObj.password; // Make sure to exclude the password, and any other sensitive information

    // Choose one of the following methods to send data to the client:

    // Option 1: Redirect with tokens in query parameters (not recommended for production due to security concerns)
    res.redirect(
      `http://localhost:3000/auth?accessToken=${accessToken}&refreshToken=${refreshToken}&uid=${userObj._id}`
    );

    // Depending on your front-end setup, you might need a different approach to ensure
    // that your client application can appropriately handle the tokens and user data.
  } catch (error) {
    next(error);
  }
};
const checkAuth = async (req, res, next) => {
  if (req.method === "OPTIONS") {
    return next();
  }

  try {
    const token = req.headers.authorization.split(" ")[1]; // Authorization: 'Bearer TOKEN'
    if (!token) {
      console.log(req.url);
      return next(new HttpError("Authentication failed!", 403));
    }
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decodedToken.userId).select(
      "+passwordLastChanged"
    );

    if (!user) {
      return next(new HttpError("user no longer exist.", 403));
    }

    // Assuming you store a 'passwordChangedAt' timestamp and include an 'iat' (issued at) claim in your JWT
    if (
      user.passwordLastChanged &&
      decodedToken.iat < new Date(user.passwordLastChanged).getTime() / 1000
    ) {
      return next(
        new HttpError("User password has changed. Please log in again.", 401)
      );
    }

    req.user = { id: decodedToken.userId, role: user.role };
    next();
  } catch (err) {
    console.log(err);
    console.log(req.url);

    const message =
      err.name === "TokenExpiredError"
        ? "Token is expired. Please log in again."
        : "Authentication failed!";
    next(new HttpError(message, 401));
  }
};
const restrictTo = (...roles) => {
  return async (req, res, next) => {
    // User ID is available from the checkAuth middleware

    try {
      // Find the user by ID to check their role

      // Check if the user's role is included in the roles allowed to access the route
      if (!roles.includes(req.user.role)) {
        // User's role is not allowed
        return next(
          new HttpError(
            "You do not have permission to perform this action.",
            403
          )
        );
      }

      // User has permission
      next();
    } catch (err) {
      next(new HttpError("Access restricted.", 403));
    }
  };
};

module.exports = {
  checkAuth,
  handleOAuthSuccess,

  restrictTo,
};
