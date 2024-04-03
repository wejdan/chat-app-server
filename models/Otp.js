const mongoose = require("mongoose");
const { Schema } = mongoose;

const otpSchema = new Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: { expires: "5m" } }, // Documents will expire 5 minutes from createdAt
});

// Create the model from the schema
const Otp = mongoose.model("Otp", otpSchema);
module.exports = Otp;
