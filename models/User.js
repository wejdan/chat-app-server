const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const SALT_WORK_FACTOR = 10;
const Schema = mongoose.Schema;

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/.+\@.+\..+/, "Please enter a valid email address"],
    lowercase: true,
  },
  googleId: { type: String },
  name: {
    type: String,
    unique: true,
    required: true,
  },
  profileImg: {
    type: String,
    required: true,
    default:
      "https://storage.googleapis.com/blog_bucket_12/default-avatar-profile.png",
  },
  signUpDate: {
    type: Date,
    default: Date.now,
  },
  isOAuthUser: {
    type: Boolean,
    default: false,
  },
  password: {
    type: String,
    required: function () {
      return !this.isOAuthUser;
    },
  },
  resetPasswordToken: {
    type: String,
    required: false,
    select: false,
  },
  resetPasswordExpires: {
    type: Date,
    required: false,
    select: false,
  },
  passwordLastChanged: {
    type: Date,
    required: false,
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },

  refreshToken: {
    type: String,
    required: false,
    select: false,
  },
  updatedAt: Date,
});
userSchema.statics.findOrCreate = async function findOrCreate(condition, doc) {
  try {
    // First, try to find the user by their Google ID.
    let user = await this.findOne({ googleId: condition.googleId });

    if (user) {
      return user;
    }

    // If no user was found by Google ID, check by email to link accounts.
    if (doc.email) {
      user = await this.findOne({ email: doc.email.toLowerCase() });
      if (user) {
        // User found by email. Update this user with Google ID if not set.
        if (!user.googleId) {
          user.googleId = condition.googleId;
          await user.save();
        }
        return user;
      }
    }

    // If no user exists with the Google ID or email, create a new user.
    user = await this.create(doc);
    return user;
  } catch (err) {
    console.error("Error in findOrCreate:", err);
    throw err;
  }
};

userSchema.pre("save", function (next) {
  let user = this;
  if (this.isOAuthUser) return next();
  // Only hash the password if it has been modified (or is new)
  if (!user.isModified("password")) return next();

  // Generate a salt
  bcrypt.genSalt(SALT_WORK_FACTOR, function (err, salt) {
    if (err) return next(err);

    // Hash the password using our new salt
    bcrypt.hash(user.password, salt, function (err, hash) {
      if (err) return next(err);

      // Override the cleartext password with the hashed one
      user.password = hash;

      // Update the passwordLastChanged timestamp
      if (!user.isNew) {
        user.passwordLastChanged = Date.now() - 1000;
      }

      next();
    });
  });
});

userSchema.methods.verifyPassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error("Password verification failed");
  }
};
userSchema.methods.generateResetToken = function () {
  // Generate a token
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash the token and set it on the user model
  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.resetPasswordToken = hashedToken;
  this.resetPasswordExpires = Date.now() + 5 * 60 * 1000; // Token expires in 5 minutes

  // Return the plain reset token (not hashed) so it can be sent to the user
  return resetToken;
};

// Method to verify reset token
userSchema.methods.verifyResetToken = async function (token) {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  return (
    hashedToken === this.resetPasswordToken &&
    this.resetPasswordExpires > Date.now()
  );
};
const User = mongoose.model("User", userSchema);

module.exports = User;
