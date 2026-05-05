const Session = require("../models/Session");

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

module.exports = async function (req, res, next) {
  if (process.env.NODE_ENV !== "production") {
    req.sessionData = { lastGeneratedAt: null, save: async () => {} };
    return next();
  }

  try {
    const ip = req.ip;
    const fingerprint = req.headers["x-fingerprint"] || "unknown-device";

    let session = await Session.findOne({ ip, fingerprint });
    if (!session) {
      session = await Session.create({ ip, fingerprint });
    }

    if (session.lastGeneratedAt && Date.now() - session.lastGeneratedAt.getTime() < TWENTY_FOUR_HOURS) {
      const retryAfterMs = TWENTY_FOUR_HOURS - (Date.now() - session.lastGeneratedAt.getTime());
      const retryAfterHrs = Math.ceil(retryAfterMs / (60 * 60 * 1000));
      return res.status(429).json({
        error: `You can generate once per 24 hours. Try again in ${retryAfterHrs} hour${retryAfterHrs !== 1 ? "s" : ""}.`
      });
    }

    session.lastGeneratedAt = new Date();
    await session.save();

    req.sessionData = session;
    next();
  } catch (err) {
    console.error("Rate limiter error:", err.message);
    return res.status(500).json({ error: "Internal server error during rate limit check." });
  }
};
