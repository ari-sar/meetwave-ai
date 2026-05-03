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
    console.log(`⏳ Analyzing portrait and generating 3 preview images...`);

    // Generate preview (3 images)
    const result = await generatePreview(tempFilePath);

    console.log(`✅ Generated ${result.previews.length} preview images`);
    console.log(`⏳ Updating user rate limit session...`);

    req.sessionData.freeCount += 1;
    await req.sessionData.save();

    // Cache the portrait for paid generation later
    portraitCache.set(result.sessionId, {
      portraitPath: tempFilePath,
      ratings: result.ratings,
      timestamp: Date.now()
    });

    console.log(`✅ Request complete. Sending previews + metadata to frontend.`);
    res.json({
      sessionId: result.sessionId,
      previews: result.previews,
      allStyles: result.allStyles,
      ratings: result.ratings,
      bestMatch: result.bestMatch,
      tips: result.tips
    });

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

    const cachedData = portraitCache.get(sessionId);
    const portraitPath = cachedData.portraitPath;
    const ratings = cachedData.ratings;

    console.log(`⏳ Generating remaining 9 images for session ${sessionId}...`);

    const fullImages = await generateFull(portraitPath, sessionId, ratings);

    console.log(`✅ Generated ${fullImages.length} additional images`);
    console.log(`🧹 Cleaning up portrait cache...`);

    // Clean up portrait and cache after full generation
    if (fs.existsSync(portraitPath)) {
      fs.unlinkSync(portraitPath);
    }
    portraitCache.delete(sessionId);

    res.json({ previews: fullImages });

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
      if (fs.existsSync(data.portraitPath)) {
        fs.unlinkSync(data.portraitPath);
      }
      portraitCache.delete(sessionId);
      console.log(`🧹 Cleaned up expired session: ${sessionId}`);
    }
  }
}, 300000); // Check every 5 minutes

module.exports = router;