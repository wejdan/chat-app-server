const mongoose = require("mongoose");
const { Schema } = mongoose;

const imageSchema = new Schema({
  imageUrl: {
    type: String,
    required: true,
  },
  referenceId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  markedAt: {
    type: Date,
    default: Date.now,
  },
});

const ImageForRemoval = mongoose.model("ImageForRemoval", imageSchema);

module.exports = ImageForRemoval;
