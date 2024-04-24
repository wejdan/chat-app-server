const User = require("../models/User");

exports.emitUserStatusChange = (context, isOnline, lastSeen) => {
  const { io, socket, onlineUsers, user } = context;
  io.emit("user status change", { userId: user._id, isOnline, lastSeen });
};

exports.fetchAndEmitUserList = async (context) => {
  const { io, socket, onlineUsers, user } = context;

  const allUsers = await User.find().select("-password -refreshToken");
  // Emit all users
  socket.emit(
    "all users",
    allUsers.map((user) => user.toObject())
  );

  // Emit separate list of online user IDs
  const onlineUserIds = Array.from(onlineUsers.keys());

  socket.emit("online users", onlineUserIds);
};
exports.updateLastSeen = async (userId, lastSeen) => {
  try {
    await User.findByIdAndUpdate(userId, {
      lastSeen,
    });
  } catch (error) {
    console.error(`Error updating last seen for user: ${userId}`, error);
  }
};
