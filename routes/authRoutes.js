const express = require("express");
const { body } = require("express-validator");
const {
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
} = require("../controllers/authController");

const { checkAuth } = require("../middleware/check-auth");
const { validateRequest } = require("../middleware/check-input");

const router = express.Router();

// Place the specific route before the general one
router.post(
  "/logout",
  [
    body("refreshToken")
      .not()
      .isEmpty()
      .withMessage("Refresh token must not be empty."),
  ],
  validateRequest,
  logoutUser
);

router.post(
  "/verifyOtp",
  [
    body("email").isEmail().withMessage("Please enter a valid email."),
    body("otp").not().isEmpty().withMessage("OTP must not be empty."),
  ],
  validateRequest,
  verifyOtp
);
router.post(
  "/requestOtp",
  [body("email").isEmail().withMessage("Please enter a valid email.")],
  validateRequest,
  requsetOtp
);
router.post(
  "/forgot",
  [body("email").isEmail().withMessage("Please enter a valid email.")],
  validateRequest,
  forgetPassword
);
router.patch(
  "/updatePassword",
  checkAuth,
  [
    body("currentPassword")
      .not()
      .isEmpty()
      .withMessage("Current password must not be empty."),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters long."),
  ],
  validateRequest,
  updatePassword
);
router.post(
  "/token/refresh",

  refershToken
);
router.post("/reset/:token", resetPassword);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Please enter a valid email."),
    body("password").not().isEmpty().withMessage("Password must not be empty."),
  ],
  validateRequest,
  loginUser
);
router.post(
  "/signup",
  [
    body("name").not().isEmpty().withMessage("Name must not be empty."),
    body("email").isEmail().withMessage("Please enter a valid email."),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long."),
  ],
  validateRequest,
  signupUser
);

router.get("/userData", checkAuth, getUserData);

// Export the router
module.exports = router;
