// controllers/orderController.js
const axios = require('axios');
const { createCashfreePayload, getCashfreeHeaders } = require('../utils/cashfree');
const { addOrderToUser } = require('./userOrderController'); // ✅ correct

// ======================= CREATE ORDER =======================
const Order = require('../models/orderModel'); // adjust the path based on your project structure

const createOrder = async (req, res) => {
  try {
    const { cart, customer, user_id, address } = req.body;

    if (!Array.isArray(cart) || cart.length === 0 || !customer || !customer.pincode) {
      return res.status(400).json({ error: 'Missing cart, customer, or customer pincode in request.' });
    }

    const pincode = customer.pincode;
    const productIds = cart.map(item => item.productId);
    let productsData = [];

    // ✅ Fetch products using same API as COD
    try {
      const productRes = await axios.post(
        'https://product.rythuri.in/api/products/by-ids',
        { productIds, pincode },
        { headers: { 'Content-Type': 'application/json' } }
      );
      productsData = productRes.data;
    } catch (fetchErr) {
      console.error(`❌ Error fetching products for pincode ${pincode}:`, fetchErr.response?.data || fetchErr.message);
      return res.status(500).json({ error: 'Failed to fetch product data.' });
    }

    if (!Array.isArray(productsData) || productsData.length === 0) {
      return res.status(404).json({ error: 'No products found for the items in your cart at the specified pincode.' });
    }

    const validatedCart = cart.map(item => {
      const matchedProduct = productsData.find(p => p._id === item.productId);
      if (!matchedProduct) {
        throw new Error(`Product not available for pincode ${pincode} or invalid: ${item.productId}`);
      }

      const productPrice = parseFloat(matchedProduct.discounted_price);
      if (isNaN(productPrice) || productPrice < 0) {
        throw new Error(`Invalid price for product ${item.productId}`);
      }

      if (item.quantity <= 0 || isNaN(item.quantity)) {
        throw new Error(`Invalid quantity for product ${item.productId}`);
      }

      return {
        productId: matchedProduct._id,
        name: matchedProduct.name,
        price: productPrice,
        quantity: item.quantity,
        subtotal: productPrice * item.quantity,
      };
    });

    const totalAmount = validatedCart.reduce((sum, item) => sum + item.subtotal, 0);

    if (totalAmount < 10) {
      return res.status(400).json({ error: 'Minimum order amount is ₹10.' });
    }

    const orderId = 'ORDER_' + Date.now();

    const payload = createCashfreePayload(orderId, customer, totalAmount, validatedCart, user_id);

    const cfRes = await axios.post('https://sandbox.cashfree.com/pg/orders', payload, {
      headers: getCashfreeHeaders(),
    });

    const newOrder = new Order({
      orderId,
      cart: validatedCart.map(item => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      user_id,
      customer,
      address,
      totalAmount,
      paymentSessionId: cfRes.data.payment_session_id,
      paymentStatus: 'pending',
      paymentMode: null,
      paymentMethod: 'online',
      orderStatus: 'created',
      deliveryStatus: 'pending',
    });

    await newOrder.save();
    console.log(`✅ Online order ${orderId} saved to admin DB.`);

    // ❌ Do not save to users DB here — will be done in webhook after payment is successful

    return res.json({
      payment_session_id: cfRes.data.payment_session_id,
      order_id: orderId,
    });
  } catch (err) {
    console.error('❌ Create Online Order Error:', err.response?.data || err.message);
    return res.status(500).json({
      error: 'Failed to create order',
      details: err.response?.data || err.message,
    });
  }
};



// ======================= CHECK PAYMENT STATUS =======================
const getPaymentStatus = async (req, res) => {
  const { order_id } = req.query;
  if (!order_id) return res.status(400).json({ error: 'Missing order_id' });

  try {
    const statusRes = await axios.get(`https://sandbox.cashfree.com/pg/orders/${order_id}`, {
      headers: getCashfreeHeaders(),
    });

    const status = statusRes.data.order_status;
    return res.json({ status: status.toUpperCase() });
  } catch (err) {
    console.error('❌ Status Check Error:', err.message);
    return res.status(500).json({ error: 'Failed to get payment status' });
  }
};

// ======================= WEBHOOK (Updated to use direct DB approach) =======================
const cashfreeWebhook = async (req, res) => {
  try {
    const { type, data } = req.body;
    const orderId = data?.order?.order_id;
    const paymentStatusRaw = data?.payment?.payment_status;
    const paymentMethodGroup = data?.payment?.payment_group;
    
    let paymentMethodDetails = '';
    if (paymentMethodGroup === 'upi' && data?.payment?.payment_method?.upi?.upi_id) {
      paymentMethodDetails = `UPI: ${data.payment.payment_method.upi.upi_id}`;
    } else if (paymentMethodGroup === 'card' && data?.payment?.payment_method?.card?.card_number) {
      paymentMethodDetails = `Card: ${data.payment.payment_method.card.card_number}`;
    } else {
      paymentMethodDetails = paymentMethodGroup || 'unknown';
    }
        
    console.log(`📦 Webhook received: ${type} for order ${orderId}, status: ${paymentStatusRaw}`);
    console.log('🔔 Webhook payload:', JSON.stringify(req.body, null, 2));

    if (!orderId || !paymentStatusRaw) {
      return res.status(400).json({ error: 'Missing required data in webhook payload' });
    }

    // 1. Translate Cashfree status
    let paymentStatus = 'pending';
    let orderStatus = null;
    let deliveryStatus = null;
    
    if (paymentStatusRaw === 'SUCCESS') {
      paymentStatus = 'paid';
      orderStatus = 'Active';
      deliveryStatus = 'pending';
    } else if (paymentStatusRaw === 'FAILED') {
      paymentStatus = 'failed';
      orderStatus = 'cancelled';
      deliveryStatus = null;
    }

    // 2. Update order in MongoDB
    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      {
        paymentStatus,
        paymentMode: paymentMethodGroup || null,
        orderStatus,
        deliveryStatus,
      },
      { new: true }
    );

    if (!updatedOrder) {
      console.warn(`⚠️ No order found for orderId: ${orderId}`);
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log(`✅ Order ${orderId} updated successfully in MongoDB`);

    // 3. ✅ Save to users DB directly (same logic as createOrderCOD)
    const userId = updatedOrder.user_id?.toString();
    if (userId && paymentStatusRaw === 'SUCCESS') {
      const userOrderData = {
        orderId: updatedOrder.orderId,
        orderStatus: updatedOrder.orderStatus,
        paymentStatus: updatedOrder.paymentStatus,
        paymentMethod: paymentMethodDetails, // Use the formatted payment method
        deliveryStatus: updatedOrder.deliveryStatus,
        returnStatus: 'none',
        items: updatedOrder.cart.map(item => ({
          itemId: item.productId,
          itemName: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        totalPrice: updatedOrder.totalAmount,
        orderDate: updatedOrder.createdAt,
        address: {
          name: updatedOrder.address?.name || '',
          apartment: updatedOrder.address?.apartment || '',
          street: updatedOrder.address?.street || '',
          type: updatedOrder.address?.type || '',
          lat: updatedOrder.address?.lat,
          lon: updatedOrder.address?.lon,
          pincode: updatedOrder.address?.pincode || '',
          address: updatedOrder.address?.address || '',
        }
      };

      try {
        await addOrderToUser(userId, userOrderData);
        console.log(`✅ Order ${orderId} also added to user ${userId} directly via addOrderToUser`);
      } catch (syncErr) {
        console.error(`❌ Failed to sync order to user DB:`, syncErr.message);
        // Don't fail the webhook response even if user sync fails
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err);
    return res.sendStatus(500);
  }
};

const createOrderCOD = async (req, res) => {
  try {
    const { cart, customer, user_id, address } = req.body;

    if (!Array.isArray(cart) || cart.length === 0 || !customer || !customer.pincode) {
      return res.status(400).json({ error: 'Missing cart, customer, or customer pincode in request.' });
    }

    const pincode = customer.pincode;
    const productIds = cart.map(item => item.productId);
    let productsData = [];

    try {
      const productRes = await axios.post(
        'https://product.rythuri.in/api/products/by-ids',
        { productIds, pincode },
        { headers: { 'Content-Type': 'application/json' } }
      );
      productsData = productRes.data;
    } catch (fetchErr) {
      console.error(`❌ Error fetching products for pincode ${pincode}:`, fetchErr.response?.data || fetchErr.message);
      return res.status(500).json({ error: 'Failed to fetch product data.' });
    }

    if (!Array.isArray(productsData) || productsData.length === 0) {
      return res.status(404).json({ error: 'No products found for the items in your cart at the specified pincode.' });
    }

    const validatedCart = cart.map(item => {
      const matchedProduct = productsData.find(p => p._id === item.productId);
      if (!matchedProduct) {
        throw new Error(`Product not available for pincode ${pincode} or invalid: ${item.productId}`);
      }

      const productPrice = parseFloat(matchedProduct.discounted_price);
      if (isNaN(productPrice) || productPrice < 0) {
        throw new Error(`Invalid price for product ${item.productId}`);
      }

      let quantity = parseFloat(item.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        throw new Error(`Invalid quantity for product ${item.productId}`);
      }

      if (matchedProduct.quantity_format === 'weight') {
        quantity = quantity / 1000; // Convert grams to kg
      }

      return {
        productId: matchedProduct._id,
        name: matchedProduct.name,
        price: productPrice,
        quantity,
        subtotal: productPrice * quantity,
      };
    });

    const totalAmount = validatedCart.reduce((sum, item) => sum + item.subtotal, 0);

    if (totalAmount < 10) {
      return res.status(400).json({ error: 'Minimum order amount for COD is ₹10.' });
    }

    const orderId = 'COD_' + Date.now();

    const newOrder = new Order({
      orderId,
      cart: validatedCart.map(item => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      user_id,
      customer,
      address,
      totalAmount,
      paymentSessionId: null,
      paymentStatus: 'not paid',
      paymentMode: 'COD',
      paymentMethod: 'cod',
      orderStatus: 'Active',
      deliveryStatus: 'pending',
    });

    await newOrder.save();
    console.log(`✅ COD Order ${newOrder.orderId} saved to admin DB.`);

    if (user_id) {
      const userOrderData = {
        orderId: newOrder.orderId,
        orderStatus: newOrder.orderStatus,
        paymentStatus: newOrder.paymentStatus,
        paymentMethod: newOrder.paymentMethod,
        deliveryStatus: newOrder.deliveryStatus,
        returnStatus: 'none',
        items: newOrder.cart.map(item => ({
          itemId: item.productId,
          itemName: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        totalPrice: newOrder.totalAmount,
        orderDate: newOrder.createdAt,
        address: {
          name: newOrder.address?.name || '',
          apartment: newOrder.address?.apartment || '',
          street: newOrder.address?.street || '',
          type: newOrder.address?.type || '',
          lat: newOrder.address?.lat,
          lon: newOrder.address?.lon,
          pincode: newOrder.address?.pincode || '',
          address: newOrder.address?.address || '',
        }
      };

      await addOrderToUser(user_id, userOrderData);
    }

    return res.json({
      message: 'COD order placed successfully',
      order_id: orderId,
      total_amount: totalAmount
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
  getPaymentStatus,
  cashfreeWebhook,
  createOrderCOD // 👈 Export the new handler
};
