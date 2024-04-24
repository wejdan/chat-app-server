// ./socketApp/socketController.js

const Message = require("../models/Message");
const { checkSocketAuth } = require("./middlewares");

module.exports = (io) => {
  // Authentication middleware
  const onlineUsers = new Map();
  io.use(checkSocketAuth);
  io.emit("online users", Array.from(onlineUsers.keys())); // Emit only user IDs as an example
  // Your existing event listeners
  io.on("connection", (socket) => {
    //  console.log("A user connected:", socket.id, "User:", socket.user);
    const user = socket.user; // Assuming `checkSocketAuth` attaches a `user` object to `socket`

    // Add user to the online users map
    onlineUsers.set(user._id.toString(), {
      socketId: socket.id,
      userInfo: user,
    });
    io.emit(
      "online users",
      Array.from(onlineUsers.values()).map((user) => user.userInfo)
    );
    console.log(onlineUsers);

    socket.on("chat message", async (msg) => {
      // Save the message to the database
      const message = new Message(msg);
      await message.save();
      if (msg.target) {
        // Find the socket ID of the target user
        const targetSocketId = onlineUsers.get(msg.target)?.socketId;
        if (targetSocketId) {
          io.to(targetSocketId).emit("chat message", msg);
        }
      } else {
        // No specific target, broadcast to everyone else
        socket.broadcast.emit("chat message", msg);
      }
    });
    socket.on("disconnect", () => {
      onlineUsers.delete(user._id.toString());

      // Broadcast the updated list of online users
      io.emit(
        "online users",
        Array.from(onlineUsers.values()).map((user) => user.userInfo)
      );
    });
  });
};
