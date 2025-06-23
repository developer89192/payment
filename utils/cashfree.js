// utils/cashfreeUtils.js

// Create the payload for Cashfree API
const createCashfreePayload = (orderId, customer, totalAmount, cart, user_id) => {
  return {
    order_id: orderId,
    order_currency: 'INR',
    order_amount: totalAmount.toFixed(2),
    user_id: user_id,
    customer_details: {
      customer_id: customer.id,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
    },
    order_meta: {
      return_url: `http://192.168.101.3:3001/payment-status?order_id=${orderId}`,
      payment_methods: 'upi',
      // notify_url: 'https://8d8d-103-186-254-125.ngrok-free.app/api/orders/webhook/cashfree',
    },
  };
};

// Create headers for Cashfree API
const getCashfreeHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'x-api-version': '2025-01-01',
    'x-client-id': process.env.CASHFREE_APP_ID,
    'x-client-secret': process.env.CASHFREE_SECRET_KEY,
  };
};

module.exports = { createCashfreePayload, getCashfreeHeaders };
