const express = require('express');
const SupportMessage = require('../models/SupportMessage');

const router = express.Router();

router.post('/', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Phone and message required' });
  }

  try {
    const supportMsg = new SupportMessage({ phone, message });
    await supportMsg.save();
    res.status(201).json({ success: true, message: 'Message received' });
  } catch (err) {
    console.error('Support message error:', err);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

module.exports = router;
