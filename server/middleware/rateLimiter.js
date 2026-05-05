const Device = require('../models/Device');

async function rateLimiter(req, res, next) {
  const fingerprint = req.body.fingerprint || req.headers['x-fingerprint'];
  const ip = req.ip;

  if (!fingerprint) {
    return res.status(400).json({ error: "Device fingerprint required." });
  }

  try {
    // Look up their permanent device record
    const device = await Device.findOne({ fingerprint, ip });

    // RULE: If they are permanently locked, block them and return the job they owe you for.
    if (device && device.isLocked) {
      return res.status(403).json({ 
        error: "Payment required. You have an unpaid portrait pending.",
        locked: true,
        lastJobId: device.unpaidJobId // The frontend uses this to show the blurred image
      });
    }

    next();
  } catch (error) {
    console.error("Rate Limiter Error:", error);
    return res.status(500).json({ error: "Server error during verification." });
  }
}

module.exports = rateLimiter;