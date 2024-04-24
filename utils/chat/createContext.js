// createContext.js
module.exports = (io, socket, onlineUsers) => {
  const context = {
    io,
    socket,
    onlineUsers,
    user: socket.user, // Assuming `user` is attached to `socket` upon connection
  };

  return context;
};
