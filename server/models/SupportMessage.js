const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SupportMessage', supportMessageSchema);
