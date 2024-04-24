// utils/messageUtils.js

const ChatSession = require("../../models/ChatSession");
const Message = require("../../models/Message");
const sendNewMessge = async (
  io,
  chatSession,
  messageForEmission,
  onlineUsers
) => {
  chatSession.participantIds.forEach((participantId) => {
    const participantSocket = onlineUsers.get(participantId.toString());

    const isSender =
      participantId.toString() === messageForEmission.sender?._id.toString();
    if (participantSocket) {
      io.to(participantSocket.socketId).emit("chat message", {
        message: {
          ...messageForEmission,
          isRead: isSender,
          tempId: isSender ? messageForEmission.tempId : null,
        },
        chatId: chatSession._id,
        messageId: messageForEmission._id,
      });
    }
  });
};
const sendSystemNotification = async (context, chatId, notifications) => {
  const { io, onlineUsers } = context;

  try {
    const chatSession = await ChatSession.findById(chatId);

    for (const notification of notifications) {
      let effectPayload;
      if (notification.effect.isUser) {
        effectPayload = {
          isUser: true,
          users: notification.effect.users, // Assuming this is an array of user IDs
        };
      } else {
        effectPayload = {
          isUser: false,
          data: notification.effect.data, // Other data
        };
      }

      const newMessage = new Message({
        chatId: chatSession._id,
        sender: notification.sender,
        action: notification.action,
        effect: effectPayload, // Set the effect based on the condition
        type: "system",
        timestamp: new Date(), // Use the current time for the timestamp
      });

      const populatedMessage = await newMessage.save().then((msg) => {
        // Conditionally populate the `effect.users` if `isUser` is true
        if (effectPayload.isUser) {
          return Message.populate(msg, [
            { path: "sender", select: "_id name profileImg" },
            { path: "effect.users", select: "_id name profileImg" }, // Populate effect.users here
          ]);
        } else {
          return Message.populate(msg, {
            path: "sender",
            select: "_id name profileImg",
          });
        }
      });

      chatSession.lastMessageTimestamp = newMessage.timestamp;
      await chatSession.save();

      const messageForEmission = {
        ...populatedMessage.toObject(),
      };
      await sendNewMessge(io, chatSession, messageForEmission, onlineUsers);
    }
  } catch (error) {
    throw error;
  }
};

const constructChatMessagePayload = (chatSession, message, userId) => {
  const messageObj = message.toObject(); // Convert Mongoose document to plain object
  delete messageObj.readBy; // Remove the readBy property
  let isSender;
  if (userId) {
    isSender = message.sender._id.toString() === userId;
  } else {
    isSender = false;
  }

  return {
    ...messageObj,
    isRead: isSender, // Assuming messages are initially marked as read by the sender
    tempId: isSender ? message.tempId : null, // Conditionally include tempId

    chatId: chatSession._id,
    messageId: message._id,
  };
};

const getAllMessgesForChat = async (chatSession, userId) => {
  const messages = await Message.find({ chatId: chatSession._id })
    .sort({ timestamp: 1 })
    .populate("sender", "_id name profileImg");
  // Construct message payloads
  return messages.map((message) =>
    constructChatMessagePayload(chatSession, message, userId)
  );
};
/**
 * Constructs a chat message payload for emission.
 * @param {Object} chatSession - The chat session document.
 * @param {Object} message - The message document.
 * @param {String} senderId - The ID of the sender.
 * @return {Object} The message payload for the "chat message" event.
 */

// utils/sessionUtils.js

/**
 * Constructs a chat session payload for emission.
 * @param {Object} chatSession - The chat session document.
 * @param {Array} messages - An array of message documents.
 * @param {String} senderId - The ID of the sender.
 * @param {Boolean} isNewSession - Indicates if this is a new chat session.
 * @return {Object} The chat session payload for the "chat session" event.
 */
const constructChatSessionPayload = (
  chatSession,

  user,
  isNewSession,
  messages
) => {
  // Manually construct the participants and admin data if needed
  const participants = chatSession.participantIds.map((participant) => ({
    _id: participant._id,
    name: participant.name,
    profileImg: participant.profileImg,
    lastSeen: participant.lastSeen,
  }));
  let admin = chatSession.groupInfo?.admin;
  // If admin is populated, format it similarly
  if (admin) {
    admin = {
      _id: admin._id,
      name: admin.name,
      profileImg: admin.profileImg,
    };
  }

  const sessionObject = {
    chatId: chatSession._id,

    conversationInfo: {
      participants,
      isGroup: chatSession.isGroup,
      groupName: chatSession.groupInfo?.groupName,
      admin, // Ensure to access the ID if admin is populated
      groupImage: chatSession.groupInfo?.groupImage,
    },
    lastMessageTimestamp: chatSession.lastMessageTimestamp,

    isNewChat: isNewSession && isSender,
    tempChatId: isNewSession && isSender && `temp-chat-${target}`,
  };
  if (messages) {
    const messagesPayload = messages.map((message) => {
      const messageObj = message.toObject();
      delete messageObj.readBy; // Remove the readBy field

      const isSender = messageObj.sender?._id.toString() === user._id;
      return {
        ...messageObj,
        isRead: message.readBy.includes(user._id), // Check if message is read by the user
        tempId: isSender ? message.tempId : undefined, // Include tempId only for messages sent by the user
      };
    });

    sessionObject.messages = messagesPayload;
  }

  return sessionObject;
};
module.exports = {
  constructChatMessagePayload,
  getAllMessgesForChat,
  constructChatSessionPayload,
  sendNewMessge,
  sendSystemNotification,
};
