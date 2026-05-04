const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  ip: String,
  fingerprint: String,
  freeCount: { type: Number, default: 0 },
  paid: { type: Boolean, default: false },
  downloadToken: String,
  tokenIssuedAt: Date,
  lastSessionId: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Session", sessionSchema);
