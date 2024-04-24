// groupEvents.js

const {
  emitUserStatusChange,
} = require("../../controllers/userChatController");

module.exports = (io, socket, onlineUsers) => {
  // Registering group-related event listeners
  socket.on("disconnect", () => {
    onlineUsers.delete(user._id.toString());
    emitUserStatusChange(io, user._id, false);
  });
};
