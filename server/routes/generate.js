const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generatePreview } = require("../utils/image");
const Job = require("../models/Job");
const Session = require("../models/Session");

const router = express.Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, or WEBP images are allowed"));
  }
});

// POST /api/generate — accepts image, queues job, returns immediately.
router.post("/", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  const tempFilePath = req.file.path;

  try {
    const job = await Job.create({
      status: "queued",
      stage: "queued",
      fingerprint: req.headers["x-fingerprint"] || "unknown",
      ip: req.ip
    });

    // Fire-and-forget. Connection returns immediately.
    setImmediate(() => runJob(job._id.toString(), tempFilePath, req.sessionData));

    res.status(202).json({ jobId: job._id.toString() });
  } catch (err) {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
    console.error("Queue error:", err.message);
    res.status(500).json({ error: "Could not queue job" });
  }
});

// GET /api/generate/status/:jobId — client polls this every 3s.
router.get("/status/:jobId", async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId).lean();
    if (!job) return res.status(404).json({ error: "Job not found" });

    const body = { status: job.status, stage: job.stage };
    if (job.status === "done") body.result = job.result;
    if (job.status === "failed") body.error = job.error;
    res.json(body);
  } catch (err) {
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
  } catch (err) {
    console.error(`❌ Job ${jobId} failed:`, err.message);
    await Job.findByIdAndUpdate(jobId, {
      status: "failed",
      stage: "failed",
      error: err.message || "Generation failed",
      finishedAt: new Date()
    });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
  }
}

module.exports = router;
