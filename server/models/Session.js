const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  ip: String,
  fingerprint: String,
  lastGeneratedAt: { type: Date, default: null },
  paid: { type: Boolean, default: false },
  downloadToken: String,
  tokenIssuedAt: Date,
  lastSessionId: String,
  razorpayOrderId: String,
  createdAt: { type: Date, default: Date.now }
});

sessionSchema.index({ ip: 1, fingerprint: 1 });
sessionSchema.index({ lastSessionId: 1 });
sessionSchema.index({ downloadToken: 1 });

module.exports = mongoose.model("Session", sessionSchema);
