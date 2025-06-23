// models/userOrderModel.js
const mongoose = require('mongoose');
const connectUsersDb = require('../utils/usersDbConnection');

// Define the order subdocument schema explicitly
const orderSubSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  orderStatus: { type: String },
  paymentStatus: { type: String },
  paymentMethod: { type: String },
  deliveryStatus: { type: String },
  returnStatus: { type: String },
  items: [{
    itemId: { type: String },
    itemName: { type: String },
    quantity: { type: Number },
    price: { type: Number },
  }],
  totalPrice: { type: Number },
  orderDate: { type: Date },
  address: {
    name: { type: String },
    apartment: { type: String },
    street: { type: String },
    type: { type: String },
    lat: { type: Number },
    lon: { type: Number },
    pincode: { type: String },
    address: { type: String },
  }
}, { _id: true }); // Allow _id for subdocuments

const userSchema = new mongoose.Schema({
  mobile_number: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  primary_address: {
    name: String,
    apartment: String,
    street: String,
    instructions: String,
    type: String,
    lat: Number,
    lon: Number,
    address: String,
  },
  saved_address: [{
    name: String,
    apartment: String,
    street: String,
    instructions: String,
    type: String,
    lat: Number,
    lon: Number,
    address: String,
    pincode: String,
    receiver_name: String,
    receiver_mobile: String,
  }],
  selected_recent_address: {
    address: String,
    apartment: { type: String, default: '' },
    street: { type: String, default: '' },
    name: { type: String, default: '' },
    lat: Number,
    lon: Number,
    type: String,
    pincode: String,
    receiver_name: String,
    receiver_mobile: String,
    _id: false,
  },
  multiple_recent_addresses: [{
    address: String,
    lat: Number,
    lon: Number,
    pincode: String,
  }],
  orders: [orderSubSchema], // Use the explicit subdocument schema
  updated_at: [Date],
  login_dates: [Date],
  account_created_at: { type: Date, default: Date.now },
  is_verified: { type: Boolean, default: false },
  refresh_token: String,
});

// Export model from the correct connection
let User;
const getUserModel = async () => {
  if (User) return User;
  const usersDb = await connectUsersDb();
  User = usersDb.model('User', userSchema);
  return User;
};

module.exports = getUserModel;
