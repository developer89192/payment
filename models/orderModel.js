// models/Order.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  cart: [
    {
      productId: String,
      name: String,
      price: Number,
      quantity: Number,
    }
  ],
    user_id: { type: String },
  customer: {
    id: String, 
    name: String,
    email: String,
    phone: String,
  },
  totalAmount: Number,
  paymentSessionId: String,
  paymentStatus: { type: String, default: 'pending' },      // NEW
  paymentMode: { type: String, default: null },             // NEW
  orderStatus: { type: String, default: null },             // NEW
  deliveryStatus: { type: String, default: null },          // NEW
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
