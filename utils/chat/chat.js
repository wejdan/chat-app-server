const { default: mongoose } = require("mongoose");
const ChatSession = require("../../models/ChatSession");
const Message = require("../../models/Message");
const User = require("../../models/User");
const { markImageForRemoval } = require("../imgs");

const emitUserStatusChange = (io, userId, isOnline) => {
  io.emit("user status change", { userId, isOnline });
};
async function createGroup(
  io,
  socket,
  onlineUsers,
  { groupName, participantIds }
) {
  const user = socket.user; // Assuming `user` is attached to the socket in your authentication middleware
  try {
    // Ensure the admin is part of the group
    if (!participantIds.includes(user._id.toString())) {
      participantIds.push(user._id.toString());
    }
    const newGroup = await ChatSession.create({
      isGroup: true,
      participantIds,
      groupInfo: {
        groupName,
        admin: user._id,
        createdAt: new Date(),
      },
      lastMessageTimestamp: new Date(),
    });

    // Emit event to the group participants that a new group has been created
    participantIds.forEach((participantId) => {
      const participant = onlineUsers.get(participantId);
      if (participant) {
        io.to(participant.socketId).emit("group created", {
          isGroup: true,
          chatId: newGroup._id,
          messages: [],
          conversationInfo: {
            participants: participantIds,
            groupName,
            admin: user._id,
            createdAt: new Date(),
            isGroup: true,
            ...newGroup.groupInfo,
          },
          lastMessageTimestamp: new Date(),
        });
      }
    });
  } catch (error) {
    console.error("Error creating group chat:", error);
    socket.emit("error", "Failed to create group due to server error.");
  }
}
const fetchAndEmitUserList = async (onlineUsers, socket) => {
  try {
    const allUsers = await User.find().select("-password -refreshToken");
    // Emit all users
    socket.emit(
      "all users",
      allUsers.map((user) => user.toObject())
    );

    // Emit separate list of online user IDs
    const onlineUserIds = Array.from(onlineUsers.keys());

    console.log("onlineUsers", onlineUsers);
    console.log("onlineUserIds", onlineUserIds);
    socket.emit("online users", onlineUserIds);
  } catch (error) {
    console.error("Error sending user list:", error);
  }
};

const fetchAndEmitChatSessions = async (user, socket) => {
  try {
    // Find chat sessions where the user is a participant
    const chatSessions = await ChatSession.find({
      participantIds: user._id,
    })
      .populate("participantIds", "name profileImg")
      .populate("groupInfo.admin", "name");

    for (const session of chatSessions) {
      let messages = await Message.find({
        chatId: session._id,
      })
        .sort({ timestamp: 1 })
        .populate("sender", "_id name profileImg");
      messages = messages.map((message) => {
        const messagesObj = message.toObject();

        delete messagesObj.readBy;

        return { ...messagesObj, isRead: message.readBy.includes(user._id) };
      });

      // For every session, determine if it's a group or a private chat
      const isGroup = session.isGroup;
      let conversationInfo;

      if (isGroup) {
        // Group chat information
        conversationInfo = {
          groupName: session.groupInfo.groupName,
          admin: session.groupInfo.admin,
          createdAt: session.groupInfo.createdAt,
          participants: session.participantIds,
          isGroup: true,
          groupImage: session.groupInfo.groupImage,
        };
      } else {
        // Private chat information, find the other participant
        const otherParticipant = session.participantIds.find(
          (participant) => participant._id.toString() !== user._id.toString()
        );
        conversationInfo = {
          participants: [otherParticipant],
          isGroup: false,
        };
      }

      // Emitting chat session details including messages and conversation info
      socket.emit("chat session", {
        chatId: session._id,
        messages,
        conversationInfo, // Contains either group info or participant info
        lastMessageTimestamp: session.lastMessageTimestamp,
      });
    }
  } catch (error) {
    console.error("Error fetching chat sessions and messages:", error);
  }
};

