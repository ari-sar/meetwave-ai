const express = require("express");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const Session = require("../models/Session");

const router = express.Router();
const TOKEN_TTL_MS = 60 * 60 * 1000;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

router.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const session = await Session.findOne({ downloadToken: token });

    if (!session || !session.paid) return res.status(403).json({ error: "Invalid token" });
    if (Date.now() - new Date(session.tokenIssuedAt).getTime() > TOKEN_TTL_MS) {
      return res.status(403).json({ error: "Token expired" });
    }

    const r2Key = `generated/${session.lastSessionId}/comparison.png`;
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: r2Key
    });

    const { Body, ContentLength } = await s3.send(command);

    res.setHeader("Content-Disposition", 'attachment; filename="meetwave-styles.png"');
    res.setHeader("Content-Type", "image/png");
    if (ContentLength) res.setHeader("Content-Length", ContentLength);

    Body.pipe(res);
  } catch (error) {
    console.error("Verify error:", error.message);
    if (error.name === "NoSuchKey") return res.status(404).json({ error: "File not found" });
    res.status(500).json({ error: "Verification failed" });
  }
});

module.exports = router;
