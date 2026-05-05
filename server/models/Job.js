const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
  sessionId: { type: String, index: true },
  status: { type: String, enum: ["queued", "running", "done", "failed"], default: "queued" },
  stage: { type: String, default: "queued" },
  result: { type: mongoose.Schema.Types.Mixed },
  error: String,
  fingerprint: String,
  ip: String,
  createdAt: { type: Date, default: Date.now },
  finishedAt: Date
});

module.exports = mongoose.model("Job", jobSchema);
