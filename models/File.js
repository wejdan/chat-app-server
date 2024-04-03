const mongoose = require("mongoose");

// Define the schema
const fileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  publicUrl: {
    type: String,
    required: true,
  },
  timeCreated: {
    type: Date,
    required: true,
  },
});

// Create a model from the schema
const File = mongoose.model("File", fileSchema);

module.exports = File;
