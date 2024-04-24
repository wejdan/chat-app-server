const {
  fetchAndEmitChatSessions,
} = require("../../controllers/chatSessionsController");
const {
  fetchAndEmitUserList,
  emitUserStatusChange,
  updateLastSeen,
} = require("../../controllers/userChatController");
const createContext = require("./createContext");
const { asyncErrorHandler } = require("./socketErrorHandlers");
const emitUserStatusChangeAsync = asyncErrorHandler(emitUserStatusChange);
const fetchAndEmitUserListAsync = asyncErrorHandler(fetchAndEmitUserList);
const updateLastSeenAsync = asyncErrorHandler(updateLastSeen);
const fetchAndEmitChatSessionsAsync = asyncErrorHandler(
  fetchAndEmitChatSessions
);

module.exports = (io, socket, onlineUsers) => {
  const context = createContext(io, socket, onlineUsers);

  // Registering group-related event listeners

  emitUserStatusChangeAsync(context, true);
  fetchAndEmitUserListAsync(context);
  fetchAndEmitChatSessionsAsync(context);

  socket.on("disconnect", () => {
    const lastSeen = new Date();
    onlineUsers.delete(socket.user._id.toString());
    updateLastSeenAsync(socket.user._id, lastSeen);

    emitUserStatusChangeAsync(context, false, lastSeen);
  });
};
