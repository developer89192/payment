const axios = require('axios');
const { createRazorpayPayload, getRazorpayHeaders, verifyRazorpaySignature } = require('../utils/razorpayUtils');
const { addOrderToUser } = require('./userOrderController');
const AdminOrder = require('../models/orderModel');
const { deliveryCharge, handlingCharge, gstRate, platformCharge } = require('../config/charges.json');

const calculateOrderTotals = (subtotalInPaise) => {
    const delivery = deliveryCharge;
    const handling = handlingCharge;
    const gst = subtotalInPaise * gstRate;
    const platform = platformCharge;
    const tip = 0;
    const discount = 0;

    const charges = {
        delivery,
        handling,
        gst: parseFloat(gst.toFixed(2)),
        platform,
        tip,
        discount,
    };
    
    const finalAmount = subtotalInPaise + charges.delivery + charges.handling + charges.gst + charges.platform + charges.tip - charges.discount;
    console.log(`Subtotal: ₹${subtotalInPaise / 100}, Final Amount (after charges): ₹${finalAmount / 100}`);
    return {
        charges,
        finalAmount: parseFloat(finalAmount.toFixed(2)),
    };
};

// ================== CREATE ONLINE ORDER ==================
const createOrder = async (req, res) => {
    try {
        const { cart, customer, user_id, address, deliveryMethod = 'standard', deliveryTime } = req.body;
        console.log('Received online order details:', req.body);

        if (!Array.isArray(cart) || cart.length === 0 || !customer || !customer.pincode || !address || !deliveryTime) {
            return res.status(400).json({ error: 'Missing cart, customer, address, or deliveryTime in request.' });
        }

        const pincode = customer.pincode;
        const productIds = cart.map(item => item.productId);
        console.log(`Fetching products for pincode ${pincode} with productIds:`, productIds);
        let productsData = [];

        try {
            const productRes = await axios.post(
                'http://192.168.101.2:5000/api/products/by-ids',
                { productIds, pincode },
                { headers: { 'Content-Type': 'application/json' } }
            );
            productsData = productRes.data;
            console.log('Products fetched:', productsData);
        } catch (fetchErr) {
            console.error(`❌ Error fetching products for pincode ${pincode}:`, fetchErr.response?.data || fetchErr.message);
            return res.status(500).json({ error: 'Failed to fetch product data.' });
        }

        if (!Array.isArray(productsData) || productsData.length === 0) {
            return res.status(404).json({ error: 'No products found for the items in your cart at the specified pincode.' });
        }

        let totalPriceInPaise = 0;
        const validatedItems = [];

        for (const item of cart) {
            const matchedProduct = productsData.find(p => p._id === item.productId);
            if (!matchedProduct) {
                throw new Error(`Product not available for pincode ${pincode} or invalid: ${item.productId}`);
            }

            const productPricePerUnit = parseFloat(matchedProduct.discounted_price); 
            if (isNaN(productPricePerUnit) || productPricePerUnit < 0) {
                throw new Error(`Invalid price for product ${item.productId}`);
            }

            const quantity = parseFloat(item.quantity);
            if (isNaN(quantity) || quantity <= 0) {
                throw new Error(`Invalid quantity for product ${item.productId}`);
            }
            
            let itemTotalPrice;
            if (matchedProduct.quantity_format.type === 'weight') {
                itemTotalPrice = (productPricePerUnit / 1000) * quantity;
            } else {
                itemTotalPrice = productPricePerUnit * quantity;
            }

            totalPriceInPaise += itemTotalPrice;

            const imageUrl = matchedProduct.images?.[0] || 'https://placehold.co/100x100/E0E0E0/000000?text=No+Image';

            const quantityType = matchedProduct.quantity_format.type;
            let quantityLabel;

            if (quantityType === 'weight') {
                const qtyFromProduct = parseInt(matchedProduct.quantity_format.qty, 10);
                if (qtyFromProduct && qtyFromProduct > 0) {
                    const lowerBound = quantity - qtyFromProduct;
                    quantityLabel = `${lowerBound}-${quantity}gm`;
                } else {
                    quantityLabel = `${quantity}gm`;
                }
            } else if (quantityType === 'unit') {
                const qtyFromProduct = parseInt(matchedProduct.quantity_format.qty, 10);
                if (qtyFromProduct && qtyFromProduct > 0) {
                    quantityLabel = `${qtyFromProduct} pieces x ${quantity}`;
                } else {
                    quantityLabel = `${quantity} piece`;
                }
            } else {
                quantityLabel = `${quantity} piece`;
            }
            
            validatedItems.push({
                itemId: matchedProduct._id,
                itemName: matchedProduct.name,
                imageUrl: imageUrl,
                price: parseFloat(itemTotalPrice.toFixed(2)), 
                quantity: item.quantity,
                quantity_type: quantityType,
                quantity_label: quantityLabel
            });
        }
        
        totalPriceInPaise = parseFloat(totalPriceInPaise.toFixed(2));
        console.log(`Calculated total price (subtotal): ₹${totalPriceInPaise / 100}`);

        if (totalPriceInPaise < 10) {
            return res.status(400).json({ error: 'Minimum order amount is ₹10.' });
        }

        const { charges, finalAmount } = calculateOrderTotals(totalPriceInPaise);
        const orderId = 'ORDER_' + Date.now();
        const currentOrderDate = new Date();
        
        console.log('Order ID:', orderId);

        const payload = createRazorpayPayload(orderId, finalAmount);
        console.log('Payload sent to Razorpay:', payload);

        const razorpayRes = await axios.post(
            'https://api.razorpay.com/v1/orders',
            payload,
            {
                auth: {
                    username: process.env.RAZORPAY_KEY_ID,
                    password: process.env.RAZORPAY_KEY_SECRET,
                },
                headers: getRazorpayHeaders(),
            }
        );
        console.log('Razorpay response:', razorpayRes.data);

        const newAdminOrder = new AdminOrder({
            orderId,
            items: validatedItems,
            userId: user_id,
            address: {
                name: address.customer_name,
                apartment: address.apartment,
                street: address.street,
                type: address.address_type,
                lat: address.lat,
                lon: address.lon,
                pincode: address.pincode,
                address: address.full_address,
            },
            totalPrice: totalPriceInPaise,
            charges,
            finalAmount,
            paymentStatus: 'not_paid',
            paymentMethod: 'online',
            orderStatus: 'placed',
            deliveryMethod: deliveryMethod,
            selectedDeliverySlot: deliveryTime,
            orderDate: currentOrderDate,
            returnStatus: 'none',
            razorpayOrderId: razorpayRes.data.id,
            customer: {
                name: address.customer_name || "test",
                number: customer.phone,
            },
        });

        await newAdminOrder.save();
        console.log(`✅ Online order ${orderId} saved to admin DB.`);

        return res.json({
            razorpay_order_id: razorpayRes.data.id,
            order_id: orderId,
            amount: (razorpayRes.data.amount / 100),
            currency: razorpayRes.data.currency,
            key_id: process.env.RAZORPAY_KEY_ID,
        });
    } catch (err) {
        console.error('❌ Create Online Order Error:', err.response?.data || err.message);
        return res.status(500).json({
            error: 'Failed to create order',
            details: err.response?.data || err.message,
        });
    }
};
// ================== PAYMENT VERIFICATION (Razorpay) ==================
const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;
        console.log('Payment verification details:', req.body);

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_id) {
            return res.status(400).json({ error: 'Missing payment verification data' });
        }

        const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
        console.log(`Payment signature valid: ${isValid}`);

        if (!isValid) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        const adminOrder = await AdminOrder.findOne({ orderId: order_id });
        if (!adminOrder) {
            return res.status(404).json({ error: 'Order not found' });
        }

        console.log(`Updating order status for Order ID: ${order_id}`);
        adminOrder.paymentStatus = 'paid';
        adminOrder.orderStatus = 'processing';
        adminOrder.updatedAt = new Date();
        await adminOrder.save();

        const userId = adminOrder.userId?.toString();
        if (userId) {
            await addOrderToUser(userId, adminOrder);
        }

        return res.json({ success: true, message: 'Payment verified and order updated.' });
    } catch (err) {
        console.error('❌ Payment Verification Error:', err.message);
        return res.status(500).json({ error: 'Payment verification failed' });
    }
};

