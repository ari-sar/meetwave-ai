const express = require("express");
const path = require("path");
const fs = require("fs");
const Session = require("../models/Session");

const router = express.Router();
const TOKEN_TTL_MS = 60 * 60 * 1000;

router.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const session = await Session.findOne({ downloadToken: token });

    if (!session || !session.paid) return res.status(403).json({ error: "Invalid token" });
    if (Date.now() - new Date(session.tokenIssuedAt).getTime() > TOKEN_TTL_MS) {
      return res.status(403).json({ error: "Token expired" });
    }

    const filePath = path.resolve("uploads", "generated", session.lastSessionId, "comparison.png");
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

    res.setHeader("Content-Disposition", 'attachment; filename="meetwave-styles.png"');
    res.setHeader("Content-Type", "image/png");
    res.sendFile(filePath);
  } catch (error) {
    console.error("Verify error:", error.message);
    res.status(500).json({ error: "Verification failed" });
  }
});

module.exports = router;
