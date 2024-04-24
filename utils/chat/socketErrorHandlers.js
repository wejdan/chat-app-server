// utils/socketErrorHandlers.js

function handleSocketError(context, error) {
  const { io, socket, onlineUsers, user } = context;

  console.error("Socket Error:", error);

  // Emitting a generic error event to the client
  // You might want to customize this part to suit your error handling strategy better
  socket.emit("error", {
    message: "An error occurred", // Generic message
    details: error.message, // Detailed error message, consider the security implications of sending error details to the client
  });
}
function asyncErrorHandler(handler) {
  return async (context, ...args) => {
    try {
      // Ensure the handler receives the context as its first argument, followed by any other arguments.
      return await handler(context, ...args);
    } catch (error) {
      // Assuming handleSocketError also accepts the context or the specific elements it needs (e.g., the socket for emitting error messages)
      handleSocketError(context, error);
    }
  };
}

module.exports = {
  asyncErrorHandler,
  handleSocketError,
};
