const { checkSocketAuth } = require("./middlewares");
const groupEvents = require("../utils/chat/groupEvents");
const messageEvents = require("../utils/chat/messageEvents");
const initializeSocket = require("../utils/chat/initializeSocket");

module.exports = (io) => {
  const onlineUsers = new Map();

  io.use(checkSocketAuth);

  io.on("connection", (socket) => {
    const user = socket.user;
    onlineUsers.set(user._id.toString(), {
      socketId: socket.id,
      userInfo: user,
    });

    initializeSocket(io, socket, onlineUsers);

    // Apply  event handlers
    groupEvents(io, socket, onlineUsers);
    messageEvents(io, socket, onlineUsers, user);
  });
};
