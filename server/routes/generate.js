const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const rateLimiter = require("../middleware/rateLimiter");
const { generatePreview, generateFull } = require("../utils/image");

const router = express.Router();
const upload = multer({ dest: os.tmpdir() });

// Store portrait references per session (temp storage)
const portraitCache = new Map();

router.post("/", rateLimiter, upload.single("image"), async (req, res) => {
  console.log(`\n--- [NEW REQUEST] Generate API Triggered (Free Tier) ---`);

  let tempFilePath = req.file?.path;

  try {
    if (!req.file) {
      console.log("❌ No file found in request.");
      return res.status(400).json({ error: "No image uploaded" });
    }

    console.log(`✅ File received: ${req.file.originalname}`);
    console.log(`⏳ Analyzing portrait and generating fixed-style preview...`);

    const result = await generatePreview(tempFilePath);

    console.log(`✅ Generated free preview (${result.previewStyle})`);

    req.sessionData.freeCount += 1;
    await req.sessionData.save();

    portraitCache.set(result.sessionId, {
      portraitPath: tempFilePath,
      preparedPath: result.preparedPath,
      timestamp: Date.now()
    });

    res.json(result);

  } catch (err) {
    console.error("❌ Generation Route Error:", err.message);

    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    res.status(500).json({ error: err.message || "AI generation failed" });
  }
});

// Paid tier: Generate remaining 9 images
router.post("/full", async (req, res) => {
  console.log(`\n--- [NEW REQUEST] Generate Full API Triggered (Paid Tier) ---`);

  const { sessionId } = req.body;

  try {
    if (!sessionId || !portraitCache.has(sessionId)) {
      console.log("❌ Invalid or expired session.");
      return res.status(400).json({ error: "Session expired. Please upload again." });
    }

    const { portraitPath, preparedPath } = portraitCache.get(sessionId);

    console.log(`⏳ Generating comparison card for session ${sessionId} (reusing prepared image)...`);

    const result = await generateFull(preparedPath, sessionId);

    console.log(`✅ Comparison card generated`);
    console.log(`🧹 Cleaning up portrait cache...`);

    if (portraitPath && fs.existsSync(portraitPath)) fs.unlinkSync(portraitPath);
    if (preparedPath && preparedPath !== portraitPath && fs.existsSync(preparedPath)) fs.unlinkSync(preparedPath);
    portraitCache.delete(sessionId);

    res.json(result);

  } catch (err) {
    console.error("❌ Full Generation Error:", err.message);
    res.status(500).json({ error: err.message || "Full generation failed" });
  }
});

// Cleanup old cache entries (older than 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of portraitCache.entries()) {
    if (now - data.timestamp > 3600000) {
      if (data.portraitPath && fs.existsSync(data.portraitPath)) fs.unlinkSync(data.portraitPath);
      if (data.preparedPath && data.preparedPath !== data.portraitPath && fs.existsSync(data.preparedPath)) fs.unlinkSync(data.preparedPath);
      portraitCache.delete(sessionId);
      console.log(`🧹 Cleaned up expired session: ${sessionId}`);
    }
  }
}, 300000); // Check every 5 minutes

module.exports = router;