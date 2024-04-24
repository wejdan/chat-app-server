// groupEvents.js

const {
  handleChatMessage,
  markMessageAsRead,
  handleMessage,
  handleRequestMessages,
  markMessagesAsRead,
  updateTypingStatus,
  handleSearchMessages,
  getMessagesAroundSearchResult,
} = require("../../controllers/messageController");
const createContext = require("./createContext");
const { asyncErrorHandler } = require("./socketErrorHandlers");
const handleChatMessageAsync = asyncErrorHandler(handleMessage);
const handleRequsetMessageAsync = asyncErrorHandler(handleRequestMessages);
const handleUpdateTypingAsync = asyncErrorHandler(updateTypingStatus);
const handleSearchMessgesAsync = asyncErrorHandler(handleSearchMessages);
const getMessagesAroundSearchResultAsync = asyncErrorHandler(
  getMessagesAroundSearchResult
);
module.exports = (io, socket, onlineUsers, user) => {
  // Registering group-related event listeners
  const context = createContext(io, socket, onlineUsers);
  socket.on("send message", (msg) =>
    handleChatMessageAsync(context, {
      ...msg,
      senderId: user._id,
    })
  );

  socket.on("request-messages", async (data, ack) => {
    const hasMore = await handleRequsetMessageAsync(context, data);

    if (typeof ack === "function") {
      // Simulate fetching data or any other operation

      // After processing, call the acknowledgment function
      ack(hasMore);
    } else {
      console.error("Acknowledgment callback is missing!");
    }
  });

  socket.on("read message", ({ chatId }) =>
    // markMessageAsRead(messageId, user._id).catch(console.error)
    markMessagesAsRead(chatId, user._id).catch(console.error)
  );
  socket.on("search messages", ({ searchTerm }) =>
    handleSearchMessgesAsync(context, searchTerm)
  );

  socket.on("fetchSurroundingMessages", (data) => {
    getMessagesAroundSearchResultAsync({ io, socket, user }, data);
  });
  socket.on("typing", ({ chatId, typing }) =>
    // markMessageAsRead(messageId, user._id).catch(console.error)
    handleUpdateTypingAsync(context, { chatId, userId: user._id, typing })
  );
};
