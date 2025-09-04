const crypto = require('crypto');

const createRazorpayPayload = (orderId, totalAmount) => ({
  amount: Math.round(totalAmount * 100),
  currency: 'INR',
  receipt: orderId,
  payment_capture: 1,
  notes: {},
});

const getRazorpayHeaders = () => ({
  'Content-Type': 'application/json'
});

const verifyRazorpaySignature = (order_id, payment_id, signature) => {
  const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
  hmac.update(order_id + '|' + payment_id);
  return hmac.digest('hex') === signature;
};

module.exports = { createRazorpayPayload, getRazorpayHeaders, verifyRazorpaySignature };