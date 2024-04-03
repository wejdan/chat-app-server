const express = require("express");
const cors = require("cors");
const passport = require("passport");

require("dotenv").config();

const connectDatabase = require("./utils/database");
const User = require("./models/User");
const session = require("express-session");
const generateTokens = require("./utils/token");

const postsRoutes = require("./routes/postsRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/UserRoutes");
const storageRoutes = require("./routes/storageRoutes");
const allCommentsRoutes = require("./routes/allCommentsRoutes"); // or allCommentsRoutes, depending on what you named it

const {
  notFoundError,
  globalErrorHandler,
} = require("./controllers/error-controller");
const PORT = process.env.PORT || 5000;

const app = express();
app.use(
  session({
    secret: "your_secret", // This should be a long, random string to keep sessions secure
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something stored
    cookie: {
      httpOnly: true, // Prevents client side JS from reading the cookie
      secure: false, // true if using https
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GOOGLE_CLIENT_ID =
  "1089037694941-trrokb6jj8cqa53v0n779723li5koap1.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:5000/auth/google/callback", // URL to which Google will redirect the user after granting authorization
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        // Assuming profile.id is the unique Google ID you're using to find or create the user
        const profileImgUrl =
          profile.photos && profile.photos.length > 0
            ? profile.photos[0].value
            : null;
        const user = await User.findOrCreate(
          { googleId: profile.id },
          {
            // Add additional fields you want to save when creating a new user, e.g.:
            googleId: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName,
            profileImg: profileImgUrl,
            isOAuthUser: true,
            // You might also want to handle profile photos, etc.
          }
        );

        return cb(null, user); // No error, proceed with the returned user
      } catch (err) {
        return cb(err); // An error occurred
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

app.use(passport.initialize());
app.use(passport.session());

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  async (req, res, next) => {
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
  }
);

app.use(cors({ credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ limit: "2mb", extended: true }));
app.use(express.static("public"));

app.use("/api/v1/posts", postsRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/storage", storageRoutes);

// Use the specific comments routes
app.use("/api/v1/comments", allCommentsRoutes);

app.use(notFoundError);
app.use(globalErrorHandler);

let server;
connectDatabase()
  .then(() => {
    require("./scheduledTasks");
    server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      //  indexPermanentImagesInDatabase();
    });
  })
  .catch(() => {
    console.error("Database connection failed. Server not started.");
    process.exit(1); // Exit the process with an error code
  });
