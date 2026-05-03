const Session = require("../models/Session");

module.exports = async function (req, res, next) {
  // 1. Check if we are in development mode (or if NODE_ENV is just missing)
  if (process.env.NODE_ENV !== "production") {
    console.log("🛠️ [Dev Mode] Rate limiting bypassed. Unlimited generations allowed.");
    
    // We mock the sessionData object so your route can still safely call 
    // req.sessionData.freeCount += 1 and req.sessionData.save() without crashing.
    req.sessionData = {
      freeCount: 0,
      save: async () => { /* Mock save function does nothing in dev mode */ }
    };
    
    return next();
  }

  // 2. Production rate limiting logic
  try {
    const ip = req.ip;
    const fingerprint = req.headers["x-fingerprint"] || "unknown-device";

    let session = await Session.findOne({ ip, fingerprint });

    if (!session) {
      session = await Session.create({ ip, fingerprint });
    }

    if (session.freeCount >= 2) {
      console.log(`🚫 [Rate Limit] Blocked request from IP: ${ip}`);
      return res.status(429).json({ message: "Free limit reached. Please unlock the premium version." });
    }

    // Attach the real database session object to the request
    req.sessionData = session;
    next();
    
  } catch (error) {
    console.error("Rate Limiter Error:", error.message);
    // If the database fails, fail open or closed based on your preference. 
    // Failing closed here to prevent abuse if DB goes down.
    return res.status(500).json({ error: "Internal server error during rate limit check." });
  }
};