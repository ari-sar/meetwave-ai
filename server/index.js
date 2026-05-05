require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");

const app = express();
const isProd = process.env.NODE_ENV === "production";

// Behind nginx/Cloudflare — preserve client IP for rate limiter.
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false,            // CDN scripts (Razorpay, fonts) need this off or fully configured
  crossOriginEmbedderPolicy: false
}));

// CORS — locked to allowed origins in prod. Open during dev for live-server.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://ai.meetwavedigital.in").split(",");
app.use(cors({
  origin: isProd ? ALLOWED_ORIGINS : true,
  credentials: false
}));

app.use(morgan(isProd ? "combined" : "dev"));

// Razorpay webhook MUST receive raw body for signature verification — mount BEFORE express.json().
const paymentRouter = require("./routes/payment");
app.post("/api/payment/webhook", express.raw({ type: "application/json" }), paymentRouter.webhookHandler);

app.use(express.json({ limit: "1mb" }));

const generatedDir = path.join(__dirname, "..", "uploads", "generated");
if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

app.use("/generated", express.static(generatedDir, { maxAge: "1d", immutable: true }));

// Serve client SPA same-origin in production.
const clientDir = path.join(__dirname, "..", "client");
app.use(express.static(clientDir));

app.use("/api/generate", require("./routes/generate"));
app.use("/api/payment", paymentRouter);
app.use("/api/verify", require("./routes/verify"));

app.get("/health", (_req, res) => res.json({ ok: true }));

// SPA fallback (only for non-API routes)
app.get(/^\/(?!api|generated).*/, (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

// Background cleanup: delete generated/* folders older than 7 days. Runs hourly.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
function cleanupGenerated() {
  try {
    for (const dir of fs.readdirSync(generatedDir)) {
      const full = path.join(generatedDir, dir);
      const stat = fs.statSync(full);
      if (stat.isDirectory() && Date.now() - stat.mtimeMs > SEVEN_DAYS_MS) {
        fs.rmSync(full, { recursive: true, force: true });
        console.log(`🧹 Cleaned ${dir}`);
      }
    }
  } catch (err) {
    console.error("Cleanup error:", err.message);
  }
}
setInterval(cleanupGenerated, 60 * 60 * 1000);

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");

    // Mark in-flight jobs from a previous run as failed so the UI gets a clean signal.
    const Job = require("./models/Job");
    const result = await Job.updateMany(
      { status: { $in: ["queued", "running"] } },
      { status: "failed", stage: "failed", error: "Server restarted before completion", finishedAt: new Date() }
    );
    if (result.modifiedCount) console.log(`🔄 Marked ${result.modifiedCount} stale job(s) as failed`);

    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log(`Server running on ${port} (${isProd ? "production" : "development"})`));
  })
  .catch(err => console.error(err));
