const ChatSession = require("../models/ChatSession");
const Message = require("../models/Message");
const {
  constructChatSessionPayload,
  sendNewMessge,
} = require("../utils/chat/messageUtils");
const ongoingChats = new Map(); // Track ongoing chat session creations
async function fetchMessagesForChat(
  chatId,
  page,
  limit = 20,
  lastReadTimestamp
) {
  console.log("fetchMessagesForChat ,", page);
  const offset = (page - 1) * limit;
  const query = {
    chatId,
    timestamp: { $lte: lastReadTimestamp },
  };

  const [messages, totalCount] = await Promise.all([
    Message.find(query).sort({ timestamp: -1 }).skip(offset).limit(limit),
    Message.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalCount / limit);
  return { messages, totalCount, totalPages, currentPage: page };
}

async function findOrCreateChatSession(chatId, senderId, target) {
  let chatSession;
  let isNewSession = false;
  if (chatId && !chatId.startsWith("temp-chat-")) {
    // If chatId is provided, find the ChatSession directly
    chatSession = await ChatSession.findById(chatId);
  } else if (target) {
    // If chatId is not provided but target is, attempt to find or create a chat session
    const senderObjectId = senderId;
    const targetObjectId = target;

    // If chatId is not provided but target is, attempt to find or create a chat session
    // between sender and target for direct messaging
    chatSession = await ChatSession.findOne({
      participantIds: { $all: [senderObjectId, targetObjectId] },
      isGroup: false,
    });

    // If a session doesn't exist, create a new one
    if (!chatSession) {
      chatSession = new ChatSession({
        participantIds: [senderObjectId, targetObjectId],
        isGroup: false,
      });
      await chatSession.save();
      isNewSession = true; // Mark that a new session is created
    }
  }

  return { chatSession, isNewSession };
}

const sendAnewSession = async (
  chatSession,
  messageForEmission,
  senderId,
  target,
  onlineUsers,
  io
) => {
  const populatedSession = await ChatSession.findById(chatSession._id).populate(
    "participantIds",
    "name profileImg lastSeen"
  );

  const conversationInfo = {
    participants: populatedSession.participantIds,
    isGroup: false,
  };

  // Emit to all participants of the new session
  chatSession.participantIds.forEach((participantId) => {
    const participantSocket = onlineUsers.get(participantId.toString());
    if (participantSocket) {
      const isSender = participantId.toString() === senderId.toString();

      const messageToSend = isSender
        ? { ...messageForEmission, isRead: true }
        : { ...messageForEmission, isRead: false, tempId: undefined };
      io.to(participantSocket.socketId).emit("chat session", {
        chatId: populatedSession._id,
        messages: [messageToSend],
        conversationInfo,
        lastMessageTimestamp: populatedSession.lastMessageTimestamp,
        setActive: isSender, // This tells the client whether to set this chat as the active one
        isNewChat: isSender && true,
        tempChatId: isSender && `temp-chat-${target}`,
      });
    }
  });
};
exports.handleMessage = async (context, msg) => {
  const {
    senderId,
    content,
    type,
    imageUrl,
    timestamp,
    tempId,
    chatId,
    target,
    height,
  } = msg;
  const { io, socket, onlineUsers } = context;
  const sessionKey = chatId;
  // Queue message if session creation is in progress or create a new queue.
  try {
    if (!ongoingChats.has(sessionKey)) {
      ongoingChats.set(sessionKey, { inProgress: true, messages: [] });
    }
    ongoingChats.get(sessionKey).messages.push(msg);
    // If session creation is already in progress, just return to queue the message.
    if (
      ongoingChats.get(sessionKey).inProgress &&
      ongoingChats.get(sessionKey).messages.length > 1
    ) {
      return;
    }

    const { chatSession, isNewSession } = await findOrCreateChatSession(
      chatId,
      senderId,
      target
    );

    // Sort queued messages by timestamp to ensure proper order.
    const queuedMessages = ongoingChats
      .get(sessionKey)
      .messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    for (const [index, queuedMsg] of queuedMessages.entries()) {
      const newMessage = new Message({
        sender: senderId,
        chatId: chatSession._id,
        content: queuedMsg.content,
        type: queuedMsg.type,
        imageUrl: queuedMsg.imageUrl,
        timestamp: new Date(queuedMsg.timestamp),
        readBy: [senderId],
        height,
        fileMetadata: queuedMsg.fileMetadata,
      });
      const populatedMessage = await newMessage.save().then((msg) =>
        Message.populate(msg, {
          path: "sender",
          select: "_id name profileImg lastSeen",
        })
      );
      chatSession.lastMessageTimestamp = newMessage.timestamp;
      await chatSession.save();

      // Prepare the message for emission with conditionally added tempId.

      const messageForEmission = {
        ...populatedMessage.toObject(),
        tempId: queuedMsg.tempId,
      };
      if (isNewSession && index == 0) {
        await sendAnewSession(
          chatSession,
          messageForEmission,
          senderId,
          target,
          onlineUsers,
          io
        );
      } else {
        await sendNewMessge(io, chatSession, messageForEmission, onlineUsers);
      }
    }

    // Cleanup after processing.
    ongoingChats.delete(sessionKey);
  } catch (error) {
    console.log(error);
    socket.emit("error", {
      error: "An error occurred while sending the message.",
      tempId: msg.tempId, // Include the tempId so the client knows which message caused the error
      details: error.message, // Optionally include error details for debugging
    });
  }
};

exports.markMessageAsRead = async (messageId, userId) => {
  await Message.updateOne(
    { _id: messageId },
    {
      // Add the userId to the readBy array only if it's not already present
      $addToSet: { readBy: userId },
    }
  );
};

exports.markMessagesAsRead = async (chatSessionId, userId) => {
  const chatSession = await ChatSession.findById(chatSessionId);
  const readIndex = chatSession.lastRead.findIndex((entry) =>
    entry.userId.equals(userId)
  );

  if (readIndex >= 0) {
    chatSession.lastRead[readIndex].timestamp = new Date();
  } else {
    chatSession.lastRead.push({ userId, timestamp: new Date() });
  }
  await chatSession.save();
};
exports.updateTypingStatus = async (context, data) => {
  const { io, socket, onlineUsers } = context;
  const { chatId, userId, typing } = data;
  const chatSession = await ChatSession.findById(chatId);

  chatSession.participantIds.forEach((participantId) => {
    const participantSocket = onlineUsers.get(participantId.toString());
    if (participantSocket) {
      io.to(participantSocket.socketId).emit("typing", {
        chatId,
        userId,
        typing,
      });
    }
  });
};
exports.handleRequestMessages = async (context, data, ack) => {
  const { chatId, page } = data;
  const { io, socket, onlineUsers, user } = context;

  try {
    const session = await ChatSession.findById(chatId);
    const lastReadEntry = session.lastRead.find((entry) =>
      entry.userId.equals(user._id)
    );
    const lastReadTimestamp = lastReadEntry
      ? lastReadEntry.timestamp
      : new Date(0);

    const { messages, totalCount, totalPages, currentPage } =
      await fetchMessagesForChat(chatId, page, 20, lastReadTimestamp);

    // Fetch all unread messages
    const unreadMessages = await Message.find({
      chatId,
      timestamp: { $gt: lastReadTimestamp },
    }).sort({ timestamp: 1 });

    // Determine the first unread message ID
    const firstUnreadMessageId =
      unreadMessages.length > 0 ? unreadMessages[0]._id : null;

    const pageInfo = {
      totalCount,
      totalPages,
      currentPage,
      firstUnreadMessageId,
      hasNextPage: currentPage < totalPages,
    };

    // Emitting both read and unread messages
    socket.emit("messages-response", {
      chatId,

      messages: [...messages, ...unreadMessages],
      pageInfo: pageInfo,
    });

    return pageInfo;
  } catch (error) {
    console.log(error);
    throw error;
  }
};
exports.handleSearchMessages = async (context, searchTerm) => {
  const { io, socket, user } = context;

  try {
    const userChats = await ChatSession.find({
      participantIds: user._id,
    }).select("_id");

    const chatIds = userChats.map((chat) => chat._id);

    const query = {
      chatId: { $in: chatIds },
      content: { $regex: new RegExp(searchTerm, "i") },
    };

    const messages = await Message.find(query)
      .populate("sender", "name profileImg")
      .sort({ chatId: 1, timestamp: -1 }) // Sorting by descending timestamp if recent messages are preferred.
      .limit(50);

    const searchResults = [];

    for (let message of messages) {
      // Total count of messages after the found message

      const countAfter = await Message.countDocuments({
        chatId: message.chatId,
        timestamp: { $gt: message.timestamp },
      });

      const position = countAfter + 1;
      const page = Math.ceil(position / 20); // Assuming 20 messages per page

      searchResults.push({
        ...message.toObject(),
        page,
        countAfter,
      });
    }

    socket.emit("search results", { messages: searchResults });
  } catch (error) {
    console.error("Error handling search messages:", error);
    socket.emit("error", {
      message: "Failed to execute search",
      error: error.toString(),
    });
  }
};

exports.getMessagesAroundSearchResult = async (context, data) => {
  const { messageId, range = 10 } = data; // range can be specified or default to 10
  const { io, socket, user } = context;

  try {
    // Find the message
    const targetMessage = await Message.findById(messageId);

    // Calculate timestamps to find surrounding messages
    const { chatId, timestamp } = targetMessage;
    const messagesBefore = await Message.find({
      chatId,
      timestamp: { $lt: timestamp },
    })
      .sort({ timestamp: -1 })
      .limit(range);

    const messagesAfter = await Message.find({
      chatId,
      timestamp: { $gt: timestamp },
    })
      .sort({ timestamp: 1 })
      .limit(range);

    // Combine and sort all messages
    const surroundingMessages = [
      ...messagesBefore.reverse(),
      targetMessage,
      ...messagesAfter,
    ];

    socket.emit("getMessagesAroundSearchResult", {
      messages: surroundingMessages,
    });
  } catch (error) {
    console.error("Error handling search messages:", error);
    socket.emit("error", {
      message: "Failed to execute search",
      error: error.toString(),
    });
  }
};
