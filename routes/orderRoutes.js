const express = require('express');
const { createOrder, getPaymentStatus, cashfreeWebhook, createOrderCOD } = require('../controllers/orderController');
const getUserModel = require('../models/userOrderModel');

const router = express.Router();

// ✅ Existing routes
router.post('/create-order', createOrder);
router.get('/payment-status', getPaymentStatus);
router.post('/webhook/cashfree', cashfreeWebhook);
router.post('/create-cod-order', createOrderCOD);

// ✅ NEW TEST ROUTE (for debug)
router.get('/test', (req, res) => {
  res.send('✅ GET /test route works!');
});

// ✅ DEBUG ROUTE - Check user structure
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
