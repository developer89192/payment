const express = require('express');
const { createOrder, verifyPayment, createOrderCOD } = require('../controllers/orderController');
const getUserModel = require('../models/userOrderModel');

const router = express.Router();

// Razorpay routes
router.post('/create-order', createOrder);
router.post('/verify-payment', verifyPayment);
router.post('/create-cod-order', createOrderCOD);

// Existing debug/test routes
router.get('/test', (req, res) => res.send('✅ GET /test route works!'));
router.get('/debug-user/:userId', async (req, res) => {
  try {
    const User = await getUserModel();
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      userId: user._id,
      ordersCount: user.orders ? user.orders.length : 0,
      orders: user.orders || [],
      schema: User.schema.paths.orders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;