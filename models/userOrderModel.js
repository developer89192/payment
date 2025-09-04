const mongoose = require('mongoose');
const connectUsersDb = require('../utils/usersDbConnection');

// Define the order subdocument schema explicitly.
const orderSubSchema = new mongoose.Schema({
    orderId: { type: String, required: true },
    orderStatus: {
        type: String,
        enum: ['placed', 'processing', 'out_for_delivery', 'delivered', 'cancelled'],
        default: 'placed',
    },
    paymentStatus: {
        type: String,
        enum: ['paid', 'not_paid', 'refunded'],
        default: 'not_paid',
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'online'],
        required: true,
    },
    deliveryMethod: {
        type: String,
        enum: ['standard', 'express', 'pickup'],
        default: 'standard',
    },
    returnStatus: {
        type: String,
        enum: ['none', 'return_requested', 'returned'],
        default: 'none',
    },
    items: [{
        itemId: { type: String },
        itemName: { type: String },
        imageUrl: { type: String },
        quantity: { type: Number },
        price: { type: Number },
        quantity_type: { type: String },
        quantity_tabel: { type: String },
    }],
    totalPrice: { type: Number, required: true },
    charges: {
        type: Object,
        default: {
            delivery: 0,
            handling: 0,
            gst: 0,
            platform: 0,
            tip: 0,
            discount: 0,
        },
    },
    finalAmount: { type: Number, required: true },
    deliveryDetails: {
        orderDate: { type: Date, default: Date.now },
        expectedDeliveryDate: { type: Date },
        timing: {
            time: { type: String },
            meridiem: { type: String },
        }
    },
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
}, { _id: true });


// Define the main user schema.
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
    orders: [orderSubSchema],
    updated_at: [Date],
    login_dates: [Date],
    account_created_at: { type: Date, default: Date.now },
    is_verified: { type: Boolean, default: false },
    refresh_token: String,
});

// Use a singleton pattern to ensure the model is compiled only once.
let User;
const getUserModel = async () => {
    if (User) return User;
    const usersDb = await connectUsersDb();
    User = usersDb.model('User', userSchema);
    return User;
};

module.exports = getUserModel;