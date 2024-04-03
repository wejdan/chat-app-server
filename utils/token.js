const jwt = require("jsonwebtoken");

function generateTokens(userId, email) {
  // Access token
  const accessToken = jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: "2h" } // short-lived
  );

  // Refresh token
  const refreshToken = jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" } // longer-lived
  );
  console.log("generateTokens was called", refreshToken);

  return { accessToken, refreshToken };
}

module.exports = generateTokens;
