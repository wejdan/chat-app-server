const mongoose = require("mongoose");

const chatSessionSchema = new mongoose.Schema({
  participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  isGroup: {
    type: Boolean,
    default: false, // Most chat sessions are not groups by default
  },
  groupInfo: {
    groupName: String,
    groupImage: {
      type: String,
      default:
        "https://storage.googleapis.com/blog_bucket_12/jive-sgroup-default-portrait-large.png", // Set the default group image URL here
    },
    createdAt: {
      type: Date,
      default: Date.now, // Set to the current time when a new chat session is created
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  lastMessageTimestamp: {
    type: Date,
    default: Date.now, // Set to the current time when a new chat session is created
  },
  lastRead: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      timestamp: Date,
    },
  ],
  // You can still include other fields as necessary
});

const ChatSession = mongoose.model("ChatSession", chatSessionSchema);
module.exports = ChatSession;