// ======================= CREATE ORDER (COD) =======================
const createOrderCOD = async (req, res) => {
    try {
        const { cart, customer, user_id, address, deliveryMethod = 'standard', deliveryTime } = req.body;
        console.log('Received COD order details:', req.body);

        if (!Array.isArray(cart) || cart.length === 0 || !customer || !customer.pincode || !address || !deliveryTime) {
            return res.status(400).json({ error: 'Missing cart, customer, address, or deliveryTime in request.' });
        }

        const pincode = customer.pincode;
        const productIds = cart.map(item => item.productId);
        console.log(`Fetching products for pincode ${pincode} with productIds:`, productIds);
        let productsData = [];

        try {
            const productRes = await axios.post(
                'http://192.168.101.2:5000/api/products/by-ids',
                { productIds, pincode },
                { headers: { 'Content-Type': 'application/json' } }
            );
            productsData = productRes.data;
            console.log('Products fetched:', productsData);
        } catch (fetchErr) {
            console.error(`❌ Error fetching products for pincode ${pincode}:`, fetchErr.response?.data || fetchErr.message);
            return res.status(500).json({ error: 'Failed to fetch product data.' });
        }

        if (!Array.isArray(productsData) || productsData.length === 0) {
            return res.status(404).json({ error: 'No products found for the items in your cart at the specified pincode.' });
        }

        let totalPriceInPaise = 0;
        const validatedItems = [];

        for (const item of cart) {
            const matchedProduct = productsData.find(p => p._id === item.productId);
            if (!matchedProduct) {
                throw new Error(`Product not available for pincode ${pincode} or invalid: ${item.productId}`);
            }

            const productPricePerUnit = parseFloat(matchedProduct.discounted_price); 
            if (isNaN(productPricePerUnit) || productPricePerUnit < 0) {
                throw new Error(`Invalid price for product ${item.productId}`);
            }

            let quantity = parseFloat(item.quantity);
            if (isNaN(quantity) || quantity <= 0) {
                throw new Error(`Invalid quantity for product ${item.productId}`);
            }

            let itemTotalPrice;
            if (matchedProduct.quantity_format.type === 'weight') {
                itemTotalPrice = (productPricePerUnit / 1000) * quantity;
            } else {
                itemTotalPrice = productPricePerUnit * quantity;
            }
            
            totalPriceInPaise += itemTotalPrice;

            const imageUrl = matchedProduct.images?.[0] || 'https://placehold.co/100x100/E0E0E0/000000?text=No+Image';
            
            const quantityType = matchedProduct.quantity_format.type;
            let quantityLabel;

            if (quantityType === 'weight') {
                const qtyFromProduct = parseInt(matchedProduct.quantity_format.qty, 10);
                if (qtyFromProduct && qtyFromProduct > 0) {
                    const lowerBound = quantity - qtyFromProduct;
                    quantityLabel = `${lowerBound}-${quantity}gm`;
                } else {
                    quantityLabel = `${quantity}gm`;
                }
            } else if (quantityType === 'unit') {
                const qtyFromProduct = parseInt(matchedProduct.quantity_format.qty, 10);
                if (qtyFromProduct && qtyFromProduct > 0) {
                    quantityLabel = `${qtyFromProduct} pieces x ${quantity}`;
                } else {
                    quantityLabel = `${quantity} piece`;
                }
            } else {
                quantityLabel = `${quantity} piece`;
            }
            
            validatedItems.push({
                itemId: matchedProduct._id,
                itemName: matchedProduct.name,
                imageUrl: imageUrl,
                price: parseFloat(itemTotalPrice.toFixed(2)), 
                quantity: item.quantity,
                quantity_type: quantityType,
                quantity_label: quantityLabel
            });
        }

        totalPriceInPaise = parseFloat(totalPriceInPaise.toFixed(2));
        console.log(`Calculated total price (subtotal): ₹${totalPriceInPaise / 100}`);

        if (totalPriceInPaise < 10) {
            return res.status(400).json({ error: 'Minimum order amount for COD is ₹10.' });
        }

        const { charges, finalAmount } = calculateOrderTotals(totalPriceInPaise);
        const orderId = 'COD_' + Date.now();
        const currentOrderDate = new Date();
        console.log('Order ID:', orderId);

        const newAdminOrder = new AdminOrder({
            orderId,
            items: validatedItems,
            userId: user_id,
            address: {
                name: address.customer_name,
                apartment: address.apartment,
                street: address.street,
                type: address.address_type,
                lat: address.lat,
                lon: address.lon,
                pincode: address.pincode,
                address: address.full_address,
            },
            totalPrice: totalPriceInPaise,
            charges,
            finalAmount,
            paymentStatus: 'not_paid',
            paymentMethod: 'cod',
            orderStatus: 'placed',
            deliveryMethod: deliveryMethod,
            selectedDeliverySlot: deliveryTime,
            orderDate: currentOrderDate,
            returnStatus: 'none',
            customer: {
                name: address.customer_name,
                number: customer.phone,
            },
        });

        await newAdminOrder.save();
        console.log(`✅ COD Order ${newAdminOrder.orderId} saved to admin DB.`);

        if (user_id) {
            await addOrderToUser(user_id, newAdminOrder);
            console.log(`✅ COD Order ${newAdminOrder.orderId} also added to user ${user_id}`);
        }

        return res.json({
            message: 'COD order placed successfully',
            order_id: orderId,
            total_amount: finalAmount / 100
        });
    } catch (err) {
        console.error('❌ Create COD Order Error:', err.message);
        return res.status(500).json({
            error: 'Failed to create COD order.',
            details: err.message,
        });
    }
};

module.exports = {
    createOrder,
    verifyPayment,
    createOrderCOD
};