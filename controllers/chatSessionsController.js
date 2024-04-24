const ChatSession = require("../models/ChatSession");
const Message = require("../models/Message");
const User = require("../models/User");
const { constructChatSessionPayload } = require("../utils/chat/messageUtils");

exports.fetchAndEmitChatSessions = async (context) => {
  const { io, socket, onlineUsers, user } = context;

  // Find chat sessions where the user is a participant
  const chatSessions = await ChatSession.find({
    participantIds: user._id,
  })
    .populate("participantIds", "_id name profileImg lastSeen")
    .populate("groupInfo.admin", "_id name");

  for (const session of chatSessions) {
    const lastReadEntry = session.lastRead.find((entry) =>
      entry.userId.equals(user._id)
    );
    const lastReadTimestamp = lastReadEntry
      ? lastReadEntry.timestamp
      : new Date(0);

    const unreadMessages = await Message.find({
      chatId: session._id,
      timestamp: { $gt: lastReadTimestamp },
    }).sort({ timestamp: 1 });

    // Find the first unread message

    const unreadCount = unreadMessages.length;

    // Determine the first unread message ID
    const firstUnreadMessageId =
      unreadMessages.length > 0 ? unreadMessages[0]._id : null;
    // Fetch the last message for the session
    const lastMessage = await Message.findOne({
      chatId: session._id,
    }).sort({ timestamp: -1 });

    const chatInfo = constructChatSessionPayload(
      session,
      user,
      false
      // messages
    );

    // Attach the unread count and the ID of the first unread message to the chatInfo
    chatInfo.unreadCount = unreadCount;
    chatInfo.firstUnreadMessageId = firstUnreadMessageId;
    chatInfo.lastMessage = lastMessage;
    // Emitting chat session details including messages and conversation info
    socket.emit("chat session", chatInfo);
  }
};

exports.handleChatInfo = async (context, data, ack) => {
  const { chatId } = data;
  const { io, socket, onlineUsers, user } = context;
  const session = await ChatSession.findById(chatId);

  const lastRead = session.lastRead.find((entry) =>
    entry.userId.equals(user._id)
  );
  const unreadMessagesQuery = {
    chatId: session._id,
    timestamp: { $gt: lastRead ? lastRead.timestamp : new Date(0) },
  };

  // Find the first unread message
  const firstUnreadMessage = await Message.findOne(unreadMessagesQuery).sort({
    timestamp: 1,
  }); // Sorting by timestamp ascending

  const unreadCount = await Message.countDocuments(unreadMessagesQuery);
  const chatInfo = constructChatSessionPayload(
    session,
    user,
    false
    // messages
  );

  // Attach the unread count and the ID of the first unread message to the chatInfo
  chatInfo.unreadCount = unreadCount;
  chatInfo.firstUnreadMessageId = firstUnreadMessage
    ? firstUnreadMessage._id
    : null;

  // Emitting chat session details including messages and conversation info
  socket.emit("chat session", chatInfo);
};
