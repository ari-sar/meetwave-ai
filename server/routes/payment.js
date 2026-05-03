const express = require('express');
const router = express.Router();

router.post('/create-intent', async (req, res) => {
    try {
        // Mock Stripe Payment Intent
        res.status(200).json({
            clientSecret: 'pi_mock_secret_12345',
            amount: 2900,
            currency: 'usd'
        });
    } catch (error) {
        res.status(500).json({ message: 'Payment intent creation failed' });
    }
});

module.exports = router;
