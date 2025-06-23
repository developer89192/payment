const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  cart: [{
    productId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
  }],
  user_id: { type: String, required: true },
  customer: {
    id: String,
    name: String,
    email: String,
    phone: String,
    pincode: String,
  },
  // ✅ Change address from String to Object
  address: {
    lat: { type: Number },
    lon: { type: Number },
    address: { type: String },
    apartment: { type: String },
    street: { type: String },
    name: { type: String },
    pincode: { type: String },
    type: { type: String },
    receiver_name: { type: String },
    receiver_mobile: { type: String }
  },
  totalAmount: { type: Number, required: true },
  paymentSessionId: { type: String },
  paymentStatus: { type: String, required: true },
  paymentMode: { type: String },
  paymentMethod: { type: String },
  orderStatus: { type: String },
  deliveryStatus: { type: String },
}, { timestamps: true });

module.exports = mongoose.models.OrderV2 || mongoose.model('OrderV2', orderSchema);
