// utils/groupUtils.js

const {
  getAllMessgesForChat,
  constructChatSessionPayload,
} = require("./messageUtils");

/**
 * Emits updated group information to all participants.
 * @param {Object} chatSession - The chat session document.
 * @param {Object} context - The context including io, socket, onlineUsers, etc.
 * @param {Array} [messages] - Optional messages array to include in the payload.
 */
exports.emitGroupUpdate = async (context, updatedGroup, addedParticipants) => {
  const { io, onlineUsers, user } = context;

  let messages = [];
  if (addedParticipants && addedParticipants.length > 0) {
    messages = await getAllMessgesForChat(updatedGroup);
  }
  const chatInfo = constructChatSessionPayload(updatedGroup, user, false);

  updatedGroup.participantIds.forEach((participant) => {
    const participantSocket = onlineUsers.get(participant._id.toString());
    if (participantSocket) {
      if (
        addedParticipants &&
        addedParticipants.includes(participant._id.toString())
      ) {
        io.to(participantSocket.socketId).emit("group updated", {
          ...chatInfo,
          messages,
        });
      } else {
        io.to(participantSocket.socketId).emit("group updated", chatInfo);
      }
    }
  });
};
