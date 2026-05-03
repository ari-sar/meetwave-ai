const express = require('express');
const router = express.Router();

router.get('/:token', async (req, res) => {
    const { token } = req.params;

    try {
        // Mock Verification Logic
        res.status(200).json({
            verified: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(401).json({ message: 'Invalid verification token' });
    }
});

module.exports = router;
