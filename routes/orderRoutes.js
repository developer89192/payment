const express = require('express');
const { createOrder, getPaymentStatus, cashfreeWebhook,  createOrderCOD  } = require('../controllers/orderController');

const router = express.Router();

// ✅ Existing routes
router.post('/create-order', createOrder);
router.get('/payment-status', getPaymentStatus);
router.post('/webhook/cashfree', cashfreeWebhook);
// Update route to match frontend:
router.post('/create-cod-order', createOrderCOD);


// ✅ NEW TEST ROUTE (for debug)
router.get('/test', (req, res) => {
  res.send('✅ GET /test route works!');
});

module.exports = router;
