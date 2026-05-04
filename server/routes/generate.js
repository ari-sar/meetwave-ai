const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const rateLimiter = require("../middleware/rateLimiter");
const { generatePreview } = require("../utils/image");

const router = express.Router();
const upload = multer({ dest: os.tmpdir() });

router.post("/", rateLimiter, upload.single("image"), async (req, res) => {
  console.log(`\n--- [NEW REQUEST] Generate API Triggered ---`);

  let tempFilePath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    console.log(`✅ File received: ${req.file.originalname}`);

    const result = await generatePreview(tempFilePath);

    req.sessionData.freeCount += 1;
    if (typeof req.sessionData.save === "function") {
      req.sessionData.lastSessionId = result.sessionId;
      await req.sessionData.save();
    }

    // Always persist sessionId so /api/payment/confirm + /api/verify can resolve it (dev mode bypasses rate limiter).
    const Session = require("../models/Session");
    await Session.findOneAndUpdate(
      { lastSessionId: result.sessionId },
      { lastSessionId: result.sessionId },
      { upsert: true }
    );

    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    res.json(result);

  } catch (err) {
    console.error("❌ Generation Route Error:", err.message);
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    res.status(500).json({ error: err.message || "AI generation failed" });
  }
});

module.exports = router;
