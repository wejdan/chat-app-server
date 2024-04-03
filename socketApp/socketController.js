module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Broadcast a message to all clients except the sender
    socket.on("chat message", (msg) => {
      socket.broadcast.emit("chat message", msg);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });
};
