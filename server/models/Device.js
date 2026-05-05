const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  fingerprint: { type: String, required: true, index: true },
  ip: { type: String, required: true },
  isLocked: { type: Boolean, default: false },
  unpaidJobId: { type: String, default: null } // Stores the job ID they need to pay for
}, { timestamps: true }); // Tracks when they first visited and last interacted

module.exports = mongoose.model('Device', deviceSchema);