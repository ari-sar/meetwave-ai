const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generatePreview } = require("../utils/image");
const Job = require("../models/Job");
const Session = require("../models/Session");
const Device = require("../models/Device"); // Import persistent device model
const rateLimiter = require("../middleware/rateLimiter"); // Import the rate limiter

const router = express.Router();

// 1. Setup Multer limits
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, or WEBP images are allowed"));
  }
});

// 2. Wrap Multer to catch file size/type errors as valid JSON
const handleUpload = (req, res, next) => {
  const uploadSingle = upload.single("image");
  uploadSingle(req, res, function (err) {
    if (err) {
      console.error(`[${new Date().toISOString()}] ❌ UPLOAD ERROR [${req.ip}]:`, err.stack || err);
      return res.status(400).json({ error: err.message || "File upload failed" });
    }
    next();
  });
};

// GET /api/generate/session-check — Checks if user is persistently locked
router.get("/session-check", async (req, res) => {
  const fingerprint = req.headers['x-fingerprint'];
  const ip = req.ip;

  if (!fingerprint) return res.json({ locked: false });

  try {
    const device = await Device.findOne({ fingerprint, ip });
    if (device && device.isLocked) {
      return res.json({ locked: true, lastJobId: device.unpaidJobId });
    }
    res.json({ locked: false });
  } catch (err) {
    console.error("Session check failed:", err);
    res.status(500).json({ error: "Session check failed" });
  }
});

// POST /api/generate — accepts image, queues job, locks device
router.post("/", handleUpload, rateLimiter, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  
  const tempFilePath = req.file.path;
  const fingerprint = req.headers["x-fingerprint"] || "unknown";

  try {
    const job = await Job.create({
      status: "queued",
      stage: "queued",
      fingerprint: fingerprint,
      ip: req.ip
    });

    // PERMANENT LOCK: Lock the device immediately upon generation
    await Device.findOneAndUpdate(
      { fingerprint, ip: req.ip },
      { $set: { isLocked: true, unpaidJobId: job._id.toString() } },
      { upsert: true, new: true }
    );

    console.log(`[${new Date().toISOString()}] 🚀 QUEUED [Job: ${job._id}] - IP: ${req.ip}`);

    // Fire-and-forget
    setImmediate(() => runJob(job._id.toString(), tempFilePath, req.sessionData));

    res.status(202).json({ jobId: job._id.toString() });
  } catch (err) {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
    console.error(`[${new Date().toISOString()}] ❌ QUEUE ERROR [${req.ip}]:`, err.stack);
    res.status(500).json({ error: "Could not queue job" });
  }
});

// GET /api/generate/status/:jobId
router.get("/status/:jobId", async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId).lean();
    if (!job) return res.status(404).json({ error: "Job not found" });

    const body = { status: job.status, stage: job.stage };
    if (job.status === "done") body.result = job.result;
    if (job.status === "failed") body.error = job.error;
    res.json(body);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ STATUS ERROR [Job: ${req.params.jobId}]:`, err.stack);
    res.status(500).json({ error: "Status lookup failed" });
  }
});

async function runJob(jobId, tempFilePath, sessionData) {
  try {
    await Job.findByIdAndUpdate(jobId, { status: "running", stage: "analyzing" });

    const result = await generatePreview(tempFilePath, async (stage) => {
      await Job.findByIdAndUpdate(jobId, { stage });
    });

    await Session.findOneAndUpdate(
      { lastSessionId: result.sessionId },
      { lastSessionId: result.sessionId },
      { upsert: true }
    );

    await Job.findByIdAndUpdate(jobId, {
      status: "done",
      stage: "done",
      result,
      finishedAt: new Date()
    });
    console.log(`[${new Date().toISOString()}] ✅ JOB SUCCESS [Job: ${jobId}]`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] 🚨 JOB CRASH [Job: ${jobId}]:\n`, err.stack);
    await Job.findByIdAndUpdate(jobId, {
      status: "failed",
      stage: "failed",
      error: err.message || "Generation failed",
      finishedAt: new Date()
    }).catch(e => console.error("Fatal status update fail:", e));
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
  }
}

module.exports = router;