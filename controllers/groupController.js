const ChatSession = require("../models/ChatSession");
const Message = require("../models/Message");
const { emitGroupUpdate } = require("../utils/chat/groupUtils");
const {
  constructChatMessagePayload,
  constructChatSessionPayload,
  getAllMessgesForChat,
  sendSystemNotification,
} = require("../utils/chat/messageUtils");
const { markImageForRemoval } = require("../utils/imgs");

exports.createGroup = async (context, { groupName, participantIds }) => {
  const { io, socket, onlineUsers, user } = context;
  const notifcations = [];

  try {
    // Ensure the admin is part of the group
    if (!participantIds.includes(user._id.toString())) {
      participantIds.push(user._id.toString());
    }
    let newGroup = new ChatSession({
      isGroup: true,
      participantIds,
      groupInfo: {
        groupName,
        admin: user._id,
        createdAt: new Date(),
      },
      lastMessageTimestamp: new Date(),
    });

    // Save the new group
    await newGroup.save();

    // Now, populate admin and participantIds
    newGroup = await ChatSession.findById(newGroup._id)
      .populate("participantIds", "name profileImg") // Assuming you want to populate name and profileImg for participants
      .populate("groupInfo.admin", "name profileImg"); // As

    // Emit event to the group participants that a new group has been created
    const chatInfo = constructChatSessionPayload(newGroup, user, false);
    participantIds.forEach((participantId) => {
      const participant = onlineUsers.get(participantId);
      if (participant) {
        io.to(participant.socketId).emit("group created", {
          ...chatInfo,
          messages: [],
        });
      }
    });

    notifcations.push({
      sender: user._id,
      action: "Created group ",
      effect: { isUser: false, data: groupName },
    });
    await sendSystemNotification(context, newGroup._id, notifcations);
  } catch (error) {
    console.error("Error in createGroup:", error);
    // Optionally, process the error based on its type or message
    // Then rethrow or directly handle the error as needed
    throw error; // Ensures it's caught by asyncErrorHandler
  }
};
exports.editGroup = async (context, { groupId, groupName, participantIds }) => {
  const { io, socket, onlineUsers, user } = context;

  try {
    const notifcations = [];
    const group = await ChatSession.findById(groupId);

    // Check if the current user is the admin of the group
    if (!group.groupInfo.admin.equals(socket.user._id)) {
      throw new Error("Only the group admin can edit the group.");
    }
    // Identify removed participants before updating the group

    // Update groupName if provided
    if (groupName && group.groupInfo.groupName !== groupName) {
      group.groupInfo.groupName = groupName;
      notifcations.push({
        sender: user._id,
        action: "changed group name to",
        effect: { isUser: false, data: groupName },
      });
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
    const addedParticipants = newParticipantIds.filter(
      (id) => !currentParticipantIds.includes(id)
    );
    group.participantIds = participantIds;

    if (removedParticipants.length > 0) {
      notifcations.push({
        sender: user._id,
        action: "removed ",
        effect: { isUser: true, users: removedParticipants },
      });
    }

    if (addedParticipants.length > 0) {
      notifcations.push({
        sender: user._id,
        action: "added ",
        effect: { isUser: true, users: addedParticipants },
      });
    }
    await group.save();

    // Re-fetch the updated group with populated participant and admin details
    const updatedGroup = await ChatSession.findById(groupId)
      .populate("participantIds", "name profileImg")
      .populate("groupInfo.admin", "name profileImg");

    removedParticipants.forEach((participantId) => {
      const removedParticipantSocket = onlineUsers.get(participantId);
      if (removedParticipantSocket) {
        io.to(removedParticipantSocket.socketId).emit("removed from group", {
          chatId: groupId,
        });
      }
    });
    // Emit the updated group information to all participants

    // Populate the messages for the group
    await emitGroupUpdate(context, updatedGroup, addedParticipants);
    await sendSystemNotification(context, updatedGroup._id, notifcations);
  } catch (error) {
    console.error("Error in editGroup:", error);
    // Optionally, process the error based on its type or message
    // Then rethrow or directly handle the error as needed
    throw error; // Ensures it's caught by asyncErrorHandler
  }
};
exports.handleExitGroup = async (context, { groupId }) => {
  const group = await ChatSession.findById(groupId);
  const { io, socket, onlineUsers, user } = context;
  const notifcations = [];

  try {
    if (!group) {
      throw new Error("Group not found.");
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
    notifcations.push({
      sender: user._id,
      action: "left group",
      effect: { isUser: false, data: "" },
    });

    // Emit an event to inform the user has been removed or left the group
    socket.emit("removed from group", {
      chatId: groupId,
    });

    // Notify all remaining participants about the group update
    const updatedGroup = await group.populate([
      { path: "participantIds", select: "name profileImg" },
      { path: "groupInfo.admin", select: "name profileImg" },
    ]);

    await sendSystemNotification(context, updatedGroup._id, notifcations);
    await emitGroupUpdate(context, updatedGroup);
  } catch (error) {
    console.error("Error in exitGroup:", error);
    // Optionally, process the error based on its type or message
    // Then rethrow or directly handle the error as needed
    throw error; // En
  }
};

exports.HandleUpdateGroupImg = async (context, { groupId, url }) => {
  const { io, socket, onlineUsers, user } = context;
  try {
    const notifcations = [];

    const group = await ChatSession.findById(groupId);

    // Check if the current user is the admin of the group
    if (!group.groupInfo.admin.equals(socket.user._id)) {
      throw new Error("Only the group admin can edit the group.");
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

    // Construct the updated group information
    notifcations.push({
      sender: user._id,
      action: "Changed group image",
      effect: { isUser: false, data: "" },
    });
    await sendSystemNotification(context, updatedGroup._id, notifcations);
    // Emit the updated group information to all participants

    await emitGroupUpdate(context, updatedGroup);
  } catch (error) {
    console.error("Error in updateGroupImg:", error);
    // Optionally, process the error based on its type or message
    // Then rethrow or directly handle the error as needed
    throw error; // Ensur
  }
};
