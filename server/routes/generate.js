const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os"); // Added OS module to access the system temp folder
const rateLimiter = require("../middleware/rateLimiter");
const { generatePreview } = require("../utils/image");

const router = express.Router();

// CRITICAL FIX: Save uploads to the computer's invisible temp folder
// This prevents VS Code Live Server from detecting file changes and refreshing the page!
const upload = multer({ dest: os.tmpdir() });

router.post("/", rateLimiter, upload.single("image"), async (req, res) => {
  console.log(`\n--- [NEW REQUEST] Generate API Triggered ---`);
  
  try {
    if (!req.file) {
      console.log("❌ [Backend] Upload failed: No file found in request.");
      return res.status(400).json({ error: "No image uploaded" });
    }

    console.log(`✅ [Backend] File successfully received: ${req.file.originalname}`);
    console.log(`✅ [Backend] Temporarily saved outside project folder to avoid Live Server refresh.`);
    console.log(`⏳ [Backend] Calling AI Generation Utility...`);

    // Pass the file path to our OpenAI DALL-E 2 utility
    const aiImageUrls = await generatePreview(req.file.path);

    console.log(`✅ [Backend] AI Utility returned ${aiImageUrls.length} images.`);

    if (aiImageUrls.length === 0) {
      throw new Error("AI Utility returned an empty array.");
    }

    console.log(`⏳ [Backend] Updating user rate limit session...`);
    req.sessionData.freeCount += 1;
    await req.sessionData.save();

    console.log(`🧹 [Backend] Cleaning up temporary image file...`);
    fs.unlinkSync(req.file.path);

    console.log(`✅ [Backend] Request complete. Sending URLs to frontend.`);
    res.json({ previews: aiImageUrls });

  } catch (err) {
    console.error("❌ [CRASH] Generation Route Error:", err.message);
    
    // Ensure we delete the file even if generation fails to prevent disk bloat
    if (req.file && fs.existsSync(req.file.path)) {
      console.log(`🧹 [Backend] Crash cleanup: Deleting temporary file...`);
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: err.message || "AI generation failed" });
  }
});

module.exports = router;