const mongoose = require("mongoose");
const fileMetadataSchema = new mongoose.Schema(
  {
    name: String,
    size: Number,
    type: String,
    url: String,
  },
  { _id: false }
); // Optionally disable _id if not needed for embedded document

const effectSchema = new mongoose.Schema(
  {
    isUser: {
      type: Boolean,
      default: false,
    },
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    data: {
      type: String, // Can store any type of data if isUser is false
    },
  },
  { _id: false }
); // Disable _id for subdocument if not needed
const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "ChatSession", // Assuming you have a ChatSession model
  },

  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Reference to User model
  },
  target: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Optional; Reference to User model, useful in direct messages
  },
  type: {
    type: String,
    required: true,
    enum: ["text", "image", "system", "file"],
    default: "text", // Default type is set to 'text'
  },
  content: {
    type: String,
    required: function () {
      return this.type === "text";
    }, // Make content required only if imageUrl is not provided
  },
  imageUrl: {
    type: String,
    required: function () {
      return this.type === "image";
    }, // Make imageUrl required only if content is not provided
  },
  fileMetadata: fileMetadataSchema,
  tempId: {
    type: String,
    // Make content required only if imageUrl is not provided
  },
  action: {
    type: String,
  },
  effect: {
    type: effectSchema,
    required: false, // Assuming effect is optional
  },

  timestamp: {
    type: Date,
    default: Date.now,
  },
  read: {
    type: Boolean,
    default: false, // Message is unread by default
  },
  height: {
    type: Number,
  },
  readBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
});
messageSchema.post("find", async function (docs) {
  for (let doc of docs) {
    await doc.populate({
      path: "sender",
      select: "_id name profileImg",
    });
    if (doc.type === "system" && doc.effect?.isUser) {
      // Use await on populate() directly
      await doc.populate({
        path: "effect.users",
        select: "_id name profileImg",
      });
    }
  }
});

messageSchema.post("findOne", async function (doc) {
  if (doc) {
    await doc.populate({
      path: "sender",
      select: "_id name profileImg",
    });

    if (doc.type === "system" && doc.effect?.isUser) {
      await doc.populate({
        path: "effect.users",
        select: "_id name profileImg",
      });
    }
  }
});
module.exports = mongoose.model("Message", messageSchema);
