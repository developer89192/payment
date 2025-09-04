const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
    itemId: { type: String },
    itemName: { type: String },
    imageUrl: { type: String },
    quantity: { type: Number },
    price: { type: Number },
    quantity_type: { type: String },
    quantity_label: { type: String },
}, { _id: false });

const addressSchema = new mongoose.Schema({
    name: { type: String },
    apartment: { type: String },
    street: { type: String },
    type: { type: String },
    lat: { type: Number },
    lon: { type: Number },
    pincode: { type: String },
    address: { type: String },
}, { _id: false });

const selectedDeliverySlotSchema = new mongoose.Schema({
    time: { type: String },
    meridiem: { type: String },
}, { _id: false });

const chargesSchema = new mongoose.Schema({
    delivery: { type: Number, default: 0 },
    handling: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    platform: { type: Number, default: 0 },
    tip: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
}, { _id: false });

const customerDetailsSchema = new mongoose.Schema({
    name: { type: String, required: true },
    number: { type: String, required: true },
}, { _id: false });

const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },

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
    
    selectedDeliverySlot: selectedDeliverySlotSchema,

    returnStatus: {
        type: String,
        enum: ['none', 'return_requested', 'returned'],
        default: 'none',
    },

    items: {
        type: [itemSchema],
        required: true,
    },

    totalPrice: {
        type: Number,
        required: true,
    },

    charges: {
        type: chargesSchema,
        default: () => ({}),
    },

    finalAmount: {
        type: Number,
        required: true,
    },

    orderDate: {
        type: Date,
        default: Date.now,
    },
    
    expectedDeliveryDate: {
        type: Date,
        required: false,
    },

    address: {
        type: addressSchema,
        required: true,
    },

    customer: {
        type: customerDetailsSchema,
        required: true,
    },

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    updatedAt: {
        type: Date,
        default: Date.now,
    }
});

orderSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    
    // Correctly calculate the expected delivery date based on order time and delivery slot.
    const orderDate = this.orderDate || new Date();
    const orderHour = orderDate.getHours();
    
    // Get the start hour of the selected delivery slot in 24-hour format
    const timeParts = this.selectedDeliverySlot.time.split('-');
    const slotHour = parseInt(timeParts[0], 10);
    const meridiem = this.selectedDeliverySlot.meridiem.toLowerCase();
    
    let deliveryStartHour = slotHour;
    if (meridiem === 'pm' && slotHour !== 12) {
        deliveryStartHour += 12;
    } else if (meridiem === 'am' && slotHour === 12) {
        deliveryStartHour = 0; // Midnight hour
    }

    let expectedDate = new Date(orderDate);
    
    // If the order is placed at or after the start hour of the delivery slot, it's for the next day.
    if (orderHour >= deliveryStartHour) {
        expectedDate.setDate(expectedDate.getDate() + 1);
    }
    
    this.expectedDeliveryDate = expectedDate;

    next();
});

module.exports = mongoose.model('AdminOrder', orderSchema);