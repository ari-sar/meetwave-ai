const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const Session = require("../models/Session");
const { generateHash } = require("../utils/hash");

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const AMOUNT_PAISE = 4900;

router.post("/create-order", async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });

    const order = await razorpay.orders.create({
      amount: AMOUNT_PAISE,
      currency: "INR",
      notes: { sessionId }
    });

    await Session.findOneAndUpdate(
      { lastSessionId: sessionId },
      { lastSessionId: sessionId, razorpayOrderId: order.id },
      { upsert: true }
    );

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("Order creation failed:", error.message);
    res.status(500).json({ error: "Order creation failed" });
  }
});

// Client-side success handler from Checkout — verifies razorpay signature on (order_id|payment_id).
router.post("/confirm", async (req, res) => {
  try {
    const { sessionId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!sessionId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment fields" });
    }

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const session = await markSessionPaid(sessionId);
    res.json({ downloadToken: session.downloadToken });
  } catch (error) {
    console.error("Payment confirm error:", error.message);
    res.status(500).json({ error: "Payment confirmation failed" });
  }
});

// Razorpay webhook — server-side source of truth. Mounted with raw body in server/index.js.
async function webhookHandler(req, res) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.body; // Buffer (because of express.raw)
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (signature !== expected) {
      console.warn("⚠️ Webhook signature mismatch");
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const event = payload.event;

    if (event === "payment.captured") {
      const sessionId = payload?.payload?.payment?.entity?.notes?.sessionId;
      if (!sessionId) {
        console.warn("⚠️ Webhook missing notes.sessionId");
        return res.status(200).send("ok");
      }
      await markSessionPaid(sessionId);
      console.log(`✓ Webhook: session ${sessionId} marked paid`);
    } else {
      console.log(`Webhook event ignored: ${event}`);
    }

    res.status(200).send("ok");
  } catch (error) {
    console.error("Webhook error:", error.message);
    res.status(500).send("error");
  }
}

async function markSessionPaid(sessionId) {
  const existing = await Session.findOne({ lastSessionId: sessionId });
  if (existing && existing.paid && existing.downloadToken) return existing;

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET env var required");
  }
  const downloadToken = generateHash(`${sessionId}:${Date.now()}:${process.env.JWT_SECRET}`);
  const tokenIssuedAt = new Date();

  return Session.findOneAndUpdate(
    { lastSessionId: sessionId },
    { lastSessionId: sessionId, paid: true, downloadToken, tokenIssuedAt },
    { upsert: true, new: true }
  );
}

// GET /api/payment/status/:sessionId — SPA polls this after payment button interaction.
router.get("/status/:sessionId", async (req, res) => {
  try {
    const session = await Session.findOne({ lastSessionId: req.params.sessionId }).lean();
    if (!session) return res.json({ paid: false });
    if (session.paid && session.downloadToken) {
      return res.json({ paid: true, downloadToken: session.downloadToken });
    }
    res.json({ paid: false });
  } catch (err) {
    res.status(500).json({ error: "Status check failed" });
  }
});

module.exports = router;
module.exports.webhookHandler = webhookHandler;
