const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Adjust path as necessary

const checkSocketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token; // or however you're passing the token
    if (!token) {
      return next(new Error("Authentication error: Token not found"));
    }
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decodedToken.userId).select(
      "+passwordLastChanged"
    );

    if (!user) {
      return next(new Error("Authentication error: User does not exist"));
    }

    const { password, __v, passwordLastChanged, ...safeUser } = user.toObject();

    // Attach the cleaned user info to the socket object

    socket.user = safeUser; // Attach user info to the socket object
    next();
  } catch (err) {
    console.log(err);
    next(new Error("Authentication error"));
  }
};

module.exports = {
  checkSocketAuth,
};