const handleChatMessage = async (msg, onlineUsers, io) => {
  const {
    senderId,
    content,
    type,
    imageUrl,
    timestamp,
    tempId,
    chatId,
    target,
  } = msg;

  let chatSession;
  let isNewSession = false; // Flag to track if a new session is created
  if (chatId) {
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

  if (!chatSession) {
    console.error("Unable to find or create chat session.");
    return;
  }

  // Create and save the new message
  const newMessage = new Message({
    sender: senderId,
    chatId: chatSession._id,
    content,
    type,
    imageUrl,
    timestamp: new Date(timestamp),
    readBy: [senderId], // Mark as read by the sender
  });

  const populatedMessage = await newMessage
    .save()
    .then((msg) =>
      Message.populate(msg, { path: "sender", select: "_id name profileImg" })
    );

  // Prepare the message for emission
  const messageForEmission = populatedMessage.toObject();
  delete messageForEmission.readBy; // Optionally remove sensitive data
  messageForEmission.tempId = tempId;
  // Update the chat session's last message timestamp
  chatSession.lastMessageTimestamp = newMessage.timestamp;
  await chatSession.save();

  // Emit the message to all participants
  if (!isNewSession) {
    // Emit the message to all participants of an existing session
    chatSession.participantIds.forEach((participantId) => {
      const participantSocket = onlineUsers.get(participantId.toString());
      if (participantSocket) {
        io.to(participantSocket.socketId).emit("chat message", {
          message: {
            ...messageForEmission,
            isRead: participantId.toString() === senderId,
          },
          chatId: chatSession._id,
          messageId: newMessage._id,
        });
      }
    });
  } else {
    // If it's a new session, emit "chat session" to involved participants with the first message
    const populatedSession = await ChatSession.findById(
      chatSession._id
    ).populate("participantIds", "name profileImg");

    const messages = [{ ...messageForEmission, isRead: false }]; // Assume the receiver has not read the message

    const conversationInfo = {
      participants: populatedSession.participantIds,
      isGroup: false,
    };

    // Emit to all participants of the new session
    chatSession.participantIds.forEach((participantId) => {
      const participantSocket = onlineUsers.get(participantId.toString());
      if (participantSocket) {
        const isActiveForParticipant =
          participantId.toString() === senderId.toString();
        io.to(participantSocket.socketId).emit("chat session", {
          chatId: populatedSession._id,
          messages,
          conversationInfo,
          lastMessageTimestamp: populatedSession.lastMessageTimestamp,
          setActive: isActiveForParticipant, // This tells the client whether to set this chat as the active one
          isNewChat: isActiveForParticipant && true,
          tempChatId: isActiveForParticipant && `temp-chat-${target}`,
        });
      }
    });
  }
};
const markMessageAsRead = async (messageId, userId) => {
  await Message.updateOne(
    { _id: messageId },
    {
      // Add the userId to the readBy array only if it's not already present
      $addToSet: { readBy: userId },
    }
  );
};

async function editGroup(
  io,
  socket,
  onlineUsers,
  { groupId, groupName, participantIds }
) {
  try {
    const group = await ChatSession.findById(groupId);

    // Check if the current user is the admin of the group
    if (!group.groupInfo.admin.equals(socket.user._id)) {
      socket.emit("error", "Only the group admin can edit the group.");
      return;
    }
    // Identify removed participants before updating the group

    // Update groupName if provided
    if (groupName) {
      group.groupInfo.groupName = groupName;
    }

    // Update participants list if provided
    // Ensure admin remains a participant
    if (!participantIds.includes(group.groupInfo.admin.toString())) {
      participantIds.push(group.groupInfo.admin.toString());
    }

    const currentParticipantIds = group.participantIds.map((id) =>
      id.toString()
    );
    const newParticipantIds = participantIds.map((id) => id.toString());
    const removedParticipants = currentParticipantIds.filter(
      (id) => !newParticipantIds.includes(id)
    );

    group.participantIds = participantIds;

    await group.save();

    // Re-fetch the updated group with populated participant and admin details
    const updatedGroup = await ChatSession.findById(groupId)
      .populate("participantIds", "name profileImg")
      .populate("groupInfo.admin", "name profileImg");

    // Populate the messages for the group
    let messages;
    if (newParticipantIds.length > 0) {
      messages = await Message.find({ chatId: groupId })
        .sort({ timestamp: 1 })
        .populate("sender", "_id name profileImg");

      messages = messages.map((message) => ({
        ...message.toObject(),
        isRead: message.readBy.includes(socket.user._id), // Adjust according to your schema
      }));
    }

    // Construct the updated group information
    const updatedGroupInfo = {
      chatId: updatedGroup._id.toString(),
      lastMessageTimestamp: updatedGroup.lastMessageTimestamp,
      conversationInfo: {
        groupName: updatedGroup.groupInfo.groupName,
        admin: updatedGroup.groupInfo.admin,
        createdAt: updatedGroup.groupInfo.createdAt,
        participants: updatedGroup.participantIds,
        isGroup: true,
        groupImage: updatedGroup.groupInfo.groupImage,
      },
      //   messages, // Assuming you want to send back all messages
    };

    // Notify removed participants
    removedParticipants.forEach((participantId) => {
      const removedParticipantSocket = onlineUsers.get(participantId);
      if (removedParticipantSocket) {
        io.to(removedParticipantSocket.socketId).emit("removed from group", {
          chatId: groupId,
        });
      }
    });
    // Emit the updated group information to all participants
    updatedGroup.participantIds.forEach((participant) => {
      const participantSocket = onlineUsers.get(participant._id.toString());
      if (participantSocket) {
        if (newParticipantIds.includes(participant._id.toString())) {
          io.to(participantSocket.socketId).emit("group updated", {
            ...updatedGroupInfo,
            messages,
          });
        } else {
          io.to(participantSocket.socketId).emit(
            "group updated",
            updatedGroupInfo
          );
        }
      }
    });
  } catch (error) {
    console.error("Error editing group:", error);
    socket.emit("error", "Failed to edit group due to server error.");
  }
}
async function handleExitGroup(io, socket, onlineUsers, { groupId }) {
  try {
    const group = await ChatSession.findById(groupId);

    if (!group) {
      socket.emit("error", "Group not found.");
      return;
    }

    const currentUser = socket.user._id.toString();
    const isAdmin = group.groupInfo.admin.toString() === currentUser;

    // Remove the current user from the participant list
    group.participantIds = group.participantIds.filter(
      (participantId) => participantId.toString() !== currentUser
    );

    // Handle the case where the current user is the admin
    if (isAdmin) {
      if (group.participantIds.length > 0) {
        // Assign a new admin from the remaining participants
        group.groupInfo.admin = group.participantIds[0];
      } else {
        // If no participants are left, delete the group
        await ChatSession.deleteOne({ _id: groupId });
        // Emit an event to inform the admin that the group has been deleted
        socket.emit("removed from group", {
          chatId: groupId,
        });
        return;
      }
    }

    await group.save();

    // Emit an event to inform the user has been removed or left the group
    socket.emit("removed from group", {
      chatId: groupId,
    });

    // Notify all remaining participants about the group update
    const updatedGroup = await group.populate([
      { path: "participantIds", select: "name profileImg" },
      { path: "groupInfo.admin", select: "name profileImg" },
    ]);
    const updatedGroupInfo = {
      chatId: updatedGroup._id.toString(),
      lastMessageTimestamp: updatedGroup.lastMessageTimestamp,
      conversationInfo: {
        groupName: updatedGroup.groupInfo.groupName,
        admin: updatedGroup.groupInfo.admin,
        createdAt: updatedGroup.groupInfo.createdAt,
        participants: updatedGroup.participantIds,
        isGroup: true,
        groupImage: updatedGroup.groupInfo.groupImage,
      },
    };
    updatedGroup.participantIds.forEach((participant) => {
      const participantSocket = onlineUsers.get(participant._id.toString());
      if (participantSocket) {
        io.to(participantSocket.socketId).emit(
          "group updated",
          updatedGroupInfo
        );
      }
    });
  } catch (error) {
    console.error("Error handling exit from group:", error);
    socket.emit("error", "Failed to leave group due to server error.");
  }
}

async function editGroupImg(io, socket, onlineUsers, { groupId, url }) {
  try {
    const group = await ChatSession.findById(groupId);

    // Check if the current user is the admin of the group
    if (!group.groupInfo.admin.equals(socket.user._id)) {
      socket.emit("error", "Only the group admin can edit the group.");
      return;
    }
    const oldImageUrl = group.groupInfo.groupImage;
    group.groupInfo.groupImage = url;

    await group.save();
    if (
      oldImageUrl &&
      oldImageUrl !== url &&
      oldImageUrl !==
        "https://storage.googleapis.com/blog_bucket_12/jive-sgroup-default-portrait-large.png"
    ) {
      markImageForRemoval(oldImageUrl, groupId)
        .then(() => console.log(`Marked old image for removal: ${oldImageUrl}`))
        .catch((err) =>
          console.error(`Failed to mark old image for removal: ${err}`)
        );
    }
    // Re-fetch the updated group with populated participant and admin details
    const updatedGroup = await ChatSession.findById(groupId)
      .populate("participantIds", "name profileImg")
      .populate("groupInfo.admin", "name profileImg");

    // Populate the messages for the group
    let messages = await Message.find({ chatId: groupId })
      .sort({ timestamp: 1 })
      .populate("sender", "_id name profileImg");

    messages = messages.map((message) => ({
      ...message.toObject(),
      isRead: message.readBy.includes(socket.user._id), // Adjust according to your schema
    }));

    // Construct the updated group information
    const updatedGroupInfo = {
      chatId: updatedGroup._id.toString(),
      lastMessageTimestamp: updatedGroup.lastMessageTimestamp,
      conversationInfo: {
        groupName: updatedGroup.groupInfo.groupName,
        admin: updatedGroup.groupInfo.admin,
        createdAt: updatedGroup.groupInfo.createdAt,
        participants: updatedGroup.participantIds,
        isGroup: true,
        groupImage: updatedGroup.groupInfo.groupImage,
      },
      messages, // Assuming you want to send back all messages
    };

    // Emit the updated group information to all participants
    updatedGroup.participantIds.forEach((participant) => {
      const participantSocket = onlineUsers.get(participant._id.toString());
      if (participantSocket) {
        io.to(participantSocket.socketId).emit(
          "group updated",
          updatedGroupInfo
        );
      }
    });
  } catch (error) {
    console.error("Error editing group:", error);
    socket.emit("error", "Failed to edit group due to server error.");
  }
}

// Simplified and unified approach for message handling
const handleMessage = async (msg, isGroup, onlineUsers, io) => {
  const { senderId, chatId, content } = msg;
  let chatSession;

  if (isGroup) {
    chatSession = await ChatSession.findById(chatId);
  } else {
    // This handles creating or finding a session for private messages
    chatSession = await ChatSession.findOneAndUpdate(
      { participantIds: { $all: [senderId, msg.target] }, isGroup: false },
      {
        $setOnInsert: {
          participantIds: [senderId, msg.target],
          isGroup: false,
        },
      },
      { new: true, upsert: true }
    );
  }

  const message = new Message({ senderId, content, chatId: chatSession._id });
  await message.save();

  chatSession.lastMessageTimestamp = new Date();
  await chatSession.save();

  // Emitting message to participants
  chatSession.participantIds.forEach((participantId) => {
    const participantSocket = onlineUsers.get(participantId.toString());
    if (participantSocket && participantId.toString() !== senderId.toString()) {
      io.to(participantSocket.socketId).emit("chat message", {
        ...msg,
        chatId: chatSession._id,
      });
    }
  });
};

module.exports = {
  emitUserStatusChange,
  fetchAndEmitUserList,
  fetchAndEmitChatSessions,
  handleChatMessage,
  markMessageAsRead,
  createGroup,
  editGroup,
  handleMessage,
  editGroupImg,
  handleExitGroup,
};
