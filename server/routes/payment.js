const express = require("express");
const router = express.Router();
const Session = require("../models/Session");
const { generateHash } = require("../utils/hash");

router.post("/create-intent", async (req, res) => {
  try {
    // TODO(razorpay): create a real order via Razorpay Orders API
    res.status(200).json({
      orderId: "order_mock_" + Date.now(),
      amount: 1900,
      currency: "INR"
    });
  } catch (error) {
    res.status(500).json({ message: "Order creation failed" });
  }
});

router.post("/confirm", async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });

    // TODO(razorpay): verify razorpay_signature with HMAC-SHA256(orderId|paymentId, key_secret)

    const tokenInput = `${sessionId}:${Date.now()}:${process.env.JWT_SECRET || "dev-secret"}`;
    const downloadToken = generateHash(tokenInput);
    const tokenIssuedAt = new Date();

    await Session.findOneAndUpdate(
      { lastSessionId: sessionId },
      { lastSessionId: sessionId, paid: true, downloadToken, tokenIssuedAt },
      { upsert: true, new: true }
    );

    res.json({ downloadToken });
  } catch (error) {
    console.error("Payment confirm error:", error.message);
    res.status(500).json({ error: "Payment confirmation failed" });
  }
});

module.exports = router;
