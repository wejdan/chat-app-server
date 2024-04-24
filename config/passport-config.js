const passport = require("passport");
const User = require("../models/User");

const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

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
module.exports = passport;
